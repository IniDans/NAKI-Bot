import { type GuildMember, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete the latest messages in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('How many messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100),
    )
    .addUserOption((o) => o.setName('member').setDescription("Only delete this person's messages")),
  requiredPermissions: [PermissionFlagsBits.ManageMessages],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    const member = interaction.options.getMember('member') as GuildMember | null;
    await moderationModule.clear(interaction, interaction.options.getInteger('amount', true), member);
  },
};
export default command;
