import { describe, expect, it, vi } from 'vitest';
import { parseSteps } from '../modules/moderation/steps.js';
import { TtlCache } from '../utils/ttlCache.js';
import { checkAlt } from '../modules/verification/alt.js';
import { CAPTCHA_ALPHABET, CAPTCHA_LENGTH, generateCode, matchesCode, renderCaptcha } from '../modules/verification/captcha.js';

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

describe('verification', () => {
  const base = { altFilterEnabled: true, minAccountAgeDays: 7, requireAvatar: true };
  const now = Date.UTC(2026, 0, 31);

  it('does nothing when the alt filter is off', () => {
    expect(checkAlt({ ...base, altFilterEnabled: false }, { createdTimestamp: now, hasAvatar: false }, now)).toEqual({ flagged: false });
  });

  it('flags young accounts and missing avatars', () => {
    const verdict = checkAlt(base, { createdTimestamp: now - 2 * 86_400_000, hasAvatar: false }, now);
    expect(verdict.flagged).toBe(true);
    if (verdict.flagged) expect(verdict.reasons).toHaveLength(2);
  });

  it('passes old accounts with an avatar', () => {
    expect(checkAlt(base, { createdTimestamp: now - 30 * 86_400_000, hasAvatar: true }, now)).toEqual({ flagged: false });
  });

  it('generates codes from the unambiguous alphabet and matches loosely', () => {
    const code = generateCode();
    expect(code).toHaveLength(CAPTCHA_LENGTH);
    expect([...code].every((c) => CAPTCHA_ALPHABET.includes(c))).toBe(true);
    expect(matchesCode('AB3CD', ' ab3 cd ')).toBe(true);
    expect(matchesCode('AB3CD', 'AB3CE')).toBe(false);
  });

  it('renders a PNG', () => {
    const png = renderCaptcha('AB3CD');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
});
