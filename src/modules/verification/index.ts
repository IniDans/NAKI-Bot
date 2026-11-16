import { AttachmentBuilder, GuildMember, PermissionFlagsBits } from 'discord.js';
import type { VerificationConfig } from '@prisma/client';
import { roleIdList, verificationService } from '../../services/database/verification.service.js';
import { auditService } from '../../services/audit/index.js';
import { logModule } from '../logger/index.js';
import { Colors, LogCategory, ModerationAction } from '../../config/constants.js';
import { TtlCache } from '../../utils/ttlCache.js';
import { appLogger } from '../../utils/logger.js';
import { generateCode, matchesCode, renderCaptcha } from './captcha.js';
import { checkAlt } from './alt.js';

export { checkAlt, type AltVerdict } from './alt.js';

export const CAPTCHA_TTL_MS = 5 * 60_000;
export const CAPTCHA_MAX_ATTEMPTS = 3;

const captchas = new TtlCache<{ code: string; attempts: number }>(CAPTCHA_TTL_MS, 10_000);

/** Adds the roles the bot is allowed to give; skips missing roles and roles above the bot. */
async function addRoles(member: GuildMember, roleIds: string[], reason: string): Promise<void> {
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;
  const assignable = roleIds.filter((id) => {
    const role = member.guild.roles.cache.get(id);
    return role && !role.managed && role.position < me.roles.highest.position && !member.roles.cache.has(id);
  });
  if (assignable.length) await member.roles.add(assignable, reason);
}

async function handleAlt(member: GuildMember, config: VerificationConfig, reasons: string[]): Promise<boolean> {
  const guild = member.guild;
  const reason = `Alt filter: ${reasons.join('; ')}`;
  let action = config.altAction;
  if (action === 'KICK' && !member.kickable) action = 'LOG';
  if (action === 'BAN' && !member.bannable) action = 'LOG';

  if (action !== 'LOG') {
    await member
      .send(
        `You were ${action === 'BAN' ? 'banned' : 'removed'} from **${guild.name}** because your account does not meet the server's requirements (${reasons.join('; ')}).`,
      )
      .catch(() => undefined);
    if (action === 'KICK') await member.kick(reason);
    else await member.ban({ reason, deleteMessageSeconds: 0 });
    await auditService.createCase({
      guildId: guild.id,
      action: action === 'KICK' ? ModerationAction.KICK : ModerationAction.BAN,
      userId: member.id,
      moderatorId: member.client.user.id,
      reason,
      metadata: { altFilter: true },
    });
  }

  await logModule.sendLog(member.client, guild.id, LogCategory.MODERATION, {
    eventType: 'Alt Filter',
    target: { id: member.id, tag: member.user.tag },
    action: action === 'LOG' ? 'Flagged' : action === 'KICK' ? 'Kicked' : 'Banned',
    reason,
    guildId: guild.id,
    guildName: guild.name,
    color: action === 'BAN' ? Colors.BAN : action === 'KICK' ? Colors.KICK : Colors.WARNING,
    metadata: {
      'Account Created': `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
      ...(config.altAction !== action ? { Note: `Configured action ${config.altAction} skipped: missing permission or role hierarchy` } : {}),
    },
    relevantIds: { 'User ID': member.id },
  });
  return action !== 'LOG';
}

export const verificationModule = {
  /**
   * Runs before the welcome message. Returns false when the member was removed
   * by the alt filter, so the caller can skip greeting someone who already left.
   */
  async handleMemberJoin(member: GuildMember): Promise<boolean> {
    const config = await verificationService.get(member.guild.id);
    if (!config) return true;

    if (member.user.bot) {
      await addRoles(member, roleIdList(config.botRoles), 'Bot autorole');
      return true;
    }

    const verdict = checkAlt(config, { createdTimestamp: member.user.createdTimestamp, hasAvatar: Boolean(member.user.avatar) });
    if (verdict.flagged) {
      try {
        if (await handleAlt(member, config, verdict.reasons)) return false;
      } catch (error) {
        appLogger.error('Alt filter action failed', 'Verification', {
          guildId: member.guild.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (config.enabled) {
      if (config.unverifiedRoleId) await addRoles(member, [config.unverifiedRoleId], 'Awaiting verification');
      return true;
    }
    await addRoles(member, roleIdList(config.autoRoles), 'Autorole');
    return true;
  },

  async isVerified(member: GuildMember, config: VerificationConfig): Promise<boolean> {
    if (config.verifiedRoleId) return member.roles.cache.has(config.verifiedRoleId);
    if (config.unverifiedRoleId) return !member.roles.cache.has(config.unverifiedRoleId);
    return false;
  },

  async complete(member: GuildMember, config: VerificationConfig): Promise<void> {
    const me = member.guild.members.me;
    if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId) && me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      const role = member.guild.roles.cache.get(config.unverifiedRoleId);
      if (role && role.position < me.roles.highest.position) await member.roles.remove(role, 'Verified');
    }
    const roles = [...(config.verifiedRoleId ? [config.verifiedRoleId] : []), ...roleIdList(config.autoRoles)];
    await addRoles(member, roles, 'Verified');
    captchas.delete(`${member.guild.id}:${member.id}`);
  },

  /** Creates a fresh code for this member and returns the image to show them. */
  newCaptcha(guildId: string, userId: string): AttachmentBuilder {
    const code = generateCode();
    captchas.set(`${guildId}:${userId}`, { code, attempts: 0 });
    return new AttachmentBuilder(renderCaptcha(code), { name: 'captcha.png' });
  },

  /** 'ok', 'wrong' (attempts left), 'locked' (out of attempts) or 'expired'. */
  checkCaptcha(guildId: string, userId: string, answer: string): 'ok' | 'wrong' | 'locked' | 'expired' {
    const key = `${guildId}:${userId}`;
    const entry = captchas.get(key);
    if (!entry) return 'expired';
    if (matchesCode(entry.code, answer)) return 'ok';
    entry.attempts += 1;
    if (entry.attempts >= CAPTCHA_MAX_ATTEMPTS) {
      captchas.delete(key);
      return 'locked';
    }
    return 'wrong';
  },
};
