import { type GuildMember, type Message, PermissionFlagsBits } from 'discord.js';
import { db } from '../../services/database/index.js';
import { appLogger } from '../../utils/logger.js';
import {
  DEFAULT_LEVEL_UP_MESSAGE,
  type LevelReward,
  fillLevelTemplate,
  parseRewards,
  progressFromXp,
  rewardRolesFor,
  rollXp,
} from './logic.js';

const prisma = db.client;

/** Dashboard edits reach the bot within this long. */
const CACHE_TTL_MS = 60_000;

interface LevelSettings {
  at: number;
  enabled: boolean;
  announceChannelId: string | null;
  message: string;
  xpMin: number;
  xpMax: number;
  cooldownMs: number;
  rewards: LevelReward[];
  ignored: Set<string>;
}

const cache = new Map<string, LevelSettings>();
/** guildId:userId -> time of the last XP grant, so most messages skip the database entirely. */
const lastGrant = new Map<string, number>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function idSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
}

async function settingsFor(guildId: string): Promise<LevelSettings> {
  const cached = cache.get(guildId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  const row = await prisma.levelConfig.findUnique({ where: { guildId } });
  const settings: LevelSettings = {
    at: Date.now(),
    enabled: row?.enabled ?? false,
    announceChannelId: row?.announceChannelId ?? null,
    message: row?.levelUpMessage || DEFAULT_LEVEL_UP_MESSAGE,
    xpMin: row?.xpMin ?? 15,
    xpMax: row?.xpMax ?? 25,
    cooldownMs: (row?.cooldownSeconds ?? 60) * 1000,
    rewards: parseRewards(row?.rewards),
    ignored: idSet(row?.ignoredChannels),
  };
  cache.set(guildId, settings);
  return settings;
}

/** Give every reward role the member has earned and is missing. Roles above the bot are skipped. */
async function syncRewards(member: GuildMember, level: number, rewards: LevelReward[]): Promise<void> {
  const me = member.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;
  const missing = rewardRolesFor(level, rewards).filter((id) => {
    const role = member.guild.roles.cache.get(id);
    return role && !member.roles.cache.has(id) && role.position < me.roles.highest.position && !role.managed;
  });
  if (missing.length === 0) return;
  await member.roles.add(missing, `Level ${level} reward`).catch((error) => {
    appLogger.warn('Level reward roles failed', 'Leveling', { guildId: member.guild.id, error: errorMessage(error) });
  });
}

async function announce(message: Message<true>, settings: LevelSettings, level: number): Promise<void> {
  const target = settings.announceChannelId
    ? message.guild.channels.cache.get(settings.announceChannelId)
    : message.channel;
  if (!target?.isTextBased() || target.isDMBased()) return;
  const content = fillLevelTemplate(settings.message, {
    user: `<@${message.author.id}>`,
    username: message.member?.displayName ?? message.author.username,
    level,
    server: message.guild.name,
  });
  await target.send({ content, allowedMentions: { users: [message.author.id] } }).catch((error) => {
    appLogger.warn('Level-up announcement failed', 'Leveling', {
      guildId: message.guildId,
      error: errorMessage(error),
    });
  });
}

export const levelingModule = {
  async handleMessage(message: Message<true>): Promise<void> {
    if (message.author.bot || message.webhookId) return;
    const settings = await settingsFor(message.guildId);
    if (!settings.enabled) return;
    const channel = message.channel;
    if (
      settings.ignored.has(channel.id) ||
      (channel.isThread() && channel.parentId && settings.ignored.has(channel.parentId))
    )
      return;

    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    if (now - (lastGrant.get(key) ?? 0) < settings.cooldownMs) return;
    lastGrant.set(key, now);

    const where = { guildId_userId: { guildId: message.guildId, userId: message.author.id } };
    const existing = await prisma.memberLevel.findUnique({ where });
    // The in-memory map is lost on restart; the stored timestamp keeps the cooldown honest.
    if (existing?.lastXpAt && now - existing.lastXpAt.getTime() < settings.cooldownMs) return;

    const gained = rollXp(settings.xpMin, settings.xpMax);
    const row = await prisma.memberLevel.upsert({
      where,
      create: { guildId: message.guildId, userId: message.author.id, xp: gained, lastXpAt: new Date(now) },
      update: { xp: { increment: gained }, lastXpAt: new Date(now) },
    });
    const { level } = progressFromXp(row.xp);
    if (level <= row.level) return;

    // Only one process may announce a given level, even if two messages race.
    const claimed = await prisma.memberLevel.updateMany({
      where: { id: row.id, level: { lt: level } },
      data: { level },
    });
    if (claimed.count === 0) return;

    if (message.member) await syncRewards(message.member, level, settings.rewards);
    await announce(message, settings, level);
  },

  /** Rewards are re-applied when someone rejoins so they do not lose roles they earned. */
  async handleMemberJoin(member: GuildMember): Promise<void> {
    const settings = await settingsFor(member.guild.id);
    if (!settings.enabled || settings.rewards.length === 0) return;
    const row = await prisma.memberLevel.findUnique({
      where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
    });
    if (row && row.level > 0) await syncRewards(member, row.level, settings.rewards);
  },

  async rankOf(guildId: string, userId: string) {
    const row = await prisma.memberLevel.findUnique({ where: { guildId_userId: { guildId, userId } } });
    if (!row) return null;
    const position = (await prisma.memberLevel.count({ where: { guildId, xp: { gt: row.xp } } })) + 1;
    return { xp: row.xp, position, ...progressFromXp(row.xp) };
  },

  async leaderboard(guildId: string, take = 10) {
    const rows = await prisma.memberLevel.findMany({
      where: { guildId, xp: { gt: 0 } },
      orderBy: { xp: 'desc' },
      take,
    });
    return rows.map((r) => ({ userId: r.userId, xp: r.xp, level: progressFromXp(r.xp).level }));
  },

  isEnabled: async (guildId: string) => (await settingsFor(guildId)).enabled,
};
