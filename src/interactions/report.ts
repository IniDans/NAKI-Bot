import { PermissionFlagsBits } from 'discord.js';
import { reportsModule } from '../modules/reports/index.js';
import { embedUtils } from '../utils/embed.js';
import type { ComponentHandler } from '../types/index.js';

/**
 * report:submit:<channelId>:<messageId>  modal from the "Report message" context menu
 * report:delete:<reportId>               delete the reported message and close the report
 * report:dismiss:<reportId>              close the report without action
 */
const handler: ComponentHandler = {
  prefix: 'report',
  async execute(interaction, [step, a, b]) {
    if (!interaction.inCachedGuild()) return;

    if (step === 'submit' && interaction.isModalSubmit()) {
      const channel = interaction.guild.channels.cache.get(a);
      const message = channel?.isTextBased() ? await channel.messages.fetch(b).catch(() => null) : null;
      if (!message?.inGuild()) {
        await interaction.reply({
          embeds: [embedUtils.error('Message Gone', 'That message no longer exists.')],
          ephemeral: true,
        });
        return;
      }
      const reason = interaction.fields.getTextInputValue('reason').trim() || null;
      const result = await reportsModule.create(message, interaction.user.id, reason);
      await interaction.reply({
        embeds: [
          typeof result === 'string'
            ? embedUtils.error('Not Sent', result)
            : embedUtils.success('Report Sent', 'Thanks. The moderators will take a look.'),
        ],
        ephemeral: true,
      });
      return;
    }

    if (!interaction.isButton() || (step !== 'delete' && step !== 'dismiss')) return;
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({
        embeds: [embedUtils.error('Permission Denied', 'You need Manage Messages to handle reports.')],
        ephemeral: true,
      });
      return;
    }
    await interaction.deferUpdate();
    if (step === 'delete') {
      const report = await reportsModule.resolve(interaction.guild, a, 'ACTIONED', interaction.user.id);
      if (!report) return;
      const channel = interaction.guild.channels.cache.get(report.channelId);
      if (channel?.isTextBased()) await channel.messages.delete(report.messageId).catch(() => undefined);
    } else {
      await reportsModule.resolve(interaction.guild, a, 'DISMISSED', interaction.user.id);
    }
  },
};

export default handler;
