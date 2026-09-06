import { Events, GuildChannel, AuditLogEvent } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.ChannelCreate,
  async execute(channel: unknown) {
    const ch = channel as GuildChannel;
    if (!ch.guild) return;

    const guild = ch.guild;

    // Try to get executor from audit logs
    let executor: string | null = null;
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelCreate,
        limit: 1,
      });
      const entry = auditLogs.entries.first();
      if (entry && entry.target?.id === ch.id && entry.createdTimestamp > Date.now() - 5000) {
        executor = entry.executor?.tag ?? null;
      }
    } catch {
      // May not have audit log permissions
    }

    try {
      await logModule.sendLog(ch.client, guild.id, LogCategory.CHANNEL, {
        eventType: 'Channel Created',
        target: { id: ch.id, name: ch.name },
        action: 'Create',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_CREATE,
        metadata: {
          'Type': ch.type.toString(),
          ...(executor ? { 'Created By': executor } : {}),
          ...(ch.parent ? { 'Category': ch.parent.name } : {}),
        },
        relevantIds: { 'Channel ID': ch.id },
      });
    } catch (error) {
      appLogger.error('Failed to log channel create', 'ChannelCreate', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }

    // Feed to anti-nuke
    try {
      const { antinukeModule } = await import('../../modules/antinuke/index.js');
      await antinukeModule.trackAction(ch.client, guild.id, 'CHANNEL_CREATE', ch.id);
    } catch (error) {
      appLogger.error('Anti-nuke handler failed', 'SecurityEvent', { guildId: guild.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
};

export default event;

