import { Events, Guild } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildUpdate,
  async execute(oldGuild: unknown, newGuild: unknown) {
    const oldG = oldGuild as Guild;
    const newG = newGuild as Guild;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (oldG.name !== newG.name) { before.name = oldG.name; after.name = newG.name; }
    if (oldG.verificationLevel !== newG.verificationLevel) { before.verificationLevel = oldG.verificationLevel; after.verificationLevel = newG.verificationLevel; }
    if (oldG.defaultMessageNotifications !== newG.defaultMessageNotifications) { before.defaultNotifications = oldG.defaultMessageNotifications; after.defaultNotifications = newG.defaultMessageNotifications; }
    if (!Object.keys(before).length) return;
    await logModule.sendLog(newG.client, newG.id, LogCategory.SERVER, {
      eventType: 'Server Settings Updated', action: 'Update', guildId: newG.id, guildName: newG.name, color: Colors.LOG_UPDATE, before, after,
      relevantIds: { 'Guild ID': newG.id },
    });
  },
};
export default event;
