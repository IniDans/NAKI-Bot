import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedMember, reasonOf } from '../../modules/moderation/command-helpers.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Remove someone from the server (they can join again with an invite)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('member').setDescription('Who to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why (they will see this)').setMaxLength(500)),
  requiredPermissions: [PermissionFlagsBits.KickMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    const member = await pickedMember(interaction);
    if (member) await moderationModule.kick(interaction, member, reasonOf(interaction));
  },
};
export default command;
