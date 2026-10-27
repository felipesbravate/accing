// Two-layer face check for generated images.
// Layer 1, identity gate (ArcFace): rejects a different person. It does not rank: on 2026-10-27 it put the image
//   friends liked least first. Calibration that day: a clearly different man 0.07, every likeness 0.55–0.72.
// Layer 2, look check (vision model): hair, grey, age, facial hair, glasses, invented tattoos/logos.
import { join, resolve } from 'node:path';
import { average, cosine, createFaceModel, embedFace } from './arcface.mjs';
import { lookCheck } from './look-check.mjs';
import { backgroundCheck } from './background.mjs';

export const MODELS_DIR = join(resolve(import.meta.dirname, '..', '..'), 'image-test', 'models', 'buffalo_l');
export const MIN_IDENTITY = 0.4;

/**
 * faces: real face photos [{ file, bytes, mime }] (identity reference)
 * lookRefs: real photos for the look check (faces + head-to-toe photos)
 * images: generated images [{ file, bytes, mime }]
 * Returns one result per image: { file, identity, faceWidth, look, pass, reasons, warnings } and the total look cost.
 */
export async function checkFaces({ faces, lookRefs, images, minIdentity = MIN_IDENTITY, identity = true, look = true, log = console.log }) {
  const results = images.map((img) => ({ file: img.file, identity: null, look: null, reasons: [], warnings: [] }));
  if (identity) {
    try {
      const model = await createFaceModel(MODELS_DIR);
      const refs = [];
      for (const f of faces) {
        const e = await embedFace(model, f.bytes);
        if (e) refs.push(e.embedding); else log(`  Face check: no face found in ${f.file}; left out of the reference.`);
      }
      if (!refs.length) throw new Error('no face found in any face photo');
      const centre = average(refs);
      for (const [i, img] of images.entries()) {
        const e = await embedFace(model, img.bytes);
        if (!e) { results[i].reasons.push('no face found'); continue; }
        results[i].identity = cosine(e.embedding, centre);
        results[i].faceWidth = e.faceWidth;
        if (results[i].identity < minIdentity) results[i].reasons.push(`not the same person (identity ${results[i].identity.toFixed(2)} < ${minIdentity})`);
        if (e.faceWidth < 80) results[i].warnings.push(`face only ${e.faceWidth}px wide: identity score is less reliable`);
      }
    } catch (e) {
      log(`  Identity check skipped: ${e.message}`);
      identity = false;
    }
  }
  let lookCost = 0;
  if (look) {
    await Promise.all(images.map(async (img, i) => {
      try {
        const r = await lookCheck(lookRefs, img);
        results[i].look = r; lookCost += r.cost;
        results[i].reasons.push(...r.fails); results[i].warnings.push(...r.warns);
      } catch (e) {
        results[i].warnings.push(`look check failed: ${e.message}`);
      }
    }));
  }
  for (const [i, img] of images.entries()) {
    try {
      const b = await backgroundCheck(img.bytes);
      results[i].background = b;
      if (!b.white) results[i].warnings.push(`background not pure white (edges average ${Math.round(b.mean)}/255)`);
    } catch (e) { results[i].warnings.push(`background check failed: ${e.message}`); }
  }
  for (const r of results) r.pass = r.reasons.length === 0 && (identity ? r.identity != null : true);
  return { results, lookCost, identityRan: identity };
}

const fmt = (x) => (x == null ? '–' : x.toFixed(3));
export function checkTable(results) {
  return ['| Image | Identity (gate ≥ ' + MIN_IDENTITY + ') | Hair | Age | Facial hair | Glasses | Expression | Added | Background | Verdict |', '|---|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => {
      const l = r.look, c = (k) => (l ? (l[k].ok ? 'ok' : '✗ ' + l[k].note) : '–');
      const cell = (s) => String(s).replace(/\|/g, '/').replace(/\n/g, ' ');
      return `| ${r.file} | ${fmt(r.identity)} | ${cell(c('hair'))} | ${cell(l ? (l.age.looks === 'same' && l.age.ok ? 'same' : '✗ ' + l.age.looks) : '–')} | ${cell(c('facial_hair'))} | ${cell(c('glasses'))} | ${cell(c('expression'))} | ${cell(l ? (l.added.length ? '✗ ' + l.added.join(', ') : 'none') : '–')} | ${r.background ? (r.background.white ? 'white' : '✗ ' + Math.round(r.background.mean) + '/255') : '–'} | ${r.pass ? 'PASS' : 'FAIL'} |`;
    })];
}
