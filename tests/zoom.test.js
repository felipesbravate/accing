import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampView, pinch, toggleZoom } from '../src/mirror/zoom.js';

test('pinching keeps the point under the fingers in place', () => {
  const start = { view: { s: 1, x: 0, y: 0 }, mid: { x: 50, y: -100 }, dist: 100 };
  const v = pinch(start, { x: 50, y: -100 }, 200);
  assert.equal(v.s, 2);
  // the image point that was at (50, -100) is still there: x + 50*2 = 50 → x = -50
  assert.deepEqual([v.x, v.y], [-50, 100]);
});

test('the view never scrolls past the image edges, and is centred at scale 1', () => {
  assert.deepEqual(clampView({ s: 1, x: 40, y: -30 }, 390, 844), { s: 1, x: 0, y: 0 });
  assert.deepEqual(clampView({ s: 2, x: 999, y: -999 }, 390, 844), { s: 2, x: 195, y: -422 });
  assert.equal(clampView({ s: 9, x: 0, y: 0 }, 390, 844).s, 4);
  assert.equal(clampView({ s: 0.5, x: 0, y: 0 }, 390, 844).s, 1);
});

test('double tap zooms in on the tapped point and back out', () => {
  const v = toggleZoom({ s: 1, x: 0, y: 0 }, { x: 20, y: 10 });
  assert.equal(v.s, 2.5);
  assert.deepEqual([v.x, v.y], [20 - 20 * 2.5, 10 - 10 * 2.5]);
  assert.deepEqual(toggleZoom(v, { x: 0, y: 0 }), { s: 1, x: 0, y: 0 });
});
