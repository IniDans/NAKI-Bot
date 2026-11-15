/** Largest delay Node's setTimeout accepts; longer delays fire immediately. */
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Failed tasks are retried this many times in total before being abandoned. */
export const MAX_TASK_ATTEMPTS = 5;

const BASE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 30 * 60_000;

/** Delay for the next timer, capped so long schedules are re-armed instead of overflowing. */
export function timerDelay(executeAt: Date, now = Date.now()): number {
  return Math.min(Math.max(0, executeAt.getTime() - now), MAX_TIMER_DELAY_MS);
}

/** Backoff after the given number of failed attempts: 1m, 2m, 4m, 8m... capped at 30m. */
export function retryDelayMs(failedAttempts: number): number {
  return Math.min(BASE_RETRY_MS * 2 ** Math.max(0, failedAttempts - 1), MAX_RETRY_MS);
}
