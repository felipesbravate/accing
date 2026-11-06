// "Forgot your password?" (Login, Figma 186:3991): Supabase emails a link that signs the person in for a password
// reset and lands on /reset-password (via /auth/callback). Always says the same thing, so it never tells anyone
// whether an email has an account.
import { authClient, supabaseConfigured } from '../../../src/server/auth.js';
import { back, sameOrigin } from '../../../src/lib/security.js';
import { cleanEmail } from '../../../src/lib/login-form.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (!supabaseConfigured()) return back('/login?error=config');
  const email = cleanEmail((await request.formData()).get('email'));
  if (!email) return back('/login?error=email');
  const origin = new URL(request.url).origin;
  const sb = await authClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error) console.error('[forgot] rejected:', error.status, error.code || error.message);
  return back('/login?reset=sent');
}
