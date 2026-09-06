import { EmbedBuilder, TextChannel, Client } from 'discord.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { guildService } from '../../services/database/guild.service.js';
import { appLogger } from '../../utils/logger.js';
import type { LogEmbedData } from '../../types/index.js';

/**
 * Logger module — handles sending structured log embeds to configured log channels.
 * This is the Discord channel logger, not the application logger.
 */
export const logModule = {
  /**
   * Send a log embed to the appropriate log channel for the category.
   * Non-blocking — errors are caught and logged, never thrown to callers.
   */
  async sendLog(
    client: Client,
    guildId: string,
    category: LogCategory,
    embedData: LogEmbedData,
  ): Promise<void> {
    try {
      const logConfig = await guildService.getLogConfig(guildId);
      const guildConfig = await guildService.getGuildConfig(guildId);

      // Check if logging is enabled
      if (!guildConfig.loggingEnabled) return;

      // Get the channel ID for this category
      const channelId = getChannelForCategory(logConfig, category);
      if (!channelId) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        appLogger.warn(`Log channel ${channelId} not found or not text channel`, 'LogModule', {
          guildId,
          category,
        });
        return;
      }

      const embed = buildLogEmbed(embedData);
      await channel.send({ embeds: [embed] });
    } catch (error) {
      // Logging must never block or crash — swallow and log internally
      appLogger.error('Failed to send log embed', 'LogModule', {
        error: error instanceof Error ? error.message : String(error),
        guildId,
        category,
      });
    }
  },

  /**
   * Send a test log embed to verify the configuration.
   */
  async sendTestLog(
    client: Client,
    guildId: string,
    category: LogCategory,
  ): Promise<boolean> {
    try {
      const logConfig = await guildService.getLogConfig(guildId);
      const channelId = getChannelForCategory(logConfig, category);

      if (!channelId) return false;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return false;

      const channel = guild.channels.cache.get(channelId);
      if (!channel || !(channel instanceof TextChannel)) return false;

      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('🧪 Test Log')
        .setDescription(`This is a test log for the **${category}** category.`)
        .addFields(
          { name: 'Category', value: category, inline: true },
          { name: 'Channel', value: `<#${channelId}>`, inline: true },
          { name: 'Status', value: '✅ Working', inline: true },
        )
        .setTimestamp()
        .setFooter({ text: `Guild: ${guild.name}` });

      await channel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      appLogger.error('Failed to send test log', 'LogModule', {
        error: error instanceof Error ? error.message : String(error),
        guildId,
        category,
      });
      return false;
    }
  },
};

/**
 * Build a structured log embed from LogEmbedData.
 */
function buildLogEmbed(data: LogEmbedData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(data.color ?? Colors.DEFAULT)
    .setTitle(`📋 ${data.eventType}`)
    .setTimestamp();

  // Description with action
  const descParts: string[] = [];
  descParts.push(`**Action:** ${data.action}`);

  if (data.user) {
    descParts.push(`**User:** ${data.user.tag ?? data.user.displayName ?? 'Unknown'} (<@${data.user.id}>)`);
  }

  if (data.target) {
    const targetLabel = data.target.tag ?? data.target.displayName ?? data.target.name ?? 'Unknown';
    descParts.push(`**Target:** ${targetLabel} ${data.target.id ? `(<@${data.target.id}>)` : ''}`);
  }

  if (data.reason) {
    descParts.push(`**Reason:** ${data.reason}`);
  }

  embed.setDescription(descParts.join('\n'));

  // Relevant IDs
  if (data.relevantIds && Object.keys(data.relevantIds).length > 0) {
    const idLines = Object.entries(data.relevantIds)
      .map(([key, value]) => `**${key}:** \`${value}\``)
      .join('\n');

    embed.addFields({ name: '🔑 IDs', value: idLines, inline: false });
  }

  // Before/After changes
  if (data.before && Object.keys(data.before).length > 0) {
    const beforeLines = Object.entries(data.before)
      .map(([key, value]) => `**${key}:** ${formatValue(value)}`)
      .join('\n');

    embed.addFields({ name: '📌 Before', value: truncate(beforeLines, 1024), inline: true });
  }

  if (data.after && Object.keys(data.after).length > 0) {
    const afterLines = Object.entries(data.after)
      .map(([key, value]) => `**${key}:** ${formatValue(value)}`)
      .join('\n');

    embed.addFields({ name: '📝 After', value: truncate(afterLines, 1024), inline: true });
  }

  // Metadata
  if (data.metadata && Object.keys(data.metadata).length > 0) {
    const metaLines = Object.entries(data.metadata)
      .map(([key, value]) => `**${key}:** ${formatValue(value)}`)
      .join('\n');

    embed.addFields({ name: 'ℹ️ Details', value: truncate(metaLines, 1024), inline: false });
  }

  // Footer
  embed.setFooter({
    text: `Guild: ${data.guildName ?? data.guildId}`,
  });

  return embed;
}

/**
 * Map a log category to its configured channel ID.
 */
function getChannelForCategory(
  logConfig: { memberLogChannel: string | null; messageLogChannel: string | null; moderationLogChannel: string | null; channelLogChannel: string | null; roleLogChannel: string | null; serverLogChannel: string | null; securityLogChannel: string | null },
  category: LogCategory,
): string | null {
  switch (category) {
    case LogCategory.MEMBER:
      return logConfig.memberLogChannel;
    case LogCategory.MESSAGE:
      return logConfig.messageLogChannel;
    case LogCategory.MODERATION:
      return logConfig.moderationLogChannel;
    case LogCategory.CHANNEL:
      return logConfig.channelLogChannel;
    case LogCategory.ROLE:
      return logConfig.roleLogChannel;
    case LogCategory.SERVER:
      return logConfig.serverLogChannel;
    case LogCategory.SECURITY:
      return logConfig.securityLogChannel;
    default:
      return null;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '`None`';
  if (typeof value === 'string') return value || '`Empty`';
  if (typeof value === 'boolean') return value ? '`Yes`' : '`No`';
  return `\`${String(value)}\``;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
