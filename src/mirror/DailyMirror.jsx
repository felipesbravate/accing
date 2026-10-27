'use client';
// Daily Mirror home: today's outfit as a full-height card, 3-5 alternatives to swipe, and Save / Details / Regenerate.
import { useRef, useState } from 'react';
import { SAMPLE_OUTFITS } from './outfits.js';
import { clampIndex, indexFromScroll } from './carousel.js';
import './mirror.css';

const GAP = 16;

function today() {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
}

export default function DailyMirror({ name = '', outfits = SAMPLE_OUTFITS }) {
  const strip = useRef(null);
  const [index, setIndex] = useState(0);
  const [details, setDetails] = useState(false);
  const [saved, setSaved] = useState(() => new Set());
  const current = outfits[index];

  const goTo = (i) => {
    const next = clampIndex(i, outfits.length);
    const el = strip.current;
    const card = el?.children[next];
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setIndex(next);
  };
  const onScroll = () => {
    const el = strip.current;
    const card = el?.children[0];
    if (card) setIndex(indexFromScroll(el.scrollLeft, card.offsetWidth, GAP, outfits.length));
  };
  const toggleSave = () => setSaved((s) => { const n = new Set(s); n.has(current.id) ? n.delete(current.id) : n.add(current.id); return n; });

  return (
    <div className="mirror">
      <header className="mirror-header">
        <div>
          <p className="caption">{today()}</p>
          <h1 className="h2">{name ? `Good morning, ${name}` : 'Good morning'}</h1>
        </div>
        <form method="post" action="/auth/signout">
          <button className="btn is-ghost mirror-signout" type="submit">Sign out</button>
        </form>
      </header>

      <main className="mirror-main">
        <div className="mirror-strip" ref={strip} onScroll={onScroll} aria-roledescription="carousel" aria-label="Today's outfits">
          {outfits.map((o, i) => (
            <article key={o.id} className="mirror-card" aria-roledescription="slide" aria-label={`${i + 1} of ${outfits.length}: ${o.title}`}>
              <div className="mirror-figure" aria-hidden="true">
                <svg viewBox="0 0 120 240" className="mirror-silhouette"><circle cx="60" cy="28" r="18" /><path d="M30 60 Q60 48 90 60 L98 140 L82 140 L80 230 L64 230 L60 150 L56 230 L40 230 L38 140 L22 140 Z" /></svg>
                <p className="caption">Your look will appear here</p>
              </div>
              <div className="mirror-card-text">
                <h2 className="mirror-title">{o.title}</h2>
                <p className="caption">{o.why}</p>
              </div>
            </article>
          ))}
        </div>

        <nav className="mirror-nav" aria-label="Choose an outfit">
          <button className="mirror-arrow" type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous outfit">‹</button>
          <div className="mirror-dots">
            {outfits.map((o, i) => (
              <button key={o.id} type="button" className={'mirror-dot' + (i === index ? ' is-active' : '')} onClick={() => goTo(i)} aria-label={`Outfit ${i + 1}`} aria-current={i === index} />
            ))}
          </div>
          <button className="mirror-arrow" type="button" onClick={() => goTo(index + 1)} disabled={index === outfits.length - 1} aria-label="Next outfit">›</button>
        </nav>

        {details && (
          <section className="mirror-details" aria-label="Outfit details">
            <h3 className="mirror-title">What you're wearing</h3>
            <ul>{current.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        )}

        <div className="mirror-actions">
          <button className="btn is-ghost" type="button" onClick={toggleSave} aria-pressed={saved.has(current.id)}>{saved.has(current.id) ? 'Saved' : 'Save'}</button>
          <button className="btn is-ghost" type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details}>Details</button>
          <button className="btn" type="button" disabled title="Generation comes next">Regenerate</button>
        </div>
      </main>
    </div>
  );
}
