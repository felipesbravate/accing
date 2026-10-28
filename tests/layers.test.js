import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeLayers } from '../scripts/image-test-lib.mjs';

test('a t-shirt over a lace long-sleeve in one photo becomes one layered item', () => {
  const items = [
    { photo: 4, category: 'top', description: 'black t-shirt with red print', visibility: 'full', box: [200, 250, 520, 750] },
    { photo: 4, category: 'top', description: 'black lace long-sleeved top', visibility: 'partial', box: [210, 200, 560, 800] },
    { photo: 4, category: 'bottom', description: 'black pleated mini skirt', visibility: 'full', box: [520, 300, 650, 700] },
  ];
  const out = mergeLayers(items);
  assert.equal(out.length, 2);
  assert.equal(out[0].description, 'black lace long-sleeved top, worn layered over black t-shirt with red print');
  assert.deepEqual(out[0].box, [200, 200, 560, 800]);
  assert.deepEqual(out[0].layered, ['black lace long-sleeved top', 'black t-shirt with red print']);
});

test('a jacket over a top, tops in different photos, or tops without boxes stay separate', () => {
  const jacket = { photo: 1, category: 'outerwear', description: 'denim jacket', box: [200, 200, 600, 800] };
  const tee = { photo: 1, category: 'top', description: 'white tee', box: [220, 300, 560, 700] };
  const other = { photo: 2, category: 'top', description: 'grey tee', box: [220, 300, 560, 700] };
  const nobox = { photo: 1, category: 'top', description: 'striped tank' };
  assert.equal(mergeLayers([jacket, tee, other, nobox]).length, 4);
});

test('two tops in one photo that barely overlap stay separate', () => {
  const a = { photo: 1, category: 'top', description: 'a', box: [100, 100, 300, 300] };
  const b = { photo: 1, category: 'top', description: 'b', box: [280, 280, 600, 600] };
  assert.equal(mergeLayers([a, b]).length, 2);
});
