import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeLooks, mergeLayers, occasionProfile, weatherProfile, unfit } from '../scripts/image-test-lib.mjs';

// Thais, 2026-10-28: "an office day" gave a strapless dress with combat boots and an open shirt dress.
const thais = [
  { photo: 0, category: 'dress', description: 'black strapless midi dress', visibility: 'full', formality: 5, exposure: 'high', season: 'any' },
  { photo: 0, category: 'shoes', description: 'metallic strappy heeled sandals', visibility: 'full', formality: 5, exposure: 'medium', season: 'warm' },
  { photo: 1, category: 'top', description: 'black crew neck t-shirt', visibility: 'partial', formality: 2, exposure: 'low', season: 'any' },
  { photo: 1, category: 'outerwear', description: 'olive green oversized shirt', visibility: 'full', formality: 3, exposure: 'low', season: 'any' },
  { photo: 1, category: 'bottom', description: 'dark grey wide-leg jeans', visibility: 'full', formality: 2, exposure: 'low', season: 'any' },
  { photo: 1, category: 'shoes', description: 'black combat boots', visibility: 'full', formality: 2, exposure: 'low', season: 'any' },
  { photo: 2, category: 'top', description: 'cream crochet button-down blouse', visibility: 'full', formality: 3, exposure: 'low', season: 'any' },
  { photo: 2, category: 'bottom', description: 'light blue straight-leg jeans', visibility: 'full', formality: 2, exposure: 'low', season: 'any' },
  { photo: 2, category: 'shoes', description: 'black low-top sneakers', visibility: 'full', formality: 2, exposure: 'low', season: 'any' },
];

test('occasion and weather words', () => {
  assert.equal(occasionProfile('an office day').name, 'work');
  assert.equal(occasionProfile('dinner with friends').name, 'evening');
  assert.equal(occasionProfile('something').name, 'any');
  assert.deepEqual(weatherProfile('mild 20°C'), { celsius: 20, cold: false, hot: false, wet: false });
  assert.equal(weatherProfile('rainy, 50F').cold, true);
  assert.equal(weatherProfile('rainy, 50F').wet, true);
});

test('an office day leaves out strapless and evening pieces, and never pairs them', () => {
  const looks = composeLooks(thais, { count: 4, seed: 1, occasion: 'an office day', weather: 'mild 20°C' });
  const used = looks.flatMap((l) => l.items.map((x) => x.description));
  assert.ok(!used.includes('black strapless midi dress'));
  assert.ok(!used.includes('metallic strappy heeled sandals'));
  assert.ok(looks.skipped.some((x) => x.description === 'black strapless midi dress' && /revealing/.test(x.why)));
  assert.equal(looks.length, 4);
});

test('an evening allows the strapless dress, with the heels before the combat boots', () => {
  const looks = composeLooks(thais, { count: 1, seed: 3, occasion: 'dinner date', weather: 'mild 20°C' });
  const d = looks[0].items.map((x) => x.description);
  if (d.includes('black strapless midi dress')) assert.ok(!d.includes('black combat boots'));
});

test('sandals stay home in the cold or rain; untagged garments are medium; accessories pass', () => {
  const occ = occasionProfile(''), sandal = { category: 'shoes', season: 'warm' };
  assert.match(unfit(sandal, occ, weatherProfile('8°C')), /warm-weather/);
  assert.match(unfit(sandal, occ, weatherProfile('rain 22°C')), /rain/);
  assert.equal(unfit({ category: 'top', season: 'warm' }, occ, weatherProfile('rain 22°C')), null);
  assert.equal(unfit({ category: 'shoes' }, occasionProfile('office'), weatherProfile('0°C')), null);
  assert.match(unfit({ category: 'dress' }, occasionProfile('office'), weatherProfile('20°C')), /not read/);
  assert.equal(unfit({ category: 'dress' }, occasionProfile('dinner'), weatherProfile('20°C')), null);
  assert.equal(unfit({ category: 'accessory', exposure: 'high' }, occasionProfile('office'), weatherProfile('20°C')), null);
});

test('a skirt worn under an open shirt dress stays with the dress, and covers it', () => {
  const out = mergeLayers([
    { photo: 3, category: 'dress', description: 'white sleeveless shirt dress', exposure: 'high', box: [150, 300, 750, 650] },
    { photo: 3, category: 'bottom', description: 'black mini skirt worn under the shirt dress', exposure: 'high', box: [380, 420, 520, 560] },
    { photo: 3, category: 'shoes', description: 'beige sandals', box: [880, 330, 980, 640] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].category, 'dress');
  assert.equal(out[0].description, 'white sleeveless shirt dress, worn over black mini skirt');
});
