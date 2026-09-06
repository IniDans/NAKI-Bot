import { Events, User, Guild } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildBanAdd,
  async execute(ban: unknown) {
    const value = ban as { guild: Guild; user: User };
    await logModule.sendLog(value.guild.client, value.guild.id, LogCategory.MODERATION, {
      eventType: 'Member Banned', target: { id: value.user.id, tag: value.user.tag }, action: 'Ban', guildId: value.guild.id, guildName: value.guild.name, color: Colors.BAN, relevantIds: { 'User ID': value.user.id },
    });
    const { antinukeModule } = await import('../../modules/antinuke/index.js');
    await antinukeModule.trackAction(value.guild.client, value.guild.id, 'MEMBER_BAN', value.user.id);
  },
};
export default event;
