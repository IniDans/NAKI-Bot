import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      const title = session.current?.title;
      return session.skip() ? `⏭️ Skipped **${title}**.` : 'Nothing is playing.';
    }),
};
export default command;
