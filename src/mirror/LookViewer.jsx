'use client';
// A look full screen: tap the front look in the ring to open it; pinch (or double tap) to zoom, drag to look around,
// × or Escape or the phone's back gesture to close. Transforms go straight to the DOM while fingers move.
import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { clampView, pinch, toggleZoom } from './zoom.js';

const DOUBLE_TAP_MS = 300;

export default function LookViewer({ look, onClose }) {
  const stage = useRef(null), frame = useRef(null), img = useRef(null), closeBtn = useRef(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  const apply = (v, animate = false) => {
    view.current = v;
    const el = img.current; if (!el) return;
    el.style.transition = animate ? 'transform .25s ease-out' : 'none';
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  };
  // Measured on the frame (the look's box at scale 1, never transformed), so maths and CSS share one centre.
  const size = () => ({ w: frame.current?.clientWidth || 1, h: frame.current?.clientHeight || 1 });
  const local = (e) => { const r = frame.current.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; };

  // Open: focus ×, stop the page behind from scrolling, and let the back gesture close the viewer.
  useEffect(() => {
    closeBtn.current?.focus();
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    history.pushState({ lookViewer: true }, '');
    const onPop = () => onClose(true);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('popstate', onPop); window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => { if (history.state?.lookViewer) history.back(); else onClose(true); }; // history.back() → popstate → onClose

  const begin = () => {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = { kind: 'pinch', view: view.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    } else if (pts.length === 1) {
      gesture.current = { kind: 'pan', view: view.current, from: pts[0], moved: false };
    } else gesture.current = null;
  };
  const onPointerDown = (e) => {
    try { stage.current.setPointerCapture(e.pointerId); } catch { /* not a real pointer (tests) */ }
    pointers.current.set(e.pointerId, local(e));
    begin();
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current; if (!g) return;
    const pts = [...pointers.current.values()];
    if (g.kind === 'pinch' && pts.length >= 2) {
      const [a, b] = pts;
      apply(pinch(g, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(a.x - b.x, a.y - b.y)));
    } else if (g.kind === 'pan') {
      const p = pts[0], dx = p.x - g.from.x, dy = p.y - g.from.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      if (g.view.s > 1) { const { w, h } = size(); apply(clampView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }, w, h)); }
    }
  };
  const onPointerUp = (e) => {
    const g = gesture.current, at = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) { begin(); return; } // one finger lifted from a pinch: carry on panning with the other
    gesture.current = null;
    const { w, h } = size();
    if (g?.kind === 'pan' && !g.moved && at) { // a tap: two quick taps zoom in or out
      const now = performance.now(), last = lastTap.current;
      if (now - last.t < DOUBLE_TAP_MS && Math.hypot(at.x - last.x, at.y - last.y) < 30) {
        apply(clampView(toggleZoom(view.current, at), w, h), true); lastTap.current = { t: 0, x: 0, y: 0 }; return;
      }
      lastTap.current = { t: now, ...at };
    }
    apply(clampView(view.current, w, h), true); // spring back inside the limits
  };

  return (
    <div className="look-viewer" role="dialog" aria-modal="true" aria-label="Look, full screen. Pinch to zoom.">
      <div className="look-viewer-stage" ref={stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="look-viewer-frame" ref={frame}><img ref={img} src={look.image} alt={look.alt} draggable={false} /></div>
      </div>
      <button ref={closeBtn} type="button" className="look-viewer-close" onClick={close} aria-label="Close"><Icon name="x" size={24} /></button>
    </div>
  );
}
