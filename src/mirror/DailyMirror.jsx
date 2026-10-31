'use client';
// Daily Mirror. Figma file 5evySGmkwmI2tXSjSSezwH: desktop "Daily Mirror — Desktop" (116:2311),
// mobile below 1024px "Daily Mirror - Mobile" (145:1617). One markup; mirror.css lays it out per breakpoint.
// Desktop: season filter-items + occasion menu column, arrows. Mobile: occasion tabs + season dropdown, swipe,
// and a bottom bar with "Shoot your outfit" and the avatar. The looks turn on a ring (OutfitRing.jsx).
// Under the front look: hide · pager · heart (Figma "Favorite & hide", 191:1372). Hiding takes the look's garment
// combination out of the mirror for good, with Undo; hearted looks come back under the "Favorites" filter.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { Logo } from '../ui/Logo.jsx';
import { wrap } from './carousel.js';
import { dayLine, isNight, timeLine, vibeQuestion } from './greeting.js';
import LookViewer from './LookViewer.jsx';
import OutfitRing from './OutfitRing.jsx';
import { defaultTab, OCCASION_TABS, weatherIcon } from './occasions.js';
import { SAMPLE_OUTFITS } from './outfits.js';
import { SEASON_FILTERS, seasonKey } from './seasons.js';

const SEASONS = SEASON_FILTERS.map((f) => f.label);

const OCCASIONS = OCCASION_TABS.map((t) => t.label);
const POLL_MS = 5000;
import '../ui/components.css';
import './mirror.css';

const MAX_DOTS = 5; // the Figma pager has 1–5 dots
const TOAST_MS = 5000; // Figma toast: "Shows for ~5 s"

/** toast (Figma 191:1373): a short confirmation with one action. Sits just above the hide · pager · heart row. */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="ds-toast mirror-toast" role="status">
      <span>{toast.message}</span>
      <button type="button" className="ds-toast-action" onClick={toast.onAction}>{toast.action}</button>
    </div>
  );
}

/** "Favorites" with nothing hearted yet (Figma 192:1750). */
function NoFavorites({ onBack }) {
  return (
    <div className="mirror-empty is-favorites" role="status">
      <img src="/brand/no-favorites.svg" width="155" height="106" alt="" />
      <div>
        <h2>No favorites yet</h2>
        <p>Tap the heart on a look you love. It comes back here, ready to wear again.</p>
      </div>
      <button type="button" className="mirror-link" onClick={onBack}>See today’s suggestions</button>
    </div>
  );
}

/** avatar (Figma "avatar", Variation=Default): the person's initial. */
function Account({ initial }) {
  return (
    <details className="mirror-account">
      <summary className="ds-avatar mirror-avatar" aria-label="Account"><span aria-hidden="true">{initial}</span></summary>
      <form className="mirror-account-menu" method="post" action="/auth/signout">
        <button type="submit">Sign out</button>
      </form>
    </details>
  );
}

function ShootButton({ onShoot }) {
  // No `capture` attribute on purpose: phones then offer their own menu (iPhone: Take Photo, Photo Library, Choose
  // File; Android: camera or gallery). With `capture` they open only the camera (2026-10-30, Felipe).
  return (
    <label className="ds-button mirror-shoot">
      <Icon name="camera" size={20} />
      <span>Shoot your outfit</span>
      <input className="visually-hidden" type="file" accept="image/*"
        onChange={(e) => { const file = e.target.files?.[0]; if (file) onShoot(file); e.target.value = ''; }} />
    </label>
  );
}

/** today: the signed-in person's looks from the server ({ tabs, temperature, hasBase }), or null for the sample looks
 *  (local preview). Picking a tab with no looks yet asks the worker for some; while any are being made the mirror asks
 *  the server again every few seconds, and each look joins the ring as soon as it's ready. */
export default function DailyMirror({
  name = '', today = null, temperature = '24º',
}) {
  const [now, setNow] = useState(null); // set on the client, so the time is the viewer's own
  const [index, setIndex] = useState(0);
  const [season, setSeason] = useState(SEASONS[0]);
  const [occasion, setOccasionState] = useState(() => defaultTab());
  const [data, setData] = useState(today);
  const [problem, setProblem] = useState(null);
  const [viewing, setViewing] = useState(null); // the look shown full screen
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const [past, setPast] = useState(null); // { key, tabs }: looks for a season filter other than today's
  const filter = seasonKey(season);
  const today_ = filter === 'today';

  const live = Boolean(data);
  const favoritesView = filter === 'favorites';
  const seasonTabs = !today_ && past?.key === filter ? past.tabs : null;
  const tab = live ? (today_ ? data.tabs[occasion] : seasonTabs?.[occasion] || { looks: [], making: false, loading: true }) : null;

  // Hearts and hides change on screen at once; the server is told in the background (POST /api/looks/mark).
  const [hearts, setHearts] = useState(() => new Map()); // look id → hearted, for changes made on this page
  const [hidden, setHidden] = useState(() => new Set()); // garment combinations hidden on this page
  const [toast, setToast] = useState(null);
  const pending = useRef(new Set()); // marks still on their way, so a Favorites fetch waits for them
  const isFav = (o) => (hearts.has(o.id) ? hearts.get(o.id) : Boolean(o.favorite));
  const comboOf = (o) => o.combo || o.id;
  const outfits = (live ? tab.looks : SAMPLE_OUTFITS)
    .filter((o) => !hidden.has(comboOf(o)) && (!favoritesView || isFav(o)));
  const making = live && Object.values(data.tabs).some((t) => t.making);
  const refresh = useCallback(async () => {
    const res = await fetch('/api/looks', { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);
  const ask = useCallback(async (label) => {
    setProblem(null);
    setData((d) => ({ ...d, tabs: { ...d.tabs, [label]: { ...d.tabs[label], making: true } } }));
    const res = await fetch('/api/looks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab: label }) }).catch(() => null);
    const r = res ? await res.json().catch(() => ({})) : { error: 'No connection' };
    if (r.error) setProblem(r.error);
    refresh();
  }, [refresh]);
  // "Shoot your outfit": the photo joins the wardrobe and is read on the next run (the morning looks, or "Make looks").
  const [note, setNote] = useState(null);
  const onShoot = useCallback(async (file) => {
    if (!live) return;
    setProblem(null); setNote('Adding your outfit…');
    try {
      const { fileToJpeg } = await import('../onboarding/resize.js');
      const form = new FormData();
      form.append('kind', 'outfit'); form.append('tab', occasion); form.append('photo', await fileToJpeg(file), 'outfit.jpg');
      const res = await fetch('/api/onboarding/photo', { method: 'POST', body: form });
      const r = await res.json().catch(() => ({}));
      if (r.error) { setNote(null); setProblem(r.error); return; }
      const tip = r.advice ? ` ${r.advice.title}: ${r.advice.hint}` : '';
      setNote(r.queued ? `Outfit added! Your look will be ready in about a minute.${tip}`
        : r.queueError ? `Outfit added! ${r.queueError}` : `Outfit added! It’ll be in your next looks.${tip}`);
      if (r.queued) { setSeason(SEASONS[0]); refresh(); }
      setData((d) => ({ ...d, outfitPhotos: (d.outfitPhotos || 0) + 1 }));
    } catch (e) { setNote(null); setProblem(e.message || 'Could not add the photo'); }
  }, [live, occasion, refresh]);
  const setOccasion = (label) => {
    setOccasionState(label); setIndex(0);
    if (live && today_ && data.hasBase && !data.tabs[label].looks.length && !data.tabs[label].making) ask(label);
  };
  // Season filters other than today's look back over earlier looks (src/mirror/seasons.js).
  const pickSeason = (label) => { setSeason(label); setIndex(0); setProblem(null); };
  useEffect(() => {
    if (!live || today_) return;
    let gone = false;
    Promise.all([...pending.current]).then(() => fetch(`/api/looks?season=${filter}`, { cache: 'no-store' })).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((r) => { if (!gone) { if (r?.tabs) setPast({ key: filter, tabs: r.tabs }); else setProblem('Could not load those looks. Try again.'); } });
    return () => { gone = true; };
  }, [filter, live, today_]);
  // While looks are being made, fetch again every few seconds; new ones join the ring as they arrive.
  useEffect(() => { if (!making) return undefined; const t = setInterval(refresh, POLL_MS); return () => clearInterval(t); }, [making, refresh]);
  // Opening the mirror on a tab with no looks today (the morning run hasn't happened, or another occasion) asks for some.
  useEffect(() => { if (live && data.hasBase && !tab.looks.length && !tab.making) ask(occasion); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Toasts leave after ~5 s; a new one replaces the last.
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), TOAST_MS); return () => clearTimeout(t); }, [toast]);
  const mark = useCallback((id, action) => {
    if (!live) return; // the preview account keeps hearts and hides on this page only
    // Before migration 007 runs the server can't keep them; they still hold until the page reloads.
    const p = fetch('/api/looks/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action }) })
      .catch(() => null).finally(() => pending.current.delete(p));
    pending.current.add(p);
  }, [live]);
  const toggleFavorite = (look) => {
    const on = !isFav(look);
    setHearts((m) => new Map(m).set(look.id, on));
    mark(look.id, on ? 'favorite' : 'unfavorite');
    setToast(on ? { id: Date.now(), message: 'Saved to Favorites', action: 'View', onAction: () => { setToast(null); pickSeason('Favorites'); } } : null);
  };
  const hide = (look) => {
    const combo = comboOf(look);
    setHidden((h) => new Set(h).add(combo)); // the ring now shows the next look where this one stood
    mark(look.id, 'hide');
    setToast({ id: Date.now(), message: 'Look hidden. You won’t see it again.', action: 'Undo', onAction: () => {
      setToast(null);
      setHidden((h) => { const n = new Set(h); n.delete(combo); return n; });
      mark(look.id, 'unhide');
    } });
  };

  // The server renders with its own clock; the browser corrects it to the viewer's time right after it loads.
  const shown = now || new Date();
  const count = outfits.length;
  const current = wrap(index, count);
  const go = (delta) => setIndex((i) => wrap(i + delta, count));
  // With more looks than dots, the pager shows a window of up to five around the current one.
  const first = Math.max(0, Math.min(current - Math.floor(MAX_DOTS / 2), count - MAX_DOTS));
  const dots = outfits.slice(first, first + MAX_DOTS).map((o, i) => ({ outfit: o, i: first + i }));
  const front = count ? outfits[current] : null;
  const loading = live && !today_ && tab.loading;

  // "Skip" in onboarding (Figma 162:545): no tabs or bottom bar, just the way back in.
  if (live && !data.hasBase) {
    return (
      <div className="mirror is-waiting">
        <header className="mirror-header"><Logo className="mirror-logo" /></header>
        <main className="mirror-content">
          <div className="mirror-top">
            <p className="mirror-meta" suppressHydrationWarning>
              <span>{dayLine(shown)}</span>
              <img className="mirror-sep" src="/brand/sep.svg" width="5" height="11" alt="" />
              <span>{timeLine(shown)}</span>
            </p>
          </div>
          <section className="mirror-waiting">
            <img src="/brand/symbol.svg" width="56" height="44" alt="" />
            <div><h1>Your mirror is waiting</h1><p>It needs only 3 face photos and one outfit to show you in your own clothes.</p></div>
            <div className="mirror-waiting-cta">
              <p className="mirror-waiting-time">About 3 minutes.</p>
              <a className="ds-button is-large" href="/onboarding">Let’s start</a>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const more = live ? Math.max(0, 3 - (data.outfitPhotos || 0)) : 0;
  return (
    <div className="mirror">
      <header className="mirror-header">
        <Logo className="mirror-logo" />
        <div className="mirror-actions">
          <ShootButton onShoot={onShoot} />
          <Account initial={(name || '·').trim().charAt(0).toUpperCase()} />
        </div>
      </header>

      <main className="mirror-content">
        <div className="mirror-top">
          <div className="mirror-intro">
            <h1 className="mirror-question" suppressHydrationWarning>{vibeQuestion(shown, name)}</h1>
            <p className="mirror-meta" suppressHydrationWarning>
              <span>{dayLine(shown)}</span>
              <img className="mirror-sep" src="/brand/sep.svg" width="5" height="11" alt="" />
              <span>{timeLine(shown)}</span>
              <img className="mirror-sep" src="/brand/sep.svg" width="5" height="11" alt="" />
              <span className="mirror-weather"><Icon name={weatherIcon(live ? data.condition : null, isNight(shown))} size={16} label="Weather" />{(live && data.temperature) || temperature}</span>
            </p>
          </div>

          {/* Desktop: season filters in a row, occasions in a column on the right. */}
          <nav className="mirror-nav" aria-label="Filters">
            <div className="mirror-filters" role="group" aria-label="Season">
              {SEASONS.map((s) => (
                <button key={s} type="button" className="ds-filter-item" aria-pressed={season === s} onClick={() => pickSeason(s)}>{s}</button>
              ))}
            </div>
            <div className="mirror-menu" role="group" aria-label="Occasion">
              {OCCASIONS.map((o) => (
                <button key={o} type="button" className="ds-menu-item" aria-current={occasion === o} onClick={() => setOccasion(o)}>{o}</button>
              ))}
            </div>
          </nav>

          {/* Mobile: occasions as tabs, season as a dropdown. */}
          <div className="mirror-mobile-filters">
            <div className="ds-tabs" role="tablist" aria-label="Occasion">
              {OCCASIONS.map((o) => (
                <button key={o} type="button" role="tab" className="ds-tab" aria-selected={occasion === o} onClick={() => setOccasion(o)}>{o}</button>
              ))}
            </div>
            <label className="ds-filter-selector">
              <span>{season}</span>
              <Icon name="chevron-down" size={16} />
              <select aria-label="Season" value={season} onChange={(e) => pickSeason(e.target.value)}>
                {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </div>

        <section className="mirror-body" aria-roledescription="carousel" aria-label={`${occasion} outfits, ${season}`}>
          <div className="mirror-carousel">
            {count > 1 && <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(-1)} aria-label="Previous outfit"><Icon name="arrow-left" size={20} /></button>}
            {count ? <OutfitRing key={`${occasion}|${filter}`} outfits={outfits} index={current} onChange={setIndex} onOpen={(i) => setViewing(outfits[i])} />
              : favoritesView && !loading && !problem ? <NoFavorites onBack={() => pickSeason(SEASONS[0])} /> : (
              <div className="mirror-empty" role="status">
                {!live ? <p>No looks left here. Reload the page to see them again.</p>
                  : !data.hasBase ? <p>Add your photos to see yourself in your own clothes.</p>
                  : !today_ ? <p>{tab.loading ? 'Loading…' : problem || `No ${season.toLowerCase()} ${occasion.toLowerCase()} looks yet.`}</p>
                  : tab.making ? <p>Making your {occasion.toLowerCase()} looks… the first one takes about a minute.</p>
                  : <><p>{problem || `No ${occasion.toLowerCase()} looks yet today.`}</p>
                    {!problem && <button type="button" className="ds-button" onClick={() => ask(occasion)}>Make looks</button>}</>}
              </div>
            )}
            {count > 1 && <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(1)} aria-label="Next outfit"><Icon name="arrow-right" size={20} /></button>}
          </div>
          {(note || (problem && count > 0)) && <p className="mirror-note" role="status">{note || problem}</p>}
          {!note && count <= 1 && more > 0 && <p className="mirror-nudge">Add {more} more outfit{more > 1 ? 's' : ''} for new looks every day</p>}
          {/* hide · pager · heart under the front look (Figma 191:1385, desktop 198:5697); the toast sits just above. */}
          <div className="mirror-look-bar">
            <Toast key={toast?.id} toast={toast} />
            {front && (
              <div className="mirror-look-actions">
                <button type="button" className="ds-icon-button is-large is-tertiary mirror-look-action" onClick={() => hide(front)}
                  aria-label="Hide this look" title="Hide this look"><Icon name="eye-off" size={24} strokeWidth={5 / 3} /></button>
                {count > 1 && (
                  <div className="ds-pager" role="group" aria-label="Choose an outfit">
                    {dots.map(({ outfit, i }) => (
                      <button key={outfit.id} type="button" className="ds-pager-dot" aria-current={i === current} aria-label={`Outfit ${i + 1} of ${count}`} onClick={() => setIndex(i)} />
                    ))}
                  </div>
                )}
                <button type="button" className="ds-icon-button is-large is-tertiary mirror-look-action" onClick={() => toggleFavorite(front)}
                  aria-pressed={isFav(front)} aria-label="Favorite" title={isFav(front) ? 'Remove from Favorites' : 'Save to Favorites'}>
                  <Icon name="heart" size={24} strokeWidth={5 / 3} /></button>
              </div>
            )}
          </div>
        </section>
      </main>
      {viewing && <LookViewer look={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
