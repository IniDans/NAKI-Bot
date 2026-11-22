import { describe, expect, it } from 'vitest';
import { changedGuilds } from '../modules/dashboardSync/logic.js';

const row = (guildId: string, ms: number) => ({ guildId, updatedAt: new Date(ms) });

describe('changedGuilds', () => {
  it('only records a baseline on the first poll', () => {
    const { changed, next } = changedGuilds(null, [row('a', 1), row('b', 2)]);
    expect(changed).toEqual([]);
    expect([...next]).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('reports guilds whose timestamp moved', () => {
    const { next } = changedGuilds(null, [row('a', 1), row('b', 2)]);
    expect(changedGuilds(next, [row('a', 1), row('b', 5)]).changed).toEqual(['b']);
  });

  it('reports a guild whose row was created after the baseline', () => {
    const { next } = changedGuilds(null, [row('a', 1)]);
    expect(changedGuilds(next, [row('a', 1), row('new', 9)]).changed).toEqual(['new']);
  });

  it('reports nothing when nothing changed', () => {
    const { next } = changedGuilds(null, [row('a', 1)]);
    expect(changedGuilds(next, [row('a', 1)]).changed).toEqual([]);
  });
});
