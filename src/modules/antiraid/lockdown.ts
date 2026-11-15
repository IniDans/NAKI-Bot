import { PermissionFlagsBits } from 'discord.js';

/**
 * How @everyone's SendMessages looked on a channel before lockdown.
 * - allow:   explicit allow
 * - neutral: an @everyone overwrite existed but did not touch SendMessages
 * - absent:  no @everyone overwrite at all
 * Channels that already denied SendMessages are left out of the snapshot,
 * so lockdown neither changes nor "restores" them.
 */
export type SendState = 'allow' | 'neutral' | 'absent';
export type LockdownSnapshot = Record<string, SendState>;

interface BitsLike {
  bitfield: bigint;
  has(bit: bigint): boolean;
}
export interface OverwriteLike {
  allow: BitsLike;
  deny: BitsLike;
}

export type RestoreStep =
  | { kind: 'delete' }
  | { kind: 'edit'; sendMessages: true | null }
  | { kind: 'skip' };

const SEND = PermissionFlagsBits.SendMessages;

export function everyoneSendState(overwrite: OverwriteLike | undefined): SendState | 'deny' {
  if (!overwrite) return 'absent';
  if (overwrite.deny.has(SEND)) return 'deny';
  if (overwrite.allow.has(SEND)) return 'allow';
  return 'neutral';
}

/** Decide how to put a channel back to its pre-lockdown state, given its current overwrite. */
export function restoreStep(state: SendState, current: OverwriteLike | undefined): RestoreStep {
  if (state === 'allow') return { kind: 'edit', sendMessages: true };
  if (!current) return { kind: 'skip' };
  // The overwrite only exists because lockdown created it: remove it entirely.
  if (state === 'absent' && current.allow.bitfield === 0n && current.deny.bitfield === SEND) return { kind: 'delete' };
  return { kind: 'edit', sendMessages: null };
}

export function parseSnapshot(value: unknown): LockdownSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot: LockdownSnapshot = {};
  for (const [channelId, state] of Object.entries(value as Record<string, unknown>)) {
    if (state === 'allow' || state === 'neutral' || state === 'absent') snapshot[channelId] = state;
  }
  return snapshot;
}

const queues = new Map<string, Promise<unknown>>();

/** Run lockdown/unlock work for one guild at a time, so concurrent raid joins cannot snapshot a half-locked server. */
export function withGuildLock<T>(guildId: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(guildId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  queues.set(guildId, tail);
  void tail.then(() => {
    if (queues.get(guildId) === tail) queues.delete(guildId);
  });
  return run;
}
