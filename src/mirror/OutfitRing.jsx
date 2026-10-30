'use client';
// The looks stand on a turntable: the chosen one in front, the others round the ring, smaller and higher as they go
// back. The ring turns to bring a look to the front (arrows, pager, swipe/drag, tapping a look, ← →) and spins in
// once when the mirror opens. Tapping the front look (or Enter) opens it full screen (onOpen).
// With prefers-reduced-motion it changes without turning.
// Geometry lives in mirror.css as ratios of the look height (--ring-radius, --ring-lift) and --ring-back-scale;
// the maths is in carousel.js. Transforms are written straight to the DOM each frame, not through React state.
// Needs transparent looks (cut-outs with their floor shadow); opaque backgrounds would show as cards overlapping.
// Looks away from the front fade toward the page colour (--ring-side-strength, --ring-back-strength): a veil in the
// page colour, masked to the look's own shape, sits on each look. Unlike opacity, nobody becomes see-through, so a
// look behind another never shows through it. Only the front look and one on each side are on screen
// (--ring-visible-slots); the rest wait at the back and fade in as the ring turns them to a side.
import { useCallback, useEffect, useRef } from 'react';
import { easeInOutCubic, ringOffset, ringPose, ringPresence, ringVisibility, wrap } from './carousel.js';

const TURN_MS = 650;
const INTRO_MS = 1300;
const INTRO_SLOTS = 1.5; // the opening spin covers one and a half looks
const SWIPE_PX = 40;
const TAP_PX = 6;

export default function OutfitRing({ outfits, index, onChange, onOpen = () => {} }) {
  const count = outfits.length;
  const stage = useRef(null);
  const items = useRef([]);
  const pos = useRef(index);       // ring position in looks; fractional while turning, never wrapped
  const target = useRef(index);
  const frame = useRef(0);
  const drag = useRef(null);
  const geo = useRef({ radius: 0, backScale: 1, lift: 0, slotPx: 200, side: 1, back: 1 });

  const measure = useCallback(() => {
    const el = stage.current; if (!el) return;
    const cs = getComputedStyle(el), h = el.clientHeight;
    const num = (name, fallback) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) ? v : fallback; };
    const radius = num('--ring-radius', 0.6) * h;
    geo.current = { radius, backScale: num('--ring-back-scale', 0.6), lift: num('--ring-lift', 0.2) * h, slotPx: radius * 0.75,
      side: num('--ring-side-strength', 1), back: num('--ring-back-strength', 1), visible: num('--ring-visible-slots', 1) };
    el.dataset.ready = 'true'; // from now on every look has its own pose (before this, CSS shows only the front one)
  }, []);

  const paint = useCallback(() => {
    items.current.forEach((el, i) => {
      if (!el) return;
      const offset = ringOffset(i, pos.current, count);
      const p = ringPose(offset, count, geo.current);
      el.style.transform = `translate3d(calc(-50% + ${p.x.toFixed(1)}px), ${p.y.toFixed(1)}px, 0) scale(${p.scale.toFixed(4)})`;
      el.style.zIndex = String(p.z);
      const shown = p.opacity * ringPresence(offset, geo.current.visible);
      el.style.opacity = shown.toFixed(3);
      el.style.visibility = shown > 0 ? 'visible' : 'hidden'; // hidden looks can't be tapped
      el.style.setProperty('--fade', (1 - ringVisibility(offset, geo.current)).toFixed(3));
      el.dataset.front = Math.abs(offset) < 0.5 ? 'true' : 'false';
    });
  }, [count]);

  const turnTo = useCallback((to, ms = TURN_MS) => {
    cancelAnimationFrame(frame.current);
    target.current = to;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = pos.current;
    if (reduce || ms <= 0 || from === to) { pos.current = to; paint(); return; }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms);
      pos.current = from + (to - from) * easeInOutCubic(t);
      paint();
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [paint]);

  // Opening spin, once. Waits for the home-screen splash to leave if it is up.
  useEffect(() => {
    measure();
    pos.current = index - INTRO_SLOTS; target.current = index; paint();
    const delay = document.documentElement.classList.contains('show-splash') ? 1500 : 150;
    const t = setTimeout(() => turnTo(index, INTRO_MS), delay);
    const onResize = () => { measure(); paint(); };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); cancelAnimationFrame(frame.current); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arrows, pager and keys change `index`; turn the short way round to it.
  useEffect(() => {
    if (wrap(Math.round(target.current), count) === index) return;
    turnTo(pos.current + ringOffset(index, pos.current, count));
  }, [index, count, turnTo]);

  // New list of looks (filters): show them from the front.
  useEffect(() => { measure(); paint(); }, [outfits, measure, paint]);

  const settle = (to) => { turnTo(to); onChange(wrap(to, count)); };

  const onPointerDown = (e) => {
    if (e.button > 0) return;
    cancelAnimationFrame(frame.current);
    drag.current = { x: e.clientX, from: pos.current, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (count < 2) return; // one look: nothing to turn, only taps
    if (!d.moved && Math.abs(dx) > TAP_PX) { d.moved = true; stage.current.setPointerCapture?.(e.pointerId); }
    if (d.moved) { pos.current = d.from - dx / geo.current.slotPx; paint(); }
  };
  const onPointerUp = (e) => {
    const d = drag.current; drag.current = null; if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved) { // a tap: bring the tapped look to the front
      const hit = e.target.closest?.('[data-i]');
      if (hit && hit.dataset.front !== 'true' && count > 1) { const i = Number(hit.dataset.i); settle(pos.current + ringOffset(i, pos.current, count)); }
      else { turnTo(target.current); if (hit) onOpen(Number(hit.dataset.i)); } // the front look: open it full screen
      return;
    }
    let to = Math.round(pos.current);
    if (to === Math.round(d.from) && Math.abs(dx) >= SWIPE_PX) to += dx < 0 ? 1 : -1; // a quick flick still moves one look
    settle(to);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); settle(Math.round(target.current) + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); settle(Math.round(target.current) - 1); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(index); }
  };

  return (
    <div className="ring" ref={stage} tabIndex={0} aria-label="Outfits. Use the arrow keys to turn, Enter to see the look full screen."
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerCancel={() => { drag.current = null; turnTo(target.current); }} onKeyDown={onKeyDown}>
      {outfits.map((o, i) => (
        <figure key={o.id} className={`ring-item${i === index ? ' is-front' : ''}`} data-i={i} ref={(el) => { items.current[i] = el; }} aria-hidden={i !== index || undefined}>
          <img src={o.image} alt={i === index ? o.alt : ''} draggable={false} />
          <span className="ring-veil" aria-hidden="true" style={{ WebkitMaskImage: `url(${o.image})`, maskImage: `url(${o.image})` }} />
        </figure>
      ))}
    </div>
  );
}
