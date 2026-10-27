// Makes the pose reference once: a faceless mannequin in the house pose, on white. The image test sends it with the
// first look ("copy this pose"), because the image model ignored the pose written in words in three runs in a row.
// Usage: npm run make-pose-reference [-- --pose="…"] → writes scripts/assets/pose-reference.png (check it, commit it).
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import './net.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const POSE_REFERENCE = join(ROOT, 'scripts', 'assets', 'pose-reference.png');
export const DEFAULT_POSE = 'relaxed standing pose: body turned about 15 degrees so their left shoulder is slightly closer to the camera, head turned back to face the camera, chin level; weight on the back (right) leg, front (left) knee slightly relaxed, feet about hip-width apart; both arms hanging loosely at the sides, elbows very slightly bent, hands open and relaxed beside the thighs, never in pockets; shoulders relaxed and level';

async function main() {
  const poseArg = process.argv.slice(2).find((a) => a.startsWith('--pose='));
  const pose = poseArg ? poseArg.slice(7) : DEFAULT_POSE;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local');
  const prompt = `A photo of a plain, smooth, matte light-grey fashion mannequin with no face, no hair and no clothes details (a simple neutral body), full body from head to feet.
Pose, exactly: ${pose}.
Camera straight on at chest height, the figure centred, top of the head about 8% below the top edge, soles about 6% above the bottom edge.
Pure white seamless background, soft even studio light, one soft shadow on the floor under the feet. Portrait 2:3. No text, no props.`;
  const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  console.log('Generating the pose reference…');
  const res = await fetch(`${base}/v1beta/models/gemini-3.1-flash-image-preview:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '2:3', imageSize: '2K' } } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.message || 'no details'}`);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  if (!part) throw new Error('Gemini returned no image; run it again');
  await mkdir(join(ROOT, 'scripts', 'assets'), { recursive: true });
  await writeFile(POSE_REFERENCE, Buffer.from((part.inlineData || part.inline_data).data, 'base64'));
  await writeFile(POSE_REFERENCE.replace(/\.png$/, '.txt'), pose + '\n');
  console.log(`Saved ${POSE_REFERENCE} (~$0.10). Open it: if the pose is right, commit it; if not, run this again.`);
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; });
