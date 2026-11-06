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

test('ringPose keeps the same spacing with many looks (season filters show up to 12)', () => {
  assert.equal(ringPose(1, 12, ring).x, ringPose(1, 5, ring).x);
  assert.equal(ringPose(-1, 12, ring).x, ringPose(-1, 5, ring).x);
});

import { dragTarget, slotPixels } from '../src/mirror/carousel.js';
test('slotPixels: the front look follows the finger 1:1', () => {
  assert.ok(Math.abs(slotPixels(100) - 125.66) < 0.01);
});
test('dragTarget: rounds, flicks carry on, short quick swipes still move one, at most 2', () => {
  const s = 100;
  assert.equal(dragTarget({ pos: 0.3, from: 0, dx: -30, v: 0, slotPx: s }), 1);       // 30 px swipe: one look
  assert.equal(dragTarget({ pos: 0.1, from: 0, dx: -10, v: 0, slotPx: s }), 0);       // a nudge: back
  assert.equal(dragTarget({ pos: 0.6, from: 0, dx: -60, v: 0, slotPx: s }), 1);
  assert.equal(dragTarget({ pos: 0.2, from: 0, dx: -20, v: -1.2, slotPx: s }), 1);    // quick flick
  assert.equal(dragTarget({ pos: -0.2, from: 0, dx: 20, v: 0.8, slotPx: s }), -1);    // flick right: previous
  assert.equal(dragTarget({ pos: 3.4, from: 0, dx: -340, v: -3, slotPx: s }), 2);     // capped
});

test('only looks near the front load their image', async () => {
  const { nearFront } = await import('../src/mirror/carousel.js');
  assert.equal(nearFront(7, 0, 9), true); // a short ring loads everything
  assert.equal(nearFront(4, 0, 40), true);
  assert.equal(nearFront(5, 0, 40), false);
  assert.equal(nearFront(36, 0, 40), true); // round the back
  assert.equal(nearFront(35, 0, 40), false);
});
