import test from 'node:test';
import assert from 'node:assert/strict';
import { lightLevels, lightingAdvice } from '../src/lib/lighting.js';

const frame = (w, h, faceGrey, aroundGrey) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inFace = ((x - w / 2) / (w * 0.28)) ** 2 + ((y - h / 2) / (h * 0.3)) ** 2 <= 1;
    const g = inFace ? faceGrey : aroundGrey, i = (y * w + x) * 4;
    px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255;
  }
  return px;
};
test('lightLevels separates the face oval from the rest', () => {
  const l = lightLevels(frame(48, 64, 200, 50), 48, 64);
  assert.ok(Math.abs(l.face - 200 / 255) < 0.01 && Math.abs(l.around - 50 / 255) < 0.01);
});
test('lightingAdvice: dark, backlit, fine', () => {
  assert.equal(lightingAdvice(lightLevels(frame(48, 64, 40, 40), 48, 64))?.key, 'dark');
  assert.equal(lightingAdvice(lightLevels(frame(48, 64, 90, 200), 48, 64))?.key, 'backlit');
  assert.equal(lightingAdvice(lightLevels(frame(48, 64, 150, 140), 48, 64)), null);
  assert.equal(lightingAdvice(lightLevels(frame(48, 64, 160, 230), 48, 64)), null); // bright face, bright wall: fine
});
