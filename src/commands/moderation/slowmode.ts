import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedChannel } from '../../modules/moderation/command-helpers.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Make members wait between messages in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((o) =>
      o
        .setName('wait')
        .setDescription('How long each member waits between messages')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 0 },
          { name: '5 seconds', value: 5 },
          { name: '10 seconds', value: 10 },
          { name: '30 seconds', value: 30 },
          { name: '1 minute', value: 60 },
          { name: '5 minutes', value: 300 },
          { name: '15 minutes', value: 900 },
          { name: '1 hour', value: 3600 },
          { name: '6 hours', value: 21600 },
        ),
    )
    .addChannelOption((o) =>
      o.setName('channel').setDescription('Which channel (default: this one)').addChannelTypes(ChannelType.GuildText),
    ),
  requiredPermissions: [PermissionFlagsBits.ManageChannels],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    await moderationModule.slowmode(interaction, pickedChannel(interaction), interaction.options.getInteger('wait', true));
  },
};
export default command;
