import { PermissionFlagsBits } from 'discord.js';
import { modmailModule } from '../modules/modmail/index.js';
import { embedUtils } from '../utils/embed.js';
import type { ComponentHandler } from '../types/index.js';

/**
 * modmail:open:<guildId>   DM button when the user shares one modmail server with the bot
 * modmail:pick             DM select menu when there are several
 * modmail:close:<threadId> button on the thread header
 */
const handler: ComponentHandler = {
  prefix: 'modmail',
  async execute(interaction, [step, id]) {
    if (step === 'open' || step === 'pick') {
      const guildId = step === 'pick' && interaction.isStringSelectMenu() ? interaction.values[0] : id;
      if (!guildId) return;
      await interaction.deferUpdate();
      const error = await modmailModule.open(interaction.client, interaction.user, guildId);
      await interaction.editReply({
        content: error ?? 'Sent. Staff will reply here. Anything else you write in this DM goes to them too.',
        components: [],
      });
      return;
    }

    if (step === 'close' && interaction.isButton() && interaction.inCachedGuild()) {
      const perms = interaction.member.permissions;
      if (!perms.has(PermissionFlagsBits.ManageThreads) && !perms.has(PermissionFlagsBits.ModerateMembers)) {
        await interaction.reply({
          embeds: [embedUtils.error('Permission Denied', 'You need Manage Threads or Moderate Members to close modmail.')],
          ephemeral: true,
        });
        return;
      }
      const thread = interaction.channel;
      if (!thread?.isThread() || thread.id !== id) return;
      await interaction.update({ components: [] });
      const closed = await modmailModule.close(thread, interaction.user.id);
      if (!closed) await interaction.followUp({ content: 'This conversation was already closed.', ephemeral: true });
    }
  },
};

export default handler;
