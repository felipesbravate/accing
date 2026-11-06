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
/** A garment's key: its photo and kind and wording ("<photo_id>|top|black graphic t-shirt"), or without a photo id
 *  (looks from before 2026-10-31) its kind and wording. */
export function garmentKey(x) {
  return `${x?.photo_id || '-'}|${x?.category || ''}|${norm(x?.description)}`;
}

/** Looks ({ id, items, created_at }) → garments: [{ key, category, description, photo_id, tile, looks: [outfit ids] }],
 *  newest first, removed ones ([{ photo_id, category, description }]) left out. */
export function wardrobeFrom(looks, removed = []) {
  const gone = new Set((removed || []).map(garmentKey));
  const byKey = new Map();
  for (const l of looks || []) {
    for (const x of l.items || []) {
      const tile = wardrobeCategory(x);
      if (!tile) continue;
      const key = garmentKey(x);
      if (gone.has(key)) continue;
      const g = byKey.get(key) || { key, category: x.category, description: x.description, photo_id: x.photo_id || null, tile, looks: [] };
      g.looks.push(l.id);
      byKey.set(key, g);
    }
  }
  return [...byKey.values()];
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
