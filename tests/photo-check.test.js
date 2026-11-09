import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outfitVerdict } from '../src/server/photo-check.js';

test('outfit photos: clothes alone are fine, two people or no clothes are left out', () => {
  assert.equal(outfitVerdict({ people: 0, clothes: true }), null); // just the shoes (2026-11-09)
  assert.equal(outfitVerdict({ people: 1, clothes: true }), null);
  assert.equal(outfitVerdict({ people: 2, clothes: true }), 'more_than_one_person');
  assert.equal(outfitVerdict({ people: 0, clothes: false }), 'no_clothes');
  assert.equal(outfitVerdict(null), null); // no check: use it
});
