// Server-only: where the person lives, for the morning weather (worker) and the season filters (their city's typical
// summer, mid-season and winter). Felipe, 2026-11-01: automatic, from the IP address. Vercel adds the visitor's
// approximate location to every request (x-vercel-ip-latitude / -longitude / -city / -timezone): no permission prompt,
// city-level. It is saved once, the first time it's missing; travelling doesn't move "home". Never import from client code.
import { headers } from 'next/headers';
import { CLIMATE_VERSION, fetchClimate } from '../lib/climate.js';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

/** The request's IP location, or null (local development, or a host that doesn't send it). */
export async function ipLocation() {
  const h = await headers();
  const lat = num(h.get('x-vercel-ip-latitude')), lon = num(h.get('x-vercel-ip-longitude'));
  if (lat == null || lon == null) return null;
  const city = h.get('x-vercel-ip-city');
  return { lat, lon, timezone: h.get('x-vercel-ip-timezone') || null, city: city ? decodeURIComponent(city) : null };
}

/** Saves the IP location as home when the person has none. `profile` is their users row ('*'). Best effort. */
export async function rememberLocation(sb, userId, profile) {
  if (!profile || (Number.isFinite(profile.home_lat) && Number.isFinite(profile.home_lon))) return profile;
  const at = await ipLocation().catch(() => null);
  if (!at) return profile;
  const change = { home_lat: at.lat, home_lon: at.lon, ...(at.timezone && !profile.home_timezone ? { home_timezone: at.timezone } : {}),
    ...('home_city' in profile && at.city ? { home_city: at.city } : {}) };
  const { error } = await sb.from('users').update(change).eq('id', userId);
  return error ? profile : { ...profile, ...change };
}

/** The person's typical seasons (src/lib/climate.js), worked out once per home and kept in users.climate (migration
 *  008). null until the location is known or if Open-Meteo can't be reached; the filters then use a temperate default. */
export async function climateFor(sb, userId, profile) {
  if (!profile || !Number.isFinite(profile.home_lat) || !Number.isFinite(profile.home_lon)) return null;
  const kept = profile.climate;
  const near = (a, b) => Math.abs(a - b) < 0.5; // about 50 km: the same climate
  if (kept?.v === CLIMATE_VERSION && near(kept.lat, profile.home_lat) && near(kept.lon, profile.home_lon)) return kept;
  const fresh = await fetchClimate(profile.home_lat, profile.home_lon);
  // A basis picked after calibrating ('feels') carries over to the new climate.
  const climate = fresh && kept?.basis ? { ...fresh, basis: kept.basis } : fresh;
  if (climate && 'climate' in profile) await sb.from('users').update({ climate }).eq('id', userId);
  return climate;
}
