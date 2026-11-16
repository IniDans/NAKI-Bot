import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { levelingModule } from '../../modules/leveling/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Show the members with the most XP'),
  rateLimitCategory: 'DEFAULT',
  guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    if (!(await levelingModule.isEnabled(guildId))) {
      await interaction.reply({
        embeds: [embedUtils.error('Leveling Is Off', 'An admin can turn it on from the NAKI dashboard.')],
        ephemeral: true,
      });
      return;
    }
    const rows = await levelingModule.leaderboard(guildId, 10);
    if (rows.length === 0) {
      await interaction.reply({ embeds: [embedUtils.info('Leaderboard', 'Nobody has earned XP yet.')] });
      return;
    }
    const lines = rows.map(
      (r, i) => `**${i + 1}.** <@${r.userId}> · level ${r.level} · ${r.xp.toLocaleString('en-US')} XP`,
    );
    await interaction.reply({
      embeds: [embedUtils.info(`Leaderboard · ${interaction.guild!.name}`, lines.join('\n'))],
      allowedMentions: { parse: [] },
    });
  },
};
export default command;
