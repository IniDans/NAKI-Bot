import { Events, Role } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.GuildRoleUpdate,
  async execute(oldRole: unknown, newRole: unknown) {
    const oldR = oldRole as Role;
    const newR = newRole as Role;
    const guild = newR.guild;

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (oldR.name !== newR.name) {
      before['Name'] = oldR.name;
      after['Name'] = newR.name;
    }

    if (oldR.color !== newR.color) {
      before['Color'] = oldR.hexColor;
      after['Color'] = newR.hexColor;
    }

    if (oldR.hoist !== newR.hoist) {
      before['Hoisted'] = oldR.hoist;
      after['Hoisted'] = newR.hoist;
    }

    if (oldR.mentionable !== newR.mentionable) {
      before['Mentionable'] = oldR.mentionable;
      after['Mentionable'] = newR.mentionable;
    }

    if (!oldR.permissions.equals(newR.permissions)) {
      const added = newR.permissions.toArray().filter((p) => !oldR.permissions.has(p));
      const removed = oldR.permissions.toArray().filter((p) => !newR.permissions.has(p));

      if (added.length > 0) after['Permissions Added'] = added.join(', ');
      if (removed.length > 0) before['Permissions Removed'] = removed.join(', ');
    }

    // Only log if there are actual changes
    if (Object.keys(before).length === 0 && Object.keys(after).length === 0) return;

    if (!oldR.permissions.equals(newR.permissions)) {
      try {
        const { antinukeModule } = await import('../../modules/antinuke/index.js');
        await antinukeModule.trackAction(newR.client, guild.id, 'ROLE_PERMISSION_CHANGE', newR.id);
      } catch { /* audit log may be unavailable */ }
    }

    try {
      await logModule.sendLog(newR.client, guild.id, LogCategory.ROLE, {
        eventType: 'Role Updated',
        target: { id: newR.id, name: newR.name },
        action: 'Update',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_UPDATE,
        before,
        after,
        relevantIds: { 'Role ID': newR.id },
      });
    } catch (error) {
      appLogger.error('Failed to log role update', 'RoleUpdate', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }
  },
};

export default event;

