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
- sharp: the person is in focus and lit well enough to see the face and clothes
- sitting: the person sits, kneels or lies instead of standing`;
const BODY_SCHEMA = {
  type: 'OBJECT',
  properties: { one_person: { type: 'BOOLEAN' }, full_body: { type: 'BOOLEAN' }, face_visible: { type: 'BOOLEAN' }, sharp: { type: 'BOOLEAN' }, sitting: { type: 'BOOLEAN' } },
  required: ['one_person', 'full_body', 'face_visible', 'sharp', 'sitting'],
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
