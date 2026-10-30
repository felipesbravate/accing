// GET: today's looks per occasion tab (signed image URLs). POST { tab }: make looks for that tab.
import { NextResponse } from 'next/server';
import { currentUser, supabaseConfigured } from '../../../src/server/auth.js';
import { askForLooks, todaysLooks } from '../../../src/server/looks.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await currentUser().catch(() => null);
  if (!user || !supabaseConfigured()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json(await todaysLooks(user.id), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request) {
  const user = await currentUser().catch(() => null);
  if (!user || !supabaseConfigured()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { tab } = await request.json().catch(() => ({}));
  const r = await askForLooks(user.id, String(tab || ''));
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
}
