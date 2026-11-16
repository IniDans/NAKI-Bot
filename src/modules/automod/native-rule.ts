/** Pure mapping from BANNED_WORDS rules to one Discord keyword rule. Kept apart from native.ts so it tests without a database. */

const MAX_KEYWORDS = 1000;
const MAX_KEYWORD_LENGTH = 60;
const MAX_REGEX = 10;
const MAX_REGEX_LENGTH = 260;

export interface NativeRule {
  keywordFilter: string[];
  regexPatterns: string[];
  exemptRoles: string[];
  exemptChannels: string[];
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];

/**
 * Maps the bot's BANNED_WORDS rules onto one Discord keyword rule.
 * Discord matches a bare keyword as a whole word and `*word*` anywhere, which lines up with exact/contains.
 * Exemptions are the union of every rule's, since Discord's rule is shared.
 */
export function buildNativeRule(rules: { config: unknown }[]): NativeRule {
  const keywords = new Set<string>();
  const regex = new Set<string>();
  const roles = new Set<string>();
  const channels = new Set<string>();
  for (const { config } of rules) {
    const c = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
    if (c.match === 'regex') {
      if (typeof c.pattern === 'string' && c.pattern.length > 0 && c.pattern.length <= MAX_REGEX_LENGTH) regex.add(c.pattern);
    } else {
      for (const word of strings(c.words)) {
        const keyword = c.match === 'exact' ? word.toLowerCase() : `*${word.toLowerCase()}*`;
        if (keyword.length <= MAX_KEYWORD_LENGTH) keywords.add(keyword);
      }
    }
    strings(c.exemptRoles).forEach((id) => roles.add(id));
    strings(c.exemptChannels).forEach((id) => channels.add(id));
  }
  return {
    keywordFilter: [...keywords].slice(0, MAX_KEYWORDS),
    regexPatterns: [...regex].slice(0, MAX_REGEX),
    exemptRoles: [...roles].slice(0, 20),
    exemptChannels: [...channels].slice(0, 50),
  };
}
