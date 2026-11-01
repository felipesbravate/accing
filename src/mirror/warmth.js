// How warm a look is, against the weather of a season where the person lives (Felipe, 2026-11-01). Pure, shared by the
// server and the browser; tested in tests/warmth.test.js; tuned with scripts/season-labels.mjs (your own labels).
//
// Warmth is clothing insulation in clo, the standard unit. Each garment gets its ISO 9920 / ASHRAE 55 table value from
// what the pipeline's reader wrote (category, description, season tag); the look's insulation is ISO 9920's
//   Icl = 0.161 + 0.835 · Σ Iclu                       (underwear and socks included as UNDERWEAR)
// What people actually wear outdoors at an air temperature Ta (°C) comes from the UTCI clothing model, fitted on
// European field observations of light activity (Havenith et al. 2012, Int J Biometeorol 56:461, eq. 3; R² 0.85,
// standard error 0.16 clo; the data are mostly from Poland, the UK, Sweden and Finland, so a Mediterranean person may
// dress differently: that's what scripts/season-labels.mjs is for):
//   Icl(Ta) = 1.372 − 0.01866·Ta − 0.0004849·Ta² − 0.000009333·Ta³
// A look suits a day when its insulation is within TOLERANCE of that. A jacket comes off: a look with outerwear is
// judged with the jacket against the morning and without it against the afternoon.

/** The numbers scripts/season-labels.mjs tunes against your own labels. */
export const CALIBRATION = {
  tolerance: 0.2,    // clo either side of what people wear (the model's standard error is 0.16)
  share: 0.4,        // a look belongs to a season if it suits at least this share of its days
  morning: 0.4,      // morning temperature = low + morning × (high − low): what a jacket is for
  daytime: 0.7,      // daytime temperature = low + daytime × (high − low): what a look without a jacket is judged at
  minNeed: 0.35,     // nobody goes out in less than briefs, a tee, shorts, socks and shoes (≈0.35 clo)
  offset: 0,         // °C added to the weather before the model: negative dresses warmer (someone who runs cold)
};
const UNDERWEAR = 0.06; // briefs 0.04 + socks 0.02 (ISO 9920)

const has = (re, d) => re.test(d);

/** One garment's insulation in clo (Iclu, ISO 9920 / ASHRAE 55 tables). Accessories add nothing. */
export function garmentClo(x) {
  const d = String(x?.description || '').toLowerCase();
  const short = has(/short[- ]sleeve|sleeveless|tank|cami/, d), long = has(/long[- ]sleeve/, d);
  let clo;
  switch (x?.category) {
    case 'outerwear':
      clo = has(/parka|puffer|down jacket|down coat|padded|quilted|overcoat|wool coat|shearling|sherpa|duffle|peacoat|winter/, d) ? 0.6
        : has(/windbreaker|wind breaker|anorak|shell|rain jacket|raincoat|kimono/, d) ? 0.2
        : has(/gilet|vest/, d) ? 0.13
        : has(/linen|overshirt|shacket/, d) ? 0.25
        : has(/cardigan/, d) ? (has(/chunky|cable|wool|thick/, d) ? 0.36 : 0.25)
        : has(/blazer|suit jacket|sport coat/, d) ? (has(/wool|tweed|textured|thick/, d) ? 0.44 : 0.36)
        : has(/trench|mac\b/, d) ? 0.4
        : has(/\bcoat\b/, d) ? 0.6
        : 0.35; // jacket: denim, leather, bomber, fleece
      break;
    case 'top':
      clo = has(/hood|sweatshirt/, d) ? 0.34
        : has(/sweater|jumper|knit|pullover|turtleneck|roll[- ]neck|fleece/, d) ? (has(/chunky|cable|wool|thick|fleece/, d) ? 0.36 : 0.25)
        : has(/flannel/, d) ? 0.34
        : has(/sleeveless|tank|cami|crop|strap/, d) ? 0.06
        : has(/t-shirt|tee\b|jersey/, d) ? (long ? 0.15 : 0.08)
        : has(/shirt|blouse|henley|polo/, d) ? (short ? 0.17 : long ? 0.25 : 0.25)
        : long ? 0.2 : 0.1;
      break;
    case 'bottom':
      clo = has(/shorts|skort/, d) ? 0.06
        : has(/mini skirt/, d) ? 0.1
        : has(/skirt/, d) ? (has(/wool|thick|knit/, d) ? 0.23 : 0.14)
        : has(/sweatpant|jogger|fleece|corduroy|wool|flannel|thermal|lined/, d) ? 0.28
        : has(/linen|chino|lightweight/, d) ? 0.15
        : 0.24; // jeans, trousers, cargo
      break;
    case 'dress':
      clo = has(/knit|sweater|wool/, d) ? 0.47 : long ? 0.33 : has(/sleeveless|strap|slip|sundress|mini/, d) ? 0.23 : 0.29;
      break;
    case 'shoes':
      clo = has(/snow|winter boot|shearling|lined boot/, d) ? 0.15 : has(/boot/, d) ? 0.1 : 0.02; // sandals and shoes alike
      break;
    default:
      return 0;
  }
  // The reader's season tag, where it's sure: a cold-only top or bottom is at least a sweatshirt or heavy trousers.
  if (x.season === 'cold' && ['top', 'bottom'].includes(x.category)) clo = Math.max(clo, x.category === 'top' ? 0.34 : 0.28);
  return clo;
}

/** The ensemble's insulation (Icl, clo), with or without its outerwear. */
export function lookClo(items, { outer = true } = {}) {
  const sum = (items || []).filter((x) => outer || x.category !== 'outerwear').reduce((n, x) => n + garmentClo(x), 0);
  return 0.161 + 0.835 * (sum + UNDERWEAR);
}

/** What Europeans wear outdoors at air temperature ta (UTCI clothing model, eq. 3), never below a minimal outfit. */
export function neededClo(ta, cal = CALIBRATION) {
  const t = Math.max(-25, Math.min(40, ta + (cal.offset || 0)));
  return Math.max(cal.minNeed, 1.372 - 0.01866 * t - 0.0004849 * t * t - 0.000009333 * t ** 3);
}

const readable = (items) => (items || []).some((x) => ['top', 'bottom', 'dress', 'outerwear'].includes(x.category));

/** Does the look suit a day with this high and low (°C)? Without a jacket: what people wear in the daytime, give or
 *  take the tolerance. With one: the whole look suits the morning and, jacket off, it isn't too warm in the
 *  afternoon. */
export function fitsDay(items, { hi, lo }, cal = CALIBRATION) {
  if (!readable(items)) return true;
  const morning = lo + cal.morning * (hi - lo), daytime = lo + cal.daytime * (hi - lo), tol = cal.tolerance;
  const full = lookClo(items);
  if (!(items || []).some((x) => x.category === 'outerwear')) return Math.abs(full - neededClo(daytime, cal)) <= tol;
  const base = lookClo(items, { outer: false });
  return Math.abs(full - neededClo(morning, cal)) <= tol && base <= neededClo(hi, cal) + tol;
}

/** Share (0–1) of a season's typical days (climate days, src/lib/climate.js) the look suits. */
export function shareOfDays(items, days, cal = CALIBRATION) {
  if (!days?.length) return 1;
  return days.filter((d) => fitsDay(items, d, cal)).length / days.length;
}

/** Does the look belong to a season with these typical days? */
export function fitsDays(items, days, cal = CALIBRATION) {
  return shareOfDays(items, days, cal) >= cal.share - 1e-9;
}
