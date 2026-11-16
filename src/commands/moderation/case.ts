import { ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { db } from '../../services/database/index.js';
import { auditService } from '../../services/audit/index.js';
import { countActiveWarnings } from '../../modules/moderation/escalation.js';
import { embedUtils } from '../../utils/embed.js';
import { formatDuration } from '../../utils/duration.js';
import { Colors } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
const ts = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:f>`;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('View and manage moderation cases')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('Show one case')
        .addIntegerOption((o) => o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('reason')
        .setDescription('Change the reason of a case')
        .addIntegerOption((o) => o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1))
        .addStringOption((o) => o.setName('reason').setDescription('New reason').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a case (requires Manage Server)')
        .addIntegerOption((o) => o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('history')
        .setDescription("Show a user's moderation history")
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    ),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();

    if (sub === 'history') {
      const user = interaction.options.getUser('user', true);
      const [cases, activeWarnings, totalWarnings, notes] = await Promise.all([
        prisma.moderationCase.findMany({ where: { guildId, userId: user.id }, orderBy: { caseNumber: 'desc' }, take: 15 }),
        countActiveWarnings(guildId, user.id),
        prisma.warning.count({ where: { guildId, userId: user.id } }),
        prisma.modNote.count({ where: { guildId, userId: user.id } }),
      ]);
      const lines = cases.map(
        (c) => `\`#${c.caseNumber}\` **${c.action}**${c.duration ? ` (${formatDuration(c.duration)})` : ''} - ${c.reason ?? 'No reason'} - ${ts(c.createdAt)}`,
      );
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`History for ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(lines.length ? lines.join('\n').slice(0, 4000) : 'No cases on record.')
        .addFields(
          { name: 'Warnings', value: activeWarnings === totalWarnings ? String(totalWarnings) : `${activeWarnings} active / ${totalWarnings} total`, inline: true },
          { name: 'Notes', value: notes ? `${notes} (see /note list)` : '0', inline: true },
          { name: 'Account created', value: ts(user.createdAt), inline: true },
        )
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const number = interaction.options.getInteger('number', true);
    const modCase = await auditService.getCase(guildId, number);
    if (!modCase) {
      await interaction.reply({ embeds: [embedUtils.error('Not Found', `Case #${number} does not exist.`)], ephemeral: true });
      return;
    }

    if (sub === 'view') {
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`Case #${modCase.caseNumber}: ${modCase.action}`)
        .addFields(
          { name: 'User', value: `<@${modCase.userId}> (${modCase.userId})`, inline: true },
          { name: 'Moderator', value: `<@${modCase.moderatorId}>`, inline: true },
          { name: 'Duration', value: modCase.duration ? formatDuration(modCase.duration) : '-', inline: true },
          { name: 'Reason', value: modCase.reason ?? 'No reason provided' },
          { name: 'Created', value: ts(modCase.createdAt), inline: true },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
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
      await interaction.reply({ embeds: [embedUtils.success('Case Updated', `Reason for case #${number} changed.`)], ephemeral: true });
      return;
    }

    if (sub === 'delete') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ embeds: [embedUtils.error('Permission Denied', 'Deleting cases requires Manage Server.')], ephemeral: true });
        return;
      }
      await prisma.moderationCase.delete({ where: { id: modCase.id } });
      await interaction.reply({ embeds: [embedUtils.success('Case Deleted', `Case #${number} was removed.`)], ephemeral: true });
    }
  },
};

export default command;
