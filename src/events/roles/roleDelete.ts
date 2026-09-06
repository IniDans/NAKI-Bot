import { Events, Role, AuditLogEvent } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildRoleDelete,
  async execute(role: unknown) {
    const r = role as Role;
    const guild = r.guild;

    let executor: string | null = null;
    let executorId: string | null = null;
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.RoleDelete,
        limit: 1,
      });
      const entry = auditLogs.entries.first();
      if (entry && entry.target?.id === r.id && entry.createdTimestamp > Date.now() - 5000) {
        executor = entry.executor?.tag ?? null;
        executorId = entry.executor?.id ?? null;
      }
    } catch {
      // May not have audit log permissions
    }

    try {
      await logModule.sendLog(r.client, guild.id, LogCategory.ROLE, {
        eventType: 'Role Deleted',
        target: { id: r.id, name: r.name },
        action: 'Delete',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_DELETE,
        metadata: {
          'Color': r.hexColor,
          ...(executor ? { 'Deleted By': executor } : {}),
        },
        relevantIds: {
          'Role ID': r.id,
          ...(executorId ? { 'Executor ID': executorId } : {}),
        },
      });
    } catch (error) {
      appLogger.error('Failed to log role delete', 'RoleDelete', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }

    // Feed to anti-nuke
    try {
      const { antinukeModule } = await import('../../modules/antinuke/index.js');
      await antinukeModule.trackAction(r.client, guild.id, 'ROLE_DELETE', r.id);
    } catch (error) {
      appLogger.error('Anti-nuke handler failed', 'SecurityEvent', { guildId: guild.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
};

export default event;

