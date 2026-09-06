import { Events, GuildChannel } from 'discord.js';
import { logModule } from '../../modules/logger/index.js';
import { Colors, LogCategory } from '../../config/constants.js';
import type { Event } from '../../types/index.js';

const event: Event = {
  name: Events.WebhooksUpdate,
  async execute(channel: unknown) {
    const ch = channel as GuildChannel;
    const guild = ch.guild;
    if (!guild) return;
    await logModule.sendLog(ch.client, guild.id, LogCategory.SERVER, {
      eventType: 'Webhook Configuration Updated', action: 'Update', guildId: guild.id, guildName: guild.name, color: Colors.WARNING,
      metadata: { channel: `<#${ch.id}>`, note: 'Inspect the audit log to identify the webhook operation and executor.' },
      relevantIds: { 'Channel ID': ch.id },
    });
  },
};
export default event;
