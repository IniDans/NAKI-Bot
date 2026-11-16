import { describe, expect, it } from 'vitest';
import {
  type FeedEntry,
  decodeXml,
  fillSocialTemplate,
  nextLiveState,
  parseYouTubeFeed,
  pickNewEntries,
} from '../modules/social/logic.js';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>Tom &amp; Jerry Clips</title>
 <author><name>Tom &amp; Jerry Clips</name></author>
 <entry>
  <id>yt:video:old</id>
  <yt:videoId>old</yt:videoId>
  <title>Older video</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=old"/>
  <author><name>Tom &amp; Jerry Clips</name></author>
  <published>2026-01-01T08:00:00+00:00</published>
 </entry>
 <entry>
  <id>yt:video:new</id>
  <yt:videoId>new</yt:videoId>
  <title>Q&amp;A &#8211; part 2 &lt;live&gt;</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=new&amp;t=1"/>
  <author><name>Tom &amp; Jerry Clips</name></author>
  <published>2026-01-02T08:00:00+00:00</published>
 </entry>
</feed>`;

describe('parseYouTubeFeed', () => {
  it('reads entries newest first and decodes entities', () => {
    const feed = parseYouTubeFeed(FEED);
    expect(feed.channelTitle).toBe('Tom & Jerry Clips');
    expect(feed.entries.map((e) => e.id)).toEqual(['new', 'old']);
    expect(feed.entries[0].title).toBe('Q&A – part 2 <live>');
    expect(feed.entries[0].url).toBe('https://www.youtube.com/watch?v=new&t=1');
    expect(feed.entries[0].author).toBe('Tom & Jerry Clips');
  });
  it('returns no entries for an empty feed', () => {
    expect(parseYouTubeFeed('<feed><title>x</title></feed>').entries).toEqual([]);
  });
});

describe('decodeXml', () => {
  it('leaves unknown entities alone', () => {
    expect(decodeXml('a &foo; b &#x41;')).toBe('a &foo; b A');
  });
});

describe('pickNewEntries', () => {
  const now = new Date('2026-01-03T00:00:00Z');
  const entry = (id: string, hoursAgo: number): FeedEntry => ({
    id,
    title: id,
    url: '',
    author: '',
    publishedAt: new Date(now.getTime() - hoursAgo * 3600_000),
  });
  const entries = [entry('d', 1), entry('c', 2), entry('b', 3), entry('a', 4)];

  it('records a baseline without posting when nothing was announced yet', () => {
    expect(pickNewEntries(entries, null, now)).toEqual([]);
  });
  it('returns videos newer than the last one, oldest first', () => {
    expect(pickNewEntries(entries, 'b', now).map((e) => e.id)).toEqual(['c', 'd']);
    expect(pickNewEntries(entries, 'd', now)).toEqual([]);
  });
  it('caps the burst and skips videos that are too old', () => {
    expect(pickNewEntries(entries, 'gone', now).map((e) => e.id)).toEqual(['b', 'c', 'd']);
    expect(pickNewEntries([entry('x', 72), entry('y', 1)], 'gone', now).map((e) => e.id)).toEqual(['y']);
  });
});

describe('nextLiveState', () => {
  it('announces a new stream once', () => {
    expect(nextLiveState({ isLive: false, lastItemId: null }, 's1')).toEqual({
      isLive: true,
      lastItemId: 's1',
      announce: true,
    });
    expect(nextLiveState({ isLive: true, lastItemId: 's1' }, 's1').announce).toBe(false);
  });
  it('does not re-announce a stream that drops and returns under the same id', () => {
    const offline = nextLiveState({ isLive: true, lastItemId: 's1' }, null);
    expect(offline).toEqual({ isLive: false, lastItemId: 's1', announce: false });
    expect(nextLiveState(offline, 's1').announce).toBe(false);
    expect(nextLiveState(offline, 's2').announce).toBe(true);
  });
});

describe('fillSocialTemplate', () => {
  it('fills known placeholders and keeps dollar signs literal', () => {
    expect(
      fillSocialTemplate('{name}: {title} ({game}) {url} {other}', {
        name: 'A',
        title: 'Win $100 $&',
        url: 'u',
        game: 'G',
      }),
    ).toBe('A: Win $100 $& (G) u {other}');
  });
});
