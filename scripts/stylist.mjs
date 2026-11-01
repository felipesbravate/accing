// The stylist: before any look is made, Gemini judges whether the garments of each candidate combination go together
// (colours, styles, formality, proportions) for the occasion and weather. The rules in image-test-lib.mjs only know
// each garment on its own (formality, exposure, season); they happily put a football jersey with tailored trousers.
// Text only (garment descriptions), so it costs a fraction of a cent per batch. If the call fails, nothing is vetoed.
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

export const STYLIST_MIN = 3; // 1–5; looks scored below this are not made

/** looks: [{ items: [{ description, category }] }]. Returns [{ score, reason }] in the same order, or null. */
export async function judgeLooks(looks, { occasion, weather, model = 'gemini-3.1-flash-lite', key = process.env.GEMINI_API_KEY, warmthOffset = 0 } = {}) {
  if (!looks.length || !key) return null;
  const list = looks.map((l, i) => `${i + 1}. ${l.items.map((x) => `${x.description} (${x.category})`).join(' + ')}`).join('\n');
  // users.warmth_offset: this person has said looks felt too warm (positive) or too cold (negative).
  const feel = warmthOffset >= 1 ? ' This person runs warm: they often find outfits too warm, so lighter layers suit them better.'
    : warmthOffset <= -1 ? ' This person runs cold: they often find outfits too cold, so warmer layers suit them better.' : '';
  const prompt = `You are a personal stylist. Each numbered outfit below is a combination of garments from one person's own wardrobe, for ${occasion || 'an ordinary day'}${weather ? `, weather: ${weather}` : ''}.${feel}
Rate each combination from 1 to 5 for how well the garments go together: colour harmony, matching styles (no sportswear with tailoring unless it is a deliberate, current look), consistent formality, proportions, and the season.
5 = you would happily suggest it; 4 = good; 3 = fine, wearable; 2 = something clashes, you would not suggest it; 1 = clearly wrong together.
Judge only how the garments combine, not the garments themselves. Give a short reason for each.

${list}`;
  try {
    const res = await fetch(`${GEMINI_BASE}/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0, responseSchema: { type: 'OBJECT', properties: { verdicts: { type: 'ARRAY', items: {
          type: 'OBJECT', properties: { score: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['score', 'reason'] } } }, required: ['verdicts'] } } }),
    });
    if (!res.ok) return null;
    const v = JSON.parse((await res.json()).candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '{}').verdicts;
    return Array.isArray(v) && v.length === looks.length ? v.map((x) => ({ score: Number(x.score) || 3, reason: String(x.reason || '') })) : null;
  } catch { return null; }
}
