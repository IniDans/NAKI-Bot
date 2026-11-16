import { describe, expect, it, vi } from 'vitest';
import { parseSteps } from '../modules/moderation/steps.js';
import { TtlCache } from '../utils/ttlCache.js';

describe('escalation steps', () => {
  it('keeps valid steps sorted by threshold', () => {
    const steps = parseSteps([
      { warns: 5, action: 'BAN' },
      { warns: 3, action: 'TIMEOUT', duration: '1h' },
    ]);
    expect(steps.map((s) => s.warns)).toEqual([3, 5]);
    expect(steps[0].duration).toBe('1h');
  });

  it('drops malformed entries', () => {
    expect(parseSteps(null)).toEqual([]);
    expect(parseSteps([{ warns: 0, action: 'BAN' }, { warns: 2, action: 'NUKE' }, { warns: 1.5, action: 'KICK' }, 'x'])).toEqual([]);
  });
});

describe('TtlCache', () => {
  it('expires entries after the ttl', () => {
    vi.useFakeTimers();
    const cache = new TtlCache<number>(1000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
    vi.useRealTimers();
  });

  it('shares one in-flight load between callers', async () => {
    const cache = new TtlCache<number>(1000);
    const load = vi.fn(async () => 7);
    const [a, b] = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)]);
    expect([a, b]).toEqual([7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('evicts the oldest entry when full', () => {
    const cache = new TtlCache<number>(10_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('c')).toBe(3);
  });
});
