import { describe, expect, it } from 'vitest';
import { fillTemplate, findResponder, matchesTrigger, nextRunAfter } from '../modules/automessages/logic.js';

describe('matchesTrigger', () => {
  it('matches whole words for CONTAINS', () => {
    expect(matchesTrigger('hi everyone', 'hi', 'CONTAINS')).toBe(true);
    expect(matchesTrigger('well, HI!', 'hi', 'CONTAINS')).toBe(true);
    expect(matchesTrigger('this is fine', 'hi', 'CONTAINS')).toBe(false);
    expect(matchesTrigger('how do I   apply here', 'how do i apply', 'CONTAINS')).toBe(true);
  });
  it('handles EXACT and STARTS_WITH', () => {
    expect(matchesTrigger('  Rules ', 'rules', 'EXACT')).toBe(true);
    expect(matchesTrigger('rules please', 'rules', 'EXACT')).toBe(false);
    expect(matchesTrigger('!ip server', '!ip', 'STARTS_WITH')).toBe(true);
    expect(matchesTrigger('what is !ip', '!ip', 'STARTS_WITH')).toBe(false);
  });
  it('treats regex characters literally', () => {
    expect(matchesTrigger('price? (usd)', 'price? (usd)', 'CONTAINS')).toBe(true);
    expect(matchesTrigger('pricey usd', 'price? (usd)', 'CONTAINS')).toBe(false);
  });
  it('never matches an empty trigger', () => {
    expect(matchesTrigger('anything', '  ', 'CONTAINS')).toBe(false);
  });
});

describe('findResponder', () => {
  const rules = [
    { id: 'a', trigger: 'ip', matchType: 'CONTAINS', response: 'A', enabled: false },
    { id: 'b', trigger: 'ip', matchType: 'CONTAINS', response: 'B', enabled: true },
  ];
  it('skips disabled rules and returns the first match', () => {
    expect(findResponder(rules, 'what is the ip')?.id).toBe('b');
    expect(findResponder(rules, 'nothing here')).toBeNull();
  });
});

describe('fillTemplate', () => {
  it('replaces every placeholder', () => {
    expect(
      fillTemplate('{mention} welcome to {server}, see {channel}. {user}{unknown}', {
        mention: '<@1>',
        user: 'ann',
        server: 'S',
        channel: '<#2>',
      }),
    ).toBe('<@1> welcome to S, see <#2>. ann{unknown}');
  });
});

describe('nextRunAfter', () => {
  const at = new Date('2026-01-01T10:00:00Z');
  it('returns null for one-off messages', () => {
    expect(nextRunAfter(at, null, at)).toBeNull();
  });
  it('steps one interval when on time', () => {
    expect(nextRunAfter(at, 60, new Date('2026-01-01T10:00:30Z'))?.toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });
  it('skips runs missed while offline', () => {
    expect(nextRunAfter(at, 60, new Date('2026-01-01T13:30:00Z'))?.toISOString()).toBe('2026-01-01T14:00:00.000Z');
  });
});
