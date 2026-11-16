import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  type Guild,
} from 'discord.js';
import { db } from '../../services/database/index.js';
import { modConfigService } from '../../services/database/modconfig.service.js';
import { buildNativeRule } from './native-rule.js';

const prisma = db.client;

export const NATIVE_RULE_NAME = 'NAKI banned words';

export async function bannedWordRules(guildId: string) {
  return prisma.autoModRule.findMany({ where: { guildId, ruleType: 'BANNED_WORDS', enabled: true } });
}

/**
 * Creates, updates or removes the guild's native rule to match the database.
 * The dashboard does the same through REST; this path covers /automod changes.
 */
export async function syncNativeAutomod(guild: Guild): Promise<void> {
  const [config, guildConfig, rules] = await Promise.all([
    prisma.modConfig.findUnique({ where: { guildId: guild.id } }),
    prisma.guildConfig.findUnique({ where: { guildId: guild.id } }),
    bannedWordRules(guild.id),
  ]);
  if (!config) return;
  const wanted = buildNativeRule(rules);
  const active =
    config.nativeAutomodSync &&
    Boolean(guildConfig?.autoModEnabled) &&
    (wanted.keywordFilter.length > 0 || wanted.regexPatterns.length > 0);

  const existing = config.nativeAutomodRuleId
    ? await guild.autoModerationRules.fetch(config.nativeAutomodRuleId).catch(() => null)
    : null;

  if (!active) {
    if (existing) await existing.delete('NAKI native sync turned off').catch(() => undefined);
    if (config.nativeAutomodRuleId) await modConfigService.update(guild.id, { nativeAutomodRuleId: null });
    return;
  }

  const data = {
    name: NATIVE_RULE_NAME,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: AutoModerationRuleTriggerType.Keyword,
    triggerMetadata: { keywordFilter: wanted.keywordFilter, regexPatterns: wanted.regexPatterns },
    actions: [
      {
        type: AutoModerationActionType.BlockMessage,
        metadata: { customMessage: 'This message contains a word that is blocked on this server.' },
      },
    ],
    enabled: true,
    exemptRoles: wanted.exemptRoles,
    exemptChannels: wanted.exemptChannels,
  };
  if (existing) {
    await existing.edit(data);
  } else {
    const created = await guild.autoModerationRules.create({ ...data, reason: 'NAKI native sync' });
    await modConfigService.update(guild.id, { nativeAutomodRuleId: created.id });
  }
}
