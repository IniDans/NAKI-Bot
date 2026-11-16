/** Pure rules for auto-responders and scheduled messages, kept free of Discord and database imports. */

export const MATCH_TYPES = ['EXACT', 'CONTAINS', 'STARTS_WITH'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export interface ResponderRule {
  id: string;
  trigger: string;
  matchType: string;
  response: string;
  enabled: boolean;
}

/** Lowercase with whitespace collapsed, so "Hello   there" and "hello there" compare equal. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * EXACT compares the whole message, STARTS_WITH the beginning, CONTAINS looks for the
 * trigger as whole words, so a trigger "hi" does not fire on "this".
 */
export function matchesTrigger(content: string, trigger: string, matchType: string): boolean {
  const text = normalize(content);
  const needle = normalize(trigger);
  if (!needle || !text) return false;
  switch (matchType) {
    case 'EXACT':
      return text === needle;
    case 'STARTS_WITH':
      return text.startsWith(needle);
    default:
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(needle)}($|[^\\p{L}\\p{N}])`, 'u').test(text);
  }
}

/** First enabled rule that matches; rules are expected in their configured order. */
export function findResponder<T extends ResponderRule>(rules: T[], content: string): T | null {
  return rules.find((r) => r.enabled && matchesTrigger(content, r.trigger, r.matchType)) ?? null;
}

export interface TemplateVars {
  mention: string;
  user: string;
  server: string;
  channel: string;
}

/** Fills {mention}, {user}, {server} and {channel}; other braces are left as typed. */
export function fillTemplate(template: string, vars: TemplateVars): string {
  return template
    .split('{mention}')
    .join(vars.mention)
    .split('{user}')
    .join(vars.user)
    .split('{server}')
    .join(vars.server)
    .split('{channel}')
    .join(vars.channel);
}

/**
 * When a repeating message should run next. Runs missed while the bot was offline are
 * skipped rather than sent in a burst. Returns null for a one-off message.
 */
export function nextRunAfter(previous: Date, intervalMinutes: number | null, now: Date): Date | null {
  if (!intervalMinutes || intervalMinutes <= 0) return null;
  const step = intervalMinutes * 60_000;
  const behind = now.getTime() - previous.getTime();
  const steps = behind < 0 ? 1 : Math.floor(behind / step) + 1;
  return new Date(previous.getTime() + steps * step);
}
