// See and switch off an account's outfit photos (duplicates, test shots), from the Mac.
//   node --env-file=.env.local scripts/outfit-photos.mjs you@example.com            downloads the active ones to look at
//   node --env-file=.env.local scripts/outfit-photos.mjs you@example.com --off=13,15 switches photos #13 and #15 off
//   node --env-file=.env.local scripts/outfit-photos.mjs you@example.com --on=9      switches #9 back on
// Numbers are the same as in scripts/check-looks.mjs (all photos, oldest first). Switching off keeps the file and the
// looks already made; the photo is just no longer read for new looks. Photos land in image-test/outfit-photos/
// (git-ignored, stays on this Mac).
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const nums = (flag) => (args.find((a) => a.startsWith(`--${flag}=`))?.split('=')[1] || '').split(',').map(Number).filter(Boolean);
if (!email) { console.error('Usage: node --env-file=.env.local scripts/outfit-photos.mjs you@example.com [--off=13,15] [--on=9]'); process.exit(1); }
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: u } = await db.from('users').select('id').eq('email', email).single();
if (!u) { console.error('No account for', email); process.exit(1); }
const { data: photos } = await db.from('wardrobe_photos').select('id, path, is_active, created_at').eq('user_id', u.id).order('created_at');

const off = nums('off'), on = nums('on');
for (const [list, active] of [[off, false], [on, true]]) {
  for (const n of list) {
    const p = photos[n - 1];
    if (!p) { console.log(`#${n}: no such photo`); continue; }
    const { error } = await db.from('wardrobe_photos').update({ is_active: active }).eq('id', p.id);
    console.log(error ? `#${n}: ${error.message}` : `#${n} switched ${active ? 'on' : 'off'}`);
    if (!error) p.is_active = active;
  }
}
if (off.length || on.length) {
  console.log(`\nActive outfit photos now: ${photos.filter((p) => p.is_active).length} (new looks read at most 10, the newest).`);
  process.exit(0);
}
const dir = resolve(import.meta.dirname, '..', 'image-test', 'outfit-photos', email.replace(/[^\w.-]+/g, '_'));
await mkdir(dir, { recursive: true });
for (const [i, p] of photos.entries()) {
  if (!p.is_active) continue;
  const { data } = await db.storage.from('wardrobe').download(p.path);
  if (!data) { console.log(`#${i + 1}: could not download`); continue; }
  const file = join(dir, `#${String(i + 1).padStart(2, '0')}-${p.path.split('/').pop()}`);
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
  console.log(`#${i + 1}  ${p.created_at.slice(0, 10)}  ${file}`);
}
console.log(`\nOpen the folder: open "${dir}"`);
