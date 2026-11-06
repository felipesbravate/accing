// Profile and Settings (src/server/account.js). GET ?view=profile | wardrobe&tile=… | hidden | faces.
// POST JSON { action }: remove-garment { key } | password { current, next, confirm } | email { newEmail, password } |
// verify-email { newEmail, code } | resend-email { newEmail } | delete { confirm } | faces-discard | faces-commit |
// faces-pick { path }. POST multipart: avatar (photo) | face (angle, photo).
import { NextResponse } from 'next/server';
import { currentUser, supabaseConfigured } from '../../../src/server/auth.js';
import { sameOrigin } from '../../../src/lib/security.js';
import * as account from '../../../src/server/account.js';
import { FACE_UPDATE } from '../../../src/lib/features.js';

export const dynamic = 'force-dynamic';

async function user() {
  const u = await currentUser().catch(() => null);
  return u && supabaseConfigured() && u.id !== 'preview' ? u : null;
}
const reply = (r) => NextResponse.json(r ?? { error: 'Not found' }, { status: !r ? 404 : r.error ? 400 : 200, headers: { 'cache-control': 'no-store' } });

export async function GET(request) {
  const u = await user();
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const q = new URL(request.url).searchParams;
  const view = q.get('view');
  if (view === 'profile') return reply(await account.profile(u.id, u.email));
  if (view === 'wardrobe') return reply(await account.wardrobe(u.id, q.get('tile')));
  if (view === 'hidden') return reply({ looks: await account.hiddenLooks(u.id) });
  if (view === 'faces') return reply(FACE_UPDATE ? await account.facePhotos(u.id) : null);
  return reply(null);
}

export async function POST(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const u = await user();
  if (!u) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if ((request.headers.get('content-type') || '').startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('photo');
    const bytes = file && typeof file.arrayBuffer === 'function' ? new Uint8Array(await file.arrayBuffer()) : null;
    const kind = String(form?.get('kind') || '');
    if (kind === 'avatar') return reply(await account.saveAvatar(u.id, bytes));
    if (kind === 'face') return reply(FACE_UPDATE ? await account.saveNewFace(u.id, String(form.get('angle') || ''), bytes) : null);
    return reply({ error: 'Unknown upload' });
  }
  const b = await request.json().catch(() => ({}));
  if (!FACE_UPDATE && String(b.action || '').startsWith('faces-')) return reply(null); // local only for now
  switch (b.action) {
    case 'remove-garment': return reply(await account.removeGarment(u.id, String(b.key || '')));
    case 'password': return reply(await account.changePassword(u.id, u.email, b));
    case 'email': return reply(await account.startEmailChange(u.email, b, new URL(request.url).origin));
    case 'verify-email': return reply(await account.verifyEmail(u.id, b));
    case 'resend-email': return reply(await account.resendEmailCode(b, new URL(request.url).origin));
    case 'delete': return reply(await account.deleteAccount(u.id, b.confirm));
    case 'faces-discard': return reply(await account.discardNewFaces(u.id));
    case 'faces-commit': return reply(await account.commitNewFaces(u.id));
    case 'faces-pick': return reply(await account.pickNewBase(u.id, String(b.path || '')));
    default: return reply({ error: 'Unknown action' });
  }
}
