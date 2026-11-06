// Onboarding step 4, "How do you express yourself?" (Figma 275:12737): up to 3 style identities. The list and what each
// means come from Felipe's "Onboarding Style Identities & Personality Archetypes" (Google Doc, 2026-11-06). Shared by
// the page (the tags), the server (what may be saved) and the stylist (what the person's taste looks like in clothes).
export const STYLE_IDENTITIES = [
  { tag: 'Classic & Timeless', look: 'clean silhouettes, neutral palettes, structured cuts, high-quality basic staples', sub: ['Minimalist', 'Capsule Wardrobe', 'Old Money', 'Scandinavian'] },
  { tag: 'Casual & Relaxed', look: 'low-maintenance layers, soft knits, easy-fit denim, utilitarian jackets', sub: ['Everyday Basic', 'Workwear', 'Normcore', 'Utilitarian'] },
  { tag: 'Streetwear & Urban', look: 'oversized fits, graphic elements, statement sneakers, modern athletic silhouettes', sub: ['Skatewear', 'Techwear', 'Hypebeast', 'Y2K Urban'] },
  { tag: 'Preppy & Polished', look: 'tailored blazers, crisp button-ups, structured trousers, neat pattern accents', sub: ['Smart Casual', 'Ivy League', 'Business Casual', 'Equestrian'] },
  { tag: 'Boho & Eclectic', look: 'flowing garments, rich woven textures, earthy tones, mixed prints, vintage accents', sub: ['Bohemian', 'Vintage', 'Artisanal', 'Cottagecore'] },
  { tag: 'Edgy & Alternative', look: 'darker palettes, leather, metal hardware, sharp cuts, distressed fabrics', sub: ['Punk', 'Goth', 'Rocker', 'Dark Academia'] },
  { tag: 'Glam & Trend-Forward', look: 'bold colours, high-impact tailoring, luxe fabrics, eye-catching accessories', sub: ['High Fashion', 'Night Out', 'Maximalist', 'Resort Luxe'] },
  { tag: 'Athleisure & Sporty', look: 'technical fabrics, sleek stretch materials, performance knits, functional cuts', sub: ['Sport Core', 'Gorpcore / Outdoor', 'Performance Casual'] },
  { tag: 'Expressive', look: 'rich fabric mixes (chunky knits, suede, corduroy, wool), tonal layering, draped volume, tactile depth over loud graphics', sub: ['Tactile Minimalist', 'Tonal Layering', 'Cozy Structure', 'Heritage Craft'] },
];
export const STYLES = STYLE_IDENTITIES.map((s) => s.tag);

/** For the stylist: "Classic & Timeless (clean silhouettes, …); Expressive (…)". Unknown tags are dropped. */
export function describeStyles(tags) {
  return (tags || []).map((t) => STYLE_IDENTITIES.find((s) => s.tag === t)).filter(Boolean).map((s) => `${s.tag} (${s.look})`).join('; ');
}
