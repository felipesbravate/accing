'use client';
// Splash screen for the home-screen web app (Figma "Splash screen - Mobile", node 143:1366): the symbol, a greeting by
// first name, the wordmark at the bottom. Shown only when Accing is opened from the home screen (standalone display
// mode), once per launch. Add ?splash to the URL to preview it in a normal browser tab.
// splash-script.js runs in <head> (app/layout.js) and decides before the first paint, so the mirror never flashes underneath.
// Rendered by app/layout.js (not the page), so it arrives before the page's data; it stays until the page is there.
import { useEffect, useState } from 'react';
import { Logo, LogoSymbol } from '../ui/Logo.jsx';
import { splashQuestion } from './greeting.js';
import { SPLASH_SEEN } from './splash-script.js';
import './splash.css';

const SHOW_MS = 1400;     // at least this long, as designed
const MAX_MS = 10_000;    // never longer, even if the page is slow
const READY = '.mirror, .ob-screen, .login-page'; // the page has arrived (not the empty loading state)

export default function Splash({ name = '' }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('show-splash')) return;
    try { sessionStorage.setItem(SPLASH_SEEN, '1'); } catch { /* private mode: show again next launch */ }
    // Leave once it has been up SHOW_MS and the page behind it has rendered (it streams in after the splash).
    const start = performance.now();
    let done = 0;
    const check = setInterval(() => {
      const t = performance.now() - start;
      if (t < SHOW_MS || (!document.querySelector(READY) && t < MAX_MS)) return;
      clearInterval(check); setLeaving(true);
      done = setTimeout(() => { root.classList.remove('show-splash'); root.style.backgroundColor = ''; }, 300);
    }, 100);
    return () => { clearInterval(check); clearTimeout(done); };
  }, []);

  return (
    <div className={`splash${leaving ? ' is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="splash-center">
        <LogoSymbol className="splash-symbol" width={155} height={120} />
        <p className="splash-question">{splashQuestion(name)}</p>
      </div>
      <Logo className="splash-wordmark" />
    </div>
  );
}
