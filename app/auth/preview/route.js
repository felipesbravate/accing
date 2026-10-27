// Development only, while Supabase is not configured: sign in as a local preview account to see the mirror.
import { cookies } from 'next/headers';
import { PREVIEW_COOKIE, previewAllowed } from '../../../src/server/auth.js';
import { back, sameOrigin } from '../../../src/lib/security.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!previewAllowed()) return new Response('Not found', { status: 404 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  (await cookies()).set(PREVIEW_COOKIE, '1', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 });
  return back('/');
}
