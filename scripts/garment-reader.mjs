// The garment reader (step 1 of the image pipeline): each outfit photo read once with a cheap vision model (Gemini
// Flash-Lite) into its garments, each with a category, a description, tags and a box around it. Shared by
// scripts/image-test.mjs and worker/backfill-boxes.mjs, so both read a photo exactly the same way.
import { CATEGORIES, mergeLayers, normaliseReading } from './image-test-lib.mjs';

const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

export const READER_PROMPT = `This photo should show one person, head to toe. List every piece of clothing and footwear they are wearing.
For each item give:
- category: one of ${CATEGORIES.join(', ')} (outerwear = jacket, blazer, coat; top = shirt, t-shirt, sweater, blouse; bottom = trousers, jeans, skirt, shorts)
- description: 4 to 10 words with colour, pattern, material and cut, e.g. "brown houndstooth tweed single-breasted blazer"
- visibility: "full" if the whole item is visible, "partial" if partly hidden or cropped, "hidden" if you can barely see it
- box: a tight box around the item as [ymin, xmin, ymax, xmax] on a 0–1000 scale of the photo (for shoes, one box around both)
- formality: 1 lounge/beach/sport, 2 casual (t-shirt, jeans, sneakers), 3 smart casual (blouse, chinos, loafers), 4 business (tailoring, shirt dress with sleeves, pumps), 5 formal/evening (gown, strapless or sequinned dress, stilettos)
- exposure: how much skin the item shows as worn: "low" (covered), "medium" (sleeveless, knee-length, a short slit), "high" (strapless, plunging neckline, cut-outs, sheer, mini length, open to the thigh, crop top)
- season: "warm" if only for warm weather (sandals, linen, sleeveless, shorts), "cold" if only for cold weather (wool coat, heavy knit, lined boots), else "any"
List items worn under or inside others too, e.g. a skirt or shorts under an open shirt dress, a t-shirt under a sheer top: each as its own item with its own box.
Colours: name the garment's own colour (metallic gold vs silver, cream vs white), as it would look in daylight: ignore coloured room light, e.g. a beige jacket lit pink on one side and yellow on the other is beige. When unsure, use the broader word ("metallic").
Also say whether the person is visible head to toe (full_body), how many people are in the photo (people), and which mannequin build best matches their body, female or male (figure; used only to pick a pose reference).`;

export const READER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    full_body: { type: 'BOOLEAN' },
    people: { type: 'INTEGER' },
    figure: { type: 'STRING', enum: ['female', 'male'] },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      category: { type: 'STRING', enum: CATEGORIES },
      description: { type: 'STRING' },
      visibility: { type: 'STRING', enum: ['full', 'partial', 'hidden'] },
      box: { type: 'ARRAY', items: { type: 'INTEGER' } },
      formality: { type: 'INTEGER' },
      exposure: { type: 'STRING', enum: ['low', 'medium', 'high'] },
      season: { type: 'STRING', enum: ['warm', 'any', 'cold'] },
    }, required: ['category', 'description', 'visibility', 'formality', 'exposure', 'season'] } },
  },
  required: ['full_body', 'people', 'items'],
};

/** img: { mime, bytes, file }; index: its photo number. → { fullBody, people, figure, items, cost }. */
export async function readPhoto(img, index, model) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env.local (needed to read the garments)');
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType: img.mime, data: img.bytes.toString('base64') } }, { text: READER_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: READER_SCHEMA, temperature: 0 },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Reading ${img.file} failed (${model}, ${res.status}): ${json.error?.message || 'no details'}. Try --reader-model=gemini-3.5-flash-lite`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '{}';
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Could not understand the reading of ${img.file}: ${text.slice(0, 200)}`); }
  const u = json.usageMetadata || {};
  const cost = ((u.promptTokenCount || 0) * 0.25 + (u.candidatesTokenCount || 0) * 1.5) / 1e6; // gemini-3.1-flash-lite list price
  return { fullBody: parsed.full_body !== false, people: parsed.people ?? 1, figure: parsed.figure, items: mergeLayers(normaliseReading(parsed, index)), cost };
}

