import type { Client } from 'discord.js';
import { db } from '../../services/database/index.js';
import { appLogger } from '../../utils/logger.js';
import {
  DEFAULT_MESSAGES,
  type SocialPlatform,
  type SocialVars,
  fillSocialTemplate,
  nextLiveState,
  parseYouTubeFeed,
  pickNewEntries,
} from './logic.js';
import { fetchLiveStreams, twitchEnabled } from './twitch.js';

const prisma = db.client;

const YOUTUBE_POLL_MS = 5 * 60_000;
const TWITCH_POLL_MS = 2 * 60_000;
const MAX_LENGTH = 2000;

const timers: NodeJS.Timeout[] = [];
const running: Record<SocialPlatform, boolean> = { YOUTUBE: false, TWITCH: false };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface FeedRow {
  id: string;
  guildId: string;
  platform: string;
  channelId: string;
  message: string | null;
}

async function announce(client: Client, feed: FeedRow, vars: SocialVars): Promise<void> {
  try {
    const channel = await client.channels.fetch(feed.channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) throw new Error('Channel is missing or not text-based');
    let text = fillSocialTemplate(feed.message || DEFAULT_MESSAGES[feed.platform as SocialPlatform], vars);
    if (text.length > MAX_LENGTH) text = `${text.slice(0, MAX_LENGTH - 1)}…`;
    // Written by server managers on the dashboard, so the message may ping a role or @everyone.
    await channel.send({ content: text, allowedMentions: { parse: ['roles', 'everyone'] } });
  } catch (error) {
    appLogger.warn('Social notification failed', 'Social', {
      guildId: feed.guildId,
      feedId: feed.id,
      error: errorMessage(error),
    });
  }
}

async function checkYouTube(client: Client): Promise<void> {
  const feeds = (await prisma.socialFeed.findMany({ where: { platform: 'YOUTUBE' } })).filter((f) =>
    client.guilds.cache.has(f.guildId),
  );
  const bySource = new Map<string, typeof feeds>();
  for (const feed of feeds) bySource.set(feed.sourceId, [...(bySource.get(feed.sourceId) ?? []), feed]);

  for (const [sourceId, group] of bySource) {
    let parsed;
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(sourceId)}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parsed = parseYouTubeFeed(await res.text());
    } catch (error) {
      appLogger.warn('YouTube feed fetch failed', 'Social', { sourceId, error: errorMessage(error) });
      continue;
    }
    const newest = parsed.entries[0];
    if (!newest) continue;

    const now = new Date();
    for (const feed of group) {
      if (feed.lastItemId === newest.id) continue;
      const fresh = pickNewEntries(parsed.entries, feed.lastItemId, now);
      // Claim first so an overlapping check or a second instance cannot post the same video.
      const claimed = await prisma.socialFeed.updateMany({
        where: { id: feed.id, lastItemId: feed.lastItemId },
        data: { lastItemId: newest.id },
      });
      if (claimed.count === 0) continue;
      for (const entry of fresh) {
        await announce(client, feed, {
          name: entry.author || parsed.channelTitle || feed.label || sourceId,
          title: entry.title,
          url: entry.url,
          game: '',
        });
      }
    }
  }
}

async function checkTwitch(client: Client): Promise<void> {
  const feeds = (await prisma.socialFeed.findMany({ where: { platform: 'TWITCH' } })).filter((f) =>
    client.guilds.cache.has(f.guildId),
  );
  if (feeds.length === 0) return;
  const live = await fetchLiveStreams([...new Set(feeds.map((f) => f.sourceId.toLowerCase()))]);

  for (const feed of feeds) {
    const stream = live.get(feed.sourceId.toLowerCase()) ?? null;
    const next = nextLiveState(feed, stream?.id ?? null);
    if (next.isLive === feed.isLive && next.lastItemId === feed.lastItemId) continue;
    const claimed = await prisma.socialFeed.updateMany({
      where: { id: feed.id, lastItemId: feed.lastItemId, isLive: feed.isLive },
      data: { isLive: next.isLive, lastItemId: next.lastItemId },
    });
    if (claimed.count === 0 || !next.announce || !stream) continue;
    await announce(client, feed, {
      name: stream.user_name,
      title: stream.title,
      url: `https://www.twitch.tv/${stream.user_login}`,
      game: stream.game_name,
    });
  }
}

function every(platform: SocialPlatform, ms: number, check: () => Promise<void>): void {
  const run = async () => {
    if (running[platform]) return;
    running[platform] = true;
    try {
      await check();
    } catch (error) {
      appLogger.error('Social feed check failed', 'Social', { platform, error: errorMessage(error) });
    } finally {
      running[platform] = false;
    }
  };
  const timer = setInterval(() => void run(), ms);
  timer.unref();
  timers.push(timer);
  void run();
}

export const socialModule = {
  start(client: Client): void {
    socialModule.stop();
    every('YOUTUBE', YOUTUBE_POLL_MS, () => checkYouTube(client));
    if (twitchEnabled()) every('TWITCH', TWITCH_POLL_MS, () => checkTwitch(client));
    else appLogger.info('Twitch notifications off: TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are not set', 'Social');
  },

  stop(): void {
    for (const timer of timers.splice(0)) clearInterval(timer);
  },
};
