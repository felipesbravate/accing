// Update password (Figma 287:3529).
import { Password } from '../../../src/account/Account.jsx';
import { pageUser } from '../../../src/server/page-user.js';

export const metadata = { title: 'Update password · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  await pageUser();
  return <Password />;
}
