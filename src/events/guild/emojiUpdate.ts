import { Events, GuildEmoji } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildEmojiUpdate,
  async execute(oldEmoji: unknown, newEmoji: unknown) {
    const oldValue = oldEmoji as GuildEmoji; const value = newEmoji as GuildEmoji;
    const before: Record<string, unknown> = {}; const after: Record<string, unknown> = {};
    if (oldValue.name !== value.name) { before.name = oldValue.name; after.name = value.name; }
    if (!Object.keys(before).length) return;
    await logModule.sendLog(value.client, value.guild.id, LogCategory.SERVER, { eventType: 'Emoji Updated', target: { id: value.id, name: value.name ?? 'Unknown' }, action: 'Update', guildId: value.guild.id, guildName: value.guild.name, color: Colors.LOG_UPDATE, before, after, relevantIds: { 'Emoji ID': value.id } });
  },
};
export default event;
