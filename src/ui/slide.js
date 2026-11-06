'use client';
// Page slides (Felipe, 2026-11-06): a screen with a back arrow slides in from the right; the back arrow slides it out
// to the right while the screen before it comes in from the left, both at once (a view transition: the browser keeps a
// picture of the old screen until the new one is there, so no white shows between them). Pages are separate routes, so
// the direction travels in sessionStorage. Styles: components.css (.slide-*, ::view-transition-*). Nothing moves with
// prefers-reduced-motion.
import { useLayoutEffect } from 'react';

const KEY = 'accing-nav';
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let arrived = null; // ends the back view transition once the screen before has mounted
const ARRIVE_MAX_MS = 1500; // never hold the old picture longer than this

function take() {
  try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return v; } catch { return null; }
}

/** Plays the way in on `ref`'s element when it mounts: from the left after a back arrow, else from the right
 *  (`onlyBack`: the mirror, which has no back arrow, only slides when coming back to it). */
export function useSlideIn(ref, { onlyBack = false } = {}) {
  useLayoutEffect(() => {
    const el = ref.current;
    const dir = take();
    if (arrived) { arrived(); arrived = null; return; } // a view transition is moving this screen in
    if (!el || reduced() || (onlyBack && dir !== 'back')) return;
    el.classList.add(dir === 'back' ? 'slide-in-back' : 'slide-in-forward');
    const done = () => el.classList.remove('slide-in-back', 'slide-in-forward');
    el.addEventListener('animationend', done, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The back arrow: `el` slides out to the right as the screen before slides in from the left, then `go()` has run.
 *  Browsers without view transitions (Safari before 18): `go()` at once, and the screen before slides in from the left. */
export function slideBack(el, go) {
  try { sessionStorage.setItem(KEY, 'back'); } catch { /* private mode: no slide in */ }
  if (!el || reduced() || typeof document.startViewTransition !== 'function') { go(); return; }
  const root = document.documentElement;
  root.dataset.nav = 'back';
  const t = document.startViewTransition(() => new Promise((done) => { arrived = done; go(); setTimeout(() => { arrived = null; done(); }, ARRIVE_MAX_MS); }));
  t.finished.finally(() => { delete root.dataset.nav; });
}

/** Restarts the way in on an element that stays mounted (onboarding steps). */
export function replaySlide(el, dir) {
  if (!el || reduced()) return;
  el.classList.remove('slide-in-back', 'slide-in-forward');
  void el.offsetWidth; // restart the animation
  el.classList.add(dir === 'back' ? 'slide-in-back' : 'slide-in-forward');
}
