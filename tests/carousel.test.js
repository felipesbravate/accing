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

import { easeInOutCubic, ringOffset, ringPose } from '../src/mirror/carousel.js';
const ring = { radius: 400, backScale: 0.6, lift: 100 };
test('ringOffset takes the short way round', () => {
  assert.equal(ringOffset(0, 0, 5), 0);
  assert.equal(ringOffset(4, 0, 5), -1);
  assert.equal(ringOffset(1, 0, 5), 1);
  assert.equal(ringOffset(0, 4.5, 5), 0.5);
});
test('ringPose: front is full size and centred, sides are smaller and higher, back is smallest', () => {
  const front = ringPose(0, 5, ring), side = ringPose(1, 5, ring), back = ringPose(2.5, 5, ring);
  assert.equal(front.x, 0); assert.equal(front.scale, 1); assert.equal(front.y === 0 || Object.is(front.y, -0), true);
  assert.ok(side.x > 350 && side.scale < 1 && side.y < 0 && side.z < front.z);
  assert.ok(Math.abs(back.x) < 1e-9 && Math.abs(back.scale - 0.6) < 1e-9 && back.z === 0);
  assert.equal(Math.round(ringPose(-1, 5, ring).x), -Math.round(side.x));
});
test('ringPose spreads 3 looks as if there were 5', () => {
  assert.equal(ringPose(1, 3, ring).x, ringPose(1, 5, ring).x);
});
test('easeInOutCubic starts at 0, ends at 1, passes the middle', () => {
  assert.equal(easeInOutCubic(0), 0); assert.equal(easeInOutCubic(1), 1); assert.equal(easeInOutCubic(0.5), 0.5);
});
test('with 3 looks the one switching sides is invisible while it switches', () => {
  assert.equal(ringPose(1, 3, ring).opacity, 1);
  assert.equal(ringPose(1.5, 3, ring).opacity, 0);
  assert.equal(ringPose(2, 5, ring).opacity, 1);
});

import { ringVisibility } from '../src/mirror/carousel.js';
test('ringVisibility: front full, sides 68%, back 44%, smooth in between', () => {
  const v = { side: 0.68, back: 0.44 };
  assert.equal(ringVisibility(0, v), 1);
  assert.equal(ringVisibility(-1, v), 0.68);
  assert.equal(ringVisibility(2, v), 0.44);
  assert.equal(ringVisibility(2.5, v), 0.44);
  assert.ok(Math.abs(ringVisibility(0.5, v) - 0.84) < 1e-9);
});

import { ringPresence } from '../src/mirror/carousel.js';
test('ringPresence keeps 3 looks on screen and fades the next one in from the back', () => {
  assert.equal(ringPresence(0), 1);
  assert.equal(ringPresence(-1), 1);
  assert.equal(ringPresence(1.5), 0.5);
  assert.equal(ringPresence(2), 0);
  assert.equal(ringPresence(2, 2), 1);
});
