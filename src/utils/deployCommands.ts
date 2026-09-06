import { REST, Routes } from 'discord.js';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { config } from 'dotenv';
import type { Command } from '../types/index.js';

config();
const __dirname = dirname(fileURLToPath(import.meta.url));

async function deployCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  if (!token || !clientId) {
    console.error('DISCORD_TOKEN and CLIENT_ID must be set in .env');
    process.exit(1);
  }

  const commands: unknown[] = [];
  const commandsPath = join(__dirname, '..', 'commands');
  try {
    for (const category of readdirSync(commandsPath)) {
      const categoryPath = join(commandsPath, category);
      if (!statSync(categoryPath).isDirectory()) continue;
      const commandFiles = readdirSync(categoryPath).filter((file) => (file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts'));
      for (const file of commandFiles) {
        const module = await import(pathToFileURL(join(categoryPath, file)).href);
        const command: Command = module.default ?? module.command;
        if (command?.data) {
          commands.push(command.data.toJSON());
          console.log(`Loaded: /${command.data.name}`);
        }
      }
    }
  } catch (error) {
    console.error('Failed to load commands:', error);
    process.exit(1);
  }

  try {
    console.log(`Registering ${commands.length} application commands...`);
    await new REST().setToken(token).put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`Successfully registered ${commands.length} application commands.`);
  } catch (error) {
    console.error('Failed to register commands:', error);
    process.exit(1);
  }
}

deployCommands();
