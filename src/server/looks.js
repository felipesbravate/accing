// Server-only: today's looks for the signed-in person, read with their own session (RLS: own rows and own storage
// folder only). Images are private, so each gets a short-lived signed URL. Never import from client code.
import { authClient } from './auth.js';
import { OCCASION_TABS, startOfToday, tabFor, temperatureOf } from '../mirror/occasions.js';

const URL_SECONDS = 60 * 60;
const MAX_JOBS_PER_DAY = 8;  // on-demand jobs per person per day (each ~$0.15–0.40)

/** { tabs: { [label]: { looks: [{ id, image, alt }], making: bool } }, temperature, hasBase } */
export async function todaysLooks(userId) {
  const sb = await authClient();
  const since = startOfToday();
  const [{ data: rows }, { data: jobs }, { data: profile }] = await Promise.all([
    sb.from('outfits').select('id, job_id, look_n, generated_image_path, items, occasion, weather, created_at')
      .eq('user_id', userId).eq('status', 'ready').gte('created_at', since).order('created_at', { ascending: false }),
    sb.from('generation_jobs').select('id, status, payload, created_at').eq('user_id', userId).eq('job_type', 'make_looks')
      .gte('created_at', since).order('created_at', { ascending: false }),
    sb.from('users').select('base_path').eq('id', userId).single(),
  ]);
  const looks = rows || [];
  const paths = looks.map((r) => r.generated_image_path).filter(Boolean);
  const signed = paths.length ? (await sb.storage.from('outfits').createSignedUrls(paths, URL_SECONDS)).data || [] : [];
  const urlOf = new Map(signed.filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  const tabs = Object.fromEntries(OCCASION_TABS.map((t) => [t.label, { looks: [], making: false }]));
  // Per tab, the latest job's looks first (in look order), then earlier ones from today.
  const byJob = new Map();
  for (const r of looks) { if (!byJob.has(r.job_id)) byJob.set(r.job_id, []); byJob.get(r.job_id).push(r); }
  for (const list of byJob.values()) {
    for (const r of list.sort((a, b) => a.look_n - b.look_n)) {
      const image = urlOf.get(r.generated_image_path);
      if (image) tabs[tabFor(r.occasion)].looks.push({ id: r.id, image, alt: (r.items || []).map((i) => i.description).join(', ') || 'Today\'s look' });
    }
  }
  for (const j of jobs || []) if (['pending', 'processing'].includes(j.status)) tabs[tabFor(j.payload?.occasion || '')].making = true;
  const weather = looks.find((r) => r.weather)?.weather || (jobs || []).find((j) => j.payload?.weather)?.payload.weather;
  return { tabs, temperature: temperatureOf(weather), hasBase: Boolean(profile?.base_path), jobsToday: (jobs || []).length };
}

/** Queues looks for a tab and wakes the worker. Refuses a second job for the same tab while one is running, and more
 *  than MAX_JOBS_PER_DAY a day. Returns { queued } or { error }. */
export async function askForLooks(userId, label) {
  const tab = OCCASION_TABS.find((t) => t.label === label);
  if (!tab) return { error: 'Unknown occasion' };
  const sb = await authClient();
  const since = startOfToday();
  const { data: jobs } = await sb.from('generation_jobs').select('status, payload').eq('user_id', userId).eq('job_type', 'make_looks').gte('created_at', since);
  if ((jobs || []).some((j) => ['pending', 'processing'].includes(j.status) && tabFor(j.payload?.occasion) === label)) return { queued: false, making: true };
  if ((jobs || []).length >= MAX_JOBS_PER_DAY) return { error: 'That is enough new looks for today' };
  const { error } = await sb.from('generation_jobs').insert({ user_id: userId, status: 'pending', job_type: 'make_looks',
    payload: { kind: 'on-demand', looks: 3, occasion: tab.occasion, date: new Date().toISOString(), daypart: 'day' } });
  if (error) return { error: error.message };
  await wakeWorker();
  return { queued: true };
}

async function wakeWorker() {
  const url = process.env.WORKER_URL, secret = process.env.WORKER_SECRET;
  if (!url || !secret) return; // the job waits until the worker next wakes (the morning run)
  await fetch(new URL('/wake', url), { method: 'POST', headers: { 'x-worker-secret': secret }, signal: AbortSignal.timeout(8000) }).catch(() => {});
}
