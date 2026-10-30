import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitsSeason, pickLooks, seasonKey } from '../src/mirror/seasons.js';
import { composeLooks } from '../scripts/image-test-lib.mjs';

const look = (...seasons) => seasons.map((season, i) => ({ description: `g${i}`, season }));

test('season filters follow the garments', () => {
  assert.equal(fitsSeason(look('warm', 'any'), 'summer'), true);
  assert.equal(fitsSeason(look('cold', 'any'), 'summer'), false);
  assert.equal(fitsSeason(look('cold', 'any'), 'winter'), true);
  assert.equal(fitsSeason(look('warm'), 'winter'), false);
  assert.equal(fitsSeason(look('any', 'any'), 'mid'), true);
  assert.equal(fitsSeason(look('any', 'cold'), 'mid'), false);
  assert.equal(fitsSeason([{ description: 'old look, no tag' }], 'winter'), true, 'untagged counts as any');
  assert.equal(fitsSeason(look('cold'), 'all'), true);
  assert.equal(seasonKey('Mid-season'), 'mid');
  assert.equal(seasonKey('nonsense'), 'today');
});

test('looks are grouped per tab, newest job first, cut-outs only, capped', () => {
  const row = (id, job, n, occasion, season = 'any', ext = 'webp') => ({ id, job_id: job, look_n: n, occasion, items: look(season), generated_image_path: `u/looks/${job}/look${n}.${ext}` });
  const rows = [row('a2', 'j2', 2, 'an office day'), row('a1', 'j2', 1, 'an office day'), row('b1', 'j1', 1, 'an office day', 'cold'),
    row('c1', 'j1', 2, 'dinner out'), row('d1', 'j0', 1, 'a party', 'any', 'png')];
  const tabs = ['Casual', 'Office day', 'Dinner', 'Party'];
  const all = pickLooks(rows, { key: 'all', perTab: 2, tabs });
  assert.deepEqual(all['Office day'].map((r) => r.id), ['a1', 'a2']);
  assert.deepEqual(all.Dinner.map((r) => r.id), ['c1']);
  assert.deepEqual(all.Party, [], 'flat PNGs are not shown');
  assert.deepEqual(pickLooks(rows, { key: 'summer', perTab: 5, tabs })['Office day'].map((r) => r.id), ['a1', 'a2']);
});

test('a look can be made to wear a given outfit photo (testers: see a new outfit now)', () => {
  const g = (photo, category, description) => ({ photo, category, description, visibility: 'full', formality: 2, exposure: 'low', season: 'any' });
  const wardrobe = [g(0, 'top', 'white tee'), g(0, 'bottom', 'blue jeans'), g(0, 'shoes', 'white sneakers'), g(1, 'top', 'green linen shirt')];
  const looks = composeLooks(wardrobe, { count: 2, occasion: 'a relaxed casual day', weather: 'mild 20°C', mustPhoto: 1 });
  assert.ok(looks.length >= 1);
  for (const l of looks) assert.ok(l.items.some((x) => x.photo === 1), 'every look wears something from photo 2');
  assert.equal(looks.mustMissed, false);
});
