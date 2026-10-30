// GET: where the person is in onboarding (and the prepared base photos to pick from, as signed URLs).
// POST { action }: consent | later | details { height, weight } | prepare | pick { path }.
import { NextResponse } from 'next/server';
import { currentUser, supabaseConfigured } from '../../../src/server/auth.js';
import { giveConsent, later, onboardingState, pick, prepare, saveDetails } from '../../../src/server/onboarding.js';

export const dynamic = 'force-dynamic';

async function user() {
  const u = await currentUser().catch(() => null);
  return u && supabaseConfigured() ? u : null;
}

export async function GET() {
  const u = await user();
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  return NextResponse.json(await onboardingState(u.id), { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request) {
  const u = await user();
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const r = b.action === 'consent' ? await giveConsent(u.id)
    : b.action === 'later' ? await later(u.id)
    : b.action === 'details' ? await saveDetails(u.id, b.height, b.weight)
    : b.action === 'prepare' ? await prepare(u.id)
    : b.action === 'pick' ? await pick(u.id, String(b.path || ''))
    : { error: 'Unknown action' };
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
}
