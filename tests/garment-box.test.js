import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchBoxes, thumbPlacement, validBox } from '../src/lib/garment-box.js';
import { viewForBox } from '../src/mirror/zoom.js';

test('boxes from a fresh reading go to the saved garments of the same photo', () => {
  const saved = [{ category: 'top', description: 'black graphic t-shirt' }, { category: 'shoes', description: 'white leather sneakers' },
    { category: 'bottom', description: 'blue wide-leg jeans' }];
  const read = [{ category: 'top', description: 'black t-shirt with red graphic print', box: [150, 300, 450, 700] },
    { category: 'shoes', description: 'white low-top sneakers', box: [900, 350, 990, 650] },
    { category: 'bottom', description: 'beige pleated skirt', box: [450, 300, 800, 700] }, { category: 'bottom', description: 'light blue wide-leg jeans', box: [440, 300, 900, 700] }];
  assert.deepEqual(matchBoxes(saved, read), [[150, 300, 450, 700], [900, 350, 990, 650], [440, 300, 900, 700]]);
  assert.deepEqual(matchBoxes([{ category: 'dress', description: 'red dress' }], read), [null]); // nothing like it
  assert.equal(validBox([10, 10, 20, 900]), false); // a sliver
  assert.equal(validBox([100, 100, 500, 400]), true);
});

test('the thumbnail fills with the garment, centred, never smaller than the card', () => {
  // A 1000×1500 photo, shoes at the bottom: zoomed in and moved up so they sit in the card.
  const p = thumbPlacement({ W: 1000, H: 1500, cw: 147, ch: 140, box: [900, 350, 990, 650] });
  assert.ok(p.width > 147 && p.height > 140);
  assert.ok(p.top < 0 && p.top >= 140 - p.height);
  const mid = (-p.top + 70) / p.height; // the card's middle on the photo
  assert.ok(mid > 0.85 && mid <= 1);
  // A box as big as the photo: no smaller than covering the card.
  const all = thumbPlacement({ W: 1000, H: 1500, cw: 147, ch: 140, box: [0, 0, 1000, 1000] });
  assert.ok(all.width >= 147 && all.height >= 140);
});

test('the viewer opens with the garment filling the screen', () => {
  const v = viewForBox({ w: 390, h: 716, dw: 390, dh: 585, box: [880, 300, 990, 700] });
  assert.ok(v.s > 1.8 && v.s <= 4); // 40% of the width, with its margin, fills the screen at ~1.9×
  assert.ok(v.y < 0); // moved up: the shoes are low in the photo
  assert.equal(viewForBox({ w: 390, h: 716, dw: 390, dh: 585, box: [0, 0, 1000, 1000] }).s, 1);
});
