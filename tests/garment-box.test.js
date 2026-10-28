import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseReading, validBox } from '../scripts/image-test-lib.mjs';

test('garment boxes: kept when valid (0–1000, not tiny), dropped otherwise', () => {
  assert.equal(validBox([100, 200, 600, 800]), true);
  assert.equal(validBox([100, 200, 110, 800]), false); // 1% tall
  assert.equal(validBox([100, 200, 600, 1200]), false);
  assert.equal(validBox(null), false);
  const [a, b] = normaliseReading({ items: [
    { category: 'top', description: 'white tee', visibility: 'full', box: [120.4, 300, 480, 700] },
    { category: 'shoes', description: 'black boots', visibility: 'full', box: [900, 300] },
  ] }, 0);
  assert.deepEqual(a.box, [120, 300, 480, 700]);
  assert.equal('box' in b, false);
});
