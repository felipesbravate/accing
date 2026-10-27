// Server-only auth, copied from Ongatu's src/server/auth.js. Never import from client code.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const PREVIEW_COOKIE = 'preview_user';

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

/** The local preview account exists only in development and only while Supabase is not configured. */
export function previewAllowed() {
  return process.env.NODE_ENV !== 'production' && !supabaseConfigured();
}

/** Supabase client bound to the request cookies (anon key). */
export async function authClient() {
  const store = await cookies();
  return createServerClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => { try { for (const { name, value, options } of list) store.set(name, value, options); } catch { /* read-only context */ } },
    },
  });
}

/** Verified user or null. getUser() re-validates the JWT with Supabase; never trust getSession() alone on the server. */
export async function currentUser() {
  if (previewAllowed()) {
    const store = await cookies();
    return store.get(PREVIEW_COOKIE)?.value === '1' ? { id: 'preview', email: 'preview@accing.local', name: 'Felipe' } : null;
  }
  if (!supabaseConfigured()) return null;
  const sb = await authClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  const full = data.user.user_metadata && data.user.user_metadata.full_name;
  return { id: data.user.id, email: data.user.email ?? null, name: typeof full === 'string' ? full.slice(0, 80) : null };
}
