// How warm a look is, against a temperature (Felipe, 2026-11-01: the season filters follow the typical temperature of
// the person's city in that season). Pure, shared by the server and the browser; tested in tests/warmth.test.js.
// Each garment gets a warmth level from what the pipeline's reader already wrote (category, description, season tag):
//   0 nothing to it (t-shirt, shorts, sandals) · 1 light (long sleeves, jeans, windbreaker) · 2 warm (hoodie, blazer,
//   boots) · 3 heavy (parka, wool coat). A look's warmth is the sum of what covers the body; shoes are judged apart.

const has = (re, d) => re.test(d);

/** Warmth 0–3 of one garment. */
export function garmentWarmth(x) {
  const d = String(x?.description || '').toLowerCase();
  let w;
  switch (x?.category) {
    case 'outerwear':
      w = has(/parka|puffer|down jacket|padded|quilted|overcoat|wool coat|shearling|sherpa|duffle|peacoat|winter|fur/, d) ? 3
        : has(/windbreaker|wind breaker|rain|shell|anorak|linen|kimono|overshirt|shacket|gilet|vest/, d) ? 1
        : has(/\bcoat\b/, d) ? 3 : 2; // blazer, jacket (denim, leather, bomber), cardigan, trench
      break;
    case 'top':
      w = has(/hood|sweatshirt|sweater|jumper|knit|cardigan|fleece|turtleneck|roll[- ]neck|pullover/, d) ? 2
        : has(/long[- ]sleeve/, d) ? 1
        : has(/sleeveless|tank|cami|crop|strap|t-shirt|tee\b|short[- ]sleeve|polo|jersey/, d) ? 0
        : has(/shirt|blouse/, d) ? 1 : 0;
      break;
    case 'bottom':
      w = has(/shorts|skort|mini skirt/, d) ? 0 : has(/wool|corduroy|fleece|thermal|lined|flannel/, d) ? 2 : 1;
      break;
    case 'dress':
      w = has(/long[- ]sleeve|knit|wool|sweater/, d) ? 2 : has(/sleeveless|strap|slip|sundress|mini/, d) ? 0 : 1;
      break;
    case 'shoes':
      w = has(/sandal|flip[- ]flop|slide|espadrille|mule/, d) ? 0 : has(/snow|winter boot|shearling|lined boot/, d) ? 3 : has(/boot/, d) ? 2 : 1;
      break;
    default:
      return 0; // accessories
  }
  // The reader's own season tag wins where it is sure: cold-only is at least warm, warm-only is nothing to it.
  if (x.season === 'cold') w = Math.max(w, 2);
  if (x.season === 'warm') w = 0;
  return w;
}

/** { body, shoes }: the warmth of what covers the body (sum) and of the shoes (1 when the look has none). */
export function lookWarmth(items) {
  let body = 0, shoes = null;
  for (const x of items || []) {
    if (x.category === 'shoes') shoes = Math.max(shoes ?? 0, garmentWarmth(x));
    else body += garmentWarmth(x);
  }
  return { body, shoes: shoes ?? 1 };
}

/** The warmth a look may have at a typical daytime high of `high` °C: [min, max] for the body, max for the shoes, and
 *  whether open shoes are fine. Barcelona: summer ~28 (a tee and shorts or jeans), mid-season ~20 (up to a hoodie or a
 *  blazer), winter ~15 (long sleeves at least). */
export function warmthRange(high) {
  if (high >= 27) return { min: 0, max: 1, shoesMax: 1 };
  if (high >= 23) return { min: 0, max: 2, shoesMax: 1 };
  if (high >= 18) return { min: 0, max: 4, shoesMax: 2 };
  if (high >= 13) return { min: 2, max: 9, shoesMax: 3, shoesMin: 1 };
  if (high >= 8) return { min: 3, max: 9, shoesMax: 3, shoesMin: 1 };
  return { min: 4, max: 9, shoesMax: 3, shoesMin: 1 };
}

/** Is this look comfortable at a typical daytime high of `high` °C? Looks with no readable garments pass. */
export function fitsTemperature(items, high) {
  if (!Number.isFinite(high) || !(items || []).some((x) => x.category)) return true;
  const { body, shoes } = lookWarmth(items), r = warmthRange(high);
  return body >= r.min && body <= r.max && shoes <= r.shoesMax && shoes >= (r.shoesMin ?? 0);
}
