'use client';
// Page slides (Felipe, 2026-11-06): a screen with a back arrow slides in from the right; the back arrow slides it out
// to the right and the screen before it comes in from the left. Pages are separate routes, so the direction travels
// in sessionStorage. Styles: components.css (.slide-*). Nothing moves with prefers-reduced-motion.
import { useLayoutEffect } from 'react';

const KEY = 'accing-nav';
export const SLIDE_OUT_MS = 200;
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function take() {
  try { const v = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); return v; } catch { return null; }
}

/** Plays the way in on `ref`'s element when it mounts: from the left after a back arrow, else from the right
 *  (`onlyBack`: the mirror, which has no back arrow, only slides when coming back to it). */
export function useSlideIn(ref, { onlyBack = false } = {}) {
  useLayoutEffect(() => {
    const el = ref.current;
    const dir = take();
    if (!el || reduced() || (onlyBack && dir !== 'back')) return;
    el.classList.add(dir === 'back' ? 'slide-in-back' : 'slide-in-forward');
    const done = () => el.classList.remove('slide-in-back', 'slide-in-forward');
    el.addEventListener('animationend', done, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** The back arrow: slides `el` out to the right, then `go()` (the screen before comes in from the left). */
export function slideBack(el, go) {
  try { sessionStorage.setItem(KEY, 'back'); } catch { /* private mode: no slide in */ }
  if (!el || reduced()) { go(); return; }
  el.classList.add('slide-out-back');
  setTimeout(go, SLIDE_OUT_MS);
}

/** Restarts the way in on an element that stays mounted (onboarding steps). */
export function replaySlide(el, dir) {
  if (!el || reduced()) return;
  el.classList.remove('slide-in-back', 'slide-in-forward');
  void el.offsetWidth; // restart the animation
  el.classList.add(dir === 'back' ? 'slide-in-back' : 'slide-in-forward');
}
