import { type Client, DiscordAPIError, type Guild, RESTJSONErrorCodes } from 'discord.js';
import { db } from '../../services/database/index.js';
import { appLogger } from '../../utils/logger.js';
import { type StatCounts, renderStatName, usedKeys } from './logic.js';

const prisma = db.client;

/** Discord allows two renames per channel every 10 minutes, so names are refreshed at that pace. */
const UPDATE_MS = 10 * 60_000;
/** First update shortly after startup, once the guild caches are filled. */
const FIRST_UPDATE_MS = 30_000;
/** Full member lists (for humans/bots) are fetched at most this often per guild. */
const MEMBER_FETCH_MS = 30 * 60_000;

let timer: NodeJS.Timeout | null = null;
let firstTimer: NodeJS.Timeout | null = null;
let running = false;
const memberFetchedAt = new Map<string, number>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function countsFor(guild: Guild, templates: string[]): Promise<StatCounts> {
  const keys = new Set(templates.flatMap(usedKeys));
  const counts: StatCounts = {
    members: guild.memberCount,
    boosts: guild.premiumSubscriptionCount ?? 0,
    channels: guild.channels.cache.filter((c) => !c.isThread()).size,
    // The cache includes @everyone, which members do not think of as a role.
    roles: Math.max(0, guild.roles.cache.size - 1),
  };

  if (keys.has('humans') || keys.has('bots')) {
    const last = memberFetchedAt.get(guild.id) ?? 0;
    if (guild.members.cache.size < guild.memberCount && Date.now() - last > MEMBER_FETCH_MS) {
      memberFetchedAt.set(guild.id, Date.now());
      await guild.members.fetch().catch((error) => {
        appLogger.warn('Member fetch for stats failed', 'Stats', { guildId: guild.id, error: errorMessage(error) });
      });
    }
    // Only trust the split once the cache holds (nearly) everyone; otherwise show "…".
    if (guild.members.cache.size >= guild.memberCount * 0.98) {
      const bots = guild.members.cache.filter((m) => m.user.bot).size;
      counts.bots = bots;
      counts.humans = Math.max(0, guild.memberCount - bots);
    }
  }
  return counts;
}

async function updateAll(client: Client): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await prisma.statsChannel.findMany();
    const byGuild = new Map<string, typeof rows>();
    for (const row of rows) byGuild.set(row.guildId, [...(byGuild.get(row.guildId) ?? []), row]);

    for (const [guildId, stats] of byGuild) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      const counts = await countsFor(
        guild,
        stats.map((s) => s.template),
      );
      for (const stat of stats) {
        const channel = guild.channels.cache.get(stat.channelId);
        if (!channel) {
          // Someone deleted the channel in Discord; forget it instead of retrying forever.
          await prisma.statsChannel.deleteMany({ where: { id: stat.id } });
          appLogger.info('Stats channel was deleted, removed its config', 'Stats', {
            guildId,
            channelId: stat.channelId,
          });
          continue;
        }
        const name = renderStatName(stat.template, counts);
        if (!name || channel.name === name) continue;
        try {
          await channel.setName(name, 'Stats channel update');
        } catch (error) {
          const code = error instanceof DiscordAPIError ? error.code : null;
          appLogger.warn('Stats channel rename failed', 'Stats', {
            guildId,
            channelId: stat.channelId,
            error: code === RESTJSONErrorCodes.MissingPermissions ? 'Missing Manage Channels' : errorMessage(error),
          });
        }
      }
    }
  } catch (error) {
    appLogger.error('Stats update failed', 'Stats', { error: errorMessage(error) });
  } finally {
    running = false;
  }
}

export const statsModule = {
  start(client: Client): void {
    statsModule.stop();
    firstTimer = setTimeout(() => void updateAll(client), FIRST_UPDATE_MS);
    firstTimer.unref();
    timer = setInterval(() => void updateAll(client), UPDATE_MS);
    timer.unref();
  },

  stop(): void {
    if (firstTimer) clearTimeout(firstTimer);
    if (timer) clearInterval(timer);
    firstTimer = timer = null;
  },
};
