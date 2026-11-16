import { describe, expect, it } from 'vitest';
import {
  fillLevelTemplate,
  parseRewards,
  progressFromXp,
  rewardRolesFor,
  rollXp,
  totalXpFor,
  xpToNext,
} from '../modules/leveling/logic.js';

describe('level curve', () => {
  it('needs more XP for each level', () => {
    expect(xpToNext(0)).toBe(100);
    expect(xpToNext(1)).toBe(155);
    expect(totalXpFor(2)).toBe(255);
  });
  it('turns total XP into level and progress', () => {
    expect(progressFromXp(0)).toEqual({ level: 0, current: 0, needed: 100 });
    expect(progressFromXp(99).level).toBe(0);
    expect(progressFromXp(100)).toEqual({ level: 1, current: 0, needed: 155 });
    expect(progressFromXp(totalXpFor(10) + 5)).toMatchObject({ level: 10, current: 5 });
  });
});

describe('rollXp', () => {
  it('stays inside the range, inclusive', () => {
    expect(rollXp(15, 25, () => 0)).toBe(15);
    expect(rollXp(15, 25, () => 0.9999)).toBe(25);
    expect(rollXp(25, 15, () => 0)).toBe(15);
  });
});

describe('rewards', () => {
  const rewards = parseRewards([
    { level: 10, roleId: '222222222222222222' },
    { level: 5, roleId: '111111111111111111' },
    { level: 0, roleId: '333333333333333333' },
    { level: 3, roleId: 'not-a-role' },
    null,
  ]);
  it('drops malformed entries and sorts by level', () => {
    expect(rewards.map((r) => r.level)).toEqual([5, 10]);
  });
  it('gives every role at or below the level', () => {
    expect(rewardRolesFor(4, rewards)).toEqual([]);
    expect(rewardRolesFor(10, rewards)).toEqual(['111111111111111111', '222222222222222222']);
  });
});

describe('fillLevelTemplate', () => {
  it('fills every placeholder', () => {
    expect(
      fillLevelTemplate('{user} ({username}) hit {level} in {server}', {
        user: '<@1>',
        username: 'Ana',
        level: 7,
        server: 'Lounge',
      }),
    ).toBe('<@1> (Ana) hit 7 in Lounge');
  });
});
