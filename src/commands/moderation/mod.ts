import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  GuildMember,
  TextChannel,
} from 'discord.js';
import { moderationModule } from '../../modules/moderation/index.js';
import { auditService } from '../../services/audit/index.js';
import { embedUtils } from '../../utils/embed.js';
import { parseDuration, validateTimeoutDuration } from '../../utils/duration.js';
import { Colors, DiscordLimits } from '../../config/constants.js';
import type { Command } from '../../types/index.js';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    // â”€â”€â”€ Ban â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to ban').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the ban'))
        .addIntegerOption((opt) =>
          opt.setName('delete_days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7),
        ),
    )
    // â”€â”€â”€ Unban â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('unban')
        .setDescription('Unban a user from the server')
        .addStringOption((opt) => opt.setName('user_id').setDescription('The user ID to unban').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the unban')),
    )
    // â”€â”€â”€ Kick â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to kick').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the kick')),
    )
    // â”€â”€â”€ Warn â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('warn')
        .setDescription('Issue a warning to a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to warn').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the warning').setRequired(true)),
    )
    // â”€â”€â”€ Warnings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('warnings')
        .setDescription('View warnings for a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to check').setRequired(true)),
    )
    // â”€â”€â”€ Timeout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to timeout').setRequired(true))
        .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g., 10s, 5m, 1h, 1d)').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the timeout')),
    )
    // â”€â”€â”€ Untimeout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('untimeout')
        .setDescription('Remove a timeout from a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to untimeout').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
    )
    // â”€â”€â”€ Mute â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('mute')
        .setDescription('Mute a user (role-based)')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to mute').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for the mute')),
    )
    // â”€â”€â”€ Unmute â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('unmute')
        .setDescription('Unmute a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user to unmute').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
    )
    // â”€â”€â”€ Clear â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Delete messages from the channel')
        .addIntegerOption((opt) =>
          opt.setName('count').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100),
        )
        .addUserOption((opt) => opt.setName('user').setDescription('Only delete messages from this user')),
    )
    // â”€â”€â”€ Lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('lock')
        .setDescription('Lock a channel')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel to lock (defaults to current)').addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for locking')),
    )
    // â”€â”€â”€ Unlock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('unlock')
        .setDescription('Unlock a channel')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel to unlock (defaults to current)').addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason for unlocking')),
    )
    // â”€â”€â”€ Slowmode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('slowmode')
        .setDescription('Set slowmode on a channel')
        .addIntegerOption((opt) =>
          opt
            .setName('seconds')
            .setDescription('Slowmode duration in seconds (0 to disable)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(DiscordLimits.SLOWMODE_MAX),
        )
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel (defaults to current)').addChannelTypes(ChannelType.GuildText),
        ),
    )
    // â”€â”€â”€ Announce â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('announce')
        .setDescription('Send an announcement to a channel')
        .addChannelOption((opt) =>
          opt.setName('channel').setDescription('Channel to announce in').setRequired(true).addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((opt) => opt.setName('message').setDescription('The announcement message').setRequired(true))
        .addStringOption((opt) => opt.setName('title').setDescription('Optional embed title')),
    ),

  requiredPermissions: [PermissionFlagsBits.ModerateMembers],
  rateLimitCategory: 'MODERATION',
  guildOnly: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'ban': {
        const user = interaction.options.getMember('user') as GuildMember | null;
        if (!user) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
          return;
        }
        const reason = interaction.options.getString('reason');
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
        await moderationModule.ban(interaction, user, reason, deleteDays);
        break;
      }

      case 'unban': {
        const userId = interaction.options.getString('user_id', true);
        if (!/^\\d{17,20}$/u.test(userId)) { await interaction.reply({ embeds: [embedUtils.error('Invalid User ID', 'Provide a valid Discord user ID.')], ephemeral: true }); return; }
        const reason = interaction.options.getString('reason');
        await moderationModule.unban(interaction, userId, reason);
        break;
      }

      case 'kick': {
        const user = interaction.options.getMember('user') as GuildMember | null;
        if (!user) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
          return;
        }
        const reason = interaction.options.getString('reason');
        await moderationModule.kick(interaction, user, reason);
        break;
      }

      case 'warn': {
        const user = interaction.options.getMember('user') as GuildMember | null;
        if (!user) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
          return;
        }
        const reason = interaction.options.getString('reason', true);
        await moderationModule.warn(interaction, user, reason);
        break;
      }

      case 'warnings': {
        const user = interaction.options.getUser('user', true);
        const warnings = await auditService.getWarnings(interaction.guildId!, user.id);

        if (warnings.length === 0) {
          await interaction.reply({
            embeds: [embedUtils.info('No Warnings', `**${user.tag}** has no warnings.`)],
            ephemeral: true,
          });
          return;
        }

        const warningLines = warnings.slice(0, 10).map((w: { reason: string; moderatorId: string; createdAt: Date }, i: number) =>
          `**${i + 1}.** ${w.reason}\n   *By <@${w.moderatorId}> â€” <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>*`,
        );

        const embed = embedUtils.info(
          `Warnings for ${user.tag}`,
          `**Total:** ${warnings.length}\n\n${warningLines.join('\n\n')}`,
        );

        if (warnings.length > 10) {
          embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings` });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'timeout': {
        const user = interaction.options.getMember('user') as GuildMember | null;
        if (!user) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
          return;
        }
        const durationStr = interaction.options.getString('duration', true);
        const reason = interaction.options.getString('reason');

        try {
          const { ms, human } = parseDuration(durationStr);
          validateTimeoutDuration(ms);
          await moderationModule.timeout(interaction, user, ms, human, reason);
        } catch (error) {
          await interaction.reply({
            embeds: [embedUtils.error('Invalid Duration', error instanceof Error ? error.message : String(error))],
            ephemeral: true,
          });
        }
        break;
      }

      case 'untimeout': {
        const user = interaction.options.getMember('user') as GuildMember | null;
        if (!user) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
          return;
        }
        const reason = interaction.options.getString('reason');
        await moderationModule.untimeout(interaction, user, reason);
        break;
      }

      case 'mute': {
        const user = interaction.options.getMember('user') as GuildMember | null;
        if (!user) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
          return;
        }
        const reason = interaction.options.getString('reason');
        await moderationModule.mute(interaction, user, reason);
        break;
      }

      case 'unmute': {
        const user = interaction.options.getMember('user') as GuildMember | null;
        if (!user) {
          await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
          return;
        }
        const reason = interaction.options.getString('reason');
        await moderationModule.unmute(interaction, user, reason);
        break;
      }

      case 'clear': {
        const count = interaction.options.getInteger('count', true);
        const targetUser = interaction.options.getMember('user') as GuildMember | null;
        await moderationModule.clear(interaction, count, targetUser);
        break;
      }

      case 'lock': {
        const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel;
        const reason = interaction.options.getString('reason');
        await moderationModule.lock(interaction, channel, reason);
        break;
      }

      case 'unlock': {
        const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel;
        const reason = interaction.options.getString('reason');
        await moderationModule.unlock(interaction, channel, reason);
        break;
      }

      case 'slowmode': {
        const seconds = interaction.options.getInteger('seconds', true);
        const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel;
        await moderationModule.slowmode(interaction, channel, seconds);
        break;
      }

      case 'announce': {
        const channel = interaction.options.getChannel('channel', true) as TextChannel;
        const message = interaction.options.getString('message', true);
        const title = interaction.options.getString('title');

        const userCheck = (await import('../../services/permissions/index.js')).permissionService
          .checkUserPermission(interaction.member as GuildMember, [PermissionFlagsBits.ManageMessages]);

        if (!userCheck.allowed) {
          await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
          return;
        }

        const embed = new (await import('discord.js')).EmbedBuilder()
          .setColor(Colors.INFO)
          .setDescription(message)
          .setTimestamp()
          .setFooter({ text: `Announced by ${(interaction.member as GuildMember).user.tag}` });

        if (title) embed.setTitle(title);

        await channel.send({ embeds: [embed] });

        await interaction.reply({
          embeds: [embedUtils.success('Announcement Sent', `Your announcement has been sent to <#${channel.id}>.`)],
          ephemeral: true,
        });
        break;
      }
    }
  },
};

export default command;




