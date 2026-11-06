// Email links land here (sign-up confirmation, password reset): the one-time code becomes a session, then the person
// goes on to `next` (a same-site path; /reset-password for a reset link). A reset link also leaves a short-lived
// cookie that lets /reset-password set a new password without the current one.
import { cookies } from 'next/headers';
import { authClient, supabaseConfigured } from '../../../src/server/auth.js';
import { back } from '../../../src/lib/security.js';
import { safeNext } from '../../../src/lib/login-form.js';
import { RESET_COOKIE } from '../../../src/server/account.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  if (code && supabaseConfigured()) {
    const sb = await authClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next === '/reset-password') (await cookies()).set(RESET_COOKIE, '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 15 * 60, secure: process.env.NODE_ENV === 'production' });
      return back(next);
    }
    console.error('[callback] code exchange failed:', error.status, error.message);
  }
  return back(next === '/reset-password' ? '/login?error=reset' : '/login?error=link');
}
