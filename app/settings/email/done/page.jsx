// The email-change link lands here (via /auth/callback): the new address is now the one to sign in with.
import { redirect } from 'next/navigation';
import { authClient } from '../../../../src/server/auth.js';
import { pageUser } from '../../../../src/server/page-user.js';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { user, live } = await pageUser();
  // Keep public.users.email in step with the sign-in email.
  if (live && user.email) await (await authClient()).from('users').update({ email: user.email }).eq('id', user.id);
  redirect('/settings?email=updated');
}
