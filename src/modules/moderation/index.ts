import {
  GuildMember,
  Guild,
  PermissionFlagsBits,
  TextChannel,
  ChatInputCommandInteraction,
  ChannelType,
} from 'discord.js';
import { permissionService } from '../../services/permissions/index.js';
import { auditService } from '../../services/audit/index.js';
import { logModule } from '../logger/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { Colors, LogCategory, ModerationAction, DiscordLimits } from '../../config/constants.js';
import { embedUtils } from '../../utils/embed.js';
import { appLogger } from '../../utils/logger.js';


/**
 * Moderation module â€” business logic for all moderation actions.
 * Commands call these functions; they never contain business logic themselves.
 */
export const moderationModule = {
  /**
   * Ban a user from the guild.
   */
  async ban(
    interaction: ChatInputCommandInteraction,
    target: GuildMember,
    reason: string | null,
    deleteDays: number,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    // Validate
    const check = await permissionService.validateModerationAction(
      interaction,
      target,
      [PermissionFlagsBits.BanMembers],
      [PermissionFlagsBits.BanMembers],
    );
    if (!check.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', check.reason!)], ephemeral: true });
      return;
    }

    // DM the user before banning (may fail if DMs are closed)
    try {
      await target.send({
        embeds: [embedUtils.dmNotification(guild.name, 'Banned', reason)],
      });
    } catch {
      // DMs closed â€” continue with ban
    }

    // Execute the ban
    await target.ban({
      reason: reason ?? undefined,
      deleteMessageSeconds: deleteDays * 86400,
    });

    // Create moderation case
    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.BAN,
      userId: target.id,
      moderatorId: moderator.id,
      reason,
      metadata: { deleteDays },
    });

    // Log
    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Member Banned',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: target.id, tag: target.user.tag },
      action: 'Ban',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.BAN,
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('User Banned', Colors.BAN, [
          { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: `${moderator.user.tag}`, inline: true },
          { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Unban a user from the guild.
   */
  async unban(
    interaction: ChatInputCommandInteraction,
    userId: string,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    // Check permissions
    const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.BanMembers]);
    if (!userCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
      return;
    }

    const botCheck = permissionService.checkBotPermission(guild, [PermissionFlagsBits.BanMembers]);
    if (!botCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Bot Permission Missing', botCheck.reason!)], ephemeral: true });
      return;
    }

    // Verify the user is actually banned
    try {
      await guild.bans.fetch(userId);
    } catch {
      await interaction.reply({
        embeds: [embedUtils.error('Not Found', 'This user is not banned in this server.')],
        ephemeral: true,
      });
      return;
    }

    // Execute unban
    await guild.bans.remove(userId, reason ?? undefined);

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.UNBAN,
      userId,
      moderatorId: moderator.id,
      reason,
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Member Unbanned',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: userId },
      action: 'Unban',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.UNBAN,
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('User Unbanned', Colors.UNBAN, [
          { name: 'User ID', value: userId, inline: true },
          { name: 'Moderator', value: moderator.user.tag, inline: true },
          { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Kick a user from the guild.
   */
  async kick(
    interaction: ChatInputCommandInteraction,
    target: GuildMember,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const check = await permissionService.validateModerationAction(
      interaction,
      target,
      [PermissionFlagsBits.KickMembers],
      [PermissionFlagsBits.KickMembers],
    );
    if (!check.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', check.reason!)], ephemeral: true });
      return;
    }

    try {
      await target.send({
        embeds: [embedUtils.dmNotification(guild.name, 'Kicked', reason)],
      });
    } catch {
      // DMs closed
    }

    await target.kick(reason ?? undefined);

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.KICK,
      userId: target.id,
      moderatorId: moderator.id,
      reason,
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Member Kicked',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: target.id, tag: target.user.tag },
      action: 'Kick',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.KICK,
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('User Kicked', Colors.KICK, [
          { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: moderator.user.tag, inline: true },
          { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Warn a user.
   */
  async warn(
    interaction: ChatInputCommandInteraction,
    target: GuildMember,
    reason: string,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    // Only need hierarchy check, not ban/kick perms
    const hierarchyCheck = permissionService.checkHierarchy(moderator, target);
    if (!hierarchyCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', hierarchyCheck.reason!)], ephemeral: true });
      return;
    }

    const protectedCheck = await permissionService.isProtectedTarget(guild, target.id, guild.id);
    if (!protectedCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Protected User', protectedCheck.reason!)], ephemeral: true });
      return;
    }

    // Create the warning
    const warning = await auditService.createWarning(guild.id, target.id, moderator.id, reason);
    const warningCount = await auditService.getWarningCount(guild.id, target.id);

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.WARN,
      userId: target.id,
      moderatorId: moderator.id,
      reason,
      metadata: { warningId: warning.id, totalWarnings: warningCount },
    });

    // DM the user
    try {
      await target.send({
        embeds: [embedUtils.dmNotification(guild.name, `Warning (#${warningCount})`, reason)],
      });
    } catch {
      // DMs closed
    }

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Member Warned',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: target.id, tag: target.user.tag },
      action: 'Warning',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.WARN,
      relevantIds: { 'Case': `#${modCase.caseNumber}`, 'Total Warnings': String(warningCount) },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('User Warned', Colors.WARN, [
          { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: moderator.user.tag, inline: true },
          { name: 'Reason', value: reason, inline: false },
          { name: 'Total Warnings', value: String(warningCount), inline: true },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Timeout a user (Discord native timeout).
   */
  async timeout(
    interaction: ChatInputCommandInteraction,
    target: GuildMember,
    durationMs: number,
    durationHuman: string,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const check = await permissionService.validateModerationAction(
      interaction,
      target,
      [PermissionFlagsBits.ModerateMembers],
      [PermissionFlagsBits.ModerateMembers],
    );
    if (!check.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', check.reason!)], ephemeral: true });
      return;
    }

    try {
      await target.send({
        embeds: [embedUtils.dmNotification(guild.name, 'Timed Out', reason, durationHuman)],
      });
    } catch {
      // DMs closed
    }

    await target.timeout(durationMs, reason ?? undefined);

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.TIMEOUT,
      userId: target.id,
      moderatorId: moderator.id,
      reason,
      duration: durationMs,
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Member Timed Out',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: target.id, tag: target.user.tag },
      action: 'Timeout',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.TIMEOUT,
      metadata: { duration: durationHuman },
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('User Timed Out', Colors.TIMEOUT, [
          { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: moderator.user.tag, inline: true },
          { name: 'Duration', value: durationHuman, inline: true },
          { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Remove a timeout from a user.
   */
  async untimeout(
    interaction: ChatInputCommandInteraction,
    target: GuildMember,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ModerateMembers]);
    if (!userCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
      return;
    }

    if (!target.communicationDisabledUntil) {
      await interaction.reply({
        embeds: [embedUtils.error('Not Timed Out', 'This user is not currently timed out.')],
        ephemeral: true,
      });
      return;
    }

    await target.timeout(null, reason ?? undefined);

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.UNTIMEOUT,
      userId: target.id,
      moderatorId: moderator.id,
      reason,
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Timeout Removed',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: target.id, tag: target.user.tag },
      action: 'Untimeout',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.UNMUTE,
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('Timeout Removed', Colors.UNMUTE, [
          { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: moderator.user.tag, inline: true },
          { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Mute a user (role-based mute).
   */
  async mute(
    interaction: ChatInputCommandInteraction,
    target: GuildMember,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const check = await permissionService.validateModerationAction(
      interaction,
      target,
      [PermissionFlagsBits.ManageRoles],
      [PermissionFlagsBits.ManageRoles],
    );
    if (!check.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', check.reason!)], ephemeral: true });
      return;
    }

    // Get or create the mute role
    const muteRole = await getOrCreateMuteRole(guild);
    if (!muteRole) {
      await interaction.reply({
        embeds: [embedUtils.error('Setup Error', 'Failed to create or find the mute role.')],
        ephemeral: true,
      });
      return;
    }

    if (target.roles.cache.has(muteRole.id)) {
      await interaction.reply({
        embeds: [embedUtils.error('Already Muted', 'This user is already muted.')],
        ephemeral: true,
      });
      return;
    }

    await target.roles.add(muteRole, reason ?? 'Muted');

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.MUTE,
      userId: target.id,
      moderatorId: moderator.id,
      reason,
      metadata: { muteRoleId: muteRole.id },
    });

    try {
      await target.send({
        embeds: [embedUtils.dmNotification(guild.name, 'Muted', reason)],
      });
    } catch {
      // DMs closed
    }

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Member Muted',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: target.id, tag: target.user.tag },
      action: 'Mute',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.MUTE,
      relevantIds: { 'Case': `#${modCase.caseNumber}`, 'Mute Role': muteRole.id },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('User Muted', Colors.MUTE, [
          { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: moderator.user.tag, inline: true },
          { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Unmute a user (remove mute role).
   */
  async unmute(
    interaction: ChatInputCommandInteraction,
    target: GuildMember,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageRoles]);
    if (!userCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
      return;
    }

    const muteRole = await getOrCreateMuteRole(guild);
    if (!muteRole || !target.roles.cache.has(muteRole.id)) {
      await interaction.reply({
        embeds: [embedUtils.error('Not Muted', 'This user is not currently muted.')],
        ephemeral: true,
      });
      return;
    }

    await target.roles.remove(muteRole, reason ?? 'Unmuted');

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.UNMUTE,
      userId: target.id,
      moderatorId: moderator.id,
      reason,
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Member Unmuted',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: target.id, tag: target.user.tag },
      action: 'Unmute',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.UNMUTE,
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.moderation('User Unmuted', Colors.UNMUTE, [
          { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
          { name: 'Moderator', value: moderator.user.tag, inline: true },
          { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
          { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
        ]),
      ],
    });
  },

  /**
   * Clear (purge) messages from a channel.
   */
  async clear(
    interaction: ChatInputCommandInteraction,
    count: number,
    targetUser: GuildMember | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;
    const channel = interaction.channel as TextChannel;

    const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageMessages]);
    if (!userCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
      return;
    }

    const botCheck = permissionService.checkBotPermission(guild, [PermissionFlagsBits.ManageMessages]);
    if (!botCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Bot Permission Missing', botCheck.reason!)], ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Fetch messages
    let messages = await channel.messages.fetch({ limit: Math.min(count, DiscordLimits.BULK_DELETE_MAX) });

    // Filter by user if specified
    if (targetUser) {
      messages = messages.filter((m) => m.author.id === targetUser.id);
    }

    // Filter out messages older than 14 days (Discord bulk delete limitation)
    const twoWeeksAgo = Date.now() - DiscordLimits.BULK_DELETE_AGE_MS;
    messages = messages.filter((m) => m.createdTimestamp > twoWeeksAgo);

    if (messages.size === 0) {
      await interaction.editReply({
        embeds: [embedUtils.warning('No Messages', 'No messages found matching the criteria.')],
      });
      return;
    }

    const deleted = await channel.bulkDelete(messages, true);

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.CLEAR,
      userId: targetUser?.id ?? moderator.id,
      moderatorId: moderator.id,
      reason: `Cleared ${deleted.size} messages`,
      metadata: {
        channelId: channel.id,
        count: deleted.size,
        targetUserId: targetUser?.id,
      },
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Messages Cleared',
      user: { id: moderator.id, tag: moderator.user.tag },
      action: 'Clear',
      reason: `${deleted.size} messages deleted`,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.LOG_DELETE,
      metadata: {
        channel: `<#${channel.id}>`,
        count: deleted.size,
        targetUser: targetUser?.user.tag ?? 'All',
      },
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.editReply({
      embeds: [
        embedUtils.success('Messages Cleared', `Deleted **${deleted.size}** message(s) from <#${channel.id}>.`),
      ],
    });
  },

  /**
   * Lock a channel (deny SendMessages for @everyone).
   */
  async lock(
    interaction: ChatInputCommandInteraction,
    channel: TextChannel,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageChannels]);
    if (!userCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
      return;
    }

    const botCheck = permissionService.checkBotPermission(guild, [PermissionFlagsBits.ManageChannels]);
    if (!botCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Bot Permission Missing', botCheck.reason!)], ephemeral: true });
      return;
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: false,
    }, { reason: reason ?? 'Channel locked' });

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.LOCK,
      userId: moderator.id,
      moderatorId: moderator.id,
      reason,
      metadata: { channelId: channel.id },
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Channel Locked',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: channel.id, name: channel.name },
      action: 'Lock',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.WARNING,
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.success('Channel Locked', `<#${channel.id}> has been locked.\n**Reason:** ${reason ?? 'No reason provided'}`),
      ],
    });

    // Also send a notice in the locked channel
    await channel.send({
      embeds: [
        embedUtils.warning('ðŸ”’ Channel Locked', `This channel has been locked by a moderator.\n**Reason:** ${reason ?? 'No reason provided'}`),
      ],
    }).catch(() => {});
  },

  /**
   * Unlock a channel.
   */
  async unlock(
    interaction: ChatInputCommandInteraction,
    channel: TextChannel,
    reason: string | null,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageChannels]);
    if (!userCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
      return;
    }

    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      SendMessages: null,
    }, { reason: reason ?? 'Channel unlocked' });

    const modCase = await auditService.createCase({
      guildId: guild.id,
      action: ModerationAction.UNLOCK,
      userId: moderator.id,
      moderatorId: moderator.id,
      reason,
      metadata: { channelId: channel.id },
    });

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Channel Unlocked',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: channel.id, name: channel.name },
      action: 'Unlock',
      reason,
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.SUCCESS,
      relevantIds: { 'Case': `#${modCase.caseNumber}` },
    });

    await interaction.reply({
      embeds: [
        embedUtils.success('Channel Unlocked', `<#${channel.id}> has been unlocked.`),
      ],
    });

    await channel.send({
      embeds: [
        embedUtils.success('ðŸ”“ Channel Unlocked', 'This channel has been unlocked.'),
      ],
    }).catch(() => {});
  },

  /**
   * Set slowmode on a channel.
   */
  async slowmode(
    interaction: ChatInputCommandInteraction,
    channel: TextChannel,
    seconds: number,
  ): Promise<void> {
    const guild = interaction.guild!;
    const moderator = interaction.member as GuildMember;

    const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageChannels]);
    if (!userCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true });
      return;
    }

    const botCheck = permissionService.checkBotPermission(guild, [PermissionFlagsBits.ManageChannels]);
    if (!botCheck.allowed) {
      await interaction.reply({ embeds: [embedUtils.error('Bot Permission Missing', botCheck.reason!)], ephemeral: true });
      return;
    }

    const oldSlowmode = channel.rateLimitPerUser;
    await channel.setRateLimitPerUser(seconds, `Set by ${moderator.user.tag}`);

    await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
      eventType: 'Slowmode Changed',
      user: { id: moderator.id, tag: moderator.user.tag },
      target: { id: channel.id, name: channel.name },
      action: 'Slowmode',
      guildId: guild.id,
      guildName: guild.name,
      color: Colors.INFO,
      before: { slowmode: `${oldSlowmode}s` },
      after: { slowmode: `${seconds}s` },
    });

    const desc = seconds === 0
      ? `Slowmode has been disabled in <#${channel.id}>.`
      : `Slowmode set to **${seconds} seconds** in <#${channel.id}>.`;

    await interaction.reply({
      embeds: [embedUtils.success('Slowmode Updated', desc)],
    });
  },
};

/**
 * Get or create the mute role for a guild.
 * Stores the role ID in GuildConfig for persistence.
 */
async function getOrCreateMuteRole(guild: Guild) {
  const config = await guildService.getGuildConfig(guild.id);

  // Check if configured mute role exists
  if (config.muteRoleId) {
    const existing = guild.roles.cache.get(config.muteRoleId);
    if (existing) return existing;
  }

  // Look for an existing "Muted" role
  const existingMuted = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === 'muted',
  );
  if (existingMuted) {
    await guildService.updateGuildConfig(guild.id, { muteRoleId: existingMuted.id });
    return existingMuted;
  }

  // Create a new mute role
  try {
    const muteRole = await guild.roles.create({
      name: 'Muted',
      color: Colors.MUTE,
      permissions: [],
      reason: 'Auto-created mute role',
    });

    // Set permission overwrites on all text channels
    for (const channel of guild.channels.cache.values()) {
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
        try {
          await (channel as TextChannel).permissionOverwrites.edit(muteRole, {
            SendMessages: false,
            AddReactions: false,
            Speak: false,
          });
        } catch {
          // Some channels may not be accessible
        }
      }
    }

    await guildService.updateGuildConfig(guild.id, { muteRoleId: muteRole.id });

    appLogger.info(`Created mute role in ${guild.name}`, 'Moderation', { guildId: guild.id });
    return muteRole;
  } catch (error) {
    appLogger.error('Failed to create mute role', 'Moderation', {
      error: error instanceof Error ? error.message : String(error),
      guildId: guild.id,
    });
    return null;
  }
}



