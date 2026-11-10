// Where a hidden look is hidden (Figma 191:1465, 2026-11-06). "Not my style": everywhere, stored as the look's keys
// (src/mirror/seasons.js lookKeys). "Not for work" (or a casual day, dinner, party): only in that occasion tab, stored
// as "tab:<tab label>|<key>" in the same table (hidden_combinations.combo), so the same garments still show in the other
// tabs. Pure, and in src/lib so the worker has it too (Dockerfile.worker copies src/lib). Tested in tests/hide-scope.test.js.

/** Which occasion tab a look's or job's occasion text belongs to (morning jobs say "a relaxed weekend day" at weekends). */
export function tabFor(occasion) {
  const t = String(occasion || '').toLowerCase();
  if (/office|work/.test(t)) return 'Work';
  if (/dinner/.test(t)) return 'Dinner';
  if (/party/.test(t)) return 'Party';
  return 'Casual';
}

const PREFIX = 'tab:';
export const scopedKey = (tab, key) => `${PREFIX}${tab}|${key}`;
// Tabs renamed since a hide was stored ("Office day" → "Work", 2026-11-10): read under their new name.
const RENAMED = { 'Office day': 'Work' };
/** Every stored form of these keys hidden for one tab, old tab names included (for unhide). */
export function scopedEverywhere(keys, tabs) {
  const names = [...tabs, ...Object.keys(RENAMED)];
  return names.flatMap((t) => keys.map((k) => scopedKey(t, k)));
}
/** A stored combo with a renamed tab read under the tab's current name. */
export function currentCombo(combo) {
  const { tab, key } = scopeOf(combo); // scopeOf already reads a renamed tab under its new name
  return tab ? scopedKey(tab, key) : String(combo || '');
}

/** Is a look with these keys hidden in this tab: hidden everywhere, or hidden for this tab? */
export function hiddenIn(keys, tab, hidden) {
  return (keys || []).some((k) => hidden.has(k) || (tab && hidden.has(scopedKey(tab, k))));
}

/** A stored combo → { tab, key }: tab null when it is hidden everywhere. */
export function scopeOf(combo) {
  const c = String(combo || '');
  if (!c.startsWith(PREFIX)) return { tab: null, key: c };
  const bar = c.indexOf('|');
  if (bar < 0) return { tab: null, key: c };
  const tab = c.slice(PREFIX.length, bar);
  return { tab: RENAMED[tab] || tab, key: c.slice(bar + 1) };
}

/** The toast button for hiding a look from one tab (Felipe, 2026-11-06). */
export const NOT_FOR = { Work: 'Not for work', Casual: 'Not for a casual day', Dinner: 'Not for dinner', Party: 'Not for party' };
