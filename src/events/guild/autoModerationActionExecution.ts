import { AutoModerationActionExecution, Events } from 'discord.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.AutoModerationActionExecution,
  async execute(execution: unknown) {
    const e = execution as AutoModerationActionExecution;
    try {
      const { automodModule } = await import('../../modules/automod/index.js');
      await automodModule.handleNativeExecution(e);
    } catch (error) {
      appLogger.error('Native AutoMod handler failed', 'AutoModExecution', {
        guildId: e.guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

export default event;
