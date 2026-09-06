import { Events, GuildMember } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildMemberRemove,
  async execute(member: unknown) {
    const m = member as GuildMember;
    if (m.user?.bot) return;
    const guild = m.guild;
    await logModule.sendLog(m.client, guild.id, LogCategory.MEMBER, {
      eventType: 'Member Left', target: { id: m.id, tag: m.user?.tag }, action: 'Leave', guildId: guild.id, guildName: guild.name, color: Colors.LOG_DELETE,
      metadata: { Roles: m.roles?.cache.filter((role) => role.id !== guild.id).map((role) => role.name).join(', ') || 'None', 'Member Count': guild.memberCount }, relevantIds: { 'User ID': m.id },
    });
    try {
      const { leaveModule } = await import('../../modules/leave/index.js');
      await leaveModule.handleMemberLeave(m);
    } catch { /* leave message failures are isolated from the gateway event */ }
    try {
      const { antinukeModule } = await import('../../modules/antinuke/index.js');
      await antinukeModule.trackAction(m.client, guild.id, 'MEMBER_KICK', m.id);
    } catch { /* audit log may be unavailable */ }
  },
};
export default event;
