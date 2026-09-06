import { Events, Message, PartialMessage } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.MessageUpdate,
  async execute(oldMessage: unknown, newMessage: unknown) {
    const oldMsg = oldMessage as Message | PartialMessage;
    const newMsg = newMessage as Message | PartialMessage;

    // Ignore bots, DMs, and embed-only updates
    if (!newMsg.guild) return;
    if (newMsg.author?.bot) return;
    if (oldMsg.content === newMsg.content) return; // Embed preview, link unfurl, etc.

    const guild = newMsg.guild;
    const oldContent = oldMsg.content ?? '*Not cached*';
    const newContent = newMsg.content ?? '*Not cached*';

    try {
      await logModule.sendLog(newMsg.client, guild.id, LogCategory.MESSAGE, {
        eventType: 'Message Edited',
        target: newMsg.author ? { id: newMsg.author.id, tag: newMsg.author.tag } : { id: 'Unknown' },
        action: 'Edit',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_UPDATE,
        before: { 'Content': oldContent.substring(0, 1024) || '*Empty*' },
        after: { 'Content': newContent.substring(0, 1024) || '*Empty*' },
        metadata: {
          'Channel': `<#${newMsg.channelId}>`,
          'Jump to Message': `[Click here](${newMsg.url})`,
        },
        relevantIds: {
          'Message ID': newMsg.id,
          ...(newMsg.author ? { 'Author ID': newMsg.author.id } : {}),
        },
      });
    } catch (error) {
      appLogger.error('Failed to log message edit', 'MessageUpdate', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }
  },
};

export default event;
