import { describe, expect, it } from 'vitest';
import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import { everyoneSendState, parseSnapshot, restoreStep, withGuildLock } from '../modules/antiraid/lockdown.js';

const SEND = PermissionFlagsBits.SendMessages;
const VIEW = PermissionFlagsBits.ViewChannel;
const overwrite = (allow: bigint, deny: bigint) => ({ allow: new PermissionsBitField(allow), deny: new PermissionsBitField(deny) });

describe('lockdown snapshot', () => {
  it('classifies the @everyone SendMessages state', () => {
    expect(everyoneSendState(undefined)).toBe('absent');
    expect(everyoneSendState(overwrite(0n, SEND))).toBe('deny');
    expect(everyoneSendState(overwrite(SEND, 0n))).toBe('allow');
    expect(everyoneSendState(overwrite(0n, VIEW))).toBe('neutral');
  });

  it('restores each channel to exactly what it was', () => {
    expect(restoreStep('allow', overwrite(0n, SEND))).toEqual({ kind: 'edit', sendMessages: true });
    // Overwrite created by lockdown alone is removed entirely.
    expect(restoreStep('absent', overwrite(0n, SEND))).toEqual({ kind: 'delete' });
    // Someone added other bits during lockdown: keep them, just clear SendMessages.
    expect(restoreStep('absent', overwrite(0n, SEND | VIEW))).toEqual({ kind: 'edit', sendMessages: null });
    expect(restoreStep('neutral', overwrite(0n, SEND | VIEW))).toEqual({ kind: 'edit', sendMessages: null });
    expect(restoreStep('neutral', undefined)).toEqual({ kind: 'skip' });
  });

  it('parses only well-formed snapshots', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot([])).toBeNull();
    expect(parseSnapshot({ a: 'allow', b: 'neutral', c: 'absent', d: 'deny', e: 1 })).toEqual({ a: 'allow', b: 'neutral', c: 'absent' });
  });
});

describe('withGuildLock', () => {
  it('runs work for the same guild one at a time, even after a failure', async () => {
    const order: string[] = [];
    const slow = (name: string, fail = false) => async () => {
      order.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`${name}:end`);
      if (fail) throw new Error(name);
      return name;
    };
    const first = withGuildLock('g', slow('a', true));
    const second = withGuildLock('g', slow('b'));
    await expect(first).rejects.toThrow('a');
    await expect(second).resolves.toBe('b');
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });
});
