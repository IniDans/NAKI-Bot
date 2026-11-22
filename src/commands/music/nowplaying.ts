import { SlashCommandBuilder } from 'discord.js';
import { musicModule } from '../../modules/music/index.js';
import { nowPlayingEmbed } from '../../modules/music/panel.js';
import { replyError } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current song and how far along it is'),
  guildOnly: true,
  async execute(interaction) {
    const session = musicModule.get(interaction.guildId!);
    if (!session?.current) return replyError(interaction, 'Nothing is playing right now.');
    await interaction.reply({ embeds: [nowPlayingEmbed(session.state(), true)] });
  },
};
export default command;
