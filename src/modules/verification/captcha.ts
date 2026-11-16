import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// Letters and digits that cannot be mistaken for each other (no 0/O, 1/I/L, 5/S, 2/Z).
export const CAPTCHA_ALPHABET = 'ABCDEFGHJKMNPQRTUVWXY346789';
export const CAPTCHA_LENGTH = 5;

const FONT_FAMILY = 'NakiSans';
const fontPath = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf');
let fontLoaded = false;

function ensureFont(): string {
  if (!fontLoaded && existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
    fontLoaded = true;
  }
  return fontLoaded ? FONT_FAMILY : 'sans-serif';
}

export function generateCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i++) code += CAPTCHA_ALPHABET[Math.floor(random() * CAPTCHA_ALPHABET.length)];
  return code;
}

/** Answers are compared without case or surrounding/inner whitespace. */
export function matchesCode(code: string, answer: string): boolean {
  return answer.replace(/\s+/g, '').toUpperCase() === code;
}

/** PNG of the code with per-glyph rotation and noise lines, enough to stop naive bots. */
export function renderCaptcha(code: string): Buffer {
  const width = 280;
  const height = 100;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const family = ensureFont();

  ctx.fillStyle = '#f2ede4';
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(40, 36, 32, ${0.25 + Math.random() * 0.3})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.bezierCurveTo(
      Math.random() * width,
      Math.random() * height,
      Math.random() * width,
      Math.random() * height,
      Math.random() * width,
      Math.random() * height,
    );
    ctx.stroke();
  }

  const step = width / (code.length + 1);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (let i = 0; i < code.length; i++) {
    ctx.save();
    ctx.translate(step * (i + 1), height / 2 + (Math.random() - 0.5) * 18);
    ctx.rotate((Math.random() - 0.5) * 0.7);
    ctx.font = `${44 + Math.floor(Math.random() * 10)}px ${family}`;
    ctx.fillStyle = '#1f1b17';
    ctx.fillText(code[i], 0, 0);
    ctx.restore();
  }

  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = `rgba(31, 27, 23, ${Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * width, Math.random() * height, 2, 2);
  }

  return canvas.toBuffer('image/png');
}
