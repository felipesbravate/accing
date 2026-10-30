// Step 1 of sign-in: remember the email (cookie) and show the next step. { reset } goes back to the email step.
import { back, sameOrigin } from '../../../src/lib/security.js';
import { cleanEmail } from '../../../src/lib/login-form.js';
import { clearLoginEmail, setLoginEmail } from '../../../src/server/login-steps.js';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const form = await request.formData();
  if (form.get('reset')) { await clearLoginEmail(); return back('/login'); }
  const email = cleanEmail(form.get('email'));
  if (!email) return back('/login?error=email');
  await setLoginEmail(email);
  return back('/login');
}
