import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { verificationService } from '../services/database/verification.service.js';
import { CAPTCHA_MAX_ATTEMPTS, CAPTCHA_TTL_MS, verificationModule } from '../modules/verification/index.js';
import { CAPTCHA_LENGTH } from '../modules/verification/captcha.js';
import { embedUtils } from '../utils/embed.js';
import type { ComponentHandler } from '../types/index.js';

/**
 * verify:start   button on the panel message posted from the dashboard
 * verify:answer  button under the captcha image, opens the modal
 * verify:submit  modal with the typed code
 */
const handler: ComponentHandler = {
  prefix: 'verify',
  async execute(interaction, [step]) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const config = await verificationService.get(interaction.guildId);
    if (!config?.enabled) {
      await interaction.reply({ embeds: [embedUtils.warning('Verification Off', 'Verification is not active on this server.')], ephemeral: true });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (await verificationModule.isVerified(member, config)) {
      await interaction.reply({ embeds: [embedUtils.info('Already Verified', 'You already have access to the server.')], ephemeral: true });
      return;
    }

    if (step === 'start') {
      if (config.mode !== 'CAPTCHA') {
        await verificationModule.complete(member, config);
        await interaction.reply({ embeds: [embedUtils.success('Verified', 'Welcome in. You now have access to the server.')], ephemeral: true });
        return;
      }
      const image = verificationModule.newCaptcha(interaction.guildId, member.id);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('verify:answer').setLabel('Enter code').setStyle(ButtonStyle.Primary),
      );
      await interaction.reply({
        content: `Type the ${CAPTCHA_LENGTH} characters shown in the image. The code expires in ${CAPTCHA_TTL_MS / 60_000} minutes and you have ${CAPTCHA_MAX_ATTEMPTS} attempts.`,
        files: [image],
        components: [row],
        ephemeral: true,
      });
      return;
    }

    if (step === 'answer' && interaction.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId('verify:submit')
        .setTitle('Verification')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('code')
              .setLabel('Code from the image')
              .setStyle(TextInputStyle.Short)
              .setMinLength(CAPTCHA_LENGTH)
              .setMaxLength(CAPTCHA_LENGTH + 4)
              .setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    if (step === 'submit' && interaction.isModalSubmit()) {
      const result = verificationModule.checkCaptcha(interaction.guildId, member.id, interaction.fields.getTextInputValue('code'));
      if (result === 'ok') {
        await verificationModule.complete(member, config);
        await interaction.reply({ embeds: [embedUtils.success('Verified', 'Welcome in. You now have access to the server.')], ephemeral: true });
      } else if (result === 'wrong') {
        await interaction.reply({ embeds: [embedUtils.error('Wrong Code', 'That code does not match. Try again with the same image.')], ephemeral: true });
      } else {
        const why = result === 'locked' ? 'Too many wrong answers.' : 'The code expired.';
        await interaction.reply({ embeds: [embedUtils.error('Start Again', `${why} Press Verify on the panel to get a new code.`)], ephemeral: true });
      }
    }
  },
};

export default handler;
