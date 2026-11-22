import { Events, Message, PartialMessage } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { attachmentCache } from '../../modules/logger/attachmentCache.js';
import { findMessageDeleter } from '../../modules/logger/deleteAudit.js';
import { buildDeleteLog } from '../../modules/logger/messageLog.js';
import { LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.MessageDelete,
  async execute(message: unknown) {
    const msg = message as Message | PartialMessage;

    // Ignore bots and DMs. Uncached messages (author unknown) are still logged.
    if (!msg.guild) return;
    if (msg.author?.bot) return;

    const guild = msg.guild;
    const author = msg.author ?? null;
    const attachments = [...(msg.attachments?.values() ?? [])];

    try {
      const deleter = author
        ? await findMessageDeleter(guild, author.id, msg.channelId)
        : ({ kind: 'unknown', reason: 'message was not cached' } as const);

      const log = await buildDeleteLog({
        guild,
        channelId: msg.channelId,
        messageId: msg.id,
        author,
        content: msg.partial ? null : msg.content,
        createdTimestamp: msg.createdTimestamp || null,
        attachments,
        deleter,
      });

      await logModule.sendMessage(msg.client, guild.id, LogCategory.MESSAGE, {
        ...log,
        quickActionsFor: author && !author.bot ? author.id : undefined,
      });
    } catch (error) {
      appLogger.error('Failed to log message delete', 'MessageDelete', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    } finally {
      attachmentCache.forget(attachments.map((a) => a.id));
    }
  },
};

export default event;
