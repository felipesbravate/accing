// The Wardrobe (Figma "Mobile - Profile" 268:11591, "Mobile - Wardrobe" 306:4775): every garment the reader found in
// the person's outfit photos, sorted into the 12 categories of the Profile tiles. Pure; tested in tests/wardrobe.test.js.
// A garment is known only through the looks made with it (outfits.items: category, description, photo_id), so the
// wardrobe is the garments of their looks, one per garment (same photo, same kind, same wording).

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
      if (/cardigan/.test(d)) return 'sweaters';
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

/** Looks ({ id, items, created_at, image_path }) → garments, one per real garment: [{ key, keys, category,
 *  description, photo_id, tile, looks: [outfit ids], lookPath }], most-used first. Readings are the same garment when
 *  they are in the same tile and either come from the same photo (and never appear together in one look) or are
 *  worded alike (60% of their words, same colours). Removed readings ([{ photo_id, category, description }]) are left
 *  out. `lookPath`: a look made with it, for a picture when no photo is known. */
export function wardrobeFrom(looks, removed = []) {
  const gone = new Set((removed || []).map(garmentKey));
  const byKey = new Map();
  for (const l of looks || []) {
    for (const x of l.items || []) {
      const tile = wardrobeCategory(x);
      if (!tile) continue;
      const key = garmentKey(x);
      if (gone.has(key)) continue;
      const g = byKey.get(key) || { key, category: x.category, description: x.description, photo_id: x.photo_id || null, tile, looks: [], lookPath: null };
      g.looks.push(l.id);
      if (!g.lookPath && l.generated_image_path) g.lookPath = l.generated_image_path;
      byKey.set(key, g);
    }
  }
  const raw = [...byKey.values()];
  // Union-find over the readings.
  const parent = raw.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const together = (a, b) => a.looks.some((id) => b.looks.includes(id));
  for (let i = 0; i < raw.length; i += 1) {
    for (let j = i + 1; j < raw.length; j += 1) {
      const a = raw[i], b = raw[j];
      if (a.tile !== b.tile || together(a, b)) continue;
      const samePhoto = a.photo_id && a.photo_id === b.photo_id;
      if (samePhoto || garmentSimilarity(a.description, b.description) >= SAME) parent[find(i)] = find(j);
    }
  }
  const groups = new Map();
  raw.forEach((g, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), g]); });
  return [...groups.values()].map((members) => {
    members.sort((a, b) => b.looks.length - a.looks.length);
    const top = members[0];
    const withPhoto = members.find((m) => m.photo_id) || null;
    const keys = members.map((m) => m.key).sort();
    return { key: keys[0], keys, category: top.category, description: top.description, tile: top.tile, photo_id: withPhoto?.photo_id || null,
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
