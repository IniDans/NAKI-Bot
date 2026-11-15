import { Client, DiscordAPIError, Guild, RESTJSONErrorCodes } from 'discord.js';
import { db } from '../database/index.js';
import { appLogger } from '../../utils/logger.js';
import { MAX_TASK_ATTEMPTS, retryDelayMs, timerDelay } from './timing.js';

const prisma = db.client;

interface PendingTask {
  id: string;
  guildId: string;
  type: string;
  data: Record<string, unknown>;
  executeAt: Date;
  attempts: number;
}

/** Discord errors meaning the target no longer exists, so the task has nothing left to do. */
const GONE_CODES = new Set<number>([
  RESTJSONErrorCodes.UnknownGuild,
  RESTJSONErrorCodes.UnknownMember,
  RESTJSONErrorCodes.UnknownUser,
  RESTJSONErrorCodes.UnknownRole,
  RESTJSONErrorCodes.UnknownBan,
  RESTJSONErrorCodes.UnknownChannel,
]);

function isGone(error: unknown): boolean {
  return error instanceof DiscordAPIError && typeof error.code === 'number' && GONE_CODES.has(error.code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchMember(guild: Guild, userId: string) {
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    if (isGone(error)) return null;
    throw error;
  }
}

/**
 * Persistent scheduler: tasks live in the database, timers live in memory.
 * A task is marked completed only after its handler succeeds; failures are
 * retried with backoff, so a Discord outage does not silently drop the task.
 */
class SchedulerService {
  private activeTimers = new Map<string, NodeJS.Timeout>();
  private running = new Set<string>();
  private client: Client | null = null;
  private sweepInterval: NodeJS.Timeout | null = null;

  setClient(client: Client) {
    this.client = client;
  }

  async scheduleTask(
    guildId: string,
    type: string,
    data: Record<string, unknown>,
    executeAt: Date,
  ): Promise<string> {
    const task = await prisma.scheduledTask.create({
      data: { guildId, type, data: data as object, executeAt },
    });

    this.setTimer({ id: task.id, guildId, type, data, executeAt, attempts: 0 });
    appLogger.info(`Scheduled task ${task.id} (${type}) for ${executeAt.toISOString()}`, 'Scheduler', { guildId, type });
    return task.id;
  }

  async cancelTask(taskId: string): Promise<void> {
    this.clearTimer(taskId);
    await prisma.scheduledTask.update({ where: { id: taskId }, data: { completed: true } }).catch(() => {
      // Task may already be deleted or completed
    });
    appLogger.debug(`Cancelled task ${taskId}`, 'Scheduler');
  }

  /** Cancel every pending task of one type for a guild. */
  async cancelTasks(guildId: string, type: string): Promise<number> {
    const pending = await prisma.scheduledTask.findMany({
      where: { guildId, type, completed: false },
      select: { id: true },
    });
    if (pending.length === 0) return 0;
    for (const task of pending) this.clearTimer(task.id);
    await prisma.scheduledTask.updateMany({
      where: { id: { in: pending.map((task) => task.id) } },
      data: { completed: true },
    });
    appLogger.debug(`Cancelled ${pending.length} ${type} task(s)`, 'Scheduler', { guildId });
    return pending.length;
  }

  /** Cancel all active timers (used during shutdown). */
  cancelAll(): void {
    for (const timer of this.activeTimers.values()) clearTimeout(timer);
    this.activeTimers.clear();
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  /** Load all pending tasks on startup. Overdue tasks get a zero delay and run right away. */
  async rehydrate(client: Client): Promise<void> {
    this.client = client;

    const pendingTasks = await prisma.scheduledTask.findMany({ where: { completed: false } });
    const now = Date.now();
    let overdue = 0;
    for (const task of pendingTasks) {
      if (task.executeAt.getTime() <= now) overdue++;
      this.setTimer({
        id: task.id,
        guildId: task.guildId,
        type: task.type,
        data: task.data as Record<string, unknown>,
        executeAt: task.executeAt,
        attempts: task.attempts,
      });
    }

    appLogger.info(`Rehydrated ${pendingTasks.length} pending tasks (${overdue} overdue)`, 'Scheduler');

    if (this.sweepInterval) clearInterval(this.sweepInterval);
    this.sweepInterval = setInterval(() => void this.sweep(), 60_000);
    this.sweepInterval.unref();
  }

  private clearTimer(taskId: string): void {
    const timer = this.activeTimers.get(taskId);
    if (timer) clearTimeout(timer);
    this.activeTimers.delete(taskId);
  }

  private setTimer(task: PendingTask): void {
    this.clearTimer(task.id);
    const timer = setTimeout(() => {
      this.activeTimers.delete(task.id);
      // Delays longer than the setTimeout limit are split into several hops.
      if (task.executeAt.getTime() > Date.now()) {
        this.setTimer(task);
        return;
      }
      void this.runTask(task);
    }, timerDelay(task.executeAt));
    timer.unref();
    this.activeTimers.set(task.id, timer);
  }

  private async runTask(task: PendingTask): Promise<void> {
    if (this.running.has(task.id)) return;
    this.running.add(task.id);
    try {
      await this.executeHandler(task);
      await prisma.scheduledTask.update({ where: { id: task.id }, data: { completed: true, lastError: null } });
    } catch (error) {
      await this.handleFailure(task, error);
    } finally {
      this.running.delete(task.id);
    }
  }

  private async handleFailure(task: PendingTask, error: unknown): Promise<void> {
    const attempts = task.attempts + 1;
    const lastError = errorMessage(error).slice(0, 1000);
    const meta = { taskId: task.id, type: task.type, guildId: task.guildId, attempts, error: lastError };

    try {
      if (attempts >= MAX_TASK_ATTEMPTS) {
        await prisma.scheduledTask.update({ where: { id: task.id }, data: { completed: true, attempts, lastError } });
        appLogger.error(`Task ${task.id} abandoned after ${attempts} attempts`, 'Scheduler', meta);
        return;
      }
      const executeAt = new Date(Date.now() + retryDelayMs(attempts));
      await prisma.scheduledTask.update({ where: { id: task.id }, data: { attempts, lastError, executeAt } });
      this.setTimer({ ...task, attempts, executeAt });
      appLogger.warn(`Task ${task.id} failed, retrying at ${executeAt.toISOString()}`, 'Scheduler', meta);
    } catch (dbError) {
      // The task is still pending in the database, so the sweep will pick it up again.
      appLogger.error(`Failed to record failure for task ${task.id}`, 'Scheduler', { ...meta, dbError: errorMessage(dbError) });
    }
  }

  /** Runs the task's action. Throws on failures worth retrying; returns when there is nothing left to do. */
  private async executeHandler(task: PendingTask): Promise<void> {
    if (!this.client) throw new Error('Discord client is not ready');
    const { guildId, data } = task;

    let guild: Guild;
    try {
      guild = await this.client.guilds.fetch(guildId);
    } catch (error) {
      if (isGone(error) || (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.MissingAccess)) {
        appLogger.warn(`Guild ${guildId} unavailable, dropping task ${task.id}`, 'Scheduler');
        return;
      }
      throw error;
    }

    switch (task.type) {
      case 'TEMP_ROLE_EXPIRE': {
        const userId = data.userId as string;
        const roleId = data.roleId as string;
        const member = await fetchMember(guild, userId);
        const role = guild.roles.cache.get(roleId);
        if (member && role && member.roles.cache.has(roleId)) {
          await member.roles.remove(role, 'Temporary role expired');
          appLogger.info(`Removed temp role ${roleId} from ${userId} in ${guildId}`, 'Scheduler');
        }
        // The grant is over whether or not the member or role still exists.
        await prisma.temporaryRole.updateMany({
          where: { guildId, userId, roleId, active: true, expiresAt: { lte: new Date() } },
          data: { active: false },
        });
        return;
      }

      case 'UNMUTE': {
        const userId = data.userId as string;
        const muteRoleId = data.muteRoleId as string;
        const member = await fetchMember(guild, userId);
        if (member && muteRoleId && member.roles.cache.has(muteRoleId)) {
          await member.roles.remove(muteRoleId, 'Mute duration expired');
          appLogger.info(`Unmuted ${userId} in ${guildId}`, 'Scheduler');
        }
        return;
      }

      case 'UNLOCK': {
        const channel = guild.channels.cache.get(data.channelId as string);
        if (channel && 'permissionOverwrites' in channel) {
          // Only clear the SendMessages deny; other @everyone overwrites (e.g. ViewChannel) stay intact.
          await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: 'Lock duration expired' });
          appLogger.info(`Unlocked channel ${channel.id} in ${guildId}`, 'Scheduler');
        }
        return;
      }

      case 'RAID_LOCKDOWN_EXPIRE': {
        const { antiraidModule } = await import('../../modules/antiraid/index.js');
        const result = await antiraidModule.unlock(guild, 'Raid lockdown expired');
        if (result.failed > 0) throw new Error(`${result.failed} channel(s) could not be restored`);
        appLogger.info(`Raid lockdown expired for ${guildId}`, 'Scheduler', { restored: result.restored });
        return;
      }

      case 'SECURITY_COOLDOWN':
        appLogger.info(`Security cooldown expired for ${guildId}`, 'Scheduler');
        return;

      case 'TEMP_BAN_EXPIRE': {
        const userId = data.userId as string;
        try {
          await guild.bans.remove(userId, 'Temporary ban expired');
          appLogger.info(`Unbanned ${userId} in ${guildId} (temp ban expired)`, 'Scheduler');
        } catch (error) {
          if (!isGone(error)) throw error;
        }
        return;
      }

      default:
        appLogger.warn(`Unknown task type: ${task.type}`, 'Scheduler');
    }
  }

  /** Safety net for tasks whose timers were lost (e.g. a failed DB write during retry). */
  private async sweep(): Promise<void> {
    try {
      const overdueTasks = await prisma.scheduledTask.findMany({
        where: { completed: false, executeAt: { lt: new Date() } },
        take: 50,
      });
      for (const task of overdueTasks) {
        if (this.activeTimers.has(task.id) || this.running.has(task.id)) continue;
        appLogger.info(`Sweep caught missed task ${task.id} (${task.type})`, 'Scheduler');
        await this.runTask({
          id: task.id,
          guildId: task.guildId,
          type: task.type,
          data: task.data as Record<string, unknown>,
          executeAt: task.executeAt,
          attempts: task.attempts,
        });
      }
    } catch (error) {
      appLogger.error('Scheduler sweep failed', 'Scheduler', { error: errorMessage(error) });
    }
  }
}

export const scheduler = new SchedulerService();
