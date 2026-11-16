import { ChannelType, type ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { db } from '../../services/database/index.js';
import { giveawaysModule } from '../../modules/giveaways/index.js';
import {
  MAX_DURATION_MS,
  MAX_WINNERS,
  MIN_DURATION_MS,
  PRIZE_MAX,
  parseDuration,
} from '../../modules/giveaways/logic.js';
import { embedUtils } from '../../utils/embed.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Run giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('start')
        .setDescription('Start a giveaway')
        .addStringOption((o) =>
          o.setName('prize').setDescription('What the winner gets').setRequired(true).setMaxLength(PRIZE_MAX),
        )
        .addStringOption((o) =>
          o.setName('duration').setDescription('How long it runs, e.g. 30m, 12h, 2d, 1w').setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName('winners').setDescription('Number of winners (default 1)').setMinValue(1).setMaxValue(MAX_WINNERS),
        )
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Where to post it (default: this channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('end')
        .setDescription('End a giveaway now and draw the winners')
        .addStringOption((o) => o.setName('message_id').setDescription('ID of the giveaway message').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('reroll')
        .setDescription('Draw new winners for an ended giveaway')
        .addStringOption((o) => o.setName('message_id').setDescription('ID of the giveaway message').setRequired(true)),
    ),
  requiredPermissions: [PermissionFlagsBits.ManageGuild],
  rateLimitCategory: 'ADMIN',
  guildOnly: true,
  async execute(interaction: ChatInputCommandInteraction) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const duration = parseDuration(interaction.options.getString('duration', true));
      if (!duration || duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) {
        await interaction.reply({
          embeds: [
            embedUtils.error(
              'Invalid Duration',
              'Use something like `30m`, `12h`, `2d` or `1w`, between 1 minute and 30 days.',
            ),
          ],
          ephemeral: true,
        });
        return;
      }
      const target = interaction.options.getChannel('channel') ?? interaction.channel;
      const channel = target ? interaction.guild!.channels.cache.get(target.id) : null;
      if (!channel?.isTextBased()) {
        await interaction.reply({
          embeds: [embedUtils.error('Invalid Channel', 'Pick a text channel.')],
          ephemeral: true,
        });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        await giveawaysModule.create({
          guildId,
          channel,
          prize: interaction.options.getString('prize', true).trim(),
          winnerCount: interaction.options.getInteger('winners') ?? 1,
          hostId: interaction.user.id,
          endsAt: new Date(Date.now() + duration),
        });
      } catch {
        await interaction.editReply({
          embeds: [embedUtils.error('Could Not Post', `NAKI cannot send messages in <#${channel.id}>.`)],
        });
        return;
      }
      await interaction.editReply({ embeds: [embedUtils.success('Giveaway Started', `Posted in <#${channel.id}>.`)] });
      return;
    }

    const messageId = interaction.options.getString('message_id', true).trim();
    const giveaway = await db.client.giveaway.findFirst({ where: { guildId, messageId } });
    if (!giveaway) {
      await interaction.reply({
        embeds: [embedUtils.error('Not Found', 'No giveaway uses that message ID in this server.')],
        ephemeral: true,
      });
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'end') {
      const ended = await giveawaysModule.endNow(giveaway);
      await interaction.editReply({
        embeds: [
          ended
            ? embedUtils.success('Giveaway Ended', 'Winners have been drawn and announced.')
            : embedUtils.warning('Already Ended', 'Use `/giveaway reroll` to draw new winners.'),
        ],
      });
      return;
    }

    if (!giveaway.ended) {
      await interaction.editReply({
        embeds: [embedUtils.warning('Still Running', 'End the giveaway first with `/giveaway end`.')],
      });
      return;
    }
    const winners = await giveawaysModule.reroll(giveaway);
    await interaction.editReply({
      embeds: [
        winners.length > 0
          ? embedUtils.success(
              'Rerolled',
              `New winner${winners.length > 1 ? 's' : ''}: ${winners.map((id) => `<@${id}>`).join(', ')}`,
            )
          : embedUtils.warning('No One Left', 'Every other entrant has already won or left the server.'),
      ],
    });
  },
};
export default command;
