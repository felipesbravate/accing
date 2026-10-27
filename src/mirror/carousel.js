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
