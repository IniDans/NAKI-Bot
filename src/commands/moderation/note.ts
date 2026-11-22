import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { db } from '../../services/database/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;
const MAX_NOTES_PER_USER = 50;
const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Private moderator notes. The person is never told a note exists. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Write private notes about a member that only moderators can see')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Write a new note (they will not be told)')
        .addUserOption((o) => o.setName('member').setDescription('Who the note is about').setRequired(true))
        .addStringOption((o) => o.setName('text').setDescription('The note').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Delete a note')
        .addUserOption((o) => o.setName('member').setDescription('Who the note is about').setRequired(true))
        .addStringOption((o) =>
          o.setName('note').setDescription('Pick the note to delete').setRequired(true).setAutocomplete(true),
        ),
    ),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,

  async autocomplete(interaction) {
    const userId = interaction.options.get('member')?.value;
    if (typeof userId !== 'string' || !interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const typed = interaction.options.getFocused().toLowerCase();
    const notes = await prisma.modNote.findMany({
      where: { guildId: interaction.guildId, userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    await interaction.respond(
      notes
        .filter((n) => !typed || n.content.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((n) => ({ name: short(`${n.createdAt.toISOString().slice(0, 10)} · ${n.content}`, 100), value: n.id })),
    );
  },

  async execute(interaction) {
    const guildId = interaction.guildId!;
    const user = interaction.options.getUser('member', true);

    if (interaction.options.getSubcommand() === 'add') {
      const count = await prisma.modNote.count({ where: { guildId, userId: user.id } });
      if (count >= MAX_NOTES_PER_USER) {
        await interaction.reply({
          embeds: [embedUtils.error('Too Many Notes', `${user.tag} already has ${MAX_NOTES_PER_USER} notes. Delete an old one first.`)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await prisma.modNote.create({
        data: { guildId, userId: user.id, moderatorId: interaction.user.id, content: interaction.options.getString('text', true) },
      });
      await interaction.reply({
        embeds: [embedUtils.success('Note Saved', `Saved a note about **${user.tag}**. See it any time with \`/history\`.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const id = interaction.options.getString('note', true).trim();
    const { count } = await prisma.modNote.deleteMany({ where: { id, guildId, userId: user.id } });
    await interaction.reply({
      embeds: [
        count
          ? embedUtils.success('Note Deleted', `The note about **${user.tag}** was deleted.`)
          : embedUtils.error('Note Not Found', 'Pick a note from the list that appears while you type.'),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default command;
