import { test } from 'node:test';
import assert from 'node:assert/strict';
import { around, wrap } from '../src/mirror/carousel.js';

test('wrap loops in both directions', () => {
  assert.equal(wrap(-1, 3), 2);
  assert.equal(wrap(3, 3), 0);
  assert.equal(wrap(4, 0), 0);
});
test('around returns previous, current and next', () => {
  assert.deepEqual(around(0, 3), [2, 0, 1]);
  assert.deepEqual(around(2, 3), [1, 2, 0]);
});

import { swipeStep } from '../src/mirror/carousel.js';
test('swipeStep needs a real drag', () => {
  assert.equal(swipeStep(-60), 1);
  assert.equal(swipeStep(60), -1);
  assert.equal(swipeStep(10), 0);
});
