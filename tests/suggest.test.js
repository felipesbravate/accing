import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, seenKey, suggestLooks } from '../src/mirror/suggest.js';

const tee = { category: 'top', description: 'grey t-shirt' }, sneakers = { category: 'shoes', description: 'white sneakers' };
const bottoms = (i) => ({ category: 'bottom', description: `jeans ${i}` });
const row = (id, created, extra = {}) => ({ id, occasion: 'a relaxed casual day', items: [tee, bottoms(id), sneakers], generated_image_path: `u/${id}.webp`, created_at: created, ...extra });
const today = '2026-11-03', since = '2026-11-02T23:00:00.000Z';
const opts = (o = {}) => ({ tabs: ['Casual'], today, since, ...o });

test('at most 5, made today first, then never seen, then seen longest ago', () => {
  const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => row(id, `2026-10-${20 + i}T10:00:00Z`)).reverse(); // newest first
  rows.unshift(row('new', '2026-11-03T08:00:00Z'));
  const seen = new Map([[seenKey(rows.find((r) => r.id === 'g').items), '2026-10-01'], [seenKey(rows.find((r) => r.id === 'f').items), '2026-10-20']]);
  const out = suggestLooks(rows, opts({ seen })).Casual.map((r) => r.id);
  assert.equal(out.length, 5);
  assert.equal(out[0], 'new');
  assert.deepEqual(out.slice(1), ['e', 'd', 'c', 'b'], 'never seen next, newest first; seen ones wait');
});

test('looks seen this week are left out while fresher ones exist; only if none, the least recently seen', () => {
  const rows = [row('a', '2026-10-30T10:00:00Z'), row('b', '2026-10-29T10:00:00Z'), row('c', '2026-10-28T10:00:00Z')];
  const seenAll = new Map([[seenKey(rows[0].items), '2026-11-01'], [seenKey(rows[1].items), '2026-10-31'], [seenKey(rows[2].items), '2026-10-30']]);
  assert.deepEqual(suggestLooks(rows, opts({ seen: seenAll })).Casual.map((r) => r.id), ['c', 'b', 'a'], 'all seen recently: oldest sighting first');
  const seenTwo = new Map([[seenKey(rows[0].items), '2026-11-02'], [seenKey(rows[1].items), '2026-10-20']]);
  assert.deepEqual(suggestLooks(rows, opts({ seen: seenTwo })).Casual.map((r) => r.id), ['c', 'b'], 'a (seen yesterday) rests');
  const seenToday = new Map([[seenKey(rows[0].items), today]]);
  assert.deepEqual(suggestLooks(rows, opts({ seen: seenToday })).Casual.map((r) => r.id), ['a', 'b', 'c'], 'seen today keeps its place');
});

test('only looks that suit today\'s weather, when some do', () => {
  const hoodie = { category: 'top', description: 'black hooded sweatshirt', season: 'cold' };
  const shorts = { category: 'bottom', description: 'cotton shorts' };
  const warm = { ...row('warm', '2026-10-30T10:00:00Z'), items: [hoodie, { category: 'bottom', description: 'wool trousers' }, sneakers] };
  const light = { ...row('light', '2026-10-29T10:00:00Z'), items: [tee, shorts, sneakers] };
  assert.deepEqual(suggestLooks([warm, light], opts({ weather: '30°C high, 23°C low, sunny' })).Casual.map((r) => r.id), ['light']);
  assert.deepEqual(suggestLooks([warm, light], opts({ weather: '18°C high, 12°C low' })).Casual.map((r) => r.id), ['warm']);
  assert.deepEqual(suggestLooks([light], opts({ weather: '2°C high, -3°C low' })).Casual.map((r) => r.id), ['light'], 'nothing suits: still shows what there is');
  assert.deepEqual(dayOf('19°C high, 12°C low, rain likely'), { hi: 19, lo: 12 });
  assert.equal(dayOf('mild'), null);
});

test('hidden looks, duplicates and flat images stay out', () => {
  const a = row('a', '2026-10-30T10:00:00Z'), twin = { ...row('twin', '2026-10-29T10:00:00Z'), items: a.items };
  const flat = { ...row('flat', '2026-10-28T10:00:00Z'), generated_image_path: 'u/flat.png' };
  assert.deepEqual(suggestLooks([a, twin, flat], opts()).Casual.map((r) => r.id), ['a']);
  assert.deepEqual(suggestLooks([a, twin], opts({ hidden: new Set([seenKey(a.items)]) })).Casual, []);
});
