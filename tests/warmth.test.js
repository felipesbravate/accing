import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitsDay, fitsDays, garmentClo, lookClo, neededClo, shareOfDays } from '../src/mirror/warmth.js';
import { DEFAULT_CLIMATE, climateFrom, seasonDays, seasonOfMonth, typicalDays } from '../src/lib/climate.js';
import { fitsSeason } from '../src/mirror/seasons.js';

const g = (category, description, season = 'any') => ({ category, description, season });
const tee = g('top', 'plain grey crew neck short-sleeved cotton t-shirt');
const longTee = g('top', 'black long-sleeved cotton crew neck t-shirt with small logo');
const hoodie = g('top', 'black cotton long-sleeved hooded sweatshirt with drawstring', 'cold');
const jeans = g('bottom', 'black slim fit denim jeans with cuffed hems');
const shorts = g('bottom', 'light grey heathered cotton jersey drawstring lounge shorts', 'warm');
const sneakers = g('shoes', 'white and black low-top casual sneakers');
const windbreaker = g('outerwear', 'light green and dark blue color-blocked zip-up windbreaker jacket');
const blazer = g('outerwear', 'dark charcoal grey textured single-breasted blazer');
const parka = g('outerwear', 'black hooded winter parka with zip closure', 'cold');

test('garment insulation follows the ISO 9920 tables', () => {
  assert.deepEqual([tee, longTee, hoodie, jeans, shorts, windbreaker, blazer, parka, sneakers].map(garmentClo), [0.08, 0.15, 0.34, 0.24, 0.06, 0.2, 0.44, 0.6, 0.02]);
  // briefs, socks, tee, shorts, shoes: 0.161 + 0.835 × 0.22
  assert.ok(Math.abs(lookClo([tee, shorts, sneakers]) - 0.345) < 0.01);
  assert.ok(lookClo([parka, tee, jeans, sneakers], { outer: false }) < lookClo([parka, tee, jeans, sneakers]));
});

test('what people wear by temperature (UTCI clothing model, Havenith 2012 eq. 3)', () => {
  assert.ok(Math.abs(neededClo(10) - 1.13) < 0.01);
  assert.ok(Math.abs(neededClo(20) - 0.73) < 0.01);
  assert.equal(neededClo(32), 0.35, 'never below a minimal outfit');
});

test('a day: jackets against the morning, the rest of the look against the afternoon', () => {
  const july = { hi: 29, lo: 22 }, april = { hi: 19, lo: 11 }, january = { hi: 14, lo: 6 };
  assert.equal(fitsDay([tee, shorts, sneakers], july), true);
  assert.equal(fitsDay([hoodie, jeans, sneakers], july), false);
  assert.equal(fitsDay([windbreaker, tee, jeans, sneakers], { hi: 23, lo: 15 }), true, 'a light jacket on a mild spring morning');
  assert.equal(fitsDay([hoodie, jeans, sneakers], april), true);
  assert.equal(fitsDay([tee, jeans, sneakers], july), true, 'jeans and a tee in July');
  assert.equal(fitsDay([tee, shorts, sneakers], january), false);
  assert.equal(fitsDay([parka, hoodie, jeans, sneakers], july), false);
  assert.equal(fitsDay([{ description: 'old look' }], july), true, 'unreadable looks pass');
});

test('seasons: share of typical days', () => {
  const summer = seasonDays(DEFAULT_CLIMATE, 'summer');
  assert.equal(fitsDays([tee, shorts, sneakers], summer), true);
  assert.equal(fitsDays([parka, longTee, jeans, sneakers], summer), false);
  assert.equal(shareOfDays([], summer), 1);
  assert.equal(fitsSeason([parka, longTee, jeans, sneakers], 'winter'), true);
  assert.equal(fitsSeason([tee, shorts, sneakers], 'winter'), false);
  assert.equal(fitsSeason([parka, longTee, jeans, sneakers], 'all'), true);
});

test('climate: hemisphere, five typical days, feels-like kept apart', () => {
  assert.equal(seasonOfMonth(7, 41.4), 'summer');
  assert.equal(seasonOfMonth(7, -33.9), 'winter');
  assert.equal(seasonOfMonth(4, 41.4), 'mid');
  assert.deepEqual(typicalDays([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((hi) => ({ hi, lo: hi - 5 }))).map((d) => d.hi), [2, 4, 6, 8, 10]);
  const days = (month, hi) => Array.from({ length: 5 }, (_, i) => [`2024-${month}-0${i + 1}`, hi + i]);
  const rows = [...days('07', 27), ...days('01', 12), ...days('04', 18)];
  const c = climateFrom({ time: rows.map((r) => r[0]), temperature_2m_max: rows.map((r) => r[1]), temperature_2m_min: rows.map((r) => r[1] - 8),
    apparent_temperature_max: rows.map((r) => r[1] + 2), apparent_temperature_min: rows.map((r) => r[1] - 9) }, 41.4);
  assert.deepEqual(c.summer.days.map((d) => d.hi), [27, 28, 29, 30, 31]);
  assert.deepEqual(c.summer.feels.map((d) => d.hi), [29, 30, 31, 32, 33]);
  assert.deepEqual(seasonDays({ ...c, basis: 'feels' }, 'summer'), c.summer.feels);
  assert.deepEqual(seasonDays({ summer: { high: 28, low: 20 } }, 'summer'), [{ hi: 28, lo: 20 }], 'older stored climates');
  assert.equal(climateFrom({ time: ['2024-07-01'], temperature_2m_max: [29], temperature_2m_min: [22] }, 41.4), null, 'too few days');
});
