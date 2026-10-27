// Makes the background of a generated photo pure white (#FFFFFF) and keeps only a soft floor shadow under the feet.
// Image models never return pure white: every image on 2026-10-27 measured 232–244/255, with gradients and window
// light patterns, which shows as a grey box on the app's white screen.
// 1. Cut the person out with ISNet (rembg "isnet-general-use", run locally with onnxruntime).
// 2. Estimate the empty background's brightness and divide by it: the background becomes white and the real floor
//    shadow survives as a darkening relative to it.
// 3. Keep that shadow only inside a soft ellipse around the feet, so nothing reaches the edges.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const SEG_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx';
const SEG_FILE = 'isnet-general-use.onnx';
const SEG_SIZE = 1024;
const MAX_SHADOW = 0.6; // darkest the floor shadow may get (0 = none, 1 = black)

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

/** Brightness of the empty background everywhere (also behind the person), ignoring shadows. Computed on a grid of
 *  8×8-pixel blocks: block maximum of background pixels, a wider maximum to drop shadows, fill the holes, smooth. */
async function backgroundLevel(c, lum, person, width, height) {
  const B = 8, gw = Math.ceil(width / B), gh = Math.ceil(height / B);
  let grid = new Float32Array(gw * gh).fill(-1);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (person[i]) continue;
    const g = Math.floor(y / B) * gw + Math.floor(x / B);
    if (lum[i] > grid[g]) grid[g] = lum[i];
  }
  const r = Math.max(1, Math.round((width * 0.04) / B)); // max filter ≈ 8% of the width, separable
  const maxPass = (src, horizontal) => {
    const dst = new Float32Array(src.length).fill(-1);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      let m = -1;
      for (let k = -r; k <= r; k++) {
        const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
        const v = src[yy * gw + xx]; if (v > m) m = v;
      }
      dst[y * gw + x] = m;
    }
    return dst;
  };
  grid = maxPass(maxPass(grid, true), false);
  // Fill cells with no background (inside the person) from their neighbours, ring by ring.
  for (let missing = true, guard = 0; missing && guard < gw + gh; guard++) {
    missing = false;
    const next = grid.slice();
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (grid[i] >= 0) continue;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < gw && yy < gh && grid[yy * gw + xx] >= 0) { s += grid[yy * gw + xx]; n++; }
      }
      if (n) next[i] = s / n; else missing = true;
    }
    grid = next;
  }
  const small = Buffer.from(Float32Array.from(grid, (v) => Math.max(1, v)).map((v) => Math.min(255, v)));
  const level = await c.sharp(small, { raw: { width: gw, height: gh, channels: 1 } })
    .blur(Math.max(0.5, (width * 0.03) / B)).resize(width, height, { fit: 'fill', kernel: 'linear' }).extractChannel(0).raw().toBuffer();
  return level;
}

/** Returns { bytes (PNG), before, after } where before/after are the mean edge brightness (0–255). */
export async function cleanBackground(c, input) {
  const { data, info } = await c.sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info, n = width * height;
  const mask = await personMask(c, input, width, height);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = (data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]) / 3;
  // Person area grown by ~1% of the width so its halo does not count as background.
  const grow = await c.sharp(Buffer.from(mask.map((v) => (v > 0.1 ? 255 : 0))), { raw: { width, height, channels: 1 } })
    .blur(Math.max(0.5, width * 0.005)).extractChannel(0).raw().toBuffer();
  const person = Uint8Array.from(grow, (v) => (v > 8 ? 1 : 0));
  const level = await backgroundLevel(c, lum, person, width, height);

  // Feet: the lowest 6% of the person. The shadow is kept in an ellipse around them, reaching a little behind.
  let top = height, bottom = 0;
  for (let i = 0; i < n; i++) if (mask[i] > 0.5) { const y = Math.floor(i / width); if (y < top) top = y; if (y > bottom) bottom = y; }
  const ph = Math.max(1, bottom - top);
  let fx0 = width, fx1 = 0;
  for (let y = Math.max(0, Math.round(bottom - ph * 0.06)); y <= bottom; y++) for (let x = 0; x < width; x++) {
    if (mask[y * width + x] > 0.5) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
  }
  if (fx1 < fx0) { fx0 = width * 0.4; fx1 = width * 0.6; }
  const cx = (fx0 + fx1) / 2, cy = bottom - ph * 0.015, ax = (fx1 - fx0) / 2 + width * 0.07, ay = ph * 0.045;

  const out = Buffer.alloc(n * 3);
  const edge = (buf, get) => { let s = 0, k = 0; const sw = Math.round(width * 0.08); for (let y = 0; y < Math.round(height * 0.7); y++) for (let x = 0; x < width; x++) if (x < sw || x >= width - sw) { s += get(buf, y * width + x); k++; } return s / k; };
  for (let i = 0; i < n; i++) {
    const x = i % width, y = (i - x) / width;
    const d = ((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2;
    let w = Math.min(1, Math.max(0, (1.6 - d) / 0.9)); w = w * w * (3 - 2 * w);
    const shadow = Math.min(MAX_SHADOW, Math.max(0, 1 - lum[i] / Math.max(1, level[i])) * w);
    const bg = 255 * (1 - shadow), m = mask[i];
    for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = Math.round(data[i * 3 + ch] * m + bg * (1 - m));
  }
  const lumOf = (buf, i) => (buf[i * 3] + buf[i * 3 + 1] + buf[i * 3 + 2]) / 3;
  const bytes = await c.sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
  return { bytes, before: edge(data, lumOf), after: edge(out, lumOf) };
}
