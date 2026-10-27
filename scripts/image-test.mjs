// Image generation test: same reference photos and prompt through each model; measures seconds, tokens and cost.
// Usage: see image-test/README.md. Needs Node 20+ (built-in fetch, FormData, Blob). Keys come from .env.local.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const INPUTS = join(ROOT, 'image-test', 'inputs');
const RESULTS = join(ROOT, 'image-test', 'results');
const PROMPT_FILE = join(ROOT, 'scripts', 'image-test-prompt.txt');

// Models compared. Edit freely.
const MODELS = [
  { key: 'gemini-nano-banana-2', provider: 'gemini', model: 'gemini-3.1-flash-image-preview', aspectRatio: '2:3', imageSize: '1K' },
  { key: 'openai-2.5-flare-medium', provider: 'openai', model: 'gpt-image-2.5-flare', size: '1024x1536', quality: 'medium' },
  { key: 'openai-2.5-flare-high', provider: 'openai', model: 'gpt-image-2.5-flare', size: '1024x1536', quality: 'high' },
];

// USD. Estimates only: verify on the providers' pricing pages before trusting totals.
// Gemini 3.1 Flash Image: $0.067 per 1K image, input $0.50 / 1M tokens (myarchitectai.com, Aug 2026).
// GPT Image 2.5: image input $8 / 1M, text input $5 / 1M (virse.ai, Sep 2026); output per square image
//   medium $0.01317, high $0.05268 (virse.ai); portrait 1024x1536 assumed ~1.5x square.
const PRICES = {
  'gemini-nano-banana-2': { inputPerM: 0.5, outputPerImage: 0.067 },
  'openai-2.5-flare-medium': { imageInputPerM: 8, textInputPerM: 5, outputPerImage: 0.01317 * 1.5 },
  'openai-2.5-flare-high': { imageInputPerM: 8, textInputPerM: 5, outputPerImage: 0.05268 * 1.5 },
};

const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
const OPENAI_BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function args() {
  const out = { runs: 3, only: null, dryRun: false, occasion: 'an office day', weather: 'sunny 24°C', time: 'Monday morning',
    pose: 'a natural fashion lookbook pose: body turned about 15 degrees from the camera, weight on one leg with the other knee slightly bent, shoulders relaxed, one hand casually in a pocket or resting on the hip and the other loose at the side, chin level, a calm confident expression with a slight smile, eyes to the camera' };
  for (const a of process.argv.slice(2)) {
    const [k, ...rest] = a.replace(/^--/, '').split('='); const v = rest.join('=');
    if (k === 'runs') out.runs = Math.max(1, Math.min(10, parseInt(v, 10) || 3));
    else if (k === 'only') out.only = v;
    else if (k === 'dry-run') out.dryRun = true;
    else if (k in out) out[k] = v;
    else throw new Error(`Unknown option --${k}`);
  }
  return out;
}

async function loadInputs() {
  if (!existsSync(INPUTS)) throw new Error(`Missing folder ${INPUTS}`);
  const files = (await readdir(INPUTS)).filter((f) => MIME[extname(f).toLowerCase()]);
  const pick = (name) => files.find((f) => f.toLowerCase().startsWith(name + '.'));
  const roles = [['face-front', 'face, front'], ['face-left', 'face, left three-quarter'], ['face-right', 'face, right three-quarter'], ['body', 'full body']];
  const images = [];
  for (const [name, label] of roles) {
    const f = pick(name);
    if (!f && name !== 'body') throw new Error(`Missing ${name}.jpg (or .png/.webp) in image-test/inputs`);
    if (f) images.push({ file: f, label, role: name });
  }
  // garment-N-<item>: a photo of the item itself. worn-N-<item>: a photo of someone wearing it; only <item> is taken.
  const byNumber = (re) => files.filter((f) => re.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10));
  const describe = (f, prefix) => f.replace(/\.[^.]+$/, '').replace(new RegExp('^' + prefix + '-\\d+-?', 'i'), '').replace(/[-_]+/g, ' ').trim();
  for (const f of byNumber(/^garment-\d+/i)) images.push({ file: f, label: describe(f, 'garment') || 'garment', role: 'garment' });
  for (const f of byNumber(/^worn-\d+/i)) {
    const item = describe(f, 'worn');
    if (!item) throw new Error(`Name ${f} after the item to take from it, e.g. worn-1-brown-tweed-blazer.jpg`);
    images.push({ file: f, label: item, role: 'worn' });
  }
  if (!images.some((x) => x.role === 'garment' || x.role === 'worn')) {
    throw new Error('Add at least one garment-1-<item>.jpg or worn-1-<item>.jpg to image-test/inputs');
  }
  for (const img of images) {
    img.bytes = await readFile(join(INPUTS, img.file));
    img.mime = MIME[extname(img.file).toLowerCase()];
  }
  return images;
}

function buildPrompt(template, images, opts) {
  const n = (i) => i + 1;
  const faces = images.filter((x) => x.role.startsWith('face')).map((x) => n(images.indexOf(x)));
  const body = images.findIndex((x) => x.role === 'body');
  const identity = [`- Images ${faces.join(', ')} show this person's face from the front, left and right.`];
  identity.push(body >= 0 ? `- Image ${n(body)} shows their full body.` : '- No full-body photo is given: keep a natural, average build for this person.');
  const garments = images.map((x, i) => (x.role === 'garment' ? `  Image ${n(i)}: ${x.label}`
    : x.role === 'worn' ? `  Image ${n(i)}: the ${x.label} worn in this photo. Take only the ${x.label}; ignore everything else in that photo (other clothes, pose, background, and the person in it)`
    : null)).filter(Boolean).join('\n');
  return template.replace('{{IDENTITY}}', identity.join('\n')).replace('{{GARMENTS}}', garments)
    .replace('{{OCCASION}}', opts.occasion).replace('{{WEATHER}}', opts.weather).replace('{{TIME}}', opts.time)
    .replace('{{POSE}}', opts.pose);
}

async function callGemini(m, images, prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local');
  const parts = [];
  images.forEach((img, i) => {
    parts.push({ text: `Image ${i + 1} (${img.role === 'garment' ? 'garment: ' + img.label : img.role === 'worn' ? 'take only the ' + img.label + ' from this photo' : img.label}):` });
    parts.push({ inlineData: { mimeType: img.mime, data: img.bytes.toString('base64') } });
  });
  parts.push({ text: prompt });
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${m.model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: m.aspectRatio, imageSize: m.imageSize } },
    }),
  });
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
    cost: p ? p.outputPerImage + (inputTokens || 0) / 1e6 * p.inputPerM : null,
  };
}

async function callOpenAI(m, images, prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set in .env.local');
  const form = new FormData();
  form.append('model', m.model);
  form.append('prompt', prompt + '\n\nThe images are given in order: ' + images.map((x, i) => `${i + 1} = ${x.role === 'garment' ? 'garment: ' + x.label : x.role === 'worn' ? 'take only the ' + x.label + ' from this photo' : x.label}`).join('; ') + '.');
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
  const images = await loadInputs();
  const prompt = buildPrompt(await readFile(PROMPT_FILE, 'utf8'), images, opts);
  const models = MODELS.filter((m) => !opts.only || m.provider === opts.only || m.key === opts.only);
  if (!models.length) throw new Error(`--only=${opts.only} matches no model (use gemini, openai or a model key)`);

  console.log(`Inputs (${images.length}): ${images.map((x, i) => `${i + 1}=${x.file}`).join(', ')}`);
  console.log(`Models: ${models.map((m) => m.key).join(', ')} × ${opts.runs} run(s)`);
  if (opts.dryRun) { console.log('\n--- prompt ---\n' + prompt); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = join(RESULTS, stamp);
  await mkdir(out, { recursive: true });
  for (const img of images) await writeFile(join(out, 'ref-' + img.file), img.bytes);
  await writeFile(join(out, 'prompt.txt'), prompt);

  const rows = [];
  for (const m of models) {
    for (let run = 1; run <= opts.runs; run++) {
      process.stdout.write(`${m.key} run ${run}… `);
      const t0 = performance.now();
      try {
        const r = await (m.provider === 'gemini' ? callGemini : callOpenAI)(m, images, prompt);
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

  const lines = ['# Image test ' + stamp, '', `Occasion: ${opts.occasion} · Weather: ${opts.weather} · Time: ${opts.time}`, '', `Pose: ${opts.pose}`, '',
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
<h2>References</h2><div class="row">${images.map((x) => `<figure><img src="ref-${esc(x.file)}"><figcaption>${esc(x.label)}</figcaption></figure>`).join('')}</div>
${models.map((m) => `<h2>${esc(m.key)}</h2><div class="row">${rows.filter((r) => r.m === m).map((r) => r.error
    ? `<figure><div class="err">${esc(r.error)}</div><figcaption>run ${r.run}</figcaption></figure>`
    : `<figure><img src="${esc(r.file)}"><figcaption>run ${r.run} · ${r.seconds.toFixed(1)}s · ~$${fmt(r.cost)}</figcaption></figure>`).join('')}</div>`).join('')}`;
  await writeFile(join(out, 'index.html'), html);
  console.log(`\nDone. Open ${join(out, 'index.html')} to compare, and ${join(out, 'report.md')} for the numbers.`);
}

main().catch((e) => { console.error('Error: ' + e.message); process.exit(1); });
