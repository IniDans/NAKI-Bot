import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { musicModule } from '../../modules/music/index.js';
import { queueControls, queueEmbed } from '../../modules/music/panel.js';
import { replyError } from '../../modules/music/commands.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('See the song list, and shuffle, loop or remove songs'),
  guildOnly: true,
  async execute(interaction) {
    const session = musicModule.get(interaction.guildId!);
    if (!session?.current) return replyError(interaction, 'Nothing is playing. Start something with `/play`.');
    const state = session.state();
    await interaction.reply({ embeds: [queueEmbed(state)], components: queueControls(state), flags: MessageFlags.Ephemeral });
  },
};
export default command;
