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
export function composeLooks(wardrobe, { count = 1, seed = 1, occasion = '', weather = '', mustPhoto = null } = {}) {
  const all = dedupeWardrobe(wardrobe).filter((x) => x.visibility !== 'hidden');
  const occ = occasionProfile(occasion), wx = weatherProfile(weather);
  const skipped = [];
  const items = all.filter((x) => { const why = unfit(x, occ, wx); if (why) skipped.push({ description: x.description, why }); return !why; });
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
  if (!bases.length) {
    if (skipped.length) throw new Error(`No outfit fits "${occasion}" / "${weather}": ${skipped.map((x) => `${x.description} (${x.why})`).join('; ')}. Add photos of other outfits or change the occasion.`);
    throw new Error('No outfit possible: the photos need at least a top and bottoms, or a dress, that are clearly visible.');
  }
  const shoes = of('shoes'), outer = of('outerwear'), rand = seededRandom(seed);
  const candidates = [];
  for (const base of bases) for (const s of shoes.length ? shoes.map((x) => [x]) : [[]]) for (const o of [[], ...outer.map((x) => [x])]) {
    const chosen = [...o, ...base, ...s];
    // Items that clash in formality (a strapless evening dress with combat boots) rank last; cold days prefer a layer.
    const f = chosen.map((x) => x.formality).filter(Boolean), clash = f.length > 1 ? Math.max(0, Math.max(...f) - Math.min(...f) - 1) : 0;
    const fitScore = clash + Math.max(0, ...chosen.map((x) => offTarget(x, occ))) /* the look's furthest item: three casual items are not 3x worse than one */ + (wx.cold && !o.length ? 1 : 0) + (wx.hot && o.length ? 1 : 0);
    candidates.push({ chosen, fresh: isNew(chosen), fit: fitScore, full: chosen.filter((x) => x.visibility === 'full').length, tie: rand() });
  }
  // mustPhoto (index of an outfit photo): every look wears something from it, if any look can (the app's "see my new
  // outfit now"). If its garments don't fit the occasion or weather, the looks are made as usual and say so.
  let mustMissed = false;
  if (Number.isInteger(mustPhoto)) {
    const withIt = candidates.filter((c) => c.chosen.some((x) => x.photo === mustPhoto));
    if (withIt.length) candidates.splice(0, candidates.length, ...withIt); else mustMissed = true;
  }
  const looks = [], used = new Map();
  while (looks.length < count && candidates.length) {
    // Repeating a main garment (top, bottom, dress, outerwear) counts 3 times as much as repeating shoes: on 2026-10-28
    // four of six office looks were the same shirt dress with different shoes.
    const reuse = (c) => c.chosen.reduce((n, x) => n + (used.get(x.key) || 0) * (x.category === 'shoes' ? 1 : 3), 0);
    // Fit to the occasion and variety weigh the same: a better-fitting look does not repeat the same garments 4 times.
    candidates.sort((a, b) => (a.fit + reuse(a) - b.fit - reuse(b)) || (b.fresh - a.fresh) || (b.full - a.full) || (a.tie - b.tie));
    const pick = candidates.shift();
    pick.chosen.forEach((x) => used.set(x.key, (used.get(x.key) || 0) + 1));
    const out = pick.chosen.map(({ key, seenIn, ...x }) => x);
    looks.push({ items: out, distinctPhotos: new Set(out.map((x) => x.photo)).size, newCombination: pick.fresh, fit: pick.fit });
  }
  looks.skipped = skipped;
  looks.mustMissed = mustMissed;
  looks.occasion = occ;
  return looks;
}

/**
 * What an occasion allows, from its words (rule-based, Phase 1). formality: 1 lounge/beach, 2 casual, 3 smart casual,
 * 4 business, 5 formal/evening. maxExposure: the most skin a garment may show (low, medium, high).
 * 2026-10-28: "an office day" got a strapless sweetheart dress with combat boots and a shirt dress open to the thigh,
 * because the occasion only reached the image prompt, never the choice of garments.
 */
const OCCASIONS = [
  { name: 'work', words: /office|work|meeting|interview|business|conference|client|presentation|job/i, min: 3, max: 5, maxExposure: 'medium' }, // sleeveless and knee-length are fine at work (Felipe, 2026-10-28)
  { name: 'formal', words: /wedding|gala|black.?tie|ceremony|funeral|opera|theatre|theater/i, min: 4, max: 5, maxExposure: 'medium' },
  { name: 'evening', words: /dinner|date|party|night ?out|drinks|cocktail|bar|club|evening|restaurant/i, min: 3, max: 5, maxExposure: 'high' },
  { name: 'sport', words: /gym|run|sport|workout|training|yoga|hike|hiking|padel|tennis/i, min: 1, max: 2, maxExposure: 'high' },
  { name: 'beach', words: /beach|pool|swim/i, min: 1, max: 2, maxExposure: 'high' },
  { name: 'casual', words: /casual|weekend|errand|shopping|park|home|coffee|brunch|walk|school|university|class|travel|airport|museum|friends/i, min: 1, max: 4, maxExposure: 'high' },
];
const EXPOSURE = { low: 0, medium: 1, high: 2 };
const GARMENTS = ['outerwear', 'top', 'bottom', 'dress', 'shoes'];
export function occasionProfile(text = '') {
  return OCCASIONS.find((o) => o.words.test(text)) || { name: 'any', min: 1, max: 5, maxExposure: 'high' };
}
/** Temperature (°C or °F) and rain/snow from free text such as "mild 20°C" or "rainy, 55F". */
/** A new garment is shown in weather it suits (the app's "see my new outfit"): if today's weather rules out every
 *  garment given (a wool coat on a 27°C day, sandals at 6°C), the looks are made for the weather they are for instead.
 *  Returns { weather, changed }. */
export function weatherForGarments(items, weather) {
  const wx = weatherProfile(weather);
  const kept = (items || []).filter((x) => GARMENTS.includes(x.category));
  if (!kept.length) return { weather, changed: false };
  const ruledOut = (x) => (x.season === 'warm' && wx.cold) || (x.season === 'cold' && wx.hot);
  if (!kept.every(ruledOut)) return { weather, changed: false };
  return { weather: kept.some((x) => x.season === 'cold') ? '8°C high, 3°C low' : '27°C high, 19°C low', changed: true };
}

export function weatherProfile(text = '') {
  const m = String(text).match(/(-?\d+(?:[.,]\d+)?)\s*°?\s*([cf])\b/i);
  let c = m ? parseFloat(m[1].replace(',', '.')) : null;
  if (c != null && m[2].toLowerCase() === 'f') c = (c - 32) * 5 / 9;
  if (c == null) c = /freez|snow|cold|chilly|winter/i.test(text) ? 5 : /hot|heat|summer|scorch/i.test(text) ? 30 : null;
  return { celsius: c, cold: c != null && c <= 13, hot: c != null && c >= 25, wet: /rain|shower|storm|snow|wet|drizzle/i.test(text) };
}
/** Why an item cannot be worn for this occasion and weather, or null. Items without tags pass (old readings). */
export function unfit(x, occ, wx) {
  if (!GARMENTS.includes(x.category)) return null; // accessories are not part of looks
  // 2026-10-28: the reader left exposure out for a shirt dress open to the thigh, and it passed "an office day".
  // A garment with no exposure counts as medium: it passes casual and evening rules, not work.
  // Shoes are judged by formality and weather only: the reader called every pair of sandals "exposure high", so all six
  // office looks of 2026-10-28 got the same combat boots.
  const exposure = x.category === 'shoes' ? 'low' : x.exposure || 'medium';
  if (EXPOSURE[exposure] > EXPOSURE[occ.maxExposure]) return `${x.exposure ? 'too revealing' : 'exposure not read; left out'} for ${occ.name}`;
  if (x.formality && (x.formality < occ.min - 1 || x.formality > occ.max + 1)) return `${x.formality < occ.min ? 'too casual' : 'too dressy'} for ${occ.name}`;
  if (x.season === 'warm' && (wx.cold || (wx.wet && x.category === 'shoes'))) return `warm-weather only (${wx.cold ? `${Math.round(wx.celsius)}°C` : 'rain'})`;
  if (x.season === 'cold' && wx.hot) return `cold-weather only (${Math.round(wx.celsius)}°C)`;
  return null;
}
/** How far an allowed item is from the occasion's formality range (0 inside it). */
const offTarget = (x, occ) => (!x.formality ? 0 : x.formality < occ.min ? occ.min - x.formality : x.formality > occ.max ? x.formality - occ.max : 0);

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
      ...(Number.isInteger(x.formality) && x.formality >= 1 && x.formality <= 5 ? { formality: x.formality } : {}),
      ...(['low', 'medium', 'high'].includes(x.exposure) ? { exposure: x.exposure } : {}),
      ...(['warm', 'any', 'cold'].includes(x.season) ? { season: x.season } : {}),
    }));
}

/** Layered garments worn together in one photo (a t-shirt over a lace long-sleeve, a shirt under a sweater) become one
 *  item. Read as two, looks asked for one without the other and each garment's close-up showed the other, so the
 *  outfit check rejected every try (3 runs in a row, 2026-10-28). Two items of the same category from the same photo
 *  whose boxes mostly overlap (the overlap covers at least half of the smaller box) are merged; the larger box is
 *  taken as the outer layer. Outerwear over a top stays separate: a jacket can come off. Needs boxes. */
export function mergeLayers(items) {
  const area = (b) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const overlap = (a, b) => area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]) / Math.min(area(a), area(b) || 1);
  const out = [...items];
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (!a.box || !b.box || a.photo !== b.photo) continue;
      const sameLayer = a.category === b.category && ['top', 'bottom'].includes(a.category);
      const withDress = [a, b].some((x) => x.category === 'dress') && [a, b].some((x) => ['top', 'bottom'].includes(x.category));
      if (!sameLayer && !withDress) continue;
      if (overlap(a.box, b.box) < 0.5) continue;
      // With a dress, the dress is the garment and the other is worn with it (a mini skirt under an open shirt dress,
      // a tee under a slip dress); otherwise the larger box is the outer layer.
      const [outer, inner] = withDress ? (a.category === 'dress' ? [a, b] : [b, a]) : area(a.box) >= area(b.box) ? [a, b] : [b, a];
      const exposure = ['low', 'medium', 'high'].find((e) => [a.exposure, b.exposure].includes(e));
      out[i] = { ...outer, ...(exposure ? { exposure } : {}), description: `${outer.description}, worn ${withDress ? (inner.category === 'top' ? 'with' : 'over') : 'layered over'} ${inner.description.replace(/,?\s*(worn )?(under|beneath|inside|underneath)\b.*$/i, '')}`.slice(0, 200), layered: [outer.description, inner.description],
        box: [Math.min(a.box[0], b.box[0]), Math.min(a.box[1], b.box[1]), Math.max(a.box[2], b.box[2]), Math.max(a.box[3], b.box[3])],
        visibility: a.visibility === 'full' || b.visibility === 'full' ? 'full' : a.visibility };
      out.splice(j, 1); j = i;
    }
  }
  return out;
}

/**
 * Which garment to ask a new photo of, when a look failed on every try: the one garment every try's problems name.
 * Thais, 2026-10-28: her beige jacket was photographed in pink room light, so every look with it was rejected as
 * "pink" or "two-tone" while GPT painted it beige, its real colour. No prompt fixes that; a daylight photo does.
 * items: the look's garments; reasonsPerTry: one string per failed try. Returns { item, hint } or null.
 */
export function blameGarment(items, reasonsPerTry) {
  if (!reasonsPerTry.length) return null;
  const strip = /\b(metallic|silver|gold(en)?|black|white|off-white|cream|ivory|beige|tan|camel|brown|grey|gray|charcoal|navy|blue|light|dark|pale|red|pink|blush|green|olive|khaki|yellow|orange|purple|lilac|burgundy|nude|with|and|the|worn|over|under|layered)\b/gi;
  const words = (d) => d.toLowerCase().replace(/t-shirt/g, 'tshirt').replace(strip, ' ').replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3);
  const names = (r, item) => { const w = words(item.description.split(',')[0]); const t = r.toLowerCase().replace(/t-shirt/g, 'tshirt'); return w.length && w.filter((x) => t.includes(x)).length / w.length >= 0.6; };
  const blamed = items.filter((x) => reasonsPerTry.every((r) => names(r, x)));
  if (blamed.length !== 1) return null;
  const all = reasonsPerTry.join(' ').toLowerCase();
  const light = /colou?r|pink|tone|tint|shade|lighter|darker|light /.test(all);
  return { item: blamed[0], hint: light ? 'in daylight, with nothing over it' : 'flat or worn, fully visible, with nothing over it' };
}
