/**
 * Guilds whose `updatedAt` moved since the last poll. The first poll (no `previous`)
 * only records a baseline; a guild that appears later counts as changed, because
 * its row was just created by a dashboard save.
 */
export function changedGuilds(
  previous: Map<string, number> | null,
  rows: { guildId: string; updatedAt: Date }[],
): { changed: string[]; next: Map<string, number> } {
  const next = new Map(rows.map((r) => [r.guildId, r.updatedAt.getTime()]));
  if (!previous) return { changed: [], next };
  const changed = [...next].filter(([guildId, at]) => previous.get(guildId) !== at).map(([guildId]) => guildId);
  return { changed, next };
}
