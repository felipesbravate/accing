import { authClient, supabaseConfigured } from '../../../src/server/auth.js';
import { back, sameOrigin } from '../../../src/lib/security.js';
import { cleanEmail } from '../../../src/lib/login-form.js';
import { rememberUser } from '../../../src/server/login-steps.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (!supabaseConfigured()) return back('/login?error=config');
  const form = await request.formData();
  const email = cleanEmail(form.get('email'));
  const password = String(form.get('password') || '');
  if (!email || !password || password.length > 200) return back('/login?error=credentials');
  const sb = await authClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { console.error('[login] rejected:', error.status, error.code || error.message); return back('/login?error=credentials'); }
  await rememberUser(email, data.user?.user_metadata?.full_name);
  return back('/');
}
