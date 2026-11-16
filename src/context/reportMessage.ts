import {
  ActionRowBuilder,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  InteractionContextType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { modConfigService } from '../services/database/modconfig.service.js';
import { embedUtils } from '../utils/embed.js';
import type { ContextCommand } from '../types/index.js';

const command: ContextCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('Report message')
    .setType(ApplicationCommandType.Message)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    if (!interaction.isMessageContextMenuCommand() || !interaction.inCachedGuild()) return;
    const config = await modConfigService.get(interaction.guildId);
    if (!config?.reportChannelId) {
      await interaction.reply({
        embeds: [embedUtils.warning('Reports Off', 'Reports are not set up on this server.')],
        ephemeral: true,
      });
      return;
    }
    const target = interaction.targetMessage;
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`report:submit:${target.channelId}:${target.id}`)
        .setTitle('Report message')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('reason')
              .setLabel('What is wrong with this message?')
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(500)
              .setRequired(false),
          ),
        ),
    );
  },
};

export default command;
