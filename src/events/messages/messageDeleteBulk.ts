import { Events, Collection, Message, PartialMessage, Snowflake } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.MessageBulkDelete,
  async execute(messages: unknown, _channel: unknown) {
    const msgs = messages as Collection<Snowflake, Message | PartialMessage>;
    const firstMsg = msgs.first();
    if (!firstMsg?.guild) return;

    const guild = firstMsg.guild;

    try {
      const authors = [...new Set(msgs.map((m) => m.author?.tag ?? 'Unknown'))];

      await logModule.sendLog(firstMsg.client, guild.id, LogCategory.MESSAGE, {
        eventType: 'Bulk Message Delete',
        action: 'Bulk Delete',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_DELETE,
        metadata: {
          'Messages Deleted': msgs.size,
          'Channel': `<#${firstMsg.channelId}>`,
          'Authors': authors.slice(0, 10).join(', ') + (authors.length > 10 ? ` (+${authors.length - 10} more)` : ''),
        },
      });
    } catch (error) {
      appLogger.error('Failed to log bulk message delete', 'MessageBulkDelete', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }
  },
};

export default event;

