// Image generation test. Drop head-to-toe photos of one person (any file names) in image-test/inputs; the script
// reads the garments in each photo, composes one or more new looks across photos (--looks), then sends the same photos and prompt to
// each image model and measures seconds, tokens and cost.
// Usage: see image-test/README.md. Needs Node 20+ (built-in fetch, FormData, Blob). Keys come from .env.local.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { appendFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { CATEGORIES, composeLooks, mergeLayers, normaliseReading } from './image-test-lib.mjs';
import { checkFaces, checkTable, MIN_IDENTITY } from './face-check/index.mjs';
import { confirmClaims, outfitCheck, photoCheck, poseCheck } from './face-check/look-check.mjs';
import { createHash } from 'node:crypto';
import { cleanBackground, createCleaner, measurePose } from './clean-background.mjs';
import { facePass, faceLock, realFace, referenceFace, HARMONIZE_PROMPT_FILE } from './face-detail.mjs';
import { createFaceModel, findFace } from './face-check/arcface.mjs';
import { feetFor, poseReferencePath } from './make-pose-reference.mjs';
import { MODELS_DIR as FACE_MODELS_DIR } from './face-check/index.mjs';
import './net.mjs'; // retry requests whose connection fails

const ROOT = resolve(import.meta.dirname, '..');
// --person=<name>: use image-test/inputs/people/<name>/ (face-*, outfit photos, optional base.*) instead of inputs/,
// so several people can be tested without moving files around.
const PERSON = process.argv.find((a) => a.startsWith('--person='))?.slice(9) || null;
const INPUTS = PERSON ? join(ROOT, 'image-test', 'inputs', 'people', PERSON) : join(ROOT, 'image-test', 'inputs');
const RESULTS = join(ROOT, 'image-test', 'results');
const PROMPT_FILE = join(ROOT, 'scripts', 'image-test-prompt.txt');
const BASE_PREP_PROMPT_FILE = join(ROOT, 'scripts', 'base-prep-prompt.txt');
const PREPARED_DIR = join(ROOT, 'image-test', 'inputs', 'prepared'); // prepared base photos, reused while the base photo and the prompt stay the same
const EDIT_PROMPT_FILE = join(ROOT, 'scripts', 'image-edit-prompt.txt');

// Models compared. Edit freely.
const MODELS = [
  { key: 'gemini-nano-banana-2', provider: 'gemini', model: 'gemini-3.1-flash-image-preview', aspectRatio: '2:3' },
  { key: 'gemini-nano-banana-pro', provider: 'gemini', model: 'gemini-3-pro-image', aspectRatio: '2:3', optIn: true },
  { key: 'openai-2.5-flare-medium', provider: 'openai', model: 'gpt-image-2.5-flare', size: '1024x1536', quality: 'medium' },
  { key: 'openai-2.5-flare-high', provider: 'openai', model: 'gpt-image-2.5-flare', size: '1024x1536', quality: 'high' },
];

// USD. Estimates only: verify on the providers' pricing pages before trusting totals.
// Gemini 3.1 Flash Image (Nano Banana 2): per image 0.5K $0.045, 1K $0.067, 2K $0.101, 4K $0.151; input $0.50 / 1M tokens.
// Gemini 3 Pro Image (Nano Banana Pro): per image 1K/2K $0.134, 4K $0.24; input $2.00 / 1M tokens.
//   (both from ai.google.dev/gemini-api/docs/pricing, read 2026-10-27)
// GPT Image 2.5: image input $8 / 1M, text input $5 / 1M (virse.ai, Sep 2026); output per square image
//   medium $0.01317, high $0.05268 (virse.ai); portrait 1024x1536 assumed ~1.5x square.
const PRICES = {
  'gemini-nano-banana-2': { inputPerM: 0.5, outputBySize: { '512': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151 } },
  'gemini-nano-banana-pro': { inputPerM: 2, outputBySize: { '1K': 0.134, '2K': 0.134, '4K': 0.24 } },
  // GPT images: cost from the reported tokens, see OPENAI_TOKEN_PRICES.
};

const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function args() {
  const out = { runs: 3, looks: 1, sameLight: true, cleanRefs: true, person: null, bodyCard: true, blankFace: true, realFace: null, openaiSize: null, flex: false, garmentCrops: true, autoBase: true, prep: true, reprep: false, prepModel: null, proFace: false, body: null, background: '#F9F9FB', poseRef: true, facePasses: 2, faceLock: true, clean: true, anchor: null, anchorTries: 3, only: null, dryRun: false, check: true, minIdentity: MIN_IDENTITY, seed: null, reader: 'gemini-3.1-flash-lite', size: '1K', detail: 'max',
    expression: 'copy it exactly from the front face photo, including any slight smile; no smile or seriousness that photo does not have', occasion: 'an office day', weather: 'sunny 24°C', time: 'Monday morning',
    shoes: 'plain white leather low-top sneakers with white soles and white laces',
    pose: HOUSE_POSE };
  for (const a of process.argv.slice(2)) {
    const [k, ...rest] = a.replace(/^--/, '').split('='); const v = rest.join('=');
    if (k === 'runs') out.runs = Math.max(1, Math.min(10, parseInt(v, 10) || 3));
    else if (k === 'only') out.only = v;
    else if (k === 'looks') out.looks = Math.max(1, Math.min(8, parseInt(v, 10) || 1));
    else if (k === 'dry-run') out.dryRun = true;
    else if (k === 'no-check') out.check = false;
    else if (k === 'no-prep') out.prep = false;
    else if (k === 'reprep') out.reprep = true;
    else if (k === 'prepared') out.prepared = v;
    else if (k === 'prep-model') out.prepModel = v;
    else if (k === 'openai-size') { if (!/^\d{3,4}x\d{3,4}$/.test(v)) throw new Error('--openai-size=WIDTHxHEIGHT, e.g. 1536x2304'); out.openaiSize = v; }
    else if (k === 'hd') out.openaiSize = '1536x2304';
    else if (k === 'flex') out.flex = true;
    else if (k === 'no-garment-crops') out.garmentCrops = false;
    else if (k === 'no-auto-base') out.autoBase = false;
    else if (k === 'no-body-card') out.bodyCard = false;
    else if (k === 'no-same-light') out.sameLight = false;
    else if (k === 'no-blank-face') out.blankFace = false;
    else if (k === 'no-anchor') out.anchor = false;
    else if (k === 'anchor') out.anchor = true;
    else if (k === 'no-clean-refs') out.cleanRefs = false;
    else if (k === 'no-clean') out.clean = false;
    else if (k === 'background') { if (!/^#[0-9a-f]{6}$/i.test(v)) throw new Error('--background must be a colour like #F9F9FB'); out.background = v; }
    else if (k === 'no-face-lock') out.faceLock = false;
    else if (k === 'pro-face') out.proFace = true;
    else if (k === 'no-real-face') out.realFace = false;
    else if (k === 'real-face') out.realFace = true;
    else if (k === 'no-pose-ref') out.poseRef = false;
    else if (k === 'body') { if (!['female', 'male'].includes(v)) throw new Error('--body must be female or male'); out.body = v; }
    else if (k === 'face-passes') out.facePasses = Math.max(0, Math.min(4, parseInt(v, 10) || 0));
    else if (k === 'anchor-tries') out.anchorTries = Math.max(1, Math.min(5, parseInt(v, 10) || 3));
    else if (k === 'min-identity') { out.minIdentity = Number(v); if (!(out.minIdentity > 0 && out.minIdentity < 1)) throw new Error('--min-identity must be between 0 and 1'); }
    else if (k === 'seed') out.seed = parseInt(v, 10) || 1;
    else if (k === 'reader-model') out.reader = v;
    else if (k === 'detail') { if (!['default', 'max'].includes(v)) throw new Error('--detail must be max or default'); out.detail = v; }
    else if (k === 'size') { if (!['512', '1K', '2K', '4K'].includes(v)) throw new Error('--size must be 512, 1K, 2K or 4K'); out.size = v; }
    else if (k in out) out[k] = v;
    else throw new Error(`Unknown option --${k}`);
  }
  return out;
}

const MAX_PHOTOS = 10;
const HOUSE_POSE = 'relaxed standing pose: body turned about 15 degrees so their left shoulder is slightly closer to the camera, head turned back to face the camera, chin level, eyes looking into the lens; weight on the back (right) leg, front (left) knee slightly relaxed, feet about hip-width apart; both arms hanging loosely at the sides, elbows very slightly bent, hands open and relaxed beside the thighs, never in pockets; shoulders relaxed and level';
// Women: Felipe's own mannequins (2026-10-28), described to match them. Flat: a relaxed contrapposto (weight on the
// right leg, left knee soft, foot turned out). Heels: the left leg crossed in front. Keep words and images in step.
const FEMALE_POSES = {
  flat: 'relaxed model stance facing the camera, head straight, chin level; weight on the right leg, which is straight; the left knee softly bent and the left foot set a little to the side with the toes turned out; hips slightly shifted over the standing leg; both arms hanging a little away from the body, elbows soft, hands relaxed with the fingers gently curled beside the thighs, never in pockets; shoulders relaxed, down and level',
  heels: 'fashion-model pose facing the camera, head straight, chin level; weight on the right leg, the left leg crossed in front of it with the knee turned in and the left foot set just in front of the right foot, heels raised; both arms hanging loosely at the sides, hands open and relaxed beside the thighs, never in pockets; shoulders relaxed and down',
};
const BASE_POSE_TOLERANCE = 0.04; // edits of a base photo: GPT moved the feet 1–7% of the height on edits that looked right (2026-10-28)
const POSE_TOLERANCE = 0.025; // was 0.01: GPT looks Felipe judged right were 0.015–0.023 off and were all redone (2026-10-28)
// Feet position difference allowed (share of the height) between a fresh look and the pose reference or look 1.

// Phone photos are 4–11 MB and often stored sideways with a rotation flag (EXIF orientation). Every photo is turned
// upright and, if large, resized to max 2048 px like the app would. Seen 2026-10-27: macOS sips dropped the rotation
// flag and the model received a sideways mirror selfie.
const MAX_SIDE = 2048;
let scratch = null; // kept for the cleanup at exit
async function shrink(img) {
  let sharp;
  try { sharp = (await import('sharp')).default; } catch {
    if (!shrink.warned) { console.warn('Could not load sharp (npm install); sending photos as they are, which may be sideways, slow or too large.'); shrink.warned = true; }
    return img;
  }
  const meta = await sharp(img.bytes).metadata();
  const turned = (meta.orientation || 1) > 1, big = img.bytes.length > 1_500_000 || Math.max(meta.width, meta.height) > MAX_SIDE;
  if (!turned && !big) return img;
  const bytes = await sharp(img.bytes).rotate().resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return { ...img, bytes, mime: 'image/jpeg', resized: `${(img.bytes.length / 1e6).toFixed(1)} MB → ${(bytes.length / 1e6).toFixed(1)} MB${turned ? ', turned upright' : ''}` };
}

const FACE_LABELS = { 'face-front': 'face close-up, front', 'face-left': 'face close-up, left side', 'face-right': 'face close-up, right side' };
const MAX_FACES = 8;

/** Faces first (every file starting with "face-": the three onboarding photos or frames from a video), then every
 *  other photo as a head-to-toe outfit photo. */
async function loadInputs() {
  if (!existsSync(INPUTS)) throw new Error(`Missing folder ${INPUTS}${PERSON ? ' (make it and put that person\'s face-* and outfit photos in it)' : ''}`);
  const all = (await readdir(INPUTS)).filter((f) => !f.startsWith('.')).sort();
  const heic = all.filter((f) => /\.(heic|heif)$/i.test(f));
  if (heic.length) console.warn(`Skipping ${heic.join(', ')}: HEIC is not supported. Export as JPG (AirDrop > Options > Most Compatible).`);
  const files = all.filter((f) => MIME[extname(f).toLowerCase()]);
  const load = async (f) => shrink({ file: f, bytes: await readFile(join(INPUTS, f)), mime: MIME[extname(f).toLowerCase()] });
  const order = (f) => { const k = f.toLowerCase().replace(/\.[^.]+$/, ''); const fixed = Object.keys(FACE_LABELS).indexOf(k); return fixed >= 0 ? fixed : 10 + (parseInt(k.replace(/\D+/g, ''), 10) || 0); };
  const faceFiles = files.filter((f) => /^face-/i.test(f)).sort((a, b) => order(a) - order(b));
  if (!faceFiles.length) throw new Error('Add face photos to image-test/inputs: face-front/face-left/face-right, or face-1, face-2… (npm run faces-from-video makes these from a video)');
  if (faceFiles.length > MAX_FACES) throw new Error(`Use at most ${MAX_FACES} face photos (found ${faceFiles.length})`);
  const faces = [];
  for (const [i, f] of faceFiles.entries()) {
    faces.push({ ...(await load(f)), label: FACE_LABELS[f.toLowerCase().replace(/\.[^.]+$/, '')] || `face close-up ${i + 1} of ${faceFiles.length}` });
  }
  // Base photo (base.jpg / base-*.png …): one real full-body photo of the person; looks then only change its clothes.
  const baseFile = files.find((f) => /^base([-.]|$)/i.test(f));
  const base = baseFile ? { ...(await load(baseFile)), label: 'base photo' } : null;
  const outfitFiles = files.filter((f) => !faces.some((x) => x.file === f) && f !== baseFile);
  if (!outfitFiles.length) throw new Error('Add head-to-toe photos of the same person in different outfits to image-test/inputs (any file names)');
  if (outfitFiles.length > MAX_PHOTOS) throw new Error(`Use at most ${MAX_PHOTOS} outfit photos (found ${outfitFiles.length})`);
  const outfits = [];
  for (const f of outfitFiles) outfits.push(await load(f));
  return { faces, outfits, base, images: [...faces, ...outfits] };
}

// Body card: the person's build in words, read once from the full-body outfit photos. The base photo only had those
// photos as one hint among many and could miss someone's build (Felipe, 2026-10-28: "can we also match height and
// body shape?"). A photo has no scale, so height and weight can only come from the person: image-test/inputs/body.txt
// (or people/<name>/body.txt), e.g. "height 182 cm, weight 78 kg", is added to the card when present.
const BODY_PROMPT = `These photos show one person, head to toe, in different clothes. Describe their body precisely and neutrally, so an artist could draw the same body: never flattering, never judging. Ignore the clothes' cut where you can (loose clothes hide shape; say so if you cannot tell).
build: overall build in plain words (e.g. "slim", "lean and athletic", "average", "broad and muscular", "soft and rounded", "heavy-set").
shoulders: width compared with the hips, and slope.
torso: chest, waist and belly, and how long the torso is compared with the legs.
hips: width and shape.
arms: thickness and muscle.
legs: length compared with the torso, thickness and shape.
posture: how they carry themselves (e.g. "upright", "slightly rounded shoulders").`;
const BODY_SCHEMA = { type: 'OBJECT', properties: Object.fromEntries(['build', 'shoulders', 'torso', 'hips', 'arms', 'legs', 'posture'].map((k) => [k, { type: 'STRING' }])), required: ['build', 'shoulders', 'torso', 'hips', 'arms', 'legs', 'posture'] };
async function readBody(outfits, model) {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [...outfits.map((o) => ({ inlineData: { mimeType: o.mime, data: o.bytes.toString('base64') } })), { text: BODY_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: BODY_SCHEMA, temperature: 0 } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Reading the body failed (${res.status}): ${json.error?.message || 'no details'}`);
  const c = JSON.parse(json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
  const parts = ['build', 'shoulders', 'torso', 'hips', 'arms', 'legs', 'posture'].filter((k) => typeof c[k] === 'string' && c[k].trim()).map((k) => `${k} ${c[k].trim()}`);
  return parts.length ? parts.join('; ') + '.' : null;
}

// Identity card: what the person looks like, in words, read once from the face photos. Image models drifted on what
// they can name (2026-10-27: dark brown hair with caramel ends came out auburn, a soft smile came out stern), so the
// prompt states it explicitly.
const CARD_PROMPT = `These are close-up photos of one person. Describe how they look, precisely, so an artist could paint them from your words. Use exact colour words and be specific, never flattering.
hair: colour from roots to ends (e.g. "dark chestnut brown, lighter caramel ends"), length, texture, parting and how it falls.
skin: tone and undertone, texture, freckles, moles, lines.
eyes: colour, shape, eyelids; eyebrows: colour, thickness, shape.
face: shape, jaw, nose, lips, anything distinctive.
expression: their natural resting expression in these photos (e.g. "soft closed-mouth smile", "neutral, lips relaxed").
age: apparent age range.
extras: glasses, facial hair, earrings or piercings they wear in every photo; empty if none.`;
const CARD_SCHEMA = { type: 'OBJECT', properties: Object.fromEntries(['hair', 'skin', 'eyes', 'face', 'expression', 'age', 'extras'].map((k) => [k, { type: 'STRING' }])), required: ['hair', 'skin', 'eyes', 'face', 'expression', 'age', 'extras'] };

async function readIdentity(faces, model) {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [...faces.map((f) => ({ inlineData: { mimeType: f.mime, data: f.bytes.toString('base64') } })), { text: CARD_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: CARD_SCHEMA, temperature: 0 } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Reading the face photos failed (${res.status}): ${json.error?.message || 'no details'}`);
  const c = JSON.parse(json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const parts = [['hair', c.hair], ['skin', c.skin], ['eyes', c.eyes], ['face', c.face], ['natural expression', c.expression], ['age', c.age], ['always wears', c.extras]]
    .filter(([, v]) => str(v)).map(([k, v]) => `${k} ${str(v)}`);
  return parts.length ? parts.join('; ') + '.' : null;
}

// Step 1: read the garments in each photo with a cheap vision model (Gemini Flash-Lite).
const READER_PROMPT = `This photo should show one person, head to toe. List every piece of clothing and footwear they are wearing.
For each item give:
- category: one of ${CATEGORIES.join(', ')} (outerwear = jacket, blazer, coat; top = shirt, t-shirt, sweater, blouse; bottom = trousers, jeans, skirt, shorts)
- description: 4 to 10 words with colour, pattern, material and cut, e.g. "brown houndstooth tweed single-breasted blazer"
- visibility: "full" if the whole item is visible, "partial" if partly hidden or cropped, "hidden" if you can barely see it
- box: a tight box around the item as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the photo (for shoes, one box around both)
- formality: 1 lounge/beach/sport, 2 casual (t-shirt, jeans, sneakers), 3 smart casual (blouse, chinos, loafers), 4 business (tailoring, shirt dress with sleeves, pumps), 5 formal/evening (gown, strapless or sequinned dress, stilettos)
- exposure: how much skin the item shows as worn: "low" (covered), "medium" (sleeveless, knee-length, a short slit), "high" (strapless, plunging neckline, cut-outs, sheer, mini length, open to the thigh, crop top)
- season: "warm" if only for warm weather (sandals, linen, sleeveless, shorts), "cold" if only for cold weather (wool coat, heavy knit, lined boots), else "any"
List items worn under or inside others too, e.g. a skirt or shorts under an open shirt dress, a t-shirt under a sheer top: each as its own item with its own box.
Colours: name the garment's own colour (metallic gold vs silver, cream vs white), as it would look in daylight: ignore coloured room light, e.g. a beige jacket lit pink on one side and yellow on the other is beige. When unsure, use the broader word ("metallic").
Also say whether the person is visible head to toe (full_body), how many people are in the photo (people), and which mannequin build best matches their body, female or male (figure; used only to pick a pose reference).`;

const READER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    full_body: { type: 'BOOLEAN' },
    people: { type: 'INTEGER' },
    figure: { type: 'STRING', enum: ['female', 'male'] },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      category: { type: 'STRING', enum: CATEGORIES },
      description: { type: 'STRING' },
      visibility: { type: 'STRING', enum: ['full', 'partial', 'hidden'] },
      box: { type: 'ARRAY', items: { type: 'INTEGER' } },
      formality: { type: 'INTEGER' },
      exposure: { type: 'STRING', enum: ['low', 'medium', 'high'] },
      season: { type: 'STRING', enum: ['warm', 'any', 'cold'] },
    }, required: ['category', 'description', 'visibility', 'formality', 'exposure', 'season'] } },
  },
  required: ['full_body', 'people', 'items'],
};

async function readPhoto(img, index, model) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local (needed to read the garments)');
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: img.mime, data: img.bytes.toString('base64') } }, { text: READER_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: READER_SCHEMA, temperature: 0 },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Reading ${img.file} failed (${model}, ${res.status}): ${json.error?.message || 'no details'}. Try --reader-model=gemini-3.5-flash-lite`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '{}';
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Could not understand the reading of ${img.file}: ${text.slice(0, 200)}`); }
  const u = json.usageMetadata || {};
  const cost = ((u.promptTokenCount || 0) * 0.25 + (u.candidatesTokenCount || 0) * 1.5) / 1e6; // gemini-3.1-flash-lite list price
  return { fullBody: parsed.full_body !== false, people: parsed.people ?? 1, figure: parsed.figure, items: mergeLayers(normaliseReading(parsed, index)), cost };
}

async function readWardrobe(images, model) {
  const readings = await Promise.all(images.map((img, i) => readPhoto(img, i, model)));
  readings.forEach((r, i) => {
    if (!r.fullBody) console.warn(`Note: ${images[i].file} does not look head to toe.`);
    if (r.people !== 1) console.warn(`Note: ${images[i].file} seems to show ${r.people} people.`);
  });
  return { readings, wardrobe: readings.flatMap((r) => r.items), cost: readings.reduce((s, r) => s + r.cost, 0) };
}

const range = (a, b) => (a === b ? `${a}` : b === a + 1 ? `${a} and ${b}` : `${a} to ${b}`);

function buildPrompt(template, faces, outfits, outfit, opts) {
  const f = faces.length;
  const lines = outfit.items.map((x) => `  - the ${x.description} (${x.category}) from image ${f + x.photo + 1}`);
  // The photo must show the feet. Without identified shoes we name exact plain ones: left free, the model invented brands (New Balance).
  if (!outfit.items.some((x) => x.category === 'shoes')) {
    lines.push(`  - shoes: none were identified in the photos, so use exactly these: ${opts.shoes}. Nothing on them: no logo, stripe, emblem, tab or text`);
  }
  const garments = lines.join('\n');
  return template.replace('{{FACE_IMAGES}}', range(1, f)).replace('{{BODY_IMAGES}}', range(f + 1, f + outfits.length))
    .replace('{{GARMENTS}}', garments)
    .replace('{{OCCASION}}', opts.occasion).replace('{{WEATHER}}', opts.weather).replace('{{TIME}}', opts.time)
    .replace('{{IDENTITY_CARD}}', opts.identityCard || 'see the face photos').replace('{{POSE}}', opts.poseImage ? `exactly the pose and framing of image ${opts.poseImage} (a faceless mannequin: copy only how it stands and where it is in the frame, never its look): ${opts.pose}` : opts.pose).replace('{{EXPRESSION}}', opts.expression);
}

/** What each image is for, sent next to the image (Gemini) or listed after the prompt (OpenAI). */
function imageLabel(faces, outfit, i) {
  if (i < faces.length) return faces[i].label;
  const take = outfit.items.filter((x) => x.photo === i - faces.length).map((x) => x.description);
  return take.length ? `this person head to toe; take only the ${take.join(' and the ')} from this photo` : 'this person head to toe, for body and hair only';
}

/** Look 2+ in anchor mode: image 1 is the accepted first look; the other images are only the photos this look takes
 *  garments from. Everything but the clothes is kept from image 1, so face, pose and shadow are the same in every look. */
function buildEdit(template, outfits, look, anchor, takeOff = [], rendered = new Map()) {
  // Each garment with a close-up crop is sent on its own; garments without one come from their whole photo.
  const images = [anchor], labels = ['the finished photo to edit: keep everything except the clothes'], lines = [];
  const photoImage = new Map();
  // A garment already painted in an accepted look of this run is sent again as that look, so it gets the same light,
  // shading and colour every time (2026-10-28: the same shirt dress came out with different light in looks 1 and 2).
  const earlier = new Map();
  for (const x of look.items) {
    const prev = rendered.get(x.description);
    if (!prev) continue;
    if (!earlier.has(prev.n)) { images.push({ file: prev.file, bytes: prev.bytes, mime: 'image/png' }); earlier.set(prev.n, { at: images.length, items: [] }); labels.push(null); }
    earlier.get(prev.n).items.push(x.description);
  }
  for (const { at, items } of earlier.values()) labels[at - 1] = `an earlier finished photo of this person already wearing the ${items.join(' and the ')}: paint ${items.length > 1 ? 'them' : 'it'} with exactly the same light, shading, colour, texture and drape as here; take nothing else from this photo`;
  const seenIn = (x) => [...earlier.entries()].find(([, e]) => e.items.includes(x.description))?.[1].at;
  for (const x of look.items) {
    if (x.crop && seenIn(x)) {
      images.push(x.crop); labels.push(`a close-up of the ${x.description} (${x.category}): copy only this garment exactly; ignore any other garment, bag, strap or hand in this close-up`);
      lines.push(`  - the ${x.description} (${x.category}) shown in image ${images.length}; it already appears in image ${seenIn(x)}: make it look exactly as it does there (same light, shading and colour)`);
      continue;
    }
    if (x.crop) {
      images.push(x.crop); labels.push(`a close-up of the ${x.description} (${x.category}): copy only this garment exactly; ignore any other garment, bag, strap or hand in this close-up`);
      lines.push(`  - the ${x.description} (${x.category}) shown in image ${images.length}`);
      continue;
    }
    if (!photoImage.has(x.photo)) { images.push(outfits[x.photo]); photoImage.set(x.photo, images.length); labels.push(null); }
    lines.push(`  - the ${x.description} (${x.category}) from image ${photoImage.get(x.photo)}`);
  }
  for (const [photo, n] of photoImage) labels[n - 1] = `take only the ${look.items.filter((x) => x.photo === photo && !x.crop).map((x) => x.description).join(' and the ')} from this photo`;
  if (!look.items.some((x) => x.category === 'shoes')) lines.push('  - shoes: keep the shoes from image 1 exactly as they are');
  const label = (i) => labels[i];
  const off = takeOff.length ? `TAKE OFF what image 1 wears now: ${takeOff.join('; ')} (unless the same item is listed below).\n\n` : '';
  return { prompt: template.replace('{{GARMENTS}}', lines.join('\n')).replace('CHANGE THE CLOTHES TO', off + 'CHANGE THE CLOTHES TO'), images, label };
}

/** Close-up of one garment: its box from the reader plus 6% margin, at most GARMENT_SIDE px, JPEG. About 70% of a GPT
 *  look's cost was the photos sent in (2026-10-28: ~4,900 image tokens per look); whole 2048 px outfit photos carried
 *  the person, the other garments and background for nothing. */
const GARMENT_SIDE = 1024;
async function garmentCrop(photo, item) {
  const sharp = (await import('sharp')).default;
  const { width: W, height: H } = await sharp(photo.bytes).metadata();
  const [y0, x0, y1, x1] = item.box, mx = (x1 - x0) * 0.06, my = (y1 - y0) * 0.06;
  const left = Math.max(0, Math.floor((x0 - mx) / 1000 * W)), top = Math.max(0, Math.floor((y0 - my) / 1000 * H));
  const width = Math.min(W - left, Math.ceil((x1 - x0 + 2 * mx) / 1000 * W)), height = Math.min(H - top, Math.ceil((y1 - y0 + 2 * my) / 1000 * H));
  const bytes = await sharp(photo.bytes).extract({ left, top, width, height }).resize(GARMENT_SIDE, GARMENT_SIDE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  return { file: `garment-${item.photo + 1}-${item.category}.jpg`, bytes, mime: 'image/jpeg' };
}

async function callGemini(m, images, prompt, label, opts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local');
  const parts = [];
  // How closely Gemini looks at each photo (per-part media resolution). Image models default to low detail
  // (~280 tokens per photo in our runs); "max" asks for the most detail on faces and high detail on the rest.
  const detail = (i) => (opts.detail !== 'max' ? null : { level: i < opts.faceCount ? 'MEDIA_RESOLUTION_ULTRA_HIGH' : 'MEDIA_RESOLUTION_HIGH' });
  const build = (withDetail) => {
    const parts = [];
    images.forEach((img, i) => {
      parts.push({ text: `Image ${i + 1} (${label(i)}):` });
      const part = { inlineData: { mimeType: img.mime, data: img.bytes.toString('base64') } };
      if (withDetail && detail(i)) part.mediaResolution = detail(i);
      parts.push(part);
    });
    parts.push({ text: prompt });
    return parts;
  };
  const makeBody = (withDetail) => JSON.stringify({
    contents: [{ role: 'user', parts: build(withDetail) }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: m.aspectRatio, imageSize: opts.size } },
  });
  let body = makeBody(true);
  const post = (model) => fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body,
  });
  let model = m.model;
  let res = await post(model);
  if (res.status === 404) { // model ids move between "-preview" and stable names; try the other spelling once
    const alt = model.endsWith('-preview') ? model.replace(/-preview$/, '') : model + '-preview';
    const retry = await post(alt);
    if (retry.status !== 404) { console.log(`(using ${alt})`); model = m.model = alt; res = retry; }
  }
  if (res.status === 400 && opts.detail === 'max') { // model may not accept per-photo detail: say so and retry without
    const err = await res.clone().json().catch(() => ({}));
    if (/media.?resolution/i.test(err.error?.message || '')) {
      console.log(`(${model} does not accept per-photo detail; sending without it)`);
      body = makeBody(false); res = await post(model);
    }
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 300)}`);
  const cand = json.candidates?.[0];
  const imgPart = cand?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  if (!imgPart) {
    const text = cand?.content?.parts?.map((p) => p.text).filter(Boolean).join(' ');
    throw new Error(`Gemini returned no image (finishReason ${cand?.finishReason || json.promptFeedback?.blockReason || 'unknown'})${text ? ': ' + text.slice(0, 200) : ''}`);
  }
  const data = (imgPart.inlineData || imgPart.inline_data).data;
  const u = json.usageMetadata || {};
  const p = PRICES[m.key];
  // Some responses omit promptTokenCount; fall back to the per-modality breakdown, and keep the raw usage for checking.
  const fromDetails = Array.isArray(u.promptTokensDetails) ? u.promptTokensDetails.reduce((n, d) => n + (d.tokenCount || 0), 0) : null;
  const fromTotal = u.totalTokenCount && u.candidatesTokenCount ? u.totalTokenCount - u.candidatesTokenCount - (u.thoughtsTokenCount || 0) : null;
  const inputTokens = u.promptTokenCount ?? (fromDetails || fromTotal || null);
  return {
    usage: u,
    image: Buffer.from(data, 'base64'),
    tokens: { input: inputTokens, output: u.candidatesTokenCount ?? null },
    cost: p ? (p.outputBySize[opts.size] ?? null) + (inputTokens || 0) / 1e6 * p.inputPerM : null,
  };
}

// GPT Image 2.5 token prices (developers.openai.com/api/docs/models/gpt-image-2.5-flare, read 2026-10-28), USD per 1M:
// text in $5, image in $8, image out $30 on Standard. Flex is billed at Batch rates (half). The cost of a GPT image is
// computed from the tokens OpenAI reports, so it matches the bill (the earlier fixed per-image estimate did not).
const OPENAI_TOKEN_PRICES = { standard: { textIn: 5, imageIn: 8, out: 30 }, flex: { textIn: 2.5, imageIn: 4, out: 15 } };
export const openaiCost = (u, tier = 'standard') => {
  const p = OPENAI_TOKEN_PRICES[tier] || OPENAI_TOKEN_PRICES.standard;
  const img = u.input_tokens_details?.image_tokens ?? 0, txt = u.input_tokens_details?.text_tokens ?? Math.max(0, (u.input_tokens ?? 0) - img);
  return (txt * p.textIn + img * p.imageIn + (u.output_tokens ?? 0) * p.out) / 1e6;
};

let flexRefused = false;
async function callOpenAI(m, images, prompt, label, opts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set in .env.local');
  const size = opts.openaiSize || m.size;
  const send = async (tier) => {
    const form = new FormData();
    form.append('model', m.model);
    form.append('prompt', prompt + '\n\nThe images are given in order: ' + images.map((x, i) => `${i + 1} = ${label(i)}`).join('; ') + '.');
    form.append('size', size);
    form.append('quality', m.quality);
    form.append('output_format', 'png');
    form.append('n', '1');
    if (tier === 'flex') form.append('service_tier', 'flex');
    if (m.inputFidelity) form.append('input_fidelity', m.inputFidelity);
    for (const img of images) form.append('image[]', new Blob([img.bytes], { type: img.mime }), img.file);
    // Flex can be slow: allow 15 minutes (OpenAI's own advice), standard 5.
    const res = await fetch(`${OPENAI_BASE}/v1/images/edits`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(tier === 'flex' ? 900_000 : 300_000) });
    return { res, json: await res.json().catch(() => ({})) };
  };
  let tier = opts.flex && !flexRefused ? 'flex' : 'standard';
  let { res, json } = await send(tier);
  // Flex: 429 "resource unavailable" is not charged; fall back to standard so the run finishes. Flex not offered for
  // this model (400 mentioning service_tier/flex): say so once and use standard.
  if (tier === 'flex' && !res.ok && (res.status === 429 || /service.?tier|flex/i.test(json.error?.message || ''))) {
    console.log(`(flex unavailable: ${res.status} ${json.error?.message || ''}; using standard) `);
    // 2026-10-28: the Images API answered 400 "Unknown parameter: 'service_tier'": Flex does not exist for image edits.
    if (res.status === 400) { flexRefused = true; console.log('(Flex is not offered for image edits: standard for the rest of this run) '); }
    tier = 'standard';
    ({ res, json } = await send(tier));
  }
  // Refusals (2026-10-28: a sheer lace top, every run) are not retried: the same garments are refused again.
  if (!res.ok && /safety system/i.test(json.error?.message || '')) throw Object.assign(new Error('refused by OpenAI\'s safety system (likely a sheer or revealing garment); look skipped'), { refused: true });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 300)}`);
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image');
  const u = json.usage || {};
  const billedTier = json.service_tier || tier;
  return {
    image: Buffer.from(b64, 'base64'),
    usage: { ...u, service_tier: billedTier, size, quality: m.quality },
    tier: billedTier,
    tokens: { input: u.input_tokens ?? null, inputImage: u.input_tokens_details?.image_tokens ?? null, output: u.output_tokens ?? null },
    cost: json.usage ? openaiCost(u, billedTier === 'flex' ? 'flex' : 'standard') : null,
  };
}

const fmt = (x, d = 3) => (x == null ? '–' : typeof x === 'number' ? x.toFixed(d) : String(x));

async function main() {
  const opts = args();
  const { faces, outfits, base: photoBase, images } = await loadInputs();
  let base = photoBase;
  console.log(`Faces: ${faces.map((x) => x.file).join(', ')}`);
  const resized = images.filter((x) => x.resized);
  if (resized.length) console.log(`Resized ${resized.length} photo(s) to max ${MAX_SIDE} px: ${resized.map((x) => `${x.file} ${x.resized}`).join(', ')}`);
  const totalMB = images.reduce((n, x) => n + x.bytes.length, 0) / 1e6;
  console.log(`Upload per request: ${totalMB.toFixed(1)} MB`);
  console.log(`Reading the garments in ${outfits.length} outfit photo(s) with ${opts.reader}…`);
  const [{ readings, wardrobe, cost: readCost }, identityCard, bodyRead] = await Promise.all([readWardrobe(outfits, opts.reader),
    readIdentity(faces, opts.reader).catch((e) => { console.log(`(identity card skipped: ${e.message})`); return null; }),
    opts.bodyCard ? readBody(outfits, opts.reader).catch((e) => { console.log(`(body card skipped: ${e.message})`); return null; }) : null]);
  const bodyOwn = existsSync(join(INPUTS, 'body.txt')) ? (await readFile(join(INPUTS, 'body.txt'), 'utf8')).trim() : null;
  opts.bodyText = [bodyRead, bodyOwn ? `Stated by the person: ${bodyOwn}.` : null].filter(Boolean).join(' ') || null;
  if (bodyRead) await writeFile(join(INPUTS, 'body-read.txt'), bodyRead + '\n').catch(() => {});
  if (opts.bodyText) console.log(`Body card: ${opts.bodyText}${bodyOwn ? '' : '\n  (add body.txt next to the photos, e.g. "height 182 cm, weight 78 kg", to state height and weight)'}`);
  // image-test/inputs/identity.txt, if present, replaces the card: the person can correct how they are described.
  const own = join(INPUTS, 'identity.txt');
  opts.identityCard = existsSync(own) ? (await readFile(own, 'utf8')).trim() : identityCard;
  if (existsSync(own)) console.log('Identity card: using image-test/inputs/identity.txt');
  else if (identityCard) await writeFile(join(INPUTS, 'identity-read.txt'), identityCard + '\n').catch(() => {});
  if (identityCard && !existsSync(join(INPUTS, 'identity.txt'))) console.log(`Identity card: ${identityCard}\n  (saved as image-test/inputs/identity-read.txt; correct it and save it as identity.txt to use your own words)`);
  readings.forEach((r, i) => console.log(`  photo ${i + 1} = image ${faces.length + i + 1}, ${outfits[i].file}: ${r.items.map((x) => `${x.description} [${x.category}${x.visibility === 'full' ? '' : ', ' + x.visibility}]`).join('; ') || 'nothing recognised'}`));
  const seed = opts.seed ?? (Date.now() % 100000);
  const looks = composeLooks(wardrobe, { count: opts.looks, seed, occasion: opts.occasion, weather: opts.weather });
  if (looks.skipped.length) console.log(`Left out for "${opts.occasion}" / "${opts.weather}" (${looks.occasion.name}): ${looks.skipped.map((x) => `${x.description} (${x.why})`).join('; ')}`);
  if (looks.length < opts.looks) console.warn(`Only ${looks.length} different look(s) are possible from these photos (asked for ${opts.looks}).`);
  // Pose reference (npm run make-pose-reference): a mannequin in the house pose, matching the body and the shoes of the
  // look (heels raise the feet), sent with the first image of each look set.
  const votes = readings.map((r) => r.figure).filter(Boolean);
  const body = opts.body || (votes.filter((v) => v === 'male').length > votes.length / 2 ? 'male' : 'female');
  // Women stand in a fashion-model pose (Felipe, 2026-10-28), men in the house pose; --pose=... overrides both.
  const femalePoses = body === 'female' && opts.pose === HOUSE_POSE;
  const poseText = (feet) => (femalePoses ? FEMALE_POSES[feet] || FEMALE_POSES.flat : opts.pose);
  if (femalePoses) opts.pose = FEMALE_POSES.flat;
  const warned = new Set();
  const poseFor = async (look) => {
    if (!opts.poseRef) return null;
    const feet = feetFor(look.items), file = poseReferencePath(body, feet);
    if (!existsSync(file)) { if (warned.has(file)) return null; warned.add(file); console.log(`No pose reference for ${body}, feet ${feet} (npm run make-pose-reference -- --body=${body} --feet=${feet}): pose in words only.`); return null; }
    return { file: `pose-reference-${body}-${feet}.png`, bytes: await readFile(file), mime: 'image/png', body, feet };
  };
  console.log(`Body for the pose reference: ${body}${opts.body ? '' : ' (read from the photos; --body=female|male to set it)'}`);
  const template = await readFile(PROMPT_FILE, 'utf8');
  for (const [i, look] of looks.entries()) {
    look.n = i + 1;
    look.pose = await poseFor(look);
    look.images = look.pose ? [...images, look.pose] : images;
    look.prompt = buildPrompt(template, faces, outfits, look, { ...opts, pose: poseText(feetFor(look.items)), poseImage: look.pose ? look.images.length : null });
    look.label = (k) => (look.pose && k === images.length ? 'pose reference: a faceless mannequin; copy only its pose and framing' : imageLabel(faces, look, k));
    console.log(`Look ${look.n} (seed ${seed}${look.newCombination ? '' : ', NOT a new combination: add photos with other outfits'}):`);
    look.items.forEach((x) => console.log(`  - ${x.description} (${x.category}) from photo ${x.photo + 1} (${outfits[x.photo].file})`));
  }
  console.log(`Reading cost: ~$${readCost.toFixed(4)}`);
  opts.faceCount = faces.length;
  const wanted = opts.only ? opts.only.split(',') : null;
  const models = MODELS.filter((m) => (wanted ? wanted.some((w) => w === m.key || (w === m.provider && !m.optIn)) : !m.optIn));
  if (!models.length) throw new Error(`--only=${opts.only} matches no model. Use gemini, openai or model keys: ${MODELS.map((m) => m.key).join(', ')}`);

  console.log(`Models: ${models.map((m) => m.key).join(', ')} × ${looks.length} look(s) × ${opts.runs} run(s), Gemini size ${opts.size}, photo detail ${opts.detail}`);
  if (opts.dryRun) { console.log('\n--- prompt (look 1) ---\n' + looks[0].prompt + '\n\nDry run: no images generated. Use the same --seed to generate these looks.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = join(RESULTS, PERSON ? `${stamp}-${PERSON.replace(/[^\w-]+/g, '_')}` : stamp);
  await mkdir(out, { recursive: true });
  // Everything printed also goes to run.log (rejection reasons and timings were lost when only the terminal had them).
  const logPath = join(out, 'run.log');
  for (const stream of [process.stdout, process.stderr]) {
    const write = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => { try { appendFileSync(logPath, chunk); } catch {} return write(chunk, ...rest); };
  }
  for (const img of images) { img.refName = 'ref-' + (img.resized ? img.file.replace(/\.[^.]+$/, '.jpg') : img.file); await writeFile(join(out, img.refName), img.bytes); }
  await writeFile(join(out, 'prompt.txt'), looks.map((l) => (looks.length > 1 ? `=== Look ${l.n} ===\n` : '') + l.prompt).join('\n\n'));
  await writeFile(join(out, 'wardrobe.json'), JSON.stringify({ seed, readerModel: opts.reader, faces: faces.map((x) => x.file), readings: readings.map((r, i) => ({ file: outfits[i].file, ...r })), looks: looks.map(({ prompt, label, images: _i, ...l }) => l) }, (k, v) => (k === 'bytes' || v?.type === 'Buffer' ? undefined : v), 2));

  let cleaner = null;
  if (opts.clean) {
    try { cleaner = await createCleaner(join(ROOT, 'image-test', 'models')); }
    catch (e) { console.log(`Background cleaning skipped: ${e.message}`); }
  }
  // Outfit photos are cut out onto a plain background before they are sent: clutter in mirror selfies (a red table, a
  // bed) came back as blurry ghosts in the looks (2026-10-27). The face photos are sent as they are.
  if (cleaner && opts.cleanRefs) {
    for (const o of outfits) {
      try { o.bytes = (await cleanBackground(cleaner, o.bytes, { background: opts.background })).bytes; o.mime = 'image/png'; }
      catch (e) { console.log(`(could not cut out ${o.file}: ${e.message})`); }
    }
    console.log(`Cut out ${outfits.length} outfit photo(s) onto a plain background.`);
  }
  // Garment close-ups for edits (base and anchor mode): one small image per garment instead of whole outfit photos.
  if (opts.garmentCrops) {
    let n = 0;
    for (const x of wardrobe) {
      if (!x.box) continue;
      try { x.crop = await garmentCrop(outfits[x.photo], x); n++; await writeFile(join(out, `garment-${x.photo + 1}-${x.category}-${n}.jpg`), x.crop.bytes); }
      catch (e) { console.log(`(no close-up for ${x.description}: ${e.message})`); }
    }
    const cropOf = new Map(wardrobe.filter((x) => x.crop).map((x) => [`${x.photo}|${x.description}`, x.crop]));
    for (const l of looks) for (const x of l.items) x.crop ??= cropOf.get(`${x.photo}|${x.description}`);
    console.log(`Garment close-ups: ${n} of ${wardrobe.length} (the rest are sent as whole photos; --no-garment-crops sends whole photos)`);
  }
  // Face fidelity: redraw the face of every first image at close-up size, and give every edited look that same face.
  let faceModel = null, reference = null;
  if (opts.facePasses || opts.faceLock) {
    try { faceModel = await createFaceModel(FACE_MODELS_DIR); reference = await referenceFace(faceModel, faces); }
    catch (e) { console.log(`Face detail pass and face lock skipped: ${e.message}`); faceModel = null; }
  }
  const redrawModel = MODELS.find((x) => x.key === 'gemini-nano-banana-2');
  // Real face (default): her actual face from the best-matching face photo, aligned and relit to the generated light
  // (identity 0.62 → 0.86 on 2026-10-27, where drawn faces plateaued), then a harmonize pass blends the edges; it is kept
  // only if the identity stays at least 0.06 below the transplant's and above 0.75.
  const withRealFace = () => async (bytes) => {
    const rf = await realFace({ model: faceModel, target: bytes, faces, reference });
    if (!rf.placed) { console.log(`  real face not placed: ${rf.reason}`); return { bytes, face: { pass: true, before: null, after: null, kept: 'original' } }; }
    console.log(`  real face from ${rf.source}: identity ${rf.before.toFixed(3)} → ${rf.after.toFixed(3)}`);
    if (!opts.facePasses) return { bytes: rf.bytes, face: { pass: true, before: rf.before, after: rf.after, kept: `real face (${rf.source})` } };
    const hp = await facePass({ model: faceModel, image: rf.bytes, faces, reference, passes: opts.facePasses, promptFile: HARMONIZE_PROMPT_FILE, blendSize: 1.3,
      minKeep: Math.max(0.75, rf.after - 0.06),
      redraw: (imgs, prompt, label) => callGemini({ ...(opts.proFace ? MODELS.find((x) => x.key === 'gemini-nano-banana-pro') : redrawModel), aspectRatio: '1:1' }, imgs, prompt, label, { ...opts, size: '1K', faceCount: imgs.length }),
      log: (t) => console.log(t.replace('face redraw', 'harmonize')) });
    return { bytes: hp.bytes, cost: hp.cost, face: { pass: true, before: rf.before, after: hp.after, kept: hp.kept === 'original' ? `real face (${rf.source}), not harmonized` : `real face (${rf.source}) + harmonize ${hp.kept.replace('redraw ', '')}` } };
  };
  // Face step per model: real face + harmonize for Gemini by default. GPT's own face is kept: on 2026-10-28 the real-face
  // transplant on GPT looks read as pasted on (weird edges and light) while GPT's raw face already looked like her, and
  // each transplant added a Gemini call to every attempt. --real-face / --no-real-face force it either way.
  const faceStepFor = (m) => (opts.realFace ?? (m.provider !== 'openai'));
  const withFacePass = (m) => (!faceStepFor(m) && opts.realFace === null ? null : faceModel && faceStepFor(m) ? withRealFace() : faceModel && opts.facePasses ? async (bytes) => {
    const fp = await facePass({ model: faceModel, image: bytes, faces, reference, passes: opts.facePasses,
      redraw: (imgs, prompt, label) => callGemini({ ...(opts.proFace ? MODELS.find((x) => x.key === 'gemini-nano-banana-pro') : redrawModel), aspectRatio: '1:1' }, imgs, prompt.replace('{{IDENTITY_CARD}}', opts.identityCard || 'see the face photos'), label, { ...opts, size: '1K', faceCount: imgs.length }),
      log: (t) => console.log(t) });
    return { bytes: fp.bytes, cost: fp.cost, face: { pass: true, before: fp.before, after: fp.after, kept: fp.kept } };
  } : null);
  const rows = [];
  const call = (m, imgs, prompt, label, o) => (m.provider === 'gemini' ? callGemini : callOpenAI)(m, imgs, prompt, label, o);
  const generate = async (m, look, run, file, imgs, prompt, label, o, post = null) => {
    process.stdout.write(`${look.n === 0 ? 'base photo · ' : looks.length > 1 ? `look ${look.n} · ` : ''}${m.key} ${file.includes('rejected') ? 'retry' : 'run ' + run}… `);
    const t0 = performance.now();
    try {
      const r = await call(m, imgs, prompt, label, o);
      const seconds = (performance.now() - t0) / 1000;
      const raw = r.image;
      if (post) {
        console.log(`${seconds.toFixed(1)}s generated`);
        try {
          const p = await post(r.image);
          r.image = p.bytes; r.face = p.face;
          if (p.cost) r.cost = (r.cost || 0) + p.cost;
        } catch (e) { console.log(`  (face step skipped: ${e.message})`); }
      }
      // Pure white background, shadow only under the feet. The model's own output is kept as *-raw.png.
      if (cleaner) {
        try {
          const t1 = performance.now();
          const cleaned = await cleanBackground(cleaner, r.image, { background: opts.background });
          await writeFile(join(out, file.replace(/\.png$/, '-raw.png')), raw);
          r.image = cleaned.bytes;
          r.clean = { before: cleaned.before, seconds: (performance.now() - t1) / 1000, pose: cleaned.pose };
        } catch (e) { console.log(`(background not cleaned: ${e.message})`); }
      }
      await writeFile(join(out, file), r.image);
      if (r.usage) await writeFile(join(out, file.replace(/\.png$/, '.usage.json')), JSON.stringify(r.usage, null, 2));
      const faceNote = r.face ? (r.face.pass ? `, face ${fmt(r.face.before)}→${fmt(r.face.after)} (${r.face.kept})` : r.face.locked ? `, face locked${r.face.exact ? " (pixel copy)" : r.face.exact === false ? " (resampled: head moved or turned)" : ""} ${fmt(r.face.before)}→${fmt(r.face.after)}` : `, face not locked: ${r.face.reason}`) : '';
      console.log(`${post ? '  ' : ''}${seconds.toFixed(1)}s${r.tier === 'flex' ? ' (flex)' : ''}, ~$${fmt(r.cost)}${faceNote}${r.clean ? `, background ${Math.round(r.clean.before)}→${opts.background} in ${r.clean.seconds.toFixed(1)}s` : ''}`);
      return { m, look, run, seconds, file, ...r };
    } catch (e) {
      const seconds = (performance.now() - t0) / 1000;
      console.log(e.refused ? `REFUSED after ${seconds.toFixed(1)}s: OpenAI's safety system declined ${look.n ? `look ${look.n}` : 'this image'} (${(look.items || []).map((x) => x.description).join(' + ') || 'base photo'}); skipped, not retried` : `FAILED after ${seconds.toFixed(1)}s: ${e.message}`);
      return { m, look, run, seconds, error: e.message, refused: !!e.refused };
    }
  };
  // Everything a fresh look must pass: the pose reference's stance (measured), the face check, and exactly its outfit.
  // In base mode the face is a pixel copy of the prepared photo, and logos, prints and earrings are on her real clothes
  // and ears: on 2026-10-28 all 11 rejections in 3 runs were false alarms of this kind ("earrings", "Vans logo on the
  // shoes", "Adidas logo"). So face-only findings (age, glasses, facial hair) and those items are not judged there;
  // garments (incl. logos) are the outfit check's job. Identity, hair, body build, hands and other added items still are.
  const realMark = /logo|print|text|wordmark|graphic|stripe|brand|earring|stud|tattoo|ink|piercing/i; // in base mode these come from the base photo
  // Garments and shoes are the outfit check's job in every mode (2026-10-28: "added: white sneakers" — the shoes the look asked for).
  const garmentWord = /sneaker|shoe|boot|trainer|sandal|loafer|heel|shirt|t-shirt|tee|top|hoodie|sweater|jacket|coat|blazer|trousers|pants|jeans|joggers|shorts|skirt|dress|sock/i;
  const dropGarments = (reasons) => reasons.flatMap((x) => { if (!x.startsWith('added: ')) return [x]; const left = x.slice(7).split(', ').filter((a) => !garmentWord.test(a)); return left.length ? [`added: ${left.join(', ')}`] : []; });
  const baseReasons = (reasons) => reasons.flatMap((x) => {
    if (/^(looks (older|younger)|glasses:|facial hair:)/.test(x)) return [];
    if (!x.startsWith('added: ')) return [x];
    const left = x.slice(7).split(', ').filter((a) => !realMark.test(a));
    return left.length ? [`added: ${left.join(', ')}`] : [];
  });
  const lookProblems = async (look, r, refGeometry = null, lookRefs = images) => {
    const why = [];
    if (cleaner && (refGeometry || look.pose) && r.clean?.pose) {
      if (!refGeometry) look.pose.geometry ??= await measurePose(cleaner, look.pose.bytes).catch(() => null);
      const ref = refGeometry || look.pose.geometry, g = r.clean.pose;
      if (ref) {
        const off = Math.max(Math.abs(g.stagger - ref.stagger), Math.abs(g.gap - ref.gap) / 2);
        if (off > (refGeometry ? BASE_POSE_TOLERANCE : POSE_TOLERANCE)) why.push(`pose differs from the ${refGeometry ? 'base photo' : 'pose reference'} (feet off by ${off.toFixed(3)} of the height)`);
      }
    }
    const img = { file: r.file, bytes: r.image, mime: 'image/png' };
    const [face, fit] = await Promise.all([
      checkFaces({ faces, lookRefs, images: [img], minIdentity: opts.minIdentity, background: opts.background, log: () => {} }).then((x) => x.results[0]),
      outfitCheck(img, look.items, look.items.some((x) => x.category === 'shoes') ? null : opts.shoes).catch((e) => ({ ok: true, note: `outfit check failed: ${e.message}` })),
    ]);
    why.push(...dropGarments(refGeometry ? baseReasons(face.reasons) : face.reasons));
    if (!fit.ok) {
      const claims = [...(fit.missing || []).map((x) => 'missing ' + x), ...(fit.extra || []).map((x) => 'extra ' + x), ...(fit.different || []).map((x) => 'different ' + x)];
      const kept = await confirmClaims(img, look.items, claims.length ? claims : [fit.note]);
      if (kept.length) why.push(`outfit: ${kept.join(', ')}`);
      else console.log(`  (outfit check said "${fit.note.slice(0, 120)}", not confirmed on a second look; accepted)`);
    }
    return why;
  };
  const name = (m, look, run) => (looks.length > 1 ? `${m.key}-look${look.n}-${run}.png` : `${m.key}-${run}.png`);
  // BASE PHOTO PREPARATION (universal, once per base photo): users upload whatever they have, often mirror selfies.
  // The photo is read first; an unusable one (cropped, covered face, several people, sitting, blurry) stops the run with
  // the reason. A usable one with fixable problems (phone in hand, eyes on the phone, mirror and room, arms not relaxed)
  // is edited once into a clean studio photo in the house pose, with the face rebuilt from the face photos where the
  // head or eyes turn. It is kept only if it is still her (identity no more than 0.05 below the original photo's, and
  // the look check) and the problems are gone. Saved in inputs/prepared/ and reused until the photo or prompt changes.
  const prepRows = [];
  let finalRefs = images;
  const prepareBase = async (orig, reading) => {
    const template = await readFile(BASE_PREP_PROMPT_FILE, 'utf8');
    const hash = createHash('sha1').update(orig.bytes).update(Buffer.concat(faces.map((f) => f.bytes))).update(template).update(opts.openaiSize || '').update(opts.pose).update(opts.blankFace ? 'blank-face-1' : '').update((await poseFor({ items: reading.items }))?.bytes || '').digest('hex').slice(0, 10);
    const cached = join(PREPARED_DIR, `${orig.file.replace(/\.[^.]+$/, '')}-${hash}.png`);
    if (opts.prepared) {
      console.log(`Base photo: using ${opts.prepared} as the prepared version (--prepared)`);
      const bytes = await readFile(resolve(opts.prepared));
      await mkdir(PREPARED_DIR, { recursive: true });
      await writeFile(cached, bytes); // later runs reuse it without --prepared
      return { ...orig, file: 'base-prepared.png', bytes, mime: 'image/png', prepared: true };
    }
    if (existsSync(cached) && !opts.reprep) {
      console.log(`Base photo: using the prepared version made earlier (${cached.replace(ROOT + '/', '')}; --reprep to make it again)`);
      return { ...orig, file: 'base-prepared.png', bytes: await readFile(cached), mime: 'image/png', prepared: true };
    }
    const before = await photoCheck(orig);
    if (!before.usable) throw new Error(`The base photo can't be used: ${before.blocking.join('; ')}. Take another one: full body head to feet, standing, face visible, only you in the photo.`);
    if (!before.fixes.length && !opts.blankFace) { console.log('Base photo: already clean (no phone, looking at the camera, plain background); used as it is.'); return orig; }
    console.log(`Base photo needs: ${before.fixes.join('; ')}. Preparing it once…`);
    const idOf = async (img) => (await checkFaces({ faces, lookRefs: [], images: [img], look: false, minIdentity: 0, log: () => {} })).results[0].identity;
    const origId = await idOf(orig).catch(() => null);
    const minId = Math.max(opts.minIdentity, origId != null ? origId - 0.05 : 0);
    const prepModel = MODELS.find((x) => x.key === (opts.prepModel || (process.env.OPENAI_API_KEY ? 'openai-2.5-flare-high' : 'gemini-nano-banana-2')));
    if (!prepModel) throw new Error(`--prep-model=${opts.prepModel} is not a model key: ${MODELS.map((x) => x.key).join(', ')}`);
    const poseRef = await poseFor({ items: reading.items });
    // Blank the face out first. GPT keeps the face of the image it edits whatever the prompt says: the small, soft
    // face of a phone photo came back in every try (identity 0.45–0.49) even when told to rebuild it from the face
    // photos, while on a faceless mannequin it drew the face from the face photos (0.80+). So the face is covered with
    // a plain grey oval (hair and head shape stay) and GPT has only the face photos to paint it from.
    let canvasImg = orig, blanked = false;
    if (faceModel && opts.blankFace) {
      try {
        const { img, face } = await findFace(faceModel, orig.bytes);
        if (face) {
          const sharp = (await import('sharp')).default;
          const [x0, y0, x1, y1] = face.box, w = x1 - x0, h = y1 - y0;
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 + h * 0.02, rx = w * 0.56, ry = h * 0.66;
          const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${img.width}" height="${img.height}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#c9c9c9"/></svg>`);
          const bytes = await sharp(orig.bytes).rotate().composite([{ input: svg }]).jpeg({ quality: 92 }).toBuffer();
          canvasImg = { ...orig, bytes, mime: 'image/jpeg' };
          blanked = true;
          await writeFile(join(out, 'base-face-blanked.jpg'), bytes);
        }
      } catch (e) { console.log(`(face not blanked: ${e.message})`); }
    }
    const imgs = [canvasImg, ...faces, ...(poseRef ? [poseRef] : [])];
    const faceRange = faces.length > 1 ? `2 to ${faces.length + 1}` : '2';
    let prompt = template.replaceAll('{{FACE_IMAGES}}', faceRange).replace('{{FIXES}}', before.fixes.join('; ') || 'only the face, which must come from the face photos')
      .replace('{{POSE}}', poseText(feetFor(reading.items)))
      .replace('{{POSE_IMAGE_LINE}}', poseRef ? ` Image ${imgs.length} is a faceless mannequin showing the pose.` : '')
      .replace('{{POSE_IMAGE_RULE}}', poseRef ? ` Copy the stance of the mannequin in image ${imgs.length} (only its pose: not its body, size or shape).` : '');
    if (blanked) prompt = prompt.replace('- The face: rebuild it from the face photos', '- The face: in image 1 it is covered by a plain grey oval on purpose. Paint the real face there, from the face photos');
    const label = (k) => (k === 0 ? (blanked ? 'the photo to prepare (face covered on purpose)' : 'the photo to prepare') : k <= faces.length ? faces[k - 1].label : 'pose reference: a faceless mannequin; copy only its pose');
    // Every try is made and the passing one closest to her face photos is kept: this photo is the face of every look.
    let best = null;
    for (let attempt = 1; attempt <= opts.anchorTries; attempt++) {
      const file = `base-prepared-${attempt}.png`;
      const r = await generate(prepModel, { n: 0 }, 1, file, imgs, prompt, label, { ...opts, faceCount: faces.length });
      if (r.error) continue;
      const img = { file, bytes: r.image, mime: 'image/png' };
      const [id, after, look] = await Promise.all([
        idOf(img).catch(() => null),
        photoCheck(img).catch((e) => ({ usable: true, blocking: [], fixes: [], note: `photo check failed: ${e.message}` })),
        checkFaces({ faces, lookRefs: [...faces, orig], images: [img], identity: false, log: () => {} }).then((x) => x.results[0]).catch(() => ({ reasons: [] })),
      ]);
      // A clean background is the cleaner's job; everything else must be fixed.
      // The clothes are kept here and replaced in every look, so logos and prints on them are not judged: the check kept
      // reporting the real Adidas logo as "added" and rejected all 3 tries, the best at identity 0.752 (2026-10-28).
      // Tattoos and piercings too: the base photo is the real person (2026-10-28: Ricardo's real arm tattoos rejected all 3 tries).
      const clothesMark = /logo|print|text|wordmark|graphic|stripe|shirt|t-shirt|skirt|trousers|shoe|sneaker|earring|stud|tattoo|ink|piercing/i;
      const lookReasons = (look.reasons || []).filter((x) => !(x.startsWith('added:') && clothesMark.test(x)));
      const added = (look.look?.added || []).filter((x) => !clothesMark.test(x));
      const left = [...after.blocking, ...after.fixes.filter((f) => f !== 'room or objects in the background'), ...lookReasons.filter((x) => !x.startsWith('added:')), ...(added.length ? [`added: ${added.join(', ')}`] : [])];
      if (id == null || id < minId) left.unshift(`identity ${id == null ? 'no face' : id.toFixed(3)} < ${minId.toFixed(3)}`);
      console.log(`  prepared base ${attempt}: identity ${id == null ? '–' : id.toFixed(3)} (original photo ${origId == null ? '–' : origId.toFixed(3)})${left.length ? ' — rejected: ' + left.join('; ') : ' — ok'}`);
      prepRows.push({ ...r, file, reasons: left, identity: id });
      if (!left.length && (!best || id > best.id)) best = { ...img, id };
    }
    if (!best) throw new Error(`Could not prepare the base photo in ${opts.anchorTries} tries (attempts are in ${out}). Try a photo without a mirror, or --no-prep to use it as it is.`);
    await mkdir(PREPARED_DIR, { recursive: true });
    await writeFile(cached, best.bytes);
    console.log(`Kept ${best.file} (identity ${best.id.toFixed(3)})`);
    console.log(`Base photo prepared and saved as ${cached.replace(ROOT + '/', '')}`);
    return { ...orig, file: 'base-prepared.png', bytes: best.bytes, mime: 'image/png', prepared: true };
  };
  // Looks are generated fresh from the same pose reference, and the real face gives every one the same face. Editing
  // look 1 into the others (--anchor) kept old garments, invented ghosts and reshaped the body (2026-10-27), so it is
  // only the default when the real face is off.
  // GENERATED BASE (default when there is no base photo, for GPT): fresh GPT looks were "very good" but each one drew a
  // new face and a new stance (Juliana, 2026-10-28). So the first look is generated from the face photos a few times,
  // the one closest to her face photos (and on the pose reference) becomes the base photo, and every look is then an
  // edit of it with its face copied back pixel for pixel: same face, same pose, no full-body photo needed from the user.
  // Saved in inputs/prepared/ and reused while the face and outfit photos stay the same. --no-auto-base turns it off.
  if (!base && opts.autoBase && looks.length > 1 && models.some((m) => m.provider === 'openai')) {
    const genModel = MODELS.find((x) => x.key === (opts.prepModel || 'openai-2.5-flare-high'));
    const l1 = looks[0];
    // The mannequin is the image being edited (image 1), not one reference among many: as a reference GPT gave every
    // look a stiff, symmetric stance instead of Felipe's relaxed mannequin ("totally wrong", 2026-10-28), while edits keep
    // the pose of image 1 almost exactly (base mode).
    const canvas = (() => {
      const f = faces.length, imgs = [...(l1.pose ? [l1.pose] : []), ...faces, ...outfits], o = l1.pose ? 1 : 0;
      const garments = l1.items.map((x) => `  - the ${x.description} (${x.category}) from image ${o + f + 1 + x.photo}`);
      if (!l1.items.some((x) => x.category === 'shoes')) garments.push(`  - shoes: exactly these: ${opts.shoes}. Nothing on them: no logo, stripe, emblem, tab or text`);
      const faceRange = `${o + 1} to ${o + f}`, bodyRange = `${o + f + 1} to ${o + f + outfits.length}`;
      const prompt = `${l1.pose ? `Edit image 1. It shows a faceless mannequin. Replace the mannequin with the real person from the other photos, dressed in the garments below.
KEEP IMAGE 1'S POSE EXACTLY, as if the person stepped into the mannequin's place: the same stance, the weight on the same leg, the same bend of each knee, where each foot stands and how it turns, the arms' distance from the body, the elbows, the hands and fingers, the shoulders, the head angle; the same framing and size in the frame. In words: ${poseText(feetFor(l1.items))}.
` : `Photo of the real person from the photos, standing: ${opts.pose}.\n`}
THE PERSON (full fidelity, a friend must recognise them instantly)
- Face, hair, skin and expression: from the face photos, images ${faceRange}. ${opts.identityCard ? 'What they look like: ' + opts.identityCard : ''}
- Body build and proportions: from the full-body photos, images ${bodyRange} (only the body there: ignore those photos' pose, background and other clothes).${opts.bodyText ? ' Their body, exactly: ' + opts.bodyText : ''}
- Expression: ${opts.expression}

GARMENTS
${garments.join('\n')}
- Reproduce each garment exactly: colour, pattern, fabric, fit, length, neckline, straps and back construction, collar, sleeves, buttons, seams. Nothing else: no jewellery, watches, bags, tattoos, logos or text that the photos do not show.
- Clean skin and hands: no paint, stains, marks, bruises or plasters that the face photos do not show.

PHOTO
- Camera at hip height, straight on, about 4 m away with a long lens (85 mm look): natural proportions, no wide-angle distortion, no looking down at the person; feet their natural size, legs their real length.
- Plain light grey seamless studio background, soft even front light, one soft shadow under the feet. Full body head to feet, sharp, realistic photo.`;
      const label = (k) => (l1.pose && k === 0 ? 'the mannequin to replace: keep its pose and framing exactly' : k < o + f ? faces[k - o].label : `full-body photo of the person (body build only; take the garments named in the prompt)`);
      return { images: imgs, prompt, label };
    })();
    await writeFile(join(out, 'prompt-base.txt'), canvas.prompt);
    // Keyed on the face photos and size only: one base per person, whatever the outfit, occasion or seed.
    const hash = createHash('sha1');
    for (const img of faces) hash.update(img.bytes);
    hash.update(opts.openaiSize || '').update(l1.pose?.bytes || '').update(opts.pose).update('canvas-3').update(opts.bodyText || ''); // a new pose, method or body card makes a new base
    const cached = join(PREPARED_DIR, `generated-${hash.digest('hex').slice(0, 10)}.png`);
    const idOf = async (img) => (await checkFaces({ faces, lookRefs: [], images: [img], look: false, minIdentity: 0, log: () => {} })).results[0].identity;
    const outfitKey = (items) => items.map((x) => x.description).sort().join(' + ');
    const wears = async () => (existsSync(cached + '.json') ? JSON.parse(await readFile(cached + '.json', 'utf8')).wears : null);
    if (opts.prepared) {
      base = { file: 'generated-base.png', bytes: await readFile(resolve(opts.prepared)), mime: 'image/png', generated: true, wears: null };
      await mkdir(PREPARED_DIR, { recursive: true });
      await writeFile(cached, base.bytes); await writeFile(cached + '.json', JSON.stringify({ wears: null }));
      console.log(`Generated base photo: using ${opts.prepared} (--prepared); saved for later runs`);
    } else if (existsSync(cached) && !opts.reprep) {
      console.log(`Generated base photo: using the one made earlier (${cached.replace(ROOT + '/', '')}; --reprep to make it again)`);
      base = { file: 'generated-base.png', bytes: await readFile(cached), mime: 'image/png', generated: true, wears: await wears() };
    } else {
      console.log(`No base photo: generating look 1 ${opts.anchorTries} times with ${genModel.key} and keeping the one closest to the face photos as the base photo…`);
      if (cleaner && l1.pose) l1.pose.geometry ??= await measurePose(cleaner, l1.pose.bytes).catch(() => null);
      let best = null;
      for (let attempt = 1; attempt <= opts.anchorTries; attempt++) {
        const file = `base-generated-${attempt}.png`;
        const r = await generate(genModel, { n: 0 }, 1, file, canvas.images, canvas.prompt, canvas.label, { ...opts, faceCount: faces.length });
        if (r.error) continue;
        const img = { file, bytes: r.image, mime: 'image/png' };
        const [id, look] = await Promise.all([idOf(img).catch(() => null),
          checkFaces({ faces, lookRefs: images, images: [img], identity: false, log: () => {} }).then((x) => x.results[0]).catch(() => ({ reasons: [] }))]);
        const left = dropGarments(look.reasons || []);
        const g = r.clean?.pose, ref = l1.pose?.geometry;
        const off = g && ref ? Math.max(Math.abs(g.stagger - ref.stagger), Math.abs(g.gap - ref.gap) / 2) : 0;
        if (off > POSE_TOLERANCE) left.push(`pose differs from the pose reference (feet off by ${off.toFixed(3)} of the height)`);
        if (id == null || id < opts.minIdentity) left.unshift(`identity ${id == null ? 'no face' : id.toFixed(3)}`);
        console.log(`  generated base ${attempt}: identity ${id == null ? '–' : id.toFixed(3)}${left.length ? ' — rejected: ' + left.join('; ') : ' — ok'}`);
        prepRows.push({ ...r, file, reasons: left, identity: id });
        const score = (id ?? -1) - (left.length ? 1 : 0); // passing tries first, then the closest face
        if (!best || score > best.score) best = { ...img, id, score, ok: !left.length };
      }
      if (!best) throw new Error('Could not generate a base photo (every try failed). Run again, or add a base photo (base.jpg).');
      if (!best.ok) console.log(`  (no try passed every check; keeping the closest face, ${best.file})`);
      await mkdir(PREPARED_DIR, { recursive: true });
      await writeFile(cached, best.bytes); await writeFile(cached + '.json', JSON.stringify({ wears: outfitKey(l1.items) }));
      console.log(`Kept ${best.file} (identity ${best.id?.toFixed(3)}) as the base photo; saved as ${cached.replace(ROOT + '/', '')}. Not her? Pick another with --prepared=<file>.`);
      base = { file: 'generated-base.png', bytes: best.bytes, mime: 'image/png', generated: true, wears: outfitKey(l1.items) };
    }
  }
  const anchorMode = !base && (opts.anchor ?? opts.realFace === false) && looks.length > 1;
  const rejected = [];
  // A look that fails its checks on every try is dropped, not shown (Felipe, 2026-10-28): the last try used to be kept
  // unchecked, which let through a pink jacket, an extra jacket over a cardigan and an invented t-shirt print. Five
  // right looks beat six with one wrong.
  const dropped = [];
  const dropLook = async (look, r, reasons) => {
    await rm(join(out, r.file), { force: true }).catch(() => {});
    dropped.push({ look, tries: r.attempt || opts.anchorTries, reasons });
    console.log(`  look ${look.n} dropped: it failed the checks on all ${opts.anchorTries} tries (last: ${reasons.join('; ')})`);
  };
  if (base) {
    // BASE PHOTO MODE: every look is the person's own photo with only the clothes changed, so face, body, hair and pose
    // are real. The face is then put back from the base photo itself (same light, same angle), and the background
    // painted. Chosen 2026-10-27 after generated people never reliably looked like the person.
    const editTemplate = await readFile(EDIT_PROMPT_FILE, 'utf8');
    const baseReading = await readPhoto(base, 0, opts.reader).catch(() => ({ items: [] }));
    const takeOff = baseReading.items.filter((x) => ['outerwear', 'top', 'dress', 'bottom', 'shoes'].includes(x.category)).map((x) => x.description);
    console.log(`Base photo ${base.file}: wears ${takeOff.join('; ') || 'nothing recognised'}`);
    const src = opts.prep && !base.generated ? await prepareBase(base, baseReading) : base;
    // Look check against her face photos and the (prepared) base photo only: her outfit photos are mirror selfies with
    // other hair and jewellery, and the check then "saw" a bun and a choker that were not there (2026-10-28).
    const baseRefs = [...faces, src];
    finalRefs = baseRefs;
    const baseGeometry = cleaner ? await measurePose(cleaner, src.bytes).catch(() => null) : null;
    // Face lock: the prepared base photo's face is copied back onto every look. Without it GPT redrew the face on every
    // edit and it drifted ("weird volume", 2026-10-28); with it the faces matched but were soft, because the copy was
    // resampled. faceLock now copies pixel for pixel when the head has not moved or turned (base mode keeps the pose).
    const lockToBase = faceModel && opts.faceLock ? async (bytes) => {
      const fl = await faceLock({ model: faceModel, source: src.bytes, target: bytes, reference });
      return { bytes: fl.bytes, face: { locked: fl.locked, before: fl.before, after: fl.after, reason: fl.reason, exact: fl.exact } };
    } : null;
    const renderedBy = new Map(); // model -> garment description -> the first accepted look that wears it
    for (const look of looks) for (const m of models) {
      if (!renderedBy.has(m)) renderedBy.set(m, new Map());
      const rendered = renderedBy.get(m);
      const edit = buildEdit(editTemplate, outfits, look, src, takeOff, opts.sameLight ? rendered : new Map());
      const remember = (r) => { for (const x of look.items) if (!rendered.has(x.description)) rendered.set(x.description, { n: look.n, file: r.file, bytes: r.image }); };
      look.editPrompt = edit.prompt;
      for (let run = 1; run <= opts.runs; run++) {
        // A generated base photo already is look 1 (same garments): reuse it instead of paying for an edit of itself.
        if (base.generated && run === 1 && base.wears && base.wears === look.items.map((x) => x.description).sort().join(' + ')) {
          const file = name(m, look, run);
          await writeFile(join(out, file), base.bytes);
          console.log(`look ${look.n} · ${m.key}: the generated base photo (no extra call)`);
          rows.push({ m, look, run, file, image: base.bytes, seconds: 0, cost: 0, attempt: 1, readySeconds: 0, shownSeconds: 0, tokens: {} });
          continue;
        }
        // Wall time until this look is ready (all attempts, checks and clean-up): what a user would wait for it.
        // Show early: the look is shown as soon as its first image is painted (face lock + background, ~1 s after GPT);
        // the checks run while she looks at it, and a rejected look is replaced when the next try is ready.
        const t0 = performance.now();
        let shownAt = null;
        const ready = (r) => { r.readySeconds = (performance.now() - t0) / 1000; r.shownSeconds = shownAt ?? r.readySeconds; rows.push(r); };
        for (let attempt = 1; attempt <= opts.anchorTries; attempt++) {
          const r = await generate(m, look, run, name(m, look, run), edit.images, edit.prompt, edit.label, { ...opts, faceCount: 1 }, lockToBase);
          r.attempt = attempt;
          if (!r.error && shownAt == null) shownAt = (performance.now() - t0) / 1000;
          const last = attempt === opts.anchorTries;
          if (r.error) { ready(r); break; }
          if (!opts.check) { remember(r); ready(r); break; }
          const why = await lookProblems(look, r, baseGeometry, baseRefs);
          if (!why.length) { remember(r); ready(r); break; }
          const rej = r.file.replace(/\.png$/, `-rejected-${attempt}.png`);
          await writeFile(join(out, rej), r.image);
          rejected.push({ file: rej, reasons: why, cost: r.cost });
          if (last) { await dropLook(look, r, why); break; }
          console.log(`  look ${look.n} rejected (${why.join('; ')}), making it again…`);
        }
      }
    }
    await writeFile(join(out, 'prompt.txt'), looks.map((l) => `=== Look ${l.n} (base photo, clothes changed) ===\n${l.editPrompt}`).join('\n\n'));
  } else if (anchorMode) {
    // Look 1 is generated from the face photos and checked; looks 2+ edit only the clothes of that accepted image,
    // so face, pose, framing and shadow stay the same in every look.
    const editTemplate = await readFile(EDIT_PROMPT_FILE, 'utf8');
    for (const m of models) {
      let anchor = null;
      for (let attempt = 1; attempt <= opts.anchorTries && !anchor; attempt++) {
        const last = attempt === opts.anchorTries;
        const file = name(m, looks[0], 1);
        const r = await generate(m, looks[0], 1, file, looks[0].images, looks[0].prompt, looks[0].label, opts, withFacePass(m));
        if (r.error) { if (last || r.refused) { rows.push(r); break; } continue; }
        if (!opts.check || last) { anchor = r; break; }
        // Look 1 must stand like the pose reference (2026-10-27: it came out facing the camera, stagger 0.000 vs the
        // mannequin's -0.021, and every edit copied that).
        let poseOff = null;
        if (cleaner && looks[0].pose && r.clean?.pose) {
          looks[0].pose.geometry ??= await measurePose(cleaner, looks[0].pose.bytes).catch(() => null);
          const ref = looks[0].pose.geometry, g = r.clean.pose;
          if (ref) {
            const off = Math.max(Math.abs(g.stagger - ref.stagger), Math.abs(g.gap - ref.gap) / 2);
            if (off > POSE_TOLERANCE) poseOff = `pose differs from the pose reference (feet off by ${off.toFixed(3)} of the height)`;
          }
        }
        const c = (await checkFaces({ faces, lookRefs: images, images: [{ file: r.file, bytes: r.image, mime: 'image/png' }], minIdentity: opts.minIdentity, background: opts.background, log: () => {} })).results[0];
        const why = [...(poseOff ? [poseOff] : []), ...c.reasons];
        if (!why.length) { anchor = r; break; }
        const rej = r.file.replace(/\.png$/, `-rejected-${attempt}.png`);
        await writeFile(join(out, rej), r.image);
        rejected.push({ file: rej, reasons: why, cost: r.cost });
        console.log(`  first look rejected (${why.join('; ')}), generating it again…`);
      }
      if (!anchor) continue;
      if (opts.check && rejected.length && anchor) console.log(`  first look accepted.`);
      rows.push(anchor);
      const anchorImg = { file: anchor.file, bytes: anchor.image, mime: 'image/png' };
      const anchorPose = anchor.clean?.pose;
      for (const look of looks.slice(1)) {
        const edit = buildEdit(editTemplate, outfits, look, anchorImg);
        look.editPrompt = edit.prompt;
        for (let run = 1; run <= opts.runs; run++) {
          // Each edit must keep look 1's pose and pass the face check; otherwise it is made again (same tries as look 1).
          for (let attempt = 1; attempt <= opts.anchorTries; attempt++) {
            const lock = faceModel && opts.faceLock ? async (bytes) => {
              const fl = await faceLock({ model: faceModel, source: anchorImg.bytes, target: bytes, reference });
              return { bytes: fl.bytes, face: { locked: fl.locked, before: fl.before, after: fl.after, reason: fl.reason } };
            } : null;
            const r = await generate(m, look, run, name(m, look, run), edit.images, edit.prompt, edit.label, { ...opts, faceCount: 1 }, lock);
            const last = attempt === opts.anchorTries;
            r.attempt = attempt;
            if (r.error || !opts.check) { rows.push(r); break; }
            const img = { file: r.file, bytes: r.image, mime: 'image/png' };
            const [pose, face] = await Promise.all([
              poseCheck(anchorImg, img).catch((e) => ({ same: true, note: `pose check failed: ${e.message}` })),
              checkFaces({ faces, lookRefs: images, images: [img], minIdentity: opts.minIdentity, background: opts.background, log: () => {} }).then((x) => x.results[0]),
            ]);
            // Measured pose: feet stagger and gap vs look 1 (2026-10-27: a front-facing edit was 0.022 and 0.013 off, good
            // edits within 0.005). The model's pose opinion missed that one, so the measurement decides first.
            const g = r.clean?.pose, measured = anchorPose && g ? Math.max(Math.abs(g.stagger - anchorPose.stagger), Math.abs(g.gap - anchorPose.gap)) : 0;
            const reasons = [...(measured > POSE_TOLERANCE ? [`pose differs from look 1 (feet off by ${measured.toFixed(3)} of the height)`] : []), ...(pose.same ? [] : [`pose differs from look 1: ${pose.note}`]), ...face.reasons];
            if (!reasons.length) { rows.push(r); break; }
            const rej = r.file.replace(/\.png$/, `-rejected-${attempt}.png`);
            await writeFile(join(out, rej), r.image);
            rejected.push({ file: rej, reasons, cost: r.cost });
            if (last) { await dropLook(look, r, reasons); break; }
            console.log(`  look ${look.n} rejected (${reasons.join('; ')}), making it again…`);
          }
        }
      }
    }
  } else {
    for (const look of looks) for (const m of models) {
      for (let run = 1; run <= opts.runs; run++) {
        for (let attempt = 1; attempt <= opts.anchorTries; attempt++) {
          const r = await generate(m, look, run, name(m, look, run), look.images, look.prompt, look.label, opts, withFacePass(m));
          const last = attempt === opts.anchorTries;
          r.attempt = attempt;
          if (r.error || !opts.check) { rows.push(r); break; }
          const why = await lookProblems(look, r);
          if (!why.length) { rows.push(r); break; }
          const rej = r.file.replace(/\.png$/, `-rejected-${attempt}.png`);
          await writeFile(join(out, rej), r.image);
          rejected.push({ file: rej, reasons: why, cost: r.cost });
          if (last) { await dropLook(look, r, why); break; }
          console.log(`  look ${look.n} rejected (${why.join('; ')}), making it again…`);
        }
      }
    }
  }

  if (anchorMode) await writeFile(join(out, 'prompt.txt'), [`=== Look 1 (generated from the face photos) ===\n${looks[0].prompt}`, ...looks.slice(1).filter((l) => l.editPrompt).map((l) => `=== Look ${l.n} (edit of look 1: only the clothes change) ===\n${l.editPrompt}`)].join('\n\n'));

  // Two-layer face check: identity gate (ArcFace) + look check (hair, age, invented tattoos/logos).
  const done = rows.filter((r) => !r.error);
  let check = null;
  if (opts.check && done.length) {
    console.log(`\nChecking faces (identity gate ≥ ${opts.minIdentity}, then hair/age/added items)…`);
    check = await checkFaces({ faces, lookRefs: finalRefs, images: done.map((r) => ({ file: r.file, bytes: r.image, mime: 'image/png' })), minIdentity: opts.minIdentity, background: opts.background });
    for (const c of check.results) { c.reasons = dropGarments(base ? baseReasons(c.reasons) : c.reasons); c.pass = c.reasons.length === 0 && c.identity != null; }
    check.results.forEach((c, i) => { done[i].check = c; console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.file}  identity ${fmt(c.identity)}${c.reasons.length ? '  ' + c.reasons.join('; ') : ''}`); });
    console.log(`Look check cost: ~$${check.lookCost.toFixed(4)}`);
  }

  const lines = ['# Image test ' + stamp, '', `Occasion: ${opts.occasion} · Weather: ${opts.weather} · Time: ${opts.time}`, '', `Pose: ${opts.pose}`, '', `Seed: ${seed} (repeat with --seed=${seed}) · Gemini size: ${opts.size} · Photo detail: ${opts.detail}`, '',
    '## Garments read', '', ...readings.map((r, i) => `- Photo ${i + 1} (${outfits[i].file}): ${r.items.map((x) => `${x.description} [${[x.category, x.formality && `formality ${x.formality}`, x.exposure && `exposure ${x.exposure}`, x.season && x.season !== 'any' && x.season].filter(Boolean).join(', ')}]`).join('; ') || 'nothing recognised'}`), '',
    `Occasion rules: ${looks.occasion.name} (formality ${looks.occasion.min}–${looks.occasion.max}, exposure up to ${looks.occasion.maxExposure})${looks.skipped.length ? ` · left out: ${looks.skipped.map((x) => `${x.description} (${x.why})`).join('; ')}` : ''}`, '',
    ...(opts.identityCard ? ['## Identity card (read from the face photos)', '', opts.identityCard, ''] : []),
    '## Looks asked for', '', ...looks.map((l) => `- Look ${l.n}: ${l.items.map((x) => `${x.description} (${x.category}, photo ${x.photo + 1})`).join(' + ')}`), '',
    `Reading cost: ~$${readCost.toFixed(4)}`, '',
    ...(anchorMode ? [`Same face, pose and shadow: look 1 was generated from the face photos${opts.check ? ' and had to pass the face check' : ''}; looks 2–${looks.length} are edits of it where only the clothes change, each checked for the same pose as look 1 and remade if it differs.`,
      ...(rejected.length ? ['', `Attempts rejected before one passed (${rejected.length}, ~$${fmt(rejected.reduce((s, r) => s + (r.cost || 0), 0))}):`, ...rejected.map((r) => `- ${r.file}: ${r.reasons.join('; ')}`)] : []), ''] : []),
    ...(!anchorMode && rejected.length ? [`Attempts rejected before one passed (${rejected.length}, ~$${fmt(rejected.reduce((s, r) => s + (r.cost || 0), 0))}):`, ...rejected.map((r) => `- ${r.file}: ${r.reasons.join('; ')}`), ''] : []),
    ...(dropped.length ? ['## Dropped looks', '', `Failed the checks on every try, so not shown (their tries are the *-rejected-* files):`, ...dropped.map((d) => `- Look ${d.look.n}: ${(d.look.items || []).map((x) => x.description).join(' + ')} — last problem: ${d.reasons.join('; ')}`), ''] : []),
    ...(rows.some((r) => r.refused) ? ['## Refused by OpenAI (safety)', '', 'Skipped without retrying: the same garments are refused every time (usually sheer or revealing clothes).', '', ...rows.filter((r) => r.refused).map((r) => `- Look ${r.look.n}: ${(r.look.items || []).map((x) => x.description).join(' + ')}`), ''] : []),
    ...(prepRows.length ? ['## Base photo preparation', '', ...prepRows.map((r) => `- ${r.file}: ${r.m.key}, ${r.seconds.toFixed(1)}s, ~$${fmt(r.cost)}, identity ${fmt(r.identity)} — ${r.reasons.length ? 'rejected: ' + r.reasons.join('; ') : 'kept'}`), ''] : []),
    '## Results', '',
    '| Look | Model | Run | Seconds | Input tokens | Output tokens | Est. cost (USD) | Face step | Result |', '|---|---|---|---|---|---|---|---|---|'];
  const faceCell = (f) => (!f ? '–' : f.pass ? `face ${fmt(f.before)}→${fmt(f.after)} (${f.kept})` : f.locked ? `face locked ${fmt(f.before)}→${fmt(f.after)}` : `not locked: ${f.reason}`);
  for (const r of rows) lines.push(`| ${r.look.n} | ${r.m.key} | ${r.run} | ${r.seconds.toFixed(1)} | ${fmt(r.tokens?.input, 0)} | ${fmt(r.tokens?.output, 0)} | ${fmt(r.cost)} | ${faceCell(r.face)} | ${r.error ? 'FAILED: ' + r.error.replace(/\|/g, '/') : r.file} |`);
  lines.push('', '## Averages (successful runs)', '', '| Model | Runs OK | Avg seconds | Avg cost (USD) |', '|---|---|---|---|');
  for (const m of models) {
    const ok = rows.filter((r) => r.m === m && !r.error);
    const avg = (f) => (ok.length ? ok.reduce((s, r) => s + (f(r) || 0), 0) / ok.length : null);
    lines.push(`| ${m.key} | ${ok.length}/${anchorMode ? 1 + opts.runs * (looks.length - 1) : opts.runs * looks.length} | ${fmt(avg((r) => r.seconds), 1)} | ${fmt(avg((r) => r.cost))} |`);
  }
  if (check) {
    lines.push('', '## Face check', '', `Identity: ArcFace similarity to the average face photo; below ${opts.minIdentity} = a different person. It only gates: it does not rank likeness.`,
      `Look check: hair, age, facial hair, glasses, expression and anything invented, by gemini-3.1-flash-lite (~$${check.lookCost.toFixed(4)} total).`, '', ...checkTable(check.results));
    for (const c of check.results) if (c.reasons.length || c.warnings.length) lines.push(`- ${c.file}: ${[...c.reasons, ...c.warnings.map((w) => 'warning: ' + w)].join('; ')}`);
  }
  // Swipe timing (lazy generation): look n+1 starts when look n is shown, so a user who swipes after d seconds waits
  // max(0, ready time of look n+1 − d). Look 1 is made before she opens the app (or reused).
  const timed = rows.filter((r) => r.shownSeconds != null && !r.error);
  if (timed.length > 1) {
    lines.push('', '## Swipe timing (look n+1 starts when look n is shown; a look is shown before its checks finish)', '', '| Model | Shown after (s) | Wait if she swipes after 5 s | 10 s | 20 s | 30 s |', '|---|---|---|---|---|---|');
    for (const m of models) {
      const t = timed.filter((r) => r.m === m).sort((a, b) => a.look.n - b.look.n).map((r) => r.shownSeconds);
      const replaced = timed.filter((r) => r.m === m && r.attempt > 1).map((r) => `look ${r.look.n} replaced at ${r.readySeconds.toFixed(0)} s`);
      if (t.length < 2) continue;
      const wait = (d) => { const w = t.slice(1).map((x) => Math.max(0, x - d)); return `avg ${fmt(w.reduce((a, b) => a + b, 0) / w.length, 1)}, max ${fmt(Math.max(...w), 1)}`; };
      lines.push(`| ${m.key} | ${t.map((x) => x.toFixed(1)).join(', ')} | ${wait(5)} | ${wait(10)} | ${wait(20)} | ${wait(30)} |`);
      if (replaced.length) lines.push('', `Replaced after a failed check: ${replaced.join(', ')}.`);
      console.log(`Swipe timing ${m.key}: looks shown after ${t.map((x) => x.toFixed(0) + 's').join(', ')}; wait after a 10 s look: ${wait(10)} s`);
    }
  }
  const spent = [...rows, ...rejected, ...prepRows].reduce((t, r) => t + (r.cost || 0), 0);
  lines.push('', `Total spent this run (kept + rejected + base preparation): ~$${fmt(spent)}. GPT costs are from the tokens OpenAI reported; usage per image is in the *.usage.json files.`);
  console.log(`Total spent this run: ~$${fmt(spent)}`);
  lines.push('', 'Score each image 1–5: face (would a friend recognise you?), body, garments exact, full frame. Below 4 on face fails.', '',
    'Costs are estimates from the PRICES table in scripts/image-test.mjs; check them on the providers\' pricing pages.');
  await writeFile(join(out, 'report.md'), lines.join('\n') + '\n');
  // Scoring sheet: fill face / clothes / pose with 1 (right) or 0 (wrong) per look, then npm run score-summary.
  // "attempt" is the try that was kept (1 = right first time by the automatic checks).
  const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  await writeFile(join(out, 'scores.csv'), ['file,look,model,attempt,auto_check,garments,face,clothes,pose,notes',
    ...done.map((r) => [r.file, r.look.n, r.m.key, r.attempt ?? '', r.check ? (r.check.pass ? 'pass' : 'fail') : '', r.look.items.map((x) => x.description).join(' + '), '', '', '', ''].map(csv).join(','))].join('\n') + '\n');

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><meta charset="utf-8"><title>Image test ${stamp}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#0c0c36}h2{margin:32px 0 8px}.row{display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0;width:240px}img{width:240px;height:360px;object-fit:contain;background:#f7f7f7;border:1px solid #cccce5}figcaption{font-size:12px;color:#53538b;margin-top:4px}.err{width:240px;height:360px;display:flex;align-items:center;justify-content:center;background:#fdecea;color:#b3261e;padding:12px;font-size:12px}</style>
<h1>Image test ${stamp}</h1><p>${esc(opts.occasion)} · ${esc(opts.weather)} · ${esc(opts.time)}</p>
<h2>Face photos</h2><div class="row">${faces.map((x) => `<figure><img src="${esc(x.refName)}"><figcaption>${esc(x.label)}</figcaption></figure>`).join('')}</div>
<h2>Outfit photos and garments read</h2><div class="row">${outfits.map((x, i) => `<figure><img src="${esc(x.refName)}"><figcaption>photo ${i + 1}: ${esc(readings[i].items.map((g) => g.description).join(' · ') || 'nothing recognised')}</figcaption></figure>`).join('')}</div>
${looks.map((l) => `<h2>Look ${l.n}: ${l.items.map((x) => `${esc(x.description)} <small>(photo ${x.photo + 1})</small>`).join(' + ')}</h2>
${models.map((m) => `<h3>${esc(m.key)}</h3><div class="row">${rows.filter((r) => r.m === m && r.look === l).map((r) => r.error
    ? `<figure><div class="err">${esc(r.error)}</div><figcaption>run ${r.run}</figcaption></figure>`
    : `<figure><img src="${esc(r.file)}"><figcaption>run ${r.run} · ${r.seconds.toFixed(1)}s · ~$${fmt(r.cost)}${r.check ? `<br><b style="color:${r.check.pass ? '#1b7f3b' : '#b3261e'}">${r.check.pass ? 'PASS' : 'FAIL'}</b> · identity ${fmt(r.check.identity)}${r.check.reasons.length ? '<br>' + esc(r.check.reasons.join('; ')) : ''}` : ''}</figcaption></figure>`).join('')}</div>`).join('')}`).join('')}`;
  await writeFile(join(out, 'index.html'), html);
  console.log(`\nDone. Open ${join(out, 'index.html')} to compare, and ${join(out, 'report.md')} for the numbers.`);
}

main().catch((e) => { const c = e.cause; console.error('Error: ' + e.message + (c ? ` (${c.code || ''} ${c.message || c}`.trimEnd() + ')' : '') + (e.message === 'fetch failed' ? '\nNo answer from the server: check the internet connection, VPN or proxy, then run again.' : '')); process.exitCode = 1; })
  .finally(() => (scratch ? rm(scratch, { recursive: true, force: true }) : null));
