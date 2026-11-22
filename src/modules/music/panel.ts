import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { Colors } from '../../config/constants.js';
import { formatDuration, MAX_QUEUE_SIZE, progressBar, type LoopMode, type Track } from './logic.js';

/** Embeds and buttons for the now-playing message. Button ids are `music:<action>`. */

const LOOP_LABEL: Record<LoopMode, string> = { off: 'Loop: Off', track: 'Loop: Song', queue: 'Loop: Queue' };
const QUEUE_PAGE = 10;

export interface PanelState {
  current: Track | null;
  queue: Track[];
  loop: LoopMode;
  paused: boolean;
  elapsedSec: number;
}

const escape = (text: string) => text.replace(/([\\*_`~|[\]])/g, '\\$1');

export function trackLine(track: Track): string {
  const title = escape(track.title.slice(0, 90));
  return `[${title}](${track.url}) · ${escape(track.author.slice(0, 40)) || 'Unknown'} · \`${formatDuration(track.durationSec)}\``;
}

export function nowPlayingEmbed(state: PanelState, withProgress = false): EmbedBuilder {
  const track = state.current;
  if (!track) {
    return new EmbedBuilder().setColor(Colors.LEAVE).setTitle('⏹️ Nothing playing').setDescription('Use `/play` to start some music.');
  }
  const lines = [`**[${escape(track.title.slice(0, 200))}](${track.url})**`, escape(track.author) || 'Unknown'];
  if (withProgress && track.durationSec) {
    lines.push('', `${progressBar(state.elapsedSec, track.durationSec)}`, `\`${formatDuration(state.elapsedSec)} / ${formatDuration(track.durationSec)}\``);
  }
  const embed = new EmbedBuilder()
    .setColor(track.source === 'spotify' ? 0x1db954 : 0xff0033)
    .setTitle(state.paused ? '⏸️ Paused' : '🎶 Now Playing')
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Length', value: formatDuration(track.durationSec), inline: true },
      { name: 'Requested by', value: `<@${track.requestedBy}>`, inline: true },
      { name: 'Up next', value: state.queue[0] ? escape(state.queue[0].title.slice(0, 60)) : 'Nothing', inline: true },
    )
    .setFooter({ text: `${LOOP_LABEL[state.loop]} · ${state.queue.length} in queue · /play to add more · /queue to manage` });
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
}

export function controls(state: PanelState): ActionRowBuilder<ButtonBuilder>[] {
  const button = (action: string, label: string, emoji: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`music:${action}`).setLabel(label).setEmoji(emoji).setStyle(style);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      state.paused ? button('pause', 'Resume', '▶️', ButtonStyle.Success) : button('pause', 'Pause', '⏸️', ButtonStyle.Primary),
      button('skip', 'Skip', '⏭️'),
      button('stop', 'Stop', '⏹️', ButtonStyle.Danger),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button('loop', LOOP_LABEL[state.loop], '🔁', state.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
      button('shuffle', 'Shuffle', '🔀'),
      button('queue', 'Queue', '📜'),
    ),
  ];
}

export function pageCount(state: PanelState): number {
  return Math.max(1, Math.ceil(state.queue.length / QUEUE_PAGE));
}

const clampPage = (state: PanelState, page: number) => Math.min(Math.max(1, page), pageCount(state));

export function queueEmbed(state: PanelState, page = 1): EmbedBuilder {
  const p = clampPage(state, page);
  const start = (p - 1) * QUEUE_PAGE;
  const rows = state.queue.slice(start, start + QUEUE_PAGE).map((t, i) => `\`${start + i + 1}.\` ${trackLine(t)}`);
  const total = state.queue.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  const now = state.current;
  const progress =
    now?.durationSec ? `\n${progressBar(state.elapsedSec, now.durationSec)} \`${formatDuration(state.elapsedSec)} / ${formatDuration(now.durationSec)}\`` : '';
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle('📜 Queue')
    .setDescription(
      [
        `${state.paused ? '⏸️' : '🎶'} **Now playing:** ${now ? trackLine(now) : 'nothing'}${progress}`,
        '',
        '**Up next**',
        rows.length ? rows.join('\n') : '*Nothing yet. Add songs with `/play`.*',
      ].join('\n'),
    )
    .setFooter({
      text: `Page ${p}/${pageCount(state)} · ${state.queue.length}/${MAX_QUEUE_SIZE} songs · ${formatDuration(total)} · ${LOOP_LABEL[state.loop]}`,
    });
}

/** Buttons under the queue: pages, shuffle, loop, clear, and a menu to remove a song. Ids are `music:q<action>:<page>`. */
export function queueControls(state: PanelState, page = 1): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  const p = clampPage(state, page);
  const button = (id: string, label: string, emoji: string, style = ButtonStyle.Secondary) =>
    new ButtonBuilder().setCustomId(`music:${id}`).setLabel(label).setEmoji(emoji).setStyle(style);
  const empty = state.queue.length === 0;
  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(`qpage:${p - 1}`, 'Back', '◀️').setDisabled(p <= 1),
      button(`qpage:${p + 1}`, 'Next', '▶️').setDisabled(p >= pageCount(state)),
      button(`qshuffle:${p}`, 'Shuffle', '🔀').setDisabled(state.queue.length < 2),
      button(`qloop:${p}`, LOOP_LABEL[state.loop], '🔁', state.loop === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
      button(`qclear:${p}`, 'Clear', '🗑️', ButtonStyle.Danger).setDisabled(empty),
    ),
  ];
  const start = (p - 1) * QUEUE_PAGE;
  const onPage = state.queue.slice(start, start + QUEUE_PAGE);
  if (onPage.length) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`music:qremove:${p}`)
          .setPlaceholder('Remove a song from the queue…')
          .addOptions(
            onPage.map((t, i) => ({
              label: `${start + i + 1}. ${t.title}`.slice(0, 100),
              description: t.author.slice(0, 100) || undefined,
              value: t.key ?? String(start + i),
            })),
          ),
      ),
    );
  }
  return rows;
}
