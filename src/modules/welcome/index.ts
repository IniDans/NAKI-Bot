import { EmbedBuilder, GuildMember, TextChannel } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { renderPlaceholders } from '../../utils/placeholders.js';
import { appLogger } from '../../utils/logger.js';
import { Colors } from '../../config/constants.js';

export const DEFAULT_WELCOME_MESSAGE = 'Welcome {mention} to **{server}**! You are member #{membercount}.';

export function buildWelcomeContent(member: GuildMember, template = DEFAULT_WELCOME_MESSAGE): string {
  return renderPlaceholders(template, {
    userId: member.id,
    username: member.user.username,
    displayName: member.displayName,
    mention: `<@${member.id}>`,
    serverName: member.guild.name,
    memberCount: member.guild.memberCount,
  });
}

export const welcomeModule = {
  async sendPreview(member: GuildMember, channel: TextChannel, message: string): Promise<void> {
    await channel.send({ content: buildWelcomeContent(member, message), allowedMentions: { users: [member.id], roles: [], repliedUser: false } });
  },

  async handleMemberJoin(member: GuildMember): Promise<boolean> {
    const config = await guildService.getWelcomeConfig(member.guild.id);
    if (!config.enabled || !config.channelId) return false;

    const channel = member.guild.channels.cache.get(config.channelId);
    if (!(channel instanceof TextChannel)) {
      appLogger.warn('Configured welcome channel is unavailable', 'Welcome', {
        guildId: member.guild.id,
        channelId: config.channelId,
      });
      return false;
    }

    const content = buildWelcomeContent(member, config.message ?? DEFAULT_WELCOME_MESSAGE);
    const payload: { content?: string; embeds?: EmbedBuilder[]; allowedMentions: { users: string[]; roles: never[]; repliedUser: false } } = {
      allowedMentions: { users: [member.id], roles: [], repliedUser: false },
    };

    if (config.embedData && typeof config.embedData === 'object') {
      try {
        const raw = config.embedData as Record<string, unknown>;
        const embed = new EmbedBuilder(raw)
          .setDescription(buildWelcomeContent(member, String(raw.description ?? content)))
          .setColor(config.color ?? Colors.WELCOME);
        if (config.imageUrl) embed.setImage(config.imageUrl);
        payload.embeds = [embed];
      } catch (error) {
        appLogger.warn('Invalid welcome embed; falling back to text', 'Welcome', {
          guildId: member.guild.id,
          error: error instanceof Error ? error.message : String(error),
        });
        payload.content = content;
      }
    } else {
      payload.content = content;
    }

    await channel.send(payload);
    return true;
  },
};

