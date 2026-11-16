import type { Client, Guild, GuildTextBasedChannel } from 'discord.js';
import { db } from '../../services/database/index.js';
import { appLogger } from '../../utils/logger.js';
import { giveawayMessage, pickWinners, winnerAnnouncement } from './logic.js';

const prisma = db.client;

const POLL_MS = 15_000;
/** Entry counts on the message are refreshed at most this often, to stay clear of rate limits. */
const REFRESH_DELAY_MS = 10_000;

type GiveawayRow = NonNullable<Awaited<ReturnType<typeof prisma.giveaway.findUnique>>>;

let pollTimer: NodeJS.Timeout | null = null;
let polling = false;
let clientRef: Client | null = null;
const refreshTimers = new Map<string, NodeJS.Timeout>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function winnersOf(row: GiveawayRow): string[] {
  return Array.isArray(row.winners) ? row.winners.filter((v): v is string => typeof v === 'string') : [];
}

function textChannel(guild: Guild, channelId: string): GuildTextBasedChannel | null {
  const channel = guild.channels.cache.get(channelId);
  return channel?.isTextBased() ? channel : null;
}

async function renderMessage(row: GiveawayRow): Promise<void> {
  const guild = clientRef?.guilds.cache.get(row.guildId);
  const channel = guild && textChannel(guild, row.channelId);
  if (!channel || !row.messageId) return;
  const entries = await prisma.giveawayEntry.count({ where: { giveawayId: row.id } });
  const payload = giveawayMessage({ ...row, entries, winners: winnersOf(row) });
  await channel.messages.edit(row.messageId, payload).catch((error) => {
    appLogger.warn('Giveaway message edit failed', 'Giveaways', { giveawayId: row.id, error: errorMessage(error) });
  });
}

/** Draw winners who are still in the server, in random order, skipping anyone in `exclude`. */
async function drawWinners(guild: Guild, row: GiveawayRow, exclude: Set<string>): Promise<string[]> {
  const entries = await prisma.giveawayEntry.findMany({ where: { giveawayId: row.id }, select: { userId: true } });
  const shuffled = pickWinners(
    entries.map((e) => e.userId).filter((id) => !exclude.has(id)),
    entries.length,
  );
  const winners: string[] = [];
  for (const userId of shuffled) {
    if (winners.length >= row.winnerCount) break;
    const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
    if (member) winners.push(userId);
  }
  return winners;
}

async function finish(row: GiveawayRow): Promise<void> {
  // Claim first so a second process (or a manual end) cannot draw twice.
  const claimed = await prisma.giveaway.updateMany({ where: { id: row.id, ended: false }, data: { ended: true } });
  if (claimed.count === 0) return;
  const guild = clientRef?.guilds.cache.get(row.guildId);
  if (!guild) return;

  const winners = await drawWinners(guild, row, new Set());
  const updated = await prisma.giveaway.update({ where: { id: row.id }, data: { winners, endsAt: new Date() } });
  await renderMessage(updated);

  const channel = textChannel(guild, row.channelId);
  await channel
    ?.send({
      content: winnerAnnouncement(row.prize, winners),
      allowedMentions: { users: winners },
      reply: row.messageId ? { messageReference: row.messageId, failIfNotExists: false } : undefined,
    })
    .catch((error) => {
      appLogger.warn('Giveaway announcement failed', 'Giveaways', { giveawayId: row.id, error: errorMessage(error) });
    });
  appLogger.info('Giveaway ended', 'Giveaways', { guildId: row.guildId, giveawayId: row.id, winners: winners.length });
}

async function pollDue(): Promise<void> {
  if (polling || !clientRef) return;
  polling = true;
  try {
    const due = await prisma.giveaway.findMany({
      where: { ended: false, endsAt: { lte: new Date() } },
      orderBy: { endsAt: 'asc' },
      take: 20,
    });
    for (const row of due) {
      if (!clientRef.guilds.cache.has(row.guildId)) continue;
      await finish(row).catch((error) => {
        appLogger.error('Giveaway end failed', 'Giveaways', { giveawayId: row.id, error: errorMessage(error) });
      });
    }
  } catch (error) {
    appLogger.error('Giveaway poll failed', 'Giveaways', { error: errorMessage(error) });
  } finally {
    polling = false;
  }
}

export const giveawaysModule = {
  start(client: Client): void {
    giveawaysModule.stop();
    clientRef = client;
    void pollDue();
    pollTimer = setInterval(() => void pollDue(), POLL_MS);
    pollTimer.unref();
  },

  stop(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    for (const timer of refreshTimers.values()) clearTimeout(timer);
    refreshTimers.clear();
  },

  async create(input: {
    guildId: string;
    channel: GuildTextBasedChannel;
    prize: string;
    winnerCount: number;
    hostId: string;
    endsAt: Date;
  }) {
    const row = await prisma.giveaway.create({
      data: {
        guildId: input.guildId,
        channelId: input.channel.id,
        prize: input.prize,
        winnerCount: input.winnerCount,
        hostId: input.hostId,
        endsAt: input.endsAt,
      },
    });
    try {
      const message = await input.channel.send(giveawayMessage({ ...row, entries: 0, winners: [] }));
      return prisma.giveaway.update({ where: { id: row.id }, data: { messageId: message.id } });
    } catch (error) {
      await prisma.giveaway.delete({ where: { id: row.id } });
      throw error;
    }
  },

  /** End now instead of waiting for the timer. Returns false if it had already ended. */
  async endNow(row: GiveawayRow): Promise<boolean> {
    if (row.ended) return false;
    await finish(row);
    return true;
  },

  /** Draw new winners for an ended giveaway, leaving out the previous ones. */
  async reroll(row: GiveawayRow): Promise<string[]> {
    const guild = clientRef?.guilds.cache.get(row.guildId);
    if (!guild || !row.ended) return [];
    const winners = await drawWinners(guild, row, new Set(winnersOf(row)));
    if (winners.length === 0) return [];
    const updated = await prisma.giveaway.update({ where: { id: row.id }, data: { winners } });
    await renderMessage(updated);
    await textChannel(guild, row.channelId)
      ?.send({
        content: `New draw: ${winnerAnnouncement(row.prize, winners)}`,
        allowedMentions: { users: winners },
        reply: row.messageId ? { messageReference: row.messageId, failIfNotExists: false } : undefined,
      })
      .catch(() => undefined);
    return winners;
  },

  /** Update the entry count on the message soon, batching bursts of clicks into one edit. */
  scheduleRefresh(giveawayId: string): void {
    if (refreshTimers.has(giveawayId)) return;
    const timer = setTimeout(async () => {
      refreshTimers.delete(giveawayId);
      const row = await prisma.giveaway.findUnique({ where: { id: giveawayId } }).catch(() => null);
      if (row && !row.ended) await renderMessage(row);
    }, REFRESH_DELAY_MS);
    timer.unref();
    refreshTimers.set(giveawayId, timer);
  },
};
