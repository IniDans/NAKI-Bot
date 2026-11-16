import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, Message, TextChannel } from 'discord.js';
import type { Report } from '@prisma/client';
import { db } from '../../services/database/index.js';
import { modConfigService } from '../../services/database/modconfig.service.js';
import { Colors } from '../../config/constants.js';

const prisma = db.client;

/** A reporter may file this many reports per hour, so the menu cannot be used to flood staff. */
export const REPORTS_PER_HOUR = 5;

export const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  ACTIONED: 'Message removed',
  DISMISSED: 'Dismissed',
};

export function reportEmbed(report: Report, guild: Guild): EmbedBuilder {
  const url = `https://discord.com/channels/${guild.id}/${report.channelId}/${report.messageId}`;
  const embed = new EmbedBuilder()
    .setTitle('Message reported')
    .setColor(report.status === 'OPEN' ? Colors.WARNING : report.status === 'ACTIONED' ? Colors.SUCCESS : Colors.LEAVE)
    .addFields(
      { name: 'Author', value: `<@${report.targetId}> (${report.targetId})`, inline: true },
      { name: 'Reporter', value: `<@${report.reporterId}>`, inline: true },
      { name: 'Channel', value: `<#${report.channelId}> · [Jump to message](${url})`, inline: false },
      { name: 'Message', value: (report.content || '*No text content*').slice(0, 1024), inline: false },
      { name: 'Reason', value: (report.reason || '*None given*').slice(0, 1024), inline: false },
    )
    .setTimestamp(report.createdAt);
  if (report.status !== 'OPEN') {
    embed.addFields({
      name: 'Status',
      value: `${STATUS_LABEL[report.status] ?? report.status}${report.handledBy ? ` by <@${report.handledBy}>` : ''}`,
    });
  }
  return embed;
}

export function reportButtons(report: Report): ActionRowBuilder<ButtonBuilder>[] {
  if (report.status !== 'OPEN') return [];
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`report:delete:${report.id}`).setLabel('Delete message').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`report:dismiss:${report.id}`).setLabel('Dismiss').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`logact:warn:${report.targetId}`).setLabel('Warn author').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`logact:timeout:${report.targetId}`).setLabel('Timeout author').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export const reportsModule = {
  /** Returns an error message for the reporter, or the stored report. */
  async create(message: Message<true>, reporterId: string, reason: string | null): Promise<string | Report> {
    const config = await modConfigService.get(message.guildId);
    const channel = config?.reportChannelId ? message.guild.channels.cache.get(config.reportChannelId) : null;
    if (!(channel instanceof TextChannel)) return 'Reports are not set up on this server.';
    if (message.author.id === reporterId) return 'You cannot report your own message.';
    if (message.author.bot) return 'Bot messages cannot be reported.';

    const [duplicate, recent] = await Promise.all([
      prisma.report.findFirst({ where: { guildId: message.guildId, reporterId, messageId: message.id } }),
      prisma.report.count({
        where: { guildId: message.guildId, reporterId, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
      }),
    ]);
    if (duplicate) return 'You already reported this message.';
    if (recent >= REPORTS_PER_HOUR) return 'You have sent a lot of reports recently. Try again later.';

    const content = [message.content, ...message.attachments.map((a) => a.url)].filter(Boolean).join('\n').slice(0, 2000);
    let report = await prisma.report.create({
      data: {
        guildId: message.guildId,
        reporterId,
        targetId: message.author.id,
        channelId: message.channelId,
        messageId: message.id,
        content,
        reason,
      },
    });
    const card = await channel.send({
      embeds: [reportEmbed(report, message.guild)],
      components: reportButtons(report),
      allowedMentions: { parse: [] },
    });
    report = await prisma.report.update({ where: { id: report.id }, data: { logChannelId: channel.id, logMessageId: card.id } });
    return report;
  },

  /** Marks the report handled and refreshes its card in the report channel. */
  async resolve(guild: Guild, reportId: string, status: 'ACTIONED' | 'DISMISSED', moderatorId: string): Promise<Report | null> {
    const existing = await prisma.report.findFirst({ where: { id: reportId, guildId: guild.id } });
    if (!existing) return null;
    const report = await prisma.report.update({
      where: { id: reportId },
      data: { status, handledBy: moderatorId, handledAt: new Date() },
    });
    await this.refreshCard(guild, report);
    return report;
  },

  async refreshCard(guild: Guild, report: Report): Promise<void> {
    if (!report.logChannelId || !report.logMessageId) return;
    const channel = guild.channels.cache.get(report.logChannelId);
    if (!(channel instanceof TextChannel)) return;
    await channel.messages
      .edit(report.logMessageId, { embeds: [reportEmbed(report, guild)], components: reportButtons(report) })
      .catch(() => undefined);
  },
};
