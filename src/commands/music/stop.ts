import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop the music, clear the queue and leave the voice channel'),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      session.destroy();
      return '⏹️ Stopped the music and left the voice channel.';
    }),
};
export default command;
