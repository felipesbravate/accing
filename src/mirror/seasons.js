// The season filter under the tabs ("Today's suggestions", Summer, Mid-season, Winter, All). Pure, shared by the
// server and the browser; tested in tests/seasons.test.js.
// Today's suggestions: today's looks (made for today's occasion and weather). The others look back over every look
// made so far for that tab that is comfortable at the typical temperature of that season where the person lives
// (fitsSeason below).
import { tabFor } from './occasions.js';
import { hiddenIn } from '../lib/hide-scope.js';
import { BARE_LEGS_MIN, CALIBRATION, bareLegs, fitsDays } from './warmth.js';
import { DEFAULT_CLIMATE, seasonDays } from '../lib/climate.js';

export const SEASON_FILTERS = [
  { label: "Today's suggestions", key: 'today' },
  { label: 'All', key: 'all' }, // second (Figma 226:2161, 2026-11-06)
  { label: 'Summer', key: 'summer' },
  { label: 'Mid-season', key: 'mid' },
  { label: 'Winter', key: 'winter' },
  { label: 'Favorites', key: 'favorites' }, // the looks the person hearted (Figma 192:1652); last in the row and the dropdown
];
export const seasonKey = (label) => SEASON_FILTERS.find((f) => f.label === label)?.key || 'today';

/** The garments of a look as one key: hiding a look hides every look made of the same garments, today's and earlier
 *  ones (Figma 191:1465, "Look hidden"), and the worker no longer makes it (worker/jobs.mjs avoidKeys).
 *  Looks made since 2026-10-31 know which outfit photo each garment came from (items[].photo_id): the key is
 *  "photos:<photo id>/<category> + …", the same however the reader words the garments. Older looks fall back to the
 *  garment descriptions ("black jeans + white tee"), which change when the reader words them differently.
 *  A look without either hides only itself. */
export function descKey(items) {
  return (items || []).map((x) => String(x.description || '').trim().toLowerCase()).filter(Boolean).sort().join(' + ');
}

/** Both keys of a look: by photos and by garment wording. A hide stores both (src/server/looks.js markLook) and a look
 *  is hidden if either matches: the same garments photographed twice (two photos of the same hoodie) have different
 *  photo keys but the same wording (Felipe, 2026-11-01: looks hidden on desktop came back on mobile). */
export function lookKeys(items, id = '') {
  const keys = [comboKey(items, id)], d = descKey(items);
  if (d && !keys.includes(d)) keys.push(d);
  return keys;
}

export function comboKey(items, id = '') {
  const list = items || [];
  if (list.length && list.every((x) => x.photo_id && x.category)) {
    return 'photos:' + list.map((x) => `${x.photo_id}/${x.category}`).sort().join(' + ');
  }
  return descKey(list) || `look:${id}`;
}

/** Does a look suit the season? Its insulation (src/mirror/warmth.js) against the typical days of that season where
 *  the person lives (`climate`, src/lib/climate.js; Barcelona-like until their location is known). "all" (and anything
 *  else) keeps every look. `offset` (°C) is the person's own, from "too warm" / "too cold" when hiding looks. */
export function fitsSeason(items, key, climate = DEFAULT_CLIMATE, offset = 0) {
  const days = seasonDays(climate || DEFAULT_CLIMATE, key);
  if (!days) return true;
  // Shorts and skirts are summer clothes wherever summer is warm (warmth.js bareLegs), whatever the top.
  if (key === 'summer' && bareLegs(items) && [...days].sort((x, y) => x.hi - y.hi)[Math.floor(days.length / 2)].hi >= BARE_LEGS_MIN) return true;
  return fitsDays(items, days, offset ? { ...CALIBRATION, offset: CALIBRATION.offset + offset } : CALIBRATION);
}

/** Rows (newest first) → { [tab]: rows } for the filter: per tab, each job's looks together in look order, newest job
 *  first, at most `perTab`. Only transparent cut-outs (.webp) are shown in the ring; hidden
 *  garment combinations (`hidden`, comboKey) are left out; the Favorites filter keeps only `favorites` (look ids). */
export function pickLooks(rows, { key = 'today', perTab = 5, tabs = [], hidden = new Set(), favorites = new Set(), unique = false, climate = DEFAULT_CLIMATE, offset = 0 } = {}) {
  const out = Object.fromEntries(tabs.map((t) => [t, []]));
  const byJob = new Map();
  for (const r of rows || []) {
    if (!r.generated_image_path?.endsWith('.webp') || !fitsSeason(r.items, key, climate, offset)) continue;
    if (hiddenIn(lookKeys(r.items, r.id), tabFor(r.occasion), hidden)) continue; // hidden looks never come back (in their tab, or anywhere)
    if (key === 'favorites' && !favorites.has(r.id)) continue;
    if (!byJob.has(r.job_id)) byJob.set(r.job_id, []);
    byJob.get(r.job_id).push(r);
  }
  // unique: one look per garment combination per tab (the newest), so a combination made on several days shows once.
  const seen = new Set();
  for (const list of byJob.values()) {
    for (const r of list.sort((a, b) => a.look_n - b.look_n)) {
      const t = tabFor(r.occasion);
      if (unique) { const k = `${t}|${comboKey(r.items, r.id)}`; if (seen.has(k)) continue; seen.add(k); }
      if (out[t] && out[t].length < perTab) out[t].push(r);
    }
  }
  return out;
}
