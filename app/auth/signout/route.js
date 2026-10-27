import { cookies } from 'next/headers';
import { PREVIEW_COOKIE, authClient, supabaseConfigured } from '../../../src/server/auth.js';
import { back, sameOrigin } from '../../../src/lib/security.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  (await cookies()).delete(PREVIEW_COOKIE);
  if (supabaseConfigured()) { const sb = await authClient(); await sb.auth.signOut(); }
  return back('/login');
}
