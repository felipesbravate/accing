import test from 'node:test';
import assert from 'node:assert/strict';
import { newOutfitOutcome, newOutfitToast } from '../src/lib/new-outfit.js';

test('newOutfitOutcome: made as asked, moved to another tab, or none (and why)', () => {
  assert.equal(newOutfitOutcome({ ready: 2, asked: 3 }, 'Work'), null);
  assert.equal(newOutfitOutcome({ ready: 2, asked: 3, occasion: 'an office day' }, 'Work'), null);
  assert.deepEqual(newOutfitOutcome({ ready: 3, asked: 3, occasion: 'a relaxed casual day' }, 'Work'), { movedTo: 'Casual' });
  assert.deepEqual(newOutfitOutcome({ ready: 0, asked: 0, notForThisOccasion: true }, 'Work'), { none: 'not_suited' });
  assert.deepEqual(newOutfitOutcome({ ready: 0, asked: 0, allMade: true }, 'Work'), { none: 'nothing_new' });
  assert.deepEqual(newOutfitOutcome({ ready: 0, asked: 3 }, 'Work'), { none: 'not_made' });
  assert.deepEqual(newOutfitOutcome(null, 'Work'), { none: 'not_made' });
});
test('newOutfitToast says where the looks went', () => {
  assert.equal(newOutfitToast(null, 'Work'), null);
  const moved = newOutfitToast({ movedTo: 'Casual' }, 'Work');
  assert.equal(moved.message, 'Your new outfit doesn’t suit work, so its looks are in Casual.');
  assert.equal(moved.see, 'Casual');
  assert.equal(newOutfitToast({ none: 'not_suited' }, 'Work').type, 'warning');
  assert.equal(newOutfitToast({ none: 'not_made' }, 'Work').retry, true);
});
