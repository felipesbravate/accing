// Makes the pose references once: faceless mannequins in the house pose, on white. The image test sends the matching
// one with the first look ("copy this pose"), because the image model ignored the pose written in words three runs in
// a row. One per body and feet: feet flat (flats, sneakers, boots) or heels raised (high heels), since the shoes decide it.
// Usage: npm run make-pose-reference -- --body=female|male --feet=flat|heels   (or --all for every missing one)
// Writes scripts/assets/pose-reference-<body>-<feet>.png: open it, commit it if the pose is right, else run again.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import './net.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const POSE_DIR = join(ROOT, 'scripts', 'assets');
export const BODIES = ['female', 'male'];
export const FEET = ['flat', 'heels'];
export const poseReferencePath = (body, feet) => join(POSE_DIR, `pose-reference-${body}-${feet}.png`);
export const DEFAULT_POSE = 'relaxed standing pose: body turned about 15 degrees so their left shoulder is slightly closer to the camera, head turned back to face the camera, chin level; weight on the back (right) leg, front (left) knee slightly relaxed, feet about hip-width apart; both arms hanging loosely at the sides, elbows very slightly bent, hands open and relaxed beside the thighs, never in pockets; shoulders relaxed and level';
const BODY_TEXT = { female: 'a female fashion mannequin with a natural adult female build', male: 'a male fashion mannequin with a natural adult male build' };
// Mannequins are built for heels, so asked for flat feet the model still drew them on tiptoe (2026-10-27). When the
// other feet version exists, this one is made as an edit of it: only the feet change, and the pose stays identical.
const FEET_EDIT = {
  flat: 'Put both heels down so the whole soles stand flat on the floor, and give the mannequin plain low-top sneakers in the same matte light grey as its body, with no laces detail, logos or stripes.',
  heels: 'Raise both heels so the weight is on the balls of the feet, and give the mannequin plain high-heeled pumps in the same matte light grey as its body.',
};
const FEET_TEXT = {
  flat: 'Feet flat on the floor with the heels down, as when wearing flat shoes, sneakers or boots.',
  heels: 'Heels raised and the weight on the balls of the feet, as when wearing high-heeled shoes.',
};

/** Shoes decide the feet: heels raise them, everything else (or no shoes read) keeps them flat. */
export const feetFor = (items) => (items.some((x) => x.category === 'shoes' && /\b(high[- ]?heel|heels?|heeled|stiletto|pumps?|wedges?|platform)\b/i.test(x.description) && !/\bflat\b/i.test(x.description)) ? 'heels' : 'flat');

async function make(body, feet, pose, key) {
  const other = poseReferencePath(body, feet === 'flat' ? 'heels' : 'flat');
  const fromOther = existsSync(other);
  const prompt = fromOther
    ? `Edit image 1. Change ONLY the feet: ${FEET_EDIT[feet]}
Keep everything else exactly as in image 1: the mannequin, its pose and turn, arms, hands, legs and where the feet stand, the framing, the white background and the soft floor shadow.`
    : `A photo of ${BODY_TEXT[body]}: plain, smooth, matte light grey, no face, no hair, no clothes, no details.
Full body from head to feet. Pose, exactly: ${pose}. ${FEET_TEXT[feet]}
Camera straight on at chest height, the figure centred, top of the head about 8% below the top edge, soles about 6% above the bottom edge.
Pure white seamless background, soft even studio light, one soft shadow on the floor under the feet. Portrait 2:3. No text, no props.`;
  const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  console.log(`Generating the ${body} pose reference, feet ${feet}${fromOther ? ' (edit of the ' + (feet === 'flat' ? 'heels' : 'flat') + ' one, same pose)' : ''}…`);
  const parts = fromOther ? [{ inlineData: { mimeType: 'image/png', data: (await readFile(other)).toString('base64') } }, { text: prompt }] : [{ text: prompt }];
  const res = await fetch(`${base}/v1beta/models/gemini-3.1-flash-image-preview:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '2:3', imageSize: '2K' } } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.message || 'no details'}`);
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  if (!part) throw new Error('Gemini returned no image; run it again');
  await mkdir(POSE_DIR, { recursive: true });
  const file = poseReferencePath(body, feet);
  await writeFile(file, Buffer.from((part.inlineData || part.inline_data).data, 'base64'));
  await writeFile(file.replace(/\.png$/, '.txt'), `${body}, feet ${feet}: ${pose}\n`);
  console.log(`Saved ${file} (~$0.10).`);
}

async function main() {
  const arg = (k) => process.argv.slice(2).find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
  const all = process.argv.includes('--all');
  const pose = arg('pose') || DEFAULT_POSE;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local');
  let todo;
  // Heels first for female, flat first for male: each second one is then an edit of the first.
  if (all) todo = [['female', 'heels'], ['female', 'flat'], ['male', 'flat']].filter(([b, f]) => !existsSync(poseReferencePath(b, f)));
  else {
    const body = arg('body'), feet = arg('feet') || 'flat';
    if (!BODIES.includes(body) || !FEET.includes(feet)) throw new Error('Use --body=female|male and --feet=flat|heels, or --all');
    todo = [[body, feet]];
  }
  if (!todo.length) { console.log('All pose references exist. Delete one to make it again.'); return; }
  for (const [b, f] of todo) await make(b, f, pose, key);
  console.log('Open them in scripts/assets/: commit the good ones, run again for any that are off.');
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; });
