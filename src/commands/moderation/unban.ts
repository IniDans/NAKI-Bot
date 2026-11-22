import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { reasonOf, replyProblem } from '../../modules/moderation/command-helpers.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Let a banned person join the server again')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((o) =>
      o.setName('user_id').setDescription('Their Discord user ID (shown in the ban log)').setRequired(true),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Why (optional)').setMaxLength(500)),
  requiredPermissions: [PermissionFlagsBits.BanMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    const userId = interaction.options.getString('user_id', true).trim().replace(/^<@!?(\d+)>$/, '$1');
    if (!/^\d{17,20}$/.test(userId)) {
      return replyProblem(
        interaction,
        'Invalid User ID',
        'A user ID is a long number like `123456789012345678`. Turn on Developer Mode in Discord settings, then right-click the person and choose **Copy User ID**.',
      );
    }
    await moderationModule.unban(interaction, userId, reasonOf(interaction));
  },
};
export default command;
