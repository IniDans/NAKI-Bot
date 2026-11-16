import type { ModConfig } from '@prisma/client';
import { db } from './index.js';
import { TtlCache } from '../../utils/ttlCache.js';

const prisma = db.client;
const cache = new TtlCache<ModConfig | null>(30_000);

/** Moderation settings edited from the dashboard. Missing row means every feature is off. */
export const modConfigService = {
  get(guildId: string): Promise<ModConfig | null> {
    return cache.getOrLoad(guildId, () => prisma.modConfig.findUnique({ where: { guildId } }));
  },

  async update(guildId: string, data: Partial<Omit<ModConfig, 'id' | 'guildId' | 'createdAt' | 'updatedAt'>>) {
    const row = await prisma.modConfig.upsert({
      where: { guildId },
      create: { guildId, ...(data as object) },
      update: data as object,
    });
    cache.set(guildId, row);
    return row;
  },

  invalidate(guildId: string): void {
    cache.delete(guildId);
  },
};
