import { GuildMember, PartialGuildMember, TextChannel } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { renderPlaceholders } from '../../utils/placeholders.js';
import { appLogger } from '../../utils/logger.js';

export const DEFAULT_LEAVE_MESSAGE = '**{username}** has left **{server}**. We now have {membercount} members.';

export function buildLeaveContent(member: GuildMember | PartialGuildMember, template = DEFAULT_LEAVE_MESSAGE): string {
  const user = member.user;
  return renderPlaceholders(template, {
    userId: member.id,
    username: user?.username ?? 'Unknown user',
    displayName: 'displayName' in member ? member.displayName : user?.displayName ?? user?.username ?? 'Unknown user',
    mention: '',
    serverName: member.guild.name,
    memberCount: member.guild.memberCount,
  });
}

export const leaveModule = {
  async handleMemberLeave(member: GuildMember | PartialGuildMember): Promise<boolean> {
    const config = await guildService.getLeaveConfig(member.guild.id);
    if (!config.enabled || !config.channelId) return false;

    const channel = member.guild.channels.cache.get(config.channelId);
    if (!(channel instanceof TextChannel)) {
      appLogger.warn('Configured leave channel is unavailable', 'Leave', {
        guildId: member.guild.id,
        channelId: config.channelId,
      });
      return false;
    }

    await channel.send({
      content: buildLeaveContent(member, config.message ?? DEFAULT_LEAVE_MESSAGE),
      allowedMentions: { parse: [] },
    });
    return true;
  },
};
