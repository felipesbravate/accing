import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTrail, upMove } from '../src/ui/nav.js';

test('the trail follows pages forward, a step back pops, a replace swaps', () => {
  let t = [];
  for (const p of ['/', '/profile', '/wardrobe/t-shirts', '/wardrobe/t-shirts/k0']) t = nextTrail(t, p);
  assert.deepEqual(t, ['/', '/profile', '/wardrobe/t-shirts', '/wardrobe/t-shirts/k0']);
  t = nextTrail(t, '/wardrobe/t-shirts'); // back from matching outfits
  assert.deepEqual(t, ['/', '/profile', '/wardrobe/t-shirts']);
  assert.deepEqual(nextTrail(['/', '/settings/email'], '/settings', true), ['/', '/settings']);
});

test('a back arrow goes back only when its parent is the page before; else it replaces (2026-11-09)', () => {
  // Profile → Wardrobe → matching → (back) Wardrobe: the Wardrobe's arrow goes to Profile, not to matching.
  assert.equal(upMove(['/', '/profile', '/wardrobe/t-shirts'], '/profile'), 'back');
  // Opened from a link, or after a redirect: the parent isn't the page before.
  assert.equal(upMove(['/settings/email'], '/settings'), 'replace');
  assert.equal(upMove(['/', '/wardrobe/t-shirts/k0', '/wardrobe/t-shirts'], '/profile'), 'replace');
});
