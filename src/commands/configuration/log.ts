import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { logModule } from '../../modules/logger/index.js';
import { embedUtils } from '../../utils/embed.js';
import { LogCategory } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const LOG_CATEGORIES = Object.values(LogCategory);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('log')
    .setDescription('Configure the logging system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Set the log channel for a category')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('The log category')
            .setRequired(true)
            .addChoices(
              ...LOG_CATEGORIES.map((c) => ({ name: c, value: c })),
            ),
        )
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setDescription('The channel to send logs to')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('Send a test log to verify configuration')
        .addStringOption((opt) =>
          opt
            .setName('category')
            .setDescription('The log category to test')
            .setRequired(true)
            .addChoices(
              ...LOG_CATEGORIES.map((c) => ({ name: c, value: c })),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('status').setDescription('Show all configured log channels'),
    ),

  requiredPermissions: [PermissionFlagsBits.Administrator],
  rateLimitCategory: 'ADMIN',
  guildOnly: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'config':
        await handleConfig(interaction);
        break;
      case 'test':
        await handleTest(interaction);
        break;
      case 'status':
        await handleStatus(interaction);
        break;
    }
  },
};

async function handleConfig(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString('category', true) as LogCategory;
  const channel = interaction.options.getChannel('channel', true);

  const fieldMap: Record<string, string> = {
    [LogCategory.MEMBER]: 'memberLogChannel',
    [LogCategory.MESSAGE]: 'messageLogChannel',
    [LogCategory.MODERATION]: 'moderationLogChannel',
    [LogCategory.CHANNEL]: 'channelLogChannel',
    [LogCategory.ROLE]: 'roleLogChannel',
    [LogCategory.SERVER]: 'serverLogChannel',
    [LogCategory.SECURITY]: 'securityLogChannel',
  };

  const field = fieldMap[category];
  if (!field) {
    await interaction.reply({
      embeds: [embedUtils.error('Invalid Category', `Unknown log category: ${category}`)],
      ephemeral: true,
    });
    return;
  }

  // Update log config
  await guildService.updateLogConfig(interaction.guildId!, { [field]: channel.id });

  // Also ensure logging is enabled
  await guildService.updateGuildConfig(interaction.guildId!, { loggingEnabled: true });

  await interaction.reply({
    embeds: [
      embedUtils.success(
        'Log Channel Updated',
        `**${category}** logs will now be sent to <#${channel.id}>.`,
      ),
    ],
    ephemeral: true,
  });
}

async function handleTest(interaction: ChatInputCommandInteraction) {
  const category = interaction.options.getString('category', true) as LogCategory;

  await interaction.deferReply({ ephemeral: true });

  const success = await logModule.sendTestLog(
    interaction.client,
    interaction.guildId!,
    category,
  );

  if (success) {
    await interaction.editReply({
      embeds: [
        embedUtils.success('Test Log Sent', `A test log for **${category}** was sent successfully.`),
      ],
    });
  } else {
    await interaction.editReply({
      embeds: [
        embedUtils.error(
          'Test Log Failed',
          `Could not send a test log for **${category}**. Make sure the channel is configured and I have permission to send messages there.`,
        ),
      ],
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  const logConfig = await guildService.getLogConfig(interaction.guildId!);
  const guildConfig = await guildService.getGuildConfig(interaction.guildId!);

  const channelMap: { category: string; channelId: string | null }[] = [
    { category: 'Member', channelId: logConfig.memberLogChannel },
    { category: 'Message', channelId: logConfig.messageLogChannel },
    { category: 'Moderation', channelId: logConfig.moderationLogChannel },
    { category: 'Channel', channelId: logConfig.channelLogChannel },
    { category: 'Role', channelId: logConfig.roleLogChannel },
    { category: 'Server', channelId: logConfig.serverLogChannel },
    { category: 'Security', channelId: logConfig.securityLogChannel },
  ];

  const lines = channelMap.map(({ category, channelId }) => {
    const status = channelId ? `<#${channelId}>` : '`Not configured`';
    return `**${category}:** ${status}`;
  });

  const embed = embedUtils.info(
    '📋 Log Configuration',
    `**Logging Enabled:** ${guildConfig.loggingEnabled ? '✅ Yes' : '❌ No'}\n\n${lines.join('\n')}`,
  );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export default command;
