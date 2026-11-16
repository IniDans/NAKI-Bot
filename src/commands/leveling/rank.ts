import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { levelingModule } from '../../modules/leveling/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

function bar(current: number, needed: number, width = 16): string {
  const filled = Math.round((current / needed) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your level and XP, or another member’s')
    .addUserOption((o) => o.setName('member').setDescription('Member to look up')),
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
    const user = interaction.options.getUser('member') ?? interaction.user;
    const rank = await levelingModule.rankOf(guildId, user.id);
    if (!rank) {
      await interaction.reply({
        embeds: [embedUtils.info(`${user.username}`, 'No XP yet. Chatting in the server earns XP.')],
        ephemeral: true,
      });
      return;
    }
    const embed = embedUtils
      .info(`${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'Level', value: String(rank.level), inline: true },
        { name: 'Rank', value: `#${rank.position}`, inline: true },
        { name: 'Total XP', value: rank.xp.toLocaleString('en-US'), inline: true },
        {
          name: `Progress to level ${rank.level + 1}`,
          value: `\`${bar(rank.current, rank.needed)}\` ${rank.current} / ${rank.needed} XP`,
        },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
export default command;
