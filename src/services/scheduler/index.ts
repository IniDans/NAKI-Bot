import { Client } from 'discord.js';
import { db } from '../database/index.js';
import { appLogger } from '../../utils/logger.js';

const prisma = db.client;

interface ActiveTimer {
  taskId: string;
  timer: NodeJS.Timeout;
}

/**
 * Persistent scheduler â€” DB-backed task store with in-memory timers.
 * Survives bot restart by rehydrating pending tasks on boot.
 */
class SchedulerService {
  private activeTimers = new Map<string, ActiveTimer>();
  private client: Client | null = null;
  private sweepInterval: NodeJS.Timeout | null = null;

  /** Store the client reference for task execution */
  setClient(client: Client) {
    this.client = client;
  }

  /**
   * Schedule a new task. Persists to DB and sets an in-memory timer.
   */
  async scheduleTask(
    guildId: string,
    type: string,
    data: Record<string, unknown>,
    executeAt: Date,
  ): Promise<string> {
    const task = await prisma.scheduledTask.create({
      data: {
        guildId,
        type,
        data: data as object,
        executeAt,
      },
    });

    this.setTimer(task.id, executeAt, type, data as Record<string, unknown>, guildId);

    appLogger.info(`Scheduled task ${task.id} (${type}) for ${executeAt.toISOString()}`, 'Scheduler', {
      guildId,
      type,
    });

    return task.id;
  }

  /**
   * Cancel a scheduled task.
   */
  async cancelTask(taskId: string): Promise<void> {
    const active = this.activeTimers.get(taskId);
    if (active) {
      clearTimeout(active.timer);
      this.activeTimers.delete(taskId);
    }

    await prisma.scheduledTask.update({
      where: { id: taskId },
      data: { completed: true },
    }).catch(() => {
      // Task may already be deleted or completed
    });

    appLogger.debug(`Cancelled task ${taskId}`, 'Scheduler');
  }

  /**
   * Cancel all active timers (used during shutdown).
   */
  cancelAll(): void {
    for (const [id, active] of this.activeTimers) {
      clearTimeout(active.timer);
      appLogger.debug(`Cancelled timer for task ${id}`, 'Scheduler');
    }
    this.activeTimers.clear();

    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }

  /**
   * Rehydrate â€” load all pending tasks from DB and set timers.
   * Called on bot startup.
   */
  async rehydrate(client: Client): Promise<void> {
    this.client = client;

    const pendingTasks = await prisma.scheduledTask.findMany({
      where: {
        completed: false,
        executeAt: { gte: new Date() },
      },
    });

    let rehydrated = 0;

    for (const task of pendingTasks) {
      this.setTimer(
        task.id,
        task.executeAt,
        task.type,
        task.data as Record<string, unknown>,
        task.guildId,
      );
      rehydrated++;
    }

    // Also handle tasks that should have executed while bot was offline
    const overdueTasks = await prisma.scheduledTask.findMany({
      where: {
        completed: false,
        executeAt: { lt: new Date() },
      },
    });

    for (const task of overdueTasks) {
      appLogger.info(`Executing overdue task ${task.id} (${task.type})`, 'Scheduler');
      await this.executeTask(task.id, task.type, task.data as Record<string, unknown>, task.guildId);
    }

    appLogger.info(
      `Rehydrated ${rehydrated} pending tasks, executed ${overdueTasks.length} overdue tasks`,
      'Scheduler',
    );

    // Start periodic sweep every 60s to catch missed tasks
    this.sweepInterval = setInterval(() => this.sweep(), 60_000);
    this.sweepInterval.unref();
  }

  /**
   * Set an in-memory timer for a task.
   */
  private setTimer(
    taskId: string,
    executeAt: Date,
    type: string,
    data: Record<string, unknown>,
    guildId: string,
  ): void {
    const delay = Math.max(0, executeAt.getTime() - Date.now());

    const timer = setTimeout(async () => {
      await this.executeTask(taskId, type, data, guildId);
    }, delay);

    timer.unref(); // Don't prevent process exit

    this.activeTimers.set(taskId, { taskId, timer });
  }

  /**
   * Execute a scheduled task.
   */
  private async executeTask(
    taskId: string,
    type: string,
    data: Record<string, unknown>,
    guildId: string,
  ): Promise<void> {
    try {
      // Mark as completed first to prevent double execution
      await prisma.scheduledTask.update({
        where: { id: taskId },
        data: { completed: true },
      });

      this.activeTimers.delete(taskId);

      if (!this.client) {
        appLogger.error('No client available for task execution', 'Scheduler');
        return;
      }

      const guild = await this.client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        appLogger.warn(`Guild ${guildId} not found for task ${taskId}`, 'Scheduler');
        return;
      }

      switch (type) {
        case 'TEMP_ROLE_EXPIRE': {
          const userId = data.userId as string;
          const roleId = data.roleId as string;

          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            const role = guild.roles.cache.get(roleId);
            if (role && member.roles.cache.has(roleId)) {
              await member.roles.remove(role, 'Temporary role expired');
              appLogger.info(`Removed temp role ${roleId} from ${userId} in ${guildId}`, 'Scheduler');

              // Mark the TemporaryRole record as inactive
              await prisma.temporaryRole.updateMany({
                where: {
                  guildId,
                  userId,
                  roleId,
                  active: true,
                },
                data: { active: false },
              });
            }
          }
          break;
        }

        case 'UNMUTE': {
          const userId = data.userId as string;
          const muteRoleId = data.muteRoleId as string;

          const member = await guild.members.fetch(userId).catch(() => null);
          if (member && muteRoleId) {
            const role = guild.roles.cache.get(muteRoleId);
            if (role && member.roles.cache.has(muteRoleId)) {
              await member.roles.remove(role, 'Mute duration expired');
              appLogger.info(`Unmuted ${userId} in ${guildId}`, 'Scheduler');
            }
          }
          break;
        }

        case 'UNLOCK': {
          const channelId = data.channelId as string;
          const channel = guild.channels.cache.get(channelId);

          if (channel && 'permissionOverwrites' in channel) {
            const everyoneRole = guild.roles.everyone;
            await (channel as unknown as { permissionOverwrites: { delete: (role: unknown, reason?: string) => Promise<unknown> } })
              .permissionOverwrites.delete(everyoneRole, 'Lock duration expired');
            appLogger.info(`Unlocked channel ${channelId} in ${guildId}`, 'Scheduler');
          }
          break;
        }

        case 'RAID_LOCKDOWN_EXPIRE': {
          const { antiraidModule } = await import('../../modules/antiraid/index.js');
          await antiraidModule.unlock(guild, 'Raid lockdown expired');
          appLogger.info(`Raid lockdown expired for ${guildId}`, 'Scheduler');
          break;
        }

        case 'SECURITY_COOLDOWN': {
          // Security cooldown expired â€” no specific action needed
          appLogger.info(`Security cooldown expired for ${guildId}`, 'Scheduler');
          break;
        }

        case 'TEMP_BAN_EXPIRE': {
          const userId = data.userId as string;
          try {
            await guild.bans.remove(userId, 'Temporary ban expired');
            appLogger.info(`Unbanned ${userId} in ${guildId} (temp ban expired)`, 'Scheduler');
          } catch {
            appLogger.warn(`Could not unban ${userId} in ${guildId}`, 'Scheduler');
          }
          break;
        }

        default:
          appLogger.warn(`Unknown task type: ${type}`, 'Scheduler');
      }
    } catch (error) {
      appLogger.error(`Failed to execute task ${taskId}`, 'Scheduler', {
        error: error instanceof Error ? error.message : String(error),
        type,
        guildId,
      });
    }
  }

  /**
   * Periodic sweep to catch tasks that might have been missed
   * (e.g., timer drift, edge cases).
   */
  private async sweep(): Promise<void> {
    try {
      const overdueTasks = await prisma.scheduledTask.findMany({
        where: {
          completed: false,
          executeAt: { lt: new Date() },
        },
        take: 50, // Process in batches
      });

      for (const task of overdueTasks) {
        if (!this.activeTimers.has(task.id)) {
          appLogger.info(`Sweep caught missed task ${task.id} (${task.type})`, 'Scheduler');
          await this.executeTask(
            task.id,
            task.type,
            task.data as Record<string, unknown>,
            task.guildId,
          );
        }
      }
    } catch (error) {
      appLogger.error('Scheduler sweep failed', 'Scheduler', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const scheduler = new SchedulerService();


