import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { env } from '../../config/env.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

/** All bot settings (welcome, logs, AutoMod, security…) live on the dashboard website. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Open the website where you change all of NAKI’s settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  guildOnly: true,

  async execute(interaction) {
    if (!env.DASHBOARD_URL) {
      await interaction.reply({
        embeds: [embedUtils.error('No Dashboard', 'The bot owner has not set up the dashboard website yet.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const url = `${env.DASHBOARD_URL}/dashboard/${interaction.guildId}`;
    const button = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open dashboard').setURL(url);
    await interaction.reply({
      embeds: [
        embedUtils.info(
          'NAKI Dashboard',
          [
            'Change welcome messages, logs, AutoMod, security, levels and more for this server.',
            'Log in with your Discord account. Changes reach the bot within a few seconds.',
            '',
            'Want a moderator to help? A server admin can give them access from the **Akses dashboard** page.',
          ].join('\n'),
        ),
      ],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
