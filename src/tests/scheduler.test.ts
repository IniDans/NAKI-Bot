import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from 'discord.js';

const prismaMock = vi.hoisted(() => ({
  scheduledTask: { create: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  temporaryRole: { updateMany: vi.fn() },
}));
vi.mock('../services/database/index.js', () => ({ db: { client: prismaMock } }));
vi.mock('../utils/logger.js', () => ({
  appLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), security: vi.fn() },
}));

import { scheduler } from '../services/scheduler/index.js';
import { MAX_TASK_ATTEMPTS, retryDelayMs, timerDelay, MAX_TIMER_DELAY_MS } from '../services/scheduler/timing.js';

const DAY = 86_400_000;
const update = prismaMock.scheduledTask.update;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.clearAllMocks();
  prismaMock.scheduledTask.create.mockResolvedValue({ id: 't1' });
  update.mockResolvedValue({});
  prismaMock.temporaryRole.updateMany.mockResolvedValue({ count: 1 });
  scheduler.setClient(null as unknown as Client);
});

afterEach(() => {
  scheduler.cancelAll();
  vi.useRealTimers();
});

describe('scheduler timing', () => {
  it('caps timer delays at the setTimeout limit', () => {
    expect(timerDelay(new Date(Date.now() + 30 * DAY))).toBe(MAX_TIMER_DELAY_MS);
    expect(timerDelay(new Date(Date.now() - 1000))).toBe(0);
  });

  it('backs off exponentially up to 30 minutes', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
  });
});

describe('scheduler', () => {
  it('does not run a 30-day task early', async () => {
    await scheduler.scheduleTask('g1', 'TEMP_ROLE_EXPIRE', { userId: 'u', roleId: 'r' }, new Date(Date.now() + 30 * DAY));
    await vi.advanceTimersByTimeAsync(30 * DAY - 1000);
    expect(update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('retries failed tasks with backoff, then gives up', async () => {
    // No Discord client is set, so every attempt fails.
    await scheduler.scheduleTask('g1', 'TEMP_ROLE_EXPIRE', { userId: 'u', roleId: 'r' }, new Date(Date.now() + 1000));
    await vi.advanceTimersByTimeAsync(1000);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 't1' },
      data: { attempts: 1, lastError: 'Discord client is not ready', executeAt: new Date(Date.now() + 60_000) },
    });

    for (let attempt = 1; attempt < MAX_TASK_ATTEMPTS; attempt++) await vi.advanceTimersByTimeAsync(retryDelayMs(attempt));
    expect(update).toHaveBeenCalledTimes(MAX_TASK_ATTEMPTS);
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 't1' },
      data: { completed: true, attempts: MAX_TASK_ATTEMPTS, lastError: 'Discord client is not ready' },
    });

    await vi.advanceTimersByTimeAsync(DAY);
    expect(update).toHaveBeenCalledTimes(MAX_TASK_ATTEMPTS);
  });

  it('removes an expired temporary role and only then marks the task completed', async () => {
    const role = { id: 'r' };
    const remove = vi.fn().mockResolvedValue(undefined);
    const member = { roles: { cache: new Map([['r', role]]), remove } };
    const guild = { roles: { cache: new Map([['r', role]]) }, members: { fetch: vi.fn().mockResolvedValue(member) } };
    scheduler.setClient({ guilds: { fetch: vi.fn().mockResolvedValue(guild) } } as unknown as Client);

    await scheduler.scheduleTask('g1', 'TEMP_ROLE_EXPIRE', { userId: 'u', roleId: 'r' }, new Date(Date.now() + 1000));
    await vi.advanceTimersByTimeAsync(1000);

    expect(remove).toHaveBeenCalledWith(role, 'Temporary role expired');
    expect(prismaMock.temporaryRole.updateMany).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { completed: true, lastError: null } });
  });
});
