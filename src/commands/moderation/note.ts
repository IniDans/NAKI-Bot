import { ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { db } from '../../services/database/index.js';
import { embedUtils } from '../../utils/embed.js';
import { Colors } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
const MAX_NOTES_PER_USER = 50;

/** Private moderator notes. Users are never told a note exists. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Private moderator notes about a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Add a note')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption((o) => o.setName('content').setDescription('Note text').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('List notes for a user')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Remove a note')
        .addStringOption((o) => o.setName('id').setDescription('Note ID from /note list').setRequired(true)),
    ),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',

  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const user = interaction.options.getUser('user', true);
      const count = await prisma.modNote.count({ where: { guildId, userId: user.id } });
      if (count >= MAX_NOTES_PER_USER) {
        await interaction.reply({ embeds: [embedUtils.error('Limit Reached', `A user can have at most ${MAX_NOTES_PER_USER} notes.`)], ephemeral: true });
        return;
      }
      const note = await prisma.modNote.create({
        data: { guildId, userId: user.id, moderatorId: interaction.user.id, content: interaction.options.getString('content', true) },
      });
      await interaction.reply({ embeds: [embedUtils.success('Note Added', `Saved note \`${note.id}\` for **${user.tag}**.`)], ephemeral: true });
      return;
    }

    if (sub === 'list') {
      const user = interaction.options.getUser('user', true);
      const notes = await prisma.modNote.findMany({ where: { guildId, userId: user.id }, orderBy: { createdAt: 'desc' }, take: 15 });
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`Notes for ${user.tag}`)
        .setDescription(
          notes.length
            ? notes
                .map((n) => `\`${n.id}\` <@${n.moderatorId}> <t:${Math.floor(n.createdAt.getTime() / 1000)}:R>\n${n.content}`)
                .join('\n\n')
                .slice(0, 4000)
            : 'No notes.',
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const id = interaction.options.getString('id', true).trim();
    const { count } = await prisma.modNote.deleteMany({ where: { id, guildId } });
    await interaction.reply({
      embeds: [count ? embedUtils.success('Note Removed', `Note \`${id}\` deleted.`) : embedUtils.error('Not Found', 'No note with that ID in this server.')],
      ephemeral: true,
    });
  },
};

export default command;
