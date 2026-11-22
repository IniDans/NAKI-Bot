import { Events, Message, PartialMessage } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { attachmentCache } from '../../modules/logger/attachmentCache.js';
import { buildEditLog } from '../../modules/logger/messageLog.js';
import { LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.MessageUpdate,
  async execute(oldMessage: unknown, newMessage: unknown) {
    const oldMsg = oldMessage as Message | PartialMessage;
    const newMsg = newMessage as Message | PartialMessage;

    // Ignore bots and DMs
    if (!newMsg.guild) return;
    if (newMsg.author?.bot) return;
    // A real edit moves editedTimestamp; link unfurls and embed updates don't.
    if (!newMsg.editedTimestamp) return;
    if (!oldMsg.partial && oldMsg.editedTimestamp === newMsg.editedTimestamp) return;

    // Attachments can only be removed by an edit, never added.
    const removedAttachments = oldMsg.partial
      ? []
      : [...oldMsg.attachments.values()].filter((a) => !newMsg.attachments.has(a.id));
    const before = oldMsg.partial ? null : oldMsg.content;
    const after = newMsg.content;
    // Same text and nothing removed: an embed preview or link unfurl, not a user edit.
    if (before === after && removedAttachments.length === 0) return;
    if (before === null && after === null) return;

    const guild = newMsg.guild;
    try {
      const log = await buildEditLog({
        guild,
        channelId: newMsg.channelId,
        messageId: newMsg.id,
        url: newMsg.url,
        author: newMsg.author ?? null,
        before,
        after,
        removedAttachments,
      });
      await logModule.sendMessage(newMsg.client, guild.id, LogCategory.MESSAGE, {
        ...log,
        quickActionsFor: newMsg.author?.id,
      });
    } catch (error) {
      appLogger.error('Failed to log message edit', 'MessageUpdate', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    } finally {
      attachmentCache.forget(removedAttachments.map((a) => a.id));
    }
  },
};

export default event;
