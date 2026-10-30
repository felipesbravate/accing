// Server-only: today's looks for the signed-in person, read with their own session (RLS: own rows and own storage
// folder only). Images are private, so each gets a short-lived signed URL. Never import from client code.
import { authClient } from './auth.js';
import { dailyLimit } from '../lib/plans.js';
import { conditionOf, OCCASION_TABS, startOfToday, tabFor, temperatureOf } from '../mirror/occasions.js';
import { pickLooks } from '../mirror/seasons.js';

const URL_SECONDS = 60 * 60;

const MAX_PER_TAB = 5;       // the ring is designed for up to 5 looks; more crowd it (2026-10-30: 23 test looks in one tab)

/** Signed image URLs for the looks the ring will show (only those: signing is per image). */
async function signLooks(sb, rows) {
  if (!rows?.length) return [];
  const { data } = await sb.storage.from('outfits').createSignedUrls(rows.map((r) => r.generated_image_path), URL_SECONDS);
  const urlOf = new Map((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  return rows.filter((r) => urlOf.has(r.generated_image_path))
    .map((r) => ({ id: r.id, image: urlOf.get(r.generated_image_path), alt: (r.items || []).map((i) => i.description).join(', ') || 'A look' }));
}

const HISTORY_ROWS = 300;
const MAX_PER_TAB_HISTORY = 12;

/** Every look so far that suits the season filter (Summer, Mid-season, Winter, All), per tab, newest first. */
export async function seasonLooks(userId, key) {
  const sb = await authClient();
  const { data: rows } = await sb.from('outfits').select('id, job_id, look_n, generated_image_path, items, occasion, created_at')
    .eq('user_id', userId).eq('status', 'ready').order('created_at', { ascending: false }).limit(HISTORY_ROWS);
  const picked = pickLooks(rows, { key, perTab: MAX_PER_TAB_HISTORY, tabs: OCCASION_TABS.map((t) => t.label) });
  const entries = await Promise.all(OCCASION_TABS.map(async (t) => [t.label, { looks: await signLooks(sb, picked[t.label]), making: false }]));
  return { tabs: Object.fromEntries(entries) };
}

/** { tabs: { [label]: { looks: [{ id, image, alt }], making: bool } }, temperature, hasBase, outfitPhotos } */
export async function todaysLooks(userId) {
  const sb = await authClient();
  const since = startOfToday();
  const [{ data: rows }, { data: jobs }, { data: profile }, { count: outfitPhotos }] = await Promise.all([
    sb.from('outfits').select('id, job_id, look_n, generated_image_path, items, occasion, weather, created_at')
      .eq('user_id', userId).eq('status', 'ready').gte('created_at', since).order('created_at', { ascending: false }),
    sb.from('generation_jobs').select('id, status, payload, created_at').eq('user_id', userId).eq('job_type', 'make_looks')
      .gte('created_at', since).order('created_at', { ascending: false }),
    sb.from('users').select('*').eq('id', userId).single(), // '*': works before and after migration 005
    sb.from('wardrobe_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
  ]);
  const picked = pickLooks(rows, { key: 'today', perTab: MAX_PER_TAB, tabs: OCCASION_TABS.map((t) => t.label) });
  const tabs = Object.fromEntries(await Promise.all(OCCASION_TABS.map(async (t) => [t.label, { looks: await signLooks(sb, picked[t.label]), making: false }])));
  for (const j of jobs || []) if (['pending', 'processing'].includes(j.status)) tabs[tabFor(j.payload?.occasion || '')].making = true;
  const weather = (rows || []).find((r) => r.weather)?.weather || (jobs || []).find((j) => j.payload?.weather)?.payload.weather;
  return { tabs, temperature: temperatureOf(weather), condition: conditionOf(weather), hasBase: Boolean(profile?.base_path), later: Boolean(profile?.onboarding_later_at), jobsToday: (jobs || []).length, outfitPhotos: outfitPhotos || 0 };
}

/** Queues looks for a tab and wakes the worker. Refuses a second job for the same tab while one is running, and more
 *  than their daily limit (src/lib/plans.js). Returns { queued } or { error }. */
export async function askForLooks(userId, label, { includePath = null, looks = 3 } = {}) {
  const tab = OCCASION_TABS.find((t) => t.label === label);
  if (!tab) return { error: 'Unknown occasion' };
  const sb = await authClient();
  const since = startOfToday();
  const [{ data: jobs }, { data: profile }] = await Promise.all([
    sb.from('generation_jobs').select('status, payload').eq('user_id', userId).eq('job_type', 'make_looks').gte('created_at', since),
    sb.from('users').select('plan, daily_batches').eq('id', userId).single(),
  ]);
  if (!includePath && (jobs || []).some((j) => ['pending', 'processing'].includes(j.status) && tabFor(j.payload?.occasion) === label)) return { queued: false, making: true };
  // Only the app's own requests count towards the daily limit (not the morning run or test jobs).
  const limit = dailyLimit(profile);
  if ((jobs || []).filter((j) => j.payload?.kind === 'on-demand').length >= limit) return { error: `You've made today's ${limit * 3} new looks. More tomorrow.`, limit: true };
  const { error } = await sb.from('generation_jobs').insert({ user_id: userId, status: 'pending', job_type: 'make_looks',
    payload: { kind: 'on-demand', looks, occasion: tab.occasion, date: new Date().toISOString(), daypart: 'day', ...(includePath ? { include_path: includePath, strict: true } : {}) } });
  if (error) return { error: error.message };
  await wakeWorker();
  return { queued: true };
}

export async function wakeWorker() {
  const url = process.env.WORKER_URL, secret = process.env.WORKER_SECRET;
  if (!url || !secret) return; // the job waits until the worker next wakes (the morning run)
  await fetch(new URL('/wake', url), { method: 'POST', headers: { 'x-worker-secret': secret }, signal: AbortSignal.timeout(8000) }).catch(() => {});
}
