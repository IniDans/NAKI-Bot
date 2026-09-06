import { describe, expect, it } from 'vitest';
import { parseDuration, validateTimeoutDuration, formatDuration } from '../utils/duration.js';
import { renderPlaceholders } from '../utils/placeholders.js';
import { validateAutoModRule } from '../modules/automod/validation.js';

describe('duration utilities', () => {
  it('parses supported units', () => {
    expect(parseDuration('5m').ms).toBe(300_000);
    expect(parseDuration('2w').ms).toBe(1_209_600_000);
    expect(formatDuration(3_600_000)).toBe('1 hour(s)');
  });
  it('rejects invalid and excessive timeout durations', () => {
    expect(() => parseDuration('0s')).toThrow();
    expect(() => parseDuration('abc')).toThrow();
    expect(() => validateTimeoutDuration(28 * 24 * 60 * 60 * 1000 + 1)).toThrow(/28 days/);
  });
});

describe('placeholder rendering', () => {
  it('renders supported tokens', () => {
    expect(renderPlaceholders('{mention} joined {server} #{membercount}', { userId: '1', username: 'alice', displayName: 'Alice', mention: '<@1>', serverName: 'NAKI', memberCount: 12 })).toBe('<@1> joined NAKI #12');
  });
});

describe('automod validation', () => {
  it('accepts a safe rule configuration', () => {
    expect(validateAutoModRule({ ruleType: 'BANNED_WORDS', action: 'DELETE', config: { words: ['spam'] } }).ruleType).toBe('BANNED_WORDS');
  });
  it('rejects unknown actions', () => {
    expect(() => validateAutoModRule({ ruleType: 'SPAM', action: 'EXECUTE', config: {} })).toThrow();
  });
});
