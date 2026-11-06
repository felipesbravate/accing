// Wardrobe, one category (Figma 306:4775).
import { notFound } from 'next/navigation';
import { Wardrobe } from '../../../src/account/Account.jsx';
import { wardrobe } from '../../../src/server/account.js';
import { pageUser } from '../../../src/server/page-user.js';
import { SAMPLE_WARDROBE } from '../../../src/account/samples.js';

export const metadata = { title: 'Wardrobe · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }) {
  const { tile } = await params;
  const { user, live } = await pageUser();
  const data = live ? await wardrobe(user.id, tile) : SAMPLE_WARDROBE(tile);
  if (!data) notFound();
  return <Wardrobe data={data} />;
}
