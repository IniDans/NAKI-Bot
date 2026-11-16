import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { ensureFont } from '../../utils/font.js';

export const CARD_WIDTH = 1024;
export const CARD_HEIGHT = 340;
export const DEFAULT_CARD_ACCENT = '#be9c6f';

const BACKGROUND = '#1b1a18';
const PANEL = '#24221f';
const TEXT = '#f1e7d6';
const MUTED = '#b9ad9a';

export interface CardInput {
  displayName: string;
  username: string;
  serverName: string;
  memberCount: number;
  avatar: Buffer | null;
  accent?: string | null;
}

/** "#abc" or "#aabbcc" (case-insensitive); anything else falls back to the default accent. */
export function parseAccent(value: string | null | undefined): string {
  if (!value) return DEFAULT_CARD_ACCENT;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{3}$/.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return DEFAULT_CARD_ACCENT;
}

/** Shortens text with an ellipsis until measure(text) fits in maxWidth. */
export function fitText(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length > 1) {
    chars.pop();
    const candidate = `${chars.join('').trimEnd()}…`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return '…';
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

function drawAvatar(ctx: SKRSContext2D, image: Awaited<ReturnType<typeof loadImage>> | null, initial: string, family: string) {
  const cx = 170;
  const cy = CARD_HEIGHT / 2;
  const r = 104;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (image) {
    ctx.drawImage(image, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = PANEL;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = TEXT;
    ctx.font = `88px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial, cx, cy + 4);
  }
  ctx.restore();
}

/** PNG welcome card: avatar on the left, name and member number on the right, accent rule on the edge. */
export async function renderWelcomeCard(input: CardInput): Promise<Buffer> {
  const family = ensureFont();
  const accent = parseAccent(input.accent);
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 10, CARD_HEIGHT);

  let image = null;
  if (input.avatar) image = await loadImage(input.avatar).catch(() => null);
  const initial = [...(input.displayName.trim() || '?')][0]!.toUpperCase();
  drawAvatar(ctx, image, initial, family);

  // Accent ring around the avatar.
  ctx.beginPath();
  ctx.arc(170, CARD_HEIGHT / 2, 107, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = accent;
  ctx.stroke();

  const left = 320;
  const maxWidth = CARD_WIDTH - left - 56;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = accent;
  ctx.font = `26px ${family}`;
  ctx.fillText('Welcome to', left, 104);
  ctx.fillStyle = MUTED;
  ctx.fillText(
    fitText(input.serverName, maxWidth - ctx.measureText('Welcome to ').width, (s) => ctx.measureText(s).width),
    left + ctx.measureText('Welcome to ').width,
    104,
  );

  // The name shrinks a little before it gets cut off.
  let size = 64;
  ctx.font = `${size}px ${family}`;
  while (size > 44 && ctx.measureText(input.displayName).width > maxWidth) {
    size -= 4;
    ctx.font = `${size}px ${family}`;
  }
  ctx.fillStyle = TEXT;
  ctx.fillText(fitText(input.displayName, maxWidth, (s) => ctx.measureText(s).width), left, 186);

  ctx.font = `26px ${family}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(fitText(`@${input.username}`, maxWidth, (s) => ctx.measureText(s).width), left, 230);

  ctx.fillStyle = PANEL;
  ctx.fillRect(left, 258, maxWidth, 2);
  ctx.fillStyle = TEXT;
  ctx.fillText(`You are our ${ordinal(input.memberCount)} member`, left, 300);

  return canvas.toBuffer('image/png');
}

/** Downloads the member's avatar for the card; the card falls back to an initial when this fails. */
export async function fetchAvatar(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
