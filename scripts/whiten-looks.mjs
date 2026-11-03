// Every look ever made, for every person, on a pure white background (Felipe, 2026-11-03: the app went white).
// Each look has a transparent cut-out (lookN.webp, what the app shows) and a flat image (lookN.png, the one to share or
// save), which was painted on #F9F9FB. This puts each cut-out on white and saves it as the flat image. Looks that only
// ever had a flat image (before 2026-10-30) are cut out first, with the same model as the pipeline, and pointed at the
// cut-out, so they show in the mirror too. New looks are made on white already (scripts/clean-background.mjs).
//   node --env-file=.env.local scripts/whiten-looks.mjs                       what it would do, everyone
//   node --env-file=.env.local scripts/whiten-looks.mjs --apply               do it
//   node --env-file=.env.local scripts/whiten-looks.mjs you@example.com ...   one person only
// Runs on the Mac (the cut-out model is there). No paid API calls. Safe to run again.
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { cleanBackground, createCleaner } from './clean-background.mjs';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--')), apply = args.includes('--apply');
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let userId = null;
if (email) {
  const { data: u } = await db.from('users').select('id').eq('email', email).single();
  if (!u) { console.error('No account for', email); process.exit(1); }
  userId = u.id;
}
const rows = [];
for (let from = 0; ; from += 1000) {
  let q = db.from('outfits').select('id, user_id, generated_image_path, created_at').eq('status', 'ready').not('generated_image_path', 'is', null).order('created_at').range(from, from + 999);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) { console.error(error.message); process.exit(1); }
  rows.push(...data);
  if (data.length < 1000) break;
}
const cut = rows.filter((r) => r.generated_image_path.endsWith('.webp')), flat = rows.filter((r) => r.generated_image_path.endsWith('.png'));
console.log(`${rows.length} look(s)${email ? ` for ${email}` : ', everyone'}: ${cut.length} with a cut-out to put on white, ${flat.length} flat only to cut out first.`);
if (!apply) { console.log('Run again with --apply to do it.'); process.exit(0); }

const download = async (path) => { const { data, error } = await db.storage.from('outfits').download(path); if (error || !data) throw new Error(`download ${path}: ${error?.message}`); return Buffer.from(await data.arrayBuffer()); };
const upload = async (path, bytes, type) => { const { error } = await db.storage.from('outfits').upload(path, bytes, { contentType: type, upsert: true }); if (error) throw new Error(`upload ${path}: ${error.message}`); };
let done = 0, failed = 0;
for (const r of cut) {
  try {
    const white = await sharp(await download(r.generated_image_path)).flatten({ background: '#ffffff' }).png().toBuffer();
    await upload(r.generated_image_path.replace(/\.webp$/, '.png'), white, 'image/png');
    done++; if (done % 25 === 0) console.log(`  ${done} on white…`);
  } catch (e) { failed++; console.log(`  ✗ ${r.id}: ${e.message}`); }
}
if (flat.length) {
  const cleaner = await createCleaner(join(resolve(import.meta.dirname, '..'), 'image-test', 'models'));
  for (const r of flat) {
    try {
      const out = await cleanBackground(cleaner, await download(r.generated_image_path), { background: '#FFFFFF', cutout: true });
      if (!out.cutout) throw new Error('no cut-out made');
      const webp = r.generated_image_path.replace(/\.png$/, '.webp');
      await upload(webp, out.cutout, 'image/webp');
      await upload(r.generated_image_path, out.bytes, 'image/png');
      const { error } = await db.from('outfits').update({ generated_image_path: webp }).eq('id', r.id);
      if (error) throw new Error(error.message);
      done++;
    } catch (e) { failed++; console.log(`  ✗ ${r.id}: ${e.message}`); }
  }
}
console.log(`\n${done} look(s) now on white${failed ? `, ${failed} failed (listed above; run again to retry)` : ''}.`);
