import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { Colors } from '../../config/constants.js';
import { formatDuration, progressBar, type LoopMode, type Track } from './logic.js';

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
    .setFooter({ text: `${LOOP_LABEL[state.loop]} · ${state.queue.length} in queue · ${track.source === 'spotify' ? 'Spotify → YouTube audio' : 'YouTube'}` });
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

export function queueEmbed(state: PanelState, page = 1): EmbedBuilder {
  const pages = Math.max(1, Math.ceil(state.queue.length / QUEUE_PAGE));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * QUEUE_PAGE;
  const rows = state.queue.slice(start, start + QUEUE_PAGE).map((t, i) => `\`${start + i + 1}.\` ${trackLine(t)}`);
  const total = state.queue.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  return new EmbedBuilder()
    .setColor(Colors.INFO)
    .setTitle('📜 Queue')
    .setDescription(
      [
        `**Now:** ${state.current ? trackLine(state.current) : 'nothing'}`,
        '',
        rows.length ? rows.join('\n') : '*The queue is empty.*',
      ].join('\n'),
    )
    .setFooter({ text: `Page ${p}/${pages} · ${state.queue.length} songs · ${formatDuration(total)} · ${LOOP_LABEL[state.loop]}` });
}
