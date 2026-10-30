// POST multipart { kind, photo }: stores an onboarding photo (or a new outfit photo from the mirror) and checks it.
// The browser resizes photos to ≤2048 px JPEG first (src/onboarding/resize.js), well under Vercel's 4.5 MB body limit.
import { NextResponse } from 'next/server';
import { currentUser, supabaseConfigured } from '../../../../src/server/auth.js';
import { savePhoto } from '../../../../src/server/onboarding.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(request) {
  const u = await currentUser().catch(() => null);
  if (!u || !supabaseConfigured()) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('photo');
  if (!file || typeof file.arrayBuffer !== 'function') return NextResponse.json({ error: 'No photo' }, { status: 400 });
  if (file.type && file.type !== 'image/jpeg') return NextResponse.json({ error: 'Send a JPEG' }, { status: 400 });
  const r = await savePhoto(u.id, String(form.get('kind') || ''), Buffer.from(await file.arrayBuffer()), { tab: form.get('tab') ? String(form.get('tab')) : null });
  return NextResponse.json(r, { status: r.error ? 400 : 200 });
}
