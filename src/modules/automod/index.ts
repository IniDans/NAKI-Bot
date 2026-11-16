import type { AutoModRule } from '@prisma/client';
import type { AutoModerationActionExecution, Client, Guild, GuildMember, Message, User } from 'discord.js';
import { db } from '../../services/database/index.js';
import { guildService } from '../../services/database/guild.service.js';
import { modConfigService } from '../../services/database/modconfig.service.js';
import { auditService } from '../../services/audit/index.js';
import { permissionService } from '../../services/permissions/index.js';
import { logModule } from '../logger/index.js';
import { AutoModAction, AutoModRuleType, Colors, LogCategory } from '../../config/constants.js';
import { parseDuration } from '../../utils/duration.js';
import { TtlCache } from '../../utils/ttlCache.js';
import { applyEscalation, countActiveWarnings } from '../moderation/escalation.js';
import { countEmojis, inviteCodes, isZalgo, phishingReason } from './detectors.js';

const prisma = db.client;
const recentMessages = new Map<string, { content: string; timestamp: number }[]>();
const MAX_TRACKED_PER_USER = 50;
const MAX_RULES = 100;

// Rules are read on every message; dashboard edits show up when the entry expires.
const rulesCache = new TtlCache<AutoModRule[]>(30_000, 5_000);
// Invite code -> guild it points to ('' when the invite is invalid).
const inviteGuilds = new TtlCache<string>(60 * 60_000, 2_000);

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
  allowOwnInvites?: boolean;
  extraDomains?: string[];
  maxEmojis?: number;
  maxStack?: number;
  exemptChannels?: string[];
  exemptRoles?: string[];
}

interface Violation {
  rule: Pick<AutoModRule, 'id' | 'ruleType' | 'action' | 'actionConfig'>;
  reason: string;
}

/** What an action needs to know, whether it came from a message or a native AutoMod hit. */
interface ActionTarget {
  client: Client;
  guild: Guild;
  member: GuildMember | null;
  user: User;
  channelId: string;
  messageId: string | null;
  /** Removes the offending message; absent when Discord already blocked it. */
  deleteMessage?: () => Promise<unknown>;
}

function normalize(value: unknown): RuleConfig {
  return value && typeof value === 'object' ? (value as RuleConfig) : {};
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

export function matchesBannedWord(content: string, config: RuleConfig): boolean {
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
  return words.some((word) =>
    mode === 'exact'
      ? lowered.split(/\s+/u).includes(word.toLocaleLowerCase())
      : lowered.includes(word.toLocaleLowerCase()),
  );
}

function violatesLinkFilter(content: string, config: RuleConfig): boolean {
  const domains = linksIn(content);
  if (config.blockInvites && /(discord\.gg|discord\.com\/invite)\//iu.test(content)) return true;
  if (config.blockAllExternal && domains.length > 0) return true;
  const blocked = new Set((config.blockedDomains ?? []).map((domain) => domain.toLowerCase()));
  const allowed = new Set((config.allowedDomains ?? []).map((domain) => domain.toLowerCase()));
  return domains.some((domain) => blocked.has(domain) || (allowed.size > 0 && !allowed.has(domain)));
}

/** True when the message has an invite to some other server. */
async function hasForeignInvite(message: Message<true>, config: RuleConfig): Promise<boolean> {
  const codes = inviteCodes(message.content);
  if (codes.length === 0) return false;
  if (!config.allowOwnInvites) return true;
  for (const code of codes) {
    if (code === message.guild.vanityURLCode) continue;
    const target = await inviteGuilds.getOrLoad(code, async () => {
      const invite = await message.client.fetchInvite(code).catch(() => null);
      return invite?.guild?.id ?? '';
    });
    if (target !== message.guildId) return true;
  }
  return false;
}

function isExempt(message: Message<true>, config: RuleConfig): boolean {
  const channels = config.exemptChannels ?? [];
  if (channels.length) {
    const parent = message.channel.isThread() ? message.channel.parent : null;
    const ids = [message.channelId, message.channel.parentId, parent?.parentId];
    if (ids.some((id) => id && channels.includes(id))) return true;
  }
  const roles = config.exemptRoles ?? [];
  return roles.length > 0 && Boolean(message.member?.roles.cache.some((role) => roles.includes(role.id)));
}

function actionConfigDuration(config: unknown): number | null {
  if (!config || typeof config !== 'object') return null;
  const duration = (config as { duration?: unknown }).duration;
  if (typeof duration !== 'string') return null;
  try {
    return parseDuration(duration).ms;
  } catch {
    return null;
  }
}

function actionRoleId(config: unknown): string | undefined {
  const roleId = config && typeof config === 'object' ? (config as { roleId?: unknown }).roleId : undefined;
  return typeof roleId === 'string' ? roleId : undefined;
}

const MEMBER_ACTIONS: AutoModAction[] = [
  AutoModAction.TIMEOUT,
  AutoModAction.MUTE,
  AutoModAction.KICK,
  AutoModAction.BAN,
  AutoModAction.ADD_ROLE,
];
const DELETING_ACTIONS: AutoModAction[] = [AutoModAction.DELETE, AutoModAction.WARN, ...MEMBER_ACTIONS.slice(0, 4)];

async function executeAction(target: ActionTarget, violation: Violation, source = 'AutoMod'): Promise<void> {
  const { client, guild, member } = target;
  const action = violation.rule.action as AutoModAction;
  const reason = `${source}: ${violation.reason}`;

  if (member && MEMBER_ACTIONS.includes(action)) {
    const protectedCheck = await permissionService.isProtectedTarget(guild, member.id, guild.id);
    const hierarchyCheck = permissionService.checkBotHierarchy(guild, member);
    const roleId = actionRoleId(violation.rule.actionConfig);
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    const roleCheck =
      action === AutoModAction.ADD_ROLE
        ? role
          ? permissionService.checkBotRoleHierarchy(guild, role)
          : { allowed: false, reason: 'Configured AutoMod role does not exist.' }
        : { allowed: true };
    if (!protectedCheck.allowed || !hierarchyCheck.allowed || !roleCheck.allowed) {
      await logModule.sendLog(client, guild.id, LogCategory.SECURITY, {
        eventType: 'AutoMod Action Blocked',
        user: { id: member.id, tag: member.user.tag },
        action: 'Blocked',
        reason: protectedCheck.reason ?? hierarchyCheck.reason ?? roleCheck.reason,
        guildId: guild.id,
        guildName: guild.name,
        color: Colors.SECURITY_MEDIUM,
      });
      return;
    }
  }

  if (DELETING_ACTIONS.includes(action)) await target.deleteMessage?.().catch(() => undefined);

  if (member && action === AutoModAction.WARN) {
    await auditService.createWarning(guild.id, member.id, client.user!.id, reason);
    const warnCount = await countActiveWarnings(guild.id, member.id);
    await applyEscalation(client, guild, member, warnCount);
  }
  if (member && action === AutoModAction.TIMEOUT) {
    const duration = actionConfigDuration(violation.rule.actionConfig) ?? 60_000;
    await member.timeout(duration, reason).catch(() => undefined);
  }
  if (member && action === AutoModAction.MUTE) {
    const muteRole = guild.roles.cache.find((role) => role.name.toLowerCase() === 'muted');
    if (muteRole) await member.roles.add(muteRole, reason).catch(() => undefined);
  }
  if (member && action === AutoModAction.KICK) await member.kick(reason).catch(() => undefined);
  if (member && action === AutoModAction.BAN) await member.ban({ reason, deleteMessageSeconds: 0 }).catch(() => undefined);
  if (member && action === AutoModAction.ADD_ROLE) {
    const roleId = actionRoleId(violation.rule.actionConfig);
    if (roleId) await member.roles.add(roleId, reason).catch(() => undefined);
  }

  await logModule.sendLog(client, guild.id, LogCategory.SECURITY, {
    eventType: 'AutoMod Violation',
    user: { id: target.user.id, tag: target.user.tag },
    action,
    reason,
    guildId: guild.id,
    guildName: guild.name,
    color: Colors.SECURITY_MEDIUM,
    quickActionsFor: target.user.id,
    metadata: { rule: violation.rule.ruleType, channel: `<#${target.channelId}>` },
    relevantIds: target.messageId ? { 'Message ID': target.messageId } : undefined,
  });
}

function loadRules(guildId: string): Promise<AutoModRule[]> {
  return rulesCache.getOrLoad(guildId, () =>
    prisma.autoModRule.findMany({ where: { guildId, enabled: true }, take: MAX_RULES }),
  );
}

export const automodModule = {
  /** Returns true when the message broke a rule, so other features can leave it alone. */
  async processMessage(message: Message<true>): Promise<boolean> {
    const guildConfig = await guildService.getGuildConfig(message.guildId);
    if (!guildConfig.autoModEnabled) return false;

    const rules = await loadRules(message.guildId);
    if (rules.length === 0) return false;
    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const history = (recentMessages.get(key) ?? []).filter((entry) => now - entry.timestamp < 60_000);
    const normalized = message.content.trim().toLocaleLowerCase();
    const violations: Violation[] = [];

    for (const rule of rules) {
      const config = normalize(rule.config);
      if (isExempt(message, config)) continue;
      let violated = false;
      let reason: string = rule.ruleType;
      switch (rule.ruleType as AutoModRuleType) {
        case AutoModRuleType.SPAM: {
          const windowMs = Math.max(1, config.timeWindowSeconds ?? 3) * 1000;
          violated = history.filter((entry) => now - entry.timestamp <= windowMs).length + 1 > (config.maxMessages ?? 5);
          reason = `spam threshold exceeded (${config.maxMessages ?? 5} messages)`;
          break;
        }
        case AutoModRuleType.DUPLICATE:
          violated = normalized.length > 0 && history.some((entry) => entry.content === normalized);
          reason = 'duplicate message';
          break;
        case AutoModRuleType.MENTION_SPAM:
          violated = message.mentions.users.size + message.mentions.roles.size > (config.maxMentions ?? 5);
          reason = 'excessive mentions';
          break;
        case AutoModRuleType.MASS_PING:
          violated =
            message.mentions.everyone ||
            message.mentions.users.size + message.mentions.roles.size > (config.maxMentions ?? 10);
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
        case AutoModRuleType.INVITES:
          violated = await hasForeignInvite(message, config);
          reason = 'invite to another server';
          break;
        case AutoModRuleType.PHISHING: {
          const found = phishingReason(message.content, config.extraDomains);
          violated = found !== null;
          reason = `suspected phishing (${found})`;
          break;
        }
        case AutoModRuleType.EMOJI_SPAM:
          violated = countEmojis(message.content) > (config.maxEmojis ?? 8);
          reason = `too many emoji (over ${config.maxEmojis ?? 8})`;
          break;
        case AutoModRuleType.ZALGO:
          violated = isZalgo(message.content, config.maxStack ?? 4);
          reason = 'zalgo text';
          break;
      }
      if (violated) violations.push({ rule, reason });
    }

    history.push({ content: normalized, timestamp: now });
    recentMessages.set(key, history.slice(-MAX_TRACKED_PER_USER));
    let deleted = false;
    const target: ActionTarget = {
      client: message.client,
      guild: message.guild,
      member: message.member,
      user: message.author,
      channelId: message.channelId,
      messageId: message.id,
      deleteMessage: async () => {
        if (deleted) return;
        deleted = true;
        await message.delete();
      },
    };
    for (const violation of violations) await executeAction(target, violation);
    return violations.length > 0;
  },

  /**
   * Discord's own AutoMod blocked a message with the rule NAKI mirrors from BANNED_WORDS.
   * The message never reached the bot, so apply the matching rule's action here instead.
   */
  async handleNativeExecution(execution: AutoModerationActionExecution): Promise<void> {
    const config = await modConfigService.get(execution.guild.id);
    if (!config?.nativeAutomodRuleId || execution.ruleId !== config.nativeAutomodRuleId) return;
    // Discord sends one event per action on the rule; only react to the block itself.
    if (execution.action.type !== 1) return;
    const rules = (await loadRules(execution.guild.id)).filter((r) => r.ruleType === AutoModRuleType.BANNED_WORDS);
    const rule = rules.find((r) => matchesBannedWord(execution.content, normalize(r.config))) ?? rules[0];
    if (!rule || rule.action === AutoModAction.DELETE) return;
    const member = execution.member ?? (await execution.guild.members.fetch(execution.userId).catch(() => null));
    const user = member?.user ?? (await execution.guild.client.users.fetch(execution.userId).catch(() => null));
    if (!user) return;
    await executeAction(
      {
        client: execution.guild.client,
        guild: execution.guild,
        member,
        user,
        channelId: execution.channelId ?? '',
        messageId: null,
      },
      { rule, reason: `blocked word${execution.matchedKeyword ? ` (${execution.matchedKeyword})` : ''}` },
      'Discord AutoMod',
    );
  },

  invalidate(guildId: string): void {
    rulesCache.delete(guildId);
  },

  clearCache(): void {
    recentMessages.clear();
  },
};
