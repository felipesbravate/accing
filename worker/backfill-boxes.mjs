// One-off (2026-11-09): boxes for the garments of looks made before boxes were kept. For every user, each wardrobe
// photo whose garments have no box is read once more by the garment reader (scripts/garment-reader.mjs, the pipeline's
// own), and each saved garment of that photo gets the box of the re-read garment that matches it (same category, most
// alike in wording: src/lib/garment-box.js matchBoxes). The Wardrobe then crops its thumbnails and opens photos on the
// garment. Run on the worker, where the secrets are:
//   fly ssh console -a accing-worker -C "node worker/backfill-boxes.mjs --dry-run"   (reads and reports, writes nothing)
//   fly ssh console -a accing-worker -C "node worker/backfill-boxes.mjs"
// Safe to run again: only garments still without a box are read. About $0.0003 a photo (gemini-3.1-flash-lite).
import { createClient } from '@supabase/supabase-js';
import { readPhoto } from '../scripts/garment-reader.mjs';
import { matchBoxes, validBox } from '../src/lib/garment-box.js';

const DRY = process.argv.includes('--dry-run');
const MODEL = process.env.READER_MODEL || 'gemini-3.1-flash-lite';
const AT_ONCE = 4;
for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GEMINI_API_KEY']) if (!process.env[k]) throw new Error(`Missing secret ${k}`);
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Every look's garments, a page at a time.
const outfits = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('outfits').select('id, user_id, items').order('id').range(from, from + 999);
  if (error) throw new Error(`Reading looks: ${error.message}`);
  outfits.push(...data);
  if (data.length < 1000) break;
}
// Photo → the garments of it still without a box (each wording once).
const wanting = new Map();
for (const o of outfits) for (const x of o.items || []) {
  if (!x?.photo_id || validBox(x.box)) continue;
  const list = wanting.get(x.photo_id) || [];
  if (!list.some((g) => g.category === x.category && g.description === x.description)) list.push({ category: x.category, description: x.description });
  wanting.set(x.photo_id, list);
}
const ids = [...wanting.keys()];
const { data: photos, error: pe } = ids.length ? await db.from('wardrobe_photos').select('id, path').in('id', ids) : { data: [] };
if (pe) throw new Error(`Reading photos: ${pe.message}`);
const pathOf = new Map(photos.map((p) => [p.id, p.path]));
console.log(`${outfits.length} looks; ${ids.length} photos with garments to box (${ids.length - pathOf.size} of them deleted since).`);

// Read each photo; key the boxes by photo, category and wording.
const boxes = new Map(); // `${photo_id}|${category}|${description}` → box
let read = 0, boxed = 0, missed = 0, cost = 0, failed = 0;
const queue = ids.filter((id) => pathOf.has(id));
await Promise.all(Array.from({ length: AT_ONCE }, async () => {
  for (let id; (id = queue.shift());) {
    try {
      const { data: blob, error } = await db.storage.from('wardrobe').download(pathOf.get(id));
      if (error) throw new Error(error.message);
      const r = await readPhoto({ mime: 'image/jpeg', bytes: Buffer.from(await blob.arrayBuffer()), file: pathOf.get(id) }, 0, MODEL);
      read += 1; cost += r.cost;
      const saved = wanting.get(id);
      matchBoxes(saved, r.items).forEach((box, i) => {
        if (box) { boxes.set(`${id}|${saved[i].category}|${saved[i].description}`, box); boxed += 1; } else missed += 1;
      });
    } catch (e) { failed += 1; console.warn(`  ${id}: ${e.message}`); }
  }
}));
console.log(`Read ${read} photos ($${cost.toFixed(4)}); ${boxed} garments boxed, ${missed} not matched, ${failed} photos failed.`);

// Write the boxes into the looks.
let changed = 0;
for (const o of outfits) {
  let touched = false;
  const items = (o.items || []).map((x) => {
    const box = x?.photo_id && !validBox(x.box) ? boxes.get(`${x.photo_id}|${x.category}|${x.description}`) : null;
    if (!box) return x;
    touched = true;
    return { ...x, box };
  });
  if (!touched) continue;
  changed += 1;
  if (DRY) continue;
  const { error } = await db.from('outfits').update({ items }).eq('id', o.id);
  if (error) console.warn(`  look ${o.id}: ${error.message}`);
}
console.log(DRY ? `Dry run: ${changed} looks would get boxes. Nothing written.` : `${changed} looks updated.`);
