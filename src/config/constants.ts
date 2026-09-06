import { PermissionFlagsBits } from 'discord.js';

// ─── Embed Colors ───────────────────────────────────────────────────────────
export const Colors = {
  // Status
  SUCCESS: 0x43b581,
  ERROR: 0xf04747,
  WARNING: 0xfaa61a,
  INFO: 0x5865f2,

  // Moderation
  BAN: 0xe74c3c,
  KICK: 0xe67e22,
  MUTE: 0x95a5a6,
  WARN: 0xf1c40f,
  TIMEOUT: 0xe91e63,
  UNBAN: 0x2ecc71,
  UNMUTE: 0x2ecc71,

  // Logging
  LOG_CREATE: 0x2ecc71,
  LOG_DELETE: 0xe74c3c,
  LOG_UPDATE: 0x3498db,

  // Security
  SECURITY_LOW: 0xf1c40f,
  SECURITY_MEDIUM: 0xe67e22,
  SECURITY_HIGH: 0xe74c3c,
  SECURITY_CRITICAL: 0x992d22,

  // General
  DEFAULT: 0x5865f2,
  WELCOME: 0x43b581,
  LEAVE: 0x747f8d,
} as const;

// ─── Threat Levels ──────────────────────────────────────────────────────────
export enum ThreatLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// ─── Moderation Action Types ────────────────────────────────────────────────
export enum ModerationAction {
  BAN = 'BAN',
  UNBAN = 'UNBAN',
  KICK = 'KICK',
  WARN = 'WARN',
  TIMEOUT = 'TIMEOUT',
  UNTIMEOUT = 'UNTIMEOUT',
  MUTE = 'MUTE',
  UNMUTE = 'UNMUTE',
  CLEAR = 'CLEAR',
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
  SLOWMODE = 'SLOWMODE',
  TEMPROLE = 'TEMPROLE',
  REMOVEROLE = 'REMOVEROLE',
  ANNOUNCE = 'ANNOUNCE',
}

// ─── AutoMod Rule Types ─────────────────────────────────────────────────────
export enum AutoModRuleType {
  SPAM = 'SPAM',
  DUPLICATE = 'DUPLICATE',
  MENTION_SPAM = 'MENTION_SPAM',
  MASS_PING = 'MASS_PING',
  EXCESSIVE_CAPS = 'EXCESSIVE_CAPS',
  BANNED_WORDS = 'BANNED_WORDS',
  LINK_FILTER = 'LINK_FILTER',
}

// ─── AutoMod Actions ────────────────────────────────────────────────────────
export enum AutoModAction {
  DELETE = 'DELETE',
  WARN = 'WARN',
  TIMEOUT = 'TIMEOUT',
  MUTE = 'MUTE',
  KICK = 'KICK',
  BAN = 'BAN',
  ADD_ROLE = 'ADD_ROLE',
  LOG = 'LOG',
}

// ─── Scheduled Task Types ───────────────────────────────────────────────────
export enum ScheduledTaskType {
  TEMP_ROLE_EXPIRE = 'TEMP_ROLE_EXPIRE',
  UNMUTE = 'UNMUTE',
  UNLOCK = 'UNLOCK',
  SECURITY_COOLDOWN = 'SECURITY_COOLDOWN',
  RAID_LOCKDOWN_EXPIRE = 'RAID_LOCKDOWN_EXPIRE',
  TEMP_BAN_EXPIRE = 'TEMP_BAN_EXPIRE',
}

// ─── Log Categories ─────────────────────────────────────────────────────────
export enum LogCategory {
  MEMBER = 'member',
  MESSAGE = 'message',
  MODERATION = 'moderation',
  CHANNEL = 'channel',
  ROLE = 'role',
  SERVER = 'server',
  SECURITY = 'security',
}

// ─── Security Incident Types ────────────────────────────────────────────────
export enum SecurityIncidentType {
  MASS_CHANNEL_DELETE = 'MASS_CHANNEL_DELETE',
  MASS_CHANNEL_CREATE = 'MASS_CHANNEL_CREATE',
  MASS_ROLE_DELETE = 'MASS_ROLE_DELETE',
  MASS_ROLE_CREATE = 'MASS_ROLE_CREATE',
  MASS_BAN = 'MASS_BAN',
  MASS_KICK = 'MASS_KICK',
  MASS_TIMEOUT = 'MASS_TIMEOUT',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  WEBHOOK_ABUSE = 'WEBHOOK_ABUSE',
  RAID_DETECTED = 'RAID_DETECTED',
}

// ─── Rate Limits (internal command rate limiting) ────────────────────────────
export const RateLimits = {
  DEFAULT: { maxRequests: 5, windowMs: 10_000 },
  ADMIN: { maxRequests: 3, windowMs: 10_000 },
  SECURITY: { maxRequests: 2, windowMs: 10_000 },
  MODERATION: { maxRequests: 5, windowMs: 10_000 },
} as const;

// ─── Discord Limits ─────────────────────────────────────────────────────────
export const DiscordLimits = {
  EMBED_TITLE: 256,
  EMBED_DESCRIPTION: 4096,
  EMBED_FIELDS: 25,
  EMBED_FIELD_NAME: 256,
  EMBED_FIELD_VALUE: 1024,
  EMBED_FOOTER: 2048,
  EMBED_AUTHOR: 256,
  EMBED_TOTAL: 6000,
  BULK_DELETE_MAX: 100,
  BULK_DELETE_AGE_MS: 14 * 24 * 60 * 60 * 1000, // 14 days
  TIMEOUT_MAX_MS: 28 * 24 * 60 * 60 * 1000, // 28 days
  SLOWMODE_MAX: 21600, // 6 hours in seconds
} as const;

// ─── Default Security Thresholds ────────────────────────────────────────────
export const DefaultSecurityConfig = {
  // Anti-Nuke thresholds
  channelDeleteThreshold: 3,
  channelCreateThreshold: 5,
  roleDeleteThreshold: 3,
  roleCreateThreshold: 5,
  banThreshold: 5,
  kickThreshold: 5,
  timeoutThreshold: 10,
  actionWindowSeconds: 10,

  // Anti-Raid thresholds
  raidJoinThreshold: 10,
  raidTimeWindowSeconds: 10,
  minimumAccountAgeDays: 7,
  lockdownDurationMinutes: 15,
} as const;

// ─── Required Bot Permissions ───────────────────────────────────────────────
export const RequiredBotPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ReadMessageHistory,
] as const;

// ─── Placeholder Tokens for Welcome/Leave ───────────────────────────────────
export const Placeholders = {
  USER: '{user}',
  USERNAME: '{username}',
  DISPLAYNAME: '{displayname}',
  MENTION: '{mention}',
  SERVER: '{server}',
  MEMBERCOUNT: '{membercount}',
  USERID: '{userid}',
} as const;
