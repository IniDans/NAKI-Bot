import { DiscordLimits } from '../config/constants.js';

interface ParsedDuration {
  ms: number;
  human: string;
}

const DURATION_REGEX = /^(\d+)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$/i;

const UNIT_TO_MS: Record<string, number> = {
  s: 1000,
  sec: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
};

const UNIT_TO_HUMAN: Record<string, string> = {
  s: 'second(s)',
  sec: 'second(s)',
  second: 'second(s)',
  seconds: 'second(s)',
  m: 'minute(s)',
  min: 'minute(s)',
  minute: 'minute(s)',
  minutes: 'minute(s)',
  h: 'hour(s)',
  hr: 'hour(s)',
  hour: 'hour(s)',
  hours: 'hour(s)',
  d: 'day(s)',
  day: 'day(s)',
  days: 'day(s)',
  w: 'week(s)',
  week: 'week(s)',
  weeks: 'week(s)',
};

/**
 * Parse a human-friendly duration string (e.g., "10s", "5m", "1h", "7d", "2w")
 * into milliseconds.
 *
 * @throws {Error} if the format is invalid or the value is <= 0
 */
export function parseDuration(input: string): ParsedDuration {
  const trimmed = input.trim();
  const match = trimmed.match(DURATION_REGEX);

  if (!match) {
    throw new Error(
      `Invalid duration format: \`${trimmed}\`. Use formats like \`10s\`, \`5m\`, \`1h\`, \`1d\`, \`2w\`.`,
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (value <= 0) {
    throw new Error('Duration must be greater than 0.');
  }

  const ms = value * UNIT_TO_MS[unit];
  const human = `${value} ${UNIT_TO_HUMAN[unit]}`;

  return { ms, human };
}

/**
 * Validate a timeout duration against Discord's limit (28 days max).
 */
export function validateTimeoutDuration(ms: number): void {
  if (ms > DiscordLimits.TIMEOUT_MAX_MS) {
    throw new Error(
      `Timeout duration cannot exceed 28 days. The maximum is \`${DiscordLimits.TIMEOUT_MAX_MS / 1000}s\`.`,
    );
  }

  if (ms < 1000) {
    throw new Error('Timeout duration must be at least 1 second.');
  }
}

/**
 * Format milliseconds into a human-readable string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks} week(s)`;
  if (days > 0) return `${days} day(s)`;
  if (hours > 0) return `${hours} hour(s)`;
  if (minutes > 0) return `${minutes} minute(s)`;
  return `${seconds} second(s)`;
}
