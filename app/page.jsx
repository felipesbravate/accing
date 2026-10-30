// The Daily Mirror. Signed-out visitors never get here (middleware.js), and the session is verified again below.
import { redirect } from 'next/navigation';
import DailyMirror from '../src/mirror/DailyMirror.jsx';
import Splash from '../src/mirror/Splash.jsx';
import { currentUser, supabaseConfigured } from '../src/server/auth.js';
import { todaysLooks } from '../src/server/looks.js';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (!user) redirect('/login');
  const first = (user.name || '').split(' ')[0] || (user.email ? user.email.split('@')[0] : '');
  // Real looks for signed-in people; the local preview account (no Supabase) keeps the sample looks.
  const today = supabaseConfigured() && user.id !== 'preview' ? await todaysLooks(user.id).catch(() => null) : null;
  // No picked base photo yet: onboarding, unless they chose "Skip" (then the mirror says it's waiting for them).
  if (today && !today.hasBase && !today.later) redirect('/onboarding');
  return (
    <>
      <Splash name={first} />
      <DailyMirror name={first} today={today} />
    </>
  );
}
