import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitsTemperature, garmentWarmth, lookWarmth } from '../src/mirror/warmth.js';
import { climateFrom, seasonOfMonth } from '../src/lib/climate.js';
import { fitsSeason } from '../src/mirror/seasons.js';

const g = (category, description, season = 'any') => ({ category, description, season });
const tee = g('top', 'plain grey crew neck short-sleeved cotton t-shirt');
const longTee = g('top', 'black long-sleeved cotton crew neck t-shirt with small logo');
const hoodie = g('top', 'black cotton long-sleeved hooded sweatshirt with drawstring', 'cold');
const jeans = g('bottom', 'black slim fit denim jeans with cuffed hems');
const shorts = g('bottom', 'light grey heathered cotton jersey drawstring lounge shorts', 'warm');
const sneakers = g('shoes', 'white and black low-top casual sneakers');
const sandals = g('shoes', 'brown leather sandals', 'warm');
const windbreaker = g('outerwear', 'light green and dark blue color-blocked zip-up windbreaker jacket');
const blazer = g('outerwear', 'dark charcoal grey textured single-breasted blazer');
const parka = g('outerwear', 'black hooded winter parka with zip closure', 'cold');

test('garment warmth', () => {
  assert.deepEqual([tee, longTee, hoodie, jeans, shorts, windbreaker, blazer, parka].map(garmentWarmth), [0, 1, 2, 1, 0, 1, 2, 3]);
  assert.deepEqual(lookWarmth([parka, longTee, jeans, sneakers]), { body: 5, shoes: 1 });
});

test('looks against a typical daytime high (Barcelona: summer 28, mid 20, winter 15)', () => {
  // summer
  assert.equal(fitsTemperature([tee, shorts, sneakers], 28), true);
  assert.equal(fitsTemperature([tee, jeans, sneakers], 28), true, 'jeans and a tee are fine in summer');
  assert.equal(fitsTemperature([windbreaker, tee, jeans, sneakers], 28), false, 'no jacket in summer');
  assert.equal(fitsTemperature([longTee, jeans, sneakers], 28), false, 'no long sleeves in summer');
  // mid-season
  assert.equal(fitsTemperature([blazer, tee, jeans, sneakers], 20), true, 'a blazer in spring');
  assert.equal(fitsTemperature([hoodie, jeans, sneakers], 20), true);
  assert.equal(fitsTemperature([parka, longTee, jeans, sneakers], 20), false, 'no parka in spring');
  // winter
  assert.equal(fitsTemperature([tee, jeans, sneakers], 15), false, 'a tee alone is too light');
  assert.equal(fitsTemperature([hoodie, jeans, sneakers], 15), true);
  assert.equal(fitsTemperature([hoodie, shorts, sandals], 15), false, 'no sandals in winter');
  assert.equal(fitsTemperature([parka, longTee, jeans, sneakers], 15), true);
  // a cold city's winter
  assert.equal(fitsTemperature([hoodie, jeans, sneakers], 3), false);
  assert.equal(fitsTemperature([parka, hoodie, jeans, sneakers], 3), true);
  assert.equal(fitsTemperature([{ description: 'old look' }], 28), true, 'unreadable looks pass');
});

test('seasons follow the hemisphere and the climate', () => {
  assert.equal(seasonOfMonth(7, 41.4), 'summer');
  assert.equal(seasonOfMonth(7, -33.9), 'winter');
  assert.equal(seasonOfMonth(4, 41.4), 'mid');
  const c = climateFrom({ time: ['2024-07-01', '2024-01-01', '2024-04-01'], temperature_2m_max: [29, 14, 20], temperature_2m_min: [22, 6, 12] }, 41.4);
  assert.deepEqual(c, { summer: { high: 29, low: 22 }, mid: { high: 20, low: 12 }, winter: { high: 14, low: 6 } });
  assert.equal(climateFrom({ time: ['2024-07-01'], temperature_2m_max: [29], temperature_2m_min: [22] }, 41.4), null, 'a season missing');
  const london = { summer: { high: 22 }, mid: { high: 14 }, winter: { high: 8 } };
  assert.equal(fitsSeason([windbreaker, tee, jeans, sneakers], 'summer', london), true, 'a light jacket in a London summer');
  assert.equal(fitsSeason([windbreaker, tee, jeans, sneakers], 'summer'), false, 'but not in a Barcelona one');
});
