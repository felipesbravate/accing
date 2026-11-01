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

const TOAST_MS = 5000; // Figma toast: "Shows for ~5 s"
const HIDE_TOAST_MS = 8000; // the hide toast asks why: a little longer to read and tap
const TOAST_OUT_MS = 250; // its exit animation (mirror.css mirror-toast-out)
const HIDE_FADE_MS = 350; // a hidden look fades out before it leaves the ring (mirror.css ring-leave)

/** toast (Thread 140:144): an optional icon, a short message, one action and optional extra actions under it (the hide
 *  reasons, Figma 216:1373); type default | negative | warning. Sits just above hide · heart. */
function Toast({ toast }) {
  if (!toast) return null;
  const type = toast.type && toast.type !== 'default' ? ` is-${toast.type}` : '';
  const extra = toast.extra?.length ? toast.extra : null;
  return (
    <div className={`ds-toast mirror-toast${type}${extra ? ' is-wide' : ''}${toast.leaving ? ' is-leaving' : ''}`} role={toast.type === 'negative' ? 'alert' : 'status'}>
      {toast.icon && <span className="ds-toast-lead"><Icon name={toast.icon} size={16} className="ds-toast-icon" /></span>}
      <div className="ds-toast-content">
        <div className="ds-toast-main">
          <span className="ds-toast-message">{toast.message}</span>
          {toast.action && <button type="button" className="ds-toast-action" onClick={toast.onAction}>{toast.action}</button>}
        </div>
        {extra && (
          <div className="ds-toast-extra" role="group" aria-label={toast.extraLabel || 'More actions'}>
            {extra.map((x) => <button key={x.label} type="button" className="ds-toast-action" onClick={x.onClick}>{x.label}</button>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** "Favorites" with nothing hearted yet (Figma 192:1750). */
/** Looks on their way and none to show yet (Figma 206:5722): illustration, "Making your looks", the wait. */
function MakingLooks() {
  return (
    <div className="mirror-empty is-making" role="status" aria-live="polite">
      <img src="/brand/making-looks.svg" width="120" height="140" alt="" />
      <div>
        <p className="mirror-making-title">Making your looks</p>
        <p>The first one takes about a minute.</p>
      </div>
    </div>
  );
}

/** No looks to show (Figma 206:5879): illustration, "No Party looks yet", a line, and the shutter. */
function NoLooks({ title, text, onShoot }) {
  return (
    <div className="mirror-empty is-none" role="status">
      <img src="/brand/no-looks.svg" width="222" height="142" alt="" />
      <div>
        <p className="mirror-making-title">{title}</p>
        <p>{text}</p>
      </div>
      {onShoot && <ShootButton onShoot={onShoot} compact />}
    </div>
  );
}

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

function ShootButton({ onShoot, compact = false }) {
  // No `capture` attribute on purpose: phones then offer their own menu (iPhone: Take Photo, Photo Library, Choose
  // File; Android: camera or gallery). With `capture` they open only the camera (2026-10-30, Felipe).
  // compact: the 40px shutter of the "No looks yet" state (Figma 206:6044).
  return (
    <label className={compact ? 'ds-button mirror-shutter' : 'ds-button mirror-shoot'} aria-label={compact ? 'Shoot your outfit' : undefined}>
      <Icon name="camera" size={20} />
      {!compact && <span>Shoot your outfit</span>}
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
  // After a new outfit photo starts looks for this tab: the making screen (no looks yet) or toast until the first new one arrives.
  const [awaiting, setAwaiting] = useState(null); // { tab, known: Set of look ids already there }
  const [leavingId, setLeavingId] = useState(null);   // the look fading out after "hide"
  const [arrivingId, setArrivingId] = useState(null); // the look that takes its place, fading in
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
  // "Shoot your outfit": the photo joins the wardrobe and is read on the next run (the morning looks, or a tester's
// instant looks, src/lib/plans.js).
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
      // Looks on their way: the making screen or toast says so; a note only for photo advice.
      setNote(r.queued ? (tip ? `Outfit added!${tip}` : null)
        : r.queueError ? `Outfit added! ${r.queueError}` : `Outfit added! It’ll be in your next looks.${tip}`);
      if (r.queued) {
        setSeason(SEASONS[0]);
        // Looks already on screen: they stay, and a toast says new ones are coming (Figma 210:6191) until one arrives.
        if (data?.tabs?.[occasion]?.looks?.length) setToast({ id: Date.now(), making: true, message: 'Making your new looks. The first one takes about a minute.', action: 'Dismiss', onAction: () => setToast(null) });
        setAwaiting({ tab: occasion, known: new Set((data?.tabs?.[occasion]?.looks || []).map((l) => l.id)) });
        setData((d) => ({ ...d, tabs: { ...d.tabs, [occasion]: { ...d.tabs[occasion], making: true } } }));
        refresh();
      }
      setData((d) => ({ ...d, outfitPhotos: (d.outfitPhotos || 0) + 1 }));
    } catch (e) { setNote(null); setProblem(e.message || 'Could not add the photo'); }
  }, [live, occasion, refresh, data]);
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

  // The making screen after a new outfit ends when a new look arrives or that tab's looks are done.
  useEffect(() => {
    if (!awaiting || !data) return;
    const t = data.tabs[awaiting.tab];
    if (t?.making && !t.looks.some((l) => !awaiting.known.has(l.id))) return;
    setAwaiting(null);
    setToast((x) => (x?.making ? { ...x, leaving: true } : x)); // the "making" toast leaves once a new look is in
    // Done without a new look: say why (out of credit, nothing suited the occasion…), not just the old looks again.
    if (!t?.making && t?.failed) setToast({ id: Date.now(), type: 'negative', icon: 'alert-triangle', message: `Couldn’t make looks with your new outfit. ${t.failed}`, action: 'Dismiss', onAction: () => setToast(null) });
  }, [data, awaiting]);
  // Toasts leave after ~5 s (the "making" one when a look arrives); a new one replaces the last.
  useEffect(() => {
    if (!toast) return undefined;
    if (toast.making && !toast.leaving) return undefined; // stays until a new look arrives or Dismiss
    if (toast.leaving) { const t = setTimeout(() => setToast(null), TOAST_OUT_MS); return () => clearTimeout(t); }
    const t = setTimeout(() => setToast((x) => (x && x.id === toast.id ? { ...x, leaving: true } : x)), toast.ms || TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const mark = useCallback((id, action, extra = {}) => {
    if (!live) return; // the preview account keeps hearts and hides on this page only
    // Before migration 007 runs the server can't keep them; they still hold until the page reloads.
    const p = fetch('/api/looks/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) })
      .catch(() => null).finally(() => pending.current.delete(p));
    pending.current.add(p);
  }, [live]);
  const toggleFavorite = (look) => {
    const on = !isFav(look);
    setHearts((m) => new Map(m).set(look.id, on));
    mark(look.id, on ? 'favorite' : 'unfavorite');
    setToast(on ? { id: Date.now(), icon: 'check-circle', message: 'Added to favourites', action: 'View', onAction: () => { setToast(null); pickSeason('Favorites'); } } : null);
  };
  const hide = (look) => {
    if (leavingId) return;
    const combo = comboOf(look);
    // The look fades out where it stands, then leaves the ring; the next one takes its place and fades in.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setLeavingId(look.id);
    const next = outfits.filter((o) => comboOf(o) !== combo);
    setTimeout(() => {
      setHidden((h) => new Set(h).add(combo));
      setLeavingId(null);
      const arriving = next.length ? next[wrap(index, next.length)] : null;
      setArrivingId(arriving?.id || null);
      setTimeout(() => setArrivingId(null), 400);
    }, reduce ? 0 : HIDE_FADE_MS);
    mark(look.id, 'hide');
    // Why (Figma 216:1373, optional): too warm / too cold tune the person's season filters; not my style is kept for
    // the stylist. One tap swaps in a thank-you (216:1496). The toast stays longer, since it asks something.
    const because = (reason) => () => {
      mark(look.id, 'reason', { reason, filter, occasion });
      setToast({ id: Date.now(), icon: 'check-circle', message: 'Thanks. You’ll see fewer looks like this.' });
    };
    setToast({ id: Date.now(), ms: HIDE_TOAST_MS, icon: 'eye-off', message: 'Look hidden. What was off?', action: 'Undo', onAction: () => {
      setToast(null);
      setHidden((h) => { const n = new Set(h); n.delete(combo); return n; });
      mark(look.id, 'unhide');
    }, extraLabel: 'Why you hid it', extra: [
      { label: 'Too warm', onClick: because('too_warm') },
      { label: 'Too cold', onClick: because('too_cold') },
      { label: 'Not my style', onClick: because('not_my_style') },
    ] });
  };

  // The server renders with its own clock; the browser corrects it to the viewer's time right after it loads.
  const shown = now || new Date();
  const count = outfits.length;
  const current = wrap(index, count);
  const go = (delta) => setIndex((i) => wrap(i + delta, count));
  // One dot per look (Felipe, 2026-11-01); the dots get smaller as the count grows so up to 40 fit a phone row.
  const density = count > 24 ? ' is-tiny' : count > 12 ? ' is-dense' : '';
  // The making screen: a tab with nothing to show yet while looks are made, or right after a new outfit photo.
  // The making screen only when the tab has nothing to show yet (Figma 206:5722); with looks there, a toast says so (210:6191).
  const showMaking = live && today_ && data.hasBase && tab.making && !count;
  const front = count && !showMaking ? outfits[current] : null;
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
    <div className={`mirror${(note || (problem && count > 0) || (!note && count <= 1 && more > 0)) ? ' has-note' : ''}`}>
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
            {count > 1 && !showMaking && <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(-1)} aria-label="Previous outfit"><Icon name="arrow-left" size={20} /></button>}
            {showMaking ? <MakingLooks />
              : count ? <OutfitRing key={`${occasion}|${filter}`} outfits={outfits} index={current} onChange={setIndex} onOpen={(i) => setViewing(outfits[i])} leavingId={leavingId} arrivingId={arrivingId} />
              : favoritesView && !loading && !problem ? <NoFavorites onBack={() => pickSeason(SEASONS[0])} />
              : live && tab?.loading ? <div className="mirror-empty" role="status"><p>Loading…</p></div>
              : live && data.hasBase ? <NoLooks title={today_ && tab.failed ? `Couldn’t make your ${occasion} looks` : today_ ? `No ${occasion} looks yet` : `No ${season} ${occasion} looks yet`}
                  text={problem || (today_ && tab.failed) || 'Shoot your first outfit.'} onShoot={onShoot} />
              : (
              <div className="mirror-empty" role="status">
                <p>{!live ? 'No looks left here. Reload the page to see them again.' : 'Add your photos to see yourself in your own clothes.'}</p>
              </div>
            )}
            {count > 1 && !showMaking && <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(1)} aria-label="Next outfit"><Icon name="arrow-right" size={20} /></button>}
          </div>
          {(note || (problem && count > 0)) && <p className="mirror-note" role="status">{note || problem}</p>}
          {!note && count <= 1 && more > 0 && <p className="mirror-nudge">Add {more} more outfit{more > 1 ? 's' : ''} for new looks every day</p>}
          {/* hide · heart with the pager under them (Figma 191:1385); the toast sits just above. */}
          <div className="mirror-look-bar">
            <Toast key={toast?.id} toast={toast} />
            {front && (
              <div className="mirror-look-actions">
                <div className="mirror-look-buttons">
                  <button type="button" className="ds-icon-button is-large is-tertiary mirror-look-action" onClick={() => hide(front)} disabled={Boolean(leavingId)}
                    aria-label="Hide this look" title="Hide this look"><Icon name="eye-off" size={24} strokeWidth={5 / 3} /></button>
                  <button type="button" className="ds-icon-button is-large is-tertiary mirror-look-action" onClick={() => toggleFavorite(front)}
                    aria-pressed={isFav(front)} aria-label="Favorite" title={isFav(front) ? 'Remove from Favorites' : 'Save to Favorites'}>
                    <Icon name="heart" size={24} strokeWidth={5 / 3} /></button>
                </div>
                {count > 1 && (
                  <div className={'ds-pager' + density} role="group" aria-label="Choose an outfit">
                    {outfits.map((outfit, i) => (
                      <button key={outfit.id} type="button" className="ds-pager-dot" aria-current={i === current} aria-label={`Outfit ${i + 1} of ${count}`} onClick={() => setIndex(i)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
      {viewing && <LookViewer look={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
