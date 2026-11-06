'use client';
// iPhone Safari takes a swipe that starts near the screen's left or right edge as back / forward in history (Felipe,
// 2026-11-06: swiping the looks sometimes brought back a screen visited before). CSS can't switch that off on iOS;
// cancelling the touch's start (a non-passive touchstart) within EDGE_PX of an edge does. Pointer events still come,
// so the carousel and the full-screen look keep working; only those edge touches stop being taps on links.
import { useEffect } from 'react';

export const EDGE_PX = 28;

/** Keeps edge swipes on `ref`'s element for the page, not for history. */
export function useNoEdgeSwipe(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onStart = (e) => {
      const t = e.touches[0];
      if (t && (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX)) e.preventDefault();
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    return () => el.removeEventListener('touchstart', onStart);
  }, [ref]);
}
