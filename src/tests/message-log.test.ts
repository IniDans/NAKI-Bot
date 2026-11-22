import { describe, expect, it, vi } from 'vitest';
import type { Attachment, Guild, User } from 'discord.js';

vi.mock('../modules/logger/attachmentCache.js', () => ({
  attachmentCache: {
    fetch: vi.fn(async (attachment: Attachment) =>
      attachment.name.startsWith('gone') ? null : { name: attachment.name, data: Buffer.alloc(attachment.size) },
    ),
  },
}));

const { matchDeleteEntry } = await import('../modules/logger/deleteAudit.js');
const { safeFileName, isCacheableImage } = await vi.importActual<typeof import('../modules/logger/attachmentCache.js')>(
  '../modules/logger/attachmentCache.js',
);
const { buildDeleteLog, buildEditLog, describeContent, uploadLimitBytes } = await import('../modules/logger/messageLog.js');

const NOW = 1_800_000_000_000;
const entry = (id: string, count: number, ageMs: number, targetId = 'author', channelId = 'chan') => ({
  id,
  targetId,
  channelId,
  count,
  createdTimestamp: NOW - ageMs,
});

describe('matchDeleteEntry', () => {
  it('attributes a brand-new entry', () => {
    const used = new Map<string, number>();
    expect(matchDeleteEntry([entry('a', 1, 2000)], 'author', 'chan', NOW, used)?.id).toBe('a');
  });

  it('treats an unmatched delete as the author deleting their own message', () => {
    expect(matchDeleteEntry([], 'author', 'chan', NOW, new Map())).toBeNull();
  });

  it('ignores entries for another author or channel', () => {
    const used = new Map<string, number>();
    expect(matchDeleteEntry([entry('a', 1, 1000, 'someone-else')], 'author', 'chan', NOW, used)).toBeNull();
    expect(matchDeleteEntry([entry('b', 1, 1000, 'author', 'other')], 'author', 'chan', NOW, used)).toBeNull();
  });

  it('follows the count on a merged entry and does not reuse it', () => {
    const used = new Map<string, number>();
    expect(matchDeleteEntry([entry('a', 1, 1000)], 'author', 'chan', NOW, used)?.id).toBe('a');
    // Author deletes their own message next: the entry is unchanged, so no match.
    expect(matchDeleteEntry([entry('a', 1, 60_000)], 'author', 'chan', NOW, used)).toBeNull();
    // The moderator deletes again: Discord bumps the old entry's count.
    expect(matchDeleteEntry([entry('a', 2, 120_000)], 'author', 'chan', NOW, used)?.id).toBe('a');
  });

  it('does not attribute deletes from an old entry seen for the first time', () => {
    expect(matchDeleteEntry([entry('a', 5, 10 * 60_000)], 'author', 'chan', NOW, new Map())).toBeNull();
  });

  it('lets two quick deletes each claim one count', () => {
    const used = new Map<string, number>();
    const both = [entry('a', 2, 3000)];
    expect(matchDeleteEntry(both, 'author', 'chan', NOW, used)?.id).toBe('a');
    expect(matchDeleteEntry(both, 'author', 'chan', NOW, used)?.id).toBe('a');
    expect(matchDeleteEntry(both, 'author', 'chan', NOW, used)).toBeNull();
  });
});

describe('message log helpers', () => {
  it('makes file names safe for attachment:// references', () => {
    expect(safeFileName('my photo (1).png')).toBe('my_photo_1_.png');
    expect(safeFileName('../../etc')).toBe('_.._etc');
    expect(safeFileName('')).toBe('file');
  });

  it('caches only images within the size cap', () => {
    expect(isCacheableImage({ contentType: 'image/png', size: 1000 })).toBe(true);
    expect(isCacheableImage({ contentType: 'video/mp4', size: 1000 })).toBe(false);
    expect(isCacheableImage({ contentType: 'image/gif', size: 50 * 1024 * 1024 })).toBe(false);
  });

  it('describes empty and uncached content', () => {
    expect(describeContent(null, false, 100)).toMatch(/not cached/);
    expect(describeContent('', true, 100)).toMatch(/attachments only/);
    expect(describeContent('x'.repeat(50), false, 10)).toHaveLength(10);
  });

  it('scales the upload limit with the boost tier', () => {
    expect(uploadLimitBytes({ premiumTier: 0 } as Guild)).toBeLessThan(10 * 1024 * 1024);
    expect(uploadLimitBytes({ premiumTier: 2 } as Guild)).toBeGreaterThan(40 * 1024 * 1024);
  });
});

const guild = { id: 'g1', name: 'Test Guild', premiumTier: 0 } as Guild;
const author = { id: '111111111111111111', tag: 'alice', bot: false, displayAvatarURL: () => 'https://cdn/avatar.png' } as unknown as User;
const moderator = { id: '222222222222222222', tag: 'mod', bot: false } as unknown as User;
const file = (id: string, name: string, contentType: string, size = 1000) => ({ id, name, contentType, size }) as Attachment;

describe('buildDeleteLog', () => {
  it('shows the content, author, deleter and deleted images', async () => {
    const log = await buildDeleteLog({
      guild,
      channelId: 'c1',
      messageId: 'm1',
      author,
      content: 'hello there',
      createdTimestamp: NOW,
      attachments: [file('a1', 'cat.png', 'image/png'), file('a2', 'dog.jpg', 'image/jpeg'), file('a3', 'notes.txt', 'text/plain')],
      deleter: { kind: 'moderator', user: moderator },
    });
    const main = log.embeds[0].toJSON();
    expect(main.description).toBe('hello there');
    const fields = Object.fromEntries((main.fields ?? []).map((f) => [f.name, f.value]));
    expect(fields.Author).toContain('<@111111111111111111>');
    expect(fields['Deleted By']).toContain('<@222222222222222222>');
    expect(main.image?.url).toBe('attachment://cat.png');
    expect(log.embeds[1].toJSON().image?.url).toBe('attachment://dog.jpg');
    expect(log.files.map((f) => f.name)).toEqual(['cat.png', 'dog.jpg', 'notes.txt']);
    expect(log.fallbackEmbeds[0].toJSON().image).toBeUndefined();
  });

  it('notes images that could not be saved and self-deletes', async () => {
    const log = await buildDeleteLog({
      guild,
      channelId: 'c1',
      messageId: 'm1',
      author,
      content: '',
      createdTimestamp: null,
      attachments: [file('a1', 'gone.png', 'image/png')],
      deleter: { kind: 'author' },
    });
    const main = log.embeds[0].toJSON();
    const fields = Object.fromEntries((main.fields ?? []).map((f) => [f.name, f.value]));
    expect(fields['Deleted By']).toContain('(the author)');
    expect(fields['📎 Attachments (1)']).toContain('could not be saved');
    expect(main.image).toBeUndefined();
    expect(log.files).toHaveLength(0);
  });
});

describe('buildEditLog', () => {
  it('shows before and after text plus removed images', async () => {
    const log = await buildEditLog({
      guild,
      channelId: 'c1',
      messageId: 'm1',
      url: 'https://discord.com/channels/g1/c1/m1',
      author,
      before: 'old text',
      after: 'new text',
      removedAttachments: [file('a1', 'cat.png', 'image/png')],
    });
    const main = log.embeds[0].toJSON();
    expect(main.description).toContain('**Before**\nold text');
    expect(main.description).toContain('**After**\nnew text');
    expect(main.image?.url).toBe('attachment://cat.png');
  });
});
