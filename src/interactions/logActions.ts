import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type PermissionResolvable,
} from 'discord.js';
import { moderationModule } from '../modules/moderation/index.js';
import { embedUtils } from '../utils/embed.js';
import { parseDuration } from '../utils/duration.js';
import { DiscordLimits } from '../config/constants.js';
import type { ComponentHandler } from '../types/index.js';

const ACTIONS = {
  warn: { label: 'Warn', permission: PermissionFlagsBits.ModerateMembers },
  timeout: { label: 'Timeout', permission: PermissionFlagsBits.ModerateMembers },
  kick: { label: 'Kick', permission: PermissionFlagsBits.KickMembers },
  ban: { label: 'Ban', permission: PermissionFlagsBits.BanMembers },
} satisfies Record<string, { label: string; permission: PermissionResolvable }>;
type QuickAction = keyof typeof ACTIONS;

const isAction = (value: string | undefined): value is QuickAction => Boolean(value && value in ACTIONS);
const isSnowflake = (value: string | undefined): value is string => Boolean(value && /^\d{17,20}$/.test(value));

/**
 * logact:<action>:<userId>      button under a log entry (also used by report cards)
 * logact:run:<action>:<userId>  modal with the reason (and duration for timeouts)
 */
const handler: ComponentHandler = {
  prefix: 'logact',
  async execute(interaction, args) {
    if (!interaction.inCachedGuild()) return;
    const submitting = args[0] === 'run';
    const [action, userId] = submitting ? args.slice(1) : args;
    if (!isAction(action) || !isSnowflake(userId)) return;
    const { label, permission } = ACTIONS[action];

    if (!interaction.member.permissions.has(permission)) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', `You need permission to ${label.toLowerCase()} members.`)], ephemeral: true });
      return;
    }

    if (!submitting) {
      if (!interaction.isButton()) return;
      const rows = [
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(action === 'warn'),
        ),
      ];
      if (action === 'timeout') {
        rows.unshift(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('duration').setLabel('Duration (e.g. 10m, 1h, 1d)').setStyle(TextInputStyle.Short).setValue('1h').setMaxLength(10).setRequired(true),
          ),
        );
      }
      await interaction.showModal(new ModalBuilder().setCustomId(`logact:run:${action}:${userId}`).setTitle(`${label} member`).addComponents(rows));
      return;
    }

    if (!interaction.isModalSubmit()) return;
    const target = await interaction.guild.members.fetch(userId).catch(() => null);
    if (!target) {
      await interaction.reply({ embeds: [embedUtils.error('Not a Member', 'That user is no longer in the server. Use `/mod ban` with their ID if needed.')], ephemeral: true });
      return;
    }
    const reason = interaction.fields.getTextInputValue('reason').trim() || null;

    switch (action) {
      case 'warn':
        await moderationModule.warn(interaction, target, reason ?? 'No reason provided');
        break;
      case 'kick':
        await moderationModule.kick(interaction, target, reason);
        break;
      case 'ban':
        await moderationModule.ban(interaction, target, reason, 0);
        break;
      case 'timeout': {
        let parsed: { ms: number; human: string };
        try {
          parsed = parseDuration(interaction.fields.getTextInputValue('duration'));
        } catch {
          await interaction.reply({ embeds: [embedUtils.error('Invalid Duration', 'Use a format like 10m, 1h or 2d.')], ephemeral: true });
          return;
        }
        if (parsed.ms > DiscordLimits.TIMEOUT_MAX_MS) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid Duration', 'Timeouts can last at most 28 days.')], ephemeral: true });
          return;
        }
        await moderationModule.timeout(interaction, target, parsed.ms, parsed.human, reason);
        break;
      }
    }
  },
};

export default handler;
