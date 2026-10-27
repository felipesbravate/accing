import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeOutfit, dedupeWardrobe, normaliseReading } from '../scripts/image-test-lib.mjs';

const item = (photo, category, description, visibility = 'full') => ({ photo, category, description, visibility });

test('composeOutfit mixes items from different photos', () => {
  const wardrobe = [
    item(0, 'outerwear', 'brown tweed blazer'), item(0, 'top', 'black v-neck top'), item(0, 'bottom', 'black jeans'), item(0, 'shoes', 'black loafers'),
    item(1, 'top', 'white shirt'), item(1, 'bottom', 'beige chinos'), item(1, 'shoes', 'white sneakers'),
  ];
  const o = composeOutfit(wardrobe, { seed: 7 });
  assert.equal(o.newCombination, true);
  assert.ok(o.distinctPhotos >= 2);
  assert.ok(o.items.some((x) => x.category === 'shoes'));
  assert.ok(o.items.some((x) => x.category === 'outerwear'));
});

test('composeOutfit is repeatable with the same seed', () => {
  const w = [item(0, 'top', 'a'), item(1, 'top', 'b'), item(2, 'bottom', 'c'), item(3, 'bottom', 'd'), item(4, 'shoes', 'e')];
  assert.deepEqual(composeOutfit(w, { seed: 3 }), composeOutfit(w, { seed: 3 }));
});

test('composeOutfit accepts a dress and reports a single-photo outfit as not new', () => {
  const o = composeOutfit([item(0, 'dress', 'red dress'), item(0, 'shoes', 'heels')]);
  assert.equal(o.newCombination, false);
  assert.deepEqual(o.items.map((x) => x.category), ['dress', 'shoes']);
});

test('composeOutfit explains when no outfit is possible', () => {
  assert.throws(() => composeOutfit([item(0, 'shoes', 'boots')]), /top and bottoms, or a dress/);
});

test('normaliseReading cleans the model output', () => {
  const rows = normaliseReading({ items: [{ category: 'jacket', description: ' denim jacket ', visibility: 'full' }, { category: 'top' }] }, 2);
  assert.deepEqual(rows, [{ photo: 2, category: 'other', description: 'denim jacket', visibility: 'full' }]);
});

test('the same garment in two photos counts once and comes from the clearer photo', () => {
  const w = dedupeWardrobe([item(0, 'bottom', 'Black jeans', 'partial'), item(2, 'bottom', 'black  jeans', 'full')]);
  assert.equal(w.length, 1);
  assert.equal(w[0].photo, 2);
  assert.deepEqual(w[0].seenIn, [0, 2]);
});

test('re-wearing the same outfit in two photos is not a new combination', () => {
  const same = (p) => [item(p, 'top', 'black top'), item(p, 'bottom', 'black jeans'), item(p, 'shoes', 'loafers')];
  const o = composeOutfit([...same(0), ...same(1)]);
  assert.equal(o.newCombination, false);
});

test('a new combination is preferred over a complete outfit already worn', () => {
  const w = [item(0, 'top', 'black top'), item(0, 'bottom', 'black jeans'), item(0, 'shoes', 'loafers'), item(1, 'top', 'white shirt')];
  const o = composeOutfit(w, { seed: 5 });
  assert.equal(o.newCombination, true);
  assert.ok(o.items.some((x) => x.description === 'white shirt'));
});
