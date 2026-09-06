import { Events, Message, PartialMessage, AuditLogEvent } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.MessageDelete,
  async execute(message: unknown) {
    const msg = message as Message | PartialMessage;

    // Ignore partial messages with no content, bots, and DMs
    if (!msg.guild) return;
    if (msg.author?.bot) return;

    const guild = msg.guild;
    const content = msg.content ?? '*Content not cached*';
    const author = msg.author;

    // Attempt to find who deleted the message from audit logs
    let deletedBy: string | null = null;
    try {
      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MessageDelete,
        limit: 1,
      });
      const entry = auditLogs.entries.first();
      if (
        entry &&
        entry.target?.id === author?.id &&
        entry.createdTimestamp > Date.now() - 5000
      ) {
        deletedBy = entry.executor?.tag ?? null;
      }
    } catch {
      // May not have audit log permissions
    }

    try {
      const attachments = msg.attachments?.map((a) => a.url).join(', ') || null;

      await logModule.sendLog(msg.client, guild.id, LogCategory.MESSAGE, {
        eventType: 'Message Deleted',
        target: author ? { id: author.id, tag: author.tag } : { id: 'Unknown' },
        action: 'Delete',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_DELETE,
        metadata: {
          'Content': content.substring(0, 1024) || '*Empty*',
          'Channel': `<#${msg.channelId}>`,
          ...(deletedBy ? { 'Deleted By': deletedBy } : {}),
          ...(attachments ? { 'Attachments': attachments.substring(0, 512) } : {}),
        },
        relevantIds: {
          'Message ID': msg.id,
          ...(author ? { 'Author ID': author.id } : {}),
        },
      });
    } catch (error) {
      appLogger.error('Failed to log message delete', 'MessageDelete', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }
  },
};

export default event;
