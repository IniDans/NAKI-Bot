import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { modmailModule } from '../../modules/modmail/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('modmail')
    .setDescription('Private conversations between members and moderators')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) => sub.setName('close').setDescription('Close this conversation (use it inside the modmail thread)')),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',

  async execute(interaction: ChatInputCommandInteraction) {
    const thread = interaction.channel;
    if (!thread?.isThread()) {
      await interaction.reply({
        embeds: [embedUtils.error('Wrong Channel', 'Run this inside a modmail thread.')],
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const closed = await modmailModule.close(thread, interaction.user.id);
    await interaction.editReply({
      embeds: [
        closed
          ? embedUtils.success('Closed', 'The user was told the conversation is closed.')
          : embedUtils.error('Not Open', 'This thread is not an open modmail conversation.'),
      ],
    });
  },
};

export default command;
