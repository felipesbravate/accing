import { test } from 'node:test';
import assert from 'node:assert/strict';
import { average, cosine, similarity } from '../scripts/face-check/arcface.mjs';
import { lookVerdict } from '../scripts/face-check/look-check.mjs';

const apply = ([a, b, tx, ty], [x, y]) => [a * x - b * y + tx, b * x + a * y + ty];

test('similarity transform recovers a known rotation, scale and shift', () => {
  const src = [[10, 20], [50, 22], [30, 40], [15, 60], [45, 61]];
  const angle = 0.3, scale = 1.7, t = [5, -8];
  const dst = src.map(([x, y]) => [scale * (Math.cos(angle) * x - Math.sin(angle) * y) + t[0], scale * (Math.sin(angle) * x + Math.cos(angle) * y) + t[1]]);
  const m = similarity(src, dst);
  src.forEach((p, i) => apply(m, p).forEach((v, k) => assert.ok(Math.abs(v - dst[i][k]) < 1e-9)));
});

test('average is unit length and cosine of a vector with itself is 1', () => {
  const v = average([[1, 0, 0], [0, 1, 0]]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
  assert.ok(Math.abs(cosine(v, v) - 1) < 1e-12);
});

const ok = { ok: true, note: 'same' };
const base = { hair: ok, facial_hair: ok, glasses: ok, expression: ok, build: ok, age: { ok: true, looks: 'same', note: '' }, added: [], hands_in_pockets: false };

test('look verdict passes a clean result', () => {
  assert.deepEqual(lookVerdict(base), { pass: true, fails: [], warns: [] });
});

test('look verdict fails greyer hair, a different age and invented items', () => {
  const r = lookVerdict({ ...base, hair: { ok: false, note: 'much greyer' }, age: { ok: true, looks: 'older', note: '+8 years' }, added: ['forearm tattoos'] });
  assert.equal(r.pass, false);
  assert.deepEqual(r.fails, ['hair: much greyer', 'looks older: +8 years', 'added: forearm tattoos']);
});

test('a different expression only warns', () => {
  const r = lookVerdict({ ...base, expression: { ok: false, note: 'stiff, tired look' } });
  assert.equal(r.pass, true);
  assert.deepEqual(r.warns, ['expression: stiff, tired look']);
});

import { edgeStats } from '../scripts/face-check/background.mjs';

test('background check: the flat #F9F9FB passes, light grey (raw model output) and pure white fail, the person is ignored', () => {
  const make = (bg) => { const w = 100, h = 150, a = new Uint8Array(w * h).fill(bg); for (let y = 20; y < 150; y++) for (let x = 30; x < 70; x++) a[y * w + x] = 20; return [a, w, h]; };
  assert.equal(edgeStats(...make(250)).white, true);
  const grey = edgeStats(...make(236));
  assert.equal(grey.white, false);
  assert.equal(Math.round(grey.mean), 236);
  assert.equal(edgeStats(...make(255)).white, false);
});

test('a hand in a pocket fails the look check', () => {
  const r = lookVerdict({ ...base, hands_in_pockets: true });
  assert.equal(r.pass, false);
  assert.deepEqual(r.fails, ['hand in a pocket']);
});

test('a different body build fails the look check', () => {
  const r = lookVerdict({ ...base, build: { ok: false, note: 'wider hips, shorter legs' } });
  assert.equal(r.pass, false);
  assert.deepEqual(r.fails, ['build: wider hips, shorter legs']);
});

import { photoVerdict } from '../scripts/face-check/look-check.mjs';

const cleanPhoto = { one_person: true, full_body: true, face_visible: true, sharp: true, sitting: false, holding: [], looking_at_camera: true, arms_relaxed: true, hands_in_pockets: false, mirror_selfie: false, plain_background: true };

test('a clean base photo needs nothing', () => {
  assert.deepEqual(photoVerdict(cleanPhoto), { usable: true, blocking: [], fixes: [] });
});

test('a mirror selfie with a phone is usable but needs fixing', () => {
  const r = photoVerdict({ ...cleanPhoto, holding: ['phone'], looking_at_camera: false, mirror_selfie: true, plain_background: false });
  assert.equal(r.usable, true);
  assert.deepEqual(r.fixes, ['holding phone', 'not looking at the camera', 'mirror selfie', 'room or objects in the background']);
});

test('a cropped or seated photo cannot be used', () => {
  const r = photoVerdict({ ...cleanPhoto, full_body: false, sitting: true });
  assert.equal(r.usable, false);
  assert.deepEqual(r.blocking, ['the whole body, head to feet, is not in the photo', 'the person is not standing']);
});
  assert.deepEqual(r.blocking, ['the whole body, head to feet, is not in the photo', 'the person is not standing']);
});

import { parseCsv, summarise } from '../scripts/score-summary.mjs';

test('score summary: rates over scored looks, quoted fields, first attempts', () => {
  const rows = parseCsv('file,look,model,attempt,auto_check,garments,face,clothes,pose,notes\n"a.png",1,"m",1,"pass","shirt, ""blue"" + jeans",1,1,1,""\n"b.png",2,"m",2,"pass","dress",1,0,1,"wrong length"\n"c.png",3,"m",1,"pass","skirt",,,,""\n');
  assert.equal(rows[0].garments, 'shirt, "blue" + jeans');
  const s = summarise(rows);
  assert.equal(s.scored, 2); assert.equal(s.unscored, 1);
  assert.equal(s.clothes, 0.5); assert.equal(s.allRight, 0.5);
  assert.equal(s.keptOnFirstAttempt, 0.5); assert.equal(s.rightOnFirstAttempt, 0.5);
  assert.deepEqual(s.clothesMisses, ['b.png: dress — wrong length']);
});
