import { describe, expect, it } from 'vitest';
import { checkClaim, cleanRoomName, parseUserLimit, renderRoomName, roomState } from '../modules/tempvoice/logic.js';

const member = { displayName: 'Ardan', username: 'dansyoung' };

describe('renderRoomName', () => {
  it('fills placeholders', () => {
    expect(renderRoomName("{user}'s room", member)).toBe("Ardan's room");
    expect(renderRoomName('Room of {username}', member)).toBe('Room of dansyoung');
  });
  it('falls back when the template is empty or blank after filling', () => {
    expect(renderRoomName('', member)).toBe("Ardan's room");
    expect(renderRoomName('   ', member)).toBe("Ardan's room");
  });
  it('stays within the channel name limit', () => {
    expect(renderRoomName('x'.repeat(90) + '{user}{user}', member)).toHaveLength(100);
  });
});

describe('cleanRoomName', () => {
  it('collapses whitespace and rejects empty names', () => {
    expect(cleanRoomName('  chill   room ')).toBe('chill room');
    expect(cleanRoomName('   ')).toBeNull();
    expect(cleanRoomName('x'.repeat(150))).toHaveLength(100);
  });
});

describe('parseUserLimit', () => {
  it('accepts 0-99 and treats blank as no limit', () => {
    expect(parseUserLimit('5')).toBe(5);
    expect(parseUserLimit(' 99 ')).toBe(99);
    expect(parseUserLimit('')).toBe(0);
    expect(parseUserLimit('0')).toBe(0);
  });
  it('rejects anything else', () => {
    expect(parseUserLimit('100')).toBeNull();
    expect(parseUserLimit('-1')).toBeNull();
    expect(parseUserLimit('abc')).toBeNull();
    expect(parseUserLimit('2.5')).toBeNull();
  });
});

describe('roomState', () => {
  const VIEW = 1n << 10n;
  const SEND = 1n << 11n;
  const CONNECT = 1n << 20n;
  const overwrite = (id: string, type: number, allow = 0n, deny = 0n) => ({ id, type, allow, deny });

  it('reads an open room', () => {
    const state = roomState([overwrite('owner', 1, VIEW | CONNECT), overwrite('bot', 1, VIEW | CONNECT)], 'guild', 'owner', 'bot');
    expect(state).toEqual({ locked: false, hidden: false, chatOff: false, trusted: [], blocked: [] });
  });

  it('reads lock, hide, chat and the member lists', () => {
    const state = roomState(
      [
        overwrite('guild', 0, 0n, CONNECT | VIEW | SEND),
        overwrite('owner', 1, VIEW | CONNECT | SEND),
        overwrite('bot', 1, VIEW | CONNECT),
        overwrite('friend', 1, VIEW | CONNECT | SEND),
        overwrite('pest', 1, 0n, CONNECT),
        overwrite('some-role', 0, CONNECT),
      ],
      'guild',
      'owner',
      'bot',
    );
    expect(state).toEqual({ locked: true, hidden: true, chatOff: true, trusted: ['friend'], blocked: ['pest'] });
  });
});

describe('checkClaim', () => {
  it('only lets someone in the room claim it after the owner left', () => {
    expect(checkClaim({ ownerId: 'o', claimerId: 'a', memberIds: ['a'] })).toBe('ok');
    expect(checkClaim({ ownerId: 'o', claimerId: 'a', memberIds: ['a', 'o'] })).toBe('owner-present');
    expect(checkClaim({ ownerId: 'o', claimerId: 'a', memberIds: ['b'] })).toBe('not-in-room');
    expect(checkClaim({ ownerId: 'o', claimerId: 'o', memberIds: ['a'] })).toBe('already-owner');
  });
});
