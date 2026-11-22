import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { antiraidModule } from '../../modules/antiraid/index.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

/** Emergency switch. It stays in Discord because it changes channel permissions, which the dashboard cannot do. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Emergency: stop everyone from chatting in all channels (for raids or spam)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o
        .setName('action')
        .setDescription('Start or end the lockdown')
        .setRequired(true)
        .addChoices({ name: 'Start lockdown', value: 'start' }, { name: 'End lockdown', value: 'end' }),
    ),
  requiredPermissions: [PermissionFlagsBits.Administrator],
  rateLimitCategory: 'ADMIN',
  guildOnly: true,

  async execute(interaction) {
    const guild = interaction.guild!;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (interaction.options.getString('action', true) === 'start') {
      const result = await antiraidModule.lockdown(guild, `Lockdown started by ${interaction.user.tag}`);
      if (result.status === 'already_locked') {
        await interaction.editReply({
          embeds: [embedUtils.warning('Already Locked', 'A lockdown is already on. Use `/lockdown action:End lockdown` to end it.')],
        });
        return;
      }
      const ends = result.endsAt ? `\nIt ends by itself <t:${Math.floor(result.endsAt.getTime() / 1000)}:R>.` : '';
      const failures = result.failed
        ? `\n⚠️ ${result.failed} channel(s) could not be locked. Make sure NAKI has the Manage Channels permission.`
        : '';
      await interaction.editReply({
        embeds: [
          (result.failed ? embedUtils.warning : embedUtils.success)(
            'Lockdown Started',
            `Members can no longer chat in **${result.changed}** channel(s).${ends}${failures}\nEnd it with \`/lockdown action:End lockdown\`.`,
          ),
        ],
      });
      return;
    }

    const result = await antiraidModule.unlock(guild, `Lockdown ended by ${interaction.user.tag}`);
    if (result.status === 'not_locked') {
      await interaction.editReply({ embeds: [embedUtils.warning('Not Locked', 'There is no lockdown right now.')] });
      return;
    }
    if (result.status === 'partial') {
      await interaction.editReply({
        embeds: [
          embedUtils.warning(
            'Partly Ended',
            `Opened **${result.restored}** channel(s), but **${result.failed}** failed. Check NAKI's permissions and run this again.`,
          ),
        ],
      });
      return;
    }
    await interaction.editReply({
      embeds: [embedUtils.success('Lockdown Ended', `Members can chat again in **${result.restored}** channel(s).`)],
    });
  },
};

export default command;
