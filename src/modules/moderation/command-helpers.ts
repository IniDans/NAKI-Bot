import type { ChatInputCommandInteraction, GuildMember, TextChannel } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { embedUtils } from '../../utils/embed.js';

/** Small helpers shared by the moderation slash commands. */

export async function replyProblem(interaction: ChatInputCommandInteraction, title: string, text: string): Promise<void> {
  await interaction.reply({ embeds: [embedUtils.error(title, text)], flags: MessageFlags.Ephemeral });
}

/** The member picked in the `member` option, or null after telling the moderator they are not in the server. */
export async function pickedMember(interaction: ChatInputCommandInteraction): Promise<GuildMember | null> {
  const member = interaction.options.getMember('member') as GuildMember | null;
  if (!member) await replyProblem(interaction, 'Member Not Found', 'That person is not in this server anymore.');
  return member;
}

/** The channel picked in the `channel` option, or the channel the command was used in. */
export function pickedChannel(interaction: ChatInputCommandInteraction): TextChannel {
  return (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel;
}

export const reasonOf = (interaction: ChatInputCommandInteraction) => interaction.options.getString('reason');
