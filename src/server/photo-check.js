// Server-only: a quick look at an onboarding photo with Gemini 3.1 Flash-Lite (the pipeline's checker), so the person
// can retake a bad photo right away instead of finding out after the base photo fails. Never import from client code.
// Without GEMINI_API_KEY (or if the call fails) the photo is accepted: the check helps, it must never block onboarding.
import { bodyAdvice, faceAdvice } from '../lib/photo-advice.js';

const MODEL = 'gemini-3.1-flash-lite';
const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

const FACE_PROMPT = `This is a face photo someone took of themselves for a virtual fitting room. Describe it strictly and literally:
- one_face: exactly one face is in the photo
- face_visible: the whole face is visible, not covered by hair, hands, a phone, a mask or sunglasses (clear glasses are fine)
- sharp: the face is in focus
- well_lit: the face is lit well enough to see the skin and features (not in shadow, not very dark)
- face_small: the face takes up less than about a fifth of the photo's height
- turn: "straight" if the face points at the camera, "turned" if the head is turned to one side by about 20 degrees or more
- chin: "up" if the head tilts back so the chin points up, "down" if it tilts forward, else "level"`;
const FACE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    one_face: { type: 'BOOLEAN' }, face_visible: { type: 'BOOLEAN' }, sharp: { type: 'BOOLEAN' }, well_lit: { type: 'BOOLEAN' },
    face_small: { type: 'BOOLEAN' }, turn: { type: 'STRING', enum: ['straight', 'turned'] }, chin: { type: 'STRING', enum: ['level', 'up', 'down'] },
  },
  required: ['one_face', 'face_visible', 'sharp', 'well_lit', 'face_small', 'turn', 'chin'],
};

const BODY_PROMPT = `This is a full-body photo someone took of themselves in their clothes for a virtual fitting room. Describe it strictly and literally:
- one_person: exactly one person (a reflection of the same person in a mirror counts once)
- full_body: the whole body from the top of the head to the soles of both feet is in the frame
- face_visible: the face is visible, not covered by a phone, hand or hair
- sharp: the person is in focus (not blurred by movement or focus)
- well_lit: the photo is bright enough to see the face and the colours and details of the clothes (not dim, not in shadow)
- sitting: the person sits, kneels or lies instead of standing`;
const BODY_SCHEMA = {
  type: 'OBJECT',
  properties: { one_person: { type: 'BOOLEAN' }, full_body: { type: 'BOOLEAN' }, face_visible: { type: 'BOOLEAN' }, sharp: { type: 'BOOLEAN' }, well_lit: { type: 'BOOLEAN' }, sitting: { type: 'BOOLEAN' } },
  required: ['one_person', 'full_body', 'face_visible', 'sharp', 'well_lit', 'sitting'],
};

async function ask(bytes, prompt, schema) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const res = await fetch(`${BASE}/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: Buffer.from(bytes).toString('base64') } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 } }),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
  try { return JSON.parse(text); } catch { return null; }
}

/** kind: 'front' | 'left' | 'right' | 'body' | 'outfit'. Returns null (fine) or { title, hint }. */
export async function checkPhoto(kind, bytes) {
  try {
    if (['front', 'left', 'right'].includes(kind)) return faceAdvice(kind, await ask(bytes, FACE_PROMPT, FACE_SCHEMA));
    return bodyAdvice(await ask(bytes, BODY_PROMPT, BODY_SCHEMA));
  } catch {
    return null;
  }
}

// An outfit photo (from the mirror) is used for its clothes only. It may show the person wearing them, or the clothes
// alone: shoes on the floor, a jacket on a hanger, a flat lay (Felipe, 2026-11-09: a photo of just shoes was refused
// as "more than one person", because the old check only asked "exactly one person?").
const OUTFIT_PROMPT = `This photo was added to someone's wardrobe in a styling app. Describe it strictly and literally:
- people: how many different people are in the photo (0 if none; a person and their own reflection in a mirror count as 1; people in posters, screens or photos on the wall don't count)
- clothes: the photo shows at least one garment, pair of shoes or fashion accessory clearly enough to describe it (worn or not)`;
const OUTFIT_SCHEMA = { type: 'OBJECT', properties: { people: { type: 'INTEGER' }, clothes: { type: 'BOOLEAN' } }, required: ['people', 'clothes'] };

/** Why an outfit photo is left out, or null to use it: 'more_than_one_person' (the reader could put someone else's
 *  clothes in the wardrobe) or 'no_clothes' (nothing to read). A covered face, a cut-off foot, no person at all: fine.
 *  If the check fails the photo is used. Tested in tests/photo-check.test.js. */
export function outfitVerdict(r) {
  if (!r) return null;
  if (Number(r.people) >= 2) return 'more_than_one_person';
  if (r.clothes === false) return 'no_clothes';
  return null;
}
export async function outfitProblem(bytes) {
  try {
    return outfitVerdict(await ask(bytes, OUTFIT_PROMPT, OUTFIT_SCHEMA));
  } catch {
    return null;
  }
}
