// Server-only: the email-first sign-in. The email typed in step 1 is kept in a short-lived httpOnly cookie (not in the
// URL, where it would end up in history and logs). After a successful sign-in the device remembers the person's email
// and first name, so "Hello, Felipe!" is only ever shown on a device where Felipe has signed in before.
import { cookies } from 'next/headers';
import { authClient, supabaseConfigured } from './auth.js';

export const EMAIL_COOKIE = 'login_email';
export const KNOWN_COOKIE = 'known_user';
const cookieBase = { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' };

export async function setLoginEmail(email) {
  (await cookies()).set(EMAIL_COOKIE, email, { ...cookieBase, maxAge: 60 * 30 });
}
export async function clearLoginEmail() {
  (await cookies()).delete(EMAIL_COOKIE);
}
export async function rememberUser(email, name) {
  const value = Buffer.from(JSON.stringify({ email, name: String(name || '').split(' ')[0].slice(0, 40) })).toString('base64url');
  const jar = await cookies();
  jar.set(KNOWN_COOKIE, value, { ...cookieBase, maxAge: 60 * 60 * 24 * 365 });
  jar.delete(EMAIL_COOKIE);
}

/** { email, step: 'email' | 'password' | 'create', name } for the login page. */
export async function loginStep() {
  const jar = await cookies();
  const email = jar.get(EMAIL_COOKIE)?.value || '';
  if (!email) return { email: '', step: 'email', name: null };
  let known = null;
  try { known = JSON.parse(Buffer.from(jar.get(KNOWN_COOKIE)?.value || '', 'base64url').toString('utf8')); } catch { known = null; }
  const name = known?.email === email ? known.name || null : null;
  if (!supabaseConfigured()) return { email, step: 'password', name };
  const sb = await authClient();
  const { data, error } = await sb.rpc('account_exists', { p_email: email });
  // Without migration 006 the check is missing: ask for the password and offer "create an account" as a link.
  if (error) return { email, step: 'password', name, unsure: true };
  return { email, step: data ? 'password' : 'create', name };
}
