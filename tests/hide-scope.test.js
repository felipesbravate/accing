import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentCombo, hiddenIn, scopedEverywhere, scopedKey, scopeOf, tabFor } from '../src/lib/hide-scope.js';
import { avoidKeys } from '../worker/jobs.mjs';

test('a look hidden for one occasion stays in the others; hidden everywhere it is gone from all', () => {
  const keys = ['photos:a/top + photos:b/bottom', 'black tee + jeans'];
  const forWork = new Set([scopedKey('Work', keys[0])]);
  assert.equal(hiddenIn(keys, 'Work', forWork), true);
  assert.equal(hiddenIn(keys, 'Casual', forWork), false);
  const everywhere = new Set([keys[1]]);
  assert.equal(hiddenIn(keys, 'Casual', everywhere), true);
  assert.equal(hiddenIn(keys, 'Party', everywhere), true);
});

test('stored combos read back with their tab', () => {
  assert.deepEqual(scopeOf(scopedKey('Dinner', 'photos:a/top')), { tab: 'Dinner', key: 'photos:a/top' });
  assert.deepEqual(scopeOf('photos:a/top'), { tab: null, key: 'photos:a/top' });
  assert.equal(tabFor('an office day'), 'Work');
  assert.equal(tabFor('a relaxed weekend day'), 'Casual');
});

test('the worker avoids a combination hidden for an occasion only when making looks for that occasion', () => {
  const ids = ['p1', 'p2'];
  const stored = [scopedKey('Work', 'photos:p1/top + p2/bottom'), 'photos:p2/top'];
  assert.deepEqual(avoidKeys(stored, ids, 'Work').sort(), ['0/top + 1/bottom', '1/top'].sort());
  assert.deepEqual(avoidKeys(stored, ids, 'Casual'), ['1/top']);
});

test('a look hidden for "Office day" stays hidden for Work after the rename (2026-11-10)', () => {
  const old = 'tab:Office day|photos:p1/top';
  assert.equal(currentCombo(old), scopedKey('Work', 'photos:p1/top'));
  assert.equal(hiddenIn(['photos:p1/top'], 'Work', new Set([currentCombo(old)])), true);
  assert.deepEqual(scopeOf(old), { tab: 'Work', key: 'photos:p1/top' });
  assert.ok(scopedEverywhere(['photos:p1/top'], ['Work']).includes(old)); // unhide clears it too
});
