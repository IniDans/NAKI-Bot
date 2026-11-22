import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import { nextLoop, type LoopMode } from '../../modules/music/logic.js';
import type { Command } from '../../types/index.js';

const LABEL: Record<LoopMode, string> = {
  off: '➡️ Loop is off.',
  track: '🔂 Looping the current song.',
  queue: '🔁 Looping the whole queue.',
};

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Repeat the current song or the whole queue')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Leave empty to switch to the next mode')
        .addChoices({ name: 'Off', value: 'off' }, { name: 'Current song', value: 'track' }, { name: 'Whole queue', value: 'queue' }),
    ),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      const mode = (interaction.options.getString('mode') as LoopMode | null) ?? nextLoop(session.loop);
      session.setLoop(mode);
      return LABEL[mode];
    }),
};
export default command;
