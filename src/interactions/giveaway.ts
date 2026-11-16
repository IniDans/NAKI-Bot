import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../services/database/index.js';
import { giveawaysModule } from '../modules/giveaways/index.js';
import { embedUtils } from '../utils/embed.js';
import type { ComponentHandler } from '../types/index.js';

/**
 * giveaway:enter:<giveawayId>  the button on the giveaway message
 * giveaway:leave:<giveawayId>  shown privately to someone who already entered
 */
const handler: ComponentHandler = {
  prefix: 'giveaway',
  async execute(interaction, [kind, giveawayId]) {
    if (!interaction.inCachedGuild() || !interaction.isButton()) return;
    const giveaway = await db.client.giveaway.findFirst({ where: { id: giveawayId, guildId: interaction.guildId } });
    if (!giveaway || giveaway.ended || giveaway.endsAt.getTime() <= Date.now()) {
      await interaction.reply({
        embeds: [embedUtils.warning('Giveaway Closed', 'This giveaway has ended.')],
        ephemeral: true,
      });
      return;
    }
    const userId = interaction.user.id;

    if (kind === 'leave') {
      await db.client.giveawayEntry.deleteMany({ where: { giveawayId, userId } });
      giveawaysModule.scheduleRefresh(giveawayId);
      await interaction.update({
        embeds: [embedUtils.info('Entry Withdrawn', `You left the giveaway for **${giveaway.prize}**.`)],
        components: [],
      });
      return;
    }

    const existing = await db.client.giveawayEntry.findUnique({
      where: { giveawayId_userId: { giveawayId, userId } },
    });
    if (existing) {
      const leave = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`giveaway:leave:${giveawayId}`)
          .setLabel('Leave giveaway')
          .setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        embeds: [embedUtils.info('Already Entered', `You are already in the giveaway for **${giveaway.prize}**.`)],
        components: [leave],
        ephemeral: true,
      });
      return;
    }

    // A double click can race past the check above; the unique index turns the second one into a no-op.
    await db.client.giveawayEntry.create({ data: { giveawayId, userId } }).catch(() => undefined);
    giveawaysModule.scheduleRefresh(giveawayId);
    await interaction.reply({
      embeds: [embedUtils.success('Entered', `You are in the giveaway for **${giveaway.prize}**. Good luck!`)],
      ephemeral: true,
    });
  },
};
export default handler;
