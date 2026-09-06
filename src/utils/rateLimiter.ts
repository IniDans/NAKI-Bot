import { appLogger } from './logger.js';
import { RateLimits } from '../config/constants.js';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/** In-memory per-user, per-command rate limiter. */
class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();

  /**
   * Check if a user is rate limited for a given command.
   * @returns Remaining cooldown in ms if rate-limited, or 0 if allowed.
   */
  check(
    userId: string,
    commandName: string,
    category: keyof typeof RateLimits = 'DEFAULT',
  ): number {
    const key = `${userId}:${commandName}`;
    const config = RateLimits[category];
    const now = Date.now();

    const entry = this.limits.get(key);

    if (!entry || now >= entry.resetAt) {
      // Reset or initialize
      this.limits.set(key, { count: 1, resetAt: now + config.windowMs });
      return 0;
    }

    if (entry.count >= config.maxRequests) {
      const remaining = entry.resetAt - now;
      appLogger.debug(
        `Rate limited: ${userId} on /${commandName} (${remaining}ms remaining)`,
        'RateLimiter',
      );
      return remaining;
    }

    entry.count++;
    return 0;
  }

  /** Periodically clean up expired entries to prevent memory leaks */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.limits) {
      if (now >= entry.resetAt) {
        this.limits.delete(key);
      }
    }
  }
}

export const rateLimiter = new RateLimiter();

// Clean up every 5 minutes
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000).unref();
