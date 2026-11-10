// The occasion tabs and what each asks the image worker for (the worker's occasion rules read these words:
// scripts/image-test-lib.mjs occasionProfile). Pure, shared by the server and the browser; tested.
export const OCCASION_TABS = [
  { label: 'Casual', occasion: 'a relaxed casual day' },
  { label: 'Work', occasion: 'an office day' }, // "Work" everywhere since 2026-11-10 (was "Office day"; the occasion text the image model gets is unchanged)
  { label: 'Dinner', occasion: 'dinner out' },
  { label: 'Party', occasion: 'a party' },
];

// "All outfits" (Figma 226:2208, 226:2161): every occasion's looks together, under the same season filters. It is not an
// occasion: nothing is made "for" it, so asking for looks or adding an outfit from it uses today's default occasion.
export const ALL_OUTFITS = 'All outfits';
export const MENU_TABS = [{ label: ALL_OUTFITS }, ...OCCASION_TABS];

/** The occasion tabs' looks as one list for "All outfits": taken in turn from each tab (each newest first), so one
 *  occasion doesn't fill the start, and a garment combination met twice is kept once. Making / loading if any tab is;
 *  failed only if nothing is there and a tab failed. */
export function mergeTabs(tabs = {}) {
  const lists = OCCASION_TABS.map((t) => tabs[t.label] && { ...tabs[t.label], label: t.label }).filter(Boolean);
  const looks = [], seen = new Set();
  for (let i = 0; lists.some((t) => i < (t.looks?.length || 0)); i += 1) {
    for (const t of lists) {
      const l = t.looks?.[i];
      if (!l) continue;
      const k = l.combo || l.id;
      if (seen.has(k) || seen.has(l.id)) continue;
      seen.add(k); seen.add(l.id); looks.push(l.tab ? l : { ...l, tab: t.label });
    }
  }
  const making = lists.some((t) => t.making), loading = lists.some((t) => t.loading);
  const failed = !looks.length && !making ? lists.find((t) => t.failed)?.failed || null : null;
  return { looks, making, loading, ...(failed ? { failed } : {}) };
}

// The tab an occasion text belongs to lives in src/lib (the worker needs it too).
export { tabFor } from '../lib/hide-scope.js';

/** Today's default tab: office on weekdays, casual at weekends (the worker's morning default, in the same time zone). */
export function defaultTab(date = new Date(), timeZone = 'Europe/Madrid') {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone }).format(date);
  return ['Sat', 'Sun'].includes(day) ? 'Casual' : 'Work';
}

/** The day's sky from the weather text ("…, rain likely" / "…, snow" / "…, cloudy"), for the weather icon:
 *  'snow' | 'rain' | 'cloud' | null (clear, or no forecast). "A chance of rain" is not rain. */
export function conditionOf(weather) {
  const t = String(weather || '').toLowerCase();
  if (/snow/.test(t)) return 'snow';
  if (/rain likely|\brain\b(?!.*chance)|drizzle|shower|storm/.test(t) && !/chance of rain/.test(t)) return 'rain';
  if (/cloud|overcast|fog/.test(t)) return 'cloud';
  return null;
}

/** The icon next to the temperature: rain, snow or cloud when the forecast says so, else sun by day and moon at night. */
export function weatherIcon(condition, night) {
  return { snow: 'cloud-snow', rain: 'cloud-drizzle', cloud: 'cloud' }[condition] || (night ? 'moon' : 'sun');
}

/** "19°C high, 12°C low, rain likely" → "19º". */
export function temperatureOf(weather) {
  const m = /(-?\d+)\s*°?\s*C/i.exec(String(weather || ''));
  return m ? `${m[1]}º` : null;
}

/** Start of today in a time zone, as an ISO string (looks are "today's" from local midnight). */
export function startOfToday(date = new Date(), timeZone = 'Europe/Madrid') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  const offset = asUtc - Math.floor(date.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset).toISOString();
}
