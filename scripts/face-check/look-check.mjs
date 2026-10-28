// Layer 2 of the face check: what ArcFace cannot see (plus one pose rule: no hands in pockets). ArcFace crops the face to 112×112 and ignores hair,
// apparent age and expression, which is how friends recognise someone. A cheap vision model compares the
// generated photo with the real photos on exactly those points, and lists anything invented (tattoos, logos…).

const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
export const LOOK_MODEL = 'gemini-3.1-flash-lite';
const PRICE = { inputPerM: 0.25, outputPerM: 1.5 }; // gemini-3.1-flash-lite list price (USD)

// 2026-10-28: the check listed a logo and clothes that were only in a real photo, so images are labelled and "added" is scoped to the generated one.
const PROMPT = (refCount) => `Images 1 to ${refCount} are real photos of one person. The last image is an AI-generated photo that should show the same person.
Judge ONLY the person's identity cues, not the clothes, pose, background or lighting. Be strict: a friend should recognise them instantly.
- hair: same colour, same amount of grey, same length, style and hairline? Say how it differs, e.g. "much greyer", "darker", "longer on top".
- age: does the generated person look the same age, younger or older? Allow ±3 years as "same".
- expression: same natural expression? Note smiles, frowns or a stiff, tired or blank look that the real photos do not have.
- facial_hair: same beard or moustache shape, length, density and grey?
- glasses: same frame shape, thickness and colour, or none if they wear none?
- build: same body build as in the real full-body photos (weight, shoulder, waist and hip width, leg length and proportions)? Ignore clothes; say how it differs.
- hands_in_pockets: true if either hand is in a pocket, even partly (fingers or knuckles hidden in it). Both hands must be fully visible.
- added: list anything on the person in the GENERATED image that appears in NO real photo. Only list what you can see in the GENERATED image; never list something you see only in a real photo: tattoos, piercings, jewellery, watches, paint, stains, marks or bruises on the skin or hands, brand logos or wordmarks on clothes or shoes, printed text. Empty list if none.
For each check give ok (true when a friend would not notice a difference) and a short note.`;

const CHECK = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' }, note: { type: 'STRING' } }, required: ['ok', 'note'] };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    hair: CHECK, facial_hair: CHECK, glasses: CHECK, expression: CHECK, build: CHECK,
    age: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' }, looks: { type: 'STRING', enum: ['younger', 'same', 'older'] }, note: { type: 'STRING' } }, required: ['ok', 'looks', 'note'] },
    added: { type: 'ARRAY', items: { type: 'STRING' } },
    hands_in_pockets: { type: 'BOOLEAN' },
  },
  required: ['hair', 'facial_hair', 'glasses', 'expression', 'build', 'age', 'added', 'hands_in_pockets'],
};

/** Which findings fail an image. Expression only warns: it is the cue friends forgive most and the model reads it least reliably. */
export function lookVerdict(r) {
  const fails = [], warns = [];
  for (const k of ['hair', 'facial_hair', 'glasses', 'build']) if (r[k] && !r[k].ok) fails.push(`${k.replace('_', ' ')}: ${r[k].note}`);
  if (!r.age.ok || r.age.looks !== 'same') fails.push(`looks ${r.age.looks}: ${r.age.note}`);
  if (r.added.length) fails.push(`added: ${r.added.join(', ')}`);
  if (r.hands_in_pockets) fails.push('hand in a pocket');
  if (!r.expression.ok) warns.push(`expression: ${r.expression.note}`);
  return { pass: fails.length === 0, fails, warns };
}

/** refs and image: { bytes: Buffer, mime } */
export async function lookCheck(refs, image, { model = LOOK_MODEL, key = process.env.GEMINI_API_KEY } = {}) {
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local (needed for the look check)');
  const part = (img) => ({ inlineData: { mimeType: img.mime, data: img.bytes.toString('base64') }, mediaResolution: { level: 'MEDIA_RESOLUTION_HIGH' } });
  const body = (withDetail) => JSON.stringify({
    contents: [{ role: 'user', parts: [...[...refs, image].flatMap((img, k) => [{ text: k < refs.length ? `Real photo ${k + 1}:` : 'GENERATED image (the one to judge):' }, withDetail ? part(img) : { inlineData: part(img).inlineData }]), { text: PROMPT(refs.length) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0 },
  });
  const call = (withDetail) => fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: body(withDetail),
  });
  let res = await call(true), json = await res.json().catch(() => ({}));
  if (res.status === 400 && /media.?resolution/i.test(json.error?.message || '')) { res = await call(false); json = await res.json().catch(() => ({})); }
  if (!res.ok) throw new Error(`Look check failed (${model}, ${res.status}): ${json.error?.message || 'no details'}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`Could not understand the look check: ${text.slice(0, 200)}`); }
  const u = json.usageMetadata || {};
  const cost = ((u.promptTokenCount || 0) * PRICE.inputPerM + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * PRICE.outputPerM) / 1e6;
  return { ...result, ...lookVerdict(result), cost };
}

// Pose check for edited looks: image 2 must keep image 1's pose and framing exactly; only the clothes may differ.
// Seen 2026-10-27: asked to keep the pose, an edit turned the person to face the camera.
const POSE_PROMPT = `Image 1 and image 2 must show the same person in exactly the same pose and camera framing; only the clothes may differ.
Compare, ignoring the clothes: how far the body is turned from the camera, head angle, shoulder line, arm and hand positions, leg and foot positions (which foot is forward, how far apart), and the person's size and position in the frame.
Ignore the angle of the feet and the heel height: they change with the shoes.
same_pose is true only if someone flipping between the two images would notice nothing change except the clothes. Give a short note of any difference.`;
const POSE_SCHEMA = { type: 'OBJECT', properties: { same_pose: { type: 'BOOLEAN' }, note: { type: 'STRING' } }, required: ['same_pose', 'note'] };

/** anchor and image: { bytes, mime }. Returns { same, note, cost }. */
export async function poseCheck(anchor, image, { model = LOOK_MODEL, key = process.env.GEMINI_API_KEY } = {}) {
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local (needed for the pose check)');
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: 'Image 1:' }, { inlineData: { mimeType: anchor.mime, data: anchor.bytes.toString('base64') } },
        { text: 'Image 2:' }, { inlineData: { mimeType: image.mime, data: image.bytes.toString('base64') } },
        { text: POSE_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: POSE_SCHEMA, temperature: 0 },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Pose check failed (${model}, ${res.status}): ${json.error?.message || 'no details'}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  let r;
  try { r = JSON.parse(text); } catch { throw new Error(`Could not understand the pose check: ${text.slice(0, 200)}`); }
  const u = json.usageMetadata || {};
  return { same: r.same_pose === true, note: r.note || '', cost: ((u.promptTokenCount || 0) * PRICE.inputPerM + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * PRICE.outputPerM) / 1e6 };
}

// Outfit check: the look must show exactly its garments. Seen 2026-10-27: edited looks kept look 1's blazer.
const OUTFIT_SCHEMA = { type: 'OBJECT', properties: { missing: { type: 'ARRAY', items: { type: 'STRING' } }, different: { type: 'ARRAY', items: { type: 'STRING' } }, extra: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['missing', 'different', 'extra'] };

/** image: { bytes, mime }; items: [{ category, description, crop? }]; defaultShoes: text when the look names no shoes.
 *  Garments with a close-up (crop) are compared by eye, not only by name: on 2026-10-28 a plain V-neck tank came out with
 *  racerback straps and the name-only check passed it. */
export async function outfitCheck(image, items, defaultShoes, { model = LOOK_MODEL, key = process.env.GEMINI_API_KEY } = {}) {
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const refs = items.filter((x) => x.crop);
  // Garments with a close-up are named without colours: with "metallic silver" in the name the check kept rejecting
  // gold sandals that matched their close-up exactly (2026-10-28, twice, despite being told to trust the image).
  const COLOUR = /\b(metallic|silver|gold(en)?|black|white|off-white|cream|ivory|beige|tan|camel|brown|grey|gray|charcoal|navy|blue|light|dark|pale|red|pink|blush|green|olive|khaki|yellow|orange|purple|lilac|burgundy|nude)\b[- ]?/gi;
  const named = (x) => (x.crop ? x.description.replace(COLOUR, '').replace(/\s{2,}/g, ' ').trim() : x.description);
  const list = [...items.map((x) => `${named(x)} (${x.category})${x.crop ? ` — reference image ${refs.indexOf(x) + 2}` : ''}`), ...(defaultShoes ? [`${defaultShoes} (shoes)`] : [])];
  const prompt = `Image 1 is a photo of a person. ${refs.length ? `Images 2 to ${refs.length + 1} are close-ups of the real garments they should wear. ` : ''}The person should wear exactly these garments and nothing else:\n${list.map((x) => '- ' + x).join('\n')}
missing: any garment from the list that is not visible or is clearly a different garment (other colour, cut or type).
different: for each garment that has a reference image, any visible difference from it in the photo: neckline, straps or back construction, collar, sleeves, length, fit, closures (buttons, zips, drawstring), pockets, pattern, colour or fabric. Name the garment and the difference, e.g. "white tank top: racerback straps instead of plain straps". Ignore folds, lighting and the angle of view.
The written names come from a quick reading and can be wrong about colour or details (gold read as silver, cream as white). When a garment has a reference image, the reference image is the truth: compare the photo with the image, never with the words, and do not report a difference that only the words have. Each close-up shows its garment as it was worn, often with other garments, a bag, a strap or a hand around or over it (a jacket over a cardigan): judge only the named garment and ignore everything else in the close-up; never report a missing bag or an extra layer because a close-up shows one. Parts of a garment covered by another garment cannot be seen (a knee-high boot shaft under wide trousers, a tucked-in hem, a top under a jacket): never report a difference or a missing garment for what is covered, only for what is visible. Close-ups are often lit by coloured room light (one side pinker or yellower): that is the light, not a two-tone garment; judge the garment's own colour.
extra: any outerwear, top, bottom, dress or shoes the person wears that is not on the list (e.g. a jacket or blazer that should not be there). Ignore belts, jewellery, underwear and small details. Empty lists if it matches.`;
  const part = (img) => ({ inlineData: { mimeType: img.mime, data: img.bytes.toString('base64') } });
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Image 1 (the photo):' }, part(image), ...refs.flatMap((x, i) => [{ text: `Image ${i + 2} (${named(x)}):` }, part(x.crop)]), { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: OUTFIT_SCHEMA, temperature: 0 } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${json.error?.message || 'no details'}`);
  const r = JSON.parse(json.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}');
  const missing = Array.isArray(r.missing) ? r.missing : [], extra = Array.isArray(r.extra) ? r.extra : [];
  const different = Array.isArray(r.different) ? r.different : [];
  return { ok: !missing.length && !extra.length && !different.length, missing, extra, different, note: [...missing.map((x) => 'missing ' + x), ...extra.map((x) => 'extra ' + x), ...different.map((x) => 'different ' + x)].join(', ') };
}

// Photo check for the base photo (before and after preparing it). Seen 2026-10-28: a mirror selfie as base photo made
// every look hold a phone and look at it, because base mode keeps the pose. Users will upload selfies, so the base photo
// is read first: unusable photos are refused with a reason, fixable ones are cleaned once.
const PHOTO_PROMPT = `Describe this photo of a person, strictly and literally:
- one_person: exactly one person in the photo (a reflection of the same person counts once)
- full_body: the whole body from the top of the head to the soles of both feet is in the frame
- face_visible: the face is clearly visible and not covered (by a phone, hand, hair or sunglasses)
- sharp: the person is in focus and well enough lit to see the face and clothes
- sitting: the person sits, kneels or lies instead of standing
- holding: everything the person holds or carries in the hands or on the arm (phone, bag, cup, keys…); empty list if the hands are empty
- looking_at_camera: the head faces the camera and the eyes look into the lens (not at a phone screen or away)
- arms_relaxed: both arms hang loosely at the sides with the hands open and empty
- hands_in_pockets: either hand is in a pocket, even partly
- mirror_selfie: the photo is taken in a mirror, or a mirror frame, phone or room reflection is visible
- plain_background: the background is a plain wall or studio backdrop with no furniture or objects
- ghosts: any grey or white smudge, halo, blur or faint shape in the background right next to the person (often beside the hair or shoulders) that is not part of them
Give a short note on anything else that would make this a poor photo for a virtual fitting room.`;
const PHOTO_SCHEMA = {
  type: 'OBJECT',
  properties: {
    one_person: { type: 'BOOLEAN' }, full_body: { type: 'BOOLEAN' }, face_visible: { type: 'BOOLEAN' }, sharp: { type: 'BOOLEAN' }, sitting: { type: 'BOOLEAN' },
    holding: { type: 'ARRAY', items: { type: 'STRING' } }, looking_at_camera: { type: 'BOOLEAN' }, arms_relaxed: { type: 'BOOLEAN' },
    hands_in_pockets: { type: 'BOOLEAN' }, mirror_selfie: { type: 'BOOLEAN' }, plain_background: { type: 'BOOLEAN' }, ghosts: { type: 'BOOLEAN' }, note: { type: 'STRING' },
  },
  required: ['one_person', 'full_body', 'face_visible', 'sharp', 'sitting', 'holding', 'looking_at_camera', 'arms_relaxed', 'hands_in_pockets', 'mirror_selfie', 'plain_background', 'ghosts', 'note'],
};

/** What a base photo needs. blocking: cannot be fixed by an edit (ask for another photo); fixes: what the edit must change. */
export function photoVerdict(r) {
  const blocking = [], fixes = [];
  if (!r.one_person) blocking.push('more than one person in the photo');
  if (!r.full_body) blocking.push('the whole body, head to feet, is not in the photo');
  if (!r.face_visible) blocking.push('the face is covered or not visible');
  if (!r.sharp) blocking.push('the photo is blurry or too dark');
  if (r.sitting) blocking.push('the person is not standing');
  if (r.holding?.length) fixes.push(`holding ${r.holding.join(', ')}`);
  if (!r.looking_at_camera) fixes.push('not looking at the camera');
  if (!r.arms_relaxed) fixes.push('arms not hanging relaxed at the sides');
  if (r.hands_in_pockets) fixes.push('a hand in a pocket');
  if (r.mirror_selfie) fixes.push('mirror selfie');
  if (!r.plain_background) fixes.push('room or objects in the background');
  // The base photo is copied into every look: a smudge beside Juliana's hair in it came back in all 8 looks (2026-10-28).
  if (r.ghosts) fixes.push('a smudge or ghost shape in the background next to the person');
  return { usable: blocking.length === 0, blocking, fixes };
}

/** image: { bytes, mime }. Returns the reading plus { usable, blocking, fixes, cost }. */
export async function photoCheck(image, { model = LOOK_MODEL, key = process.env.GEMINI_API_KEY } = {}) {
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local (needed for the photo check)');
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: image.mime, data: image.bytes.toString('base64') } }, { text: PHOTO_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: PHOTO_SCHEMA, temperature: 0 } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Photo check failed (${model}, ${res.status}): ${json.error?.message || 'no details'}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  let r;
  try { r = JSON.parse(text); } catch { throw new Error(`Could not understand the photo check: ${text.slice(0, 200)}`); }
  const u = json.usageMetadata || {};
  return { ...r, ...photoVerdict(r), cost: ((u.promptTokenCount || 0) * PRICE.inputPerM + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * PRICE.outputPerM) / 1e6 };
}

/** Second opinion on the outfit check's findings, one yes/no per claim. On 2026-10-28 both looks dropped after 3 tries
 *  were right: the check kept claiming a plain t-shirt in a close-up that clearly shows the print (a bag strap crossed
 *  it) and a "two-tone" jacket that was room light. A claim stands only if a separate look, asked about that claim
 *  alone, confirms it. Returns the confirmed claims (all of them if this call fails). */
export async function confirmClaims(image, items, claims, { model = LOOK_MODEL, key = process.env.GEMINI_API_KEY } = {}) {
  if (!claims.length || !key) return claims;
  const refs = items.filter((x) => x.crop);
  const part = (img) => ({ inlineData: { mimeType: img.mime, data: img.bytes.toString('base64') } });
  const prompt = `Image 1 is a photo of a person. ${refs.length ? `Images 2 to ${refs.length + 1} are close-ups of the real garments they should wear, as photographed: they may also show other garments, a bag strap, a hand or coloured room light, which do not count. ` : ''}Another reviewer made these claims about image 1:
${claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}
For each claim, look again at image 1 and the matching close-up and answer true only if the claim is clearly correct: the difference is plainly visible in image 1 and is a real difference of the garment itself (not light, not a covered part, not something else in the close-up). When unsure, answer false.`;
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Image 1 (the photo):' }, part(image), ...refs.flatMap((x, i) => [{ text: `Image ${i + 2} (close-up of the ${x.category}):` }, part(x.crop)]), { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { verdicts: { type: 'ARRAY', items: { type: 'BOOLEAN' } } }, required: ['verdicts'] }, temperature: 0 } }),
  }).catch(() => null);
  if (!res?.ok) return claims;
  try {
    const v = JSON.parse((await res.json()).candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}').verdicts;
    return Array.isArray(v) && v.length === claims.length ? claims.filter((_, i) => v[i]) : claims;
  } catch { return claims; }
}
