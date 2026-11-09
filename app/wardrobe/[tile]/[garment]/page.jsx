// "See matching outfits" (Figma 446:7190): the mirror with only the looks made with one wardrobe garment, under the
// same occasion tabs and season filters, starting on All (no Today's suggestions here). /wardrobe/<tile>/<garment key>.
import { notFound } from 'next/navigation';
import DailyMirror from '../../../../src/mirror/DailyMirror.jsx';
import { garmentLooks } from '../../../../src/server/account.js';
import { pageUser } from '../../../../src/server/page-user.js';
import { WARDROBE_CATEGORIES } from '../../../../src/lib/wardrobe.js';
import { OCCASION_TABS } from '../../../../src/mirror/occasions.js';

export const metadata = { title: 'Matching outfits · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page({ params }) {
  const { tile, garment: raw } = await params;
  const cat = WARDROBE_CATEGORIES.find((c) => c.key === tile);
  if (!cat) notFound();
  const key = decodeURIComponent(raw);
  const { user, live } = await pageUser();
  const g = live ? await garmentLooks(user.id, key) : { key, description: cat.one };
  if (!g) notFound();
  // The looks come from /api/looks?season=all&garment=<key>; the mirror starts with empty tabs and loads them.
  const today = live ? { tabs: Object.fromEntries(OCCASION_TABS.map((t) => [t.label, { looks: [], making: false }])), hasBase: true, later: false, outfitPhotos: 3 } : null;
  return <DailyMirror today={today} garment={{ key: g.key, title: `${cat.label} matching`, icon: cat.icon, description: g.description, back: `/wardrobe/${tile}` }} />;
}
