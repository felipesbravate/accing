// The season filter under the tabs ("Today's suggestions", Summer, Mid-season, Winter, All). Pure, shared by the
// server and the browser; tested in tests/seasons.test.js.
// Today's suggestions: today's looks (made for today's occasion and weather). The others look back over every look
// made so far for that tab, judged by the garments' own season tags from the pipeline's reader ("warm": sandals,
// linen, shorts; "cold": wool coat, heavy knit, lined boots; "any"). Looks made before the tags existed count as "any".
import { tabFor } from './occasions.js';

export const SEASON_FILTERS = [
  { label: "Today's suggestions", key: 'today' },
  { label: 'Summer', key: 'summer' },
  { label: 'Mid-season', key: 'mid' },
  { label: 'Winter', key: 'winter' },
  { label: 'All', key: 'all' },
  { label: 'Favorites', key: 'favorites' }, // the looks the person hearted (Figma 192:1652); last in the row and the dropdown
];
export const seasonKey = (label) => SEASON_FILTERS.find((f) => f.label === label)?.key || 'today';

/** The garments of a look as one key: hiding a look hides every look made of the same garments, today's and earlier
 *  ones (Figma 191:1465, "Look hidden"), and the worker no longer makes it (worker/jobs.mjs avoidKeys).
 *  Looks made since 2026-10-31 know which outfit photo each garment came from (items[].photo_id): the key is
 *  "photos:<photo id>/<category> + …", the same however the reader words the garments. Older looks fall back to the
 *  garment descriptions ("black jeans + white tee"), which change when the reader words them differently.
 *  A look without either hides only itself. */
export function comboKey(items, id = '') {
  const list = items || [];
  if (list.length && list.every((x) => x.photo_id && x.category)) {
    return 'photos:' + list.map((x) => `${x.photo_id}/${x.category}`).sort().join(' + ');
  }
  const key = list.map((x) => String(x.description || '').trim().toLowerCase()).filter(Boolean).sort().join(' + ');
  return key || `look:${id}`;
}

/** Does a look (its garments) suit the season? summer: nothing cold-only; winter: nothing warm-only; mid-season:
 *  neither warm-only nor cold-only. */
export function fitsSeason(items, key) {
  const tags = (items || []).map((x) => x.season || 'any');
  if (key === 'summer') return !tags.includes('cold');
  if (key === 'winter') return !tags.includes('warm');
  if (key === 'mid') return !tags.includes('warm') && !tags.includes('cold');
  return true;
}

/** Rows (newest first) → { [tab]: rows } for the filter: per tab, each job's looks together in look order, newest job
 *  first, at most `perTab`. Only transparent cut-outs (.webp) are shown in the ring; hidden
 *  garment combinations (`hidden`, comboKey) are left out; the Favorites filter keeps only `favorites` (look ids). */
export function pickLooks(rows, { key = 'today', perTab = 5, tabs = [], hidden = new Set(), favorites = new Set() } = {}) {
  const out = Object.fromEntries(tabs.map((t) => [t, []]));
  const byJob = new Map();
  for (const r of rows || []) {
    if (!r.generated_image_path?.endsWith('.webp') || !fitsSeason(r.items, key)) continue;
    if (hidden.has(comboKey(r.items, r.id))) continue;              // hidden looks never come back
    if (key === 'favorites' && !favorites.has(r.id)) continue;
    if (!byJob.has(r.job_id)) byJob.set(r.job_id, []);
    byJob.get(r.job_id).push(r);
  }
  for (const list of byJob.values()) {
    for (const r of list.sort((a, b) => a.look_n - b.look_n)) {
      const t = tabFor(r.occasion);
      if (out[t] && out[t].length < perTab) out[t].push(r);
    }
  }
  return out;
}
