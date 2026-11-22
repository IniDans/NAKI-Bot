import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { musicModule } from '../../modules/music/index.js';
import { queueEmbed } from '../../modules/music/panel.js';
import { replyError } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Show the songs waiting to play')
    .addIntegerOption((o) => o.setName('page').setDescription('Page number').setMinValue(1)),
  guildOnly: true,
  async execute(interaction) {
    const session = musicModule.get(interaction.guildId!);
    if (!session?.current) return replyError(interaction, 'Nothing is playing right now.');
    await interaction.reply({
      embeds: [queueEmbed(session.state(), interaction.options.getInteger('page') ?? 1)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
export default command;
