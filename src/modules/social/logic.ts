/** Pure helpers for social feed notifications, kept free of Discord and database imports. */

export const SOCIAL_PLATFORMS = ['YOUTUBE', 'TWITCH'] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const DEFAULT_MESSAGES: Record<SocialPlatform, string> = {
  YOUTUBE: '**{name}** uploaded a new video: {title}\n{url}',
  TWITCH: '**{name}** is live on Twitch: {title}\n{url}',
};

/** Videos older than this are never announced, e.g. after the bot was offline for days. */
export const MAX_VIDEO_AGE_MS = 2 * 24 * 3600_000;
/** At most this many videos are posted for one channel in a single check. */
export const MAX_POSTS_PER_CHECK = 3;

export interface FeedEntry {
  id: string;
  title: string;
  url: string;
  author: string;
  publishedAt: Date;
}

export interface ParsedFeed {
  channelTitle: string;
  entries: FeedEntry[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
      }
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .trim();
}

function tag(xml: string, name: string): string | null {
  const match = new RegExp(String.raw`<${name}(?:\s[^>]*)?>([\s\S]*?)</${name}>`).exec(xml);
  return match ? decodeXml(match[1]) : null;
}

/** Reads a YouTube channel feed (youtube.com/feeds/videos.xml), newest entry first. */
export function parseYouTubeFeed(xml: string): ParsedFeed {
  const firstEntry = xml.indexOf('<entry>');
  const head = firstEntry === -1 ? xml : xml.slice(0, firstEntry);
  const entries: FeedEntry[] = [];
  for (const [, body] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = tag(body, 'yt:videoId');
    const published = new Date(tag(body, 'published') ?? '');
    if (!id || Number.isNaN(published.getTime())) continue;
    const href = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(body)?.[1];
    entries.push({
      id,
      title: tag(body, 'title') ?? '',
      url: href ? decodeXml(href) : `https://www.youtube.com/watch?v=${id}`,
      author: tag(body, 'name') ?? '',
      publishedAt: published,
    });
  }
  entries.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  return { channelTitle: tag(head, 'title') ?? '', entries };
}

/**
 * Entries to announce, oldest first: everything newer than the last announced video,
 * minus anything too old. A feed with no last video yet only records its baseline.
 */
export function pickNewEntries(entries: FeedEntry[], lastItemId: string | null, now: Date): FeedEntry[] {
  if (!lastItemId) return [];
  const fresh: FeedEntry[] = [];
  for (const entry of entries) {
    if (entry.id === lastItemId) break;
    if (now.getTime() - entry.publishedAt.getTime() <= MAX_VIDEO_AGE_MS) fresh.push(entry);
  }
  return fresh.slice(0, MAX_POSTS_PER_CHECK).reverse();
}

export interface LiveState {
  isLive: boolean;
  lastItemId: string | null;
}

/**
 * Next state for a Twitch feed. A stream is announced once per stream id, so a stream
 * that drops and comes back under the same id is not announced twice.
 */
export function nextLiveState(current: LiveState, streamId: string | null): LiveState & { announce: boolean } {
  if (!streamId) return { isLive: false, lastItemId: current.lastItemId, announce: false };
  return { isLive: true, lastItemId: streamId, announce: streamId !== current.lastItemId };
}

export interface SocialVars {
  name: string;
  title: string;
  url: string;
  game: string;
}

/** Fills {name}, {title}, {url} and {game}; other braces are left as typed. */
export function fillSocialTemplate(template: string, vars: SocialVars): string {
  return template.replace(/\{(name|title|url|game)\}/g, (_, key: keyof SocialVars) => vars[key]);
}
