import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { db } from '../../services/database/index.js';
import { auditService } from '../../services/audit/index.js';
import { embedUtils } from '../../utils/embed.js';
import { formatDuration } from '../../utils/duration.js';
import { Colors } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
const ts = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:f>`;
const numberOption = (o: import('discord.js').SlashCommandIntegerOption) =>
  o.setName('number').setDescription('The case number, e.g. 12 (find it with /history)').setRequired(true).setMinValue(1);

/** Every ban, kick, timeout and warning gets a numbered case. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Look at or fix one moderation case')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) => sub.setName('view').setDescription('Show the details of a case').addIntegerOption(numberOption))
    .addSubcommand((sub) =>
      sub
        .setName('reason')
        .setDescription('Change the reason written on a case')
        .addIntegerOption(numberOption)
        .addStringOption((o) => o.setName('reason').setDescription('The new reason').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((sub) =>
      sub.setName('delete').setDescription('Delete a case made by mistake (needs Manage Server)').addIntegerOption(numberOption),
    ),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();
    const number = interaction.options.getInteger('number', true);
    const modCase = await auditService.getCase(guildId, number);
    if (!modCase) {
      await interaction.reply({
        embeds: [embedUtils.error('Case Not Found', `There is no case #${number}. Use \`/history\` to find the right number.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`Case #${modCase.caseNumber}: ${modCase.action}`)
        .addFields(
          { name: 'Member', value: `<@${modCase.userId}> (${modCase.userId})`, inline: true },
          { name: 'Moderator', value: `<@${modCase.moderatorId}>`, inline: true },
          { name: 'Duration', value: modCase.duration ? formatDuration(modCase.duration) : '-', inline: true },
          { name: 'Reason', value: modCase.reason ?? 'No reason given' },
          { name: 'When', value: ts(modCase.createdAt), inline: true },
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'reason') {
      const reason = interaction.options.getString('reason', true);
      await prisma.moderationCase.update({
        where: { id: modCase.id },
        data: {
          reason,
          metadata: {
            ...((modCase.metadata as Record<string, unknown> | null) ?? {}),
            reasonEditedBy: interaction.user.id,
            reasonEditedAt: new Date().toISOString(),
          },
        },
      });
      await interaction.reply({
        embeds: [embedUtils.success('Reason Changed', `Case #${number} now says: ${reason}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        embeds: [embedUtils.error('Not Allowed', 'Only people with the Manage Server permission can delete cases.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await prisma.moderationCase.delete({ where: { id: modCase.id } });
    await interaction.reply({ embeds: [embedUtils.success('Case Deleted', `Case #${number} was deleted.`)], flags: MessageFlags.Ephemeral });
  },
};

export default command;
