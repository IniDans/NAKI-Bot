import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { pickedMember, reasonOf, replyProblem } from '../../modules/moderation/command-helpers.js';
import { parseDuration, validateTimeoutDuration } from '../../utils/duration.js';
import type { Command } from '../../types/index.js';

const PRESETS: [name: string, value: string][] = [
  ['60 seconds', '60s'],
  ['5 minutes', '5m'],
  ['10 minutes', '10m'],
  ['1 hour', '1h'],
  ['1 day', '1d'],
  ['1 week', '1w'],
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Stop someone from chatting or talking for a while')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('member').setDescription('Who to time out').setRequired(true))
    .addStringOption((o) =>
      o.setName('duration').setDescription('How long, e.g. 10m, 1h or 1d').setRequired(true).setAutocomplete(true),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Why (they will see this)').setMaxLength(500)),
  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,
  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().trim().toLowerCase();
    const options = PRESETS.filter(([name, value]) => !typed || name.includes(typed) || value.startsWith(typed));
    // People can still type their own value, like "3h".
    if (typed && !options.some(([, value]) => value === typed)) options.unshift([typed, typed]);
    await interaction.respond(options.slice(0, 25).map(([name, value]) => ({ name, value: value.slice(0, 100) })));
  },
  async execute(interaction) {
    const member = await pickedMember(interaction);
    if (!member) return;
    let ms: number;
    let human: string;
    try {
      ({ ms, human } = parseDuration(interaction.options.getString('duration', true)));
      validateTimeoutDuration(ms);
    } catch (error) {
      return replyProblem(
        interaction,
        'Invalid Duration',
        `${error instanceof Error ? error.message : String(error)}\nWrite it like \`10m\`, \`1h\` or \`1d\` (up to 28 days).`,
      );
    }
    await moderationModule.timeout(interaction, member, ms, human, reasonOf(interaction));
  },
};
export default command;
