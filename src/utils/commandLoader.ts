import { Client, Collection } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { appLogger } from './logger.js';
import type { Command } from '../types/index.js';

/**
 * Recursively loads all command files from src/commands/.
 * Each command file must default-export a Command object.
 */
export async function loadCommands(client: Client): Promise<number> {
  client.commands = new Collection<string, Command>();

  const commandsPath = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'commands');
  let count = 0;

  try {
    const categories = readdirSync(commandsPath);

    for (const category of categories) {
      const categoryPath = join(commandsPath, category);
      if (!statSync(categoryPath).isDirectory()) continue;

      const commandFiles = readdirSync(categoryPath).filter(
        (file) => (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts'),
      );

      for (const file of commandFiles) {
        const filePath = join(categoryPath, file);
        try {
          const fileUrl = pathToFileURL(filePath).href;
          const module = await import(fileUrl);
          const command: Command = module.default ?? module.command;

          if (!command?.data || !command?.execute) {
            appLogger.warn(`Skipping ${file} â€” missing 'data' or 'execute'`, 'CommandLoader');
            continue;
          }

          const commandName = command.data.name;
          client.commands.set(commandName, command);
          count++;

          appLogger.debug(`Loaded command: /${commandName}`, 'CommandLoader');
        } catch (error) {
          appLogger.error(`Failed to load command: ${file}`, 'CommandLoader', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    // Commands directory might not exist yet during initial scaffold
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      appLogger.warn('Commands directory not found â€” skipping command loading', 'CommandLoader');
    } else {
      throw error;
    }
  }

  return count;
}


