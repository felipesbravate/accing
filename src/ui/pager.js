// The pager's dots (Thread "pager" 64:800). Up to 5 pages every dot shows; with more, the row grows to "Max": as many
// dots as fit in 408px (29) or the space there is, and a window of them follows the current page. The dot at an edge
// fades when there are pages beyond it. Pure; tested in tests/pager.test.js.
export const DOT = 6, ACTIVE = 16, GAP = 8, MAX_WIDTH = 408;

/** How many dots fit in `width` px (the active one is wider): 29 in 408px. */
export function dotsThatFit(width) {
  return Math.max(5, Math.floor((Math.min(width, MAX_WIDTH) - ACTIVE) / (DOT + GAP)) + 1);
}

/** Which pages get a dot: [{ page, current, faded }]. */
export function pagerDots(count, current, fit = dotsThatFit(MAX_WIDTH)) {
  const shown = Math.min(count, fit);
  const start = Math.max(0, Math.min(current - Math.floor(shown / 2), count - shown));
  const end = start + shown;
  return Array.from({ length: shown }, (_, k) => {
    const page = start + k;
    return { page, current: page === current, faded: (page === start && start > 0) || (page === end - 1 && end < count) };
  });
}
