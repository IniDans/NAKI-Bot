import type { Prisma } from '@prisma/client';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType, EmbedBuilder, TextChannel } from 'discord.js';
import { db } from '../../services/database/index.js';
import { embedUtils } from '../../utils/embed.js';
import { Colors, DiscordLimits } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
function makeEmbed(interaction: ChatInputCommandInteraction): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(Colors.INFO).setTimestamp();
  const title = interaction.options.getString('title'); const description = interaction.options.getString('description'); const color = interaction.options.getString('color');
  if (title) embed.setTitle(title.slice(0, DiscordLimits.EMBED_TITLE)); if (description) embed.setDescription(description.slice(0, DiscordLimits.EMBED_DESCRIPTION));
  if (color) { const parsed = Number.parseInt(color.replace(/^#/, ''), 16); if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffff) embed.setColor(parsed); }
  const footer = interaction.options.getString('footer'); if (footer) embed.setFooter({ text: footer.slice(0, DiscordLimits.EMBED_FOOTER) });
  const image = interaction.options.getString('image'); if (image) embed.setImage(image);
  return embed;
}
const command: Command = {
  data: new SlashCommandBuilder().setName('embed').setDescription('Create and send embeds').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName('preview').setDescription('Preview an embed')
      .addStringOption((o) => o.setName('title').setDescription('Title'))
      .addStringOption((o) => o.setName('description').setDescription('Description').setRequired(true))
      .addStringOption((o) => o.setName('color').setDescription('Hex color, e.g. #5865F2'))
      .addStringOption((o) => o.setName('footer').setDescription('Footer'))
      .addStringOption((o) => o.setName('image').setDescription('Image URL')))
    .addSubcommand((s) => s.setName('send').setDescription('Send an embed to a channel')
      .addChannelOption((o) => o.setName('channel').setDescription('Destination').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('title').setDescription('Title'))
      .addStringOption((o) => o.setName('description').setDescription('Description').setRequired(true))
      .addStringOption((o) => o.setName('color').setDescription('Hex color'))
      .addStringOption((o) => o.setName('footer').setDescription('Footer'))
      .addStringOption((o) => o.setName('image').setDescription('Image URL')))
    .addSubcommand((s) => s.setName('template-save').setDescription('Save an embed template')
      .addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true))
      .addStringOption((o) => o.setName('title').setDescription('Title'))
      .addStringOption((o) => o.setName('description').setDescription('Description').setRequired(true))
      .addStringOption((o) => o.setName('color').setDescription('Hex color'))
      .addStringOption((o) => o.setName('footer').setDescription('Footer'))
      .addStringOption((o) => o.setName('image').setDescription('Image URL')))
    .addSubcommand((s) => s.setName('template-load').setDescription('Load a saved template').addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true)))
    .addSubcommand((s) => s.setName('template-delete').setDescription('Delete a saved template').addStringOption((o) => o.setName('name').setDescription('Template name').setRequired(true)))
    .addSubcommand((s) => s.setName('template-list').setDescription('List saved templates')),
  requiredPermissions: [PermissionFlagsBits.ManageMessages], rateLimitCategory: 'ADMIN', guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!; const sub = interaction.options.getSubcommand();
    if (sub === 'preview') { await interaction.reply({ embeds: [makeEmbed(interaction)], ephemeral: true }); return; }
    if (sub === 'send') { const channel = interaction.options.getChannel('channel', true); if (!(channel instanceof TextChannel)) throw new Error('Destination is not a text channel.'); await channel.send({ embeds: [makeEmbed(interaction)], allowedMentions: { parse: [] } }); await interaction.reply({ embeds: [embedUtils.success('Embed Sent', `Embed sent to <#${channel.id}>.`)], ephemeral: true }); return; }
    if (sub === 'template-list') { const templates = await prisma.embedTemplate.findMany({ where: { guildId }, orderBy: { name: 'asc' } }); await interaction.reply({ embeds: [embedUtils.info('Embed Templates', templates.length ? templates.map((template: { name: string; id: string }) => `**${template.name}** — \`${template.id}\``).join('\n') : 'No templates saved.')], ephemeral: true }); return; }
    const name = interaction.options.getString('name', true).trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9_-]{0,31}$/u.test(name)) throw new Error('Template name must be 1-32 characters: letters, numbers, `_` or `-`.');
    if (sub === 'template-delete') { const deleted = await prisma.embedTemplate.deleteMany({ where: { guildId, name } }); await interaction.reply({ embeds: [deleted.count ? embedUtils.success('Template Deleted', `Deleted **${name}**.`) : embedUtils.error('Not Found', 'Template not found.')], ephemeral: true }); return; }
    if (sub === 'template-load') { const template = await prisma.embedTemplate.findUnique({ where: { guildId_name: { guildId, name } } }); if (!template) { await interaction.reply({ embeds: [embedUtils.error('Not Found', 'Template not found.')], ephemeral: true }); return; } await interaction.reply({ embeds: [new EmbedBuilder(template.data as ConstructorParameters<typeof EmbedBuilder>[0])], ephemeral: true }); return; }
    const data = makeEmbed(interaction).toJSON(); const template = await prisma.embedTemplate.upsert({ where: { guildId_name: { guildId, name } }, update: { data: data as Prisma.InputJsonValue, createdBy: interaction.user.id }, create: { guildId, name, data: data as Prisma.InputJsonValue, createdBy: interaction.user.id } }); await interaction.reply({ embeds: [embedUtils.success('Template Saved', `Saved **${template.name}**.`)], ephemeral: true });
  },
};
export default command;



