// Server-only: Profile and Settings (Figma "Main screens" 226:2154). Everything runs with the person's own session, so
// RLS keeps each person to their own rows and files. Never import from client code.
import { cookies } from 'next/headers';
import { authClient } from './auth.js';
import { localDay } from './looks.js';
import { suggestLooks } from '../mirror/suggest.js';
import { lookKeys } from '../mirror/seasons.js';
import { validBox } from '../lib/garment-box.js';
import { hiddenIn } from '../lib/hide-scope.js';
import { OCCASION_TABS, tabFor } from '../mirror/occasions.js';
import { WARDROBE_CATEGORIES, changedAgo, cropFor, garmentKey, wardrobeCounts, wardrobeFrom } from '../lib/wardrobe.js';
import { cleanEmail, validPassword } from '../lib/login-form.js';
import { FACE_ANGLES, PREP_FAILED } from '../lib/photo-advice.js';

export const RESET_COOKIE = 'pw_reset';
const URL_SECONDS = 60 * 60;
const MAX_BYTES = 4 * 1024 * 1024;
const isJpeg = (b) => b?.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

async function me(sb, userId) {
  const { data } = await sb.from('users').select('*').eq('id', userId).single();
  return data || {};
}
async function readyLooks(sb, userId) {
  const { data } = await sb.from('outfits').select('id, items, occasion, created_at, generated_image_path').eq('user_id', userId).eq('status', 'ready')
    .order('created_at', { ascending: false }).limit(2000);
  return (data || []).filter((r) => r.generated_image_path?.endsWith('.webp'));
}
async function hiddenKeys(sb, userId) {
  const { data } = await sb.from('hidden_combinations').select('combo').eq('user_id', userId);
  return new Set((data || []).map((h) => h.combo));
}
async function signed(sb, bucket, paths) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return new Map();
  const { data } = await sb.storage.from(bucket).createSignedUrls(list, URL_SECONDS);
  return new Map((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
}

/** The profile photo's URL for the mirror's avatar, or null. */
export async function avatarUrl(userId) {
  const sb = await authClient();
  const { data } = await sb.from('users').select('avatar_path').eq('id', userId).maybeSingle();
  return data?.avatar_path ? (await signed(sb, 'wardrobe', [data.avatar_path])).get(data.avatar_path) || null : null;
}

/** Profile (268:11591): who, the looks per occasion and favourites, the wardrobe tiles. */
export async function profile(userId, email) {
  const sb = await authClient();
  const [u, looks, hidden, { count: favorites }] = await Promise.all([me(sb, userId), readyLooks(sb, userId), hiddenKeys(sb, userId),
    sb.from('favorites').select('outfit_id', { count: 'exact', head: true }).eq('user_id', userId)]);
  const visible = looks.filter((r) => !hiddenIn(lookKeys(r.items, r.id), tabFor(r.occasion), hidden));
  const counts = Object.fromEntries(OCCASION_TABS.map((t) => [t.label, 0]));
  for (const r of visible) { const t = tabFor(r.occasion); if (t in counts) counts[t] += 1; }
  const tiles = wardrobeCounts(wardrobeFrom(looks, u.removed_garments));
  const avatar = u.avatar_path ? (await signed(sb, 'wardrobe', [u.avatar_path])).get(u.avatar_path) || null : null;
  return {
    name: u.full_name || '', email: email || u.email || '', avatar,
    // "All outfits" first (2026-11-06, like the mirror's menu): every visible look, whatever its occasion.
    stats: [{ label: 'All outfits', count: visible.length }, ...OCCASION_TABS.map((t) => ({ label: t.label === 'Office day' ? 'Office' : t.label, count: counts[t.label] })), { label: 'Favorites', count: favorites || 0, heart: true }],
    tiles: WARDROBE_CATEGORIES.map((c) => ({ ...c, count: tiles[c.key] })),
  };
}

/** Wardrobe (306:4775): the garments of one category, each with its outfit photo cropped to it. */
export async function wardrobe(userId, tile) {
  const cat = WARDROBE_CATEGORIES.find((c) => c.key === tile);
  if (!cat) return null;
  const sb = await authClient();
  const [u, looks, { data: photos }] = await Promise.all([me(sb, userId), readyLooks(sb, userId),
    sb.from('wardrobe_photos').select('id, path').eq('user_id', userId)]);
  const pathOf = new Map((photos || []).map((p) => [p.id, p.path]));
  const items = wardrobeFrom(looks, u.removed_garments).filter((g) => g.tile === tile);
  // The garment's own outfit photo when known; else (looks from before photo ids, or a photo since deleted) a look
  // made with it, on white.
  const [photoUrls, lookUrls] = await Promise.all([signed(sb, 'wardrobe', items.map((g) => pathOf.get(g.photo_id))),
    signed(sb, 'outfits', items.filter((g) => !pathOf.get(g.photo_id)).map((g) => g.lookPath))]);
  return {
    category: cat,
    items: items.map((g) => {
      const photo = photoUrls.get(pathOf.get(g.photo_id));
      // The garment's box on its photo when known (src/lib/garment-box.js), else the category's usual place.
      return { key: g.key, description: g.description, looks: g.looks.length, image: photo || lookUrls.get(g.lookPath) || null,
        isLook: !photo, position: cropFor(g.category), box: photo && validBox(g.box) ? g.box : null };
    }),
  };
}

/** A wardrobe garment and the looks made with it ("See matching outfits", Figma 446:7190): { key, description, tile,
 *  ids }, or null. The same grouping as the Wardrobe page, so its count and this list agree. */
export async function garmentLooks(userId, key) {
  const sb = await authClient();
  const [u, looks] = await Promise.all([me(sb, userId), readyLooks(sb, userId)]);
  const g = wardrobeFrom(looks, u.removed_garments).find((x) => x.key === key || x.keys.includes(key));
  return g ? { key: g.key, description: g.description, tile: g.tile, ids: g.looks } : null;
}

/** Wardrobe "Remove" (312:5607): the garment and every look with it go, favourites included; the pipeline never uses
 *  it again (users.removed_garments, migration 012). */
export async function removeGarment(userId, key) {
  const sb = await authClient();
  const [u, looks] = await Promise.all([me(sb, userId), readyLooks(sb, userId)]);
  const g = wardrobeFrom(looks, u.removed_garments).find((x) => x.key === key);
  if (!g) return { error: 'That item is already gone' };
  // Every reading of it (its wordings and photos), so none of them comes back.
  const removed = [...(Array.isArray(u.removed_garments) ? u.removed_garments : []), ...g.readings];
  const { error } = await sb.from('users').update({ removed_garments: removed }).eq('id', userId);
  if (error) return { error: /removed_garments/.test(error.message) ? 'Run migration 012 first' : error.message };
  const gone = looks.filter((l) => g.looks.includes(l.id));
  const { error: e2 } = await sb.from('outfits').delete().eq('user_id', userId).in('id', gone.map((l) => l.id));
  if (e2) return { error: e2.message };
  await sb.storage.from('outfits').remove(gone.map((l) => l.generated_image_path)).catch(() => {});
  return { ok: true, looks: gone.length };
}

/** Hidden looks (297:2778): one card per hidden look, newest first, with the day it was hidden. */
export async function hiddenLooks(userId) {
  const sb = await authClient();
  const { data: rows } = await sb.from('hidden_combinations').select('outfit_id, created_at').eq('user_id', userId).not('outfit_id', 'is', null)
    .order('created_at', { ascending: false });
  const first = new Map();
  for (const r of rows || []) if (!first.has(r.outfit_id)) first.set(r.outfit_id, r.created_at);
  if (!first.size) return [];
  const { data: looks } = await sb.from('outfits').select('id, items, generated_image_path').eq('user_id', userId).in('id', [...first.keys()]);
  const urls = await signed(sb, 'outfits', (looks || []).map((l) => l.generated_image_path));
  return (looks || []).filter((l) => urls.has(l.generated_image_path))
    .map((l) => ({ id: l.id, image: urls.get(l.generated_image_path), alt: (l.items || []).map((i) => i.description).join(', '), hiddenAt: first.get(l.id) }))
    .sort((a, b) => (a.hiddenAt < b.hiddenAt ? 1 : -1));
}

/** Settings (270:1948). */
export async function settings(userId) {
  const sb = await authClient();
  const u = await me(sb, userId);
  return { passwordNote: changedAgo(u.password_changed_at) };
}

/** Profile photo: a JPEG (the browser crops it square), stored in the person's own folder. */
export async function saveAvatar(userId, bytes) {
  if (!isJpeg(bytes) || bytes.length > MAX_BYTES) return { error: 'Send the photo as a JPEG under 4 MB' };
  const sb = await authClient();
  const u = await me(sb, userId);
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const up = await sb.storage.from('wardrobe').upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (up.error) return { error: up.error.message };
  const { error } = await sb.from('users').update({ avatar_path: path }).eq('id', userId);
  if (error) return { error: /avatar_path/.test(error.message) ? 'Run migration 012 first' : error.message };
  if (u.avatar_path) await sb.storage.from('wardrobe').remove([u.avatar_path]).catch(() => {});
  return { ok: true, avatar: (await signed(sb, 'wardrobe', [path])).get(path) || null };
}

/** Update password (287:3529): the current one first, unless they came from a reset link (/reset-password). */
export async function changePassword(userId, email, { current, next, confirm }) {
  if (!validPassword(next)) return { error: 'Use at least 8 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.', field: 'next' };
  if (next !== confirm) return { error: 'The new passwords don’t match.', field: 'confirm' };
  const sb = await authClient();
  const jar = await cookies();
  const reset = jar.get(RESET_COOKIE)?.value === '1';
  if (!reset) {
    if (!current) return { error: 'Enter your current password.', field: 'current' };
    const { error } = await sb.auth.signInWithPassword({ email, password: String(current) });
    if (error) return { error: 'That isn’t your current password.', field: 'current' };
  }
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  if (reset) jar.delete(RESET_COOKIE);
  await sb.from('users').update({ password_changed_at: new Date().toISOString() }).eq('id', userId);
  return { ok: true };
}

/** Update email (287:3642): checks the password, then Supabase emails the new address a confirmation link (its
 *  default template; a code needs custom SMTP to edit the template). The email only changes once the link is opened:
 *  /auth/callback → Settings. "Secure email change" is off in Supabase, so only the new address confirms. */
export async function startEmailChange(email, { newEmail, password }, origin = '') {
  const to = cleanEmail(newEmail);
  if (!to) return { error: 'Enter a valid email address.', field: 'email' };
  if (to === email) return { error: 'That’s already your email.', field: 'email' };
  const sb = await authClient();
  const { error: pe } = await sb.auth.signInWithPassword({ email, password: String(password || '') });
  if (pe) return { error: 'That isn’t your current password.', field: 'password' };
  const { error } = await sb.auth.updateUser({ email: to }, origin ? { emailRedirectTo: `${origin}/auth/callback?next=/settings/email/done` } : undefined);
  if (error) return { error: error.message, field: 'email' };
  return { ok: true, email: to };
}

/** Verify new email (287:3723). */
export async function verifyEmail(userId, { newEmail, code }) {
  const to = cleanEmail(newEmail), token = String(code || '').replace(/\D/g, '');
  if (!to || token.length < 6 || token.length > 8) return { error: 'Enter the code from the email.' };
  const sb = await authClient();
  const { error } = await sb.auth.verifyOtp({ email: to, token, type: 'email_change' });
  if (error) return { error: 'That code didn’t work. Check it, or ask for a new one.' };
  await sb.from('users').update({ email: to }).eq('id', userId);
  return { ok: true };
}

export async function resendEmailCode({ newEmail }, origin = '') {
  const to = cleanEmail(newEmail);
  if (!to) return { error: 'Enter a valid email address.' };
  const sb = await authClient();
  const { error } = await sb.auth.resend({ type: 'email_change', email: to, ...(origin ? { options: { emailRedirectTo: `${origin}/auth/callback?next=/settings/email/done` } } : {}) });
  return error ? { error: error.message } : { ok: true };
}

async function removeFolder(sb, bucket, prefix) {
  for (let round = 0; round < 20; round += 1) {
    const { data } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
    if (!data?.length) return;
    const files = data.filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
    for (const d of data.filter((f) => !f.id)) await removeFolder(sb, bucket, `${prefix}/${d.name}`);
    if (!files.length) return;
    await sb.storage.from(bucket).remove(files);
  }
}

/** Delete account (287:3811): their files, then the account and every row (delete_my_account, migration 012). */
export async function deleteAccount(userId, confirm) {
  if (String(confirm || '').trim() !== 'DELETE') return { error: 'Type DELETE to confirm.' };
  const sb = await authClient();
  await removeFolder(sb, 'wardrobe', userId).catch(() => {});
  await removeFolder(sb, 'outfits', userId).catch(() => {});
  const { error } = await sb.rpc('delete_my_account');
  if (error) return { error: /delete_my_account/.test(error.message) ? 'Run migration 012 first' : error.message };
  await sb.auth.signOut().catch(() => {});
  return { ok: true };
}

// ── Update face photos (297:3383 → 305:3626… → 306:4398 → 395:2615) ──
// New photos go to faces/new-<angle>.jpg until "Update photos": then they replace the current ones and a new base photo
// is prepared from the same full-body photo (the current one stays in use until they pick). After "This is me", today's
// suggestions are remade at once and the rest 2 an hour (queue_remakes, migration 012).

const newFacePath = (userId, angle) => `${userId}/faces/new-${angle}.jpg`;

export async function facePhotos(userId) {
  const sb = await authClient();
  const u = await me(sb, userId);
  const { data: list } = await sb.storage.from('wardrobe').list(`${userId}/faces`, { limit: 100 });
  const names = new Set((list || []).map((f) => f.name));
  const fresh = Object.fromEntries(FACE_ANGLES.map((a) => [a.key, names.has(`new-${a.key}.jpg`)]));
  const current = Object.fromEntries(FACE_ANGLES.map((a) => [a.key, u[`face_${a.key}_path`] || null]));
  const urls = await signed(sb, 'wardrobe', [...Object.values(current), ...FACE_ANGLES.filter((a) => fresh[a.key]).map((a) => newFacePath(userId, a.key))]);
  const { data: jobs } = await sb.from('generation_jobs').select('status, error_message, payload, created_at').eq('user_id', userId).eq('job_type', 'prepare_base')
    .order('created_at', { ascending: false }).limit(1);
  const job = jobs?.[0]?.payload?.keep_base ? jobs[0] : null;
  const options = Array.isArray(u.base_options) ? u.base_options.filter((o) => o.path !== u.base_path) : [];
  const optionUrls = job && job.status === 'completed' ? await signed(sb, 'outfits', options.map((o) => o.path)) : new Map();
  return {
    current: Object.fromEntries(FACE_ANGLES.map((a) => [a.key, urls.get(current[a.key]) || null])),
    fresh: Object.fromEntries(FACE_ANGLES.map((a) => [a.key, fresh[a.key] ? urls.get(newFacePath(userId, a.key)) || null : null])),
    preparing: Boolean(job && ['pending', 'processing'].includes(job.status)),
    failed: job?.status === 'failed' ? PREP_FAILED : null,
    options: options.map((o) => ({ path: o.path, url: optionUrls.get(o.path) || null })).filter((o) => o.url),
  };
}

export async function saveNewFace(userId, angle, bytes) {
  if (!FACE_ANGLES.some((a) => a.key === angle)) return { error: 'Unknown photo' };
  if (!isJpeg(bytes) || bytes.length > MAX_BYTES) return { error: 'Send the photo as a JPEG under 4 MB' };
  const sb = await authClient();
  const { error } = await sb.storage.from('wardrobe').upload(newFacePath(userId, angle), bytes, { contentType: 'image/jpeg', upsert: true, cacheControl: '0' });
  if (error) return { error: error.message };
  const { checkPhoto } = await import('./photo-check.js');
  return { ok: true, advice: await checkPhoto(angle, bytes).catch(() => null) };
}

export async function discardNewFaces(userId) {
  const sb = await authClient();
  await sb.storage.from('wardrobe').remove(FACE_ANGLES.map((a) => newFacePath(userId, a.key))).catch(() => {});
  return { ok: true };
}

/** "Update photos": the new faces replace the old ones, and a new base photo is prepared (the old one stays in use). */
export async function commitNewFaces(userId) {
  const sb = await authClient();
  const u = await me(sb, userId);
  if (!u.base_source_path) return { error: 'Add your full-body photo first' };
  const change = {};
  for (const a of FACE_ANGLES) {
    const from = newFacePath(userId, a.key), to = `${userId}/faces/${a.key}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('wardrobe').move(from, to);
    if (error) return { error: `Take all three photos first (${a.label.toLowerCase()} is missing)` };
    change[`face_${a.key}_path`] = to;
  }
  const old = FACE_ANGLES.map((a) => u[`face_${a.key}_path`]).filter(Boolean);
  const { error } = await sb.from('users').update(change).eq('id', userId);
  if (error) return { error: error.message };
  await sb.storage.from('wardrobe').remove(old).catch(() => {});
  const { error: je } = await sb.from('generation_jobs').insert({ user_id: userId, status: 'pending', job_type: 'prepare_base', payload: { source: u.base_source_path, keep_base: true } });
  if (je) return { error: je.message };
  const { wakeWorker } = await import('./looks.js');
  await wakeWorker().catch(() => {});
  return { ok: true };
}

/** "This is me" after new face photos: the new base photo, then today's suggestions remade first. */
export async function pickNewBase(userId, path) {
  const sb = await authClient();
  const u = await me(sb, userId);
  if (!(u.base_options || []).some((o) => o.path === path)) return { error: 'Pick one of your photos' };
  const now = new Date().toISOString();
  const { error } = await sb.from('users').update({ base_path: path, remake_from: now }).eq('id', userId);
  if (error) return { error: /remake_from/.test(error.message) ? 'Run migration 012 first' : error.message };
  // Today's suggestions (the same 5 per tab the mirror shows) are remade now; the hourly job does the rest.
  const looks = await readyLooks(sb, userId);
  const hidden = await hiddenKeys(sb, userId);
  const picked = suggestLooks(looks, { tabs: OCCASION_TABS.map((t) => t.label), hidden, today: localDay(), since: null });
  const first = Object.values(picked).flat();
  if (first.length) {
    await sb.from('generation_jobs').insert(first.map((o) => ({ user_id: userId, status: 'pending', job_type: 'remake_look', payload: { outfit_id: o.id, kind: 'suggestion' } })));
    const { wakeWorker } = await import('./looks.js');
    await wakeWorker().catch(() => {});
  }
  return { ok: true, remaking: first.length, total: looks.length };
}

export { garmentKey };
