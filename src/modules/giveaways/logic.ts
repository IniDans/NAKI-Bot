/**
 * Pure giveaway helpers. The dashboard (PORTO src/lib/giveaways.ts) builds the same message,
 * so keep the two in step when changing the text or layout.
 */

export const GIVEAWAY_COLOR = 0xbe9c6f;
export const MIN_DURATION_MS = 60_000;
export const MAX_DURATION_MS = 30 * 24 * 60 * 60_000;
export const MAX_WINNERS = 20;
export const PRIZE_MAX = 200;

const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** "1d 12h", "90m", "2w" -> milliseconds, or null when the text is not a duration. */
export function parseDuration(text: string): number | null {
  const parts = text
    .toLowerCase()
    .replace(/\s+/g, '')
    .match(/\d+[smhdw]/g);
  if (!parts || parts.join('') !== text.toLowerCase().replace(/\s+/g, '')) return null;
  return parts.reduce((total, part) => total + Number(part.slice(0, -1)) * UNIT_MS[part.slice(-1)], 0);
}

/**
 * Up to `count` distinct winners, drawn uniformly at random. `random` is injectable for tests.
 * Partial Fisher-Yates so large entry lists are not fully shuffled.
 */
export function pickWinners<T>(entries: readonly T[], count: number, random: () => number = Math.random): T[] {
  const pool = [...entries];
  const take = Math.min(count, pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}

export interface GiveawayView {
  id: string;
  prize: string;
  hostId: string;
  winnerCount: number;
  endsAt: Date;
  entries: number;
  ended: boolean;
  winners: string[];
}

const unix = (date: Date) => Math.floor(date.getTime() / 1000);

/** Embed and button as plain Discord API JSON, shared by the bot and the dashboard. */
export function giveawayMessage(view: GiveawayView) {
  const lines = view.ended
    ? [
        view.winners.length > 0
          ? `Winner${view.winners.length > 1 ? 's' : ''}: ${view.winners.map((id) => `<@${id}>`).join(', ')}`
          : 'No valid entries, so there is no winner.',
        `Ended <t:${unix(view.endsAt)}:R>`,
        `Hosted by <@${view.hostId}>`,
        `Entries: ${view.entries}`,
      ]
    : [
        'Click the button below to enter.',
        `Ends <t:${unix(view.endsAt)}:R> (<t:${unix(view.endsAt)}:f>)`,
        `Hosted by <@${view.hostId}>`,
        `Winners: ${view.winnerCount} · Entries: ${view.entries}`,
      ];
  return {
    embeds: [
      {
        title: view.prize,
        description: lines.join('\n'),
        color: GIVEAWAY_COLOR,
        footer: { text: view.ended ? 'Giveaway ended' : 'Giveaway' },
        timestamp: view.endsAt.toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: view.ended ? 2 : 1,
            label: view.ended ? 'Ended' : 'Enter',
            custom_id: `giveaway:enter:${view.id}`,
            disabled: view.ended,
          },
        ],
      },
    ],
  };
}

export function winnerAnnouncement(prize: string, winners: string[]): string {
  if (winners.length === 0) return `The giveaway for **${prize}** ended without any valid entries.`;
  return `Congratulations ${winners.map((id) => `<@${id}>`).join(', ')}! You won **${prize}**.`;
}
