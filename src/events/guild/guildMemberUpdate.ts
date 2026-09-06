import { Events, GuildMember, PartialGuildMember } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember: unknown, newMember: unknown) {
    const oldM = oldMember as GuildMember | PartialGuildMember;
    const newM = newMember as GuildMember;
    if (newM.user.bot) return;
    const guild = newM.guild;

    if (oldM.nickname !== newM.nickname) {
      try {
        await logModule.sendLog(newM.client, guild.id, LogCategory.MEMBER, {
          eventType: 'Nickname Changed', target: { id: newM.id, tag: newM.user.tag }, action: 'Nickname Update', guildId: guild.id, guildName: guild.name, color: Colors.LOG_UPDATE,
          before: { nickname: oldM.nickname ?? 'None' }, after: { nickname: newM.nickname ?? 'None' }, relevantIds: { 'User ID': newM.id },
        });
      } catch (error) {
        appLogger.error('Failed to log nickname change', 'GuildMemberUpdate', { error: error instanceof Error ? error.message : String(error), guildId: guild.id });
      }
    }

    if (!oldM.communicationDisabledUntilTimestamp && newM.communicationDisabledUntilTimestamp) {
      try {
        const { antinukeModule } = await import('../../modules/antinuke/index.js');
        await antinukeModule.trackAction(newM.client, guild.id, 'MEMBER_TIMEOUT', newM.id);
      } catch (error) {
        appLogger.error('Failed to feed timeout to anti-nuke', 'GuildMemberUpdate', { error: error instanceof Error ? error.message : String(error), guildId: guild.id });
      }
    }

    const oldRoles = oldM.roles?.cache;
    const newRoles = newM.roles.cache;
    if (!oldRoles) return;
    const addedRoles = newRoles.filter((role) => !oldRoles.has(role.id) && role.id !== guild.id);
    for (const [, role] of addedRoles) {
      await logModule.sendLog(newM.client, guild.id, LogCategory.MEMBER, { eventType: 'Role Added to Member', target: { id: newM.id, tag: newM.user.tag }, action: 'Role Add', guildId: guild.id, guildName: guild.name, color: Colors.LOG_CREATE, metadata: { role: role.name }, relevantIds: { 'User ID': newM.id, 'Role ID': role.id } });
    }
    const removedRoles = oldRoles.filter((role) => !newRoles.has(role.id) && role.id !== guild.id);
    for (const [, role] of removedRoles) {
      await logModule.sendLog(newM.client, guild.id, LogCategory.MEMBER, { eventType: 'Role Removed from Member', target: { id: newM.id, tag: newM.user.tag }, action: 'Role Remove', guildId: guild.id, guildName: guild.name, color: Colors.LOG_DELETE, metadata: { role: role.name }, relevantIds: { 'User ID': newM.id, 'Role ID': role.id } });
    }
  },
};
export default event;
