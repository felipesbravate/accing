// Image generation test. Drop head-to-toe photos of one person (any file names) in image-test/inputs; the script
// reads the garments in each photo, composes one or more new looks across photos (--looks), then sends the same photos and prompt to
// each image model and measures seconds, tokens and cost.
// Usage: see image-test/README.md. Needs Node 20+ (built-in fetch, FormData, Blob). Keys come from .env.local.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { CATEGORIES, composeLooks, normaliseReading } from './image-test-lib.mjs';
import { checkFaces, checkTable, MIN_IDENTITY } from './face-check/index.mjs';
import { poseCheck } from './face-check/look-check.mjs';
import { cleanBackground, createCleaner } from './clean-background.mjs';
import './net.mjs'; // retry requests whose connection fails

const ROOT = resolve(import.meta.dirname, '..');
const INPUTS = join(ROOT, 'image-test', 'inputs');
const RESULTS = join(ROOT, 'image-test', 'results');
const PROMPT_FILE = join(ROOT, 'scripts', 'image-test-prompt.txt');
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
  'openai-2.5-flare-medium': { imageInputPerM: 8, textInputPerM: 5, outputPerImage: 0.01317 * 1.5 },
  'openai-2.5-flare-high': { imageInputPerM: 8, textInputPerM: 5, outputPerImage: 0.05268 * 1.5 },
};

const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function args() {
  const out = { runs: 3, looks: 1, clean: true, anchor: true, anchorTries: 3, only: null, dryRun: false, check: true, minIdentity: MIN_IDENTITY, seed: null, reader: 'gemini-3.1-flash-lite', size: '1K', detail: 'max',
    expression: 'relaxed and neutral, the same natural expression as in the face photos (no smile they do not have)', occasion: 'an office day', weather: 'sunny 24°C', time: 'Monday morning',
    shoes: 'plain white leather low-top sneakers with white soles and white laces',
    pose: 'relaxed standing pose: body turned about 15 degrees so their left shoulder is slightly closer to the camera, head turned back to face the camera, chin level, eyes looking into the lens; weight on the back (right) leg, front (left) knee slightly relaxed, feet about hip-width apart; both arms hanging loosely at the sides, elbows very slightly bent, hands open and relaxed beside the thighs, never in pockets; shoulders relaxed and level' };
  for (const a of process.argv.slice(2)) {
    const [k, ...rest] = a.replace(/^--/, '').split('='); const v = rest.join('=');
    if (k === 'runs') out.runs = Math.max(1, Math.min(10, parseInt(v, 10) || 3));
    else if (k === 'only') out.only = v;
    else if (k === 'looks') out.looks = Math.max(1, Math.min(8, parseInt(v, 10) || 1));
    else if (k === 'dry-run') out.dryRun = true;
    else if (k === 'no-check') out.check = false;
    else if (k === 'no-anchor') out.anchor = false;
    else if (k === 'no-clean') out.clean = false;
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
  if (!existsSync(INPUTS)) throw new Error(`Missing folder ${INPUTS}`);
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
  const outfitFiles = files.filter((f) => !faces.some((x) => x.file === f));
  if (!outfitFiles.length) throw new Error('Add head-to-toe photos of the same person in different outfits to image-test/inputs (any file names)');
  if (outfitFiles.length > MAX_PHOTOS) throw new Error(`Use at most ${MAX_PHOTOS} outfit photos (found ${outfitFiles.length})`);
  const outfits = [];
  for (const f of outfitFiles) outfits.push(await load(f));
  return { faces, outfits, images: [...faces, ...outfits] };
}

// Step 1: read the garments in each photo with a cheap vision model (Gemini Flash-Lite).
const READER_PROMPT = `This photo should show one person, head to toe. List every piece of clothing and footwear they are wearing.
For each item give:
- category: one of ${CATEGORIES.join(', ')} (outerwear = jacket, blazer, coat; top = shirt, t-shirt, sweater, blouse; bottom = trousers, jeans, skirt, shorts)
- description: 4 to 10 words with colour, pattern, material and cut, e.g. "brown houndstooth tweed single-breasted blazer"
- visibility: "full" if the whole item is visible, "partial" if partly hidden or cropped, "hidden" if you can barely see it
Also say whether the person is visible head to toe (full_body) and how many people are in the photo (people).`;

const READER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    full_body: { type: 'BOOLEAN' },
    people: { type: 'INTEGER' },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      category: { type: 'STRING', enum: CATEGORIES },
      description: { type: 'STRING' },
      visibility: { type: 'STRING', enum: ['full', 'partial', 'hidden'] },
    }, required: ['category', 'description', 'visibility'] } },
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
  return { fullBody: parsed.full_body !== false, people: parsed.people ?? 1, items: normaliseReading(parsed, index), cost };
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
    .replace('{{POSE}}', opts.pose).replace('{{EXPRESSION}}', opts.expression);
}

/** What each image is for, sent next to the image (Gemini) or listed after the prompt (OpenAI). */
function imageLabel(faces, outfit, i) {
  if (i < faces.length) return faces[i].label;
  const take = outfit.items.filter((x) => x.photo === i - faces.length).map((x) => x.description);
  return take.length ? `this person head to toe; take only the ${take.join(' and the ')} from this photo` : 'this person head to toe, for body and hair only';
}

/** Look 2+ in anchor mode: image 1 is the accepted first look; the other images are only the photos this look takes
 *  garments from. Everything but the clothes is kept from image 1, so face, pose and shadow are the same in every look. */
function buildEdit(template, outfits, look, anchor) {
  const used = [...new Set(look.items.map((x) => x.photo))].sort((a, b) => a - b);
  const pos = (photo) => used.indexOf(photo) + 2;
  const lines = look.items.map((x) => `  - the ${x.description} (${x.category}) from image ${pos(x.photo)}`);
  if (!look.items.some((x) => x.category === 'shoes')) lines.push('  - shoes: keep the shoes from image 1 exactly as they are');
  const images = [anchor, ...used.map((p) => outfits[p])];
  const label = (i) => (i === 0 ? 'the finished photo to edit: keep everything except the clothes'
    : `take only the ${look.items.filter((x) => x.photo === used[i - 1]).map((x) => x.description).join(' and the ')} from this photo`);
  return { prompt: template.replace('{{GARMENTS}}', lines.join('\n')), images, label };
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

async function callOpenAI(m, images, prompt, label, opts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set in .env.local');
  const form = new FormData();
  form.append('model', m.model);
  form.append('prompt', prompt + '\n\nThe images are given in order: ' + images.map((x, i) => `${i + 1} = ${label(i)}`).join('; ') + '.');
  form.append('size', m.size);
  form.append('quality', m.quality);
  form.append('output_format', 'png');
  form.append('n', '1');
  if (m.inputFidelity) form.append('input_fidelity', m.inputFidelity);
  for (const img of images) form.append('image[]', new Blob([img.bytes], { type: img.mime }), img.file);
  const res = await fetch(`${OPENAI_BASE}/v1/images/edits`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message || JSON.stringify(json).slice(0, 300)}`);
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image');
  const u = json.usage || {};
  const p = PRICES[m.key];
  const imgIn = u.input_tokens_details?.image_tokens ?? null;
  const txtIn = u.input_tokens_details?.text_tokens ?? null;
  return {
    image: Buffer.from(b64, 'base64'),
    tokens: { input: u.input_tokens ?? null, inputImage: imgIn, output: u.output_tokens ?? null },
    cost: p ? p.outputPerImage + (imgIn || 0) / 1e6 * p.imageInputPerM + (txtIn || 0) / 1e6 * p.textInputPerM : null,
  };
}

const fmt = (x, d = 3) => (x == null ? '–' : typeof x === 'number' ? x.toFixed(d) : String(x));

async function main() {
  const opts = args();
  const { faces, outfits, images } = await loadInputs();
  console.log(`Faces: ${faces.map((x) => x.file).join(', ')}`);
  const resized = images.filter((x) => x.resized);
  if (resized.length) console.log(`Resized ${resized.length} photo(s) to max ${MAX_SIDE} px: ${resized.map((x) => `${x.file} ${x.resized}`).join(', ')}`);
  const totalMB = images.reduce((n, x) => n + x.bytes.length, 0) / 1e6;
  console.log(`Upload per request: ${totalMB.toFixed(1)} MB`);
  console.log(`Reading the garments in ${outfits.length} outfit photo(s) with ${opts.reader}…`);
  const { readings, wardrobe, cost: readCost } = await readWardrobe(outfits, opts.reader);
  readings.forEach((r, i) => console.log(`  photo ${i + 1} = image ${faces.length + i + 1}, ${outfits[i].file}: ${r.items.map((x) => `${x.description} [${x.category}${x.visibility === 'full' ? '' : ', ' + x.visibility}]`).join('; ') || 'nothing recognised'}`));
  const seed = opts.seed ?? (Date.now() % 100000);
  const looks = composeLooks(wardrobe, { count: opts.looks, seed });
  if (looks.length < opts.looks) console.warn(`Only ${looks.length} different look(s) are possible from these photos (asked for ${opts.looks}).`);
  const template = await readFile(PROMPT_FILE, 'utf8');
  looks.forEach((look, i) => {
    look.n = i + 1;
    look.prompt = buildPrompt(template, faces, outfits, look, opts);
    look.label = (k) => imageLabel(faces, look, k);
    console.log(`Look ${look.n} (seed ${seed}${look.newCombination ? '' : ', NOT a new combination: add photos with other outfits'}):`);
    look.items.forEach((x) => console.log(`  - ${x.description} (${x.category}) from photo ${x.photo + 1} (${outfits[x.photo].file})`));
  });
  console.log(`Reading cost: ~$${readCost.toFixed(4)}`);
  opts.faceCount = faces.length;
  const wanted = opts.only ? opts.only.split(',') : null;
  const models = MODELS.filter((m) => (wanted ? wanted.some((w) => w === m.key || (w === m.provider && !m.optIn)) : !m.optIn));
  if (!models.length) throw new Error(`--only=${opts.only} matches no model. Use gemini, openai or model keys: ${MODELS.map((m) => m.key).join(', ')}`);

  console.log(`Models: ${models.map((m) => m.key).join(', ')} × ${looks.length} look(s) × ${opts.runs} run(s), Gemini size ${opts.size}, photo detail ${opts.detail}`);
  if (opts.dryRun) { console.log('\n--- prompt (look 1) ---\n' + looks[0].prompt + '\n\nDry run: no images generated. Use the same --seed to generate these looks.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = join(RESULTS, stamp);
  await mkdir(out, { recursive: true });
  for (const img of images) { img.refName = 'ref-' + (img.resized ? img.file.replace(/\.[^.]+$/, '.jpg') : img.file); await writeFile(join(out, img.refName), img.bytes); }
  await writeFile(join(out, 'prompt.txt'), looks.map((l) => (looks.length > 1 ? `=== Look ${l.n} ===\n` : '') + l.prompt).join('\n\n'));
  await writeFile(join(out, 'wardrobe.json'), JSON.stringify({ seed, readerModel: opts.reader, faces: faces.map((x) => x.file), readings: readings.map((r, i) => ({ file: outfits[i].file, ...r })), looks: looks.map(({ prompt, label, ...l }) => l) }, null, 2));

  let cleaner = null;
  if (opts.clean) {
    try { cleaner = await createCleaner(join(ROOT, 'image-test', 'models')); }
    catch (e) { console.log(`Background cleaning skipped: ${e.message}`); }
  }
  const rows = [];
  const call = (m, imgs, prompt, label, o) => (m.provider === 'gemini' ? callGemini : callOpenAI)(m, imgs, prompt, label, o);
  const generate = async (m, look, run, file, imgs, prompt, label, o) => {
    process.stdout.write(`${looks.length > 1 ? `look ${look.n} · ` : ''}${m.key} ${file.includes('rejected') ? 'retry' : 'run ' + run}… `);
    const t0 = performance.now();
    try {
      const r = await call(m, imgs, prompt, label, o);
      const seconds = (performance.now() - t0) / 1000;
      // Pure white background, shadow only under the feet. The model's own output is kept as *-raw.png.
      if (cleaner) {
        try {
          const t1 = performance.now();
          const cleaned = await cleanBackground(cleaner, r.image);
          await writeFile(join(out, file.replace(/\.png$/, '-raw.png')), r.image);
          r.image = cleaned.bytes;
          r.clean = { before: cleaned.before, seconds: (performance.now() - t1) / 1000 };
        } catch (e) { console.log(`(background not cleaned: ${e.message})`); }
      }
      await writeFile(join(out, file), r.image);
      if (r.usage) await writeFile(join(out, file.replace(/\.png$/, '.usage.json')), JSON.stringify(r.usage, null, 2));
      console.log(`${seconds.toFixed(1)}s, ~$${fmt(r.cost)}${r.clean ? `, background ${Math.round(r.clean.before)}→255 in ${r.clean.seconds.toFixed(1)}s` : ''}`);
      return { m, look, run, seconds, file, ...r };
    } catch (e) {
      const seconds = (performance.now() - t0) / 1000;
      console.log(`FAILED after ${seconds.toFixed(1)}s: ${e.message}`);
      return { m, look, run, seconds, error: e.message };
    }
  };
  const name = (m, look, run) => (looks.length > 1 ? `${m.key}-look${look.n}-${run}.png` : `${m.key}-${run}.png`);
  const anchorMode = opts.anchor && looks.length > 1;
  const rejected = [];
  if (anchorMode) {
    // Look 1 is generated from the face photos and checked; looks 2+ edit only the clothes of that accepted image,
    // so face, pose, framing and shadow stay the same in every look.
    const editTemplate = await readFile(EDIT_PROMPT_FILE, 'utf8');
    for (const m of models) {
      let anchor = null;
      for (let attempt = 1; attempt <= opts.anchorTries && !anchor; attempt++) {
        const last = attempt === opts.anchorTries;
        const file = name(m, looks[0], 1);
        const r = await generate(m, looks[0], 1, file, images, looks[0].prompt, looks[0].label, opts);
        if (r.error) { if (last) rows.push(r); continue; }
        if (!opts.check || last) { anchor = r; break; }
        const c = (await checkFaces({ faces, lookRefs: images, images: [{ file: r.file, bytes: r.image, mime: 'image/png' }], minIdentity: opts.minIdentity, log: () => {} })).results[0];
        if (c.pass) { anchor = r; break; }
        const rej = r.file.replace(/\.png$/, `-rejected-${attempt}.png`);
        await writeFile(join(out, rej), r.image);
        rejected.push({ file: rej, reasons: c.reasons, cost: r.cost });
        console.log(`  first look rejected (${c.reasons.join('; ')}), generating it again…`);
      }
      if (!anchor) continue;
      if (opts.check && rejected.length && anchor) console.log(`  first look accepted.`);
      rows.push(anchor);
      const anchorImg = { file: anchor.file, bytes: anchor.image, mime: 'image/png' };
      for (const look of looks.slice(1)) {
        const edit = buildEdit(editTemplate, outfits, look, anchorImg);
        look.editPrompt = edit.prompt;
        for (let run = 1; run <= opts.runs; run++) {
          // Each edit must keep look 1's pose and pass the face check; otherwise it is made again (same tries as look 1).
          for (let attempt = 1; attempt <= opts.anchorTries; attempt++) {
            const r = await generate(m, look, run, name(m, look, run), edit.images, edit.prompt, edit.label, { ...opts, faceCount: 1 });
            const last = attempt === opts.anchorTries;
            if (r.error || !opts.check || last) { rows.push(r); break; }
            const img = { file: r.file, bytes: r.image, mime: 'image/png' };
            const [pose, face] = await Promise.all([
              poseCheck(anchorImg, img).catch((e) => ({ same: true, note: `pose check failed: ${e.message}` })),
              checkFaces({ faces, lookRefs: images, images: [img], minIdentity: opts.minIdentity, log: () => {} }).then((x) => x.results[0]),
            ]);
            const reasons = [...(pose.same ? [] : [`pose differs from look 1: ${pose.note}`]), ...face.reasons];
            if (!reasons.length) { rows.push(r); break; }
            const rej = r.file.replace(/\.png$/, `-rejected-${attempt}.png`);
            await writeFile(join(out, rej), r.image);
            rejected.push({ file: rej, reasons, cost: r.cost });
            console.log(`  look ${look.n} rejected (${reasons.join('; ')}), making it again…`);
          }
        }
      }
    }
  } else {
    for (const look of looks) for (const m of models) {
      for (let run = 1; run <= opts.runs; run++) rows.push(await generate(m, look, run, name(m, look, run), images, look.prompt, look.label, opts));
    }
  }

  if (anchorMode) await writeFile(join(out, 'prompt.txt'), [`=== Look 1 (generated from the face photos) ===\n${looks[0].prompt}`, ...looks.slice(1).filter((l) => l.editPrompt).map((l) => `=== Look ${l.n} (edit of look 1: only the clothes change) ===\n${l.editPrompt}`)].join('\n\n'));

  // Two-layer face check: identity gate (ArcFace) + look check (hair, age, invented tattoos/logos).
  const done = rows.filter((r) => !r.error);
  let check = null;
  if (opts.check && done.length) {
    console.log(`\nChecking faces (identity gate ≥ ${opts.minIdentity}, then hair/age/added items)…`);
    check = await checkFaces({ faces, lookRefs: images, images: done.map((r) => ({ file: r.file, bytes: r.image, mime: 'image/png' })), minIdentity: opts.minIdentity });
    check.results.forEach((c, i) => { done[i].check = c; console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.file}  identity ${fmt(c.identity)}${c.reasons.length ? '  ' + c.reasons.join('; ') : ''}`); });
    console.log(`Look check cost: ~$${check.lookCost.toFixed(4)}`);
  }

  const lines = ['# Image test ' + stamp, '', `Occasion: ${opts.occasion} · Weather: ${opts.weather} · Time: ${opts.time}`, '', `Pose: ${opts.pose}`, '', `Seed: ${seed} (repeat with --seed=${seed}) · Gemini size: ${opts.size} · Photo detail: ${opts.detail}`, '',
    '## Garments read', '', ...readings.map((r, i) => `- Photo ${i + 1} (${outfits[i].file}): ${r.items.map((x) => `${x.description} [${x.category}]`).join('; ') || 'nothing recognised'}`), '',
    '## Looks asked for', '', ...looks.map((l) => `- Look ${l.n}: ${l.items.map((x) => `${x.description} (${x.category}, photo ${x.photo + 1})`).join(' + ')}`), '',
    `Reading cost: ~$${readCost.toFixed(4)}`, '',
    ...(anchorMode ? [`Same face, pose and shadow: look 1 was generated from the face photos${opts.check ? ' and had to pass the face check' : ''}; looks 2–${looks.length} are edits of it where only the clothes change, each checked for the same pose as look 1 and remade if it differs.`,
      ...(rejected.length ? ['', `Attempts rejected before one passed (${rejected.length}, ~$${fmt(rejected.reduce((s, r) => s + (r.cost || 0), 0))}):`, ...rejected.map((r) => `- ${r.file}: ${r.reasons.join('; ')}`)] : []), ''] : []),
    '## Results', '',
    '| Look | Model | Run | Seconds | Input tokens | Output tokens | Est. cost (USD) | Result |', '|---|---|---|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.look.n} | ${r.m.key} | ${r.run} | ${r.seconds.toFixed(1)} | ${fmt(r.tokens?.input, 0)} | ${fmt(r.tokens?.output, 0)} | ${fmt(r.cost)} | ${r.error ? 'FAILED: ' + r.error.replace(/\|/g, '/') : r.file} |`);
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
  lines.push('', 'Score each image 1–5: face (would a friend recognise you?), body, garments exact, full frame. Below 4 on face fails.', '',
    'Costs are estimates from the PRICES table in scripts/image-test.mjs; check them on the providers\' pricing pages.');
  await writeFile(join(out, 'report.md'), lines.join('\n') + '\n');

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
