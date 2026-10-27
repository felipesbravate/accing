import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feetFor } from '../scripts/make-pose-reference.mjs';

const shoes = (description) => [{ category: 'shoes', description }];

test('high heels raise the feet; flats, sneakers, sandals, boots or no shoes keep them flat', () => {
  assert.equal(feetFor(shoes('black patent leather high heels')), 'heels');
  assert.equal(feetFor(shoes('nude stiletto pumps')), 'heels');
  assert.equal(feetFor(shoes('tan block-heeled ankle boots')), 'heels');
  assert.equal(feetFor(shoes('black strappy flat sandals with thin straps')), 'flat');
  assert.equal(feetFor(shoes('black and white low-top canvas lace-up sneakers')), 'flat');
  assert.equal(feetFor(shoes('black patent leather oxford shoes with white soles')), 'flat');
  assert.equal(feetFor([{ category: 'top', description: 'white t-shirt' }]), 'flat');
});

import { poseGeometry } from '../scripts/clean-background.mjs';

test('pose geometry: level feet vs one foot forward, measured from the person mask', () => {
  const w = 100, h = 200;
  const person = (leftBottom, rightBottom) => {
    const m = new Float32Array(w * h);
    for (let y = 10; y < 150; y++) for (let x = 35; x < 65; x++) m[y * w + x] = 1; // body
    for (let y = 150; y <= leftBottom; y++) for (let x = 36; x < 46; x++) m[y * w + x] = 1; // left leg + foot
    for (let y = 150; y <= rightBottom; y++) for (let x = 54; x < 64; x++) m[y * w + x] = 1; // right leg + foot
    return m;
  };
  const level = poseGeometry(person(190, 190), w, h), staggered = poseGeometry(person(190, 184), w, h);
  assert.equal(Math.abs(level.stagger), 0);
  assert.ok(staggered.stagger > 0.02); // left foot nearer the camera (lower in the frame)
  assert.ok(Math.abs(level.gap - staggered.gap) < 0.01);
});
