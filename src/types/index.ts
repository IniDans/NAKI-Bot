import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  PermissionResolvable,
  AutocompleteInteraction,
  ModalSubmitInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  Collection,
} from 'discord.js';

// ─── Command Interface ──────────────────────────────────────────────────────

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | Omit<SlashCommandBuilder, 'addSubcommandGroup' | 'addSubcommand'>;
  /** Required user permissions to execute this command */
  requiredPermissions?: PermissionResolvable[];
  /** Required bot permissions for this command to work */
  requiredBotPermissions?: PermissionResolvable[];
  /** Rate limit category key from RateLimits */
  rateLimitCategory?: 'DEFAULT' | 'ADMIN' | 'SECURITY' | 'MODERATION';
  /** Whether this command can only be used in a guild */
  guildOnly?: boolean;
  /** Execute the command */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Handle autocomplete interactions */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

// ─── Event Interface ────────────────────────────────────────────────────────

export interface Event {
  name: string;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void> | void;
}

// ─── Extended Client ────────────────────────────────────────────────────────

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, Command>;
  }
}

// ─── Component Interaction Handlers ─────────────────────────────────────────

export interface ModalHandler {
  customId: string | RegExp;
  execute: (interaction: ModalSubmitInteraction) => Promise<void>;
}

export interface ButtonHandler {
  customId: string | RegExp;
  execute: (interaction: ButtonInteraction) => Promise<void>;
}

export interface SelectMenuHandler {
  customId: string | RegExp;
  execute: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

// ─── Permission Check Result ────────────────────────────────────────────────

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

// ─── Moderation Case Data ───────────────────────────────────────────────────

export interface ModerationCaseData {
  guildId: string;
  action: string;
  userId: string;
  moderatorId: string;
  reason: string | null;
  duration?: number | null;
  metadata?: Record<string, unknown>;
}

// ─── Log Embed Data ─────────────────────────────────────────────────────────

export interface LogEmbedData {
  eventType: string;
  user?: { id: string; tag?: string; displayName?: string };
  target?: { id: string; tag?: string; displayName?: string; name?: string };
  action: string;
  reason?: string | null;
  guildId: string;
  guildName?: string;
  relevantIds?: Record<string, string>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  color?: number;
}

// ─── Security Event Data ────────────────────────────────────────────────────

export interface SecurityEventData {
  guildId: string;
  executorId: string;
  actionType: string;
  actionCount: number;
  threshold: number;
  threatLevel: string;
  details?: Record<string, unknown>;
}

// ─── Scheduler Task Data ────────────────────────────────────────────────────

export interface ScheduledTaskData {
  type: string;
  guildId: string;
  userId?: string;
  roleId?: string;
  channelId?: string;
  executeAt: Date;
  metadata?: Record<string, unknown>;
}

// ─── Welcome/Leave Placeholder Context ──────────────────────────────────────

export interface PlaceholderContext {
  userId: string;
  username: string;
  displayName: string;
  mention: string;
  serverName: string;
  memberCount: number;
}
