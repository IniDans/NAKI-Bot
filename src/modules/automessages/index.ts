import { type Client, DiscordAPIError, type Message, RESTJSONErrorCodes } from 'discord.js';
import { db } from '../../services/database/index.js';
import { appLogger } from '../../utils/logger.js';
import { fillTemplate, findResponder, nextRunAfter } from './logic.js';

const prisma = db.client;

/** Dashboard edits reach the bot within this long. */
const CACHE_TTL_MS = 60_000;
/** The same responder answers at most once per channel in this window. */
const RESPONDER_COOLDOWN_MS = 10_000;
/** A sticky is reposted once the channel has been quiet this long, not after every message. */
const STICKY_DELAY_MS = 5_000;
const SCHEDULE_POLL_MS = 30_000;
const MAX_LENGTH = 2000;

interface GuildRules {
  at: number;
  responders: { id: string; trigger: string; matchType: string; response: string; enabled: boolean }[];
  stickies: Map<string, { id: string; content: string; lastMessageId: string | null }>;
}

const cache = new Map<string, GuildRules>();
const cooldowns = new Map<string, number>();
const stickyTimers = new Map<string, NodeJS.Timeout>();
let pollTimer: NodeJS.Timeout | null = null;
let polling = false;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Errors meaning the channel is gone or closed to the bot, so retrying will not help. */
function isUnreachable(error: unknown): boolean {
  return (
    error instanceof DiscordAPIError &&
    [RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess, RESTJSONErrorCodes.MissingPermissions].includes(
      error.code as number,
    )
  );
}

async function rulesFor(guildId: string): Promise<GuildRules> {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  const [responders, stickies] = await Promise.all([
    prisma.autoResponder.findMany({ where: { guildId, enabled: true }, orderBy: { createdAt: 'asc' } }),
    prisma.stickyMessage.findMany({ where: { guildId } }),
  ]);
  const rules: GuildRules = {
    at: Date.now(),
    responders,
    stickies: new Map(stickies.map((s) => [s.channelId, { id: s.id, content: s.content, lastMessageId: s.lastMessageId }])),
  };
  cache.set(guildId, rules);
  return rules;
}

function truncate(text: string): string {
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}

async function respond(message: Message<true>, rules: GuildRules): Promise<void> {
  const rule = findResponder(rules.responders, message.content);
  if (!rule) return;
  const key = `${message.channelId}:${rule.id}`;
  const last = cooldowns.get(key) ?? 0;
  if (Date.now() - last < RESPONDER_COOLDOWN_MS) return;
  cooldowns.set(key, Date.now());
  if (cooldowns.size > 5000) {
    for (const [k, at] of cooldowns) if (Date.now() - at >= RESPONDER_COOLDOWN_MS) cooldowns.delete(k);
  }

  const text = fillTemplate(rule.response, {
    mention: `<@${message.author.id}>`,
    user: message.member?.displayName ?? message.author.username,
    server: message.guild.name,
    channel: `<#${message.channelId}>`,
  });
  // Only the member who triggered it can be pinged; @everyone and roles stay inert.
  await message.channel.send({ content: truncate(text), allowedMentions: { users: [message.author.id] } });
}

async function repostSticky(message: Message<true>, guildId: string, channelId: string): Promise<void> {
  const rules = await rulesFor(guildId);
  const sticky = rules.stickies.get(channelId);
  if (!sticky) return;
  if (sticky.lastMessageId) {
    await message.channel.messages.delete(sticky.lastMessageId).catch(() => undefined);
  }
  const sent = await message.channel.send({ content: truncate(sticky.content), allowedMentions: { parse: [] } });
  sticky.lastMessageId = sent.id;
  // updateMany: the sticky may have been removed from the dashboard meanwhile.
  await prisma.stickyMessage.updateMany({ where: { id: sticky.id }, data: { lastMessageId: sent.id } });
}

function scheduleSticky(message: Message<true>): void {
  const key = message.channelId;
  const existing = stickyTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    stickyTimers.delete(key);
    repostSticky(message, message.guildId, message.channelId).catch((error) => {
      appLogger.warn('Sticky repost failed', 'AutoMessages', {
        guildId: message.guildId,
        channelId: message.channelId,
        error: errorMessage(error),
      });
    });
  }, STICKY_DELAY_MS);
  timer.unref();
  stickyTimers.set(key, timer);
}

async function runDueMessages(client: Client): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    const now = new Date();
    const due = await prisma.scheduledMessage.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: 20,
    });
    for (const item of due) {
      if (!client.guilds.cache.has(item.guildId)) continue;
      const next = nextRunAfter(item.nextRunAt, item.intervalMinutes, now);
      // Claim the run first so a crash or a second instance cannot send it twice.
      const claimed = await prisma.scheduledMessage.updateMany({
        where: { id: item.id, enabled: true, nextRunAt: item.nextRunAt },
        data: next ? { nextRunAt: next } : { enabled: false },
      });
      if (claimed.count === 0) continue;

      try {
        const channel = await client.channels.fetch(item.channelId);
        if (!channel?.isTextBased() || channel.isDMBased()) throw new Error('Channel is missing or not text-based');
        // Written by server managers on the dashboard, so announcements may ping roles and @everyone.
        await channel.send({ content: truncate(item.content), allowedMentions: { parse: ['users', 'roles', 'everyone'] } });
        if (item.lastError) await prisma.scheduledMessage.update({ where: { id: item.id }, data: { lastError: null } });
      } catch (error) {
        const unreachable = isUnreachable(error) || (error instanceof Error && error.message.startsWith('Channel is missing'));
        await prisma.scheduledMessage
          .update({
            where: { id: item.id },
            data: { lastError: errorMessage(error).slice(0, 500), ...(unreachable ? { enabled: false } : {}) },
          })
          .catch(() => undefined);
        appLogger.warn('Scheduled message failed', 'AutoMessages', {
          guildId: item.guildId,
          id: item.id,
          error: errorMessage(error),
        });
      }
    }
  } catch (error) {
    appLogger.error('Scheduled message poll failed', 'AutoMessages', { error: errorMessage(error) });
  } finally {
    polling = false;
  }
}

export const autoMessagesModule = {
  async handleMessage(message: Message<true>): Promise<void> {
    const rules = await rulesFor(message.guildId);
    if (rules.responders.length > 0) await respond(message, rules);
    if (rules.stickies.has(message.channelId)) scheduleSticky(message);
  },

  /** Drop cached responders and stickies so the next message reads the dashboard's latest. */
  invalidate(guildId: string): void {
    cache.delete(guildId);
  },

  /** Send scheduled messages that are due now instead of waiting for the next poll. */
  runDueNow(client: Client): void {
    void runDueMessages(client);
  },

  startScheduler(client: Client): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => void runDueMessages(client), SCHEDULE_POLL_MS);
    pollTimer.unref();
    void runDueMessages(client);
  },

  stop(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    for (const timer of stickyTimers.values()) clearTimeout(timer);
    stickyTimers.clear();
  },
};
