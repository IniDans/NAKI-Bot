import { mkdir, readFile, rm, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import type { Attachment } from 'discord.js';
import { guildService } from '../../services/database/guild.service.js';
import { appLogger } from '../../utils/logger.js';

/**
 * Short-lived local copies of images posted in guilds.
 *
 * Discord removes an attachment from its CDN soon after the message is deleted, so a
 * delete log that only links the URL ends up showing nothing. Images are saved when the
 * message arrives and re-uploaded to the log channel if the message is deleted or the
 * image is removed in an edit. The folder is wiped on start: messages from before a
 * restart aren't in discord.js's cache anyway, so their deletes carry no attachments.
 */

const CACHE_DIR = join(process.cwd(), '.cache', 'attachments');
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 300 * 1024 * 1024;
const TTL_MS = 48 * 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 15_000;

interface Entry {
  path: string;
  size: number;
}

interface Slot {
  ready: Promise<Entry | null>;
  entry: Entry | null;
  savedAt: number;
}

export interface FetchedFile {
  name: string;
  data: Buffer;
}

const slots = new Map<string, Slot>();
let totalBytes = 0;
let prepared: Promise<void> | null = null;

function prepare(): Promise<void> {
  prepared ??= (async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await mkdir(CACHE_DIR, { recursive: true });
    setInterval(evict, 30 * 60 * 1000).unref();
  })();
  return prepared;
}

export function isCacheableImage(attachment: Pick<Attachment, 'contentType' | 'size'>): boolean {
  return Boolean(attachment.contentType?.startsWith('image/')) && attachment.size <= MAX_FILE_BYTES;
}

/** File name that is safe on disk and in an `attachment://` reference. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '');
  return (cleaned || 'file').slice(-100);
}

async function download(url: string, maxBytes: number): Promise<Buffer | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) return null;
  const data = Buffer.from(await response.arrayBuffer());
  return data.length <= maxBytes ? data : null;
}

/** Try the original URL, then Discord's media proxy, which can outlive it briefly. */
export async function downloadAttachment(attachment: Attachment, maxBytes: number): Promise<Buffer | null> {
  for (const url of [attachment.url, attachment.proxyURL]) {
    try {
      const data = await download(url, maxBytes);
      if (data) return data;
    } catch {
      // try the next URL
    }
  }
  return null;
}

function removeSlot(id: string): void {
  const slot = slots.get(id);
  if (!slot) return;
  slots.delete(id);
  if (slot.entry) {
    totalBytes -= slot.entry.size;
    unlink(slot.entry.path).catch(() => undefined);
  }
}

function evict(): void {
  const cutoff = Date.now() - TTL_MS;
  // Map iteration follows insertion order, so the oldest copies go first.
  for (const [id, slot] of slots) {
    if (slot.savedAt >= cutoff && totalBytes <= MAX_TOTAL_BYTES) break;
    removeSlot(id);
  }
}

async function messageLogEnabled(guildId: string): Promise<boolean> {
  const [config, logConfig] = await Promise.all([guildService.getGuildConfig(guildId), guildService.getLogConfig(guildId)]);
  return config.loggingEnabled && Boolean(logConfig.messageLogChannel);
}

export const attachmentCache = {
  /** Start saving a message's images. Returns immediately; the download runs in the background. */
  remember(guildId: string, attachments: Iterable<Attachment>): void {
    for (const attachment of attachments) {
      if (!isCacheableImage(attachment) || slots.has(attachment.id)) continue;
      const slot: Slot = { ready: Promise.resolve(null), entry: null, savedAt: Date.now() };
      slot.ready = (async () => {
        if (!(await messageLogEnabled(guildId))) return null;
        await prepare();
        const data = await downloadAttachment(attachment, MAX_FILE_BYTES);
        if (!data || !slots.has(attachment.id)) return null;
        const path = join(CACHE_DIR, `${attachment.id}-${safeFileName(attachment.name)}`);
        await writeFile(path, data);
        if (slots.get(attachment.id) !== slot) {
          await unlink(path).catch(() => undefined);
          return null;
        }
        slot.entry = { path, size: data.length };
        totalBytes += data.length;
        evict();
        return slot.entry;
      })().catch((error) => {
        appLogger.warn('Could not cache attachment', 'AttachmentCache', {
          guildId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      slots.set(attachment.id, slot);
    }
  },

  /**
   * The attachment's bytes: the cached copy if there is one (waiting briefly for a download
   * still in progress, e.g. when AutoMod deletes the message right away), otherwise a
   * last-chance download from Discord.
   */
  async fetch(attachment: Attachment, maxBytes: number): Promise<FetchedFile | null> {
    const name = safeFileName(attachment.name);
    const slot = slots.get(attachment.id);
    if (slot) {
      const entry = await Promise.race([slot.ready, new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))]);
      if (entry && entry.size <= maxBytes) {
        try {
          return { name, data: await readFile(entry.path) };
        } catch {
          // fall through to a direct download
        }
      }
    }
    if (attachment.size > maxBytes) return null;
    const data = await downloadAttachment(attachment, maxBytes);
    return data ? { name, data } : null;
  },

  forget(ids: Iterable<string>): void {
    for (const id of ids) removeSlot(id);
  },
};
