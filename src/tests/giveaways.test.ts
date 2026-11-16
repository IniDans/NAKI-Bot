import { describe, expect, it } from 'vitest';
import { giveawayMessage, parseDuration, pickWinners, winnerAnnouncement } from '../modules/giveaways/logic.js';

describe('parseDuration', () => {
  it('adds up units', () => {
    expect(parseDuration('30m')).toBe(30 * 60_000);
    expect(parseDuration('1d 12h')).toBe(36 * 3_600_000);
    expect(parseDuration('2W')).toBe(14 * 86_400_000);
  });
  it('rejects text that is not a duration', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('tomorrow')).toBeNull();
    expect(parseDuration('10m and more')).toBeNull();
    expect(parseDuration('15')).toBeNull();
  });
});

describe('pickWinners', () => {
  it('returns distinct entries, never more than asked or available', () => {
    const winners = pickWinners(['a', 'b', 'c', 'd'], 2);
    expect(winners).toHaveLength(2);
    expect(new Set(winners).size).toBe(2);
    expect(pickWinners(['a'], 3)).toEqual(['a']);
    expect(pickWinners([], 1)).toEqual([]);
  });
  it('follows the random source', () => {
    // random() = 0 always swaps with itself, so the order is unchanged.
    expect(pickWinners(['a', 'b', 'c'], 2, () => 0)).toEqual(['a', 'b']);
    // random() close to 1 picks the last remaining entry each time.
    expect(pickWinners(['a', 'b', 'c'], 2, () => 0.999)).toEqual(['c', 'a']);
  });
});

describe('giveawayMessage', () => {
  const base = {
    id: 'g1',
    prize: 'Nitro',
    hostId: '1',
    winnerCount: 1,
    endsAt: new Date('2026-12-01T00:00:00Z'),
    entries: 4,
  };
  it('shows an enter button while running', () => {
    const message = giveawayMessage({ ...base, ended: false, winners: [] });
    expect(message.embeds[0].description).toContain('Entries: 4');
    expect(message.components[0].components[0]).toMatchObject({ custom_id: 'giveaway:enter:g1', disabled: false });
  });
  it('lists winners and disables the button once ended', () => {
    const message = giveawayMessage({ ...base, ended: true, winners: ['7', '8'] });
    expect(message.embeds[0].description).toContain('Winners: <@7>, <@8>');
    expect(message.components[0].components[0].disabled).toBe(true);
  });
});

describe('winnerAnnouncement', () => {
  it('mentions winners or says nobody won', () => {
    expect(winnerAnnouncement('Nitro', ['7'])).toBe('Congratulations <@7>! You won **Nitro**.');
    expect(winnerAnnouncement('Nitro', [])).toContain('without any valid entries');
  });
});
