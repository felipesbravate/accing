// Makes the background of a generated photo one flat colour (#F9F9FB, Felipe's choice 2026-10-27) and keeps only a soft
// floor shadow under the feet.
// Image models never return pure white: every image on 2026-10-27 measured 232–244/255, with gradients and window
// light patterns, which shows as a grey box on the app's white screen.
// 1. Cut the person out with ISNet (rembg "isnet-general-use", run locally with onnxruntime).
// 2. Everything that is not the person becomes the background colour.
// 3. The same floor shadow is drawn under every look (the model's own shadows differ from image to image), matched to
//    the shadow Felipe chose on 2026-10-27: a light pool around both shoes, slightly behind them, fading out well before
//    the edges, plus a darker contact line where the soles touch the floor.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SEG_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx';
const SEG_FILE = 'isnet-general-use.onnx';
const SEG_SIZE = 1024;
export const BACKGROUND = '#F9F9FB';
export const hexToRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) throw new Error(`Not a colour: ${hex} (use #RRGGBB)`); const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// Shadow, as darkness 0–1 (measured on the chosen image): pool ~0.09 at its centre, contact up to ~0.35.
export const SHADOW = { pool: 0.12, poolWidth: 1.45, poolHeight: 0.042, poolBehind: 0.012,
  contact: 0.38, contactBlur: 0.004, contactDrop: 0.002, cast: 0.22, castBlur: 0.012, castBehind: 0.014 };

async function deps() {
  try {
    const [ort, sharp] = await Promise.all([import('onnxruntime-node'), import('sharp')]);
    return { ort: ort.default ?? ort, sharp: sharp.default ?? sharp };
  } catch {
    throw new Error('Cleaning the background needs two packages. Run: npm install --save-dev onnxruntime-node sharp');
  }
}

export async function createCleaner(dir, log = console.log) {
  const { ort, sharp } = await deps();
  const file = join(dir, SEG_FILE);
  if (!existsSync(file)) {
    await mkdir(dir, { recursive: true });
    log(`Downloading the background-removal model once (~180 MB) from ${SEG_URL}…`);
    const res = await fetch(SEG_URL);
    if (!res.ok) throw new Error(`Model download failed (${res.status}). Download ${SEG_URL} by hand into ${dir}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const session = await ort.InferenceSession.create(file, { executionProviders: ['cpu'], logSeverityLevel: 3 });
  return { ort, sharp, session };
}

/** Soft person mask (0–1) at the image's own size. */
async function personMask(c, bytes, width, height) {
  const { data } = await c.sharp(bytes).removeAlpha().resize(SEG_SIZE, SEG_SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const n = SEG_SIZE * SEG_SIZE, input = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 3; ch++) input[ch * n + i] = data[i * 3 + ch] / 255 - 0.5;
  const out = await c.session.run({ [c.session.inputNames[0]]: new c.ort.Tensor('float32', input, [1, 3, SEG_SIZE, SEG_SIZE]) });
  const raw = out[c.session.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { if (raw[i] < lo) lo = raw[i]; if (raw[i] > hi) hi = raw[i]; }
  const small = Buffer.alloc(n);
  for (let i = 0; i < n; i++) small[i] = Math.round(((raw[i] - lo) / (hi - lo || 1)) * 255);
  const big = await c.sharp(small, { raw: { width: SEG_SIZE, height: SEG_SIZE, channels: 1 } }).resize(width, height, { fit: 'fill', kernel: 'linear' }).extractChannel(0).raw().toBuffer();
  return Float32Array.from(big, (v) => v / 255);
}

/** Returns { bytes (PNG), before, after } where before/after are the mean edge brightness (0–255). */
export async function cleanBackground(c, input, { background = BACKGROUND } = {}) {
  const colour = hexToRgb(background);
  const { data, info } = await c.sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info, n = width * height;
  const mask = await personMask(c, input, width, height);

  // The person's height and the shoes: the lowest 6% of the person.
  let top = height, bottom = 0;
  for (let i = 0; i < n; i++) if (mask[i] > 0.5) { const y = Math.floor(i / width); if (y < top) top = y; if (y > bottom) bottom = y; }
  if (bottom <= top) throw new Error('no person found');
  const ph = bottom - top, shoeTop = Math.round(bottom - ph * 0.06);
  let fx0 = width, fx1 = 0;
  const shoes = Buffer.alloc(n), behind = Buffer.alloc(n);
  for (let y = shoeTop; y <= bottom; y++) for (let x = 0; x < width; x++) {
    const v = mask[y * width + x];
    if (v > 0.5) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
    // Contact shadow source: the shoes, dropped a little towards the floor; cast shadow: the shoes, projected behind.
    const yy = Math.min(height - 1, y + Math.round(ph * SHADOW.contactDrop));
    shoes[yy * width + x] = Math.max(shoes[yy * width + x], Math.round(v * 255));
    const yb = Math.max(0, y - Math.round(ph * SHADOW.castBehind));
    behind[yb * width + x] = Math.max(behind[yb * width + x], Math.round(v * 255));
  }
  const soft = (buf, sigma) => c.sharp(buf, { raw: { width, height, channels: 1 } }).blur(Math.max(0.5, ph * sigma)).extractChannel(0).raw().toBuffer();
  const [contact, cast] = await Promise.all([soft(shoes, SHADOW.contactBlur), soft(behind, SHADOW.castBlur)]);

  // Pool: a soft ellipse centred on the feet, slightly behind them (higher in the image).
  const fw = Math.max(1, fx1 - fx0), cx = (fx0 + fx1) / 2, cy = bottom - ph * SHADOW.poolBehind;
  const ax = (fw / 2) * SHADOW.poolWidth, ay = ph * SHADOW.poolHeight;

  const out = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    const x = i % width, y = (i - x) / width;
    const d2 = ((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2;
    const pool = d2 < 4 ? SHADOW.pool * Math.exp(-1.5 * d2) * Math.max(0, 1 - d2 / 4) : 0;
    const low = y >= shoeTop - ph * 0.02 ? 1 : 0; // never above the ankles
    const con = (contact[i] / 255) * SHADOW.contact * low;
    const cst = (cast[i] / 255) * SHADOW.cast * low * (d2 < 4 ? 1 - d2 / 4 : 0);
    const shadow = 1 - (1 - pool) * (1 - con) * (1 - cst);
    const m = mask[i];
    for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = Math.round(data[i * 3 + ch] * m + colour[ch] * (1 - shadow) * (1 - m));
  }
  const edge = (buf) => { let s = 0, k = 0; const sw = Math.round(width * 0.08); for (let y = 0; y < Math.round(height * 0.7); y++) for (let x = 0; x < width; x++) if (x < sw || x >= width - sw) { const i = y * width + x; s += (buf[i * 3] + buf[i * 3 + 1] + buf[i * 3 + 2]) / 3; k++; } return s / k; };
  const bytes = await c.sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { bytes, before: edge(data), after: edge(out) };
}
