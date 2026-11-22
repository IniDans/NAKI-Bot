import type { Prisma } from '@prisma/client';
import {
  type AutocompleteInteraction,
  ChannelType,
  type ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js';
import { db } from '../../services/database/index.js';
import { embedUtils } from '../../utils/embed.js';
import { Colors, DiscordLimits } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;

const COLORS = [
  { name: 'Blue', value: '5865F2' },
  { name: 'Green', value: '43B581' },
  { name: 'Red', value: 'F04747' },
  { name: 'Yellow', value: 'FAA61A' },
  { name: 'Purple', value: '9B59B6' },
  { name: 'Pink', value: 'E91E63' },
  { name: 'White', value: 'FFFFFF' },
  { name: 'Black', value: '23272A' },
];

const NAME_RULE = /^[a-z0-9][a-z0-9 _-]{0,31}$/u;

function buildEmbed(interaction: ChatInputCommandInteraction): EmbedBuilder | string {
  const embed = new EmbedBuilder().setColor(Colors.INFO).setTimestamp();
  embed.setDescription(interaction.options.getString('message', true).replace(/\\n/g, '\n').slice(0, DiscordLimits.EMBED_DESCRIPTION));
  const title = interaction.options.getString('title');
  if (title) embed.setTitle(title.slice(0, DiscordLimits.EMBED_TITLE));
  const color = interaction.options.getString('color');
  if (color) embed.setColor(Number.parseInt(color, 16));
  const footer = interaction.options.getString('footer');
  if (footer) embed.setFooter({ text: footer.slice(0, DiscordLimits.EMBED_FOOTER) });
  const image = interaction.options.getString('image')?.trim();
  if (image) {
    if (!/^https?:\/\/\S+$/u.test(image)) return 'The image must be a link that starts with `https://`.';
    embed.setImage(image);
  }
  return embed;
}

/** Post to the picked channel, or show only to the moderator when no channel was picked. */
async function deliver(interaction: ChatInputCommandInteraction, embed: EmbedBuilder, note = ''): Promise<void> {
  const picked = interaction.options.getChannel('channel');
  if (!picked) {
    await interaction.reply({
      content: `**Preview** (only you can see this). Pick a \`channel\` to post it for real.${note}`,
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = interaction.guild!.channels.cache.get(picked.id);
  if (!(channel instanceof TextChannel)) {
    await interaction.reply({ embeds: [embedUtils.error('Wrong Channel', 'Pick a normal text channel.')], flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch {
    await interaction.reply({
      embeds: [embedUtils.error('Could Not Post', `NAKI is not allowed to send messages in <#${channel.id}>.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({ embeds: [embedUtils.success('Posted', `Your embed was posted in <#${channel.id}>.${note}`)], flags: MessageFlags.Ephemeral });
}

async function suggestSaved(interaction: AutocompleteInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.respond([]);
    return;
  }
  const typed = interaction.options.getFocused().toLowerCase();
  const templates = await prisma.embedTemplate.findMany({
    where: { guildId: interaction.guildId },
    orderBy: { name: 'asc' },
    select: { name: true },
    take: 100,
  });
  await interaction.respond(
    templates
      .filter((t) => !typed || t.name.includes(typed))
      .slice(0, 25)
      .map((t) => ({ name: t.name, value: t.name })),
  );
}

const channelOption = (o: import('discord.js').SlashCommandChannelOption) =>
  o.setName('channel').setDescription('Where to post it. Leave empty to only preview it yourself.').addChannelTypes(ChannelType.GuildText);
const savedOption = (o: import('discord.js').SlashCommandStringOption) =>
  o.setName('saved').setDescription('Pick a saved embed').setRequired(true).setAutocomplete(true);

/** Fancy boxed messages for announcements and rules. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Post a nice-looking boxed message, e.g. for rules or announcements')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName('create')
        .setDescription('Write a new embed, preview it, post it or save it for later')
        .addStringOption((o) =>
          o.setName('message').setDescription('The main text. Type \\n for a new line.').setRequired(true).setMaxLength(4000),
        )
        .addStringOption((o) => o.setName('title').setDescription('A heading at the top').setMaxLength(DiscordLimits.EMBED_TITLE))
        .addStringOption((o) => o.setName('color').setDescription('The color of the side bar').addChoices(...COLORS))
        .addStringOption((o) => o.setName('image').setDescription('Link to a picture to show at the bottom'))
        .addStringOption((o) => o.setName('footer').setDescription('Small text at the very bottom').setMaxLength(DiscordLimits.EMBED_FOOTER))
        .addChannelOption(channelOption)
        .addStringOption((o) =>
          o.setName('save_as').setDescription('Also save it under this name to post again later').setMaxLength(32),
        ),
    )
    .addSubcommand((s) =>
      s.setName('post-saved').setDescription('Post an embed you saved before').addStringOption(savedOption).addChannelOption(channelOption),
    )
    .addSubcommand((s) => s.setName('delete-saved').setDescription('Delete a saved embed').addStringOption(savedOption)),
  requiredPermissions: [PermissionFlagsBits.ManageMessages],
  rateLimitCategory: 'ADMIN',
  guildOnly: true,

  autocomplete: suggestSaved,

  async execute(interaction) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const embed = buildEmbed(interaction);
      if (typeof embed === 'string') {
        await interaction.reply({ embeds: [embedUtils.error('Invalid Image', embed)], flags: MessageFlags.Ephemeral });
        return;
      }
      const saveAs = interaction.options.getString('save_as')?.trim().toLowerCase();
      let note = '';
      if (saveAs) {
        if (!NAME_RULE.test(saveAs)) {
          await interaction.reply({
            embeds: [embedUtils.error('Invalid Name', 'Use up to 32 letters, numbers, spaces, `_` or `-` for the name.')],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const data = embed.toJSON() as Prisma.InputJsonValue;
        await prisma.embedTemplate.upsert({
          where: { guildId_name: { guildId, name: saveAs } },
          update: { data, createdBy: interaction.user.id },
          create: { guildId, name: saveAs, data, createdBy: interaction.user.id },
        });
        note = `\nSaved as **${saveAs}**. Post it again with \`/embed post-saved\`.`;
      }
      await deliver(interaction, embed, note);
      return;
    }

    const name = interaction.options.getString('saved', true).trim().toLowerCase();
    if (sub === 'delete-saved') {
      const { count } = await prisma.embedTemplate.deleteMany({ where: { guildId, name } });
      await interaction.reply({
        embeds: [
          count
            ? embedUtils.success('Deleted', `The saved embed **${name}** was deleted.`)
            : embedUtils.error('Not Found', 'Pick a saved embed from the list that appears while you type.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const template = await prisma.embedTemplate.findUnique({ where: { guildId_name: { guildId, name } } });
    if (!template) {
      await interaction.reply({
        embeds: [embedUtils.error('Not Found', 'Pick a saved embed from the list that appears while you type.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const embed = new EmbedBuilder(template.data as ConstructorParameters<typeof EmbedBuilder>[0]).setTimestamp();
    await deliver(interaction, embed);
  },
};
export default command;
