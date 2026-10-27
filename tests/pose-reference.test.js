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
