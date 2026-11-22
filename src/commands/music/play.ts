import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { musicModule } from '../../modules/music/index.js';
import { memberOf, replyError } from '../../modules/music/commands.js';
import { formatDuration } from '../../modules/music/logic.js';
import { MusicError, resolve, type Resolved } from '../../modules/music/sources.js';
import { MAX_QUEUE } from '../../modules/music/player.js';
import { embedUtils } from '../../utils/embed.js';
import { appLogger } from '../../utils/logger.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song from a YouTube or Spotify link, or search by title')
    .addStringOption((o) =>
      o.setName('query').setDescription('YouTube/Spotify link (song, playlist, album) or a song title').setRequired(true).setMaxLength(300),
    )
    .addBooleanOption((o) => o.setName('next').setDescription('Play it right after the current song')),
  rateLimitCategory: 'DEFAULT',
  guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const member = memberOf(interaction);
    const problem = musicModule.joinProblem(member);
    if (problem) return replyError(interaction, problem);
    const textChannel = interaction.channel;
    if (!textChannel || textChannel.isDMBased()) return replyError(interaction, 'Use this in a server channel.');

    await interaction.deferReply();
    const query = interaction.options.getString('query', true);
    let resolved: Resolved;
    try {
      resolved = await resolve(query, interaction.user.id);
    } catch (error) {
      if (!(error instanceof MusicError)) throw error;
      appLogger.info('Music lookup failed', 'Music', { guildId: interaction.guildId, query, error: error.message });
      return replyError(interaction, error.message);
    }

    // The search can take a few seconds; check again in case they left the channel meanwhile.
    const late = musicModule.joinProblem(member);
    if (late) return replyError(interaction, late);
    let session;
    try {
      session = await musicModule.join(member, textChannel);
    } catch (error) {
      appLogger.warn('Could not join voice', 'Music', {
        guildId: interaction.guildId,
        error: error instanceof Error ? error.message : String(error),
      });
      return replyError(interaction, 'I could not connect to your voice channel. Try again in a moment.');
    }

    const wasIdle = !session.current;
    const next = interaction.options.getBoolean('next') ?? false;
    const added = session.add(resolved.tracks, next);
    if (added === 0) return replyError(interaction, `The queue is full (${MAX_QUEUE} songs).`);

    const first = resolved.tracks[0];
    let embed;
    if (resolved.collection) {
      const skipped = resolved.tracks.length - added;
      embed = embedUtils.success(
        `Added ${added} songs`,
        `From **${resolved.collection}**.${skipped ? ` ${skipped} didn't fit in the queue.` : ''}${wasIdle ? '' : ` Starting at position ${next ? 1 : session.queue.length - added + 1}.`}`,
      );
    } else if (wasIdle) {
      embed = embedUtils.success('Starting', `**[${first.title}](${first.url})** · \`${formatDuration(first.durationSec)}\``);
    } else {
      const position = next ? 1 : session.queue.length;
      embed = embedUtils.success('Added to queue', `**[${first.title}](${first.url})** · \`${formatDuration(first.durationSec)}\`\nPosition **${position}**`);
    }
    if (first.thumbnail && !resolved.collection) embed.setThumbnail(first.thumbnail);
    await interaction.editReply({ embeds: [embed] });
  },
};
export default command;
