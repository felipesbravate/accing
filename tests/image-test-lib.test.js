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

import { composeLooks } from '../scripts/image-test-lib.mjs';

test('composeLooks returns different looks, new combinations first, spreading the garments', () => {
  // Like the 2026-10-27 test photos: grey tee + cargos, windbreaker + grey tee + cargos, black hoodie + jeans.
  const w = [item(0, 'top', 'grey t-shirt'), item(0, 'bottom', 'black cargo trousers'),
    item(1, 'outerwear', 'mint windbreaker'), item(1, 'top', 'grey t-shirt'), item(1, 'bottom', 'black cargo trousers'),
    item(2, 'top', 'black hoodie'), item(2, 'bottom', 'blue jeans')];
  const looks = composeLooks(w, { count: 4, seed: 1 });
  assert.equal(looks.length, 4);
  const sig = looks.map((l) => l.items.map((x) => x.description).sort().join('+'));
  assert.equal(new Set(sig).size, 4);
  assert.ok(looks.every((l) => l.newCombination));
  const tops = new Set(looks.slice(0, 2).map((l) => l.items.find((x) => x.category === 'top').description));
  assert.equal(tops.size, 2); // the first two looks already use both tops
  assert.deepEqual(composeLooks(w, { count: 4, seed: 1 }), looks);
});

test('composeLooks returns fewer looks when the wardrobe runs out', () => {
  assert.equal(composeLooks([item(0, 'top', 'a'), item(0, 'bottom', 'b')], { count: 5 }).length, 1);
});

import { sameGarment } from '../scripts/image-test-lib.mjs';

// The real readings of 2026-10-27, where exact-text matching made looks 2 and 4 the same outfit.
const real = [
  item(0, 'top', 'plain grey short-sleeved cotton crew neck t-shirt'), item(0, 'bottom', 'black cargo style trousers with side pockets'),
  item(1, 'outerwear', 'light green and dark grey color-blocked zip-up windbreaker jacket'), item(1, 'top', 'plain grey crew neck short-sleeved cotton t-shirt'),
  item(1, 'bottom', 'black cargo style trousers with side pockets and cuffs'),
  item(2, 'top', 'black cotton long-sleeved hooded sweatshirt with front pocket'), item(2, 'bottom', 'light blue denim jeans with rolled up cuffs'),
];

test('the same garment worded differently in two photos counts once', () => {
  assert.equal(sameGarment(real[0], real[3]), true);
  assert.equal(sameGarment(real[1], real[4]), true);
  assert.equal(sameGarment(real[0], real[5]), false); // grey tee vs black hoodie
  assert.equal(sameGarment(item(0, 'bottom', 'black jeans'), item(1, 'bottom', 'blue jeans')), false);
  assert.equal(sameGarment(item(0, 'top', 'white shirt'), item(0, 'top', 'white shirt')), false); // same photo: two items
});

test('looks from the real readings are all different and all new', () => {
  const looks = composeLooks(real, { count: 4, seed: 1 });
  const names = (l) => l.items.map((x) => x.category + ':' + x.description.split(' ').slice(-2).join(' ')).sort().join(' + ');
  assert.equal(new Set(looks.map(names)).size, looks.length);
  assert.ok(looks.every((l) => l.newCombination), looks.map(names).join('\n'));
  looks.forEach((l) => console.log('   ', names(l)));
});
