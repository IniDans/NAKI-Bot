import { Events, Message } from 'discord.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.MessageCreate,
  async execute(message: unknown) {
    const msg = message as Message;
    if (msg.author.bot) return;
    if (!msg.inGuild()) {
      try {
        const { modmailModule } = await import('../../modules/modmail/index.js');
        await modmailModule.handleDM(msg);
      } catch (error) {
        appLogger.error('Modmail DM handler failed', 'MessageCreate', { error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (msg.channel.isThread()) {
      try {
        const { modmailModule } = await import('../../modules/modmail/index.js');
        await modmailModule.handleThreadMessage(msg);
      } catch (error) {
        appLogger.error('Modmail relay failed', 'MessageCreate', { guildId: msg.guildId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    let violated = false;
    try {
      const { automodModule } = await import('../../modules/automod/index.js');
      violated = await automodModule.processMessage(msg);
    } catch (error) {
      appLogger.error('AutoMod handler failed', 'MessageCreate', { guildId: msg.guildId, error: error instanceof Error ? error.message : String(error) });
    }
    if (violated) return;
    try {
      const { autoMessagesModule } = await import('../../modules/automessages/index.js');
      await autoMessagesModule.handleMessage(msg);
    } catch (error) {
      appLogger.error('Auto messages handler failed', 'MessageCreate', { guildId: msg.guildId, error: error instanceof Error ? error.message : String(error) });
    }
    try {
      const { levelingModule } = await import('../../modules/leveling/index.js');
      await levelingModule.handleMessage(msg);
    } catch (error) {
      appLogger.error('Leveling handler failed', 'MessageCreate', { guildId: msg.guildId, error: error instanceof Error ? error.message : String(error) });
    }
  },
};
export default event;
