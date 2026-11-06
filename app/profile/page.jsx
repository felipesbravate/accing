// Profile (Figma 268:11591).
import { Profile } from '../../src/account/Account.jsx';
import { profile } from '../../src/server/account.js';
import { pageUser } from '../../src/server/page-user.js';
import { SAMPLE_PROFILE } from '../../src/account/samples.js';

export const metadata = { title: 'Profile · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { user, live } = await pageUser();
  return <Profile data={live ? await profile(user.id, user.email) : SAMPLE_PROFILE} />;
}
