import { Events, Role, AuditLogEvent } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildRoleCreate,
  async execute(role: unknown) {
    const r = role as Role;
    const guild = r.guild;

    let executor: string | null = null;
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.RoleCreate,
        limit: 1,
      });
      const entry = auditLogs.entries.first();
      if (entry && entry.target?.id === r.id && entry.createdTimestamp > Date.now() - 5000) {
        executor = entry.executor?.tag ?? null;
      }
    } catch {
      // May not have audit log permissions
    }

    try {
      await logModule.sendLog(r.client, guild.id, LogCategory.ROLE, {
        eventType: 'Role Created',
        target: { id: r.id, name: r.name },
        action: 'Create',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_CREATE,
        metadata: {
          'Color': r.hexColor,
          'Hoisted': r.hoist,
          'Mentionable': r.mentionable,
          ...(executor ? { 'Created By': executor } : {}),
        },
        relevantIds: { 'Role ID': r.id },
      });
    } catch (error) {
      appLogger.error('Failed to log role create', 'RoleCreate', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }

    // Feed to anti-nuke
    try {
      const { antinukeModule } = await import('../../modules/antinuke/index.js');
      await antinukeModule.trackAction(r.client, guild.id, 'ROLE_CREATE', r.id);
    } catch (error) {
      appLogger.error('Anti-nuke handler failed', 'SecurityEvent', { guildId: guild.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
};

export default event;

