// Face fidelity for full-body photos.
// In a full-body 2K image the face is only ~190 px wide, so the image model draws the identity at a tiny size, and every
// clothes edit redraws it again (2026-10-27: identity 0.62 on look 1, then 0.51, 0.47, 0.49 on its edits).
// - facePass: cut the head out, enlarge it to 1024 px, let the image model redraw only the face from the face photos at
//   that size, then align it back by the facial landmarks, match its colour and blend it in. Keeps whichever version
//   (original or a redraw) is closest to the face photos.
// - faceLock: puts the approved face of look 1 onto an edited look, aligned by the landmarks, so every look has the
//   very same face.
import { readFile } from 'node:fs/promises';
import { average, cosine, embedAt, findFace, similarity } from './face-check/arcface.mjs';

export const FACE_PASS_PROMPT_FILE = new URL('./face-pass-prompt.txt', import.meta.url);
export const HARMONIZE_PROMPT_FILE = new URL('./face-harmonize-prompt.txt', import.meta.url);
const CROP_SIZE = 1024;

async function sharpLib() { return (await import('sharp')).default; }

/** Where the face is blended: an ellipse over the face box (forehead to chin), soft at the edge. */
function faceEllipse(box, size = 1) {
  const w = box[2] - box[0], h = box[3] - box[1];
  return { cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2 - 0.04 * h, rx: 0.56 * w * size, ry: 0.64 * h * size };
}
const alphaAt = (e, x, y) => {
  const d = Math.hypot((x - e.cx) / e.rx, (y - e.cy) / e.ry);
  if (d >= 1) return 0;
  if (d <= 0.72) return 1;
  const t = (1 - d) / 0.28;
  return t * t * (3 - 2 * t);
};

/** Bilinear sample of an RGB image; null outside it. */
function sample(img, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= img.width || y0 + 1 >= img.height) return null;
  const fx = x - x0, fy = y - y0, out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const p = (xx, yy) => img.data[(yy * img.width + xx) * 3 + c];
    out[c] = p(x0, y0) * (1 - fx) * (1 - fy) + p(x0 + 1, y0) * fx * (1 - fy) + p(x0, y0 + 1) * (1 - fx) * fy + p(x0 + 1, y0 + 1) * fx * fy;
  }
  return out;
}

/** Copies the face of `src` into `dst` (both {data,width,height} RGB). `M` maps src pixels to dst pixels.
 *  The source face's average colour is matched to the destination face first, so lighting stays the same. */
export function blendFace(dst, src, M, box, size = 1) {
  const [a, b, tx, ty] = M, det = a * a + b * b;
  const toSrc = (x, y) => { const u = x - tx, v = y - ty; return [(a * u + b * v) / det, (-b * u + a * v) / det]; };
  const e = faceEllipse(box, size);
  const x0 = Math.max(0, Math.floor(e.cx - e.rx)), x1 = Math.min(dst.width - 1, Math.ceil(e.cx + e.rx));
  const y0 = Math.max(0, Math.floor(e.cy - e.ry)), y1 = Math.min(dst.height - 1, Math.ceil(e.cy + e.ry));
  // Colour match on the core of the face.
  const sumD = [0, 0, 0], sumS = [0, 0, 0]; let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (alphaAt(e, x, y) < 1) continue;
    const s = sample(src, ...toSrc(x, y)); if (!s) continue;
    const i = (y * dst.width + x) * 3;
    for (let c = 0; c < 3; c++) { sumD[c] += dst.data[i + c]; sumS[c] += s[c]; }
    n++;
  }
  const shift = n ? sumD.map((v, c) => (v - sumS[c]) / n) : [0, 0, 0];
  const out = Buffer.from(dst.data);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const al = alphaAt(e, x, y); if (!al) continue;
    const s = sample(src, ...toSrc(x, y)); if (!s) continue;
    const i = (y * dst.width + x) * 3;
    for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255, Math.round(dst.data[i + c] * (1 - al) + (s[c] + shift[c]) * al)));
  }
  return { data: out, width: dst.width, height: dst.height, colourShift: shift };
}

/** Like blendFace, but the source keeps only its detail (features, skin texture) and takes the destination's light:
 *  out = src × blur(dst) / blur(src), per colour channel, so shading, tone and warmth come from the generated photo.
 *  Used to put a real face photo (indoor light, shadows) onto a studio-lit generated body without a pasted look. */
export async function relitBlend(dst, src, M, box, size = 1) {
  const sharp = await sharpLib();
  const [a, b, tx, ty] = M, det = a * a + b * b;
  const toSrc = (x, y) => { const u = x - tx, v = y - ty; return [(a * u + b * v) / det, (-b * u + a * v) / det]; };
  const e = faceEllipse(box, size), margin = Math.round(e.rx * 0.4);
  const x0 = Math.max(0, Math.floor(e.cx - e.rx) - margin), x1 = Math.min(dst.width - 1, Math.ceil(e.cx + e.rx) + margin);
  const y0 = Math.max(0, Math.floor(e.cy - e.ry) - margin), y1 = Math.min(dst.height - 1, Math.ceil(e.cy + e.ry) + margin);
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
  const W = Buffer.alloc(rw * rh * 3), T = Buffer.alloc(rw * rh * 3);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * dst.width + x) * 3, j = ((y - y0) * rw + (x - x0)) * 3;
    const sv = sample(src, ...toSrc(x, y));
    for (let c = 0; c < 3; c++) { T[j + c] = dst.data[i + c]; W[j + c] = sv ? Math.round(sv[c]) : dst.data[i + c]; }
  }
  const sigma = Math.max(1, (box[2] - box[0]) * 0.1);
  const blur = (buf) => sharp(buf, { raw: { width: rw, height: rh, channels: 3 } }).blur(sigma).raw().toBuffer();
  const [Wb, Tb] = await Promise.all([blur(W), blur(T)]);
  // Toward the edge of the face, take only skin from the photo: hair falling over a cheek in the photo would otherwise
  // come along as a dark band. Skin = YCbCr skin range of the photo, softened; the inner face is always taken whole.
  const skin = Buffer.alloc(rw * rh);
  for (let k = 0; k < rw * rh; k++) {
    const r = W[k * 3], g = W[k * 3 + 1], bl = W[k * 3 + 2];
    const yv = 0.299 * r + 0.587 * g + 0.114 * bl, cb = 128 - 0.169 * r - 0.331 * g + 0.5 * bl, cr = 128 + 0.5 * r - 0.419 * g - 0.081 * bl;
    skin[k] = yv > 60 && cr > 133 && cr < 180 && cb > 77 && cb < 135 ? 255 : 0;
  }
  const skinSoft = await sharp(skin, { raw: { width: rw, height: rh, channels: 1 } }).blur(Math.max(1, sigma / 2)).extractChannel(0).raw().toBuffer();
  const out = Buffer.from(dst.data);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let al = alphaAt(e, x, y); if (!al) continue;
    const i = (y * dst.width + x) * 3, j = ((y - y0) * rw + (x - x0)) * 3;
    const d = Math.hypot((x - e.cx) / e.rx, (y - e.cy) / e.ry);
    if (d > 0.6) al *= Math.min(1, skinSoft[(y - y0) * rw + (x - x0)] / 255 + (0.8 - Math.min(0.8, d)) / 0.2);
    for (let c = 0; c < 3; c++) {
      const v = W[j + c] * (Tb[j + c] + 2) / (Wb[j + c] + 2);
      out[i + c] = Math.max(0, Math.min(255, Math.round(dst.data[i + c] * (1 - al) + v * al)));
    }
  }
  return { data: out, width: dst.width, height: dst.height };
}

/** How far the head is turned: the nose tip's offset from the eyes' midpoint, in eye distances (0 = facing the camera). */
const yaw = (lm) => { const [le, re, nose] = lm; const mid = (le[0] + re[0]) / 2, d = Math.hypot(re[0] - le[0], re[1] - le[1]) || 1; return (nose[0] - mid) / d; };

/** Puts the person's REAL face (from the face photo whose head angle matches best) onto a generated image, aligned by
 *  the landmarks and relit to the generated light. 2026-10-27: identity 0.62 → 0.93, where drawn faces plateaued. */
export async function realFace({ model, target, faces, reference }) {
  const t = await findFace(model, target);
  if (!t.face) return { bytes: target, placed: false, reason: 'no face found in the generated image' };
  let best = null;
  for (const f of faces) {
    const s = await findFace(model, f.bytes);
    if (!s.face) continue;
    const diff = Math.abs(yaw(s.face.landmarks) - yaw(t.face.landmarks));
    if (!best || diff < best.diff) best = { s, diff, file: f.file };
  }
  if (!best) return { bytes: target, placed: false, reason: 'no face found in the face photos' };
  const before = reference ? cosine(await embedAt(model, t.img, t.face.landmarks), reference) : null;
  const merged = await relitBlend(t.img, best.s.img, similarity(best.s.face.landmarks, t.face.landmarks), t.face.box);
  const bytes = await encode(merged);
  let after = null;
  if (reference) { const c = await findFace(model, bytes); if (c.face) after = cosine(await embedAt(model, c.img, c.face.landmarks), reference); }
  return { bytes, placed: true, source: best.file, before, after };
}

async function encode(img) {
  const sharp = await sharpLib();
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } }).png().toBuffer();
}

/** Identity reference: the average embedding of the face photos. */
export async function referenceFace(model, faces) {
  const embs = [];
  for (const f of faces) { const r = await findFace(model, f.bytes); if (r.face) embs.push(await embedAt(model, r.img, r.face.landmarks)); }
  if (!embs.length) throw new Error('no face found in the face photos');
  return average(embs);
}

/**
 * model: ArcFace model (createFaceModel). image: Buffer (full-body PNG). faces: face photos [{bytes,mime,label}].
 * redraw(images, prompt, label) → { image: Buffer, cost }: calls the image model on a square crop.
 * Returns { bytes, before, after, tries: [{identity, cost}], kept: 'original' | 'redraw N', cost }.
 */
export async function facePass({ model, image, faces, reference, redraw, passes = 2, log = () => {}, promptFile = FACE_PASS_PROMPT_FILE, blendSize = 1, minKeep = null }) {
  const sharp = await sharpLib();
  const base = await findFace(model, image);
  if (!base.face) return { bytes: image, before: null, after: null, tries: [], kept: 'original (no face found)', cost: 0 };
  const before = cosine(await embedAt(model, base.img, base.face.landmarks), reference);
  const { box } = base.face, fw = box[2] - box[0], fh = box[3] - box[1];
  // Square crop around the head: face plus hair, ears and chin.
  const side = Math.min(base.img.width, base.img.height, Math.round(2.4 * Math.max(fw, fh)));
  const left = Math.max(0, Math.min(base.img.width - side, Math.round((box[0] + box[2]) / 2 - side / 2)));
  const top = Math.max(0, Math.min(base.img.height - side, Math.round((box[1] + box[3]) / 2 - 0.1 * fh - side / 2)));
  const crop = await sharp(image).extract({ left, top, width: side, height: side }).resize(CROP_SIZE, CROP_SIZE, { kernel: 'lanczos3' }).png().toBuffer();
  const prompt = (await readFile(promptFile, 'utf8')).replace('{{FACE_IMAGES}}', faces.length > 1 ? `2 to ${faces.length + 1}` : '2');
  const label = (i) => (i === 0 ? 'the head to redraw: change only the face' : faces[i - 1].label || 'face photo');

  const tries = await Promise.all(Array.from({ length: passes }, async (_, k) => {
    try {
      const r = await redraw([{ file: 'head-crop.png', bytes: crop, mime: 'image/png' }, ...faces], prompt, label);
      const got = await findFace(model, r.image);
      if (!got.face) return { cost: r.cost, error: 'no face in the redraw' };
      // Redraw pixels → full image pixels: align the redrawn landmarks onto the original ones.
      const M = similarity(got.face.landmarks, base.face.landmarks);
      const merged = blendFace(base.img, got.img, M, box, blendSize);
      const check = await findFace(model, await encode(merged));
      const identity = check.face ? cosine(await embedAt(model, check.img, check.face.landmarks), reference) : -1;
      return { cost: r.cost, identity, merged, n: k + 1 };
    } catch (e) { return { cost: 0, error: e.message }; }
  }));
  const cost = tries.reduce((s, t) => s + (t.cost || 0), 0);
  const best = tries.filter((t) => t.merged).sort((a, b) => b.identity - a.identity)[0];
  tries.forEach((t) => log(t.error ? `  face redraw ${tries.indexOf(t) + 1}: ${t.error}` : `  face redraw ${t.n}: identity ${t.identity.toFixed(3)} (was ${before.toFixed(3)})`));
  // Redraws must beat the original; a harmonize pass (minKeep) only has to keep the identity above minKeep.
  const good = best && (minKeep == null ? best.identity > before : best.identity >= minKeep);
  if (!good) return { bytes: image, before, after: before, tries, kept: 'original', cost };
  return { bytes: await encode(best.merged), before, after: best.identity, tries, kept: `redraw ${best.n}`, cost };
}

/** Puts the face of `source` (look 1, approved) onto `target` (an edited look). Both full-body PNG Buffers. */
export async function faceLock({ model, source, target, reference }) {
  const [s, t] = await Promise.all([findFace(model, source), findFace(model, target)]);
  if (!s.face || !t.face) return { bytes: target, locked: false, reason: `no face found in ${s.face ? 'the edited look' : 'look 1'}` };
  const before = reference ? cosine(await embedAt(model, t.img, t.face.landmarks), reference) : null;
  let M = similarity(s.face.landmarks, t.face.landmarks);
  // Same head size and angle (base mode keeps the pose): copy pixel for pixel, shifted by whole pixels. Resampling a
  // ~120 px face made it soft and smeared (2026-10-28).
  const scale = Math.hypot(M[0], M[1]), angle = Math.abs(Math.atan2(M[1], M[0])) * 180 / Math.PI;
  const exact = Math.abs(scale - 1) < 0.04 && angle < 2;
  if (exact) {
    const cs = s.face.landmarks.reduce((a, p) => [a[0] + p[0] / 5, a[1] + p[1] / 5], [0, 0]), ct = t.face.landmarks.reduce((a, p) => [a[0] + p[0] / 5, a[1] + p[1] / 5], [0, 0]);
    M = [1, 0, Math.round(ct[0] - cs[0]), Math.round(ct[1] - cs[1])];
  }
  const merged = blendFace(t.img, s.img, M, t.face.box);
  const bytes = await encode(merged);
  let after = null;
  if (reference) { const c = await findFace(model, bytes); if (c.face) after = cosine(await embedAt(model, c.img, c.face.landmarks), reference); }
  return { bytes, locked: true, exact, scale, angle, before, after };
}
