import { describe, expect, it } from 'vitest';
import {
  advance,
  formatDuration,
  nextLoop,
  parseQuery,
  pickBest,
  shuffled,
  spotifySearchText,
  type Candidate,
} from '../modules/music/logic.js';

const SPOTIFY_ID = '4cOdK2wGLETKBW3PvgPWqT';

describe('parseQuery', () => {
  it('reads Spotify links and URIs', () => {
    expect(parseQuery(`https://open.spotify.com/track/${SPOTIFY_ID}?si=abc`)).toEqual({ kind: 'spotify', type: 'track', id: SPOTIFY_ID });
    expect(parseQuery(`https://open.spotify.com/intl-id/playlist/${SPOTIFY_ID}`)).toEqual({ kind: 'spotify', type: 'playlist', id: SPOTIFY_ID });
    expect(parseQuery(`spotify:album:${SPOTIFY_ID}`)).toEqual({ kind: 'spotify', type: 'album', id: SPOTIFY_ID });
    expect(parseQuery('https://spotify.link/AbCdEf')).toEqual({ kind: 'spotify-short', url: 'https://spotify.link/AbCdEf' });
  });

  it('reads YouTube videos and playlists', () => {
    expect(parseQuery('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toEqual({ kind: 'youtube-video', id: 'dQw4w9WgXcQ' });
    expect(parseQuery('https://youtu.be/dQw4w9WgXcQ?si=x')).toEqual({ kind: 'youtube-video', id: 'dQw4w9WgXcQ' });
    expect(parseQuery('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ kind: 'youtube-video', id: 'dQw4w9WgXcQ' });
    expect(parseQuery('https://youtube.com/shorts/dQw4w9WgXcQ')).toEqual({ kind: 'youtube-video', id: 'dQw4w9WgXcQ' });
    expect(parseQuery('https://www.youtube.com/playlist?list=PL1234567890abcdef')).toEqual({ kind: 'youtube-playlist', id: 'PL1234567890abcdef' });
  });

  it('plays only the video when a watch link also names a playlist', () => {
    expect(parseQuery('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ')).toEqual({ kind: 'youtube-video', id: 'dQw4w9WgXcQ' });
  });

  it('treats plain text as a search and refuses other sites', () => {
    expect(parseQuery('  dewa 19 kangen ')).toEqual({ kind: 'search', text: 'dewa 19 kangen' });
    expect(parseQuery('https://example.com/song.mp3')).toEqual({ kind: 'unsupported' });
    expect(parseQuery('http://192.168.1.1/')).toEqual({ kind: 'unsupported' });
    expect(parseQuery('file:///C:/secret.txt')).toEqual({ kind: 'unsupported' });
  });
});

const c = (id: string, title: string, views: number, durationSec = 300, channel = 'Some Channel', live = false): Candidate => ({
  id, title, channel, durationSec, views, live,
});

describe('pickBest', () => {
  it('picks the most viewed of the matching results', () => {
    const results = [
      c('a', 'Dewa 19 - Kangen | Official Music Video', 37_000_000),
      c('b', 'Dewa 19 - Kangen (Official Lyric Video)', 92_000_000),
      c('c', 'Dewa 19 - Kangen (Official Audio)', 93_000_000),
      c('d', 'Dewa 19 feat Ari Lasso - Kangen | Live', 200_000_000, 334),
    ];
    expect(pickBest('dewa 19 kangen', results)?.id).toBe('c');
  });

  it('prefers results that contain every word over popular unrelated ones', () => {
    const results = [c('pop', 'Another Song by Dewa 19', 500_000_000), c('hit', 'Dewa 19 - Kangen', 1_000)];
    expect(pickBest('dewa 19 kangen', results)?.id).toBe('hit');
  });

  it('keeps live and cover versions when the user asks for them', () => {
    const results = [c('studio', 'Kangen - Dewa 19', 90_000_000), c('live', 'Kangen - Dewa 19 (Live)', 1_000)];
    expect(pickBest('kangen dewa 19 live', results)?.id).toBe('live');
  });

  it('matches a Spotify track by duration', () => {
    const results = [
      c('long', 'Rick Astley - Never Gonna Give You Up (Official Video)', 1_800_000_000, 245),
      c('right', 'Rick Astley - Never Gonna Give You Up (Audio)', 5_000_000, 214),
    ];
    expect(pickBest('Rick Astley Never Gonna Give You Up', results, 214)?.id).toBe('right');
  });

  it('skips live streams and ignores missing view counts', () => {
    expect(pickBest('song', [c('x', 'song', 1, 300, 'A', true)])).toBeNull();
    expect(pickBest('song', [{ ...c('y', 'song', 0), views: null }])?.id).toBe('y');
  });
});

describe('spotifySearchText', () => {
  it('uses the first artist and drops feat./remaster notes', () => {
    expect(spotifySearchText('Flower In A Hurricane (feat. Tame Impala, SZA)', 'Justice, Tame Impala, SZA')).toBe('Justice Flower In A Hurricane');
    expect(spotifySearchText('Bohemian Rhapsody - Remastered 2011', 'Queen')).toBe('Queen Bohemian Rhapsody');
    expect(spotifySearchText('Song (Remix)', 'Artist')).toBe('Artist Song (Remix)');
  });
});

describe('queue order', () => {
  it('moves to the next song', () => {
    expect(advance('a', ['b', 'c'], 'off', false)).toEqual({ current: 'b', queue: ['c'] });
    expect(advance('a', [], 'off', false)).toEqual({ current: null, queue: [] });
    expect(advance(null, ['a'], 'off', true)).toEqual({ current: 'a', queue: [] });
  });

  it('repeats the song unless it was skipped', () => {
    expect(advance('a', ['b'], 'track', false)).toEqual({ current: 'a', queue: ['b'] });
    expect(advance('a', ['b'], 'track', true)).toEqual({ current: 'b', queue: [] });
  });

  it('puts finished songs back at the end when looping the queue', () => {
    expect(advance('a', ['b'], 'queue', false)).toEqual({ current: 'b', queue: ['a'] });
    expect(advance('a', [], 'queue', true)).toEqual({ current: 'a', queue: [] });
  });

  it('cycles loop modes and shuffles without losing songs', () => {
    expect([nextLoop('off'), nextLoop('track'), nextLoop('queue')]).toEqual(['track', 'queue', 'off']);
    const items = [1, 2, 3, 4, 5];
    expect(shuffled(items, () => 0).sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it('formats durations', () => {
    expect([formatDuration(65), formatDuration(3725), formatDuration(null)]).toEqual(['1:05', '1:02:05', 'live']);
  });
});
