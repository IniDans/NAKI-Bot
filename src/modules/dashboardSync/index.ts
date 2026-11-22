import type { Client } from 'discord.js';
import { db } from '../../services/database/index.js';
import { modConfigService } from '../../services/database/modconfig.service.js';
import { verificationService } from '../../services/database/verification.service.js';
import { appLogger } from '../../utils/logger.js';
import { autoMessagesModule } from '../automessages/index.js';
import { automodModule } from '../automod/index.js';
import { giveawaysModule } from '../giveaways/index.js';
import { levelingModule } from '../leveling/index.js';
import { statsModule } from '../stats/index.js';
import { tempVoiceModule } from '../tempvoice/index.js';
import { changedGuilds } from './logic.js';

/**
 * Picks up dashboard saves within a couple of seconds. The dashboard bumps
 * `Guild.updatedAt` after every successful save (the bot's own upserts never
 * touch it), and this polls that column: one indexed query on a single pooled
 * connection, so it stays light on the shared MySQL host.
 */

const POLL_MS = 2_000;
const ERROR_LOG_EVERY_MS = 5 * 60_000;

const prisma = db.client;
let timer: NodeJS.Timeout | null = null;
let running = false;
let seen: Map<string, number> | null = null;
let lastErrorLog = 0;

/** Throw away everything cached for the guild and act on time-based changes now. */
function apply(client: Client, guildId: string): void {
  autoMessagesModule.invalidate(guildId);
  automodModule.invalidate(guildId);
  levelingModule.invalidate(guildId);
  tempVoiceModule.invalidate(guildId);
  modConfigService.invalidate(guildId);
  verificationService.invalidate(guildId);
  autoMessagesModule.runDueNow(client);
  giveawaysModule.pollNow();
  statsModule.updateNow(client);
}

async function poll(client: Client): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await prisma.guild.findMany({
      where: { guildId: { in: [...client.guilds.cache.keys()] } },
      select: { guildId: true, updatedAt: true },
    });
    const { changed, next } = changedGuilds(seen, rows);
    seen = next;
    for (const guildId of changed) {
      appLogger.info('Dashboard change picked up', 'DashboardSync', { guildId });
      apply(client, guildId);
    }
  } catch (error) {
    if (Date.now() - lastErrorLog > ERROR_LOG_EVERY_MS) {
      lastErrorLog = Date.now();
      appLogger.warn('Dashboard change poll failed', 'DashboardSync', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } finally {
    running = false;
  }
}

export const dashboardSyncModule = {
  start(client: Client): void {
    dashboardSyncModule.stop();
    void poll(client);
    timer = setInterval(() => void poll(client), POLL_MS);
    timer.unref();
  },

  stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
  },
};
