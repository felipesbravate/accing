import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendFace } from '../scripts/face-detail.mjs';

const img = (w, h, f) => { const data = Buffer.alloc(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); data.set([v, v, v], (y * w + x) * 3); } return { data, width: w, height: h }; };

test('blendFace copies the source face inside the ellipse, matched to the destination brightness, and leaves the rest', () => {
  const dst = img(100, 100, () => 100);
  const src = img(100, 100, (x, y) => (x === 50 && y === 50 ? 230 : 130)); // 30 brighter, with a dark-to-light mark
  const out = blendFace(dst, src, [1, 0, 0, 0], [30, 30, 70, 70]);
  const at = (x, y) => out.data[(y * 100 + x) * 3];
  assert.equal(at(5, 5), 100); // outside the face: untouched
  assert.ok(Math.abs(at(45, 50) - 100) <= 1); // face skin: brightness matched to the destination
  assert.ok(at(50, 50) > 180); // the source's detail (the mark) is carried over
});

test('blendFace follows a moved and scaled face (similarity transform)', () => {
  const src = img(200, 200, (x, y) => (Math.abs(x - 100) < 3 && Math.abs(y - 100) < 3 ? 250 : 120));
  const dst = img(100, 100, () => 120);
  // src → dst: half size, shifted so src (100,100) lands on dst (50,50)
  const out = blendFace(dst, src, [0.5, 0, 0, 0], [30, 30, 70, 70]);
  assert.ok(out.data[(50 * 100 + 50) * 3] > 200);
});
