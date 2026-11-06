// Settings (Figma 270:1948).
import { Settings } from '../../src/account/Account.jsx';
import { settings } from '../../src/server/account.js';
import { pageUser } from '../../src/server/page-user.js';

export const metadata = { title: 'Settings · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { user, live } = await pageUser();
  return <Settings data={live ? await settings(user.id) : { passwordNote: 'Last changed 3 months ago.' }} />;
}
