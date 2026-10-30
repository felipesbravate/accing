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
];
export const seasonKey = (label) => SEASON_FILTERS.find((f) => f.label === label)?.key || 'today';

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
 *  first, at most `perTab`. Only transparent cut-outs (.webp) are shown in the ring. */
export function pickLooks(rows, { key = 'today', perTab = 5, tabs = [] } = {}) {
  const out = Object.fromEntries(tabs.map((t) => [t, []]));
  const byJob = new Map();
  for (const r of rows || []) {
    if (!r.generated_image_path?.endsWith('.webp') || !fitsSeason(r.items, key)) continue;
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
