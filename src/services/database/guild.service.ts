import { db } from './index.js';
import { DefaultSecurityConfig } from '../../config/constants.js';

const prisma = db.client;

/**
 * Guild data service â€” manages guild records and configurations.
 * All config is persisted; nothing config-related lives only in memory.
 */
export const guildService = {
  /**
   * Get or create a Guild record. Ensures the guild always has
   * a GuildConfig and SecurityConfig ready.
   */
  async getOrCreateGuild(guildId: string) {
    await prisma.guild.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });

    await Promise.all([
      prisma.guildConfig.upsert({ where: { guildId }, update: {}, create: { guildId } }),
      prisma.logConfig.upsert({ where: { guildId }, update: {}, create: { guildId } }),
      prisma.securityConfig.upsert({ where: { guildId }, update: {}, create: { guildId, ...DefaultSecurityConfig } }),
    ]);

    return prisma.guild.findUniqueOrThrow({
      where: { guildId },
      include: { config: true, logConfig: true, securityConfig: true, welcomeConfig: true, leaveConfig: true },
    });
  },

  /** Get a guild's configuration */
  async getGuildConfig(guildId: string) {
    const guild = await this.getOrCreateGuild(guildId);
    return guild.config!;
  },

  /** Update a guild's configuration */
  async updateGuildConfig(guildId: string, data: Record<string, unknown>) {
    // Ensure the guild exists
    await this.getOrCreateGuild(guildId);

    return prisma.guildConfig.update({
      where: { guildId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  },

  /** Get log configuration */
  async getLogConfig(guildId: string) {
    const guild = await this.getOrCreateGuild(guildId);
    return guild.logConfig!;
  },

  /** Update log configuration */
  async updateLogConfig(guildId: string, data: Record<string, unknown>) {
    await this.getOrCreateGuild(guildId);

    return prisma.logConfig.update({
      where: { guildId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  },

  /** Get security configuration */
  async getSecurityConfig(guildId: string) {
    const guild = await this.getOrCreateGuild(guildId);
    return guild.securityConfig!;
  },

  /** Update security configuration */
  async updateSecurityConfig(guildId: string, data: Record<string, unknown>) {
    await this.getOrCreateGuild(guildId);

    return prisma.securityConfig.update({
      where: { guildId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  },

  /** Get or create welcome configuration */
  async getWelcomeConfig(guildId: string) {
    await this.getOrCreateGuild(guildId);

    let config = await prisma.welcomeConfig.findUnique({ where: { guildId } });
    if (!config) {
      config = await prisma.welcomeConfig.create({
        data: { guildId },
      });
    }
    return config;
  },

  /** Update welcome configuration */
  async updateWelcomeConfig(guildId: string, data: Record<string, unknown>) {
    await this.getWelcomeConfig(guildId); // Ensure exists

    return prisma.welcomeConfig.update({
      where: { guildId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  },

  /** Get or create leave configuration */
  async getLeaveConfig(guildId: string) {
    await this.getOrCreateGuild(guildId);

    let config = await prisma.leaveConfig.findUnique({ where: { guildId } });
    if (!config) {
      config = await prisma.leaveConfig.create({
        data: { guildId },
      });
    }
    return config;
  },

  /** Update leave configuration */
  async updateLeaveConfig(guildId: string, data: Record<string, unknown>) {
    await this.getLeaveConfig(guildId); // Ensure exists

    return prisma.leaveConfig.update({
      where: { guildId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  },

  /** Get the next moderation case number for a guild */
  async getNextCaseNumber(guildId: string): Promise<number> {
    const lastCase = await prisma.moderationCase.findFirst({
      where: { guildId },
      orderBy: { caseNumber: 'desc' },
      select: { caseNumber: true },
    });

    return (lastCase?.caseNumber ?? 0) + 1;
  },
};



