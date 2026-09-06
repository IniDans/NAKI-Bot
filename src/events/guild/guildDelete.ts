import { Events, Guild } from 'discord.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildDelete,
  async execute(guild: unknown) {
    const g = guild as Guild;

    appLogger.info(`Left guild: ${g.name ?? 'Unknown'} (${g.id})`, 'GuildDelete');
    // Note: We do NOT delete guild data on leave — the owner may re-invite the bot.
    // Data cleanup can be handled through a periodic maintenance task if needed.
  },
};

export default event;
