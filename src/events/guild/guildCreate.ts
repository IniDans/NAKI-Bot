import { Events, Guild } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildCreate,
  async execute(guild: unknown) {
    const g = guild as Guild;

    try {
      await guildService.getOrCreateGuild(g.id);
      appLogger.info(`Joined guild: ${g.name} (${g.id})`, 'GuildCreate', {
        memberCount: g.memberCount,
        ownerId: g.ownerId,
      });
    } catch (error) {
      appLogger.error('Failed to provision guild on join', 'GuildCreate', {
        guildId: g.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};

export default event;
