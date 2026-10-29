'use client';
// Splash screen for the home-screen web app (Figma "Splash screen - Mobile", node 143:1366): the symbol, a greeting by
// first name, the wordmark at the bottom. Shown only when Accing is opened from the home screen (standalone display
// mode), once per launch. Add ?splash to the URL to preview it in a normal browser tab.
// splash-script.js runs in <head> (app/layout.js) and decides before the first paint, so the mirror never flashes underneath.
import { useEffect, useState } from 'react';
import { Logo, LogoSymbol } from '../ui/Logo.jsx';
import { splashQuestion } from './greeting.js';
import { SPLASH_SEEN } from './splash-script.js';
import './splash.css';

const SHOW_MS = 1400;

export default function Splash({ name = '' }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains('show-splash')) return;
    try { sessionStorage.setItem(SPLASH_SEEN, '1'); } catch { /* private mode: show again next launch */ }
    const fade = setTimeout(() => setLeaving(true), SHOW_MS);
    const done = setTimeout(() => root.classList.remove('show-splash'), SHOW_MS + 300);
    return () => { clearTimeout(fade); clearTimeout(done); };
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
