import { Events, User, Guild } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildBanRemove,
  async execute(ban: unknown) {
    const value = ban as { guild: Guild; user: User };
    await logModule.sendLog(value.guild.client, value.guild.id, LogCategory.MODERATION, {
      eventType: 'Member Unbanned', target: { id: value.user.id, tag: value.user.tag }, action: 'Unban', guildId: value.guild.id, guildName: value.guild.name, color: Colors.UNBAN, relevantIds: { 'User ID': value.user.id },
    });
  },
};
export default event;
