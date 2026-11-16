/** Pure leveling helpers, kept free of Discord and database imports so they can be tested. */

export const DEFAULT_LEVEL_UP_MESSAGE = 'GG {user}, you reached **level {level}**!';
export const MAX_LEVEL = 500;

export interface LevelReward {
  level: number;
  roleId: string;
}

/** XP needed to go from `level` to `level + 1`. Grows gently: 100, 155, 220, 295, ... */
export function xpToNext(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

/** Total XP needed to reach `level` from zero. */
export function totalXpFor(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += xpToNext(l);
  return total;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  current: number;
  /** XP the current level takes in total. */
  needed: number;
}

export function progressFromXp(xp: number): LevelProgress {
  let level = 0;
  let rest = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, current: rest, needed: xpToNext(level) };
}

/** Random whole number between min and max, inclusive. `random` is injectable for tests. */
export function rollXp(min: number, max: number, random: () => number = Math.random): number {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(min, max);
  return lo + Math.floor(random() * (hi - lo + 1));
}

/** Rewards from stored JSON, dropping anything malformed. Sorted by level. */
export function parseRewards(value: unknown): LevelReward[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r): r is LevelReward =>
        typeof r === 'object' &&
        r !== null &&
        Number.isInteger((r as LevelReward).level) &&
        (r as LevelReward).level > 0 &&
        typeof (r as LevelReward).roleId === 'string' &&
        /^\d{17,20}$/.test((r as LevelReward).roleId),
    )
    .sort((a, b) => a.level - b.level);
}

/** Role ids a member at `level` should have from the reward list. */
export function rewardRolesFor(level: number, rewards: LevelReward[]): string[] {
  return [...new Set(rewards.filter((r) => r.level <= level).map((r) => r.roleId))];
}

export function fillLevelTemplate(
  template: string,
  values: { user: string; username: string; level: number; server: string },
): string {
  return template
    .replaceAll('{user}', values.user)
    .replaceAll('{username}', values.username)
    .replaceAll('{level}', String(values.level))
    .replaceAll('{server}', values.server)
    .slice(0, 2000);
}
