import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import { appLogger } from '../../utils/logger.js';
import {
  MAX_QUEUE_SIZE,
  MAX_TRACK_SEC,
  parseQuery,
  pickBest,
  spotifySearchText,
  type Candidate,
  type SpotifyKind,
  type Track,
} from './logic.js';

/**
 * Where the audio comes from. YouTube goes through yt-dlp; Spotify streams are DRM-locked,
 * so a Spotify link is read for its titles and every track is played from its YouTube match.
 */

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
// YouTube needs a JavaScript runtime to unlock streams; reuse the Node running the bot.
const BASE_ARGS = ['--ignore-config', '--no-warnings', '--js-runtimes', `node:${process.execPath}`];
const SEARCH_SIZE = 8;
export const MAX_PLAYLIST = MAX_QUEUE_SIZE;
/** Spotify's public embed lists at most this many songs of a playlist or album. */
export const SPOTIFY_EMBED_LIMIT = 100;

export class MusicError extends Error {}

/** Runs yt-dlp with `--print <json template>` and returns one parsed object per printed line. */
function ytdlpJson(args: string[], timeoutMs = 45_000): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, [...BASE_ARGS, ...args], { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => (out += chunk));
    child.stderr.on('data', (chunk: Buffer) => (err = (err + chunk).slice(-2000)));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new MusicError(`yt-dlp could not start: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const rows = out
        .split(/\r?\n/)
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line) as Record<string, unknown>);
      if (code !== 0 && rows.length === 0) {
        const reason = err.trim().split(/\r?\n/).pop() ?? `exit code ${code}`;
        reject(new MusicError(reason.replace(/^ERROR:\s*/, '')));
      } else resolve(rows);
    });
  });
}

const FIELDS = '%(.{id,title,channel,uploader,duration,view_count,live_status})j';
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toCandidate(row: Record<string, unknown>): Candidate {
  return {
    id: str(row.id),
    title: str(row.title),
    channel: str(row.channel) || str(row.uploader),
    durationSec: num(row.duration),
    views: num(row.view_count),
    live: row.live_status === 'is_live' || row.live_status === 'is_upcoming',
  };
}

const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function fromCandidate(c: Candidate, requestedBy: string): Track {
  return {
    title: c.title,
    author: c.channel,
    durationSec: c.durationSec,
    source: 'youtube',
    url: watchUrl(c.id),
    thumbnail: thumb(c.id),
    youtubeId: c.id,
    requestedBy,
  };
}

export async function searchYouTube(query: string): Promise<Candidate[]> {
  const rows = await ytdlpJson(['--flat-playlist', '--print', FIELDS, `ytsearch${SEARCH_SIZE}:${query}`]);
  return rows.map(toCandidate).filter((c) => c.id);
}

async function youtubeVideo(id: string): Promise<Candidate> {
  const [row] = await ytdlpJson(['--no-playlist', '--print', FIELDS, '--', watchUrl(id)]);
  if (!row) throw new MusicError('That video is unavailable.');
  return toCandidate(row);
}

async function youtubePlaylist(id: string): Promise<{ name: string; items: Candidate[] }> {
  const rows = await ytdlpJson([
    '--flat-playlist',
    '--playlist-end', String(MAX_PLAYLIST),
    '--print', '%(.{id,title,channel,uploader,duration,view_count,live_status,playlist_title})j',
    '--', `https://www.youtube.com/playlist?list=${id}`,
  ]);
  return { name: str(rows[0]?.playlist_title) || 'YouTube playlist', items: rows.map(toCandidate).filter((c) => c.id) };
}

// ─── Spotify ────────────────────────────────────────────────────────────────

interface SpotifyEntity {
  type?: string;
  name?: string;
  title?: string;
  uri?: string;
  duration?: number;
  artists?: { name?: string }[];
  visualIdentity?: { image?: { url?: string; maxWidth?: number }[] };
  trackList?: { title?: string; subtitle?: string; duration?: number; uri?: string; isPlayable?: boolean }[];
}

const spotifyHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'en' };

/** Reads the public embed page, which carries titles, artists and durations without an API key. */
async function spotifyEntity(type: SpotifyKind, id: string): Promise<SpotifyEntity> {
  const res = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
    headers: spotifyHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) throw new MusicError('That Spotify link does not exist or is private.');
  if (!res.ok) throw new MusicError(`Spotify answered ${res.status}.`);
  const html = await res.text();
  const json = /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s.exec(html)?.[1];
  const entity = json ? (JSON.parse(json)?.props?.pageProps?.state?.data?.entity as SpotifyEntity | undefined) : undefined;
  if (!entity) throw new MusicError('Could not read that Spotify link.');
  return entity;
}

const spotifyPage = (uri: string | undefined, fallback: string) => {
  const m = /^spotify:(\w+):(\w+)$/.exec(uri ?? '');
  return m ? `https://open.spotify.com/${m[1]}/${m[2]}` : fallback;
};

function spotifyTrack(title: string, artists: string, durationMs: number | undefined, url: string, requestedBy: string, thumbnail?: string): Track {
  const durationSec = durationMs ? Math.round(durationMs / 1000) : null;
  return {
    title,
    author: artists,
    durationSec,
    source: 'spotify',
    url,
    thumbnail,
    lookup: { query: spotifySearchText(title, artists), durationSec: durationSec ?? undefined },
    requestedBy,
  };
}

async function fromSpotify(type: SpotifyKind, id: string, requestedBy: string): Promise<Resolved> {
  const entity = await spotifyEntity(type, id);
  const cover = entity.visualIdentity?.image?.sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0]?.url;
  const page = `https://open.spotify.com/${type}/${id}`;
  if (type === 'track') {
    const artists = (entity.artists ?? []).map((a) => a.name).filter(Boolean).join(', ');
    const title = entity.name || entity.title || '';
    if (!title) throw new MusicError('Could not read that Spotify track.');
    return { tracks: [spotifyTrack(title, artists, entity.duration, page, requestedBy, cover)] };
  }
  const tracks = (entity.trackList ?? [])
    .filter((t) => t.title && t.isPlayable !== false)
    .slice(0, MAX_PLAYLIST)
    .map((t) => spotifyTrack(t.title!, t.subtitle ?? '', t.duration, spotifyPage(t.uri, page), requestedBy, cover));
  if (tracks.length === 0) throw new MusicError('That Spotify link has no playable tracks.');
  return {
    tracks,
    collection: entity.name || entity.title || 'Spotify playlist',
    capped: (entity.trackList?.length ?? 0) >= SPOTIFY_EMBED_LIMIT,
  };
}

/** spotify.link short links redirect to open.spotify.com. */
async function expandShortLink(url: string): Promise<string> {
  const res = await fetch(url, { headers: spotifyHeaders, redirect: 'follow', signal: AbortSignal.timeout(10_000) });
  return res.url;
}

// ─── Resolve user input ─────────────────────────────────────────────────────

export interface Resolved {
  tracks: Track[];
  /** Playlist or album name when the input held several tracks. */
  collection?: string;
  /** Spotify only showed its first 100 songs. */
  capped?: boolean;
}

function checkLength(c: Candidate) {
  if (c.live || c.durationSec === null) throw new MusicError('Live streams are not supported.');
  if (c.durationSec > MAX_TRACK_SEC) throw new MusicError('That video is longer than 3 hours.');
}

export async function resolve(input: string, requestedBy: string, depth = 0): Promise<Resolved> {
  const parsed = parseQuery(input);
  switch (parsed.kind) {
    case 'search': {
      const best = pickBest(parsed.text, await searchYouTube(parsed.text));
      if (!best) throw new MusicError(`Nothing found for "${parsed.text}".`);
      return { tracks: [fromCandidate(best, requestedBy)] };
    }
    case 'youtube-video': {
      const video = await youtubeVideo(parsed.id);
      checkLength(video);
      return { tracks: [fromCandidate(video, requestedBy)] };
    }
    case 'youtube-playlist': {
      const list = await youtubePlaylist(parsed.id);
      const tracks = list.items
        .filter((c) => !c.live && c.durationSec !== null && c.durationSec <= MAX_TRACK_SEC)
        .map((c) => fromCandidate(c, requestedBy));
      if (tracks.length === 0) throw new MusicError('That playlist is empty or private.');
      return { tracks, collection: list.name };
    }
    case 'spotify':
      return fromSpotify(parsed.type, parsed.id, requestedBy);
    case 'spotify-short': {
      if (depth > 0) break;
      return resolve(await expandShortLink(parsed.url), requestedBy, depth + 1);
    }
  }
  throw new MusicError('Use a YouTube or Spotify link, or type a song title.');
}

/** Fills in the YouTube video for a Spotify track. Returns false when nothing matches. */
export async function ensurePlayable(track: Track): Promise<boolean> {
  if (track.youtubeId) return true;
  if (!track.lookup) return false;
  const best = pickBest(track.lookup.query, await searchYouTube(track.lookup.query), track.lookup.durationSec);
  if (!best) return false;
  track.youtubeId = best.id;
  track.durationSec ??= best.durationSec;
  track.thumbnail ??= thumb(best.id);
  return true;
}

// ─── Audio stream ───────────────────────────────────────────────────────────

export interface AudioStream {
  stream: Readable;
  /** Last error line from yt-dlp or ffmpeg, if any. */
  error(): string | null;
  kill(): void;
}

/** yt-dlp downloads the best audio to stdout, ffmpeg turns it into Ogg Opus for Discord. */
export function openStream(youtubeId: string): AudioStream {
  let lastError: string | null = null;
  const note = (from: string) => (chunk: Buffer) => {
    const line = chunk.toString().trim().split(/\r?\n/).pop();
    if (line) lastError = `${from}: ${line.replace(/^ERROR:\s*/, '')}`;
  };

  const ytdlp = spawn(YTDLP, [...BASE_ARGS, '-f', 'bestaudio/best', '--no-playlist', '--quiet', '-o', '-', '--', watchUrl(youtubeId)], {
    windowsHide: true,
  });
  const ffmpeg = spawn(
    FFMPEG,
    ['-loglevel', 'error', '-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-f', 'ogg', 'pipe:1'],
    { windowsHide: true },
  );
  ytdlp.stdout.pipe(ffmpeg.stdin);
  // Killing either side mid-song breaks the pipe; that is expected.
  for (const s of [ytdlp.stdout, ffmpeg.stdin, ffmpeg.stdout]) s.on('error', () => {});
  ytdlp.stderr.on('data', note('yt-dlp'));
  ffmpeg.stderr.on('data', note('ffmpeg'));
  ytdlp.on('error', (e) => (lastError = `yt-dlp: ${e.message}`));
  ffmpeg.on('error', (e) => (lastError = `ffmpeg: ${e.message}`));

  return {
    stream: ffmpeg.stdout,
    error: () => lastError,
    kill() {
      ytdlp.kill();
      ffmpeg.kill();
    },
  };
}

/** Keeps yt-dlp current; YouTube changes often and old versions stop working. */
export function updateYtDlp(): void {
  const child = spawn(YTDLP, ['-U'], { windowsHide: true });
  let out = '';
  child.stdout.on('data', (chunk: Buffer) => (out += chunk));
  child.on('error', (error) => appLogger.warn('yt-dlp not found; music is unavailable', 'Music', { error: error.message }));
  child.on('close', () => {
    const line = out.trim().split(/\r?\n/).pop();
    if (line) appLogger.info(line, 'Music');
  });
}
