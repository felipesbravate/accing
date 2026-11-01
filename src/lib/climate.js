// A place's typical temperature in each season, for the season filters (src/mirror/seasons.js). Open-Meteo's historical
// archive (ERA5, free, no key): the average daily high and low of the last five full years, by season. Summer is
// June–August north of the equator and December–February south of it; mid-season is the four months either side.
// The pure part (climateFrom) is tested in tests/warmth.test.js.

const YEARS = 5;
// Used when the person's location isn't known yet: a temperate city (roughly Barcelona's seasons).
export const DEFAULT_CLIMATE = { summer: { high: 28, low: 20 }, mid: { high: 20, low: 13 }, winter: { high: 14, low: 7 } };

/** Which season a month (1–12) is in at this latitude. */
export function seasonOfMonth(month, lat) {
  const north = !(lat < 0);
  const summer = north ? [6, 7, 8] : [12, 1, 2], winter = north ? [12, 1, 2] : [6, 7, 8];
  return summer.includes(month) ? 'summer' : winter.includes(month) ? 'winter' : 'mid';
}

/** Open-Meteo daily arrays → { summer: { high, low }, mid, winter }, rounded to 0.1 °C; null without data. */
export function climateFrom({ time = [], temperature_2m_max: max = [], temperature_2m_min: min = [] } = {}, lat = 0) {
  const sums = { summer: [0, 0, 0], mid: [0, 0, 0], winter: [0, 0, 0] };
  time.forEach((day, i) => {
    if (!Number.isFinite(max[i]) || !Number.isFinite(min[i])) return;
    const s = sums[seasonOfMonth(Number(String(day).slice(5, 7)), lat)];
    s[0] += max[i]; s[1] += min[i]; s[2] += 1;
  });
  const out = {};
  for (const [k, [hi, lo, n]] of Object.entries(sums)) {
    if (!n) return null;
    out[k] = { high: Math.round((hi / n) * 10) / 10, low: Math.round((lo / n) * 10) / 10 };
  }
  return out;
}

/** The typical seasons at a place, or null if Open-Meteo can't be reached. */
export async function fetchClimate(lat, lon, now = new Date()) {
  const end = now.getUTCFullYear() - 1;
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), start_date: `${end - YEARS + 1}-01-01`, end_date: `${end}-12-31`,
    daily: 'temperature_2m_max,temperature_2m_min', timezone: 'auto' });
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return null;
  const body = await res.json().catch(() => null);
  const seasons = body?.daily ? climateFrom(body.daily, lat) : null;
  return seasons ? { ...seasons, lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100, years: `${end - YEARS + 1}–${end}` } : null;
}
