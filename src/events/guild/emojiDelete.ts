import { Events, GuildEmoji } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildEmojiDelete,
  async execute(emoji: unknown) {
    const value = emoji as GuildEmoji;
    await logModule.sendLog(value.client, value.guild.id, LogCategory.SERVER, { eventType: 'Emoji Deleted', target: { id: value.id, name: value.name ?? 'Unknown' }, action: 'Delete', guildId: value.guild.id, guildName: value.guild.name, color: Colors.LOG_DELETE, relevantIds: { 'Emoji ID': value.id } });
  },
};
export default event;
