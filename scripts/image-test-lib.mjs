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

const COLOURS = new Set(['black', 'white', 'grey', 'gray', 'blue', 'navy', 'red', 'green', 'mint', 'olive', 'khaki', 'beige', 'brown', 'tan', 'camel', 'cream', 'ivory', 'yellow', 'orange', 'pink', 'purple', 'burgundy', 'charcoal', 'denim', 'light', 'dark']);
const FILLER = new Set(['a', 'an', 'the', 'with', 'and', 'of', 'in', 'style', 'plain', 'classic', 'basic', 'regular', 'fit', 'colour', 'color']);
const words = (d) => d.toLowerCase().replace(/t-shirt|tee\b/g, 'tshirt').replace(/gray/g, 'grey').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter((w) => w && !FILLER.has(w));

/** Same garment described in two photos? The reader words it differently each time ("plain grey short-sleeved cotton
 *  crew neck t-shirt" / "plain grey crew neck short-sleeved cotton t-shirt"), so compare meaning, not text: same
 *  category, same colours, and at least half of the words in common. Two items from one photo are never the same. */
export function sameGarment(a, b) {
  if (a.category !== b.category || a.photo === b.photo) return false;
  const wa = new Set(words(a.description)), wb = new Set(words(b.description));
  const ca = [...wa].filter((w) => COLOURS.has(w)).sort().join(), cb = [...wb].filter((w) => COLOURS.has(w)).sort().join();
  if (ca && cb && ca !== cb) return false;
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared / new Set([...wa, ...wb]).size >= 0.5;
}

/** Gives every wardrobe row a key shared by all rows that are the same garment. */
export function withKeys(wardrobe) {
  const groups = [];
  return wardrobe.map((x) => {
    let g = groups.find((members) => members.every((m) => m.photo !== x.photo) && members.some((m) => sameGarment(m, x)));
    if (!g) { g = []; g.id = `${x.category}#${groups.length}`; groups.push(g); }
    g.push(x);
    return { ...x, key: g.id };
  });
}
const RANK = { full: 2, partial: 1, hidden: 0 };

/**
 * The same garment seen in several photos counts once; it is taken from the photo where it is most visible.
 * Returns [{ ...item, key, seenIn: [photo indexes] }].
 */
export function dedupeWardrobe(wardrobe) {
  const byKey = new Map();
  for (const x of withKeys(wardrobe)) {
    const key = x.key;
    const prev = byKey.get(key);
    if (!prev) byKey.set(key, { ...x, key, seenIn: [x.photo] });
    else {
      prev.seenIn.push(x.photo);
      if (RANK[x.visibility] > RANK[prev.visibility]) Object.assign(prev, { photo: x.photo, visibility: x.visibility, description: x.description });
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
  for (const x of withKeys(wardrobe)) {
    if (!photoKeys.has(x.photo)) photoKeys.set(x.photo, new Set());
    photoKeys.get(x.photo).add(x.key);
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

/**
 * Several different looks from the same wardrobe: every distinct combination (top + bottom or dress, shoes,
 * with or without outerwear), new combinations first, each next look chosen to reuse as few already-used garments
 * as possible. Fewer looks come back when the wardrobe cannot make `count` different ones.
 */
export function composeLooks(wardrobe, { count = 1, seed = 1 } = {}) {
  const items = dedupeWardrobe(wardrobe).filter((x) => x.visibility !== 'hidden');
  const photoKeys = new Map();
  for (const x of withKeys(wardrobe)) {
    if (!photoKeys.has(x.photo)) photoKeys.set(x.photo, new Set());
    photoKeys.get(x.photo).add(x.key);
  }
  const isNew = (chosen) => ![...photoKeys.values()].some((keys) => chosen.every((x) => keys.has(x.key)));
  const of = (c) => items.filter((x) => x.category === c);
  const bases = [];
  for (const t of of('top')) for (const b of of('bottom')) bases.push([t, b]);
  for (const d of of('dress')) bases.push([d]);
  if (!bases.length) throw new Error('No outfit possible: the photos need at least a top and bottoms, or a dress, that are clearly visible.');
  const shoes = of('shoes'), outer = of('outerwear'), rand = seededRandom(seed);
  const candidates = [];
  for (const base of bases) for (const s of shoes.length ? shoes.map((x) => [x]) : [[]]) for (const o of [[], ...outer.map((x) => [x])]) {
    const chosen = [...o, ...base, ...s];
    candidates.push({ chosen, fresh: isNew(chosen), full: chosen.filter((x) => x.visibility === 'full').length, tie: rand() });
  }
  const looks = [], used = new Map();
  while (looks.length < count && candidates.length) {
    const reuse = (c) => c.chosen.reduce((n, x) => n + (used.get(x.key) || 0), 0);
    candidates.sort((a, b) => (b.fresh - a.fresh) || (reuse(a) - reuse(b)) || (b.full - a.full) || (a.tie - b.tie));
    const pick = candidates.shift();
    pick.chosen.forEach((x) => used.set(x.key, (used.get(x.key) || 0) + 1));
    const out = pick.chosen.map(({ key, seenIn, ...x }) => x);
    looks.push({ items: out, distinctPhotos: new Set(out.map((x) => x.photo)).size, newCombination: pick.fresh });
  }
  return looks;
}

/** Turns the reader model's JSON (one photo) into wardrobe rows. Unknown categories become 'other'. */
/** A garment box from the reader: [ymin, xmin, ymax, xmax] on a 0–1000 scale, at least 3% of the photo each way. */
export const validBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(v) && v >= 0 && v <= 1000) && b[2] - b[0] >= 30 && b[3] - b[1] >= 30;

export function normaliseReading(json, photo) {
  const items = Array.isArray(json?.items) ? json.items : [];
  return items
    .filter((x) => x && typeof x.description === 'string' && x.description.trim())
    .map((x) => ({
      photo,
      category: CATEGORIES.includes(x.category) ? x.category : 'other',
      description: x.description.trim().slice(0, 120),
      visibility: ['full', 'partial', 'hidden'].includes(x.visibility) ? x.visibility : 'partial',
      ...(validBox(x.box) ? { box: x.box.map(Math.round) } : {}),
    }));
}
