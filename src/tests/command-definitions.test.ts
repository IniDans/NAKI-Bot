import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Discord rejects the whole command registration (DiscordAPIError 50035) when one
// command breaks a rule, so check the rules discord.js builders don't enforce.

interface OptionJson {
  name: string;
  type: number;
  required?: boolean;
  options?: OptionJson[];
}

const SUB_COMMAND = 1;
const SUB_COMMAND_GROUP = 2;
const commandsPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands');

async function loadCommands(): Promise<{ name: string; options?: OptionJson[] }[]> {
  const out: { name: string; options?: OptionJson[] }[] = [];
  for (const category of readdirSync(commandsPath)) {
    const categoryPath = join(commandsPath, category);
    if (!statSync(categoryPath).isDirectory()) continue;
    for (const file of readdirSync(categoryPath).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
      const module = await import(pathToFileURL(join(categoryPath, file)).href);
      const command = module.default ?? module.command;
      if (command?.data) out.push(command.data.toJSON());
    }
  }
  return out;
}

/** Paths like "/embed send" where a required option comes after an optional one. */
function requiredAfterOptional(path: string, options: OptionJson[] = []): string[] {
  const problems: string[] = [];
  let seenOptional = false;
  for (const option of options) {
    if (option.type === SUB_COMMAND || option.type === SUB_COMMAND_GROUP) {
      problems.push(...requiredAfterOptional(`${path} ${option.name}`, option.options));
      continue;
    }
    if (option.required && seenOptional) problems.push(`${path}: "${option.name}"`);
    if (!option.required) seenOptional = true;
  }
  return problems;
}

describe('slash command definitions', () => {
  it('place required options before optional ones', async () => {
    const commands = await loadCommands();
    expect(commands.length).toBeGreaterThan(0);
    const problems = commands.flatMap((c) => requiredAfterOptional(`/${c.name}`, c.options));
    expect(problems).toEqual([]);
  });
});
