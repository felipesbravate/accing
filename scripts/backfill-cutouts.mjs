// Gives older looks the transparent cut-out the mirror needs. Looks made before 2026-10-30 were saved only as flat
// images (lookN.png, page-colour background); the ring shows only cut-outs (lookN.webp), so those looks were hidden.
// This cuts each one out with the same model as the pipeline (image-test/models, ISNet) and points the look at it.
//   node --env-file=.env.local scripts/backfill-cutouts.mjs you@example.com            what it would do
//   node --env-file=.env.local scripts/backfill-cutouts.mjs you@example.com --apply    do it
// Runs on the Mac (the models are there). No paid API calls.
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { cleanBackground, createCleaner } from './clean-background.mjs';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--')), apply = args.includes('--apply');
if (!email) { console.error('Usage: node --env-file=.env.local scripts/backfill-cutouts.mjs you@example.com [--apply]'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: u } = await db.from('users').select('id').eq('email', email).single();
if (!u) { console.error('No account for', email); process.exit(1); }
const { data: rows } = await db.from('outfits').select('id, generated_image_path, created_at').eq('user_id', u.id).eq('status', 'ready').like('generated_image_path', '%.png').order('created_at');
console.log(`${rows.length} look(s) without a cut-out.${apply ? '' : ' Run again with --apply to cut them out.'}`);
if (!apply || !rows.length) process.exit(0);

const cleaner = await createCleaner(join(resolve(import.meta.dirname, '..'), 'image-test', 'models'));
let done = 0;
for (const r of rows) {
  const { data, error } = await db.storage.from('outfits').download(r.generated_image_path);
  if (error || !data) { console.log(`  ${r.id}: could not download (${error?.message})`); continue; }
  try {
    const out = await cleanBackground(cleaner, Buffer.from(await data.arrayBuffer()), { cutout: true });
    if (!out.cutout) throw new Error('no cut-out made');
    const path = r.generated_image_path.replace(/\.png$/, '.webp');
    const up = await db.storage.from('outfits').upload(path, out.cutout, { contentType: 'image/webp', upsert: true });
    if (up.error) throw new Error(up.error.message);
    const { error: e2 } = await db.from('outfits').update({ generated_image_path: path }).eq('id', r.id);
    if (e2) throw new Error(e2.message);
    done++; console.log(`  ✓ ${r.created_at.slice(0, 16)}  ${path.split('/').slice(-2).join('/')}`);
  } catch (e) { console.log(`  ✗ ${r.id}: ${e.message}`); }
}
console.log(`\n${done} of ${rows.length} looks now have a cut-out and show in the mirror.`);
