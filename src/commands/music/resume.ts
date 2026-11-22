import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Continue a paused song'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      if (!session.current) return 'Nothing is playing.';
      if (!session.paused) return 'The music is not paused.';
      session.resume();
      void session.refreshPanel();
      return '▶️ Resumed.';
    }),
};
export default command;
