import { authClient, supabaseConfigured } from '../../../src/server/auth.js';
import { back, sameOrigin } from '../../../src/lib/security.js';
import { cleanEmail, cleanName, validPassword } from '../../../src/lib/login-form.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (!supabaseConfigured()) return back('/login?mode=signup&error=config');
  const form = await request.formData();
  const name = cleanName(form.get('name'));
  const email = cleanEmail(form.get('email'));
  const password = String(form.get('password') || '');
  if (!name) return back('/login?mode=signup&error=name');
  if (!email) return back('/login?mode=signup&error=email');
  if (!validPassword(password)) return back('/login?mode=signup&error=password');
  const origin = new URL(request.url).origin;
  const sb = await authClient();
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) { console.error('[signup] rejected:', error.status, error.code || error.message); return back('/login?mode=signup&error=signup'); }
  // With "Confirm email" on in Supabase there is no session yet: the person confirms from their inbox first.
  return back(data.session ? '/' : '/login?sent=1');
}
