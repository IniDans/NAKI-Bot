import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  Role,
} from 'discord.js';
import { permissionService } from '../../services/permissions/index.js';
import { auditService } from '../../services/audit/index.js';
import { logModule } from '../../modules/logger/index.js';
import { scheduler } from '../../services/scheduler/index.js';
import { embedUtils } from '../../utils/embed.js';
import { parseDuration } from '../../utils/duration.js';
import { Colors, LogCategory, ModerationAction } from '../../config/constants.js';
import type { Command } from '../../types/index.js';
import { db } from '../../services/database/index.js';

const prisma = db.client;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    // â”€â”€â”€ Temprole â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('temprole')
        .setDescription('Assign a temporary role to a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user').setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('The role to assign').setRequired(true))
        .addStringOption((opt) => opt.setName('duration').setDescription('Duration (e.g., 1h, 1d, 7d)').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
    )
    // â”€â”€â”€ Removerole â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    .addSubcommand((sub) =>
      sub
        .setName('removerole')
        .setDescription('Remove a role from a user')
        .addUserOption((opt) => opt.setName('user').setDescription('The user').setRequired(true))
        .addRoleOption((opt) => opt.setName('role').setDescription('The role to remove').setRequired(true))
        .addStringOption((opt) => opt.setName('reason').setDescription('Reason')),
    ),

  requiredPermissions: [PermissionFlagsBits.Administrator],
  rateLimitCategory: 'ADMIN',
  guildOnly: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'temprole':
        await handleTemprole(interaction);
        break;
      case 'removerole':
        await handleRemoverole(interaction);
        break;
    }
  },
};

async function handleTemprole(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild!;
  const moderator = interaction.member as GuildMember;
  const target = interaction.options.getMember('user') as GuildMember | null;
  const role = interaction.options.getRole('role', true);
  const durationStr = interaction.options.getString('duration', true);
  const reason = interaction.options.getString('reason');

  if (!target) {
    await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
    return;
  }

  // Permission checks
  const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageRoles]);
  if (!userCheck.allowed) { await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true }); return; }
  const hierarchyCheck = permissionService.checkHierarchy(moderator, target);
  if (!hierarchyCheck.allowed) { await interaction.reply({ embeds: [embedUtils.error('Permission Denied', hierarchyCheck.reason!)], ephemeral: true }); return; }
  const protectedCheck = await permissionService.isProtectedTarget(guild, target.id, guild.id);
  if (!protectedCheck.allowed) { await interaction.reply({ embeds: [embedUtils.error('Protected User', protectedCheck.reason!)], ephemeral: true }); return; }
  const botPermission = permissionService.checkBotPermission(guild, [PermissionFlagsBits.ManageRoles]);
  if (!botPermission.allowed) { await interaction.reply({ embeds: [embedUtils.error('Bot Permission Missing', botPermission.reason!)], ephemeral: true }); return; }
  const botHierarchy = permissionService.checkBotHierarchy(guild, target);
  if (!botHierarchy.allowed) { await interaction.reply({ embeds: [embedUtils.error('Cannot Manage User', botHierarchy.reason!)], ephemeral: true }); return; }
  const botRoleCheck = permissionService.checkBotRoleHierarchy(guild, role as Role);
  if (!botRoleCheck.allowed) {
    await interaction.reply({ embeds: [embedUtils.error('Cannot Manage Role', botRoleCheck.reason!)], ephemeral: true });
    return;
  }

  // Parse duration
  let ms: number;
  let human: string;
  try {
    const parsed = parseDuration(durationStr);
    ms = parsed.ms;
    human = parsed.human;
  } catch (error) {
    await interaction.reply({
      embeds: [embedUtils.error('Invalid Duration', error instanceof Error ? error.message : String(error))],
      ephemeral: true,
    });
    return;
  }

  // Check if user already has the role
  if (target.roles.cache.has(role.id)) {
    await interaction.reply({
      embeds: [embedUtils.warning('Already Has Role', `${target.user.tag} already has the **${role.name}** role.`)],
      ephemeral: true,
    });
    return;
  }

  // Add the role
  await (target as GuildMember).roles.add(role.id, reason ?? `Temporary role assigned for ${human}`);

  // Calculate expiry
  const expiresAt = new Date(Date.now() + ms);

  // Persist the temporary role
  await prisma.temporaryRole.create({
    data: {
      guildId: guild.id,
      userId: target.id,
      roleId: role.id,
      assignedBy: moderator.id,
      reason,
      expiresAt,
      active: true,
    },
  });

  // Schedule removal
  await scheduler.scheduleTask(guild.id, 'TEMP_ROLE_EXPIRE', {
    userId: target.id,
    roleId: role.id,
  }, expiresAt);

  const modCase = await auditService.createCase({
    guildId: guild.id,
    action: ModerationAction.TEMPROLE,
    userId: target.id,
    moderatorId: moderator.id,
    reason,
    duration: ms,
    metadata: { roleId: role.id, roleName: role.name },
  });

  await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
    eventType: 'Temporary Role Assigned',
    user: { id: moderator.id, tag: moderator.user.tag },
    target: { id: target.id, tag: target.user.tag },
    action: 'Temprole',
    reason,
    guildId: guild.id,
    guildName: guild.name,
    color: Colors.INFO,
    metadata: { role: role.name, duration: human, expiresAt: expiresAt.toISOString() },
    relevantIds: { 'Case': `#${modCase.caseNumber}` },
  });

  await interaction.reply({
    embeds: [
      embedUtils.moderation('Temporary Role Assigned', Colors.INFO, [
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Role', value: role.name, inline: true },
        { name: 'Duration', value: human, inline: true },
        { name: 'Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
        { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
        { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
      ]),
    ],
  });
}

async function handleRemoverole(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild!;
  const moderator = interaction.member as GuildMember;
  const target = interaction.options.getMember('user') as GuildMember | null;
  const role = interaction.options.getRole('role', true);
  const reason = interaction.options.getString('reason');

  if (!target) {
    await interaction.reply({ embeds: [embedUtils.error('Invalid User', 'Could not find this user in the server.')], ephemeral: true });
    return;
  }

  const userCheck = permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageRoles]);
  if (!userCheck.allowed) { await interaction.reply({ embeds: [embedUtils.error('Permission Denied', userCheck.reason!)], ephemeral: true }); return; }
  const hierarchyCheck = permissionService.checkHierarchy(moderator, target);
  if (!hierarchyCheck.allowed) { await interaction.reply({ embeds: [embedUtils.error('Permission Denied', hierarchyCheck.reason!)], ephemeral: true }); return; }
  const protectedCheck = await permissionService.isProtectedTarget(guild, target.id, guild.id);
  if (!protectedCheck.allowed) { await interaction.reply({ embeds: [embedUtils.error('Protected User', protectedCheck.reason!)], ephemeral: true }); return; }
  const botPermission = permissionService.checkBotPermission(guild, [PermissionFlagsBits.ManageRoles]);
  if (!botPermission.allowed) { await interaction.reply({ embeds: [embedUtils.error('Bot Permission Missing', botPermission.reason!)], ephemeral: true }); return; }
  const botHierarchy = permissionService.checkBotHierarchy(guild, target);
  if (!botHierarchy.allowed) { await interaction.reply({ embeds: [embedUtils.error('Cannot Manage User', botHierarchy.reason!)], ephemeral: true }); return; }

  const botRoleCheck = permissionService.checkBotRoleHierarchy(guild, role as Role);
  if (!botRoleCheck.allowed) {
    await interaction.reply({ embeds: [embedUtils.error('Cannot Manage Role', botRoleCheck.reason!)], ephemeral: true });
    return;
  }

  if (!target.roles.cache.has(role.id)) {
    await interaction.reply({
      embeds: [embedUtils.error('No Such Role', `${target.user.tag} does not have the **${role.name}** role.`)],
      ephemeral: true,
    });
    return;
  }

  await target.roles.remove(role.id, reason ?? undefined);

  const modCase = await auditService.createCase({
    guildId: guild.id,
    action: ModerationAction.REMOVEROLE,
    userId: target.id,
    moderatorId: moderator.id,
    reason,
    metadata: { roleId: role.id, roleName: role.name },
  });

  await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
    eventType: 'Role Removed',
    user: { id: moderator.id, tag: moderator.user.tag },
    target: { id: target.id, tag: target.user.tag },
    action: 'Remove Role',
    reason,
    guildId: guild.id,
    guildName: guild.name,
    color: Colors.LOG_DELETE,
    metadata: { role: role.name },
    relevantIds: { 'Case': `#${modCase.caseNumber}` },
  });

  await interaction.reply({
    embeds: [
      embedUtils.moderation('Role Removed', Colors.LOG_DELETE, [
        { name: 'User', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Role', value: role.name, inline: true },
        { name: 'Moderator', value: moderator.user.tag, inline: true },
        { name: 'Reason', value: reason ?? 'No reason provided', inline: false },
        { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
      ]),
    ],
  });
}

export default command;



