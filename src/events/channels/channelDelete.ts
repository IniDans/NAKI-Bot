import { Events, DMChannel, GuildChannel, AuditLogEvent } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.ChannelDelete,
  async execute(channel: unknown) {
    const ch = channel as DMChannel | GuildChannel;
    if (!('guild' in ch) || !ch.guild) return;

    const guild = ch.guild;

    // Try to get executor from audit logs
    let executor: string | null = null;
    let executorId: string | null = null;
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.ChannelDelete,
        limit: 1,
      });
      const entry = auditLogs.entries.first();
      if (entry && entry.target?.id === ch.id && entry.createdTimestamp > Date.now() - 5000) {
        executor = entry.executor?.tag ?? null;
        executorId = entry.executor?.id ?? null;
      }
    } catch {
      // May not have audit log permissions
    }

    try {
      await logModule.sendLog(ch.client, guild.id, LogCategory.CHANNEL, {
        eventType: 'Channel Deleted',
        target: { id: ch.id, name: ch.name },
        action: 'Delete',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_DELETE,
        metadata: {
          'Type': ch.type.toString(),
          ...(executor ? { 'Deleted By': executor } : {}),
          ...(ch.parent ? { 'Category': ch.parent.name } : {}),
        },
        relevantIds: {
          'Channel ID': ch.id,
          ...(executorId ? { 'Executor ID': executorId } : {}),
        },
      });
    } catch (error) {
      appLogger.error('Failed to log channel delete', 'ChannelDelete', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }

    // Feed to anti-nuke
    try {
      const { antinukeModule } = await import('../../modules/antinuke/index.js');
      await antinukeModule.trackAction(ch.client, guild.id, 'CHANNEL_DELETE', ch.id);
    } catch (error) {
      appLogger.error('Anti-nuke handler failed', 'SecurityEvent', { guildId: guild.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
};

export default event;

