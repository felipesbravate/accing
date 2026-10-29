// The Daily Mirror. Signed-out visitors never get here (middleware.js), and the session is verified again below.
import { redirect } from 'next/navigation';
import DailyMirror from '../src/mirror/DailyMirror.jsx';
import Splash from '../src/mirror/Splash.jsx';
import { currentUser } from '../src/server/auth.js';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (!user) redirect('/login');
  const first = (user.name || '').split(' ')[0] || (user.email ? user.email.split('@')[0] : '');
  return (
    <>
      <Splash name={first} />
      <DailyMirror name={first} />
    </>
  );
}
