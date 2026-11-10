// Why a look is (or isn't) under Summer / Mid-season / Winter, for one account. Read-only.
//   node --env-file=.env.local scripts/season-why.mjs you@example.com [tab]     (tab: Casual, Work, Dinner, Party)
// Prints the climate and warmth offset the app uses, then each look: its insulation (clo) and, per season, how many of
// the season's 5 typical days it suits (it needs CALIBRATION.share of them). Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';
import { CALIBRATION, fitsDay, lookClo } from '../src/mirror/warmth.js';
import { fitsSeason } from '../src/mirror/seasons.js';
import { DEFAULT_CLIMATE, SEASONS, seasonDays } from '../src/lib/climate.js';
import { tabFor } from '../src/mirror/occasions.js';

const [email, tab = 'Casual'] = process.argv.slice(2);
if (!email) { console.error('Usage: node --env-file=.env.local scripts/season-why.mjs you@example.com [tab]'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: u, error } = await db.from('users').select('*').eq('email', email).single();
if (error || !u) { console.error('No account for', email, error?.message || ''); process.exit(1); }
const climate = u.climate?.v === 2 ? u.climate : null;
const offset = Number(u.warmth_offset) || 0;
console.log(`Home: ${u.home_lat ?? '?'}, ${u.home_lon ?? '?'}${u.home_city ? ` (${u.home_city})` : ''}`);
console.log(`Climate: ${climate ? `stored (${climate.years}, basis ${climate.basis || 'air'})` : 'NOT stored: the Barcelona-like default is used'}`);
for (const s of SEASONS) console.log(`  ${s.padEnd(6)} ${seasonDays(climate || DEFAULT_CLIMATE, s).map((d) => `${d.hi}/${d.lo}`).join('  ')}`);
console.log(`Warmth offset: ${offset > 0 ? '+' : ''}${offset} °C${offset ? ` (from "too ${offset > 0 ? 'warm' : 'cold'}" when hiding looks)` : ''}`);
const cal = { ...CALIBRATION, offset: CALIBRATION.offset + offset };
const need = Math.ceil(CALIBRATION.share * 5);

const { data: rows } = await db.from('outfits').select('id, occasion, items, generated_image_path, created_at')
  .eq('user_id', u.id).eq('status', 'ready').order('created_at', { ascending: false }).limit(300);
const seen = new Set();
const looks = (rows || []).filter((r) => r.generated_image_path?.endsWith('.webp') && tabFor(r.occasion) === tab).filter((r) => {
  const k = (r.items || []).map((x) => x.description).sort().join('|'); if (seen.has(k)) return false; seen.add(k); return true;
});
console.log(`\n${looks.length} ${tab} looks (a season needs ${need} of 5 days):`);
for (const l of looks) {
  const per = SEASONS.map((s) => { const n = seasonDays(climate || DEFAULT_CLIMATE, s).filter((d) => fitsDay(l.items, d, cal)).length; return `${s} ${n}/5${fitsSeason(l.items, s, climate || DEFAULT_CLIMATE, offset) ? ' ✓' : '  '}`; });
  console.log(`  ${lookClo(l.items).toFixed(2)} clo  ${per.join('  ')}  ${(l.items || []).map((x) => `${x.description} [${x.category}${x.season && x.season !== 'any' ? `, ${x.season}` : ''}]`).join(' | ').slice(0, 160)}`);
}
