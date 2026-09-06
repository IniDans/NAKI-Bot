import { env } from '../config/env.js';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const MIN_LEVEL: LogLevel = env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level}]`,
  ];

  if (entry.context) {
    parts.push(`[${entry.context}]`);
  }

  parts.push(entry.message);

  if (entry.data && Object.keys(entry.data).length > 0) {
    parts.push(JSON.stringify(entry.data));
  }

  return parts.join(' ');
}

function log(level: LogLevel, message: string, context?: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    context,
    data,
    timestamp: new Date().toISOString(),
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'DEBUG':
      console.debug(formatted);
      break;
    case 'INFO':
      console.info(formatted);
      break;
    case 'WARN':
      console.warn(formatted);
      break;
    case 'ERROR':
    case 'FATAL':
      console.error(formatted);
      break;
  }
}

/**
 * Structured application logger.
 * This is for internal application logging — NOT Discord channel logging.
 */
export const appLogger = {
  debug: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('DEBUG', message, context, data),

  info: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('INFO', message, context, data),

  warn: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('WARN', message, context, data),

  error: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('ERROR', message, context, data),

  fatal: (message: string, context?: string, data?: Record<string, unknown>) =>
    log('FATAL', message, context, data),

  /** Log a command execution */
  command: (commandName: string, userId: string, guildId: string | null, data?: Record<string, unknown>) =>
    log('INFO', `Command executed: /${commandName}`, 'Command', {
      userId,
      guildId,
      ...data,
    }),

  /** Log a security event */
  security: (message: string, guildId: string, data?: Record<string, unknown>) =>
    log('WARN', message, 'Security', { guildId, ...data }),

  /** Log a database operation */
  database: (message: string, data?: Record<string, unknown>) =>
    log('DEBUG', message, 'Database', data),
};
