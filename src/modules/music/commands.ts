import { MessageFlags, type ChatInputCommandInteraction, type EmbedBuilder, type GuildMember } from 'discord.js';
import { embedUtils } from '../../utils/embed.js';
import { musicModule } from './index.js';
import type { GuildMusic } from './player.js';

/** Shared plumbing for the music slash commands. */

export const memberOf = (interaction: ChatInputCommandInteraction) => interaction.member as GuildMember;

export async function replyError(interaction: ChatInputCommandInteraction, text: string): Promise<void> {
  const payload = { embeds: [embedUtils.error('Music', text)] };
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

/** Runs a playback change for a member who is listening with the bot, then replies with its result. */
export async function withSession(
  interaction: ChatInputCommandInteraction,
  run: (session: GuildMusic) => EmbedBuilder | string,
): Promise<void> {
  const access = musicModule.control(memberOf(interaction));
  if (!access.ok) return replyError(interaction, access.reason);
  const result = run(access.session);
  await interaction.reply({ embeds: [typeof result === 'string' ? embedUtils.info('Music', result) : result] });
}
