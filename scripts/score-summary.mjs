// Summary of the hand scores in image-test/results/*/scores.csv (face, clothes, pose: 1 = right, 0 = wrong).
// Usage: npm run score-summary            (all runs)
//        npm run score-summary -- 2026-10-28   (only results folders whose name contains this)
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const RESULTS = join(resolve(import.meta.dirname, '..'), 'image-test', 'results');

/** Minimal CSV reader for the sheet we write (quoted fields, "" escapes). */
export function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/).filter((l) => l.trim())) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur); rows.push(out);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** Rates over scored rows only. A look is "right" when face, clothes and pose are all 1. */
export function summarise(rows) {
  const scored = rows.filter((r) => ['face', 'clothes', 'pose'].every((k) => r[k] === '0' || r[k] === '1'));
  const rate = (f) => (scored.length ? scored.filter(f).length / scored.length : null);
  const allRight = (r) => r.face === '1' && r.clothes === '1' && r.pose === '1';
  const first = scored.filter((r) => r.attempt === '1');
  return {
    scored: scored.length, unscored: rows.length - scored.length,
    face: rate((r) => r.face === '1'), clothes: rate((r) => r.clothes === '1'), pose: rate((r) => r.pose === '1'), allRight: rate(allRight),
    keptOnFirstAttempt: scored.length ? first.length / scored.length : null,
    rightOnFirstAttempt: scored.length ? first.filter(allRight).length / scored.length : null,
    clothesMisses: scored.filter((r) => r.clothes === '0').map((r) => `${r.file}: ${r.garments}${r.notes ? ' — ' + r.notes : ''}`),
  };
}

async function main() {
  const filter = process.argv[2] || '';
  if (!existsSync(RESULTS)) throw new Error('No image-test/results folder yet');
  const rows = [];
  for (const d of (await readdir(RESULTS)).filter((x) => x.includes(filter)).sort()) {
    const f = join(RESULTS, d, 'scores.csv');
    if (existsSync(f)) rows.push(...parseCsv(await readFile(f, 'utf8')).map((r) => ({ ...r, run: d })));
  }
  const s = summarise(rows);
  const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  console.log(`Scored looks: ${s.scored} (${s.unscored} not scored yet)`);
  console.log(`Face right ${pct(s.face)} · clothes right ${pct(s.clothes)} · pose right ${pct(s.pose)} · all three ${pct(s.allRight)}`);
  console.log(`Kept on the first attempt ${pct(s.keptOnFirstAttempt)} · right on the first attempt ${pct(s.rightOnFirstAttempt)}`);
  if (s.scored && s.scored < 20) console.log(`Only ${s.scored} looks: treat these as rough (with 10 looks, 9/10 right could still mean ~60% in truth).`);
  if (s.clothesMisses.length) console.log('Clothes wrong:\n' + s.clothesMisses.map((x) => '  - ' + x).join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main().catch((e) => { console.error('Error: ' + e.message); process.exitCode = 1; });
