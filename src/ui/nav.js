// Where a top-nav back arrow goes (Felipe, 2026-11-09: back from the Wardrobe opened "matching outfits" again).
// A back arrow means "up to this screen's parent": Wardrobe → Profile → mirror, Hidden looks → Settings… The browser's
// own history only works when the page before is that parent, so the app keeps its own trail of the pages visited in
// this tab (NavTrail.jsx, sessionStorage): when the parent is the page before, back() (the trail and the history stay
// in step); otherwise the parent replaces this page, so no loop can form. Pure; tested in tests/nav.test.js.
export const TRAIL_KEY = 'accing-trail';
export const REPLACE_KEY = 'accing-trail-replace';
const MAX = 30;

/** The trail after arriving at `path`: one step back (the page before) pops; a replace swaps the last page; else push. */
export function nextTrail(trail, path, replaced = false) {
  const t = Array.isArray(trail) ? trail : [];
  if (t.at(-1) === path) return t;
  if (replaced) return [...t.slice(0, -1), path].slice(-MAX);
  if (t.at(-2) === path) return t.slice(0, -1);
  return [...t, path].slice(-MAX);
}

/** 'back' when the parent is the page before this one, else 'replace'. */
export function upMove(trail, parent) {
  return Array.isArray(trail) && trail.length >= 2 && trail.at(-2) === parent ? 'back' : 'replace';
}

function readTrail() {
  try { return JSON.parse(sessionStorage.getItem(TRAIL_KEY) || '[]'); } catch { return []; }
}
export function recordVisit(path) {
  try {
    const replaced = sessionStorage.getItem(REPLACE_KEY) === path;
    sessionStorage.removeItem(REPLACE_KEY);
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify(nextTrail(readTrail(), path, replaced)));
  } catch { /* private mode: every back arrow replaces */ }
}

/** The back arrow: to `parent` (a path), by back() when it is the page before, else by replacing this page. */
export function goUp(router, parent) {
  if (upMove(readTrail(), parent) === 'back') { router.back(); return; }
  try { sessionStorage.setItem(REPLACE_KEY, parent); } catch { /* no storage */ }
  router.replace(parent);
}
