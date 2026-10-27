import { authClient, supabaseConfigured } from '../../../src/server/auth.js';
import { back } from '../../../src/lib/security.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const code = new URL(request.url).searchParams.get('code');
  if (code && supabaseConfigured()) {
    const sb = await authClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return back('/');
    console.error('[callback] code exchange failed:', error.status, error.message);
  }
  return back('/login?error=link');
}
