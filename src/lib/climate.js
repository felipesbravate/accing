// A place's typical weather in each season, for the season filters (src/mirror/seasons.js). Open-Meteo's historical
// archive (ERA5, free, no key), the last five full years. Summer is June–August north of the equator and
// December–February south of it; winter the opposite; mid-season the six months in between.
// A season isn't one number: Barcelona's mid-season runs from 15 °C March days to 25 °C October ones. So each season
// keeps five typical days, one per fifth of its days sorted by afternoon high (each the middle day of its fifth, with
// that day's own low): a look belongs to a season if it suits enough of them (src/mirror/warmth.js).
// Air temperature by default: the UTCI clothing model is fitted on air temperature, and people's choices already
// include their usual humidity and wind. "Feels like" (apparent temperature) is kept too, to compare against your
// labels (scripts/season-labels.mjs); `basis` picks which one the filters use.
// The pure part (climateFrom) is tested in tests/warmth.test.js.

const YEARS = 5;
export const CLIMATE_VERSION = 2;
export const SEASONS = ['summer', 'mid', 'winter'];

/** Barcelona-like seasons, used until the person's location (or its climate) is known. */
export const DEFAULT_CLIMATE = {
  v: CLIMATE_VERSION, basis: 'air',
  summer: { days: [[25, 18], [27, 20], [28, 21], [29, 22], [31, 23]].map(([hi, lo]) => ({ hi, lo })) },
  mid: { days: [[15, 8], [17, 11], [20, 13], [23, 16], [25, 19]].map(([hi, lo]) => ({ hi, lo })) },
  winter: { days: [[11, 4], [13, 5], [14, 7], [15, 8], [17, 10]].map(([hi, lo]) => ({ hi, lo })) },
};

/** Which season a month (1–12) is in at this latitude. */
export function seasonOfMonth(month, lat) {
  const north = !(lat < 0);
  const summer = north ? [6, 7, 8] : [12, 1, 2], winter = north ? [12, 1, 2] : [6, 7, 8];
  return summer.includes(month) ? 'summer' : winter.includes(month) ? 'winter' : 'mid';
}

const r1 = (n) => Math.round(n * 10) / 10;

/** Five typical days of a list of { hi, lo }: the middle day of each fifth, sorted by high. */
export function typicalDays(days, n = 5) {
  const sorted = [...days].sort((a, b) => a.hi - b.hi);
  if (sorted.length < n) return null;
  return Array.from({ length: n }, (_, k) => sorted[Math.floor(((k + 0.5) / n) * sorted.length)]).map((d) => ({ hi: r1(d.hi), lo: r1(d.lo) }));
}

/** Open-Meteo daily arrays → { v, summer: { days, feels }, mid, winter }; null when a season has no data. */
export function climateFrom(daily = {}, lat = 0) {
  const { time = [], temperature_2m_max: max = [], temperature_2m_min: min = [], apparent_temperature_max: amax = [], apparent_temperature_min: amin = [] } = daily;
  const air = { summer: [], mid: [], winter: [] }, feels = { summer: [], mid: [], winter: [] };
  time.forEach((day, i) => {
    const s = seasonOfMonth(Number(String(day).slice(5, 7)), lat);
    if (Number.isFinite(max[i]) && Number.isFinite(min[i])) air[s].push({ hi: max[i], lo: min[i] });
    if (Number.isFinite(amax[i]) && Number.isFinite(amin[i])) feels[s].push({ hi: amax[i], lo: amin[i] });
  });
  const out = { v: CLIMATE_VERSION, basis: 'air' };
  for (const s of SEASONS) {
    const days = typicalDays(air[s]);
    if (!days) return null;
    out[s] = { days, ...(typicalDays(feels[s]) ? { feels: typicalDays(feels[s]) } : {}) };
  }
  return out;
}

/** The typical days of a season by the chosen basis ('air' or 'feels'), falling back to air temperature. Older stored
 *  climates ({ high, low }) become one day. */
export function seasonDays(climate, key) {
  const s = (climate || DEFAULT_CLIMATE)[key];
  if (!s) return null;
  if (climate?.basis === 'feels' && s.feels?.length) return s.feels;
  if (s.days?.length) return s.days;
  return Number.isFinite(s.high) ? [{ hi: s.high, lo: Number.isFinite(s.low) ? s.low : s.high - 8 }] : null;
}

/** The typical seasons at a place, or null if Open-Meteo can't be reached. */
export async function fetchClimate(lat, lon, now = new Date()) {
  const end = now.getUTCFullYear() - 1;
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), start_date: `${end - YEARS + 1}-01-01`, end_date: `${end}-12-31`,
    daily: 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min', timezone: 'auto' });
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}`, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json().catch(() => null);
  const seasons = body?.daily ? climateFrom(body.daily, lat) : null;
  return seasons ? { ...seasons, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, years: `${end - YEARS + 1}–${end}` } : null;
}
