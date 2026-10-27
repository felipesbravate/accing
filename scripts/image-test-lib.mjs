// Pure helpers for scripts/image-test.mjs (tested in tests/image-test-lib.test.js).

export const CATEGORIES = ['outerwear', 'top', 'dress', 'bottom', 'shoes', 'accessory', 'other'];

/** Small seeded random generator, so an outfit choice can be repeated with --seed. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keyOf = (x) => `${x.category}|${x.description.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
const RANK = { full: 2, partial: 1, hidden: 0 };

/**
 * The same garment seen in several photos counts once; it is taken from the photo where it is most visible.
 * Returns [{ ...item, key, seenIn: [photo indexes] }].
 */
export function dedupeWardrobe(wardrobe) {
  const byKey = new Map();
  for (const x of wardrobe) {
    const key = keyOf(x);
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...x, key, seenIn: [x.photo] });
    else {
      prev.seenIn.push(x.photo);
      if (RANK[x.visibility] > RANK[prev.visibility]) Object.assign(prev, { photo: x.photo, visibility: x.visibility });
    }
  }
  return [...byKey.values()];
}

/**
 * Rule-based outfit: a top + bottoms (or a dress), shoes, and outerwear when there is one. It prefers combinations
 * that no single photo already shows (a new outfit), then complete outfits, then fully visible items.
 * wardrobe: [{ photo, category, description, visibility }], photo = index of the source photo.
 */
export function composeOutfit(wardrobe, { seed = 1 } = {}) {
  const items = dedupeWardrobe(wardrobe).filter((x) => x.visibility !== 'hidden');
  const photoKeys = new Map();
  for (const x of wardrobe) {
    if (!photoKeys.has(x.photo)) photoKeys.set(x.photo, new Set());
    photoKeys.get(x.photo).add(keyOf(x));
  }
  const isNew = (chosen) => ![...photoKeys.values()].some((keys) => chosen.every((x) => keys.has(x.key)));
  const of = (c) => items.filter((x) => x.category === c);
  const tops = of('top'), bottoms = of('bottom'), dresses = of('dress'), shoes = of('shoes'), outer = of('outerwear');
  const bases = [];
  for (const t of tops) for (const b of bottoms) bases.push([t, b]);
  for (const d of dresses) bases.push([d]);
  if (!bases.length) {
    throw new Error('No outfit possible: the photos need at least a top and bottoms, or a dress, that are clearly visible.');
  }
  const candidates = [];
  for (const base of bases) for (const s of shoes.length ? shoes.map((x) => [x]) : [[]]) for (const o of [[], ...outer.map((x) => [x])]) {
    const chosen = [...o, ...base, ...s];
    const fresh = isNew(chosen);
    const full = chosen.filter((x) => x.visibility === 'full').length;
    const score = (fresh ? 1000 : 0) + (s.length ? 20 : 0) + (o.length ? 10 : 0) + full;
    candidates.push({ chosen, fresh, score });
  }
  const best = Math.max(...candidates.map((c) => c.score));
  const tied = candidates.filter((c) => c.score === best);
  const pick = tied[Math.floor(seededRandom(seed)() * tied.length)];
  const out = pick.chosen.map(({ key, seenIn, ...x }) => x);
  return { items: out, distinctPhotos: new Set(out.map((x) => x.photo)).size, newCombination: pick.fresh };
}

/** Turns the reader model's JSON (one photo) into wardrobe rows. Unknown categories become 'other'. */
export function normaliseReading(json, photo) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items
    .filter((x) => x && typeof x.description === 'string' && x.description.trim())
    .map((x) => ({
      photo,
      category: CATEGORIES.includes(x.category) ? x.category : 'other',
      description: x.description.trim().slice(0, 120),
      visibility: ['full', 'partial', 'hidden'].includes(x.visibility) ? x.visibility : 'partial',
    }));
}
