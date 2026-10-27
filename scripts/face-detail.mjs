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
const CROP_SIZE = 1024;

async function sharpLib() { return (await import('sharp')).default; }

/** Where the face is blended: an ellipse over the face box (forehead to chin), soft at the edge. */
function faceEllipse(box) {
  const w = box[2] - box[0], h = box[3] - box[1];
  return { cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2 - 0.04 * h, rx: 0.56 * w, ry: 0.64 * h };
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
export function blendFace(dst, src, M, box) {
  const [a, b, tx, ty] = M, det = a * a + b * b;
  const toSrc = (x, y) => { const u = x - tx, v = y - ty; return [(a * u + b * v) / det, (-b * u + a * v) / det]; };
  const e = faceEllipse(box);
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
export async function facePass({ model, image, faces, reference, redraw, passes = 2, log = () => {} }) {
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
  const prompt = (await readFile(FACE_PASS_PROMPT_FILE, 'utf8')).replace('{{FACE_IMAGES}}', faces.length > 1 ? `2 to ${faces.length + 1}` : '2');
  const label = (i) => (i === 0 ? 'the head to redraw: change only the face' : faces[i - 1].label || 'face photo');

  const tries = await Promise.all(Array.from({ length: passes }, async (_, k) => {
    try {
      const r = await redraw([{ file: 'head-crop.png', bytes: crop, mime: 'image/png' }, ...faces], prompt, label);
      const got = await findFace(model, r.image);
      if (!got.face) return { cost: r.cost, error: 'no face in the redraw' };
      // Redraw pixels → full image pixels: align the redrawn landmarks onto the original ones.
      const M = similarity(got.face.landmarks, base.face.landmarks);
      const merged = blendFace(base.img, got.img, M, box);
      const check = await findFace(model, await encode(merged));
      const identity = check.face ? cosine(await embedAt(model, check.img, check.face.landmarks), reference) : -1;
      return { cost: r.cost, identity, merged, n: k + 1 };
    } catch (e) { return { cost: 0, error: e.message }; }
  }));
  const cost = tries.reduce((s, t) => s + (t.cost || 0), 0);
  const best = tries.filter((t) => t.merged).sort((a, b) => b.identity - a.identity)[0];
  tries.forEach((t) => log(t.error ? `  face redraw ${tries.indexOf(t) + 1}: ${t.error}` : `  face redraw ${t.n}: identity ${t.identity.toFixed(3)} (was ${before.toFixed(3)})`));
  if (!best || best.identity <= before) return { bytes: image, before, after: before, tries, kept: 'original', cost };
  return { bytes: await encode(best.merged), before, after: best.identity, tries, kept: `redraw ${best.n}`, cost };
}

/** Puts the face of `source` (look 1, approved) onto `target` (an edited look). Both full-body PNG Buffers. */
export async function faceLock({ model, source, target, reference }) {
  const [s, t] = await Promise.all([findFace(model, source), findFace(model, target)]);
  if (!s.face || !t.face) return { bytes: target, locked: false, reason: `no face found in ${s.face ? 'the edited look' : 'look 1'}` };
  const before = reference ? cosine(await embedAt(model, t.img, t.face.landmarks), reference) : null;
  const M = similarity(s.face.landmarks, t.face.landmarks);
  const merged = blendFace(t.img, s.img, M, t.face.box);
  const bytes = await encode(merged);
  let after = null;
  if (reference) { const c = await findFace(model, bytes); if (c.face) after = cosine(await embedAt(model, c.img, c.face.landmarks), reference); }
  return { bytes, locked: true, before, after };
}
