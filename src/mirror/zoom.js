// Pinch-zoom maths for the full-screen look (LookViewer.jsx). Pure, tested in tests/zoom.test.js.
// A view is { s, x, y }: scale and translation in px of the image's centre from the screen's centre
// (CSS: transform-origin centre, translate(x, y) scale(s)). Points are measured from the screen's centre too.
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Keeps the zoomed image covering the screen: no panning past its edges; at scale 1 it is centred. */
export function clampView(v, w, h) {
  const s = clamp(v.s, MIN_SCALE, MAX_SCALE);
  const mx = ((s - 1) * w) / 2, my = ((s - 1) * h) / 2;
  return { s, x: clamp(v.x, -mx, mx) + 0, y: clamp(v.y, -my, my) + 0 }; // + 0 turns -0 into 0
}

/** Two fingers: from `start` (view, midpoint, distance) to the current midpoint and distance. The point that was under
 *  the fingers stays under them. Scale may go a little past the limits while pinching (it springs back on release). */
export function pinch(start, mid, dist) {
  const s = clamp(start.view.s * (dist / Math.max(start.dist, 1)), MIN_SCALE * 0.8, MAX_SCALE * 1.2);
  const px = (start.mid.x - start.view.x) / start.view.s, py = (start.mid.y - start.view.y) / start.view.s;
  return { s, x: mid.x - px * s, y: mid.y - py * s };
}

/** Double tap: zoom in on the tapped point, or back out to the whole look. */
export function toggleZoom(v, at) {
  if (v.s > 1.05) return { s: 1, x: 0, y: 0 };
  const px = (at.x - v.x) / v.s, py = (at.y - v.y) / v.s;
  return { s: DOUBLE_TAP_SCALE, x: at.x - px * DOUBLE_TAP_SCALE, y: at.y - py * DOUBLE_TAP_SCALE };
}
