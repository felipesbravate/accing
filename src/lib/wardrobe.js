// The Wardrobe (Figma "Mobile - Profile" 268:11591, "Mobile - Wardrobe" 306:4775): every garment the reader found in
// the person's outfit photos, sorted into the 12 categories of the Profile tiles. Pure; tested in tests/wardrobe.test.js.
// A garment is known through the looks made with it (outfits.items: category, description, photo_id) and, since
// 2026-11-12, through the reading of its outfit photo (wardrobe_photos.items, migration 013), so a garment no look
// uses yet (a sweater that suited none of the day's looks) is still in the wardrobe. One entry per real garment.

export const WARDROBE_CATEGORIES = [
  { key: 't-shirts', label: 'T-shirts', one: 'T-shirt', icon: 't-shirt' },
  { key: 'pants', label: 'Pants', one: 'pair of pants', icon: 'chinos' },
  { key: 'dresses', label: 'Dresses', one: 'dress', icon: 'dress' },
  { key: 'skirts', label: 'Skirts', one: 'skirt', icon: 'skirt' },
  { key: 'shorts', label: 'Shorts', one: 'pair of shorts', icon: 'shorts' },
  { key: 'shirts', label: 'Shirts', one: 'shirt', icon: 'polo-shirt' },
  { key: 'sweaters', label: 'Sweaters', one: 'sweater', icon: 'sweater' },
  { key: 'jackets', label: 'Jackets', one: 'jacket', icon: 'bomber-jacket' },
  { key: 'coats', label: 'Coats', one: 'coat', icon: 'winter-coat' },
  { key: 'sneakers', label: 'Sneakers', one: 'pair of sneakers', icon: 'sneakers' },
  { key: 'shoes', label: 'Shoes & boots', one: 'pair of shoes', icon: 'dress-shoes' },
  { key: 'heels', label: 'Heels', one: 'pair of heels', icon: 'high-heels' },
];

/** Which tile a garment ({ category, description }) belongs to, or null (accessories, unknown). */
export function wardrobeCategory(x) {
  const d = String(x?.description || '').toLowerCase();
  switch (x?.category) {
    case 'top':
      if (/sweater|jumper|knit|pullover|hood|sweatshirt|cardigan|turtleneck|roll[- ]neck|fleece/.test(d)) return 'sweaters';
      if (/t-shirt|tee\b|tank|cami|crop|jersey|vest top|halter|bodysuit/.test(d)) return 't-shirts';
      if (/shirt|blouse|polo|henley|button/.test(d)) return 'shirts';
      return 't-shirts';
    case 'bottom':
      if (/shorts|skort/.test(d)) return 'shorts';
      if (/skirt/.test(d)) return 'skirts';
      return 'pants';
    case 'dress': return 'dresses';
    case 'outerwear':
      // Knitwear and sweatshirts worn open are still sweaters: a zip-up hoodie was filed under Jackets (2026-11-12).
      if (/cardigan|hood|sweatshirt|fleece|knit|jumper|sweater/.test(d) && !/jacket|coat|parka|anorak|windbreaker|shell|puffer|bomber/.test(d)) return 'sweaters';
      if (/coat|parka|puffer|trench|overcoat|duffle|peacoat/.test(d)) return 'coats';
      return 'jackets';
    case 'shoes':
      if (/heel|pump|stiletto|slingback/.test(d)) return 'heels';
      if (/sneaker|trainer|running|tennis shoe|plimsoll/.test(d)) return 'sneakers';
      return 'shoes';
    default: return null;
  }
}

const norm = (d) => String(d || '').trim().toLowerCase().replace(/\s+/g, ' ');
/** One reading of a garment: its photo and kind and wording ("<photo_id>|top|black graphic t-shirt"), or without a
 *  photo id (looks from before 2026-10-31) its kind and wording. */
export function garmentKey(x) {
  return `${x?.photo_id || '-'}|${x?.category || ''}|${norm(x?.description)}`;
}

// Same garment, worded differently? (The reader words a garment a little differently in each look, and the same
// outfit is often photographed twice.) Same idea as scripts/image-test-lib.mjs sameGarment: compare meaning, not text.
// Hues only: "light" and "dark" are shades (a "light grey" tee and a "plain grey" one are the same tee); a light and a
// dark version of a hue are not.
const HUES = new Set(['black', 'white', 'grey', 'blue', 'navy', 'red', 'green', 'mint', 'olive', 'khaki', 'beige', 'brown', 'tan', 'camel',
  'cream', 'ivory', 'yellow', 'orange', 'pink', 'purple', 'burgundy', 'charcoal', 'maroon', 'peach', 'lilac', 'lavender', 'teal', 'denim']);
const FILLER = new Set(['a', 'an', 'the', 'with', 'and', 'of', 'in', 'style', 'plain', 'classic', 'basic', 'regular', 'fit', 'colour', 'color',
  'short', 'sleeved', 'sleeve', 'long', 'cotton', 'casual', 'pair', 'mens', 'men', 'womens', 'women']);
const words = (d) => new Set(String(d || '').toLowerCase().replace(/t-shirt|tee\b/g, 'tshirt').replace(/gray/g, 'grey')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !FILLER.has(w)));
const shade = (w) => (w.has('light') && !w.has('dark') ? 'light' : w.has('dark') && !w.has('light') ? 'dark' : '');
/** 0–1: words in common; 0 when both name hues and they differ, or one is light and the other dark. */
export function garmentSimilarity(a, b) {
  const wa = words(a), wb = words(b);
  const ca = [...wa].filter((w) => HUES.has(w)).sort().join(), cb = [...wb].filter((w) => HUES.has(w)).sort().join();
  if (ca && cb && ca !== cb) return 0;
  const sa = shade(wa), sb = shade(wb);
  if (sa && sb && sa !== sb) return 0;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / Math.max(1, new Set([...wa, ...wb]).size);
}
const SAME = 0.6; // "black t-shirt" vs "black t-shirt with graphic print" (0.5) stay two garments

/** Is a photo reading ({ photo_id, category, description }) one of the removed garments? The photo is read again on
 *  each run and the wording can move a little, so: same photo and kind, and the same or alike wording. */
function removedReading(x, removed) {
  return (removed || []).some((r) => r && r.photo_id === x.photo_id && r.category === x.category
    && (norm(r.description) === norm(x.description) || garmentSimilarity(r.description, x.description) >= SAME));
}

/** Looks ({ id, items, created_at, image_path }) → garments, one per real garment: [{ key, keys, category,
 *  description, photo_id, tile, looks: [outfit ids], lookPath }], most-used first. Readings are the same garment when
 *  they are in the same tile and either come from the same photo (and never appear together in one look) or are
 *  worded alike (60% of their words, same colours). Removed readings ([{ photo_id, category, description }]) are left
 *  out. `lookPath`: a look made with it, for a picture when no photo is known. `photos` ([{ id, items }]): the readings
 *  of the outfit photos (wardrobe_photos.items); their garments join the wardrobe even with no look yet. */
export function wardrobeFrom(looks, removed = [], photos = []) {
  const gone = new Set((removed || []).map(garmentKey));
  const byKey = new Map();
  // `seen`: the looks and photo readings a reading is in. Two readings seen together are two different garments.
  const add = (x, seenIn, look = null) => {
    const tile = wardrobeCategory(x);
    if (!tile) return;
    const key = garmentKey(x);
    if (gone.has(key)) return;
    const g = byKey.get(key) || { key, category: x.category, description: x.description, photo_id: x.photo_id || null, tile, looks: [], seen: [], lookPath: null, box: null };
    if (look) g.looks.push(look.id);
    g.seen.push(seenIn);
    if (!g.box && Array.isArray(x.box)) g.box = x.box; // where it is in its photo (src/lib/garment-box.js)
    if (!g.lookPath && look?.generated_image_path) g.lookPath = look.generated_image_path;
    byKey.set(key, g);
  };
  for (const l of looks || []) for (const x of l.items || []) add(x, l.id, l);
  for (const p of photos || []) {
    if (!p?.id || !Array.isArray(p.items)) continue;
    for (const it of p.items) {
      const x = { category: it?.category, description: it?.description, photo_id: p.id, ...(Array.isArray(it?.box) ? { box: it.box } : {}) };
      if (!x.description || removedReading(x, removed)) continue;
      add(x, `photo:${p.id}`);
    }
  }
  const raw = [...byKey.values()];
  // Union-find over the readings.
  const parent = raw.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const together = (a, b) => a.seen.some((id) => b.seen.includes(id));
  // A reading only from a photo (no look yet) joins a garment from the same photo one to one, the most alike first:
  // a photo with a sweater and a cardigan (both Sweaters) must not fold both into the one garment a look used.
  const photoOnly = (g) => !g.looks.length;
  const pairs = [];
  for (let i = 0; i < raw.length; i += 1) {
    for (let j = i + 1; j < raw.length; j += 1) {
      const a = raw[i], b = raw[j];
      if (a.tile !== b.tile || together(a, b)) continue;
      const sim = garmentSimilarity(a.description, b.description);
      const samePhoto = a.photo_id && a.photo_id === b.photo_id;
      if (sim >= SAME || (samePhoto && !photoOnly(a) && !photoOnly(b))) parent[find(i)] = find(j);
      else if (samePhoto) pairs.push({ i, j, sim });
    }
  }
  const matched = new Set();
  for (const { i, j } of pairs.sort((x, y) => y.sim - x.sim)) {
    const r = photoOnly(raw[i]) ? i : j, o = r === i ? j : i;
    if (matched.has(r) || find(r) === find(o)) continue;
    if (raw.some((m, k) => find(k) === find(o) && together(m, raw[r]))) continue; // its garment is already in that photo's reading
    // A garment a look already uses takes one photo reading; a photo reading another.
    if (!photoOnly(raw[o]) && matched.has(`look:${find(o)}`)) continue;
    matched.add(r); if (!photoOnly(raw[o])) matched.add(`look:${find(o)}`); else matched.add(o);
    parent[find(r)] = find(o);
  }
  const groups = new Map();
  raw.forEach((g, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), g]); });
  return [...groups.values()].map((members) => {
    members.sort((a, b) => b.looks.length - a.looks.length);
    const top = members[0];
    // The photo shown: one where the garment's box is known, so the thumbnail can crop to it.
    const withPhoto = members.find((m) => m.photo_id && m.box) || members.find((m) => m.photo_id) || null;
    const keys = members.map((m) => m.key).sort();
    return { key: keys[0], keys, category: top.category, description: top.description, tile: top.tile, photo_id: withPhoto?.photo_id || null, box: withPhoto?.box || null,
      looks: [...new Set(members.flatMap((m) => m.looks))], lookPath: members.find((m) => m.lookPath)?.lookPath || null,
      readings: members.map((m) => ({ photo_id: m.photo_id, category: m.category, description: m.description })) };
  }).sort((a, b) => b.looks.length - a.looks.length);
}

/** { [tile key]: count } for the Profile tiles. */
export function wardrobeCounts(garments) {
  const out = Object.fromEntries(WARDROBE_CATEGORIES.map((c) => [c.key, 0]));
  for (const g of garments) out[g.tile] += 1;
  return out;
}

/** Where to look in the outfit photo for a garment of this kind (CSS object-position): its thumbnail is the photo
 *  itself, cropped to that part of the body. */
export function cropFor(category) {
  return { top: 'center 28%', outerwear: 'center 30%', dress: 'center 40%', bottom: 'center 72%', shoes: 'center 100%' }[category] || 'center';
}

/** "Last changed 3 months ago" (Settings). */
export function changedAgo(iso, now = new Date()) {
  if (!iso) return null;
  const days = Math.floor((now - new Date(iso)) / 864e5);
  if (!(days >= 0)) return null;
  if (days < 1) return 'Last changed today.';
  if (days < 30) return `Last changed ${days} day${days === 1 ? '' : 's'} ago.`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Last changed ${months} month${months === 1 ? '' : 's'} ago.`;
  const years = Math.floor(days / 365);
  return `Last changed ${years} year${years === 1 ? '' : 's'} ago.`;
}
