import { Events, type VoiceState } from 'discord.js';
import { musicModule } from '../../modules/music/index.js';
import { tempVoiceModule } from '../../modules/tempvoice/index.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.VoiceStateUpdate,
  async execute(oldState: unknown, newState: unknown) {
    musicModule.handleVoiceState(oldState as VoiceState, newState as VoiceState);
    try {
      await tempVoiceModule.handleVoiceState(oldState as VoiceState, newState as VoiceState);
    } catch (error) {
      appLogger.error('Temp voice handler failed', 'VoiceStateUpdate', {
        guildId: (newState as VoiceState).guild.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
export default event;
