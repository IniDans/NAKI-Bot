import { describe, expect, it } from 'vitest';
import { NAME_MAX, renderStatName, usedKeys } from '../modules/stats/logic.js';

describe('renderStatName', () => {
  it('fills counts with thousands separators', () => {
    expect(renderStatName('Members: {members}', { members: 12345 })).toBe('Members: 12,345');
    expect(renderStatName('{humans} humans / {bots} bots', { humans: 10, bots: 2 })).toBe('10 humans / 2 bots');
  });
  it('shows an ellipsis for counts that are not known yet', () => {
    expect(renderStatName('Bots: {bots}', { members: 5 })).toBe('Bots: …');
  });
  it('leaves unknown placeholders and caps the length', () => {
    expect(renderStatName('{online} online', {})).toBe('{online} online');
    expect(renderStatName('x'.repeat(150), {})).toHaveLength(NAME_MAX);
  });
});

describe('usedKeys', () => {
  it('lists the placeholders a template needs', () => {
    expect(usedKeys('{humans} of {members}')).toEqual(['members', 'humans']);
    expect(usedKeys('plain')).toEqual([]);
  });
});
