import test from 'node:test';
import assert from 'node:assert/strict';
import { changedAgo, garmentKey, wardrobeCategory, wardrobeCounts, wardrobeFrom } from '../src/lib/wardrobe.js';
import { STYLES, describeStyles } from '../src/lib/styles.js';

test('wardrobeCategory sorts garments into the Profile tiles', () => {
  assert.equal(wardrobeCategory({ category: 'top', description: 'black graphic t-shirt' }), 't-shirts');
  assert.equal(wardrobeCategory({ category: 'top', description: 'white linen button-down shirt' }), 'shirts');
  assert.equal(wardrobeCategory({ category: 'top', description: 'grey hoodie' }), 'sweaters');
  assert.equal(wardrobeCategory({ category: 'bottom', description: 'denim shorts' }), 'shorts');
  assert.equal(wardrobeCategory({ category: 'bottom', description: 'pleated midi skirt' }), 'skirts');
  assert.equal(wardrobeCategory({ category: 'bottom', description: 'black straight jeans' }), 'pants');
  assert.equal(wardrobeCategory({ category: 'outerwear', description: 'camel wool coat' }), 'coats');
  assert.equal(wardrobeCategory({ category: 'outerwear', description: 'black leather jacket' }), 'jackets');
  assert.equal(wardrobeCategory({ category: 'shoes', description: 'white leather sneakers' }), 'sneakers');
  assert.equal(wardrobeCategory({ category: 'shoes', description: 'black block heel pumps' }), 'heels');
  assert.equal(wardrobeCategory({ category: 'shoes', description: 'brown chelsea boots' }), 'shoes');
  assert.equal(wardrobeCategory({ category: 'accessory', description: 'bag' }), null);
});
test('wardrobeFrom: one garment per photo, kind and wording; removed ones left out', () => {
  const tee = { photo_id: 'p1', category: 'top', description: 'Black T-shirt' };
  const looks = [{ id: 'a', items: [tee, { photo_id: 'p1', category: 'bottom', description: 'jeans' }] }, { id: 'b', items: [{ ...tee, description: 'black t-shirt ' }] }];
  const g = wardrobeFrom(looks);
  assert.equal(g.length, 2);
  assert.deepEqual(g.find((x) => x.tile === 't-shirts').looks, ['a', 'b']);
  assert.equal(wardrobeFrom(looks, [tee]).length, 1);
  assert.equal(wardrobeCounts(g)['t-shirts'], 1);
  assert.equal(garmentKey(tee), 'p1|top|black t-shirt');
});
test('changedAgo', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  assert.equal(changedAgo(null, now), null);
  assert.equal(changedAgo('2026-11-06T08:00:00Z', now), 'Last changed today.');
  assert.equal(changedAgo('2026-08-01T08:00:00Z', now), 'Last changed 3 months ago.');
});
test('style identities: 9 tags from the doc, described for the stylist', () => {
  assert.equal(STYLES.length, 9);
  assert.match(describeStyles(['Classic & Timeless', 'nope']), /^Classic & Timeless \(clean silhouettes/);
  assert.equal(describeStyles([]), '');
});

test('wardrobeFrom groups one garment read many ways (Felipe, 2026-11-06: "a lot of repetition")', () => {
  const looks = [
    { id: 'a', generated_image_path: 'u/a.webp', items: [{ photo_id: 'p1', category: 'bottom', description: 'black athletic shorts' }, { photo_id: 'p1', category: 'top', description: 'grey crew neck t-shirt' }] },
    { id: 'b', generated_image_path: 'u/b.webp', items: [{ photo_id: 'p1', category: 'bottom', description: 'black running shorts with drawstring' }] }, // same photo, other words
    { id: 'c', generated_image_path: 'u/c.webp', items: [{ photo_id: 'p2', category: 'top', description: 'grey short-sleeved crew neck t-shirt' }] }, // same tee, another photo
    { id: 'd', generated_image_path: 'u/d.webp', items: [{ category: 'shoes', description: 'white leather sneakers' }] },                          // old look: no photo id
    { id: 'e', generated_image_path: 'u/e.webp', items: [{ photo_id: 'p3', category: 'shoes', description: 'white leather low-top sneakers' }] },
    { id: 'f', generated_image_path: 'u/f.webp', items: [{ photo_id: 'p3', category: 'top', description: 'black t-shirt' }, { photo_id: 'p3', category: 'top', description: 'white long-sleeve shirt' }] },
  ];
  const g = wardrobeFrom(looks);
  const shorts = g.filter((x) => x.tile === 'shorts');
  assert.equal(shorts.length, 1);
  assert.deepEqual(shorts[0].looks.sort(), ['a', 'b']);
  assert.equal(g.filter((x) => x.tile === 't-shirts' && /grey/.test(x.description)).length, 1);
  const sneakers = g.filter((x) => x.tile === 'sneakers');
  assert.equal(sneakers.length, 1);
  assert.equal(sneakers[0].photo_id, 'p3'); // the old reading gets the photo of its twin
  assert.equal(sneakers[0].readings.length, 2);
  // two tops worn together in one look stay two garments, even from one photo
  assert.ok(g.some((x) => x.description === 'black t-shirt') && g.some((x) => x.description === 'white long-sleeve shirt'));
});
test('garmentSimilarity: shades are not hues, but light ≠ dark', async () => {
  const { garmentSimilarity } = await import('../src/lib/wardrobe.js');
  assert.ok(garmentSimilarity('light grey short-sleeved crew neck cotton t-shirt', 'plain grey crew neck short-sleeved cotton t-shirt') >= 0.6);
  assert.equal(garmentSimilarity('light blue denim jeans', 'dark blue denim jeans'), 0);
  assert.equal(garmentSimilarity('light green and dark blue color-blocked zip-up windbreaker', 'light green and dark blue color-blocked zip-up windbreaker'), 1);
  assert.equal(garmentSimilarity('black hoodie', 'red hoodie'), 0);
});
test('wardrobeFrom: garments read from a photo join the wardrobe before any look uses them (2026-11-12)', () => {
  const looks = [{ id: 'a', items: [{ photo_id: 'p1', category: 'top', description: 'light pink crew neck sweatshirt' }, { photo_id: 'p1', category: 'bottom', description: 'black jeans' }] }];
  const photos = [
    // p1 read again, worded a little differently: the same two garments.
    { id: 'p1', items: [{ category: 'top', description: 'pink crewneck cotton sweatshirt', box: [100, 200, 500, 800] }, { category: 'bottom', description: 'black slim jeans' }] },
    // p2: a sweater no look has used yet.
    { id: 'p2', items: [{ category: 'top', description: 'grey cable knit wool sweater', box: [120, 180, 520, 820] }, { category: 'accessory', description: 'watch' }] },
  ];
  const g = wardrobeFrom(looks, [], photos);
  assert.equal(g.length, 3);
  const sweater = g.find((x) => x.photo_id === 'p2');
  assert.equal(sweater.tile, 'sweaters');
  assert.deepEqual(sweater.looks, []);
  assert.deepEqual(sweater.box, [120, 180, 520, 820]);
  assert.deepEqual(g.find((x) => x.photo_id === 'p1' && x.tile === 'sweaters').looks, ['a']);
  // Removed: same photo and kind, alike wording, is gone too.
  assert.equal(wardrobeFrom(looks, [{ photo_id: 'p2', category: 'top', description: 'grey cable-knit wool sweater' }], photos).length, 2);
});
test('wardrobeFrom: two sweaters in one photo stay two, even when a look used one of them', () => {
  const looks = [{ id: 'a', items: [{ photo_id: 'p1', category: 'top', description: 'navy wool crew neck sweater' }] }];
  const photos = [{ id: 'p1', items: [{ category: 'top', description: 'navy wool crewneck sweater' }, { category: 'outerwear', description: 'beige chunky knit cardigan' }] }];
  const g = wardrobeFrom(looks, [], photos);
  assert.equal(g.filter((x) => x.tile === 'sweaters').length, 2);
  assert.deepEqual(g.find((x) => /cardigan/.test(x.description)).looks, []);
});
