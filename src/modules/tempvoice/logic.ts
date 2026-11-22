/** Pure helpers for temporary voice rooms, kept free of Discord and database imports. */

export const DEFAULT_ROOM_NAME = "{user}'s room";
export const NAME_TEMPLATE_MAX = 90;
/** Discord's limit on voice channel user limits; 0 means no limit. */
export const MAX_USER_LIMIT = 99;
const NAME_MAX = 100;

// Permission bits used to read a room's state (values from Discord's permission flags).
const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const CONNECT = 1n << 20n;

/** "{user}'s room" -> "Dansyoung's room". {user} is the server nickname, {username} the account name. */
export function renderRoomName(template: string, member: { displayName: string; username: string }): string {
  const name = (template || DEFAULT_ROOM_NAME)
    .replace(/\{user\}/g, member.displayName)
    .replace(/\{username\}/g, member.username)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
  return name || `${member.displayName}'s room`.slice(0, NAME_MAX);
}

/** A room name typed by its owner, or null when nothing usable is left. */
export function cleanRoomName(input: string): string | null {
  const name = input.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return name || null;
}

/** "5" -> 5, "" or "0" -> 0 (no limit); null for anything outside 0-99. */
export function parseUserLimit(input: string): number | null {
  const text = input.trim();
  if (!text) return 0;
  if (!/^\d{1,2}$/.test(text)) return null;
  const limit = Number(text);
  return limit <= MAX_USER_LIMIT ? limit : null;
}

export interface OverwriteLike {
  id: string;
  /** 0 = role, 1 = member, as in Discord's API. */
  type: number;
  allow: bigint;
  deny: bigint;
}

export interface RoomState {
  locked: boolean;
  hidden: boolean;
  chatOff: boolean;
  /** Members given access by the owner (trust or invite). */
  trusted: string[];
  /** Members kicked out and kept out for the life of the room. */
  blocked: string[];
}

/** Read lock, visibility, chat and the trusted/blocked lists from a room's permission overwrites. */
export function roomState(overwrites: OverwriteLike[], everyoneId: string, ownerId: string, botId: string): RoomState {
  const everyone = overwrites.find((o) => o.id === everyoneId);
  const members = overwrites.filter((o) => o.type === 1 && o.id !== ownerId && o.id !== botId);
  return {
    locked: Boolean(everyone && everyone.deny & CONNECT),
    hidden: Boolean(everyone && everyone.deny & VIEW_CHANNEL),
    chatOff: Boolean(everyone && everyone.deny & SEND_MESSAGES),
    trusted: members.filter((o) => o.allow & CONNECT).map((o) => o.id),
    blocked: members.filter((o) => o.deny & CONNECT).map((o) => o.id),
  };
}

export type ClaimCheck = 'ok' | 'already-owner' | 'not-in-room' | 'owner-present';

/** A room can be claimed by someone in it, once its owner has left. */
export function checkClaim(input: { ownerId: string; claimerId: string; memberIds: string[] }): ClaimCheck {
  if (input.claimerId === input.ownerId) return 'already-owner';
  if (!input.memberIds.includes(input.claimerId)) return 'not-in-room';
  if (input.memberIds.includes(input.ownerId)) return 'owner-present';
  return 'ok';
}
