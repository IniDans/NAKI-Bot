import { Events, Message } from 'discord.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.MessageCreate,
  async execute(message: unknown) {
    const msg = message as Message;
    if (msg.author.bot || !msg.guild) return;
    try {
      const { automodModule } = await import('../../modules/automod/index.js');
      await automodModule.processMessage(msg);
    } catch (error) {
      appLogger.error('AutoMod handler failed', 'MessageCreate', { guildId: msg.guild.id, error: error instanceof Error ? error.message : String(error) });
    }
  },
};
export default event;
