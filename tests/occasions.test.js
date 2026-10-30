import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultTab, startOfToday, tabFor, temperatureOf } from '../src/mirror/occasions.js';
import { occasionProfile } from '../scripts/image-test-lib.mjs';
import { OCCASION_TABS } from '../src/mirror/occasions.js';

test('tabs map to the worker\'s occasion rules and back', () => {
  assert.deepEqual(OCCASION_TABS.map((t) => occasionProfile(t.occasion).name), ['casual', 'work', 'evening', 'evening']);
  for (const t of OCCASION_TABS) assert.equal(tabFor(t.occasion), t.label);
  assert.equal(tabFor('a relaxed weekend day'), 'Casual');
});

test('default tab, temperature and local midnight', () => {
  assert.equal(defaultTab(new Date('2026-10-30T09:00:00Z')), 'Office day');
  assert.equal(defaultTab(new Date('2026-10-31T09:00:00Z')), 'Casual');
  assert.equal(temperatureOf('19°C high, 17°C low'), '19º');
  assert.equal(temperatureOf(null), null);
  assert.equal(startOfToday(new Date('2026-10-30T10:15:00Z')), '2026-10-29T23:00:00.000Z'); // CET, UTC+1
  assert.equal(startOfToday(new Date('2026-07-01T23:30:00Z')), '2026-07-01T22:00:00.000Z'); // 01:30 CEST next day
});
