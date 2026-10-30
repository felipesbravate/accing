import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

// A fake Gemini: records each call and answers by prompt kind.
test('outfit check: one call for the outfit, one per close-up with only that close-up', async () => {
  const calls = [];
  const server = createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
      const parts = JSON.parse(body).contents[0].parts;
      const images = parts.filter((p) => p.inlineData).length, text = parts.map((p) => p.text || '').join(' ');
      calls.push({ images, text });
      const answer = text.includes('Compare only this') ? (text.includes('henley') ? { different: ['shows a yellow shirt'] } : { different: [] }) : { missing: [], extra: [] };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
    });
  }).listen(0);
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${server.address().port}`;
  const { outfitCheck } = await import(`../scripts/face-check/look-check.mjs?t=${Date.now()}`);
  const img = { bytes: Buffer.from('x'), mime: 'image/png' };
  const blazer = { category: 'outerwear', description: 'navy blazer', crop: img };
  const henley = { category: 'top', description: 'cream henley', crop: img };
  const jeans = { category: 'bottom', description: 'black jeans' };
  const r = await outfitCheck(img, [blazer, henley, jeans], null, { key: 'k' });
  server.close();
  assert.equal(calls.length, 3);
  assert.equal(calls.filter((c) => c.text.includes('Compare only this')).every((c) => c.images === 2), true);
  assert.equal(calls.find((c) => !c.text.includes('Compare only this')).images, 1);
  assert.equal(r.ok, false);
  assert.equal(r.differentBy.length, 1);
  assert.equal(r.differentBy[0].item, henley);
});
