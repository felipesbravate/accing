// Update email (Figma 287:3642) and Verify new email (287:3723).
import { Email } from '../../../src/account/Account.jsx';
import { pageUser } from '../../../src/server/page-user.js';

export const metadata = { title: 'Update email · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }) {
  const { user } = await pageUser();
  const q = (await searchParams) || {};
  return <Email current={user.email || ''} verified={q.verified === '1'} />;
}
