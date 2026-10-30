// Pure helpers for the worker: what to download, which command to run, what to write back. No network here, so they
// are unit-tested (tests/worker-jobs.test.js).

/** A storage path is the user's own only if it sits in their folder: users can edit their profile row, and the worker
 *  (service role, no RLS) must never fetch another person's photos because a path was changed to point at them. */
export function ownPath(userId, path) {
  return typeof path === 'string' && path.startsWith(`${userId}/`) && !path.includes('..');
}

/** The files the pipeline needs, as { bucket, path, as } (as = file name in the person's input folder). */
export function inputsFor(user, photos, { prepared = false } = {}) {
  const need = [
    ['face_front_path', 'face-front'], ['face_left_path', 'face-left'], ['face_right_path', 'face-right'], ['base_source_path', 'base'],
  ];
  const files = [];
  for (const [col, name] of need) {
    if (!ownPath(user.id, user[col])) throw new Error(`Missing ${col.replace(/_path$/, '').replace(/_/g, ' ')} photo`);
    files.push({ bucket: 'wardrobe', path: user[col], as: name + ext(user[col]) });
  }
  const outfits = photos.filter((p) => ownPath(user.id, p.path));
  if (!outfits.length) throw new Error('Add at least one full-body photo of you in your clothes');
  outfits.forEach((p, i) => files.push({ bucket: 'wardrobe', path: p.path, as: `photo-${String(i + 1).padStart(2, '0')}${ext(p.path)}`, photoId: p.id }));
  if (prepared) {
    if (!ownPath(user.id, user.base_path)) throw new Error('Pick your base photo first');
    files.push({ bucket: 'outfits', path: user.base_path, as: null, prepared: true }); // kept outside the input folder: there it would be read as an outfit photo
  }
  return files;
}
const ext = (p) => (/\.(jpe?g|png|webp)$/i.exec(p)?.[0] || '.jpg').toLowerCase();

/** Arguments for scripts/image-test.mjs. Quality settings are fixed (Felipe: medium looks, high base, HD). */
export function pipelineArgs(job, person, jsonOut, preparedFile = null, cutoutCache = null) {
  const p = job.payload || {};
  const base = [`--person=${person}`, '--only=openai-2.5-flare-medium', '--hd', '--runs=1', `--json-out=${jsonOut}`, ...(cutoutCache ? [`--cutout-cache=${cutoutCache}`] : [])];
  if (job.job_type === 'prepare_base') return [...base, '--looks=1', '--prep-only', '--reprep'];
  if (job.job_type !== 'make_looks') throw new Error(`Unknown job type ${job.job_type}`);
  const looks = Math.max(1, Math.min(6, parseInt(p.looks, 10) || 3));
  const clean = (s, d) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 80) : d);
  return [...base, `--looks=${looks}`, `--occasion=${clean(p.occasion, 'an ordinary day')}`, `--weather=${clean(p.weather, 'mild')}`,
    ...(p.seed ? [`--seed=${parseInt(p.seed, 10) || 1}`] : []), ...(preparedFile ? [`--prepared=${preparedFile}`] : [])];
}

/** Rows for public.outfits from the pipeline summary (one per look asked for, ready or not). */
export function outfitRows(job, summary, uploaded) {
  const p = job.payload || {};
  return (summary.looks || []).map((l) => ({
    user_id: job.user_id, job_id: job.id, look_n: l.n, status: l.status,
    generated_image_path: uploaded[l.n] || null, items: l.items, reasons: l.reasons || null, retake: l.retake || null,
    cost: Number((l.cost || 0).toFixed(4)), occasion: p.occasion || null, weather: p.weather || null,
    contextual_date: p.date || new Date().toISOString(), daypart: p.daypart || 'morning',
    validation_status: l.status === 'ready' ? 'validated' : 'failed', validation_confidence: l.identity ?? null,
  }));
}

/** The prepared base photos the user can pick from (passing tries only, best first). */
export function baseOptions(summary, uploaded) {
  return (summary.prep || []).filter((r) => r.ok && uploaded[r.file])
    .sort((a, b) => (b.identity ?? 0) - (a.identity ?? 0))
    .map((r) => ({ path: uploaded[r.file], identity: r.identity, best: !!r.best }));
}
