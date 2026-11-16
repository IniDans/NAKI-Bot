import { Client, Collection } from 'discord.js';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { appLogger } from './logger.js';
import type { ComponentHandler, ContextCommand } from '../types/index.js';

const srcDir = join(fileURLToPath(new URL('.', import.meta.url)), '..');

/** Default exports of every .ts/.js file directly inside src/<folder>. A file may export one item or an array. */
export async function importFolder<T>(folder: string): Promise<T[]> {
  const dir = join(srcDir, folder);
  if (!existsSync(dir)) return [];
  const items: T[] = [];
  for (const file of readdirSync(dir)) {
    if (!(file.endsWith('.ts') || file.endsWith('.js')) || file.endsWith('.d.ts')) continue;
    try {
      const module = await import(pathToFileURL(join(dir, file)).href);
      const exported = module.default;
      if (Array.isArray(exported)) items.push(...exported);
      else if (exported) items.push(exported);
    } catch (error) {
      appLogger.error(`Failed to load ${folder}/${file}`, 'InteractionLoader', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return items;
}

/** Loads component handlers (src/interactions) and context menu commands (src/context). */
export async function loadInteractions(client: Client): Promise<{ components: number; contextCommands: number }> {
  client.components = new Collection<string, ComponentHandler>();
  client.contextCommands = new Collection<string, ContextCommand>();

  for (const handler of await importFolder<ComponentHandler>('interactions')) {
    if (!handler?.prefix || !handler.execute) continue;
    if (client.components.has(handler.prefix)) appLogger.warn(`Duplicate component prefix: ${handler.prefix}`, 'InteractionLoader');
    client.components.set(handler.prefix, handler);
  }
  for (const command of await importFolder<ContextCommand>('context')) {
    if (!command?.data || !command.execute) continue;
    client.contextCommands.set(command.data.name, command);
  }
  return { components: client.components.size, contextCommands: client.contextCommands.size };
}
