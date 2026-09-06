import { Events, GuildMember } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildMemberAdd,
  async execute(member: unknown) {
    const m = member as GuildMember;
    const guild = m.guild;
    const accountAgeDays = Math.floor((Date.now() - m.user.createdTimestamp) / 86_400_000);
    try {
      await logModule.sendLog(m.client, guild.id, LogCategory.MEMBER, {
        eventType: 'Member Joined', target: { id: m.id, tag: m.user.tag }, action: 'Join', guildId: guild.id, guildName: guild.name, color: Colors.LOG_CREATE,
        metadata: { 'Account Created': `<t:${Math.floor(m.user.createdTimestamp / 1000)}:R>`, 'Account Age': `${accountAgeDays} days`, 'Member Count': guild.memberCount, Bot: m.user.bot }, relevantIds: { 'User ID': m.id },
      });
    } catch (error) {
      appLogger.error('Failed to log member join', 'GuildMemberAdd', { guildId: guild.id, error: error instanceof Error ? error.message : String(error) });
    }
    if (!m.user.bot) {
      try {
        const { welcomeModule } = await import('../../modules/welcome/index.js');
        await welcomeModule.handleMemberJoin(m);
      } catch (error) {
        appLogger.error('Welcome handler failed', 'GuildMemberAdd', { guildId: guild.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    try {
      const { antiraidModule } = await import('../../modules/antiraid/index.js');
      await antiraidModule.handleMemberJoin(m);
    } catch (error) {
      appLogger.error('Anti-raid handler failed', 'GuildMemberAdd', { guildId: guild.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
};
export default event;
