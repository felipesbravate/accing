'use client';
// Daily Mirror. Desktop: Figma "Daily Mirror — Desktop" (node 3:76). Mobile, below 1024px: "Daily Mirror 2 — Mobile" (node 68:646).
// One markup for both; mirror.css reorders it for mobile (question first, occasions above filters, swipe + dots, avatar at the bottom).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { Logo } from '../ui/Logo.jsx';
import { Toggle } from '../ui/Toggle.jsx';
import { around, swipeStep, wrap } from './carousel.js';
import { dayLine, timeLine, vibeQuestion } from './greeting.js';
import { OCCASIONS, SAMPLE_OUTFITS, SEASONS } from './outfits.js';
import '../ui/components.css';
import './mirror.css';

function Outfit({ outfit, size }) {
  return (
    <figure className={`outfit is-${size}`}>
      <figcaption className="outfit-badges">
        {outfit.tags.map((tag) => <span key={tag} className="ds-badge">{tag}</span>)}
      </figcaption>
      <img className="outfit-image" src={outfit.image} alt={outfit.alt} draggable={false} />
    </figure>
  );
}

export default function DailyMirror({ name = '', avatar = '/samples/avatar.png', outfits = SAMPLE_OUTFITS, temperature = '24º' }) {
  const [now, setNow] = useState(null); // set on the client, so the time is the viewer's own
  const [index, setIndex] = useState(0);
  const [season, setSeason] = useState(SEASONS[0]);
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [vacay, setVacay] = useState(false);
  const dragFrom = useRef(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  // The server renders with its own clock; the browser corrects it to the viewer's time right after it loads.
  const shown = now || new Date();
  const [prev, current, next] = around(index, outfits.length);
  const go = (delta) => setIndex((i) => wrap(i + delta, outfits.length));
  const onPointerDown = (e) => { dragFrom.current = e.clientX; };
  const onPointerUp = (e) => {
    if (dragFrom.current === null) return;
    const step = swipeStep(e.clientX - dragFrom.current);
    dragFrom.current = null;
    if (step) go(step);
  };

  return (
    <div className="mirror">
      <header className="mirror-header">
        <Logo className="mirror-logo" />
        <details className="mirror-account">
          <summary className="ds-avatar" aria-label="Account"><img src={avatar} alt="" /></summary>
          <form className="mirror-account-menu" method="post" action="/auth/signout">
            <button type="submit">Sign out</button>
          </form>
        </details>
      </header>

      <main className="mirror-content">
        <div className="mirror-top">
          <div className="mirror-greeting">
            <p className="mirror-meta">
              <span className="mirror-when" suppressHydrationWarning>
                <span className="mirror-day">{dayLine(shown)}</span>
                <span className="mirror-sep"> / </span>
                <span className="mirror-time">{timeLine(shown)}</span>
              </span>
              <span className="mirror-weather"><Icon name="sun" size={16} />{temperature}</span>
            </p>
            <h1 className="mirror-question" suppressHydrationWarning>{vibeQuestion(shown, name)}</h1>
          </div>

          <div className="mirror-filters" role="group" aria-label="Season">
            {SEASONS.map((s) => (
              <button key={s} type="button" className="ds-filter-item" aria-pressed={season === s} onClick={() => setSeason(s)}>{s}</button>
            ))}
          </div>

          <nav className="mirror-nav" aria-label="Occasion">
            <Toggle label="Vacay" checked={vacay} onChange={setVacay} />
            <div className="mirror-menu">
              {OCCASIONS.map((o) => (
                <button key={o} type="button" className="ds-menu-item" aria-current={occasion === o} onClick={() => setOccasion(o)}>{o}</button>
              ))}
            </div>
          </nav>
        </div>

        <section className="mirror-carousel" aria-roledescription="carousel" aria-label="Today's outfits"
          onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { dragFrom.current = null; }}>
          <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(-1)} aria-label="Previous outfit"><Icon name="arrow-left" size={20} /></button>
          {outfits.length > 2 && <Outfit outfit={outfits[prev]} size="side" />}
          <Outfit outfit={outfits[current]} size="main" />
          {outfits.length > 1 && <Outfit outfit={outfits[next]} size="side" />}
          <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(1)} aria-label="Next outfit"><Icon name="arrow-right" size={20} /></button>
        </section>

        <div className="mirror-dots" role="group" aria-label="Choose an outfit">
          {outfits.map((o, i) => (
            <button key={o.id} type="button" className="mirror-dot" aria-current={i === current} aria-label={`Outfit ${i + 1}`} onClick={() => setIndex(i)} />
          ))}
        </div>
      </main>
    </div>
  );
}
