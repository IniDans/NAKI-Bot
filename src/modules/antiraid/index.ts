import { GuildMember, Guild, ChannelType } from 'discord.js';
import { db } from '../../services/database/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { logModule } from '../logger/index.js';
import { Colors, LogCategory, ScheduledTaskType, ThreatLevel } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import { scheduler } from '../../services/scheduler/index.js';

const prisma = db.client;
const joinWindows = new Map<string, number[]>();

function cleanup(values: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return values.filter((timestamp) => timestamp >= cutoff);
}

async function setLockdown(guild: Guild, enabled: boolean, reason: string): Promise<void> {
  const config = await guildService.getSecurityConfig(guild.id);
  const everyone = guild.roles.everyone;
  const channels = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement);
  for (const channel of channels.values()) {
    await channel.permissionOverwrites.edit(everyone, { SendMessages: enabled ? false : null }, { reason }).catch(() => undefined);
  }
  const endsAt = enabled ? new Date(Date.now() + config.lockdownDurationMinutes * 60_000) : null;
  await guildService.updateSecurityConfig(guild.id, {
    isLockedDown: enabled,
    lockdownStarted: enabled ? new Date() : null,
    lockdownEndsAt: endsAt,
  });
  if (enabled && endsAt) {
    await scheduler.scheduleTask(guild.id, ScheduledTaskType.RAID_LOCKDOWN_EXPIRE, {}, endsAt);
  }
}

export const antiraidModule = {
  async handleMemberJoin(member: GuildMember): Promise<void> {
    const config = await guildService.getSecurityConfig(member.guild.id);
    if (!config.antiRaidEnabled) return;
    const windowMs = Math.max(1, config.raidTimeWindowSeconds) * 1000;
    const timestamps = cleanup(joinWindows.get(member.guild.id) ?? [], windowMs);
    timestamps.push(Date.now());
    joinWindows.set(member.guild.id, timestamps);
    if (timestamps.length < config.raidJoinThreshold) return;

    const alreadyLocked = config.isLockedDown;
    const incident = await prisma.raidIncident.create({
      data: {
        guildId: member.guild.id,
        threatLevel: timestamps.length >= config.raidJoinThreshold * 2 ? ThreatLevel.CRITICAL : ThreatLevel.HIGH,
        joinCount: timestamps.length,
        timeWindow: config.raidTimeWindowSeconds,
        accountAges: [member.user.createdTimestamp],
        usernames: [member.user.username],
        actionsTaken: alreadyLocked ? ['ALERT'] : ['ALERT', 'LOCKDOWN'],
      },
    });
    const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
    const actionsTaken = alreadyLocked ? ['ALERT'] : ['ALERT', 'LOCKDOWN'];
    if (accountAgeDays < config.minimumAccountAgeDays && member.moderatable) {
      await member.timeout(Math.min(config.lockdownDurationMinutes * 60_000, 28 * 24 * 60 * 60 * 1000), `Anti-Raid incident ${incident.id}`).catch(() => undefined);
      actionsTaken.push('TIMEOUT_SUSPICIOUS_ACCOUNT');
    }
    if (!alreadyLocked) await setLockdown(member.guild, true, `Anti-Raid incident ${incident.id}`);
    await prisma.raidIncident.update({ where: { id: incident.id }, data: { actionsTaken } });
    await logModule.sendLog(member.client, member.guild.id, LogCategory.SECURITY, {
      eventType: 'Anti-Raid Triggered',
      user: { id: member.id, tag: member.user.tag },
      action: alreadyLocked ? 'Alert' : 'Lockdown',
      reason: `Detected ${timestamps.length} joins within ${config.raidTimeWindowSeconds}s`,
      guildId: member.guild.id,
      guildName: member.guild.name,
      color: Colors.SECURITY_HIGH,
      metadata: { incidentId: incident.id, accountAgeDays, actionsTaken: actionsTaken.join(', ') },
    });
    appLogger.security('Anti-raid triggered', member.guild.id, { incidentId: incident.id, joins: timestamps.length });
  },

  async lockdown(guild: Guild, reason = 'Manual security lockdown'): Promise<void> {
    await setLockdown(guild, true, reason);
  },

  async unlock(guild: Guild, reason = 'Manual security unlock'): Promise<void> {
    await setLockdown(guild, false, reason);
  },
};




