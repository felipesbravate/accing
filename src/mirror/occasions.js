// The occasion tabs and what each asks the image worker for (the worker's occasion rules read these words:
// scripts/image-test-lib.mjs occasionProfile). Pure, shared by the server and the browser; tested.
export const OCCASION_TABS = [
  { label: 'Casual', occasion: 'a relaxed casual day' },
  { label: 'Office day', occasion: 'an office day' },
  { label: 'Dinner', occasion: 'dinner out' },
  { label: 'Party', occasion: 'a party' },
];

/** The tab a job's occasion text belongs to (morning jobs say "a relaxed weekend day" at weekends). */
export function tabFor(occasion) {
  const t = String(occasion || '').toLowerCase();
  if (/office|work/.test(t)) return 'Office day';
  if (/dinner/.test(t)) return 'Dinner';
  if (/party/.test(t)) return 'Party';
  return 'Casual';
}

/** Today's default tab: office on weekdays, casual at weekends (the worker's morning default, in the same time zone). */
export function defaultTab(date = new Date(), timeZone = 'Europe/Madrid') {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone }).format(date);
  return ['Sat', 'Sun'].includes(day) ? 'Casual' : 'Office day';
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
