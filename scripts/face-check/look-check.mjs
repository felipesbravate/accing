// Layer 2 of the face check: what ArcFace cannot see (plus one pose rule: no hands in pockets). ArcFace crops the face to 112×112 and ignores hair,
// apparent age and expression, which is how friends recognise someone. A cheap vision model compares the
// generated photo with the real photos on exactly those points, and lists anything invented (tattoos, logos…).

const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
export const LOOK_MODEL = 'gemini-3.1-flash-lite';
const PRICE = { inputPerM: 0.25, outputPerM: 1.5 }; // gemini-3.1-flash-lite list price (USD)

const PROMPT = (refCount) => `Images 1 to ${refCount} are real photos of one person. The last image is an AI-generated photo that should show the same person.
Judge ONLY the person's identity cues, not the clothes, pose, background or lighting. Be strict: a friend should recognise them instantly.
- hair: same colour, same amount of grey, same length, style and hairline? Say how it differs, e.g. "much greyer", "darker", "longer on top".
- age: does the generated person look the same age, younger or older? Allow ±3 years as "same".
- expression: same natural expression? Note smiles, frowns or a stiff, tired or blank look that the real photos do not have.
- facial_hair: same beard or moustache shape, length, density and grey?
- glasses: same frame shape, thickness and colour, or none if they wear none?
- hands_in_pockets: true if either hand is in a pocket, even partly (fingers or knuckles hidden in it). Both hands must be fully visible.
- added: list anything on the person or their clothes that appears in NO real photo: tattoos, piercings, jewellery, watches, brand logos or wordmarks on clothes or shoes, printed text. Empty list if none.
For each check give ok (true when a friend would not notice a difference) and a short note.`;

const CHECK = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' }, note: { type: 'STRING' } }, required: ['ok', 'note'] };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    hair: CHECK, facial_hair: CHECK, glasses: CHECK, expression: CHECK,
    age: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' }, looks: { type: 'STRING', enum: ['younger', 'same', 'older'] }, note: { type: 'STRING' } }, required: ['ok', 'looks', 'note'] },
    added: { type: 'ARRAY', items: { type: 'STRING' } },
    hands_in_pockets: { type: 'BOOLEAN' },
  },
  required: ['hair', 'facial_hair', 'glasses', 'expression', 'age', 'added', 'hands_in_pockets'],
};

/** Which findings fail an image. Expression only warns: it is the cue friends forgive most and the model reads it least reliably. */
export function lookVerdict(r) {
  const fails = [], warns = [];
  for (const k of ['hair', 'facial_hair', 'glasses']) if (!r[k].ok) fails.push(`${k.replace('_', ' ')}: ${r[k].note}`);
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
    contents: [{ role: 'user', parts: [...[...refs, image].map((img) => (withDetail ? part(img) : { inlineData: part(img).inlineData })), { text: PROMPT(refs.length) }] }],
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
