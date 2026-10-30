// Onboarding (Figma 157:291). Signed-out visitors go to /login (middleware.js); people who already picked their base
// photo go to the mirror.
import { redirect } from 'next/navigation';
import Onboarding from '../../src/onboarding/Onboarding.jsx';
import { currentUser, supabaseConfigured } from '../../src/server/auth.js';
import { onboardingState } from '../../src/server/onboarding.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Set up your mirror · Accing' };

export default async function Page() {
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (!user) redirect('/login');
  const state = supabaseConfigured() && user.id !== 'preview' ? await onboardingState(user.id).catch(() => null) : null;
  if (state?.basePath) redirect('/');
  const first = (user.name || '').split(' ')[0];
  return <Onboarding name={first} initial={state} />;
}
