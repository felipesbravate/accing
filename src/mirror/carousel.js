// Pure carousel maths (tested in tests/carousel.test.js).
export function clampIndex(index, length) {
  if (!length) return 0;
  return Math.min(Math.max(0, Math.round(index)), length - 1);
}

/** Which card is centred, from the strip's scroll position. */
export function indexFromScroll(scrollLeft, cardWidth, gap, length) {
  if (!cardWidth) return 0;
  return clampIndex(scrollLeft / (cardWidth + gap), length);
}
