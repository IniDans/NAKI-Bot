import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedMember } from '../../modules/moderation/command-helpers.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Give someone a warning (saved in their history)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('member').setDescription('Who to warn').setRequired(true))
    .addStringOption((o) =>
      o.setName('reason').setDescription('What they did wrong').setRequired(true).setMaxLength(500),
    ),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    const member = await pickedMember(interaction);
    if (member) await moderationModule.warn(interaction, member, interaction.options.getString('reason', true));
  },
};
export default command;
