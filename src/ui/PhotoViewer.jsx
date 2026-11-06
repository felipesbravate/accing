'use client';
// A photo full screen (wardrobe garments, 2026-11-06; no Figma frame: the look viewer's layout, 253:8207). It opens
// zoomed onto the garment (`focus`: its part of the photo, as CSS object-position "center 72%"); pinch or double tap
// to zoom, drag to look around, × or Escape or the phone's back gesture to close. Zoom maths: src/mirror/zoom.js.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { useNoEdgeSwipe } from './edge-swipe.js';
import { clampView, focusOf, pinch, toggleZoom } from '../mirror/zoom.js';

const DOUBLE_TAP_MS = 300;
const OPEN_SCALE = 2; // how close it opens on the garment

export function PhotoViewer({ src, alt, caption = null, focus = null, onClose }) {
  const dialog = useRef(null), stage = useRef(null), frame = useRef(null), img = useRef(null);
  useNoEdgeSwipe(stage);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  const size = () => ({ w: frame.current?.clientWidth || 1, h: frame.current?.clientHeight || 1 });
  const apply = (v, animate = false) => {
    view.current = v;
    const el = img.current; if (!el) return;
    el.style.transition = animate ? 'transform .25s ease-out' : 'none';
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  };
  const local = (e) => {
    const f = frame.current.getBoundingClientRect();
    return { x: e.clientX - f.left - f.width / 2, y: e.clientY - f.top - f.height / 2 };
  };
  // Open on the garment: its part of the photo in the middle of the screen. The photo is drawn whole (contain), so the
  // garment's height is measured on the photo as drawn, once its size is known.
  const openOnGarment = () => {
    const at = focusOf(focus), el = img.current;
    if (at == null || !el?.naturalWidth) return;
    const { w, h } = size();
    const drawn = Math.min(h, (w * el.naturalHeight) / el.naturalWidth);
    apply(clampView({ s: OPEN_SCALE, x: 0, y: (0.5 - at) * drawn * OPEN_SCALE }, w, h));
  };
  useLayoutEffect(() => { if (img.current?.complete) openOnGarment(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true });
    const was = document.body.style.overflow; document.body.style.overflow = 'hidden';
    history.pushState({ photoViewer: true }, '');
    const onPop = () => onClose();
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('popstate', onPop); window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = was; window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { if (history.state?.photoViewer) history.back(); else onClose(); };

  const begin = () => {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = { kind: 'pinch', view: view.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    } else if (pts.length === 1) gesture.current = { kind: 'pan', view: view.current, from: pts[0], moved: false };
    else gesture.current = null;
  };
  const onPointerDown = (e) => {
    try { stage.current.setPointerCapture(e.pointerId); } catch { /* not a real pointer */ }
    pointers.current.set(e.pointerId, local(e)); begin();
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
      const dx = pts[0].x - g.from.x, dy = pts[0].y - g.from.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      if (g.view.s > 1) { const { w, h } = size(); apply(clampView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }, w, h)); }
    }
  };
  const onPointerUp = (e) => {
    const g = gesture.current, at = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) { begin(); return; }
    gesture.current = null;
    const { w, h } = size();
    if (g?.kind === 'pan' && !g.moved && at) { // two quick taps: zoom in on that point, or back out to the whole photo
      const now = performance.now(), last = lastTap.current;
      if (now - last.t < DOUBLE_TAP_MS && Math.hypot(at.x - last.x, at.y - last.y) < 30) {
        apply(clampView(toggleZoom(view.current, at), w, h), true); lastTap.current = { t: 0, x: 0, y: 0 }; return;
      }
      lastTap.current = { t: now, ...at };
    }
    apply(clampView(view.current, w, h), true);
  };

  return (
    <div ref={dialog} tabIndex={-1} className="photo-viewer" role="dialog" aria-modal="true" aria-label={`${alt}, full screen. Pinch or double tap to zoom.`}>
      <div className="photo-viewer-stage" ref={stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="photo-viewer-frame" ref={frame}><img ref={img} src={src} alt={alt} draggable={false} onLoad={openOnGarment} /></div>
      </div>
      <div className="ds-top-nav photo-viewer-nav">
        <span className="ds-top-nav-side" />
        <div className="ds-top-nav-side is-end">
          <button type="button" className="ds-icon-button is-large is-secondary" onClick={close} aria-label="Close"><Icon name="x" size={24} /></button>
        </div>
      </div>
      {caption && <p className="photo-viewer-caption">{caption}</p>}
    </div>
  );
}
