'use client';
// Daily Mirror. Figma file 5evySGmkwmI2tXSjSSezwH: desktop "Daily Mirror — Desktop" (116:2311),
// mobile below 1024px "Daily Mirror - Mobile" (145:1617). One markup; mirror.css lays it out per breakpoint.
// Desktop: season filter-items + occasion menu column, arrows. Mobile: occasion tabs + season dropdown, swipe,
// and a bottom bar with "Shoot your outfit" and the avatar. The looks turn on a ring (OutfitRing.jsx).
// Under the front look: hide · heart · worn, then the pager (Figma "Favorite, hide, and choose", 191:1372). Hiding takes
// the look's garment combination out of the mirror for good, with Undo; hearted looks come back under the "Favorites"
// filter; "worn" marks the look as worn today. The same three, plus share, run down the full-screen viewer (253:8207).
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '../ui/Icon.jsx';
import { useSlideIn } from '../ui/slide.js';
import { MobileMenu, Modal, Pager, ToastView } from '../ui/kit.jsx';
import { installTip } from './install-tip.js';
import { Logo } from '../ui/Logo.jsx';
import { wrap } from './carousel.js';
import { dayLine, isNight, timeLine, vibeQuestion } from './greeting.js';
import LookViewer from './LookViewer.jsx';
import { LookActions } from './LookActions.jsx';
import OutfitRing from './OutfitRing.jsx';
import { RingSkeleton } from './Skeleton.jsx';
import { ALL_OUTFITS, defaultTab, MENU_TABS, mergeTabs, weatherIcon } from './occasions.js';
import { hiddenIn, NOT_FOR, scopedKey } from '../lib/hide-scope.js';
import { SAMPLE_OUTFITS } from './outfits.js';
import { SEASON_FILTERS, seasonKey } from './seasons.js';

const SEASONS = SEASON_FILTERS.map((f) => f.label);

const OCCASIONS = MENU_TABS.map((t) => t.label); // "All outfits" first (Figma 226:2208)
const POLL_MS = 5000;
import '../ui/components.css';
import './mirror.css';

const TOAST_MS = 5000; // Figma toast: "Shows for ~5 s"
const HIDE_TOAST_MS = 8000; // the hide toast asks why: a little longer to read and tap
const TOAST_OUT_MS = 250; // its exit animation (mirror.css mirror-toast-out)
const SEEN_MS = 1500; // a look at the front of Today's suggestions this long counts as seen
const MAX_PICK = 20; // photos per pick: each makes ~3 looks; the plan's daily limit applies too (src/lib/plans.js)
const HIDE_FADE_MS = 350; // a hidden look fades out, with the hide button (mirror.css is-leaving)…
const HIDE_ROLL_MS = 550; // …then the look on its right rolls into its place

/** The mirror's toasts sit just above hide · heart, one or two at once (Figma 429:5205: `toast.above` sits on top). */
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`ds-toast-stack mirror-toast${toast.leaving ? ' is-leaving' : ''}`}>
      {toast.above && <ToastView toast={toast.above} />}
      <ToastView toast={toast} />
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
      <img src="/brand/no-favorites.svg" width="140" height="96" alt="" />
      <div>
        <h2>No favorites yet</h2>
        <p>Tap the heart on a look you love. It comes back here, ready to wear again.</p>
      </div>
      <button type="button" className="mirror-link" onClick={onBack}>See today’s suggestions</button>
    </div>
  );
}

/** avatar (Figma "avatar": Image, else Default with the initial): opens the Profile (268:11591), where Log out is. */
function Account({ initial, avatar }) {
  return (
    <Link className="ds-avatar mirror-avatar" href="/profile" prefetch aria-label="Profile">
      {avatar ? <img src={avatar} alt="" /> : <span aria-hidden="true">{initial}</span>}
    </Link>
  );
}

function ShootButton({ onShoot, compact = false }) {
  // No `capture` attribute on purpose: phones then offer their own menu (iPhone: Take Photo, Photo Library, Choose
  // File; Android: camera or gallery). With `capture` they open only the camera (2026-10-30, Felipe).
  // compact: the 40px shutter of the "No looks yet" state (Figma 206:6044). `multiple`: several photos from the library
  // at once (the camera still takes one).
  return (
    <label className={compact ? 'ds-button mirror-shutter' : 'ds-button mirror-shoot'} aria-label={compact ? 'Shoot your outfit' : undefined}>
      <Icon name="camera" size={20} />
      {!compact && <span>Shoot your outfit</span>}
      <input className="visually-hidden" type="file" accept="image/*" multiple
        onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onShoot(files); }} />
    </label>
  );
}

/** today: the signed-in person's looks from the server ({ tabs, temperature, hasBase }), or null for the sample looks
 *  (local preview). Picking a tab with no looks yet asks the worker for some; while any are being made the mirror asks
 *  the server again every few seconds, and each look joins the ring as soon as it's ready. */
export default function DailyMirror({
  name = '', today = null, temperature = '24º', avatar = null,
}) {
  const [now, setNow] = useState(null); // set on the client, so the time is the viewer's own
  const [index, setIndex] = useState(0);
  const [season, setSeason] = useState(SEASONS[0]);
  const [occasion, setOccasionState] = useState(ALL_OUTFITS); // the mirror opens on All outfits (Figma 226:2208)
  const all = occasion === ALL_OUTFITS;
  // Looks are made for an occasion: from All outfits, for today's default one (office on weekdays, casual at weekends).
  const askTab = all ? defaultTab() : occasion;
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

  // Hearts and hides change on screen at once; the server is told in the background (POST /api/looks/mark).
  const [hearts, setHearts] = useState(() => new Map()); // look id → hearted, for changes made on this page
  // Garment combinations hidden on this page: a look's keys (hidden everywhere), or "tab:<tab>|<key>" (hidden for that
  // occasion only, "Not for work"; src/lib/hide-scope.js).
  const [hidden, setHidden] = useState(() => new Set());
  const comboOf = (o) => o.combo || o.id;
  const keysOf = (o) => (o.keys?.length ? o.keys : [comboOf(o)]); // by photos and by wording (seasons.js lookKeys)
  // Each tab without what was hidden in it, before All outfits merges them (a look hidden "not for work" still shows
  // there through its Casual copy). Every look knows its tab, for the toast's "Not for …".
  const tabsNow = live ? (today_ ? data.tabs : seasonTabs) : null;
  const shownTabs = tabsNow && Object.fromEntries(Object.entries(tabsNow).map(([t, v]) => [t, { ...v,
    looks: (v.looks || []).filter((o) => !hiddenIn(keysOf(o), t, hidden)).map((o) => (o.tab === t ? o : { ...o, tab: t })) }]));
  const tab = !live ? null : !shownTabs ? { looks: [], making: false, loading: true } : all ? mergeTabs(shownTabs) : shownTabs[occasion] || { looks: [], making: false };
  const [toast, setToast] = useState(null);
  const [installHelp, setInstallHelp] = useState(false), [tipOffer, setTipOffer] = useState(null);
  // After a new outfit photo starts looks for this tab: the making screen (no looks yet) or toast until the first new one arrives.
  const [awaiting, setAwaiting] = useState(null); // { tab, known: Set of look ids already there }
  const rootRef = useRef(null);
  useSlideIn(rootRef, { onlyBack: true }); // back from Profile: the mirror comes in from the left
  const [rolling, setRolling] = useState(false);      // the next look rolling into a hidden one's place
  const [leavingId, setLeavingId] = useState(null);   // the look fading out after "hide"
  const [arrivingId, setArrivingId] = useState(null); // the look that takes its place, fading in
  const pending = useRef(new Set()); // marks still on their way, so a Favorites fetch waits for them
  const queue = useRef(Promise.resolve());
  const isFav = (o) => (hearts.has(o.id) ? hearts.get(o.id) : Boolean(o.favorite));
  const [wears, setWears] = useState(() => new Map()); // look id → worn today, for changes made on this page
  const isWorn = (o) => (wears.has(o.id) ? wears.get(o.id) : Boolean(o.worn));
  const lookTab = (o) => o.tab || askTab;
  const outfits = (live ? tab.looks : SAMPLE_OUTFITS.filter((o) => !hiddenIn(keysOf(o), askTab, hidden)))
    .filter((o) => !favoritesView || isFav(o));
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
  // One photo or many at once (the photo library allows several; 2026-11-02, Felipe). They go up one after another,
  // each making its own looks; the toast and making screen behave as for one.
  const onShoot = useCallback(async (picked) => {
    if (!live) return;
    const files = [...(picked?.length !== undefined ? picked : [picked])].filter(Boolean).slice(0, MAX_PICK);
    if (!files.length) return;
    const many = files.length > 1;
    setProblem(null);
    let queued = 0, added = 0, leftOut = 0, firstError = null, queueError = null;
    try {
      const { fileToJpeg } = await import('../onboarding/resize.js');
      for (const [n, file] of files.entries()) {
        setNote(many ? `Adding your outfits… ${n + 1} of ${files.length}` : 'Adding your outfit…');
        try {
          const form = new FormData();
          form.append('kind', 'outfit'); form.append('tab', askTab); form.append('photo', await fileToJpeg(file), 'outfit.jpg');
          const res = await fetch('/api/onboarding/photo', { method: 'POST', body: form });
          const r = await res.json().catch(() => ({}));
          if (r.error) { firstError = firstError || (many ? `Photo ${n + 1}: ${r.error}` : r.error); continue; }
          if (r.leftOut) { leftOut += 1; continue; } // more than one person: not in the wardrobe
          added += 1;
          if (r.queued) queued += 1;
          if (r.queueError) queueError = r.queueError;
        } catch (e) { firstError = firstError || (many ? `Photo ${n + 1}: ${e.message || 'could not be added'}` : (e.message || 'Could not add the photo')); }
      }
    } catch (e) { firstError = firstError || e.message || 'Could not add the photo'; }
    setNote(null);
    // What happened, as toasts (Figma 429:5241 added, 429:5170 / 429:5205 left out, 432:3785 failed): a warning for
    // photos left out, with the "added" toast on top of it when some went in (429:5205).
    const reopen = () => { setToast(null); document.querySelector('.mirror-shoot input')?.click(); };
    if (firstError) console.warn('Adding outfit photos:', firstError);
    if (!added && !leftOut) { setToast({ id: Date.now(), type: 'negative', message: 'Something went wrong.', action: 'Try again', onAction: reopen, ms: HIDE_TOAST_MS }); return; }
    const addedToast = added ? { message: `${added === 1 ? 'Outfit' : `${added} outfits`} added!${queued || queueError ? '' : ` ${added === 1 ? 'It’ll be' : 'They’ll be'} in your next looks.`}` } : null;
    const leftToast = leftOut ? { type: 'warning', action: leftOut === 1 ? 'Retake photo' : 'Retake photos', onAction: reopen,
      message: leftOut === 1 ? 'This photo has more than one person, so we left it out to keep someone else’s clothes out of your looks.'
        : `${leftOut} photos have more than one person, so we left them out to keep someone else’s clothes out of your looks.` } : null;
    const limitToast = queueError ? { type: 'warning', message: queueError } : null;
    const main = leftToast || limitToast || addedToast;
    if (main) setToast({ id: Date.now(), ms: leftToast ? HIDE_TOAST_MS : undefined, ...main, above: main === addedToast ? null : addedToast });
    if (!added) return;
    if (queued) {
      setSeason(SEASONS[0]);
      // Looks already on screen: they stay, and a toast says new ones are coming (Figma 210:6191) until one arrives.
      // …unless a warning about a left-out photo is showing: that one stays, and the ring shows the new looks as they come.
      if (tab?.looks?.length && !leftOut && !queueError) setToast({ id: Date.now(), making: true, icon: 'pen-tool', message: 'Making your new looks. The first one takes about a minute.', above: addedToast });
      setAwaiting({ tab: askTab, known: new Set((data?.tabs?.[askTab]?.looks || []).map((l) => l.id)) });
      setData((d) => ({ ...d, tabs: { ...d.tabs, [askTab]: { ...d.tabs[askTab], making: true } } }));
      refresh();
    }
    setData((d) => ({ ...d, outfitPhotos: (d.outfitPhotos || 0) + added }));
  }, [live, askTab, refresh, data, tab]);
  const setOccasion = (label) => {
    setOccasionState(label); setIndex(0);
    if (label === ALL_OUTFITS) { if (live && today_ && data.hasBase && !mergeTabs(data.tabs).looks.length && !mergeTabs(data.tabs).making) ask(defaultTab()); return; }
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
  useEffect(() => { if (live && data.hasBase && !tab.looks.length && !tab.making) ask(askTab); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The making screen after a new outfit ends when a new look arrives or that tab's looks are done.
  useEffect(() => {
    if (!awaiting || !data) return;
    const t = data.tabs[awaiting.tab];
    if (t?.making && !t.looks.some((l) => !awaiting.known.has(l.id))) return;
    setAwaiting(null);
    setToast((x) => (x?.making ? { ...x, leaving: true } : x)); // the "making" toast leaves once a new look is in
    // Done without a new look: say why (out of credit, nothing suited the occasion…), not just the old looks again.
    if (!t?.making && t?.failed) setToast({ id: Date.now(), type: 'negative', message: `Couldn’t make looks with your new outfit. ${t.failed}`, action: 'Try again', onAction: () => { setToast(null); ask(awaiting.tab); }, ms: HIDE_TOAST_MS });
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
    // One after another: a reason ("Not for work") must reach the server after the hide it narrows.
    const send = () => fetch('/api/looks/mark', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action, ...extra }) }).catch(() => null);
    const p = (queue.current = queue.current.then(send)).finally(() => pending.current.delete(p));
    pending.current.add(p);
  }, [live]);
  const toggleFavorite = (look) => {
    const on = !isFav(look);
    setHearts((m) => new Map(m).set(look.id, on));
    mark(look.id, on ? 'favorite' : 'unfavorite');
    setToast(on ? { id: Date.now(), message: 'Added to favorites.' } : null); // Figma 191:1419
  };
  // "I wore this" (the award button, Figma 191:1372 "Favorite, hide, and choose"): marks the look as worn today, from
  // any filter. A worn look rests from Today's suggestions like a seen one (suggest.js). Tap again (or Undo) to take it back.
  const toggleWorn = (look) => {
    const on = !isWorn(look);
    setWears((m) => new Map(m).set(look.id, on));
    mark(look.id, on ? 'wore' : 'unwore');
    setToast(on ? { id: Date.now(), message: 'Good choice! Marked as worn today.' } : null); // Figma 192:1652; tap the medal again to undo
  };
  const hide = (look) => {
    if (leavingId) return;
    const keys = keysOf(look);
    const same = (o) => keysOf(o).some((k) => keys.includes(k));
    // Felipe, 2026-11-06: the look fades out together with the hide button; once both are gone, the look waiting on
    // the right rolls into the empty place (the hidden one, invisible, turns away to the left), then leaves the list.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const at = wrap(index, outfits.length);
    const next = outfits.filter((o) => !same(o));
    const after = outfits.slice(at + 1).concat(outfits.slice(0, at)).find((o) => !same(o)) || null; // the one on its right
    let narrowed = false; // "Not for …" tapped before the animation ended: hide it for that occasion only
    const done = () => {
      if (!narrowed) setHidden((h) => new Set([...h, ...keys]));
      setLeavingId(null);
      if (!after) return;
      const i = next.indexOf(after);
      setIndex(i);
      // The look that was two places left now steps in on the left, where the hidden one turned away: fade it in.
      const left = next.length > 2 ? next[wrap(i - 1, next.length)] : null;
      if (left) { setArrivingId(left.id); setTimeout(() => setArrivingId(null), 400); }
    };
    setLeavingId(look.id);
    if (reduce || !after) setTimeout(done, reduce ? 0 : HIDE_FADE_MS);
    else {
      setTimeout(() => {
        setRolling(true);
        setIndex(outfits.indexOf(after)); // the ring turns it to the front
        setTimeout(() => { setRolling(false); done(); }, HIDE_ROLL_MS);
      }, HIDE_FADE_MS);
    }
    mark(look.id, 'hide');
    // Why (Figma 191:1465, optional, Felipe 2026-11-06): "Not for work" (or a casual day, dinner, party: the look's own
    // occasion) narrows the hide to that tab, so the same garments come back in the others; "Not my style" keeps it
    // hidden everywhere. One tap swaps in a thank-you. The toast stays longer, since it asks something.
    const its = lookTab(look);
    const scoped = keys.map((k) => scopedKey(its, k));
    const notFor = () => {
      narrowed = true;
      setHidden((h) => { const n = new Set(h); keys.forEach((k) => n.delete(k)); scoped.forEach((k) => n.add(k)); return n; });
      mark(look.id, 'reason', { reason: 'not_for_occasion', filter, occasion: its });
      setToast({ id: Date.now(), message: 'Thanks. It stays in your other outfits.' });
    };
    const notMyStyle = () => {
      mark(look.id, 'reason', { reason: 'not_my_style', filter, occasion: its });
      setToast({ id: Date.now(), message: 'Thanks. You’ll see fewer looks like this.' }); // Figma 253:9400
    };
    // Figma 191:1465: no icon; Undo leads the row of buttons, then the two reasons (Felipe, 2026-11-06).
    const undo = () => {
      setToast(null);
      setHidden((h) => { const n = new Set(h); [...keys, ...scoped].forEach((k) => n.delete(k)); return n; });
      mark(look.id, 'unhide');
    };
    setToast({ id: Date.now(), ms: HIDE_TOAST_MS, icon: null, message: 'Outfit hidden. Why wasn’t it a match?', extraLabel: 'Undo, or why you hid it', extra: [
      { label: 'Undo', onClick: undo },
      { label: NOT_FOR[its] || `Not for ${its.toLowerCase()}`, onClick: notFor },
      { label: 'Not my style', onClick: notMyStyle },
    ] });
  };

  // The server renders with its own clock; the browser corrects it to the viewer's time right after it loads.
  const shown = now || new Date();
  const count = outfits.length;
  const current = wrap(index, count);
  const go = (delta) => setIndex((i) => wrap(i + delta, count));
  // "Add to Home Screen" (install-tip.js): once looks are on screen, a few seconds in, when nothing else is said.
  const tipChecked = useRef(false);
  useEffect(() => {
    if (tipChecked.current || !count || toast || viewing) return undefined; // not over a toast or an open look
    const t = setTimeout(() => {
      tipChecked.current = true;
      const tip = installTip();
      if (!tip) return;
      tip.markShown();
      setTipOffer(tip);
    }, 4000);
    return () => clearTimeout(t);
  }, [count, toast, viewing]);
  // The looks above and below the one open full screen: the ones on its left and right in the ring.
  const neighbour = (d) => {
    const i = viewing ? outfits.findIndex((o) => o.id === viewing.id) : -1;
    return i >= 0 && outfits.length > 1 ? outfits[wrap(i + d, outfits.length)] : null;
  };
  // One dot per look (Felipe, 2026-11-01); the dots get smaller as the count grows so up to 40 fit a phone row.
  // The making screen: a tab with nothing to show yet while looks are made, or right after a new outfit photo.
  // The making screen only when the tab has nothing to show yet (Figma 206:5722); with looks there, a toast says so (210:6191).
  const showMaking = live && today_ && data.hasBase && tab.making && !count;
  const front = count && !showMaking ? outfits[current] : null;
  // Today's suggestions remember what was seen (a look at the front for 1.5 s), so tomorrow brings others (suggest.js).
  const seenSent = useRef(new Set());
  const frontId = today_ && front ? front.id : null;
  useEffect(() => {
    if (!frontId || seenSent.current.has(frontId)) return undefined;
    const t = setTimeout(() => { seenSent.current.add(frontId); mark(frontId, 'seen'); }, SEEN_MS);
    return () => clearTimeout(t);
  }, [frontId, mark]);
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
            <div><h1>Your mirror is waiting</h1><p>To set up your mirror, take 3 face photos and a full-body outfit photo.</p></div>
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
    <div ref={rootRef} className={`mirror${(note || (problem && count > 0) || (!note && count <= 1 && more > 0)) ? ' has-note' : ''}`}>
      <header className="mirror-header">
        <Logo className="mirror-logo" />
        <div className="mirror-actions">
          <ShootButton onShoot={onShoot} />
          <Account initial={(name || '·').trim().charAt(0).toUpperCase()} avatar={avatar} />
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
                <button key={o} type="button" className="ds-menu-item" aria-current={occasion === o} onClick={() => setOccasion(o)}>{MENU_TABS.find((t) => t.label === o)?.short || o}</button>
              ))}
            </div>
          </nav>

          {/* Mobile: occasions as tabs, season as a dropdown. */}
          <div className="mirror-mobile-filters">
            <MobileMenu label="Occasion" items={OCCASIONS.map((o) => ({ value: o, label: o }))} value={occasion} onChange={setOccasion} />
            <label className="ds-filter-selector">
              <span>{season}</span>
              <Icon name="chevron-down" size={16} />
              <select aria-label="Season" value={season} onChange={(e) => pickSeason(e.target.value)}>
                {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
        </div>

        <section className="mirror-body" aria-roledescription="carousel" aria-label={`${all ? "All" : occasion} outfits, ${season}`}>
          <div className="mirror-carousel">
            {count > 1 && !showMaking && <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(-1)} aria-label="Previous outfit"><Icon name="arrow-left" size={20} /></button>}
            {showMaking ? <MakingLooks />
              : count ? <OutfitRing key={`${occasion}|${filter}`} outfits={outfits} index={current} onChange={setIndex} onOpen={(i) => setViewing(outfits[i])} leavingId={leavingId} arrivingId={arrivingId} turnMs={rolling ? HIDE_ROLL_MS : undefined} />
              : favoritesView && !loading && !problem ? <NoFavorites onBack={() => pickSeason(SEASONS[0])} />
              : live && tab?.loading ? <RingSkeleton />
              : live && data.hasBase ? <NoLooks title={today_ && tab.failed ? (all ? 'Couldn’t make your looks' : `Couldn’t make your ${occasion} looks`) : today_ ? (all ? 'No looks yet' : `No ${occasion} looks yet`) : (all ? `No ${season} looks yet` : `No ${season} ${occasion} looks yet`)}
                  text={problem || (today_ && tab.failed) || 'Shoot your first outfit.'} onShoot={onShoot} />
              : (
              <div className="mirror-empty" role="status">
                <p>{!live ? 'No looks left here. Reload the page to see them again.' : 'Add your photos to see yourself in your own clothes.'}</p>
              </div>
            )}
            {count > 1 && !showMaking && <button type="button" className="ds-round-button mirror-arrow" onClick={() => go(1)} aria-label="Next outfit"><Icon name="arrow-right" size={20} /></button>}
          </div>
          {(note || (problem && count > 0)) && <p className="mirror-note" role="status">{note || problem}</p>}
          {!note && count <= 1 && more > 0 && <p className="mirror-nudge">Add {more} more outfit{more > 1 ? 's' : ''} to unlock new looks every day</p>}
          {/* hide / heart / worn with the pager under them (Figma 226:2208); the toast sits right on top. */}
          <div className="mirror-look-bar">
            {!viewing && <Toast key={toast?.id} toast={toast} />}
            {front && (
              <div className="mirror-look-actions">
                <LookActions look={front} onHide={() => hide(front)} hiding={Boolean(leavingId)} favorite={isFav(front)}
                  onFavorite={() => toggleFavorite(front)} worn={isWorn(front)} onWear={() => toggleWorn(front)} />
                <Pager count={count} current={current} onPick={setIndex} label="Choose an outfit" itemLabel={(i) => `Outfit ${i + 1} of ${count}`} />
              </div>
            )}
          </div>
        </section>
      </main>
      {/* The tip (Figma 401:2867), then the iPhone steps (401:2900); Android opens Chrome's own install sheet. */}
      <Modal open={Boolean(tipOffer)} title="Add Accing to your Home Screen to open it like an app" onClose={() => setTipOffer(null)}>
        <button type="button" className="ds-button is-large" onClick={async () => {
          const tip = tipOffer; setTipOffer(null);
          if (tip?.platform === 'android') { if (await tip.install()) tip.done(); } else setTimeout(() => setInstallHelp(true), 240);
        }}>{tipOffer?.platform === 'android' ? 'Install' : 'Learn how'}</button>
      </Modal>
      <Modal open={installHelp} title="Add Accing to your Home Screen" onClose={() => setInstallHelp(false)}
        description="In Safari, open the Share menu (on iOS 26, tap ••• first), choose Add to Home Screen, then tap Add. Accing then opens full screen, like an app.">
        <button type="button" className="ds-button is-large" onClick={() => setInstallHelp(false)}>Got it</button>
      </Modal>
      {viewing && (
        <LookViewer look={viewing} prev={neighbour(-1)} next={neighbour(1)} onStep={(d) => { const i = wrap(outfits.findIndex((o) => o.id === viewing.id) + d, outfits.length); setViewing(outfits[i]); setIndex(i); }}
          pager={<Pager count={count} current={Math.max(0, outfits.findIndex((o) => o.id === viewing.id))} label="Choose an outfit" itemLabel={(i) => `Outfit ${i + 1} of ${count}`}
            onPick={(i) => { setViewing(outfits[i]); setIndex(i); }} />}
          onClose={() => setViewing(null)} hiding={Boolean(leavingId)} favorite={isFav(viewing)} worn={isWorn(viewing)}
          onFavorite={() => toggleFavorite(viewing)} onWear={() => toggleWorn(viewing)}
          onHide={() => { const look = viewing; setViewing(null); if (history.state?.lookViewer) history.back(); hide(look); }} toast={<Toast key={toast?.id} toast={toast} />} />
      )}
    </div>
  );
}
