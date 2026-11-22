import { SlashCommandBuilder } from 'discord.js';
import { withSession } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove a song from the queue')
    .addIntegerOption((o) => o.setName('position').setDescription('Its number in /queue').setRequired(true).setMinValue(1)),
  guildOnly: true,
  execute: (interaction) =>
    withSession(interaction, (session) => {
      const removed = session.remove(interaction.options.getInteger('position', true));
      return removed ? `🗑️ Removed **${removed.title}**.` : 'There is no song at that position. Check `/queue`.';
    }),
};
export default command;
