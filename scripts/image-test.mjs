// Image generation test. Drop head-to-toe photos of one person (any file names) in image-test/inputs; the script
// reads the garments in each photo, composes a new outfit across photos, then sends the same photos and prompt to
// each image model and measures seconds, tokens and cost.
// Usage: see image-test/README.md. Needs Node 20+ (built-in fetch, FormData, Blob). Keys come from .env.local.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { CATEGORIES, composeOutfit, normaliseReading } from './image-test-lib.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const INPUTS = join(ROOT, 'image-test', 'inputs');
const RESULTS = join(ROOT, 'image-test', 'results');
const PROMPT_FILE = join(ROOT, 'scripts', 'image-test-prompt.txt');

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
  const out = { runs: 3, only: null, dryRun: false, seed: null, reader: 'gemini-3.1-flash-lite', size: '1K', detail: 'max',
    expression: 'relaxed and neutral, the same natural expression as in the face photos (no smile they do not have)', occasion: 'an office day', weather: 'sunny 24°C', time: 'Monday morning',
    pose: 'a natural fashion lookbook pose: body turned about 15 degrees from the camera, weight on one leg with the other knee slightly bent, shoulders relaxed, one hand casually in a pocket or resting on the hip and the other loose at the side, chin level, eyes to the camera' };
  for (const a of process.argv.slice(2)) {
    const [k, ...rest] = a.replace(/^--/, '').split('='); const v = rest.join('=');
    if (k === 'runs') out.runs = Math.max(1, Math.min(10, parseInt(v, 10) || 3));
    else if (k === 'only') out.only = v;
    else if (k === 'dry-run') out.dryRun = true;
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

// Phone photos are 4–11 MB. Models gain nothing above ~2048 px, and big uploads distort the timing and can exceed
// request limits, so photos are resized like the app would (macOS sips; without it the original is sent).
const MAX_SIDE = 2048;
let scratch = null;
async function shrink(img) {
  if (img.bytes.length < 1_500_000) return img;
  try {
    scratch ??= await mkdtemp(join(tmpdir(), 'accing-image-test-'));
    const src = join(scratch, 'in-' + img.file), out = join(scratch, img.file.replace(/\.[^.]+$/, '') + '.jpg');
    await writeFile(src, img.bytes);
    execFileSync('sips', ['-Z', String(MAX_SIDE), '-s', 'format', 'jpeg', '-s', 'formatOptions', '90', src, '--out', out], { stdio: 'ignore' });
    const bytes = await readFile(out);
    return { ...img, bytes, mime: 'image/jpeg', resized: `${(img.bytes.length / 1e6).toFixed(1)} MB → ${(bytes.length / 1e6).toFixed(1)} MB` };
  } catch {
    if (!shrink.warned) { console.warn(`Could not resize photos (sips not available); sending originals, which may be slow or too large.`); shrink.warned = true; }
    return img;
  }
}

const FACES = [['face-front', 'face close-up, front'], ['face-left', 'face close-up, left side'], ['face-right', 'face close-up, right side']];

/** Faces first (fixed names, as captured in onboarding), then every other photo as a head-to-toe outfit photo. */
async function loadInputs() {
  if (!existsSync(INPUTS)) throw new Error(`Missing folder ${INPUTS}`);
  const all = (await readdir(INPUTS)).filter((f) => !f.startsWith('.')).sort();
  const heic = all.filter((f) => /\.(heic|heif)$/i.test(f));
  if (heic.length) console.warn(`Skipping ${heic.join(', ')}: HEIC is not supported. Export as JPG (AirDrop > Options > Most Compatible).`);
  const files = all.filter((f) => MIME[extname(f).toLowerCase()]);
  const load = async (f) => shrink({ file: f, bytes: await readFile(join(INPUTS, f)), mime: MIME[extname(f).toLowerCase()] });
  const faces = [];
  for (const [name, label] of FACES) {
    const f = files.find((x) => x.toLowerCase().startsWith(name + '.'));
    if (!f) throw new Error(`Missing ${name}.jpg in image-test/inputs (the onboarding face photos: face-front, face-left, face-right)`);
    faces.push({ ...(await load(f)), label });
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
  // The photo must show the feet, so without identified shoes the model may choose plain ones (the only free choice).
  if (!outfit.items.some((x) => x.category === 'shoes')) {
    lines.push('  - shoes: none were identified in the photos, so add simple, neutral shoes that suit this outfit (the only item you may choose yourself)');
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
  const inputTokens = u.promptTokenCount ?? null;
  return {
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
  const outfit = composeOutfit(wardrobe, { seed });
  console.log(`Outfit (seed ${seed}${outfit.newCombination ? '' : ', NOT a new combination: add photos with other outfits'}):`);
  outfit.items.forEach((x) => console.log(`  - ${x.description} (${x.category}) from photo ${x.photo + 1} (${outfits[x.photo].file})`));
  console.log(`Reading cost: ~$${readCost.toFixed(4)}`);
  const prompt = buildPrompt(await readFile(PROMPT_FILE, 'utf8'), faces, outfits, outfit, opts);
  const label = (i) => imageLabel(faces, outfit, i);
  opts.faceCount = faces.length;
  const wanted = opts.only ? opts.only.split(',') : null;
  const models = MODELS.filter((m) => (wanted ? wanted.some((w) => w === m.key || (w === m.provider && !m.optIn)) : !m.optIn));
  if (!models.length) throw new Error(`--only=${opts.only} matches no model. Use gemini, openai or model keys: ${MODELS.map((m) => m.key).join(', ')}`);

  console.log(`Models: ${models.map((m) => m.key).join(', ')} × ${opts.runs} run(s), Gemini size ${opts.size}, photo detail ${opts.detail}`);
  if (opts.dryRun) { console.log('\n--- prompt ---\n' + prompt + '\n\nDry run: no images generated. Use the same --seed to generate this outfit.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = join(RESULTS, stamp);
  await mkdir(out, { recursive: true });
  for (const img of images) { img.refName = 'ref-' + (img.resized ? img.file.replace(/\.[^.]+$/, '.jpg') : img.file); await writeFile(join(out, img.refName), img.bytes); }
  await writeFile(join(out, 'prompt.txt'), prompt);
  await writeFile(join(out, 'wardrobe.json'), JSON.stringify({ seed, readerModel: opts.reader, faces: faces.map((x) => x.file), readings: readings.map((r, i) => ({ file: outfits[i].file, ...r })), outfit }, null, 2));

  const rows = [];
  for (const m of models) {
    for (let run = 1; run <= opts.runs; run++) {
      process.stdout.write(`${m.key} run ${run}… `);
      const t0 = performance.now();
      try {
        const r = await (m.provider === 'gemini' ? callGemini : callOpenAI)(m, images, prompt, label, opts);
        const seconds = (performance.now() - t0) / 1000;
        const file = `${m.key}-${run}.png`;
        await writeFile(join(out, file), r.image);
        rows.push({ m, run, seconds, file, ...r });
        console.log(`${seconds.toFixed(1)}s, ~$${fmt(r.cost)}`);
      } catch (e) {
        const seconds = (performance.now() - t0) / 1000;
        rows.push({ m, run, seconds, error: e.message });
        console.log(`FAILED after ${seconds.toFixed(1)}s: ${e.message}`);
      }
    }
  }

  const lines = ['# Image test ' + stamp, '', `Occasion: ${opts.occasion} · Weather: ${opts.weather} · Time: ${opts.time}`, '', `Pose: ${opts.pose}`, '', `Seed: ${seed} (repeat with --seed=${seed}) · Gemini size: ${opts.size} · Photo detail: ${opts.detail}`, '',
    '## Garments read', '', ...readings.map((r, i) => `- Photo ${i + 1} (${outfits[i].file}): ${r.items.map((x) => `${x.description} [${x.category}]`).join('; ') || 'nothing recognised'}`), '',
    '## Outfit asked for', '', ...outfit.items.map((x) => `- ${x.description} (${x.category}) from photo ${x.photo + 1}`), '',
    `Reading cost: ~$${readCost.toFixed(4)}`, '', '## Results', '',
    '| Model | Run | Seconds | Input tokens | Output tokens | Est. cost (USD) | Result |', '|---|---|---|---|---|---|---|'];
  for (const r of rows) lines.push(`| ${r.m.key} | ${r.run} | ${r.seconds.toFixed(1)} | ${fmt(r.tokens?.input, 0)} | ${fmt(r.tokens?.output, 0)} | ${fmt(r.cost)} | ${r.error ? 'FAILED: ' + r.error.replace(/\|/g, '/') : r.file} |`);
  lines.push('', '## Averages (successful runs)', '', '| Model | Runs OK | Avg seconds | Avg cost (USD) |', '|---|---|---|---|');
  for (const m of models) {
    const ok = rows.filter((r) => r.m === m && !r.error);
    const avg = (f) => (ok.length ? ok.reduce((s, r) => s + (f(r) || 0), 0) / ok.length : null);
    lines.push(`| ${m.key} | ${ok.length}/${opts.runs} | ${fmt(avg((r) => r.seconds), 1)} | ${fmt(avg((r) => r.cost))} |`);
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
<h2>Outfit asked for</h2><p>${outfit.items.map((x) => `${esc(x.description)} <small>(photo ${x.photo + 1})</small>`).join(' + ')}</p>
${models.map((m) => `<h2>${esc(m.key)}</h2><div class="row">${rows.filter((r) => r.m === m).map((r) => r.error
    ? `<figure><div class="err">${esc(r.error)}</div><figcaption>run ${r.run}</figcaption></figure>`
    : `<figure><img src="${esc(r.file)}"><figcaption>run ${r.run} · ${r.seconds.toFixed(1)}s · ~$${fmt(r.cost)}</figcaption></figure>`).join('')}</div>`).join('')}`;
  await writeFile(join(out, 'index.html'), html);
  console.log(`\nDone. Open ${join(out, 'index.html')} to compare, and ${join(out, 'report.md')} for the numbers.`);
}

main().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; })
  .finally(() => (scratch ? rm(scratch, { recursive: true, force: true }) : null));
