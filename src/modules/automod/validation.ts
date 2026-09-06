import { z } from 'zod';

const ruleTypes = ['SPAM', 'DUPLICATE', 'MENTION_SPAM', 'MASS_PING', 'EXCESSIVE_CAPS', 'BANNED_WORDS', 'LINK_FILTER'] as const;
const actions = ['DELETE', 'WARN', 'TIMEOUT', 'MUTE', 'KICK', 'BAN', 'ADD_ROLE', 'LOG'] as const;
const boundedConfig = z.record(z.unknown()).default({});

export const autoModRuleSchema = z.object({
  ruleType: z.enum(ruleTypes),
  action: z.enum(actions),
  config: boundedConfig,
  actionConfig: z.record(z.unknown()).optional(),
}).superRefine((value, ctx) => {
  const config = value.config;
  for (const key of ['maxMessages', 'timeWindowSeconds', 'maxMentions', 'minimumMessageLength'] as const) {
    if (key in config && (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] <= 0 || config[key] > 100_000)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', key], message: `${key} must be a positive finite number below 100000.` });
    }
  }
  if ('capsPercentage' in config && (typeof config.capsPercentage !== 'number' || config.capsPercentage < 0 || config.capsPercentage > 1)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'capsPercentage'], message: 'capsPercentage must be between 0 and 1.' });
  }
  if (value.ruleType === 'BANNED_WORDS' && config.match === 'regex') {
    if (typeof config.pattern !== 'string' || config.pattern.length === 0 || config.pattern.length > 256) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'pattern'], message: 'Regex pattern must be 1-256 characters.' });
    } else {
      try { new RegExp(config.pattern, 'iu'); } catch { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'pattern'], message: 'Regex pattern is invalid.' }); }
    }
  }
  if (value.ruleType === 'BANNED_WORDS' && config.words !== undefined && (!Array.isArray(config.words) || config.words.length > 100 || config.words.some((word) => typeof word !== 'string' || word.length > 100))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', 'words'], message: 'words must contain at most 100 strings of 100 characters or fewer.' });
  }
  if (value.ruleType === 'LINK_FILTER') {
    for (const key of ['blockedDomains', 'allowedDomains'] as const) {
      const list = config[key];
      if (list !== undefined && (!Array.isArray(list) || list.length > 100 || list.some((domain) => typeof domain !== 'string' || domain.length > 253))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['config', key], message: `${key} contains invalid domains.` });
      }
    }
  }
});

export function validateAutoModRule(value: unknown) {
  return autoModRuleSchema.parse(value);
}
