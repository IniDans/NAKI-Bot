import { Message } from 'discord.js';
import { db } from '../../services/database/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { auditService } from '../../services/audit/index.js';
import { permissionService } from '../../services/permissions/index.js';
import { logModule } from '../logger/index.js';
import { AutoModAction, AutoModRuleType, Colors, LogCategory } from '../../config/constants.js';
import { parseDuration } from '../../utils/duration.js';

const prisma = db.client;
const recentMessages = new Map<string, { content: string; timestamp: number }[]>();
const MAX_TRACKED_PER_USER = 50;
const MAX_RULES = 100;

interface RuleConfig {
  maxMessages?: number;
  timeWindowSeconds?: number;
  maxMentions?: number;
  minimumMessageLength?: number;
  capsPercentage?: number;
  words?: string[];
  match?: 'exact' | 'contains' | 'regex';
  pattern?: string;
  blockedDomains?: string[];
  allowedDomains?: string[];
  blockAllExternal?: boolean;
  blockInvites?: boolean;
}

interface Violation {
  rule: { id: string; ruleType: string; action: string; actionConfig: unknown };
  reason: string;
}

function normalize(value: unknown): RuleConfig {
  return value && typeof value === 'object' ? value as RuleConfig : {};
}

function isCapsViolation(content: string, config: RuleConfig): boolean {
  const letters = [...content].filter((char) => /[a-z]/i.test(char));
  if (letters.length < (config.minimumMessageLength ?? 10)) return false;
  const caps = letters.filter((char) => char === char.toUpperCase()).length;
  return caps / letters.length >= (config.capsPercentage ?? 0.7);
}

function linksIn(content: string): string[] {
  return [...content.matchAll(/https?:\/\/([^\s/]+)[^\s]*/gi)].map((match) => match[1].toLowerCase());
}

function matchesBannedWord(content: string, config: RuleConfig): boolean {
  const words = (config.words ?? []).filter((word) => typeof word === 'string' && word.length > 0);
  const mode = config.match ?? 'contains';
  if (mode === 'regex') {
    if (!config.pattern || config.pattern.length > 256) return false;
    try {
      return new RegExp(config.pattern, 'iu').test(content);
    } catch {
      return false;
    }
  }
  const lowered = content.toLocaleLowerCase();
  return words.some((word) => mode === 'exact'
    ? lowered.split(/\s+/u).includes(word.toLocaleLowerCase())
    : lowered.includes(word.toLocaleLowerCase()));
}

function violatesLinkFilter(content: string, config: RuleConfig): boolean {
  const domains = linksIn(content);
  if (config.blockInvites && /(discord\.gg|discord\.com\/invite)\//iu.test(content)) return true;
  if (config.blockAllExternal && domains.length > 0) return true;
  const blocked = new Set((config.blockedDomains ?? []).map((domain) => domain.toLowerCase()));
  const allowed = new Set((config.allowedDomains ?? []).map((domain) => domain.toLowerCase()));
  return domains.some((domain) => blocked.has(domain) || (allowed.size > 0 && !allowed.has(domain)));
}

function actionConfigDuration(config: unknown): number | null {
  if (!config || typeof config !== 'object') return null;
  const duration = (config as { duration?: unknown }).duration;
  if (typeof duration !== 'string') return null;
  try { return parseDuration(duration).ms; } catch { return null; }
}

async function executeAction(message: Message, violation: Violation): Promise<void> {
  const member = message.member;
  const action = violation.rule.action as AutoModAction;
  const reason = `AutoMod: ${violation.reason}`;

  if (member && [AutoModAction.TIMEOUT, AutoModAction.MUTE, AutoModAction.KICK, AutoModAction.BAN, AutoModAction.ADD_ROLE].includes(action)) {
    const protectedCheck = await permissionService.isProtectedTarget(message.guild!, member.id, message.guild!.id);
    const hierarchyCheck = permissionService.checkBotHierarchy(message.guild!, member);
    const roleId = typeof violation.rule.actionConfig === 'object' && violation.rule.actionConfig
      ? (violation.rule.actionConfig as { roleId?: unknown }).roleId : undefined;
    const role = typeof roleId === 'string' ? message.guild!.roles.cache.get(roleId) : null;
    const roleCheck = action === AutoModAction.ADD_ROLE
      ? role ? permissionService.checkBotRoleHierarchy(message.guild!, role) : { allowed: false, reason: 'Configured AutoMod role does not exist.' }
      : { allowed: true };
    if (!protectedCheck.allowed || !hierarchyCheck.allowed || !roleCheck.allowed) {
      await logModule.sendLog(message.client, message.guild!.id, LogCategory.SECURITY, {
        eventType: 'AutoMod Action Blocked', user: { id: member.id, tag: member.user.tag }, action: 'Blocked', reason: protectedCheck.reason ?? hierarchyCheck.reason ?? roleCheck.reason, guildId: message.guild!.id, guildName: message.guild!.name, color: Colors.SECURITY_MEDIUM,
      });
      return;
    }
  }

  if (action === AutoModAction.DELETE || action === AutoModAction.WARN || action === AutoModAction.TIMEOUT || action === AutoModAction.MUTE || action === AutoModAction.KICK || action === AutoModAction.BAN) {
    await message.delete().catch(() => undefined);
  }

  if (member && action === AutoModAction.WARN) {
    await auditService.createWarning(message.guild!.id, member.id, message.client.user!.id, reason);
  }
  if (member && action === AutoModAction.TIMEOUT) {
    const duration = actionConfigDuration(violation.rule.actionConfig) ?? 60_000;
    await member.timeout(duration, reason).catch(() => undefined);
  }
  if (member && action === AutoModAction.MUTE) {
    const muteRole = message.guild!.roles.cache.find((role) => role.name.toLowerCase() === 'muted');
    if (muteRole) await member.roles.add(muteRole, reason).catch(() => undefined);
  }
  if (member && action === AutoModAction.KICK) await member.kick(reason).catch(() => undefined);
  if (member && action === AutoModAction.BAN) await member.ban({ reason, deleteMessageSeconds: 0 }).catch(() => undefined);
  if (member && action === AutoModAction.ADD_ROLE) {
    const roleId = typeof violation.rule.actionConfig === 'object' && violation.rule.actionConfig
      ? (violation.rule.actionConfig as { roleId?: unknown }).roleId : undefined;
    if (typeof roleId === 'string') await member.roles.add(roleId, reason).catch(() => undefined);
  }

  await logModule.sendLog(message.client, message.guild!.id, LogCategory.SECURITY, {
    eventType: 'AutoMod Violation',
    user: { id: member?.id ?? message.author.id, tag: message.author.tag },
    action: action,
    reason,
    guildId: message.guild!.id,
    guildName: message.guild!.name,
    color: Colors.SECURITY_MEDIUM,
    metadata: { rule: violation.rule.ruleType, channel: `<#${message.channelId}>` },
    relevantIds: { 'Message ID': message.id },
  });
}

export const automodModule = {
  async processMessage(message: Message): Promise<void> {
    const guildConfig = await guildService.getGuildConfig(message.guild!.id);
    if (!guildConfig.autoModEnabled) return;

    const rules = await prisma.autoModRule.findMany({ where: { guildId: message.guild!.id, enabled: true }, take: MAX_RULES });
    if (rules.length === 0) return;
    const key = `${message.guild!.id}:${message.author.id}`;
    const now = Date.now();
    const history = (recentMessages.get(key) ?? []).filter((entry) => now - entry.timestamp < 60_000);
    const normalized = message.content.trim().toLocaleLowerCase();
    const violations: Violation[] = [];

    for (const rule of rules) {
      const config = normalize(rule.config);
      let violated = false;
      let reason = rule.ruleType;
      switch (rule.ruleType as AutoModRuleType) {
        case AutoModRuleType.SPAM: {
          const windowMs = Math.max(1, config.timeWindowSeconds ?? 3) * 1000;
          violated = history.filter((entry) => now - entry.timestamp <= windowMs).length + 1 > (config.maxMessages ?? 5);
          reason = `spam threshold exceeded (${config.maxMessages ?? 5} messages)`;
          break;
        }
        case AutoModRuleType.DUPLICATE:
          violated = history.some((entry) => entry.content === normalized);
          reason = 'duplicate message';
          break;
        case AutoModRuleType.MENTION_SPAM:
          violated = message.mentions.users.size + message.mentions.roles.size > (config.maxMentions ?? 5);
          reason = 'excessive mentions';
          break;
        case AutoModRuleType.MASS_PING:
          violated = message.mentions.everyone || message.mentions.users.size + message.mentions.roles.size > (config.maxMentions ?? 10);
          reason = 'mass ping';
          break;
        case AutoModRuleType.EXCESSIVE_CAPS:
          violated = isCapsViolation(message.content, config);
          reason = 'excessive caps';
          break;
        case AutoModRuleType.BANNED_WORDS:
          violated = matchesBannedWord(message.content, config);
          reason = 'banned word or pattern';
          break;
        case AutoModRuleType.LINK_FILTER:
          violated = violatesLinkFilter(message.content, config);
          reason = 'blocked link';
          break;
      }
      if (violated) violations.push({ rule, reason });
    }

    history.push({ content: normalized, timestamp: now });
    recentMessages.set(key, history.slice(-MAX_TRACKED_PER_USER));
    for (const violation of violations) await executeAction(message, violation);
  },

  clearCache(): void { recentMessages.clear(); },
};



