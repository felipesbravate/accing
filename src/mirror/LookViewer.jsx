'use client';
// A look full screen (Figma "Mobile - Look zoom", 253:8207): tap the front look in the ring to open it; pinch (or double
// tap) to zoom, drag to look around, × or Escape or the phone's back gesture to close. Transforms go straight to the DOM
// while fingers move. top-nav with × on the right; down the right side hide, favourite, worn and share.
// Swipe up for the next look (the one on its right in the ring), down for the one before, like Instagram (Felipe,
// 2026-11-06): the looks above and below wait off screen and follow the finger; ↑ ↓ keys too.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { clampView, pinch, toggleZoom } from './zoom.js';
import { prepareLookFile, shareLookFile } from './share.js';
import { LookActions } from './LookActions.jsx';

const DOUBLE_TAP_MS = 300;
const PAGE_GAP = 16;     // px between a look and the next one while swiping
const PAGE_MS = 320;

export default function LookViewer({ look, prev = null, next = null, onStep = null, pager = null, onClose, onHide, hiding, favorite, onFavorite, worn, onWear, toast = null }) {
  const stage = useRef(null), frame = useRef(null), img = useRef(null), dialog = useRef(null), track = useRef(null), clip = useRef(null);
  const paging = useRef(false);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  // Share (share.js): the picture on white is made as soon as the look opens, so a tap can open the share sheet at once.
  const file = useRef(null);
  const [share, setShare] = useState('preparing'); // preparing | ready | failed
  useEffect(() => {
    let gone = false;
    prepareLookFile(look.image).then((f) => { if (!gone) { file.current = f; setShare('ready'); } }).catch(() => { if (!gone) setShare('failed'); });
    return () => { gone = true; };
  }, [look.image]);
  const onShare = async () => { if (file.current) await shareLookFile(file.current); };

  const apply = (v, animate = false) => {
    view.current = v;
    const el = img.current; if (!el) return;
    el.style.transition = animate ? 'transform .25s ease-out' : 'none';
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  };
  // Measured on the frame (the look's box at scale 1, never transformed), so maths and CSS share one centre.
  const size = () => ({ w: frame.current?.clientWidth || 1, h: frame.current?.clientHeight || 1 });
  // From the look's centre, measured on the stage and the clip box (they never move): the frame itself slides while paging.
  const local = (e) => {
    const r = stage.current.getBoundingClientRect(), c = clip.current;
    return { x: e.clientX - r.left - (c.offsetLeft + c.offsetWidth / 2), y: e.clientY - r.top - (c.offsetTop + c.offsetHeight / 2) };
  };

  // Open: focus the dialog itself (not ×: Safari draws the focus ring on a button focused by script), stop the page behind from scrolling, and let the back gesture close the viewer.
  useEffect(() => {
    dialog.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    history.pushState({ lookViewer: true }, '');
    const onPop = () => onClose(true);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('popstate', onPop); window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('popstate', onPop); window.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const close = () => { if (history.state?.lookViewer) history.back(); else onClose(true); }; // history.back() → popstate → onClose

  // Paging: the track holds the look before (above), this one and the next (below).
  const canPage = Boolean(onStep && next && next.id !== look.id);
  const slide = (y, ms = 0) => {
    const el = track.current; if (!el) return;
    el.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2, .8, .2, 1)` : 'none';
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  };
  const pageTo = (delta) => {
    if (!canPage || paging.current) return;
    paging.current = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const h = size().h + PAGE_GAP;
    if (reduce) { onStep(delta); return; }
    slide(-delta * h, PAGE_MS);
    setTimeout(() => onStep(delta), PAGE_MS);
  };
  // A new look in the middle: put the track back without moving anything on screen, back to scale 1.
  useLayoutEffect(() => { slide(0); apply({ s: 1, x: 0, y: 0 }); paging.current = false; }, [look.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); pageTo(1); } if (e.key === 'ArrowUp') { e.preventDefault(); pageTo(-1); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const begin = () => {
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = { kind: 'pinch', view: view.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    } else if (pts.length === 1) {
      gesture.current = { kind: 'pan', view: view.current, from: pts[0], moved: false, axis: null, samples: [{ y: pts[0].y, t: performance.now() }] };
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
      if (g.view.s > 1) { const { w, h } = size(); apply(clampView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy }, w, h)); return; }
      // Not zoomed: an up/down drag moves the looks (a sideways one does nothing).
      if (!g.axis && Math.hypot(dx, dy) > 8) g.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      if (g.axis === 'y' && !paging.current) {
        g.samples.push({ y: p.y, t: performance.now() }); if (g.samples.length > 6) g.samples.shift();
        slide(canPage ? dy : dy * 0.25); // one look: it only gives a little
      }
    }
  };
  const onPointerUp = (e) => {
    const g = gesture.current, at = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) { begin(); return; } // one finger lifted from a pinch: carry on panning with the other
    gesture.current = null;
    const { w, h } = size();
    if (g?.kind === 'pan' && g.axis === 'y' && g.view.s <= 1 && !paging.current) {
      const dy = (at?.y ?? g.from.y) - g.from.y;
      const first = g.samples.find((s) => performance.now() - s.t < 120) || g.samples[0];
      const v = (at ? at.y - first.y : 0) / Math.max(1, performance.now() - first.t); // px/ms, + down
      const far = Math.abs(dy) > h * 0.18, quick = Math.abs(v) > 0.45 && Math.abs(dy) > 24;
      if (canPage && (far || quick)) pageTo(dy < 0 ? 1 : -1); // up: the next look; down: the one before
      else slide(0, 260);
      return;
    }
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
    <div ref={dialog} tabIndex={-1} className="look-viewer" role="dialog" aria-modal="true" aria-label="Look, full screen. Pinch to zoom, swipe up or down for the next look.">
      <div className="look-viewer-stage" ref={stage} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="look-viewer-clip" ref={clip}><div className="look-viewer-track" ref={track}>
          {canPage && prev && <div className="look-viewer-frame is-prev" aria-hidden="true"><img src={prev.image} alt="" draggable={false} /></div>}
          <div className="look-viewer-frame" ref={frame}><img ref={img} src={look.image} alt={look.alt} draggable={false} /></div>
          {canPage && <div className="look-viewer-frame is-next" aria-hidden="true"><img src={next.image} alt="" draggable={false} /></div>}
        </div></div>
      </div>
      <div className="ds-top-nav look-viewer-nav">
        <span className="ds-top-nav-side" />
        <div className="ds-top-nav-side is-end">
          <button type="button" className="ds-icon-button is-large is-secondary" onClick={close} aria-label="Close"><Icon name="x" size={24} /></button>
        </div>
      </div>
      <LookActions className="look-viewer-actions" onHide={onHide} hiding={hiding} favorite={favorite} onFavorite={onFavorite} worn={worn} onWear={onWear}>
        <button type="button" className="ds-icon-button is-large is-tertiary mirror-look-action" onClick={onShare} disabled={share !== 'ready'}
          aria-label={share === 'failed' ? 'Sharing isn’t available for this look' : 'Share this look'} title="Share"><Icon name="share" size={24} strokeWidth={5 / 3} /></button>
      </LookActions>
      {pager && <div className="look-viewer-pager">{pager}</div>}
      {toast && <div className="look-viewer-toast">{toast}</div>}
    </div>
  );
}
