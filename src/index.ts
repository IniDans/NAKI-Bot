import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
} from 'discord.js';
import { env } from './config/env.js';
import { appLogger } from './utils/logger.js';
import { loadCommands } from './utils/commandLoader.js';
import { loadEvents } from './utils/eventLoader.js';
import { db } from './services/database/index.js';
import { scheduler } from './services/scheduler/index.js';
import type { Command } from './types/index.js';

// ─── Create Client ──────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildIntegrations,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
  ],
});

// Initialize commands collection
client.commands = new Collection<string, Command>();

// ─── Startup ────────────────────────────────────────────────────────────────

async function main() {
  try {
    appLogger.info('Starting NAKI Bot...', 'Boot');

    // Connect to database
    await db.connect();
    appLogger.info('Database connected', 'Boot');

    // Load commands
    const commandCount = await loadCommands(client);
    appLogger.info(`Loaded ${commandCount} commands`, 'Boot');

    // Load events
    const eventCount = await loadEvents(client);
    appLogger.info(`Loaded ${eventCount} events`, 'Boot');

    // Login to Discord
    await client.login(env.DISCORD_TOKEN);
  } catch (error) {
    appLogger.fatal('Failed to start bot', 'Boot', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// ─── Client Ready ───────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (readyClient) => {
  appLogger.info(`Bot online as ${readyClient.user.tag}`, 'Boot', {
    guilds: readyClient.guilds.cache.size,
    users: readyClient.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
  });

  // Rehydrate scheduled tasks from DB
  try {
    await scheduler.rehydrate(readyClient);
    appLogger.info('Scheduler rehydrated', 'Boot');
  } catch (error) {
    appLogger.error('Failed to rehydrate scheduler', 'Boot', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function shutdown(signal: string) {
  appLogger.info(`Received ${signal}, shutting down...`, 'Shutdown');
  scheduler.cancelAll();
  client.destroy();
  await db.disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── Unhandled Errors ───────────────────────────────────────────────────────

process.on('unhandledRejection', (error) => {
  appLogger.error('Unhandled promise rejection', 'Process', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});

process.on('uncaughtException', (error) => {
  appLogger.fatal('Uncaught exception', 'Process', {
    error: error.message,
    stack: error.stack,
  });
  // Exit on uncaught exceptions — the process manager should restart
  process.exit(1);
});

// ─── Start ──────────────────────────────────────────────────────────────────

main();

export { client };
