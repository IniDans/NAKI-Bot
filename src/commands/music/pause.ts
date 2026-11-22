import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause the music, or continue it if it is already paused'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      if (!session.current) return 'Nothing is playing. Start something with `/play`.';
      const paused = session.togglePause();
      void session.refreshPanel();
      return paused ? '⏸️ Paused. Use `/pause` again to continue.' : '▶️ Playing again.';
    }),
};
export default command;
