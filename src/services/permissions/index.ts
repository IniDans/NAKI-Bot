import {
  GuildMember,
  Guild,
  PermissionResolvable,
  PermissionsBitField,
  Role,
  ChatInputCommandInteraction,
} from 'discord.js';
import { db } from '../database/index.js';
import { appLogger } from '../../utils/logger.js';
import type { PermissionCheckResult } from '../../types/index.js';

const prisma = db.client;

/**
 * Permission service — validates user permissions, bot permissions,
 * role hierarchy, and protected target status before any action.
 */
export const permissionService = {
  /**
   * Check if a user has the required Discord permissions.
   */
  checkUserPermission(
    member: GuildMember,
    permissions: PermissionResolvable[],
  ): PermissionCheckResult {
    for (const perm of permissions) {
      if (!member.permissions.has(perm)) {
        const permName =
          typeof perm === 'bigint'
            ? new PermissionsBitField(perm).toArray().join(', ')
            : String(perm);

        return {
          allowed: false,
          reason: `You lack the required permission: **${permName}**`,
        };
      }
    }

    return { allowed: true };
  },

  /**
   * Check if the bot has the required Discord permissions in the guild.
   */
  checkBotPermission(
    guild: Guild,
    permissions: PermissionResolvable[],
  ): PermissionCheckResult {
    const botMember = guild.members.me;
    if (!botMember) {
      return {
        allowed: false,
        reason: 'I could not resolve my own guild member. This is unexpected.',
      };
    }

    for (const perm of permissions) {
      if (!botMember.permissions.has(perm)) {
        const permName =
          typeof perm === 'bigint'
            ? new PermissionsBitField(perm).toArray().join(', ')
            : String(perm);

        return {
          allowed: false,
          reason: `I lack the required permission: **${permName}**`,
        };
      }
    }

    return { allowed: true };
  },

  /**
   * Check role hierarchy — executor's highest role must be above target's highest role.
   * Guild owner always passes this check.
   */
  checkHierarchy(
    executor: GuildMember,
    target: GuildMember,
  ): PermissionCheckResult {
    // Owner always passes
    if (executor.id === executor.guild.ownerId) {
      return { allowed: true };
    }

    if (executor.roles.highest.position <= target.roles.highest.position) {
      return {
        allowed: false,
        reason: `Your highest role (**${executor.roles.highest.name}**) is not above the target's highest role (**${target.roles.highest.name}**). You cannot perform this action.`,
      };
    }

    return { allowed: true };
  },

  /**
   * Check if the bot's highest role is above the target's highest role.
   */
  checkBotHierarchy(
    guild: Guild,
    target: GuildMember,
  ): PermissionCheckResult {
    const botMember = guild.members.me;
    if (!botMember) {
      return {
        allowed: false,
        reason: 'I could not resolve my own guild member.',
      };
    }

    if (botMember.roles.highest.position <= target.roles.highest.position) {
      return {
        allowed: false,
        reason: `My highest role (**${botMember.roles.highest.name}**) is not above the target's highest role (**${target.roles.highest.name}**). I cannot perform this action.`,
      };
    }

    return { allowed: true };
  },

  /**
   * Check if the bot can manage a specific role (bot's highest role must be above it).
   */
  checkBotRoleHierarchy(
    guild: Guild,
    role: Role,
  ): PermissionCheckResult {
    const botMember = guild.members.me;
    if (!botMember) {
      return {
        allowed: false,
        reason: 'I could not resolve my own guild member.',
      };
    }

    if (botMember.roles.highest.position <= role.position) {
      return {
        allowed: false,
        reason: `My highest role is not above **${role.name}**. I cannot manage this role.`,
      };
    }

    return { allowed: true };
  },

  /**
   * Check if a target user is protected (owner, bot, security admin, protected role).
   * Protected users cannot be targeted by moderation actions.
   */
  async isProtectedTarget(
    guild: Guild,
    targetId: string,
    guildId: string,
  ): Promise<PermissionCheckResult> {
    // Server owner is ALWAYS protected
    if (targetId === guild.ownerId) {
      return {
        allowed: false,
        reason: 'You cannot perform this action against the server owner.',
      };
    }

    // The bot itself is ALWAYS protected
    if (targetId === guild.client.user?.id) {
      return {
        allowed: false,
        reason: 'You cannot perform this action against me.',
      };
    }

    // Check security whitelist (whitelisted users are protected from anti-nuke/anti-raid,
    // but for moderation they can be targeted by those with higher roles)
    try {
      const securityConfig = await prisma.securityConfig.findUnique({
        where: { guildId },
      });

      if (securityConfig?.securityAdminRoles) {
        const adminRoles = securityConfig.securityAdminRoles as string[];
        const targetMember = await guild.members.fetch(targetId).catch(() => null);

        if (targetMember && adminRoles.some((roleId) => targetMember.roles.cache.has(roleId))) {
          return {
            allowed: false,
            reason: 'This user has a protected security admin role and cannot be targeted.',
          };
        }
      }
    } catch (error) {
      appLogger.error('Error checking protected target', 'Permissions', {
        error: error instanceof Error ? error.message : String(error),
        guildId,
        targetId,
      });
    }

    return { allowed: true };
  },

  /**
   * Check if a user is in the security whitelist.
   */
  async isWhitelisted(guildId: string, userId: string): Promise<boolean> {
    const entry = await prisma.securityWhitelist.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });

    return !!entry;
  },

  /**
   * Run the full permission pipeline for a moderation command.
   * Order: User permission → Bot permission → Role hierarchy → Protected target
   */
  async validateModerationAction(
    interaction: ChatInputCommandInteraction,
    targetMember: GuildMember,
    requiredUserPerms: PermissionResolvable[],
    requiredBotPerms: PermissionResolvable[],
  ): Promise<PermissionCheckResult> {
    const { guild, member } = interaction;
    if (!guild || !member) {
      return { allowed: false, reason: 'This command can only be used in a server.' };
    }

    const executorMember = member as GuildMember;

    // 1. User permission check
    const userCheck = this.checkUserPermission(executorMember, requiredUserPerms);
    if (!userCheck.allowed) return userCheck;

    // 2. Bot permission check
    const botCheck = this.checkBotPermission(guild, requiredBotPerms);
    if (!botCheck.allowed) return botCheck;

    // 3. Role hierarchy check (executor > target)
    const hierarchyCheck = this.checkHierarchy(executorMember, targetMember);
    if (!hierarchyCheck.allowed) return hierarchyCheck;

    // 4. Bot hierarchy check (bot > target)
    const botHierarchyCheck = this.checkBotHierarchy(guild, targetMember);
    if (!botHierarchyCheck.allowed) return botHierarchyCheck;

    // 5. Protected target check
    const protectedCheck = await this.isProtectedTarget(guild, targetMember.id, guild.id);
    if (!protectedCheck.allowed) return protectedCheck;

    return { allowed: true };
  },
};
