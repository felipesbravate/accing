// Sign in or create an account, email first (Figma 177:2303 → 186:3991 password, or 177:2816 create account).
// Plain forms posting to /auth/*; the email step's answer lives in a cookie (src/server/login-steps.js), errors in ?error=.
import { redirect } from 'next/navigation';
import LoginApp from '../../src/login/LoginApp.jsx';
import { currentUser, previewAllowed } from '../../src/server/auth.js';
import { loginStep } from '../../src/server/login-steps.js';

export const metadata = { title: 'Sign in · Accing' };
export const dynamic = 'force-dynamic';

const MESSAGES = {
  config: 'Supabase is not connected yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env.local, or use the preview account.',
  credentials: "That email and password didn't match. Try again.",
  name: 'Enter your name.',
  email: 'Enter a valid email address.',
  password: 'Use a password of at least 8 characters.',
  signup: "We couldn't create that account. It may already exist: try signing in.",
  link: 'That confirmation link did not work. Sign in, or create the account again.',
};

export default async function Page({ searchParams }) {
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (user) redirect('/');
  const q = (await searchParams) || {};
  const step = await loginStep();
  const message = q.sent === '1'
    ? { text: 'Check your inbox: confirm your email, then sign in.', ok: true }
    : (MESSAGES[q.error] ? { text: MESSAGES[q.error], ok: false } : null);
  return <LoginApp {...step} message={message} preview={previewAllowed()} />;
}
