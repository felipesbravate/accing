// GET: today's looks per occasion tab (signed image URLs); ?season=summer|mid|winter|all: every look so far for that season. POST { tab }: make looks for that tab.
import { NextResponse } from 'next/server';
import { currentUser, supabaseConfigured } from '../../../src/server/auth.js';
import { askForLooks, seasonLooks, todaysLooks } from '../../../src/server/looks.js';
import { SEASON_FILTERS } from '../../../src/mirror/seasons.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await currentUser().catch(() => null);
  if (!user || !supabaseConfigured()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const season = new URL(request.url).searchParams.get('season');
  const body = season && season !== 'today' && SEASON_FILTERS.some((f) => f.key === season) ? await seasonLooks(user.id, season) : await todaysLooks(user.id);
  return NextResponse.json(body, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request) {
  const user = await currentUser().catch(() => null);
  if (!user || !supabaseConfigured()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const { tab } = await request.json().catch(() => ({}));
  const r = await askForLooks(user.id, String(tab || ''));
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
}
