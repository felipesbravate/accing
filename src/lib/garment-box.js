// Where a garment is in its outfit photo (2026-11-09): the garment reader's box, [ymin, xmin, ymax, xmax] on a 0–1000
// scale of the photo, kept with each garment of a look (outfits.items[].box) and backfilled for older looks
// (worker/backfill-boxes.mjs). The Wardrobe crops its thumbnails to it and opens the photo fitted to it. Pure; tested in
// tests/garment-box.test.js.
import { garmentSimilarity } from './wardrobe.js';

/** A usable box: four numbers in 0–1000, top above bottom, left before right, not a sliver. */
export function validBox(b) {
  if (!Array.isArray(b) || b.length !== 4 || !b.every((n) => Number.isFinite(n) && n >= 0 && n <= 1000)) return false;
  const [y0, x0, y1, x1] = b;
  return y1 - y0 >= 20 && x1 - x0 >= 20;
}

const LIKE = 0.25; // a re-read garment matches a saved one at a quarter of their words in common (same colour words)
/** Boxes for saved garments of one photo, from a fresh reading of that photo: one per saved item (or null). Same
 *  category; the only one of its category, else the most alike in wording. Each read garment boxes one saved one. */
export function matchBoxes(saved, read) {
  const left = (read || []).filter((r) => validBox(r.box));
  return (saved || []).map((s) => {
    const same = left.filter((r) => r.category === s.category);
    let best = same.length === 1 ? same[0] : null;
    if (!best) {
      let score = LIKE;
      for (const r of same) { const k = garmentSimilarity(s.description, r.description); if (k >= score) { score = k; best = r; } }
    }
    if (!best) return null;
    left.splice(left.indexOf(best), 1);
    return best.box;
  });
}

/** The photo (W×H) placed in a thumbnail (cw×ch) so the garment's box, with `margin` around it, fills it and sits in
 *  the middle; never smaller than the thumbnail. → { width, height, left, top } in px. */
export function thumbPlacement({ W, H, cw, ch, box, margin = 0.12 }) {
  const [y0, x0, y1, x1] = box.map((n) => n / 1000);
  const bw = (x1 - x0) * W * (1 + 2 * margin), bh = (y1 - y0) * H * (1 + 2 * margin);
  const s = Math.max(Math.min(cw / bw, ch / bh), cw / W, ch / H);
  const width = W * s, height = H * s;
  const cx = ((x0 + x1) / 2) * width, cy = ((y0 + y1) / 2) * height;
  const left = Math.min(0, Math.max(cw - width, cw / 2 - cx));
  const top = Math.min(0, Math.max(ch - height, ch / 2 - cy));
  return { width, height, left, top };
}
