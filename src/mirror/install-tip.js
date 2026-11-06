// "Add Accing to your Home Screen" (Felipe, 2026-11-06). iPhone has no install prompt a page can open, so there the
// tip explains Share → Add to Home Screen; Android Chrome offers its own install sheet (beforeinstallprompt), which
// the tip's button opens. Shown in the mirror only (never in onboarding), never when Accing already runs from the Home
// Screen, at most TIMES times, a week apart. Pure parts tested in tests/install-tip.test.js.
const KEY = 'accing-install-tip';
export const TIMES = 3;
export const GAP_DAYS = 7;

/** 'ios' | 'android' | null (desktop, or a browser that can't add to the Home Screen). */
export function platformOf(ua = '', maxTouch = 0) {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouch > 1)) {
    return /FBAN|FBAV|Instagram|Line\/|GSA\//.test(ua) ? null : 'ios'; // in-app browsers can't add to the Home Screen
  }
  return /Android/.test(ua) ? 'android' : null;
}

/** Time to show the tip again? `seen`: { n, last } from storage. */
export function due(seen, now = Date.now()) {
  if (!seen) return true;
  if (seen.n >= TIMES) return false;
  return now - (seen.last || 0) >= GAP_DAYS * 864e5;
}

let deferred = null; // Android's install prompt, kept for the tip's button
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
}

export function installTip() {
  if (typeof window === 'undefined') return null;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return null;
  const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints || 0);
  if (!platform || (platform === 'android' && !deferred)) return null;
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } // no storage: never nag
  if (!due(seen)) return null;
  return {
    platform,
    markShown() { try { localStorage.setItem(KEY, JSON.stringify({ n: (seen?.n || 0) + 1, last: Date.now() })); } catch { /* ignore */ } },
    done() { try { localStorage.setItem(KEY, JSON.stringify({ n: TIMES, last: Date.now() })); } catch { /* ignore */ } },
    async install() { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice.catch(() => null); deferred = null; return r?.outcome === 'accepted'; },
  };
}
