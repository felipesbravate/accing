// "Today's suggestions" as an assistant (Felipe, 2026-11-03): at most 5 looks per tab, the ones worth seeing today.
// Pure, shared by the server; tested in tests/suggest.test.js. The other filters (seasons, All, Favorites) still show
// everything, for when the person wants more.
//
// Order: looks made today first (new ones from an upload or the morning run), then looks never seen before, then looks
// not seen for REST_DAYS or more (oldest first). Looks seen in the last REST_DAYS only fill in when nothing fresher is
// left, least recently seen first, so a tab is never empty just because everything was seen this week.
// "Seen": the look was the front look of Today's suggestions for a moment, on an earlier day (look_views, migration
// 010). Seeing it today doesn't move it, so the 5 stay put all day.
// Weather: only looks that suit today's high and low (warmth.js fitsDay, with the person's offset), when the weather is
// known and at least one look suits it.
import { CALIBRATION, fitsDay } from './warmth.js';
import { lookKeys } from './seasons.js';
import { tabFor } from './occasions.js';
import { hiddenIn } from '../lib/hide-scope.js';

export const SUGGESTIONS = 5;
export const REST_DAYS = 7;

/** "19°C high, 12°C low, rain likely" → { hi: 19, lo: 12 }; one temperature → that high, 8 °C cooler at night; null without one. */
export function dayOf(weather) {
  const t = String(weather || '');
  const hi = /(-?\d+(?:\.\d+)?)\s*°?\s*C\s*high/i.exec(t), lo = /(-?\d+(?:\.\d+)?)\s*°?\s*C\s*low/i.exec(t);
  if (hi) return { hi: +hi[1], lo: lo ? +lo[1] : +hi[1] - 8 };
  const any = /(-?\d+(?:\.\d+)?)\s*°?\s*C\b/i.exec(t);
  return any ? { hi: +any[1], lo: +any[1] - 8 } : null;
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** rows: ready looks, newest first. seen: Map of look key → last day seen ('YYYY-MM-DD'). today: 'YYYY-MM-DD'.
 *  since: ISO start of today. Returns { [tab]: rows } with at most `limit` per tab. */
export function suggestLooks(rows, { tabs = [], hidden = new Set(), seen = new Map(), today, since, weather = null, offset = 0, limit = SUGGESTIONS } = {}) {
  const day = dayOf(weather);
  const cal = offset ? { ...CALIBRATION, offset: CALIBRATION.offset + offset } : CALIBRATION;
  const byTab = Object.fromEntries(tabs.map((t) => [t, []]));
  const combos = new Set();
  for (const r of rows || []) {
    if (!r.generated_image_path?.endsWith('.webp')) continue;
    const keys = lookKeys(r.items, r.id);
    const t = tabFor(r.occasion);
    if (hiddenIn(keys, t, hidden)) continue; // hidden everywhere, or for this occasion (src/lib/hide-scope.js)
    if (!byTab[t]) continue;
    const combo = `${t}|${keys[keys.length - 1]}`; // one look per garment combination per tab (the newest)
    if (combos.has(combo)) continue;
    combos.add(combo);
    const last = keys.map((k) => seen.get(k)).filter((d) => d && d < today).sort().pop() || null;
    byTab[t].push({ r, fresh: Boolean(since && r.created_at >= since), last, fits: day ? fitsDay(r.items, day, cal) : true });
  }
  const out = {};
  for (const t of tabs) {
    let list = byTab[t];
    if (day && list.some((x) => x.fits)) list = list.filter((x) => x.fits);
    const rested = (x) => !x.last || daysBetween(x.last, today) >= REST_DAYS;
    // made today, then never seen, then seen longest ago; newest first among equals (the rows come newest first)
    const rank = (x) => (x.fresh ? 0 : !x.last ? 1 : 2);
    const order = (a, b) => rank(a) - rank(b) || (a.last && b.last ? (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) : 0);
    const first = list.filter((x) => x.fresh || rested(x)).sort(order);
    const rest = list.filter((x) => !(x.fresh || rested(x))).sort(order);
    out[t] = [...first, ...(first.length ? [] : rest)].slice(0, limit).map((x) => x.r);
  }
  return out;
}

/** The key a sighting is stored under: the garments' wording when known (twins from duplicate photos count as one),
 *  else the photo key. */
export function seenKey(items, id = '') {
  const keys = lookKeys(items, id);
  return keys[keys.length - 1];
}
