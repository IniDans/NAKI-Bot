import { Client } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { appLogger } from './logger.js';
import type { Event } from '../types/index.js';

/**
 * Recursively loads all event files from src/events/.
 * Each event file must default-export an Event object.
 */
export async function loadEvents(client: Client): Promise<number> {
  const eventsPath = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'events');
  let count = 0;

  try {
    const categories = readdirSync(eventsPath);

    for (const category of categories) {
      const categoryPath = join(eventsPath, category);
      if (!statSync(categoryPath).isDirectory()) continue;

      const eventFiles = readdirSync(categoryPath).filter(
        (file) => (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts'),
      );

      for (const file of eventFiles) {
        const filePath = join(categoryPath, file);
        try {
          const fileUrl = pathToFileURL(filePath).href;
          const module = await import(fileUrl);
          const event: Event = module.default ?? module.event;

          if (!event?.name || !event?.execute) {
            appLogger.warn(`Skipping ${file} â€” missing 'name' or 'execute'`, 'EventLoader');
            continue;
          }

          if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
          } else {
            client.on(event.name, (...args) => event.execute(...args));
          }

          count++;
          appLogger.debug(`Loaded event: ${event.name} (${category}/${file})`, 'EventLoader');
        } catch (error) {
          appLogger.error(`Failed to load event: ${file}`, 'EventLoader', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      appLogger.warn('Events directory not found â€” skipping event loading', 'EventLoader');
    } else {
      throw error;
    }
  }

  return count;
}


