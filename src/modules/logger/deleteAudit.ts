import { AuditLogEvent, PermissionFlagsBits, type Guild, type User } from 'discord.js';

/**
 * Works out who deleted a message from the audit log.
 *
 * Discord only writes a MessageDelete entry when someone deletes another user's message,
 * and it merges repeat deletes (same moderator, same author, same channel, within a few
 * minutes) into the existing entry by raising `extra.count`. So a delete is attributed to
 * an entry that is either brand new or whose count went up since we last looked.
 */

export type DeleteActor =
  | { kind: 'moderator'; user: User }
  | { kind: 'author' } // no audit entry: Discord doesn't log people deleting their own messages
  | { kind: 'unknown'; reason: string };

export interface AuditEntryLike {
  id: string;
  targetId: string | null;
  channelId: string | null;
  count: number;
  createdTimestamp: number;
}

const AUDIT_DELAY_MS = 1500; // the entry shows up shortly after the delete event
const FRESH_ENTRY_MS = 20_000;
const MAX_TRACKED = 1000;

/** Per audit entry, how many of its deletes have already been attributed. */
const consumed = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();

/**
 * Pick the entry that accounts for this delete and record it as used. Pure apart from the
 * `used` map, so it can be tested without Discord.
 */
export function matchDeleteEntry(
  entries: AuditEntryLike[],
  authorId: string,
  channelId: string,
  now: number,
  used: Map<string, number>,
): AuditEntryLike | null {
  let match: AuditEntryLike | null = null;
  for (const entry of entries) {
    const seen = used.get(entry.id);
    // First sighting of an old entry: its deletes happened before we were watching.
    const already = seen ?? (now - entry.createdTimestamp <= FRESH_ENTRY_MS ? 0 : entry.count);
    used.set(entry.id, already);
    if (match || entry.targetId !== authorId || entry.channelId !== channelId) continue;
    if (entry.count > already) {
      used.set(entry.id, already + 1);
      match = entry;
    }
  }
  while (used.size > MAX_TRACKED) used.delete(used.keys().next().value as string);
  return match;
}

async function lookup(guild: Guild, authorId: string, channelId: string): Promise<DeleteActor> {
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
    return { kind: 'unknown', reason: 'bot lacks the View Audit Log permission' };
  }
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 10 });
    const entries: AuditEntryLike[] = [...logs.entries.values()].map((entry) => ({
      id: entry.id,
      targetId: entry.targetId,
      channelId: entry.extra?.channel?.id ?? null,
      count: entry.extra?.count ?? 1,
      createdTimestamp: entry.createdTimestamp,
    }));
    const match = matchDeleteEntry(entries, authorId, channelId, Date.now(), consumed);
    if (!match) return { kind: 'author' };
    const executor = logs.entries.get(match.id)?.executor;
    if (!executor) return { kind: 'unknown', reason: 'audit entry has no executor' };
    return { kind: 'moderator', user: executor.partial ? await executor.fetch() : executor };
  } catch {
    return { kind: 'unknown', reason: 'could not read the audit log' };
  }
}

/** Lookups run one at a time per guild so two quick deletes can't claim the same count. */
export function findMessageDeleter(guild: Guild, authorId: string, channelId: string): Promise<DeleteActor> {
  const previous = queues.get(guild.id) ?? Promise.resolve();
  // Wait for the entry to appear, in parallel with any lookup already queued.
  const delay = new Promise((resolve) => setTimeout(resolve, AUDIT_DELAY_MS));
  const next = Promise.all([previous, delay]).then(() => lookup(guild, authorId, channelId));
  const settled = next.catch(() => undefined);
  queues.set(guild.id, settled);
  settled.then(() => {
    if (queues.get(guild.id) === settled) queues.delete(guild.id);
  });
  return next;
}
