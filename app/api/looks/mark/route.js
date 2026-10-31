// POST { id, action }: heart or hide a look, or undo it (action: favorite | unfavorite | hide | unhide). Figma 191:1372.
import { NextResponse } from 'next/server';
import { currentUser, supabaseConfigured } from '../../../../src/server/auth.js';
import { markLook } from '../../../../src/server/looks.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await currentUser().catch(() => null);
  if (!user || !supabaseConfigured()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id, action } = await request.json().catch(() => ({}));
  const r = await markLook(user.id, id, String(action || ''));
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
}
