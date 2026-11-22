import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedChannel, reasonOf } from '../../modules/moderation/command-helpers.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Stop members from sending messages in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Which channel (default: this one)').addChannelTypes(ChannelType.GuildText),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Why (optional)').setMaxLength(500)),
  requiredPermissions: [PermissionFlagsBits.ManageChannels],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    await moderationModule.lock(interaction, pickedChannel(interaction), reasonOf(interaction));
  },
};
export default command;
