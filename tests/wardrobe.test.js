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
