import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampIndex, indexFromScroll } from '../src/mirror/carousel.js';

test('clampIndex keeps the index inside the list', () => {
  assert.equal(clampIndex(-1, 3), 0);
  assert.equal(clampIndex(5, 3), 2);
  assert.equal(clampIndex(1, 0), 0);
});
test('indexFromScroll picks the nearest card', () => {
  assert.equal(indexFromScroll(0, 300, 16, 3), 0);
  assert.equal(indexFromScroll(316, 300, 16, 3), 1);
  assert.equal(indexFromScroll(5000, 300, 16, 3), 2);
});
