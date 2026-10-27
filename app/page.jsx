// The Daily Mirror. Signed-out visitors never get here (middleware.js), and the session is verified again below.
import { redirect } from 'next/navigation';
import DailyMirror from '../src/mirror/DailyMirror.jsx';
import { currentUser } from '../src/server/auth.js';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (!user) redirect('/login');
  return <DailyMirror name={user.name || (user.email ? user.email.split('@')[0] : '')} />;
}
