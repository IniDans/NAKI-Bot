import type { VerificationConfig } from '@prisma/client';
import { db } from './index.js';
import { TtlCache } from '../../utils/ttlCache.js';

const prisma = db.client;
const cache = new TtlCache<VerificationConfig | null>(30_000);

/** Verification, alt filter and autorole settings edited from the dashboard. */
export const verificationService = {
  get(guildId: string): Promise<VerificationConfig | null> {
    return cache.getOrLoad(guildId, () => prisma.verificationConfig.findUnique({ where: { guildId } }));
  },

  invalidate(guildId: string): void {
    cache.delete(guildId);
  },
};

/** Reads a Json column holding an array of role IDs, dropping anything that is not a snowflake. */
export function roleIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && /^\d{17,20}$/.test(id));
}
