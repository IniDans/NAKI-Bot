import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the current song'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      if (!session.current) return 'Nothing is playing.';
      if (session.paused) return 'Already paused. Use `/resume` to continue.';
      session.pause();
      void session.refreshPanel();
      return '⏸️ Paused.';
    }),
};
export default command;
