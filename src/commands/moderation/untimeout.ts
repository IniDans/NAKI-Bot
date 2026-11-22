import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedMember, reasonOf } from '../../modules/moderation/command-helpers.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('End a timeout early so they can chat again')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('member').setDescription('Whose timeout to end').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why (optional)').setMaxLength(500)),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    const member = await pickedMember(interaction);
    if (member) await moderationModule.untimeout(interaction, member, reasonOf(interaction));
  },
};
export default command;
