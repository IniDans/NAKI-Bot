import { Client, Guild, GuildMember } from 'discord.js';
import { db } from '../../services/database/index.js';
import { modConfigService } from '../../services/database/modconfig.service.js';
import { auditService } from '../../services/audit/index.js';
import { permissionService } from '../../services/permissions/index.js';
import { scheduler } from '../../services/scheduler/index.js';
import { logModule } from '../logger/index.js';
import { Colors, DiscordLimits, LogCategory, ModerationAction } from '../../config/constants.js';
import { embedUtils } from '../../utils/embed.js';
import { parseDuration } from '../../utils/duration.js';
import { appLogger } from '../../utils/logger.js';

const prisma = db.client;

export { ESCALATION_ACTIONS, parseSteps, type EscalationAction, type EscalationStep } from './steps.js';
import { appealUrl } from './appeal.js';
import { parseSteps, type EscalationStep } from './steps.js';

/** Warnings that still count: all of them, or only those newer than the configured expiry. */
export async function countActiveWarnings(guildId: string, userId: string): Promise<number> {
  const config = await modConfigService.get(guildId);
  const days = config?.warnExpiryDays ?? 0;
  const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;
  return prisma.warning.count({ where: { guildId, userId, ...(since ? { createdAt: { gte: since } } : {}) } });
}

function durationMs(step: EscalationStep): number | null {
  if (!step.duration) return null;
  try {
    return parseDuration(step.duration).ms;
  } catch {
    return null;
  }
}

/**
 * Applies the escalation step whose threshold equals the member's active warning count.
 * Matching on equality means each step fires once, when the count first reaches it.
 * Returns a short description of what happened, or null when nothing applied.
 */
export async function applyEscalation(client: Client, guild: Guild, member: GuildMember, warnCount: number): Promise<string | null> {
  const config = await modConfigService.get(guild.id);
  if (!config?.escalationEnabled) return null;
  const step = parseSteps(config.escalationSteps).find((s) => s.warns === warnCount);
  if (!step) return null;

  const protectedCheck = await permissionService.isProtectedTarget(guild, member.id, guild.id);
  const hierarchy = permissionService.checkBotHierarchy(guild, member);
  if (!protectedCheck.allowed || !hierarchy.allowed) {
    appLogger.warn(`Escalation skipped for ${member.id}`, 'Escalation', { guildId: guild.id, reason: protectedCheck.reason ?? hierarchy.reason });
    return null;
  }

  const reason = `Automatic: reached ${warnCount} warnings`;
  const ms = durationMs(step);
  let label: string;
  let caseAction: ModerationAction;
  let caseDuration: number | null = null;

  try {
    switch (step.action) {
      case 'TIMEOUT': {
        const timeoutMs = Math.min(ms ?? 3_600_000, DiscordLimits.TIMEOUT_MAX_MS);
        await member.timeout(timeoutMs, reason);
        label = 'Timeout';
        caseAction = ModerationAction.TIMEOUT;
        caseDuration = timeoutMs;
        break;
      }
      case 'KICK':
        await member.send({ embeds: [embedUtils.dmNotification(guild.name, 'Kicked', reason)] }).catch(() => undefined);
        await member.kick(reason);
        label = 'Kick';
        caseAction = ModerationAction.KICK;
        break;
      case 'BAN':
      case 'TEMPBAN': {
        const temporary = step.action === 'TEMPBAN' && ms !== null;
        await member
          .send({
            embeds: [
              embedUtils.dmNotification(
                guild.name,
                temporary ? 'Temporarily banned' : 'Banned',
                reason,
                null,
                await appealUrl(guild.id),
              ),
            ],
          })
          .catch(() => undefined);
        await member.ban({ reason });
        if (temporary) {
          await scheduler.scheduleTask(guild.id, 'TEMP_BAN_EXPIRE', { userId: member.id }, new Date(Date.now() + ms));
          caseDuration = ms;
        }
        label = temporary ? 'Temporary ban' : 'Ban';
        caseAction = ModerationAction.BAN;
        break;
      }
    }
  } catch (error) {
    appLogger.error(`Escalation ${step.action} failed for ${member.id}`, 'Escalation', {
      guildId: guild.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  const modCase = await auditService.createCase({
    guildId: guild.id,
    action: caseAction,
    userId: member.id,
    moderatorId: client.user!.id,
    reason,
    duration: caseDuration,
    metadata: { escalation: true, warnCount },
  });

  await logModule.sendLog(client, guild.id, LogCategory.MODERATION, {
    eventType: 'Warn Escalation',
    user: { id: client.user!.id, tag: client.user!.tag },
    target: { id: member.id, tag: member.user.tag },
    action: label,
    reason,
    guildId: guild.id,
    guildName: guild.name,
    color: step.action === 'TIMEOUT' ? Colors.TIMEOUT : step.action === 'KICK' ? Colors.KICK : Colors.BAN,
    relevantIds: { Case: `#${modCase.caseNumber}` },
  });

  return step.duration && caseDuration ? `${label} (${step.duration})` : label;
}
