// Choose a new password after "Forgot your password?" (Figma 402:4085, the sign-in layout). Reached from the email link through /auth/callback, which leaves the reset cookie.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Password } from '../../src/account/Account.jsx';
import { RESET_COOKIE } from '../../src/server/account.js';
import { pageUser } from '../../src/server/page-user.js';

export const metadata = { title: 'Reset password · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await pageUser();
  if ((await cookies()).get(RESET_COOKIE)?.value !== '1') redirect('/settings/password');
  return <Password reset />;
}
