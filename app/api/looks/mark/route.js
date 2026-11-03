// POST { id, action, reason?, filter?, occasion? }: heart or hide a look, undo it, or say why it was hidden
// (action: favorite | unfavorite | hide | unhide | reason | seen | wore | unwore). Figma 191:1372, 216:1373.
import { NextResponse } from 'next/server';
import { currentUser, supabaseConfigured } from '../../../../src/server/auth.js';
import { markLook } from '../../../../src/server/looks.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await currentUser().catch(() => null);
  if (!user || !supabaseConfigured()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { id, action, reason, filter, occasion } = await request.json().catch(() => ({}));
  const r = await markLook(user.id, id, String(action || ''), { reason, filter, occasion });
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
}
