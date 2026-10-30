// Pure carousel maths (tested in tests/carousel.test.js).

/** Index wrapped into 0..length-1, so the carousel loops. */
export function wrap(index, length) {
  if (!length) return 0;
  return ((index % length) + length) % length;
}

/** The [previous, current, next] indices shown around `index`. */
export function around(index, length) {
  return [wrap(index - 1, length), wrap(index, length), wrap(index + 1, length)];
}

/** A horizontal drag of more than `threshold` px moves one outfit: left = next (+1), right = previous (-1). */
export function swipeStep(dx, threshold = 40) {
  if (dx <= -threshold) return 1;
  if (dx >= threshold) return -1;
  return 0;
}

// --- Ring carousel (the looks stand on a turntable that rotates) ---

/** Where look `i` sits relative to the front when the ring is at `position` (fractional while turning), taking the
 *  short way round: 0 = front, +1 = next to the right, -1 = to the left, up to ±length/2. */
export function ringOffset(i, position, length) {
  if (!length) return 0;
  let d = (i - position) % length;
  if (d > length / 2) d -= length;
  if (d < -length / 2) d += length;
  return d;
}

/** Pose of a look `offset` slots from the front. The looks stand evenly on a circle seen slightly from above:
 *  `depth` 1 = front, 0 = back. Sizes come from the layout: `radius` (px from the centre to the side of the circle),
 *  `backScale` (scale at the very back) and `lift` (px the back of the circle sits above the front).
 *  With fewer than `minSlots` looks they are spread as if there were `minSlots`, so 2–3 looks keep a natural spacing;
 *  the empty back of the ring is where a look fades out on one side and back in on the other (`opacity`).
 *  With more than `minSlots` looks the spacing stays the same (2026-10-30: 12 looks under a season filter stood a
 *  30° step apart, almost touching); only the front and one each side are on screen, the rest wait at the back. */
export function ringPose(offset, length, { radius, backScale, lift, minSlots = 5 }) {
  const slots = minSlots;
  const angle = (offset / slots) * 2 * Math.PI;
  const depth = (Math.cos(angle) + 1) / 2;
  return {
    x: Math.sin(angle) * radius,
    y: -(1 - depth) * lift,
    scale: backScale + (1 - backScale) * depth,
    depth,
    z: Math.round(depth * 100),
    opacity: length < slots ? Math.min(1, Math.max(0, (length / 2 - Math.abs(offset)) * 2)) : 1, // more looks: ringPresence hides the back
  };
}

/** Ease for one turn of the ring: slow start, slow landing. */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** How strongly a look shows at `offset` slots from the front: 1 at the front, `side` one slot away, `back` two or
 *  more slots away (the back of a 5-look ring), straight lines in between so it changes smoothly while turning. */
export function ringVisibility(offset, { side, back }) {
  const d = Math.abs(offset);
  if (d <= 1) return 1 + (side - 1) * d;
  if (d <= 2) return side + (back - side) * (d - 1);
  return back;
}

/** Whether a look `offset` slots from the front is on screen: fully within `visibleSlots` of the front (1 = the front
 *  look and one each side), fading out over the next slot, gone beyond. Keeps the screen to 3 looks however many
 *  the ring holds; the next one fades in from the back as it turns to a side. */
export function ringPresence(offset, visibleSlots = 1) {
  return Math.min(1, Math.max(0, visibleSlots + 1 - Math.abs(offset)));
}
