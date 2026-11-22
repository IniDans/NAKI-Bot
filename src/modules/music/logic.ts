/** Pure helpers for the music player: link parsing, search ranking and queue order. */

export type LoopMode = 'off' | 'track' | 'queue';
export type SpotifyKind = 'track' | 'album' | 'playlist' | 'artist';

export type ParsedQuery =
  | { kind: 'spotify'; type: SpotifyKind; id: string }
  | { kind: 'spotify-short'; url: string }
  | { kind: 'youtube-video'; id: string }
  | { kind: 'youtube-playlist'; id: string }
  | { kind: 'search'; text: string }
  | { kind: 'unsupported' };

export interface Track {
  title: string;
  /** YouTube channel or Spotify artist. */
  author: string;
  durationSec: number | null;
  source: 'youtube' | 'spotify';
  /** Page shown to users: the YouTube video or the Spotify track. */
  url: string;
  thumbnail?: string;
  /** Known for YouTube tracks; looked up just before playing for Spotify tracks. */
  youtubeId?: string;
  lookup?: { query: string; durationSec?: number };
  requestedBy: string;
}

/** A YouTube search result. */
export interface Candidate {
  id: string;
  title: string;
  channel: string;
  durationSec: number | null;
  views: number | null;
  live: boolean;
}

export const MAX_TRACK_SEC = 3 * 60 * 60;
const VIDEO_ID = /^[\w-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

export function parseQuery(raw: string): ParsedQuery {
  const text = raw.trim();
  const uri = /^spotify:(track|album|playlist|artist):([A-Za-z0-9]{22})$/.exec(text);
  if (uri) return { kind: 'spotify', type: uri[1] as SpotifyKind, id: uri[2] };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { kind: 'search', text };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'unsupported' };
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const path = url.pathname;

  if (host === 'open.spotify.com' || host === 'play.spotify.com') {
    const m = /\/(track|album|playlist|artist)\/([A-Za-z0-9]+)/.exec(path);
    if (m && SPOTIFY_ID.test(m[2])) return { kind: 'spotify', type: m[1] as SpotifyKind, id: m[2] };
    return { kind: 'unsupported' };
  }
  if (host === 'spotify.link' || host === 'spotify.app.link') return { kind: 'spotify-short', url: url.href };

  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    return VIDEO_ID.test(id) ? { kind: 'youtube-video', id } : { kind: 'unsupported' };
  }
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    const v = url.searchParams.get('v');
    if (path === '/watch' && v && VIDEO_ID.test(v)) return { kind: 'youtube-video', id: v };
    const short = /^\/(shorts|live|embed)\/([\w-]{11})/.exec(path);
    if (short) return { kind: 'youtube-video', id: short[2] };
    const list = url.searchParams.get('list');
    if (path === '/playlist' && list && /^[\w-]{10,64}$/.test(list)) return { kind: 'youtube-playlist', id: list };
  }
  return { kind: 'unsupported' };
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function words(text: string): string[] {
  return [...new Set(normalize(text).split(' ').filter((w) => w.length > 1 || /\d/.test(w)))];
}

/** Versions people rarely mean unless they type the word themselves. */
const NOISE = [
  'live', 'cover', 'karaoke', 'remix', 'slowed', 'sped up', 'speed up', 'nightcore', '8d', 'reverb',
  'instrumental', '1 hour', '1 jam', 'reaction', 'tutorial', 'mashup', 'full album', 'concert', 'konser',
];

/**
 * Picks the result that best matches the query and, among equally good matches,
 * the one with the most views. With a target duration (a Spotify track), results
 * within a few seconds of it win.
 */
export function pickBest(query: string, candidates: Candidate[], targetSec?: number): Candidate | null {
  const wanted = words(query);
  const typed = ` ${normalize(query)} `;
  const asked = NOISE.filter((w) => typed.includes(` ${w} `));
  const scored = candidates
    .filter((c) => !c.live && c.durationSec !== null && c.durationSec >= 30 && c.durationSec <= MAX_TRACK_SEC)
    .map((c) => {
      const hay = ` ${normalize(`${c.title} ${c.channel}`)} `;
      const hits = wanted.filter((w) => hay.includes(` ${w} `)).length;
      return {
        c,
        relevance: wanted.length ? hits / wanted.length : 1,
        noisy: NOISE.some((w) => hay.includes(` ${w} `) && !asked.includes(w)),
        version: asked.every((w) => hay.includes(` ${w} `)),
        off: targetSec ? Math.abs((c.durationSec ?? 0) - targetSec) : 0,
      };
    });
  if (scored.length === 0) return null;

  // Long queries may miss one word (a "feat." name, "official", ...).
  const best = Math.max(...scored.map((s) => s.relevance));
  const slack = wanted.length >= 4 ? 1 / wanted.length : 0;
  let pool = scored.filter((s) => s.relevance >= best - slack - 1e-9);
  // A version the user typed ("live", "remix", ...) must be there; others are avoided.
  const version = pool.filter((s) => s.version);
  if (version.length) pool = version;
  const clean = pool.filter((s) => !s.noisy);
  if (clean.length) pool = clean;
  if (targetSec) {
    const close = pool.filter((s) => s.off <= Math.max(8, targetSec * 0.06));
    if (close.length) pool = close;
  }
  return pool.reduce((a, b) => ((b.c.views ?? 0) > (a.c.views ?? 0) ? b : a)).c;
}

/** Search text for a Spotify track: first artist and the title without "feat." / remaster notes. */
export function spotifySearchText(title: string, artists: string): string {
  const artist = artists.split(',')[0].trim();
  const clean = title
    .replace(/\s*[([](feat|ft|with)\.?\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+.*\b(remaster(ed)?|version|edit|mono|stereo)\b.*$/i, '')
    .trim();
  return `${artist} ${clean}`.trim();
}

/** Next track after the current one finishes or is skipped. */
export function advance<T>(current: T | null, queue: T[], loop: LoopMode, skipped: boolean): { current: T | null; queue: T[] } {
  if (current && loop === 'track' && !skipped) return { current, queue };
  const rest = [...queue];
  if (current && loop === 'queue') rest.push(current);
  return { current: rest.shift() ?? null, queue: rest };
}

export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function nextLoop(mode: LoopMode): LoopMode {
  return mode === 'off' ? 'track' : mode === 'track' ? 'queue' : 'off';
}

export function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return 'live';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function progressBar(elapsedSec: number, totalSec: number | null, width = 18): string {
  if (!totalSec) return '';
  const pos = Math.min(width - 1, Math.floor((elapsedSec / totalSec) * width));
  return `${'▬'.repeat(pos)}🔘${'▬'.repeat(width - pos - 1)}`;
}
