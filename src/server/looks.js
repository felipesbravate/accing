// Server-only: today's looks for the signed-in person, read with their own session (RLS: own rows and own storage
// folder only). Images are private, so each gets a short-lived signed URL. Never import from client code.
import { authClient } from './auth.js';
import { dailyLimit } from '../lib/plans.js';
import { conditionOf, OCCASION_TABS, startOfToday, tabFor, temperatureOf } from '../mirror/occasions.js';
import { comboKey, descKey, lookKeys, pickLooks } from '../mirror/seasons.js';
import { jobFailureText } from '../lib/job-errors.js';
import { climateFor, rememberLocation } from './location.js';
import { seenKey, suggestLooks } from '../mirror/suggest.js';

const URL_SECONDS = 60 * 60;

// Today's suggestions show at most 5 per tab (src/mirror/suggest.js, Felipe 2026-11-03); the season filters, All and
// Favorites show every look made so far, newest first, one per garment combination, hidden ones left out.
const ALL_ROWS = 500;

/** The person's favourite look ids and hidden garment combinations (migration 007). Before that migration runs the
 *  tables don't exist: then nothing is favourite or hidden, and the mirror works as before. */
async function marks(sb, userId) {
  const [fav, hid] = await Promise.all([
    sb.from('favorites').select('outfit_id').eq('user_id', userId),
    sb.from('hidden_combinations').select('combo, outfit_id').eq('user_id', userId),
  ]);
  const hidden = new Set((hid.data || []).map((r) => r.combo));
  // Hides from before both keys were stored (2026-11-01): add the wording key of the look each was hidden from, so a
  // duplicate photo of the same garments stays hidden too.
  const from = [...new Set((hid.data || []).map((r) => r.outfit_id).filter(Boolean))];
  if (from.length) {
    const { data: looks } = await sb.from('outfits').select('items').in('id', from.slice(0, 500));
    for (const l of looks || []) { const d = descKey(l.items); if (d) hidden.add(d); }
  }
  return { favorites: new Set((fav.data || []).map((r) => r.outfit_id)), hidden };
}

/** Signed image URLs for the looks the ring will show (only those: signing is per image). */
async function signLooks(sb, rows, favorites = new Set()) {
  if (!rows?.length) return [];
  const { data } = await sb.storage.from('outfits').createSignedUrls(rows.map((r) => r.generated_image_path), URL_SECONDS);
  const urlOf = new Map((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
  return rows.filter((r) => urlOf.has(r.generated_image_path))
    .map((r) => ({ id: r.id, image: urlOf.get(r.generated_image_path), alt: (r.items || []).map((i) => i.description).join(', ') || 'A look',
      combo: comboKey(r.items, r.id), keys: lookKeys(r.items, r.id), favorite: favorites.has(r.id) }));
}

const HISTORY_ROWS = 300;
const MAX_PER_TAB_HISTORY = 40;

/** Every look so far that suits the season filter (Summer, Mid-season, Winter, All, Favorites), per tab, newest first. */
export async function seasonLooks(userId, key) {
  const sb = await authClient();
  const [mine, { data: profile }] = await Promise.all([marks(sb, userId), sb.from('users').select('*').eq('id', userId).single()]);
  // Summer, Mid-season, Winter: judged against the typical temperature of each season where the person lives.
  const climate = ['summer', 'mid', 'winter'].includes(key) ? await climateFor(sb, userId, profile).catch(() => null) : null;
  let query = sb.from('outfits').select('id, job_id, look_n, generated_image_path, items, occasion, created_at')
    .eq('user_id', userId).eq('status', 'ready');
  if (key === 'favorites') query = query.in('id', [...mine.favorites].slice(0, HISTORY_ROWS)); // favourites of any age
  const { data: rows } = mine.favorites.size || key !== 'favorites'
    ? await query.order('created_at', { ascending: false }).limit(HISTORY_ROWS) : { data: [] };
  const picked = pickLooks(rows, { key, perTab: MAX_PER_TAB_HISTORY, tabs: OCCASION_TABS.map((t) => t.label), unique: true, ...mine, ...(climate ? { climate } : {}),
    offset: Number.isFinite(profile?.warmth_offset) ? profile.warmth_offset : 0 });
  const entries = await Promise.all(OCCASION_TABS.map(async (t) => [t.label, { looks: await signLooks(sb, picked[t.label], mine.favorites), making: false }]));
  return { tabs: Object.fromEntries(entries) };
}

/** { tabs: { [label]: { looks: [{ id, image, alt }], making: bool } }, temperature, hasBase, outfitPhotos } */
export async function todaysLooks(userId) {
  const sb = await authClient();
  const since = startOfToday();
  const [{ data: rows }, { data: jobs }, { data: profile }, { count: outfitPhotos }, mine] = await Promise.all([
    sb.from('outfits').select('id, job_id, look_n, generated_image_path, items, occasion, weather, created_at')
      .eq('user_id', userId).eq('status', 'ready').order('created_at', { ascending: false }).limit(ALL_ROWS),
    sb.from('generation_jobs').select('id, status, payload, error_message, created_at').eq('user_id', userId).eq('job_type', 'make_looks')
      .gte('created_at', since).order('created_at', { ascending: false }),
    sb.from('users').select('*').eq('id', userId).single(), // '*': works before and after migration 005
    sb.from('wardrobe_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
    marks(sb, userId),
  ]);
  // Home from the IP location the first time it's missing (morning weather, season filters); best effort.
  await rememberLocation(sb, userId, profile).catch(() => null);
  // Today's suggestions (src/mirror/suggest.js): at most 5 per tab, new or not seen for a while, suited to today's weather.
  const weather = (rows || []).find((r) => r.weather && r.created_at >= since)?.weather || (jobs || []).find((j) => j.payload?.weather)?.payload.weather;
  const { data: views } = await sb.from('look_views').select('combo, last_seen').eq('user_id', userId); // none before migration 010
  const picked = suggestLooks(rows, { tabs: OCCASION_TABS.map((t) => t.label), hidden: mine.hidden, seen: new Map((views || []).map((v) => [v.combo, v.last_seen])),
    today: localDay(), since, weather, offset: Number.isFinite(profile?.warmth_offset) ? profile.warmth_offset : 0 });
  const tabs = Object.fromEntries(await Promise.all(OCCASION_TABS.map(async (t) => [t.label, { looks: await signLooks(sb, picked[t.label], mine.favorites), making: false }])));
  for (const j of jobs || []) if (['pending', 'processing'].includes(j.status)) tabs[tabFor(j.payload?.occasion || '')].making = true;
  // The newest batch per tab failed (jobs are newest first): say so instead of going quiet.
  const latest = new Set();
  for (const j of jobs || []) {
    const t = tabFor(j.payload?.occasion || '');
    if (latest.has(t)) continue;
    latest.add(t);
    if (j.status === 'failed') tabs[t].failed = jobFailureText(j.error_message);
  }
  return { tabs, temperature: temperatureOf(weather), condition: conditionOf(weather), hasBase: Boolean(profile?.base_path), later: Boolean(profile?.onboarding_later_at), jobsToday: (jobs || []).length, outfitPhotos: outfitPhotos || 0 };
}

const REASONS = ['too_warm', 'too_cold', 'not_my_style'];
const OFFSET_STEP = 1, OFFSET_MAX = 4; // °C per "too warm" / "too cold" (migration 009)

/** Heart or hide a look, or undo either (Figma 191:1372). action: favorite | unfavorite | hide | unhide | reason.
 *  Hiding stores the look's garment combination, so every look of the same garments leaves the mirror. "reason" (Figma
 *  216:1373) adds why to that hidden combination ({ reason, filter, occasion }); too warm / too cold also move the
 *  person's warmth offset by a degree, which the season filters use. */
/** Today's date where the app runs its days ('YYYY-MM-DD', Europe/Madrid like startOfToday). */
export function localDay(date = new Date(), timeZone = 'Europe/Madrid') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export async function markLook(userId, outfitId, action, { reason = null, filter = null, occasion = null } = {}) {
  if (typeof outfitId !== 'string' || !/^[0-9a-f-]{36}$/i.test(outfitId)) return { error: 'Unknown look' };
  const sb = await authClient();
  if (action === 'favorite' || action === 'unfavorite') {
    const { error } = action === 'favorite'
      ? await sb.from('favorites').upsert({ user_id: userId, outfit_id: outfitId }, { onConflict: 'user_id,outfit_id', ignoreDuplicates: true })
      : await sb.from('favorites').delete().eq('user_id', userId).eq('outfit_id', outfitId);
    return error ? { error: error.message } : { ok: true };
  }
  if (!['hide', 'unhide', 'reason', 'seen'].includes(action)) return { error: 'Unknown action' };
  if (action === 'reason' && !REASONS.includes(reason)) return { error: 'Unknown reason' };
  const { data: look } = await sb.from('outfits').select('id, items').eq('id', outfitId).eq('user_id', userId).maybeSingle();
  if (!look) return { error: 'Unknown look' };
  const combo = comboKey(look.items, look.id);
  const keys = lookKeys(look.items, look.id);
  if (action === 'seen') {
    // The look was the front of Today's suggestions for a moment (look_views, migration 010): it rests for a while.
    const key = seenKey(look.items, look.id), today = localDay();
    const { data: was } = await sb.from('look_views').select('times, last_seen').eq('user_id', userId).eq('combo', key).maybeSingle();
    if (was?.last_seen === today) return { ok: true };
    const { error } = await sb.from('look_views').upsert({ user_id: userId, combo: key, outfit_id: look.id, last_seen: today, times: (was?.times || 0) + 1 }, { onConflict: 'user_id,combo' });
    return error ? { error: error.message } : { ok: true };
  } // by photos and by wording: duplicate photos of the same garments too
  if (action === 'reason') {
    const context = { filter: typeof filter === 'string' ? filter.slice(0, 20) : null, occasion: typeof occasion === 'string' ? occasion.slice(0, 40) : null };
    const { error } = await sb.from('hidden_combinations').upsert({ user_id: userId, combo, outfit_id: look.id, reason, context }, { onConflict: 'user_id,combo' });
    if (error) return { error: error.message };
    if (reason !== 'not_my_style') {
      const { data: u } = await sb.from('users').select('warmth_offset').eq('id', userId).single();
      if (u && Number.isFinite(u.warmth_offset)) {
        const next = Math.max(-OFFSET_MAX, Math.min(OFFSET_MAX, u.warmth_offset + (reason === 'too_warm' ? OFFSET_STEP : -OFFSET_STEP)));
        await sb.from('users').update({ warmth_offset: next }).eq('id', userId);
      }
    }
    return { ok: true, combo };
  }
  const { error } = action === 'hide'
    ? await sb.from('hidden_combinations').upsert(keys.map((k) => ({ user_id: userId, combo: k, outfit_id: look.id })), { onConflict: 'user_id,combo', ignoreDuplicates: true })
    : await sb.from('hidden_combinations').delete().eq('user_id', userId).in('combo', keys);
  return error ? { error: error.message } : { ok: true, combo };
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
