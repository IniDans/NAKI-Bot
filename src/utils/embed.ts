import { EmbedBuilder } from 'discord.js';
import { Colors } from '../config/constants.js';

/**
 * Helper functions for building consistent embeds across the bot.
 */
export const embedUtils = {
  success(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(Colors.SUCCESS)
      .setTitle(`✅ ${title}`)
      .setTimestamp();

    if (description) embed.setDescription(description);
    return embed;
  },

  error(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle(`❌ ${title}`)
      .setTimestamp();

    if (description) embed.setDescription(description);
    return embed;
  },

  warning(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(Colors.WARNING)
      .setTitle(`⚠️ ${title}`)
      .setTimestamp();

    if (description) embed.setDescription(description);
    return embed;
  },

  info(title: string, description?: string): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(title)
      .setTimestamp();

    if (description) embed.setDescription(description);
    return embed;
  },

  /** Build a moderation action embed */
  moderation(
    action: string,
    color: number,
    fields: { name: string; value: string; inline?: boolean }[],
  ): EmbedBuilder {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`🔨 ${action}`)
      .addFields(fields)
      .setTimestamp();
  },

  /** Build a DM notification embed for moderation actions */
  dmNotification(
    guildName: string,
    action: string,
    reason: string | null,
    duration?: string | null,
  ): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(Colors.WARNING)
      .setTitle(`Moderation Action — ${guildName}`)
      .addFields(
        { name: 'Action', value: action, inline: true },
        { name: 'Reason', value: reason || 'No reason provided', inline: true },
      )
      .setTimestamp();

    if (duration) {
      embed.addFields({ name: 'Duration', value: duration, inline: true });
    }

    return embed;
  },
};
