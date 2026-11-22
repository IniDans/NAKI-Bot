import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedChannel, reasonOf } from '../../modules/moderation/command-helpers.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Let members send messages in a locked channel again')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Which channel (default: this one)').addChannelTypes(ChannelType.GuildText),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Why (optional)').setMaxLength(500)),
  requiredPermissions: [PermissionFlagsBits.ManageChannels],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    await moderationModule.unlock(interaction, pickedChannel(interaction), reasonOf(interaction));
  },
};
export default command;
