import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop the music, empty the queue and make the bot leave'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      session.destroy();
      return '⏹️ Music stopped. See you next time!';
    }),
};
export default command;
