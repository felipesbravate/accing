// Makes the pose references once: faceless mannequins in the house pose, on white. The image test sends the matching
// one with the first look ("copy this pose"), because the image model ignored the pose written in words three runs in
// a row. One per body and feet: feet flat (flats, sneakers, boots) or heels raised (high heels), since the shoes decide it.
// Usage: npm run make-pose-reference -- --body=female|male --feet=flat|heels   (or --all for every missing one)
// Flat feet are bare by default; --sneakers puts plain grey sneakers on them instead (flatter feet, but shoes).
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
  flat: 'Bare feet, no shoes. Lower both heels all the way down so each whole sole, heel to toes, rests flat on the floor, as when a person stands barefoot: ankles at a right angle to the shins, a low natural arch, toes relaxed and flat. Replace the arched, tiptoe mannequin feet with flat-standing ones in the same matte light grey.',
  flatShoes: 'Put both heels down so the whole soles stand flat on the floor, and give the mannequin plain low-top sneakers in the same matte light grey as its body, with no laces detail, logos or stripes.',
  heels: 'Raise both heels so the weight is on the balls of the feet, and give the mannequin plain high-heeled pumps in the same matte light grey as its body.',
};
const FEET_TEXT = {
  flat: 'Feet flat on the floor with the heels down, as when wearing flat shoes, sneakers or boots.',
  heels: 'Heels raised and the weight on the balls of the feet, as when wearing high-heeled shoes.',
};

/** Shoes decide the feet: heels raise them, everything else (or no shoes read) keeps them flat. */
export const feetFor = (items) => (items.some((x) => x.category === 'shoes' && /\b(high[- ]?heel|heels?|heeled|stiletto|pumps?|wedges?|platform)\b/i.test(x.description) && !/\bflat\b/i.test(x.description)) ? 'heels' : 'flat');

async function make(body, feet, pose, key, fromFile = null) {
  const other = poseReferencePath(body, feet === 'flat' ? 'heels' : 'flat');
  const fromOther = !fromFile && existsSync(other);
  // --from=<photo>: copy the pose of a photo you like (2026-10-28: a fashion-model pose for women).
  const bare = feet === 'flat' && !process.argv.includes('--sneakers');
  const fromPrompt = `Image 1 shows a person standing in a pose. Make a photo of ${BODY_TEXT[body]}: plain, smooth, matte light grey, no face, no hair, no clothes, no details, standing in EXACTLY the pose of image 1: the same body turn, head angle, shoulders, arms, hands, hips, legs and where each foot stands. ${bare ? 'Bare feet, no shoes: each whole sole, heel to toes, flat on the floor, toes relaxed.' : FEET_TEXT[feet]} Copy only the pose: not the person's look, clothes, shoes or body shape.
Full body from head to feet. Camera straight on at chest height, the figure centred, top of the head about 8% below the top edge, soles about 6% above the bottom edge.
Pure white seamless background, soft even studio light, one soft shadow on the floor under the feet. Portrait 2:3. No text, no props.`;
  const prompt = fromFile ? fromPrompt : fromOther
    ? `Edit image 1. Change ONLY the feet: ${FEET_EDIT[feet === 'flat' && process.argv.includes('--sneakers') ? 'flatShoes' : feet]}
Keep everything else exactly as in image 1: the mannequin, its pose and turn, arms, hands, legs and where the feet stand, the framing, the white background and the soft floor shadow.`
    : `A photo of ${BODY_TEXT[body]}: plain, smooth, matte light grey, no face, no hair, no clothes, no details.
Full body from head to feet. Pose, exactly: ${pose}. ${FEET_TEXT[feet]}
Camera straight on at chest height, the figure centred, top of the head about 8% below the top edge, soles about 6% above the bottom edge.
Pure white seamless background, soft even studio light, one soft shadow on the floor under the feet. Portrait 2:3. No text, no props.`;
  const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  console.log(`Generating the ${body} pose reference, feet ${feet}${fromFile ? ` (pose copied from ${fromFile})` : fromOther ? ' (edit of the ' + (feet === 'flat' ? 'heels' : 'flat') + ' one, same pose)' : ''}…`);
  const source = fromFile ? { mime: /\.jpe?g$/i.test(fromFile) ? 'image/jpeg' : 'image/png', bytes: await readFile(resolve(fromFile)) } : fromOther ? { mime: 'image/png', bytes: await readFile(other) } : null;
  const parts = source ? [{ inlineData: { mimeType: source.mime, data: source.bytes.toString('base64') } }, { text: prompt }] : [{ text: prompt }];
  // --openai: GPT Image (high) instead of Gemini. Gemini got a fashion-model pose "super wrong" (2026-10-28); GPT
  // followed poses and garments much more closely in the image tests.
  let bytes;
  if (process.argv.includes('--openai')) {
    const okey = process.env.OPENAI_API_KEY;
    if (!okey) throw new Error('OPENAI_API_KEY is not set in .env.local');
    const form = new FormData();
    form.append('model', 'gpt-image-2.5-flare'); form.append('prompt', prompt); form.append('size', '1024x1536');
    form.append('quality', 'high'); form.append('output_format', 'png'); form.append('n', '1');
    if (source) form.append('image[]', new Blob([source.bytes], { type: source.mime }), 'source');
    const url = `${process.env.OPENAI_BASE_URL || 'https://api.openai.com'}/v1/images/${source ? 'edits' : 'generations'}`;
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${okey}`, ...(source ? {} : { 'content-type': 'application/json' }) },
      body: source ? form : JSON.stringify({ model: 'gpt-image-2.5-flare', prompt, size: '1024x1536', quality: 'high', output_format: 'png', n: 1 }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message || 'no details'}`);
    if (!json.data?.[0]?.b64_json) throw new Error('OpenAI returned no image; run it again');
    bytes = Buffer.from(json.data[0].b64_json, 'base64');
  } else {
    const res = await fetch(`${base}/v1beta/models/gemini-3.1-flash-image-preview:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '2:3', imageSize: '2K' } } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.message || 'no details'}`);
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    if (!part) throw new Error('Gemini returned no image; run it again');
    bytes = Buffer.from((part.inlineData || part.inline_data).data, 'base64');
  }
  await mkdir(POSE_DIR, { recursive: true });
  const file = poseReferencePath(body, feet);
  await writeFile(file, bytes);
  await writeFile(file.replace(/\.png$/, '.txt'), `${body}, feet ${feet}: ${fromFile ? `pose copied from ${fromFile}` : pose}\n`);
  console.log(`Saved ${file} (~$${process.argv.includes('--openai') ? '0.10–0.20' : '0.10'}).`);
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
    if (arg('from')) { await make(body, feet, pose, key, arg('from')); console.log('Open it in scripts/assets/. For the other feet, run again without --from: it is made as an edit of this one.'); return; }
  }
  if (!todo.length) { console.log('All pose references exist. Delete one to make it again.'); return; }
  for (const [b, f] of todo) await make(b, f, pose, key);
  console.log('Open them in scripts/assets/: commit the good ones, run again for any that are off.');
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; });
