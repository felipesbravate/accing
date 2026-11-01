// Calibrate the season filters against your own judgement (src/mirror/warmth.js, src/lib/climate.js).
//
// 1. Label: writes a page of every look you have (image, garments) with Summer / Mid-season / Winter switches.
//      node --env-file=.env.local scripts/season-labels.mjs you@example.com
//    Open image-test/season-labels/index.html, mark the seasons you'd wear each look in (any, several, or none), then
//    "Save labels": your browser downloads season-labels.json. Image links work for 7 days.
// 2. Score: compares the model with your labels, for air and "feels like" temperature, and searches the settings
//    (tolerance, share of days, morning and daytime hours, a personal temperature offset) for the best match.
//      node --env-file=.env.local scripts/season-labels.mjs you@example.com --score=~/Downloads/season-labels.json
//    Prints how often the model agrees with you, the best settings, and the looks it still gets wrong. Changes nothing.
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local. Your looks stay on this Mac (git-ignored folder).
import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { CALIBRATION, lookClo, shareOfDays } from '../src/mirror/warmth.js';
import { DEFAULT_CLIMATE, SEASONS, fetchClimate, seasonDays } from '../src/lib/climate.js';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const scoreArg = args.find((a) => a.startsWith('--score='))?.slice(8);
if (!email) { console.error('Usage: node --env-file=.env.local scripts/season-labels.mjs you@example.com [--score=labels.json]'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = resolve('image-test/season-labels');
const NAMES = { summer: 'Summer', mid: 'Mid-season', winter: 'Winter' };

const { data: u, error } = await db.from('users').select('*').eq('email', email).single();
if (error || !u) { console.error('No account for', email, error?.message || ''); process.exit(1); }
const { data: rows } = await db.from('outfits').select('id, occasion, items, generated_image_path, created_at')
  .eq('user_id', u.id).eq('status', 'ready').order('created_at', { ascending: false }).limit(500);
// One per garment combination (the mirror shows one), cut-outs only.
const seen = new Set();
const looks = (rows || []).filter((r) => r.generated_image_path?.endsWith('.webp')).filter((r) => {
  const k = (r.items || []).map((x) => `${x.category}:${x.description}`).sort().join('|');
  if (seen.has(k)) return false; seen.add(k); return true;
});

if (!scoreArg) await label(); else await score(scoreArg.replace(/^~/, homedir()));

async function label() {
  const { data: signed } = await db.storage.from('outfits').createSignedUrls(looks.map((l) => l.generated_image_path), 7 * 86400);
  const url = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const cards = looks.map((l, i) => `
  <article data-id="${l.id}">
    <img src="${esc(url.get(l.generated_image_path))}" alt="" loading="lazy">
    <div><p class="n">${i + 1} · ${esc(l.occasion)}</p><ul>${(l.items || []).map((x) => `<li>${esc(x.description)}</li>`).join('')}</ul>
    <p class="s">${SEASONS.map((s) => `<label><input type="checkbox" value="${s}"> ${NAMES[s]}</label>`).join('')}</p></div>
  </article>`).join('');
  await mkdir(OUT, { recursive: true });
  await writeFile(resolve(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Season labels</title>
<style>body{font:15px system-ui;margin:24px;max-width:1100px}article{display:flex;gap:16px;border-bottom:1px solid #ddd;padding:12px 0}
img{width:140px;height:210px;object-fit:contain;background:#f5f5f9}ul{margin:4px 0;padding-left:18px;color:#444}.n{margin:0;font-weight:600}
.s label{margin-right:16px}button{position:sticky;top:8px;font:inherit;padding:8px 16px;background:#8f56ce;color:#fff;border:0;border-radius:8px}</style>
<h1>In which seasons would you wear each look?</h1><p>Tick every season that fits (in your city), or none. Then save.</p>
<button id="save">Save labels</button>${cards}
<script>
const KEY='season-labels';const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
for(const a of document.querySelectorAll('article')){for(const c of a.querySelectorAll('input')){c.checked=(saved[a.dataset.id]||[]).includes(c.value);
c.onchange=()=>{saved[a.dataset.id]=[...a.querySelectorAll('input:checked')].map(x=>x.value);localStorage.setItem(KEY,JSON.stringify(saved));};}}
document.getElementById('save').onclick=()=>{const all={};for(const a of document.querySelectorAll('article'))all[a.dataset.id]=[...a.querySelectorAll('input:checked')].map(x=>x.value);
const b=new Blob([JSON.stringify(all,null,1)],{type:'application/json'});const l=document.createElement('a');l.href=URL.createObjectURL(b);l.download='season-labels.json';l.click();};
</script>`);
  console.log(`${looks.length} looks. Open ${resolve(OUT, 'index.html')}, tick the seasons, then "Save labels".`);
  console.log(`Then: node --env-file=.env.local scripts/season-labels.mjs ${email} --score=~/Downloads/season-labels.json`);
}

async function score(file) {
  const labels = JSON.parse(await readFile(file, 'utf8'));
  const labelled = looks.filter((l) => Array.isArray(labels[l.id]));
  if (!labelled.length) { console.error('No labels for these looks in', file); process.exit(1); }
  let climate = u.climate?.v === 2 ? u.climate : null;
  if (!climate && Number.isFinite(u.home_lat)) climate = await fetchClimate(u.home_lat, u.home_lon);
  if (!climate) { console.log('No climate for your home (location unknown or Open-Meteo unreachable): using the Barcelona-like default.'); climate = DEFAULT_CLIMATE; }
  else console.log(`Climate at ${climate.lat}, ${climate.lon} (${climate.years || 'default'}):`);
  for (const s of SEASONS) console.log(`  ${NAMES[s].padEnd(11)} air ${climate[s].days.map((d) => `${d.hi}/${d.lo}`).join('  ')}${climate[s].feels ? `   feels ${climate[s].feels.map((d) => `${d.hi}/${d.lo}`).join('  ')}` : ''}`);

  // Agreement: every (look, season) pair is one decision, yes or no.
  const agree = (cal, basis) => {
    let ok = 0, n = 0; const wrong = [];
    for (const l of labelled) for (const s of SEASONS) {
      const days = seasonDays({ ...climate, basis }, s);
      const model = shareOfDays(l.items, days, cal) >= cal.share - 1e-9, you = labels[l.id].includes(s);
      n += 1; if (model === you) ok += 1; else wrong.push({ l, s, model });
    }
    return { rate: ok / n, wrong };
  };
  const now = agree(CALIBRATION, climate.basis || 'air');
  console.log(`\n${labelled.length} looks labelled. Today's settings agree with you on ${(now.rate * 100).toFixed(0)}% of look × season decisions.`);

  let best = { rate: -1 };
  const bases = climate.summer?.feels ? ['air', 'feels'] : ['air'];
  for (const basis of bases) for (const tolerance of [0.1, 0.15, 0.2, 0.25, 0.3, 0.35]) for (const share of [0.2, 0.4, 0.6])
    for (const morning of [0.2, 0.4]) for (const daytime of [0.5, 0.7, 0.9]) for (const offset of [-4, -2, 0, 2, 4]) {
      const cal = { ...CALIBRATION, tolerance, share, morning, daytime, offset };
      const r = agree(cal, basis);
      // Ties go to the setting closest to the published model (offset 0, tolerance near its standard error).
      const cost = Math.abs(offset) / 10 + Math.abs(tolerance - 0.2);
      if (r.rate > best.rate + 1e-9 || (Math.abs(r.rate - best.rate) < 1e-9 && cost < best.cost)) best = { ...r, cal, basis, cost };
    }
  const { tolerance, share, morning, daytime, offset } = best.cal;
  console.log(`Best match: ${(best.rate * 100).toFixed(0)}% with basis "${best.basis}", tolerance ${tolerance}, share ${share}, morning ${morning}, daytime ${daytime}, offset ${offset} °C.`);
  console.log('Still different from you:');
  for (const { l, s, model } of best.wrong) {
    console.log(`  ${NAMES[s].padEnd(11)} model ${model ? 'yes' : 'no '} you ${model ? 'no ' : 'yes'}  ${lookClo(l.items).toFixed(2)} clo  ${(l.items || []).map((x) => x.description).join(' | ').slice(0, 120)}`);
  }
  console.log('\nSend this output to Claude to update src/mirror/warmth.js (CALIBRATION) and the basis.');
}
