// Update face photos (Figma 297:3383 and the frames after it).
import Faces from '../../../src/account/Faces.jsx';
import { facePhotos } from '../../../src/server/account.js';
import { pageUser } from '../../../src/server/page-user.js';
import { SAMPLE_FACES } from '../../../src/account/samples.js';

export const metadata = { title: 'Face photos · Accing' };
export const dynamic = 'force-dynamic';

export default async function Page() {
  const { user, live } = await pageUser();
  return <Faces initial={live ? await facePhotos(user.id) : SAMPLE_FACES} />;
}
