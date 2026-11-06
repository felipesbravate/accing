// Delete account (Figma 287:3811).
import { DeleteAccount } from '../../../src/account/Account.jsx';
import { pageUser } from '../../../src/server/page-user.js';

export const metadata = { title: 'Delete account · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await pageUser();
  return <DeleteAccount />;
}
