import { Prisma } from '@prisma/client';
import { GuildMember, Guild, ChannelType, GuildBasedChannel, NewsChannel, TextChannel } from 'discord.js';
import { db } from '../../services/database/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { logModule } from '../logger/index.js';
import { Colors, LogCategory, ScheduledTaskType, ThreatLevel } from '../../config/constants.js';
import { appLogger } from '../../utils/logger.js';
import { scheduler } from '../../services/scheduler/index.js';
import { everyoneSendState, parseSnapshot, restoreStep, withGuildLock, type LockdownSnapshot } from './lockdown.js';

const prisma = db.client;
const joinWindows = new Map<string, number[]>();

export interface LockdownResult {
  status: 'locked' | 'already_locked';
  changed: number;
  failed: number;
  endsAt: Date | null;
}

export interface UnlockResult {
  status: 'unlocked' | 'partial' | 'not_locked';
  restored: number;
  failed: number;
}

type LockableChannel = TextChannel | NewsChannel;

function isLockable(channel: GuildBasedChannel): channel is LockableChannel {
  return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
}

function cleanup(values: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return values.filter((timestamp) => timestamp >= cutoff);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lockGuild(guild: Guild, reason: string): Promise<LockdownResult> {
  return withGuildLock(guild.id, async () => {
    const config = await guildService.getSecurityConfig(guild.id);
    if (config.isLockedDown || parseSnapshot(config.lockdownSnapshot)) {
      return { status: 'already_locked', changed: 0, failed: 0, endsAt: config.lockdownEndsAt };
    }

    const everyone = guild.roles.everyone;
    const snapshot: LockdownSnapshot = {};
    for (const channel of guild.channels.cache.values()) {
      if (!isLockable(channel)) continue;
      const state = everyoneSendState(channel.permissionOverwrites.cache.get(everyone.id));
      if (state !== 'deny') snapshot[channel.id] = state;
    }

    // Persist the snapshot before touching channels, so a crash mid-lockdown can still be undone.
    const endsAt = new Date(Date.now() + config.lockdownDurationMinutes * 60_000);
    await guildService.updateSecurityConfig(guild.id, {
      isLockedDown: true,
      lockdownStarted: new Date(),
      lockdownEndsAt: endsAt,
      lockdownSnapshot: snapshot,
    });

    let failed = 0;
    for (const channelId of Object.keys(snapshot)) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !isLockable(channel)) continue;
      try {
        await channel.permissionOverwrites.edit(everyone, { SendMessages: false }, { reason });
      } catch (error) {
        failed++;
        appLogger.warn(`Failed to lock channel ${channelId}`, 'AntiRaid', { guildId: guild.id, error: errorMessage(error) });
      }
    }

    await scheduler.cancelTasks(guild.id, ScheduledTaskType.RAID_LOCKDOWN_EXPIRE);
    await scheduler.scheduleTask(guild.id, ScheduledTaskType.RAID_LOCKDOWN_EXPIRE, {}, endsAt);
    appLogger.security('Lockdown enabled', guild.id, { reason, channels: Object.keys(snapshot).length, failed });
    return { status: 'locked', changed: Object.keys(snapshot).length - failed, failed, endsAt };
  });
}

/** Lockdowns started before snapshots existed have no record of the original state. */
async function legacyUnlock(guild: Guild, reason: string): Promise<UnlockResult> {
  appLogger.warn('Unlocking a lockdown without a snapshot; clearing SendMessages on all text channels', 'AntiRaid', { guildId: guild.id });
  let restored = 0;
  let failed = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!isLockable(channel)) continue;
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason });
      restored++;
    } catch {
      failed++;
    }
  }
  if (failed === 0) {
    await guildService.updateSecurityConfig(guild.id, { isLockedDown: false, lockdownStarted: null, lockdownEndsAt: null });
  }
  return { status: failed ? 'partial' : 'unlocked', restored, failed };
}

function unlockGuild(guild: Guild, reason: string): Promise<UnlockResult> {
  return withGuildLock(guild.id, async () => {
    const config = await guildService.getSecurityConfig(guild.id);
    const snapshot = parseSnapshot(config.lockdownSnapshot);
    if (!snapshot) {
      if (!config.isLockedDown) return { status: 'not_locked', restored: 0, failed: 0 };
      return legacyUnlock(guild, reason);
    }

    const everyone = guild.roles.everyone;
    const remaining: LockdownSnapshot = {};
    let restored = 0;
    for (const [channelId, state] of Object.entries(snapshot)) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !isLockable(channel)) continue; // deleted during lockdown
      const step = restoreStep(state, channel.permissionOverwrites.cache.get(everyone.id));
      try {
        if (step.kind === 'delete') await channel.permissionOverwrites.delete(everyone, reason);
        else if (step.kind === 'edit') await channel.permissionOverwrites.edit(everyone, { SendMessages: step.sendMessages }, { reason });
        restored++;
      } catch (error) {
        remaining[channelId] = state;
        appLogger.warn(`Failed to restore channel ${channelId}`, 'AntiRaid', { guildId: guild.id, error: errorMessage(error) });
      }
    }

    const failed = Object.keys(remaining).length;
    if (failed > 0) {
      // Keep the lockdown active with only the channels still to restore, so a retry finishes the job.
      await guildService.updateSecurityConfig(guild.id, { lockdownSnapshot: remaining });
      return { status: 'partial', restored, failed };
    }

    await guildService.updateSecurityConfig(guild.id, {
      isLockedDown: false,
      lockdownStarted: null,
      lockdownEndsAt: null,
      lockdownSnapshot: Prisma.DbNull,
    });
    await scheduler.cancelTasks(guild.id, ScheduledTaskType.RAID_LOCKDOWN_EXPIRE);
    appLogger.security('Lockdown lifted', guild.id, { reason, restored });
    return { status: 'unlocked', restored, failed: 0 };
  });
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
    const actionsTaken = ['ALERT'];
    if (accountAgeDays < config.minimumAccountAgeDays && member.moderatable) {
      await member.timeout(Math.min(config.lockdownDurationMinutes * 60_000, 28 * 24 * 60 * 60 * 1000), `Anti-Raid incident ${incident.id}`).catch(() => undefined);
      actionsTaken.push('TIMEOUT_SUSPICIOUS_ACCOUNT');
    }
    const lockdown = alreadyLocked ? null : await lockGuild(member.guild, `Anti-Raid incident ${incident.id}`);
    if (lockdown?.status === 'locked') actionsTaken.push('LOCKDOWN');
    await prisma.raidIncident.update({ where: { id: incident.id }, data: { actionsTaken } });
    await logModule.sendLog(member.client, member.guild.id, LogCategory.SECURITY, {
      eventType: 'Anti-Raid Triggered',
      user: { id: member.id, tag: member.user.tag },
      action: actionsTaken.includes('LOCKDOWN') ? 'Lockdown' : 'Alert',
      reason: `Detected ${timestamps.length} joins within ${config.raidTimeWindowSeconds}s`,
      guildId: member.guild.id,
      guildName: member.guild.name,
      color: Colors.SECURITY_HIGH,
      metadata: { incidentId: incident.id, accountAgeDays, actionsTaken: actionsTaken.join(', ') },
    });
    appLogger.security('Anti-raid triggered', member.guild.id, { incidentId: incident.id, joins: timestamps.length });
  },

  lockdown(guild: Guild, reason = 'Manual security lockdown'): Promise<LockdownResult> {
    return lockGuild(guild, reason);
  },

  unlock(guild: Guild, reason = 'Manual security unlock'): Promise<UnlockResult> {
    return unlockGuild(guild, reason);
  },
};
