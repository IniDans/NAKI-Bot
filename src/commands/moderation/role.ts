import {
  type ChatInputCommandInteraction,
  type GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type Role,
  SlashCommandBuilder,
} from 'discord.js';
import { permissionService } from '../../services/permissions/index.js';
import { auditService } from '../../services/audit/index.js';
import { logModule } from '../../modules/logger/index.js';
import { scheduler } from '../../services/scheduler/index.js';
import { replyProblem } from '../../modules/moderation/command-helpers.js';
import { embedUtils } from '../../utils/embed.js';
import { parseDuration } from '../../utils/duration.js';
import { Colors, LogCategory, ModerationAction } from '../../config/constants.js';
import { db } from '../../services/database/index.js';
import type { Command } from '../../types/index.js';

const prisma = db.client;

/** Give or take a role, optionally only for a while. */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Give a role to someone or take it away')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((sub) =>
      sub
        .setName('give')
        .setDescription('Give someone a role, forever or for a while')
        .addUserOption((o) => o.setName('member').setDescription('Who gets the role').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Which role').setRequired(true))
        .addStringOption((o) =>
          o.setName('duration').setDescription('Take it away again after, e.g. 1h, 7d. Leave empty to keep it.'),
        )
        .addStringOption((o) => o.setName('reason').setDescription('Why (optional)').setMaxLength(500)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('take')
        .setDescription('Take a role away from someone')
        .addUserOption((o) => o.setName('member').setDescription('Who loses the role').setRequired(true))
        .addRoleOption((o) => o.setName('role').setDescription('Which role').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Why (optional)').setMaxLength(500)),
    ),
  requiredPermissions: [PermissionFlagsBits.ManageRoles],
  rateLimitCategory: 'ADMIN',
  guildOnly: true,

  async execute(interaction) {
    const target = interaction.options.getMember('member') as GuildMember | null;
    if (!target) return replyProblem(interaction, 'Member Not Found', 'That person is not in this server anymore.');
    const role = interaction.options.getRole('role', true) as Role;
    if (!(await canChange(interaction, target, role))) return;
    if (interaction.options.getSubcommand() === 'give') await give(interaction, target, role);
    else await take(interaction, target, role);
  },
};

/** Same safety checks the old /admin command used: you and the bot must both be above the member and the role. */
async function canChange(interaction: ChatInputCommandInteraction, target: GuildMember, role: Role): Promise<boolean> {
  const guild = interaction.guild!;
  const moderator = interaction.member as GuildMember;
  if (role.managed || role.id === guild.id) {
    await replyProblem(interaction, 'Cannot Use This Role', 'This role is managed by Discord or an app and cannot be given by hand.');
    return false;
  }
  if (moderator.id !== guild.ownerId && role.position >= moderator.roles.highest.position) {
    await replyProblem(interaction, 'Role Too High', `**${role.name}** is the same as or higher than your own highest role.`);
    return false;
  }
  const checks = [
    ['Not Allowed', permissionService.checkUserPermission(moderator, [PermissionFlagsBits.ManageRoles])],
    ['Not Allowed', permissionService.checkHierarchy(moderator, target)],
    ['Protected Member', await permissionService.isProtectedTarget(guild, target.id, guild.id)],
    ['Bot Is Missing a Permission', permissionService.checkBotPermission(guild, [PermissionFlagsBits.ManageRoles])],
    ['Bot Cannot Change This Member', permissionService.checkBotHierarchy(guild, target)],
    ['Bot Cannot Use This Role', permissionService.checkBotRoleHierarchy(guild, role)],
  ] as const;
  for (const [title, result] of checks) {
    if (!result.allowed) {
      await replyProblem(interaction, title, result.reason ?? 'This action is not allowed.');
      return false;
    }
  }
  return true;
}

async function give(interaction: ChatInputCommandInteraction, target: GuildMember, role: Role) {
  const guild = interaction.guild!;
  const moderator = interaction.member as GuildMember;
  const reason = interaction.options.getString('reason');
  const durationInput = interaction.options.getString('duration');

  let duration: { ms: number; human: string } | null = null;
  if (durationInput) {
    try {
      duration = parseDuration(durationInput);
    } catch {
      return replyProblem(interaction, 'Invalid Duration', 'Write it like `30m`, `12h`, `7d` or `2w`, or leave it empty to keep the role.');
    }
  }
  if (target.roles.cache.has(role.id) && !duration) {
    await interaction.reply({
      embeds: [embedUtils.warning('Already Has Role', `${target.user.tag} already has **${role.name}**.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await target.roles.add(role.id, reason ?? (duration ? `Temporary role for ${duration.human}` : undefined));

  let expiresAt: Date | null = null;
  if (duration) {
    expiresAt = new Date(Date.now() + duration.ms);
    await prisma.temporaryRole.create({
      data: { guildId: guild.id, userId: target.id, roleId: role.id, assignedBy: moderator.id, reason, expiresAt, active: true },
    });
    await scheduler.scheduleTask(guild.id, 'TEMP_ROLE_EXPIRE', { userId: target.id, roleId: role.id }, expiresAt);
  }

  const modCase = await auditService.createCase({
    guildId: guild.id,
    action: duration ? ModerationAction.TEMPROLE : ModerationAction.ADDROLE,
    userId: target.id,
    moderatorId: moderator.id,
    reason,
    duration: duration?.ms,
    metadata: { roleId: role.id, roleName: role.name },
  });

  await logModule.sendLog(interaction.client, guild.id, LogCategory.MODERATION, {
    eventType: duration ? 'Temporary Role Given' : 'Role Given',
    user: { id: moderator.id, tag: moderator.user.tag },
    target: { id: target.id, tag: target.user.tag },
    action: duration ? 'Temprole' : 'Give Role',
    reason,
    guildId: guild.id,
    guildName: guild.name,
    color: Colors.INFO,
    metadata: duration ? { role: role.name, duration: duration.human, expiresAt: expiresAt!.toISOString() } : { role: role.name },
    relevantIds: { Case: `#${modCase.caseNumber}` },
  });

  await interaction.reply({
    embeds: [
      embedUtils.moderation('Role Given', Colors.INFO, [
        { name: 'Member', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Role', value: role.name, inline: true },
        {
          name: 'Until',
          value: expiresAt ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R> (${duration!.human})` : 'Forever',
          inline: true,
        },
        { name: 'Reason', value: reason ?? 'No reason given', inline: false },
        { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
      ]),
    ],
  });
}

async function take(interaction: ChatInputCommandInteraction, target: GuildMember, role: Role) {
  const guild = interaction.guild!;
  const moderator = interaction.member as GuildMember;
  const reason = interaction.options.getString('reason');

  if (!target.roles.cache.has(role.id)) {
    return replyProblem(interaction, 'Does Not Have Role', `${target.user.tag} does not have **${role.name}**.`);
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
    relevantIds: { Case: `#${modCase.caseNumber}` },
  });

  await interaction.reply({
    embeds: [
      embedUtils.moderation('Role Taken Away', Colors.LOG_DELETE, [
        { name: 'Member', value: `${target.user.tag} (${target.id})`, inline: true },
        { name: 'Role', value: role.name, inline: true },
        { name: 'Reason', value: reason ?? 'No reason given', inline: false },
        { name: 'Case', value: `#${modCase.caseNumber}`, inline: true },
      ]),
    ],
  });
}

export default command;
