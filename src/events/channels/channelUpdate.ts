import { Events, DMChannel, GuildChannel } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.ChannelUpdate,
  async execute(oldChannel: unknown, newChannel: unknown) {
    const oldCh = oldChannel as DMChannel | GuildChannel;
    const newCh = newChannel as DMChannel | GuildChannel;

    if (!('guild' in newCh) || !newCh.guild) return;

    const guild = newCh.guild;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if ('name' in oldCh && 'name' in newCh && oldCh.name !== newCh.name) {
      before['Name'] = oldCh.name;
      after['Name'] = newCh.name;
    }

    if ('topic' in oldCh && 'topic' in newCh) {
      const oldTopic = (oldCh as { topic?: string | null }).topic;
      const newTopic = (newCh as { topic?: string | null }).topic;
      if (oldTopic !== newTopic) {
        before['Topic'] = oldTopic ?? 'None';
        after['Topic'] = newTopic ?? 'None';
      }
    }

    if ('nsfw' in oldCh && 'nsfw' in newCh) {
      const oldNsfw = (oldCh as { nsfw?: boolean }).nsfw;
      const newNsfw = (newCh as { nsfw?: boolean }).nsfw;
      if (oldNsfw !== newNsfw) {
        before['NSFW'] = oldNsfw;
        after['NSFW'] = newNsfw;
      }
    }

    if ('rateLimitPerUser' in oldCh && 'rateLimitPerUser' in newCh) {
      const oldSlow = (oldCh as { rateLimitPerUser?: number }).rateLimitPerUser;
      const newSlow = (newCh as { rateLimitPerUser?: number }).rateLimitPerUser;
      if (oldSlow !== newSlow) {
        before['Slowmode'] = `${oldSlow ?? 0}s`;
        after['Slowmode'] = `${newSlow ?? 0}s`;
      }
    }

    if ('permissionOverwrites' in oldCh && 'permissionOverwrites' in newCh && oldCh.permissionOverwrites.cache !== newCh.permissionOverwrites.cache) {
      try {
        const { antinukeModule } = await import('../../modules/antinuke/index.js');
        await antinukeModule.trackAction(newCh.client, guild.id, 'CHANNEL_PERMISSION_CHANGE', newCh.id);
      } catch { /* audit log may be unavailable */ }
    }

    // Only log if there are actual changes
    if (Object.keys(before).length === 0) return;

    try {
      await logModule.sendLog(newCh.client, guild.id, LogCategory.CHANNEL, {
        eventType: 'Channel Updated',
        target: { id: newCh.id, name: 'name' in newCh ? newCh.name : 'Unknown' },
        action: 'Update',
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.LOG_UPDATE,
        before,
        after,
        relevantIds: { 'Channel ID': newCh.id },
      });
    } catch (error) {
      appLogger.error('Failed to log channel update', 'ChannelUpdate', {
        error: error instanceof Error ? error.message : String(error),
        guildId: guild.id,
      });
    }
  },
};

export default event;


