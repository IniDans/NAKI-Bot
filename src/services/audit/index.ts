import { db } from '../database/index.js';
import { appLogger } from '../../utils/logger.js';
import type { ModerationCaseData } from '../../types/index.js';
import { guildService } from '../database/guild.service.js';

const prisma = db.client;

/**
 * Audit service — manages moderation cases.
 */
export const auditService = {
  /**
   * Create a new moderation case with auto-incrementing case number.
   */
  async createCase(data: ModerationCaseData) {
    const caseNumber = await guildService.getNextCaseNumber(data.guildId);

    const moderationCase = await prisma.moderationCase.create({
      data: {
        guildId: data.guildId,
        caseNumber,
        action: data.action,
        userId: data.userId,
        moderatorId: data.moderatorId,
        reason: data.reason,
        duration: data.duration,
        metadata: data.metadata as object ?? undefined,
      },
    });

    appLogger.info(
      `Case #${caseNumber} created: ${data.action} on ${data.userId} by ${data.moderatorId}`,
      'Audit',
      { guildId: data.guildId },
    );

    return moderationCase;
  },

  /** Get a specific case by guild and case number */
  async getCase(guildId: string, caseNumber: number) {
    return prisma.moderationCase.findUnique({
      where: { guildId_caseNumber: { guildId, caseNumber } },
    });
  },

  /** Get all cases for a guild (paginated) */
  async getCases(guildId: string, page = 1, perPage = 10) {
    const skip = (page - 1) * perPage;

    const [cases, total] = await Promise.all([
      prisma.moderationCase.findMany({
        where: { guildId },
        orderBy: { caseNumber: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.moderationCase.count({ where: { guildId } }),
    ]);

    return { cases, total, page, perPage, totalPages: Math.ceil(total / perPage) };
  },

  /** Get all cases for a specific user in a guild */
  async getUserCases(guildId: string, userId: string) {
    return prisma.moderationCase.findMany({
      where: { guildId, userId },
      orderBy: { caseNumber: 'desc' },
    });
  },

  /** Create a warning */
  async createWarning(guildId: string, userId: string, moderatorId: string, reason: string) {
    const warning = await prisma.warning.create({
      data: {
        guildId,
        userId,
        moderatorId,
        reason,
      },
    });

    appLogger.info(`Warning created for ${userId} by ${moderatorId}`, 'Audit', { guildId });

    return warning;
  },

  /** Get warnings for a user */
  async getWarnings(guildId: string, userId: string) {
    return prisma.warning.findMany({
      where: { guildId, userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Delete a warning by ID */
  async deleteWarning(id: string) {
    return prisma.warning.delete({ where: { id } });
  },

  /** Get warning count for a user */
  async getWarningCount(guildId: string, userId: string): Promise<number> {
    return prisma.warning.count({ where: { guildId, userId } });
  },
};
