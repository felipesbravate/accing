// Hidden looks (Figma 297:2778).
import { HiddenLooks } from '../../../src/account/Account.jsx';
import { hiddenLooks } from '../../../src/server/account.js';
import { pageUser } from '../../../src/server/page-user.js';
import { SAMPLE_HIDDEN } from '../../../src/account/samples.js';

export const metadata = { title: 'Hidden looks · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { user, live } = await pageUser();
  return <HiddenLooks looks={live ? await hiddenLooks(user.id) : SAMPLE_HIDDEN} />;
}
