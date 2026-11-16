import type { VerificationConfig } from '@prisma/client';

export type AltVerdict = { flagged: false } | { flagged: true; reasons: string[] };

/** Pure check so it can be tested without a Discord member. */
export function checkAlt(
  config: Pick<VerificationConfig, 'altFilterEnabled' | 'minAccountAgeDays' | 'requireAvatar'>,
  account: { createdTimestamp: number; hasAvatar: boolean },
  now = Date.now(),
): AltVerdict {
  if (!config.altFilterEnabled) return { flagged: false };
  const reasons: string[] = [];
  const ageDays = (now - account.createdTimestamp) / 86_400_000;
  if (config.minAccountAgeDays > 0 && ageDays < config.minAccountAgeDays)
    reasons.push(`account is ${Math.floor(ageDays)} days old (minimum ${config.minAccountAgeDays})`);
  if (config.requireAvatar && !account.hasAvatar) reasons.push('account has no avatar');
  return reasons.length ? { flagged: true, reasons } : { flagged: false };
}
