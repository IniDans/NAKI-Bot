import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedMember, reasonOf, replyProblem } from '../../modules/moderation/command-helpers.js';
import { parseDuration } from '../../utils/duration.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Remove someone from the server and stop them from coming back')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('member').setDescription('Who to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Why (they will see this)').setMaxLength(500))
    .addStringOption((o) =>
      o.setName('duration').setDescription('Only for a while, e.g. 1d or 2w. Leave empty to ban forever.'),
    )
    .addIntegerOption((o) =>
      o
        .setName('delete_messages')
        .setDescription('Also delete their recent messages')
        .addChoices(
          { name: 'Do not delete', value: 0 },
          { name: 'Last 24 hours', value: 1 },
          { name: 'Last 3 days', value: 3 },
          { name: 'Last 7 days', value: 7 },
        ),
    ),
  requiredPermissions: [PermissionFlagsBits.BanMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async execute(interaction) {
    const member = await pickedMember(interaction);
    if (!member) return;
    const input = interaction.options.getString('duration');
    let durationMs: number | null = null;
    if (input) {
      try {
        durationMs = parseDuration(input).ms;
      } catch {
        return replyProblem(interaction, 'Invalid Duration', 'Write it like `30m`, `12h`, `1d` or `2w`.');
      }
      if (durationMs < 60_000 || durationMs > 365 * 86_400_000) {
        return replyProblem(interaction, 'Invalid Duration', 'A temporary ban must last between 1 minute and 365 days.');
      }
    }
    const deleteDays = interaction.options.getInteger('delete_messages') ?? 0;
    await moderationModule.ban(interaction, member, reasonOf(interaction), deleteDays, durationMs);
  },
};
export default command;
