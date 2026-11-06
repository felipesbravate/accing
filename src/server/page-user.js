// Server-only: the signed-in person for a Profile or Settings page, or a redirect to sign in. The local preview
// account (no Supabase) gets sample data so the screens can be looked at.
import { redirect } from 'next/navigation';
import { currentUser, supabaseConfigured } from './auth.js';

export async function pageUser() {
  let user = null;
  try { user = await currentUser(); } catch { user = null; }
  if (!user) redirect('/login');
  return { user, live: supabaseConfigured() && user.id !== 'preview' };
}
