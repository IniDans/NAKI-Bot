import { describe, expect, it } from 'vitest';
import { nextOwner, renderRoomName } from '../modules/tempvoice/logic.js';

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

describe('nextOwner', () => {
  it('skips bots and the leaving owner', () => {
    const members = [
      { id: '1', bot: false },
      { id: '2', bot: true },
      { id: '3', bot: false },
    ];
    expect(nextOwner(members, '1')).toBe('3');
    expect(nextOwner([{ id: '2', bot: true }], '1')).toBeNull();
  });
});
