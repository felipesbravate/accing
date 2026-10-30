// Test the worker from the Mac before the app's screens exist: upload a person's photos from
// image-test/inputs/people/<name>/ to your app account, queue a job, wake the worker and wait for the result.
//
//   node --env-file=.env.local worker/enqueue.mjs --email=you@example.com --person=<name> --upload --prepare
//   node --env-file=.env.local worker/enqueue.mjs --email=you@example.com --pick=1
//   node --env-file=.env.local worker/enqueue.mjs --email=you@example.com --looks=3 --occasion="an office day" --weather="mild 20°C"
//
// Needs in .env.local: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_URL, WORKER_SECRET. Looks are downloaded to
// image-test/results/app-<job id>/ so you can open them.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(import.meta.dirname, '..');
const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const need = (k) => { if (!process.env[k]) { console.error(`Add ${k}=… to .env.local`); process.exit(1); } return process.env[k]; };
const db = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
if (!opt.email) { console.error('Pass --email=<your app account email>'); process.exit(1); }

async function userId(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`No app account for ${email}: sign up on the app first`);
}
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
async function put(path, file) {
  const { error } = await db.storage.from('wardrobe').upload(path, await readFile(file), { contentType: MIME[extname(file).toLowerCase()], upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
  return path;
}

const uid = await userId(opt.email);
console.log(`Account ${opt.email}: ${uid}`);

if (opt.upload) {
  const dir = join(ROOT, 'image-test', 'inputs', 'people', String(opt.person || ''));
  if (!opt.person || !existsSync(dir)) throw new Error(`--person=<name> must be a folder in image-test/inputs/people`);
  const files = (await readdir(dir)).filter((f) => MIME[extname(f).toLowerCase()]).sort();
  const pick = (re) => files.find((f) => re.test(f));
  const front = pick(/^face-front\./i), left = pick(/^face-left\./i), right = pick(/^face-right\./i), base = pick(/^base\./i);
  if (!front || !left || !right || !base) throw new Error('The folder needs face-front, face-left, face-right and base photos');
  const photos = files.filter((f) => !/^face-|^base\./i.test(f));
  const update = {
    face_front_path: await put(`${uid}/faces/front${extname(front).toLowerCase()}`, join(dir, front)),
    face_left_path: await put(`${uid}/faces/left${extname(left).toLowerCase()}`, join(dir, left)),
    face_right_path: await put(`${uid}/faces/right${extname(right).toLowerCase()}`, join(dir, right)),
    base_source_path: await put(`${uid}/base-source/base${extname(base).toLowerCase()}`, join(dir, base)),
    base_options: null, base_path: null,
    ...(existsSync(join(dir, 'body.txt')) ? { body_note: (await readFile(join(dir, 'body.txt'), 'utf8')).trim() } : {}),
  };
  const { error: ue } = await db.from('users').update(update).eq('id', uid);
  if (ue) throw new Error(ue.message);
  await db.from('wardrobe_photos').update({ is_active: false }).eq('user_id', uid);
  for (const [i, f] of photos.entries()) {
    const path = await put(`${uid}/photos/${String(i + 1).padStart(2, '0')}-${f.replace(/[^\w.-]+/g, '_')}`, join(dir, f));
    const { error } = await db.from('wardrobe_photos').insert({ user_id: uid, path });
    if (error) throw new Error(error.message);
  }
  console.log(`Uploaded 3 face photos, the base photo and ${photos.length} outfit photo(s).`);
}

if (opt.pick) {
  const { data: u } = await db.from('users').select('base_options').eq('id', uid).single();
  const o = (u?.base_options || [])[Number(opt.pick) - 1];
  if (!o) throw new Error(`No prepared base photo ${opt.pick}: run --prepare first (there are ${(u?.base_options || []).length})`);
  await db.from('users').update({ base_path: o.path }).eq('id', uid);
  console.log(`Base photo ${opt.pick} picked (identity ${o.identity?.toFixed(3)}).`);
}

let job = null;
if (opt.prepare) job = { job_type: 'prepare_base', payload: {} };
else if (opt.looks) job = { job_type: 'make_looks', payload: { looks: Number(opt.looks) || 3, ...(opt.occasion ? { occasion: opt.occasion } : {}), ...(opt.weather ? { weather: opt.weather } : {}), seed: opt.seed, date: new Date().toISOString(), daypart: 'morning' } };
if (!job) process.exit(0);

const { data: created, error: je } = await db.from('generation_jobs').insert({ user_id: uid, status: 'pending', ...job }).select().single();
if (je) throw new Error(je.message);
console.log(`Queued ${job.job_type} job ${created.id}. Waking the worker…`);
const wake = await fetch(new URL('/wake', need('WORKER_URL')), { method: 'POST', headers: { 'x-worker-secret': need('WORKER_SECRET') } }).catch((e) => ({ ok: false, status: e.message }));
console.log(wake.ok ? 'Worker awake.' : `Could not wake the worker (${wake.status}); it will pick the job up when it runs.`);

const t0 = Date.now(), seen = new Set();
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const { data: j } = await db.from('generation_jobs').select('*').eq('id', created.id).single();
  process.stdout.write(`\r${j.status} · ${Math.round((Date.now() - t0) / 1000)} s   `);
  // Looks appear one by one while the job runs (what the app will show).
  if (job.job_type === 'make_looks') {
    const { data: shown } = await db.from('outfits').select('look_n').eq('job_id', created.id).eq('status', 'ready');
    for (const o of shown || []) if (!seen.has(o.look_n)) { seen.add(o.look_n); console.log(`\n  look ${o.look_n} ready after ${Math.round((Date.now() - t0) / 1000)} s`); }
  }
  if (j.status === 'failed') { console.log(`\nFailed: ${j.error_message}`); process.exit(1); }
  if (j.status !== 'completed') continue;
  console.log(`\nDone in ${Math.round((Date.now() - t0) / 1000)} s, ~$${Number(j.cost || 0).toFixed(3)}: ${JSON.stringify(j.result)}`);
  const out = join(ROOT, 'image-test', 'results', `app-${created.id}`);
  await mkdir(out, { recursive: true });
  const paths = job.job_type === 'prepare_base' ? (j.result.base_options || []).map((o) => o.path)
    : ((await db.from('outfits').select('look_n, status, generated_image_path, reasons, retake').eq('job_id', created.id).order('look_n')).data || []).map((o) => {
      if (o.status !== 'ready') console.log(`  look ${o.look_n}: ${o.status} — ${(o.reasons || []).join('; ')}${o.retake ? `\n    → ${o.retake}` : ''}`);
      return o.generated_image_path;
    }).filter(Boolean);
  for (const [i, p] of paths.entries()) {
    const { data } = await db.storage.from('outfits').download(p);
    await writeFile(join(out, job.job_type === 'prepare_base' ? `option-${i + 1}.png` : p.split('/').pop()), Buffer.from(await data.arrayBuffer()));
  }
  console.log(`Saved ${paths.length} image(s) in ${out}${job.job_type === 'prepare_base' ? '\nPick one with --pick=N (1 = the first listed, best identity).' : ''}`);
  break;
}
