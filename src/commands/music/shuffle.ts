import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the songs in the queue'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      if (session.queue.length < 2) return 'There are fewer than 2 songs in the queue.';
      session.shuffle();
      return `🔀 Shuffled ${session.queue.length} songs.`;
    }),
};
export default command;
