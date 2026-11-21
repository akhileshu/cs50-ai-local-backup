/**
 * Renders 🦆 into public/icon/*.png for the Chrome toolbar.
 * Usage: npx tsx scripts/generate-duck-icons.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const SIZES = [16, 32, 48, 96, 128] as const;
const outDir = path.join(process.cwd(), 'public', 'icon');

async function main(): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const size of SIZES) {
    const fontPx = Math.max(12, Math.round(size * 0.78));
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:transparent;font-family:'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif;font-size:${fontPx}px;line-height:1">🦆</body></html>`,
      { waitUntil: 'load' },
    );
    await page.screenshot({
      path: path.join(outDir, `${size}.png`),
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`wrote ${size}.png`);
  }

  await browser.close();
}

void main();