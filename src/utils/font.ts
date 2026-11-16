import { GlobalFonts } from '@napi-rs/canvas';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const FONT_FAMILY = 'NakiSans';
const fontPath = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'assets', 'fonts', 'NotoSans-Regular.ttf');
let fontLoaded = false;

/** Registers the bundled font once and returns a CSS font-family list for canvas text. */
export function ensureFont(): string {
  if (!fontLoaded && existsSync(fontPath)) {
    GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
    fontLoaded = true;
  }
  // System fonts stay in the list so names in other scripts still render.
  return fontLoaded ? `${FONT_FAMILY}, sans-serif` : 'sans-serif';
}
