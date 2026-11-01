import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboKey, fitsSeason, pickLooks, seasonKey } from '../src/mirror/seasons.js';
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

test('a new garment is shown in weather it suits when today rules it out', async () => {
  const { weatherForGarments } = await import('../scripts/image-test-lib.mjs');
  const coat = { category: 'outerwear', description: 'wool coat', season: 'cold' };
  const hoodie = { category: 'top', description: 'grey hoodie', season: 'any' };
  const sandals = { category: 'shoes', description: 'sandals', season: 'warm' };
  assert.deepEqual(weatherForGarments([coat], '27°C high'), { weather: '8°C high, 3°C low', changed: true });
  assert.equal(weatherForGarments([coat, hoodie], '27°C high').changed, false, 'the hoodie still fits today');
  assert.equal(weatherForGarments([sandals], '6°C high').weather, '27°C high, 19°C low');
  assert.equal(weatherForGarments([coat], '9°C high').changed, false);
});

test('occasions where nothing from the new photo fits get no looks (strict)', () => {
  const g = (photo, category, description, formality, exposure = 'low') => ({ photo, category, description, visibility: 'full', formality, exposure, season: 'any' });
  const wardrobe = [g(0, 'top', 'silk blouse', 4), g(0, 'bottom', 'tailored trousers', 4), g(0, 'shoes', 'loafers', 3), g(1, 'top', 'grey hoodie', 1)];
  const looks = composeLooks(wardrobe, { count: 2, occasion: 'a party', weather: 'mild 20°C', mustPhoto: 1 });
  assert.equal(looks.mustMissed, true, 'a hoodie is not party wear');
  const casual = composeLooks(wardrobe, { count: 2, occasion: 'a relaxed casual day', weather: 'mild 20°C', mustPhoto: 1 });
  assert.equal(casual.mustMissed, false);
});

test('hidden garment combinations stay hidden, in any order, and Favorites keeps only hearted looks', () => {
  const row = (id, job, n, descs) => ({ id, job_id: job, look_n: n, occasion: 'an office day', items: descs.map((description) => ({ description })), generated_image_path: `u/${job}/look${n}.webp` });
  const rows = [row('a', 'j1', 1, ['White tee', 'Black jeans']), row('b', 'j1', 2, ['Red dress']), row('c', 'j0', 1, ['black jeans', 'white tee']), row('d', 'j0', 2, [])];
  const tabs = ['Office day'];
  assert.equal(comboKey(rows[0].items), comboKey(rows[2].items), 'same garments, any order or case');
  assert.equal(comboKey([], 'd'), 'look:d', 'a look without garment names is its own key');
  const hidden = new Set([comboKey(rows[0].items)]);
  assert.deepEqual(pickLooks(rows, { key: 'all', tabs, hidden })['Office day'].map((r) => r.id), ['b', 'd']);
  assert.deepEqual(pickLooks(rows, { key: 'all', tabs, hidden: new Set(['look:d']) })['Office day'].map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(pickLooks(rows, { key: 'favorites', tabs, favorites: new Set(['b', 'c']) })['Office day'].map((r) => r.id), ['b', 'c']);
  assert.equal(seasonKey('Favorites'), 'favorites');
});

test('a hidden combination is known by its photos, however the reader words the garments', async () => {
  const { comboKey } = await import('../src/mirror/seasons.js');
  const a = [{ description: 'black high-waisted jeans', category: 'bottom', photo_id: 'p2' }, { description: 'light blue tank', category: 'top', photo_id: 'p1' }];
  const b = [{ description: 'black jeans', category: 'bottom', photo_id: 'p2' }, { description: 'blue racer top', category: 'top', photo_id: 'p1' }];
  assert.equal(comboKey(a), comboKey(b));
  assert.equal(comboKey(a), 'photos:p1/top + p2/bottom');
  assert.equal(comboKey([{ description: 'Black Jeans' }, { description: 'white tee' }]), 'black jeans + white tee', 'older looks: descriptions');
  assert.equal(comboKey([], 'x1'), 'look:x1');
});

test('the worker turns hidden combinations into this run\'s photo numbers, and the pipeline leaves them out', async () => {
  const { avoidKeys, outfitRows } = await import('../worker/jobs.mjs');
  const { lookKey } = await import('../scripts/image-test-lib.mjs');
  const ids = ['p1', 'p2', 'p3'];
  assert.deepEqual(avoidKeys(['photos:p2/bottom + p1/top', 'photos:p9/top + p1/bottom', 'black jeans + white tee', 'look:x'], ids), ['0/top + 1/bottom', 'desc:black jeans + white tee']);
  const g = (photo, category, description) => ({ photo, category, description, visibility: 'full', formality: 2, exposure: 'low', season: 'any' });
  const wardrobe = [g(0, 'top', 'tee'), g(1, 'bottom', 'jeans'), g(2, 'top', 'shirt'), g(2, 'shoes', 'sneakers')];
  const all = composeLooks(wardrobe, { count: 5, occasion: 'a relaxed casual day', weather: 'mild 20°C' });
  const hide = lookKey(all[0].items);
  const after = composeLooks(wardrobe, { count: 5, occasion: 'a relaxed casual day', weather: 'mild 20°C', avoid: new Set([hide]) });
  assert.ok(after.every((l) => lookKey(l.items) !== hide));
  assert.equal(after.avoided, 1);
  const [row] = outfitRows({ id: 'j', user_id: 'u', payload: {} }, { looks: [{ n: 1, status: 'ready', items: [{ description: 'tee', category: 'top', photo: 1 }] }] }, { 1: 'u/x.webp' }, ids);
  assert.equal(row.items[0].photo_id, 'p2');
});

test('every look is shown once per garment combination, newest first; failures get a plain sentence', async () => {
  const { pickLooks } = await import('../src/mirror/seasons.js');
  const { jobFailureText } = await import('../src/lib/job-errors.js');
  const it = (pid) => [{ description: 'x', category: 'top', photo_id: pid }];
  const row = (id, job, n, pid) => ({ id, job_id: job, look_n: n, occasion: 'an office day', items: it(pid), generated_image_path: `u/${id}.webp` });
  const rows = [row('new', 'j2', 1, 'p1'), row('other', 'j2', 2, 'p2'), row('old', 'j1', 1, 'p1')];
  const out = pickLooks(rows, { tabs: ['Office day'], perTab: 40, unique: true });
  assert.deepEqual(out['Office day'].map((r) => r.id), ['new', 'other']);
  assert.match(jobFailureText('Reading photo-07.jpg failed (gemini, 402): Your prepayment credits are depleted.'), /out of credit/);
  assert.equal(jobFailureText(null), null);
});

test('worker and app name a combination the same way; the daily look is one look across occasions', async () => {
  const { comboKey } = await import('../src/mirror/seasons.js');
  const { photoCombo, pipelineArgs } = await import('../worker/jobs.mjs');
  const items = [{ description: 'a', category: 'top', photo_id: 'p2' }, { description: 'b', category: 'bottom', photo_id: 'p1' }];
  assert.equal(photoCombo(items), comboKey(items));
  assert.equal(photoCombo([{ description: 'Old' }]), 'old');
  assert.equal(photoCombo([]), null);
  const args = pipelineArgs({ job_type: 'make_looks', payload: { kind: 'morning', looks: 3, occasion: 'an office day' } }, 'p', 'x');
  assert.ok(args.includes('--looks=3'));
  assert.ok(args.some((a) => a.startsWith('--occasions=') && a.includes('a party') && !a.includes('an office day')));
});

test('the stylist vetoes combinations before they are made', async () => {
  const { lookKey } = await import('../scripts/image-test-lib.mjs');
  const g = (photo, category, description) => ({ photo, category, description, visibility: 'full', formality: 2, exposure: 'low', season: 'any' });
  const wardrobe = [g(0, 'top', 'jersey'), g(1, 'top', 'tee'), g(2, 'bottom', 'jeans'), g(2, 'shoes', 'sneakers')];
  const first = composeLooks(wardrobe, { count: 1, occasion: 'a relaxed casual day', weather: 'mild 20°C' });
  const vetoed = new Set([lookKey(first[0].items)]);
  const again = composeLooks(wardrobe, { count: 1, occasion: 'a relaxed casual day', weather: 'mild 20°C', avoid: vetoed });
  assert.notEqual(lookKey(again[0].items), lookKey(first[0].items));
});

test('older looks are recognised by their wording', async () => {
  const { lookDescKey } = await import('../scripts/image-test-lib.mjs');
  const g = (photo, category, description) => ({ photo, category, description, visibility: 'full', formality: 2, exposure: 'low', season: 'any' });
  const wardrobe = [g(0, 'top', 'White Tee'), g(1, 'top', 'grey tee'), g(2, 'bottom', 'blue jeans')];
  const avoid = new Set([lookDescKey([{ description: 'blue jeans' }, { description: 'white tee' }])]);
  const looks = composeLooks(wardrobe, { count: 2, occasion: 'a relaxed casual day', weather: 'mild 20°C', avoid });
  assert.ok(looks.every((l) => !l.items.some((x) => x.description === 'White Tee')));
});
