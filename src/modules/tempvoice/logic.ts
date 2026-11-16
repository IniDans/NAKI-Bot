/** Pure helpers for temporary voice rooms, kept free of Discord and database imports. */

export const DEFAULT_ROOM_NAME = "{user}'s room";
export const NAME_TEMPLATE_MAX = 90;
/** Discord's limit on voice channel user limits; 0 means no limit. */
export const MAX_USER_LIMIT = 99;
const NAME_MAX = 100;

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

/**
 * Who should own a room after its owner leaves: the first person still in it who is not a bot,
 * or null when only bots (or nobody) remain.
 */
export function nextOwner(members: { id: string; bot: boolean }[], leavingOwnerId: string): string | null {
  return members.find((m) => !m.bot && m.id !== leavingOwnerId)?.id ?? null;
}
