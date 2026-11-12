// What became of a new outfit photo's looks (generation_jobs.result of a make_looks job with include_path), so the
// mirror can say it instead of going quiet. Before 2026-11-12 a photo whose garments suited none of the open tab (a
// sweater on Work) ended with no looks and no word, and never reached the Wardrobe. Pure; tests/new-outfit.test.js.
import { tabFor } from './hide-scope.js';

/** result: { ready, asked, occasion?, notForThisOccasion?, allMade? }; asked: the tab it was asked for.
 *  → { movedTo: tab } (made for another tab), { none: 'not_suited' | 'nothing_new' | 'not_made' }, or null (made as asked). */
export function newOutfitOutcome(result, asked) {
  const r = result || {};
  if (!r.ready) return { none: r.notForThisOccasion ? 'not_suited' : r.allMade ? 'nothing_new' : 'not_made' };
  const moved = r.occasion ? tabFor(r.occasion) : null;
  return moved && moved !== asked ? { movedTo: moved } : null;
}

/** The mirror's toast for it ({ type, message, retry, see }), or null. */
export function newOutfitToast(outcome, asked) {
  if (!outcome) return null;
  if (outcome.movedTo) return { type: 'default', message: `Your new outfit doesn’t suit ${asked.toLowerCase()}, so its looks are in ${outcome.movedTo}.`, see: outcome.movedTo };
  if (outcome.none === 'not_suited') return { type: 'warning', message: 'Your new outfit doesn’t suit any occasion yet, so no looks were made. It’s in your wardrobe.' };
  if (outcome.none === 'nothing_new') return { type: 'default', message: 'Every look your new outfit can make is already here.' };
  return { type: 'negative', message: 'Couldn’t make looks with your new outfit.', retry: true };
}
