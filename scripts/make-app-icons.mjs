// Draws the home-screen icons and iOS launch images from the Accing symbol (public/brand/symbol.svg) into public/icons.
// Run after changing the symbol or the splash colour: `node scripts/make-app-icons.mjs`.
// Colours: background primitive blue-100 (#E7E7F7, the Figma splash), symbol brand-primary (#0C0C36, inside the SVG).
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const BG = '#E7E7F7';
const symbol = await readFile(new URL('../public/brand/symbol.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

// The symbol drawn `width` px wide on a w×h canvas, centred; offsetY lifts it, as on the splash screen.
async function draw(file, w, h, width, offsetY = 0) {
  const sym = await sharp(Buffer.from(symbol), { density: 72 * Math.max(1, width / 103) }).resize({ width: Math.round(width) }).png().toBuffer();
  const { height } = await sharp(sym).metadata();
  await sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: sym, left: Math.round((w - width) / 2), top: Math.round((h - height) / 2 - offsetY) }])
    .png({ compressionLevel: 9 }).toFile(new URL(file, out).pathname);
  console.log(file, `${w}x${h}`);
}

await draw('icon-192.png', 192, 192, 192 * 0.62);
await draw('icon-512.png', 512, 512, 512 * 0.62);
await draw('icon-maskable-512.png', 512, 512, 512 * 0.5); // inside the 80% safe zone
await draw('apple-touch-icon.png', 180, 180, 180 * 0.62);
// iOS launch images (portrait iPhones, matching app/layout.js): the symbol at its splash size, 155 px wide at 1x,
// lifted 52 px so it sits where the in-app splash draws it.
for (const [w, h, r] of [[375, 667, 2], [375, 812, 3], [390, 844, 3], [393, 852, 3], [414, 896, 2], [414, 896, 3], [428, 926, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3]]) {
  await draw(`launch-${w * r}x${h * r}.png`, w * r, h * r, 155 * r, 52 * r);
}
