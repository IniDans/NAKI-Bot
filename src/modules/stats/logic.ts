/** Pure helpers for stats channels, kept free of Discord and database imports. */

export const STAT_KEYS = ['members', 'humans', 'bots', 'boosts', 'channels', 'roles'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatCounts = Partial<Record<StatKey, number>>;

/** Discord's limit on channel names. */
export const NAME_MAX = 100;

/** Keys a template uses, so the bot only does the work (like fetching members) that is needed. */
export function usedKeys(template: string): StatKey[] {
  return STAT_KEYS.filter((key) => template.includes(`{${key}}`));
}

/**
 * Channel name for a template, e.g. "Members: {members}" -> "Members: 1,234". A count that
 * is not known yet renders as "…" rather than a wrong number.
 */
export function renderStatName(template: string, counts: StatCounts): string {
  const name = template.replace(/\{(members|humans|bots|boosts|channels|roles)\}/g, (_, key: StatKey) => {
    const value = counts[key];
    return value === undefined ? '…' : value.toLocaleString('en-US');
  });
  return name.trim().slice(0, NAME_MAX);
}
