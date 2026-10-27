// Re-checks the generated images of an image-test results folder with the two-layer face check.
// Usage: npm run face-check -- [image-test/results/<folder>] [--min-identity=0.4] [--no-look] [--no-identity]
// Without a folder it checks every results folder, so runs made before the check existed get scores too.
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { checkFaces, checkTable, MIN_IDENTITY } from './face-check/index.mjs';

const RESULTS = join(resolve(import.meta.dirname, '..'), 'image-test', 'results');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const opts = { dirs: [], minIdentity: MIN_IDENTITY, look: true, identity: true };
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--min-identity=')) opts.minIdentity = Number(a.split('=')[1]);
  else if (a === '--no-look') opts.look = false;
  else if (a === '--no-identity') opts.identity = false;
  else if (a.startsWith('--')) { console.error(`Unknown option ${a}`); process.exit(1); }
  else opts.dirs.push(resolve(a));
}
if (!(opts.minIdentity > 0 && opts.minIdentity < 1)) { console.error('--min-identity must be between 0 and 1'); process.exit(1); }
if (!opts.dirs.length) {
  if (!existsSync(RESULTS)) { console.error('No image-test/results folder yet. Run npm run image-test first.'); process.exit(1); }
  opts.dirs = (await readdir(RESULTS)).filter((d) => /^\d{4}-/.test(d)).sort().map((d) => join(RESULTS, d));
}

const load = async (dir, f) => ({ file: f, bytes: await readFile(join(dir, f)), mime: MIME[extname(f).toLowerCase()] });
const all = [];
for (const dir of opts.dirs) {
  const files = (await readdir(dir)).filter((f) => MIME[extname(f).toLowerCase()]).sort();
  const faces = await Promise.all(files.filter((f) => /^ref-face-/i.test(f)).map((f) => load(dir, f)));
  const lookRefs = await Promise.all(files.filter((f) => /^ref-/i.test(f)).map((f) => load(dir, f)));
  const images = await Promise.all(files.filter((f) => /^(gemini|openai)-.*\.png$/i.test(f) && !/-(raw|rejected-\d+)\.png$/i.test(f)).map((f) => load(dir, f)));
  if (!faces.length || !images.length) { console.log(`${basename(dir)}: skipped (no ref-face-* photos or no generated images)`); continue; }
  console.log(`${basename(dir)}: checking ${images.length} image(s) against ${faces.length} face photo(s)…`);
  const { results, lookCost, identityRan } = await checkFaces({ faces, lookRefs, images, ...opts });
  const lines = [`# Face check ${basename(dir)}`, '', `Identity: ${identityRan ? `ArcFace (buffalo_l), similarity to the average of ${faces.length} face photos; below ${opts.minIdentity} = a different person` : 'not run'}.`,
    `Look check: ${opts.look ? `gemini-3.1-flash-lite against ${lookRefs.length} real photos, ~$${lookCost.toFixed(4)}` : 'not run'}.`, '', ...checkTable(results), ''];
  for (const r of results) if (r.reasons.length || r.warnings.length) lines.push(`- ${r.file}: ${[...r.reasons, ...r.warnings.map((w) => 'warning: ' + w)].join('; ')}`);
  await writeFile(join(dir, 'face-check.md'), lines.join('\n') + '\n');
  await writeFile(join(dir, 'face-check.json'), JSON.stringify(results.map(({ look, ...r }) => ({ ...r, look: look && { ...look, cost: undefined } })), null, 2));
  for (const r of results) console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.file}  identity ${r.identity == null ? '–' : r.identity.toFixed(3)}${r.reasons.length ? '  ' + r.reasons.join('; ') : ''}`);
  all.push(...results.map((r) => ({ dir: basename(dir), ...r })));
}
if (all.length > 1) {
  const ok = all.filter((r) => r.pass).length;
  console.log(`\n${ok}/${all.length} passed. Details in face-check.md in each folder.`);
}
