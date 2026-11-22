import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { db } from '../../services/database/index.js';
import { countActiveWarnings } from '../../modules/moderation/escalation.js';
import { formatDuration } from '../../utils/duration.js';
import { Colors } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
const ts = (date: Date, style = 'f') => `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Everything moderators know about one person: past actions, warnings and private notes. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription("See someone's past bans, kicks, timeouts, warnings and notes")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('member').setDescription('Whose history to show').setRequired(true)),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,

  async execute(interaction) {
    const guildId = interaction.guildId!;
    const user = interaction.options.getUser('member', true);
    const [cases, caseTotal, activeWarnings, totalWarnings, notes, noteTotal] = await Promise.all([
      prisma.moderationCase.findMany({ where: { guildId, userId: user.id }, orderBy: { caseNumber: 'desc' }, take: 10 }),
      prisma.moderationCase.count({ where: { guildId, userId: user.id } }),
      countActiveWarnings(guildId, user.id),
      prisma.warning.count({ where: { guildId, userId: user.id } }),
      prisma.modNote.findMany({ where: { guildId, userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
      prisma.modNote.count({ where: { guildId, userId: user.id } }),
    ]);

    const caseLines = cases.map(
      (c) =>
        `\`#${c.caseNumber}\` **${c.action}**${c.duration ? ` (${formatDuration(c.duration)})` : ''} · ${short(c.reason ?? 'No reason', 80)} · ${ts(c.createdAt, 'd')}`,
    );
    const noteLines = notes.map((n) => `• ${short(n.content, 150)} - <@${n.moderatorId}> ${ts(n.createdAt, 'R')}`);

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(`History of ${user.tag}`)
      .setThumbnail(user.displayAvatarURL())
      .setDescription(
        caseLines.length
          ? `${caseLines.join('\n')}${caseTotal > cases.length ? `\n*…and ${caseTotal - cases.length} older. See them all on the dashboard.*` : ''}`
          : 'Clean record: no bans, kicks, timeouts or warnings.',
      )
      .addFields(
        {
          name: 'Warnings',
          value: activeWarnings === totalWarnings ? String(totalWarnings) : `${activeWarnings} still count / ${totalWarnings} total`,
          inline: true,
        },
        { name: 'Account created', value: ts(user.createdAt, 'D'), inline: true },
        {
          name: `Private notes (${noteTotal})`,
          value: noteLines.length
            ? `${noteLines.join('\n')}${noteTotal > notes.length ? `\n*…and ${noteTotal - notes.length} older.*` : ''}`.slice(0, 1024)
            : 'None. Add one with `/note add`.',
        },
      )
      .setFooter({ text: 'Only you can see this · /case to look at or edit one case' });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export default command;
