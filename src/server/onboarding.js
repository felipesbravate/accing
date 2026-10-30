// Server-only: onboarding (Figma 157:291). Everything runs with the person's own session, so RLS keeps each person to
// their own row and their own storage folder (wardrobe/<id>/…). The worker prepares the base photo; the person picks one.
// Never import from client code.
import { authClient } from './auth.js';
import { askForLooks, wakeWorker } from './looks.js';
import { planFeatures } from '../lib/plans.js';
import { checkPhoto } from './photo-check.js';
import { bodyNote } from '../lib/photo-advice.js';
import { defaultTab, OCCASION_TABS } from '../mirror/occasions.js';

const URL_SECONDS = 60 * 60;
const MAX_BYTES = 4 * 1024 * 1024; // the browser sends ≤2048 px JPEGs (~0.5–1.5 MB); Vercel refuses bodies over 4.5 MB
export const PHOTO_KINDS = ['front', 'left', 'right', 'body', 'outfit'];

/** What the person has done so far, for resuming onboarding and for the pick screen. */
export async function onboardingState(userId) {
  const sb = await authClient();
  const [{ data: u }, { data: jobs }, { count }] = await Promise.all([
    sb.from('users').select('*').eq('id', userId).single(),
    sb.from('generation_jobs').select('id, status, error_message, payload, created_at').eq('user_id', userId).eq('job_type', 'prepare_base')
      .order('created_at', { ascending: false }).limit(1),
    sb.from('wardrobe_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true),
  ]);
  const job = jobs?.[0] || null;
  const options = Array.isArray(u?.base_options) ? u.base_options : [];
  const signed = options.length ? (await sb.storage.from('outfits').createSignedUrls(options.map((o) => o.path), URL_SECONDS)).data || [] : [];
  const urlOf = new Map(signed.filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  // Only a job for the current full-body photo counts (a retake starts a new one).
  const current = job && (!job.payload?.source || job.payload.source === u?.base_source_path) ? job : null;
  return {
    consent: Boolean(u?.consent_at),
    faces: { front: Boolean(u?.face_front_path), left: Boolean(u?.face_left_path), right: Boolean(u?.face_right_path) },
    bodyPhoto: Boolean(u?.base_source_path),
    bodyNote: u?.body_note || null,
    basePath: u?.base_path || null,
    later: Boolean(u?.onboarding_later_at),
    outfits: count || 0,
    preparing: Boolean(current && ['pending', 'processing'].includes(current.status)),
    failed: current?.status === 'failed' && !options.length ? (current.error_message || 'We couldn’t prepare your photo.') : null,
    options: options.map((o) => ({ path: o.path, url: urlOf.get(o.path) || null })).filter((o) => o.url),
  };
}

/** Stores a photo the person just took and checks it. kind: front | left | right (face), body (the first outfit, which
 *  is also the base photo: starts its preparation), outfit (another outfit photo, from the mirror). */
export async function savePhoto(userId, kind, bytes, { tab = null } = {}) {
  if (!PHOTO_KINDS.includes(kind)) return { error: 'Unknown photo' };
  if (!bytes?.length) return { error: 'The photo is empty' };
  if (bytes.length > MAX_BYTES) return { error: 'The photo is too large' };
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return { error: 'Send the photo as a JPEG' };
  const sb = await authClient();
  const stamp = Date.now();
  const path = ['front', 'left', 'right'].includes(kind) ? `${userId}/faces/${kind}.jpg` : `${userId}/photos/${kind}-${stamp}.jpg`;
  const [up, advice] = await Promise.all([
    sb.storage.from('wardrobe').upload(path, bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '0' }),
    checkPhoto(kind, bytes),
  ]);
  if (up.error) return { error: `Could not save the photo: ${up.error.message}` };

  if (['front', 'left', 'right'].includes(kind)) {
    const { error } = await sb.from('users').update({ [`face_${kind}_path`]: path }).eq('id', userId);
    if (error) return { error: error.message };
    return { ok: true, advice };
  }
  if (kind === 'outfit') {
    const { error } = await sb.from('wardrobe_photos').insert({ user_id: userId, path });
    if (error) return { error: error.message };
    // Plans with instantNewOutfit (testers): looks wearing the new outfit are made right away for the open tab.
    const { data: profile } = await sb.from('users').select('*').eq('id', userId).single();
    if (planFeatures(profile).instantNewOutfit && tab) {
      const r = await askForLooks(userId, tab, { includePath: path });
      return { ok: true, advice, queued: Boolean(r.queued), queueError: r.error || null };
    }
    return { ok: true, advice };
  }
  // body: replaces the previous onboarding full-body photo (and its prepared versions) and prepares the new one.
  const { data: u } = await sb.from('users').select('base_source_path, base_path').eq('id', userId).single();
  if (u?.base_path) return { error: 'You already picked your photo' };
  if (u?.base_source_path) await sb.from('wardrobe_photos').update({ is_active: false }).eq('user_id', userId).eq('path', u.base_source_path);
  const [{ error: ue }, { error: we }] = await Promise.all([
    sb.from('users').update({ base_source_path: path, base_options: null, base_path: null }).eq('id', userId),
    sb.from('wardrobe_photos').insert({ user_id: userId, path }),
  ]);
  if (ue || we) return { error: (ue || we).message };
  // A clear "retake" problem (no feet, two people…) would fail the preparation anyway: don't spend on it unless the
  // person chooses "Use it anyway" (prepare()).
  if (!advice) await prepare(userId, sb, path);
  return { ok: true, advice };
}

/** Queues the base photo preparation for the current full-body photo and wakes the worker. */
export async function prepare(userId, sb = null, source = null) {
  sb = sb || await authClient();
  if (!source) source = (await sb.from('users').select('base_source_path').eq('id', userId).single()).data?.base_source_path;
  if (!source) return { error: 'Take your full-body photo first' };
  const { data: running } = await sb.from('generation_jobs').select('id, payload').eq('user_id', userId).eq('job_type', 'prepare_base').in('status', ['pending', 'processing']);
  if ((running || []).some((j) => j.payload?.source === source)) return { ok: true };
  const { error } = await sb.from('generation_jobs').insert({ user_id: userId, status: 'pending', job_type: 'prepare_base', payload: { source } });
  if (error) return { error: error.message };
  await wakeWorker();
  return { ok: true };
}

export async function giveConsent(userId) {
  const sb = await authClient();
  const { error } = await sb.from('users').update({ consent_at: new Date().toISOString(), onboarding_later_at: null }).eq('id', userId);
  return error ? { error: error.message } : { ok: true };
}

/** "Skip" on the welcome screen: the mirror shows "Your mirror is waiting" until they start. */
export async function later(userId) {
  const sb = await authClient();
  const { error } = await sb.from('users').update({ onboarding_later_at: new Date().toISOString() }).eq('id', userId);
  return error ? { error: error.message } : { ok: true };
}

export async function saveDetails(userId, height, weight) {
  const sb = await authClient();
  const { error } = await sb.from('users').update({ body_note: bodyNote(height, weight) }).eq('id', userId);
  return error ? { error: error.message } : { ok: true };
}

/** "This is me": keeps the picked prepared photo and asks for the first looks (not counted in the daily limit). */
export async function pick(userId, path) {
  const sb = await authClient();
  const { data: u } = await sb.from('users').select('base_options').eq('id', userId).single();
  if (!(u?.base_options || []).some((o) => o.path === path)) return { error: 'Pick one of your photos' };
  const { error } = await sb.from('users').update({ base_path: path, onboarded_at: new Date().toISOString(), onboarding_later_at: null }).eq('id', userId);
  if (error) return { error: error.message };
  const { count } = await sb.from('wardrobe_photos').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('is_active', true);
  const tab = OCCASION_TABS.find((t) => t.label === defaultTab());
  await sb.from('generation_jobs').insert({ user_id: userId, status: 'pending', job_type: 'make_looks',
    // One outfit photo makes one outfit; more looks of it would be the same clothes again.
    payload: { kind: 'first', looks: (count || 0) >= 3 ? 3 : 1, occasion: tab.occasion, date: new Date().toISOString(), daypart: 'day' } });
  await wakeWorker();
  return { ok: true };
}
