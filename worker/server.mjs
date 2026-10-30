// Accing image worker (Fly.io). Takes jobs from Supabase (public.generation_jobs) one at a time, runs the version 1
// pipeline (scripts/image-test.mjs) on the person's photos from Storage, uploads the results and writes them back.
//
// Waking: the app calls POST /wake (header x-worker-secret). Fly starts the stopped machine for that request; the
// worker then works through the queue and exits after IDLE_EXIT_MINUTES without jobs, which stops the machine, so an
// idle worker costs only its disk. Secrets (set with `fly secrets set`, never in the repo): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, GEMINI_API_KEY, WORKER_SECRET.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { baseOptions, defaultOccasion, inputsFor, outfitRows, pipelineArgs, weatherText } from './jobs.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`Missing secret ${k} (fly secrets set ${k}=…)`); return v; };
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'WORKER_SECRET']) env(k);
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const IDLE_MS = (Number(process.env.IDLE_EXIT_MINUTES) || 10) * 60_000;
const PORT = Number(process.env.PORT) || 8080;
const log = (...a) => console.log(new Date().toISOString(), ...a);

let lastWork = Date.now(), busy = false, kick = null;

async function download(bucket, path) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error) throw new Error(`Could not read ${bucket}/${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}
async function upload(bucket, path, bytes) {
  const contentType = path.endsWith('.webp') ? 'image/webp' : 'image/png';
  const { error } = await db.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Could not save ${bucket}/${path}: ${error.message}`);
  return path;
}

/** Runs the pipeline as a child process (the same code as `npm run image-test`), streaming its log. */
function runPipeline(args, onLook = null) {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, [join(ROOT, 'scripts', 'image-test.mjs'), ...args], { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (d) => { const s = d.toString(); tail = (tail + s).slice(-4000); process.stdout.write(s); };
    let buf = '';
    child.stdout.on('data', (d) => { keep(d); buf += d.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (onLook && line.startsWith('@@LOOK ')) { try { onLook(JSON.parse(line.slice(7))); } catch (e) { log('bad look line:', e.message); } } } });
    child.stderr.on('data', keep);
    child.on('error', fail);
    child.on('close', (code, signal) => (code === 0 ? ok() : fail(new Error(signal === 'SIGKILL' ? 'the pipeline was killed, most likely out of memory (see fly logs)' : (tail.match(/Error: (.+)/g) || []).pop()?.slice(7) || `pipeline exited with ${code ?? signal}`))));
  });
}

/** Uploads a look: the transparent cut-out (lookN.webp, what the app shows) and the flat version (lookN.png).
 *  Returns the path the app should use. */
async function saveLook(job, n, file, cutout) {
  const dir = `${job.user_id}/looks/${job.id}`;
  const flat = await upload('outfits', `${dir}/look${n}.png`, await readFile(file));
  if (!cutout) return flat;
  return upload('outfits', `${dir}/look${n}.webp`, await readFile(cutout)).catch((e) => { log(`look ${n}: cut-out not saved (${e.message}), using the flat image`); return flat; });
}

async function forecast(user) {
  const q = new URLSearchParams({ latitude: user.home_lat, longitude: user.home_lon, daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max', timezone: user.home_timezone || 'auto', forecast_days: '1' });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return weatherText((await res.json()).daily);
}

async function runJob(job) {
  const person = `job-${job.id}`, inputs = join(ROOT, 'image-test', 'inputs', 'people', person), tmp = join(ROOT, 'image-test', 'tmp', job.id);
  const jsonOut = join(tmp, 'summary.json');
  await mkdir(inputs, { recursive: true }); await mkdir(tmp, { recursive: true });
  try {
    const { data: user, error: ue } = await db.from('users').select('*').eq('id', job.user_id).single();
    if (ue) throw new Error(`No profile for this user: ${ue.message}`);
    const { data: photos, error: pe } = await db.from('wardrobe_photos').select('id, path').eq('user_id', job.user_id).eq('is_active', true).order('created_at');
    if (pe) throw new Error(pe.message);
    const files = inputsFor(user, photos, { prepared: job.job_type === 'make_looks' });
    let preparedFile = null;
    for (const f of files) {
      const bytes = await download(f.bucket, f.path);
      if (f.prepared) { preparedFile = join(tmp, 'prepared.png'); await writeFile(preparedFile, bytes); } else await writeFile(join(inputs, f.as), bytes);
    }
    if (user.body_note) await writeFile(join(inputs, 'body.txt'), String(user.body_note).slice(0, 200) + '\n');
    log(`job ${job.id} (${job.job_type}): ${files.length} file(s) ready, running the pipeline`);
    // Cut-outs of the outfit photos are kept in Storage (outfits/<user>/cutouts/), so each photo is cut out only on the
    // first run that uses it, on whichever machine runs it.
    const cutouts = join(tmp, 'cutouts'), cutoutPrefix = `${job.user_id}/cutouts`;
    await mkdir(cutouts, { recursive: true });
    const { data: had } = await db.storage.from('outfits').list(cutoutPrefix, { limit: 1000 });
    const known = new Set((had || []).map((f) => f.name));
    for (const name of known) await writeFile(join(cutouts, name), await download('outfits', `${cutoutPrefix}/${name}`)).catch(() => {});
    // Morning jobs (and any job without weather): today's forecast for the person's home, and the default occasion.
    if (job.job_type === 'make_looks') {
      const p = job.payload = { ...(job.payload || {}) };
      if (!p.weather && Number.isFinite(user.home_lat) && Number.isFinite(user.home_lon)) p.weather = await forecast(user).catch((e) => { log('forecast failed:', e.message); return null; });
      if (!p.occasion) p.occasion = user.default_occasion || defaultOccasion(new Date(), user.home_timezone || 'Europe/Madrid');
      await db.from('generation_jobs').update({ payload: p }).eq('id', job.id);
    }
    // Each look is uploaded and listed as soon as it passes its checks, so the app shows it while the next is made.
    const early = new Map(), pending = [];
    const onLook = (l) => pending.push((async () => {
      const path = await saveLook(job, l.n, l.file, l.cutout);
      const [row] = outfitRows(job, { looks: [{ n: l.n, status: 'ready', items: l.items, cost: 0 }] }, { [l.n]: path });
      const { error } = await db.from('outfits').insert(row);
      if (error) throw new Error(error.message);
      early.set(l.n, path); log(`look ${l.n} shown`);
    })().catch((e) => log(`look ${l.n} not shown early: ${e.message}`)));
    await runPipeline(pipelineArgs(job, person, jsonOut, preparedFile, cutouts), job.job_type === 'make_looks' ? onLook : null);
    await Promise.all(pending);
    for (const name of await readdir(cutouts)) if (!known.has(name)) await upload('outfits', `${cutoutPrefix}/${name}`, await readFile(join(cutouts, name))).catch((e) => log('cut-out not kept:', e.message));
    const summary = JSON.parse(await readFile(jsonOut, 'utf8'));
    const uploaded = {};
    if (job.job_type === 'prepare_base') {
      for (const r of summary.prep.filter((x) => x.ok)) uploaded[r.file] = await upload('outfits', `${job.user_id}/base/${job.id}/${r.file}`, await readFile(join(summary.dir, r.file)));
      const options = baseOptions(summary, uploaded);
      if (!options.length) throw new Error('None of the prepared base photos passed the checks. Try another full-body photo: standing, face visible, plain background.');
      const { error } = await db.from('users').update({ base_options: options, base_path: null }).eq('id', job.user_id);
      if (error) throw new Error(error.message);
      return { result: { base_options: options }, cost: summary.spent };
    }
    for (const l of summary.looks.filter((x) => x.status === 'ready')) uploaded[l.n] = early.get(l.n) || await saveLook(job, l.n, join(summary.dir, l.file), l.cutout && join(summary.dir, l.cutout));
    const rows = outfitRows(job, summary, uploaded);
    // Looks already listed get their final cost and identity; dropped, refused and late ones are added now.
    for (const r of rows.filter((x) => early.has(x.look_n))) await db.from('outfits').update({ cost: r.cost, validation_confidence: r.validation_confidence }).eq('job_id', job.id).eq('look_n', r.look_n);
    const rest = rows.filter((x) => !early.has(x.look_n));
    if (rest.length) { const { error } = await db.from('outfits').insert(rest); if (error) throw new Error(error.message); }
    // A garment that made every try fail: ask for a new photo of it (shown in the app next to that photo).
    for (const l of summary.looks.filter((x) => x.retake)) {
      const photo = files.filter((f) => f.photoId)[l.items.find((i) => l.retake.includes(i.description.split(',')[0]))?.photo ?? -1];
      if (photo) await db.from('wardrobe_photos').update({ retake_hint: l.retake }).eq('id', photo.photoId);
    }
    return { result: { ready: rows.filter((r) => r.status === 'ready').length, asked: rows.length }, cost: summary.spent };
  } finally {
    await rm(inputs, { recursive: true, force: true });
    await rm(tmp, { recursive: true, force: true });
    // The pipeline's own results folder for this person (image-test/results/<stamp>-job-…).
    const results = join(ROOT, 'image-test', 'results');
    for (const d of await readdir(results).catch(() => [])) if (d.endsWith(person)) await rm(join(results, d), { recursive: true, force: true });
  }
}

async function loop() {
  for (;;) {
    let job = null;
    try {
      const { data, error } = await db.rpc('claim_generation_job');
      if (error) throw new Error(error.message);
      job = data?.[0] || null;
    } catch (e) { log('claim failed:', e.message); }
    if (!job) {
      if (Date.now() - lastWork > IDLE_MS) { log(`idle for ${IDLE_MS / 60000} min, stopping`); process.exit(0); }
      await new Promise((r) => { kick = r; setTimeout(r, 5000); });
      continue;
    }
    busy = true; lastWork = Date.now();
    const t0 = Date.now();
    try {
      const { result, cost } = await runJob(job);
      await db.from('generation_jobs').update({ status: 'completed', result, cost, completed_at: new Date().toISOString(), error_message: null }).eq('id', job.id);
      log(`job ${job.id} done in ${Math.round((Date.now() - t0) / 1000)} s, ~$${(cost || 0).toFixed(3)}`);
    } catch (e) {
      log(`job ${job.id} failed:`, e.message);
      await db.from('generation_jobs').update({ status: 'failed', error_message: e.message.slice(0, 500), completed_at: new Date().toISOString() }).eq('id', job.id);
    }
    busy = false; lastWork = Date.now();
  }
}

const secretOk = (h) => { const a = Buffer.from(String(h || '')), b = Buffer.from(env('WORKER_SECRET')); return a.length === b.length && timingSafeEqual(a, b); };
// A machine that stopped mid-job (deploy, crash) leaves it 'processing': put those back in the queue, at most 3 tries.
async function requeueStale() {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { error } = await db.from('generation_jobs').update({ status: 'pending' }).eq('status', 'processing').lt('started_at', cutoff).lt('attempts', 3);
  if (error) log('requeue failed:', error.message);
}

createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, busy })); }
  if (req.url === '/wake' && req.method === 'POST') {
    if (!secretOk(req.headers['x-worker-secret'])) { res.writeHead(401); return res.end(); }
    lastWork = Date.now(); kick?.();
    res.writeHead(202, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ awake: true, busy }));
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => log(`worker listening on ${PORT}`));
requeueStale().finally(loop);
