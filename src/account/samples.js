// Sample data for the local preview account (no Supabase), so Profile and Settings can be looked at in development.
import { WARDROBE_CATEGORIES } from '../lib/wardrobe.js';

export const SAMPLE_PROFILE = {
  name: 'Juliana Vasconi', email: 'preview@accing.local', avatar: null,
  stats: [{ label: 'Casual', count: 12 }, { label: 'Office', count: 25 }, { label: 'Dinner', count: 13 }, { label: 'Party', count: 6 }, { label: 'Favorites', count: 28, heart: true }],
  tiles: WARDROBE_CATEGORIES.map((c) => ({ ...c, count: 12 })),
};
const SAMPLES = ['look-1', 'look-2', 'look-4', 'look-5', 'look-8'];
const look = (n) => `/samples/${SAMPLES[n % SAMPLES.length]}.webp`;
export const SAMPLE_WARDROBE = (tile) => {
  const category = WARDROBE_CATEGORIES.find((c) => c.key === tile) || WARDROBE_CATEGORIES[0];
  return { category, items: Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, description: `${category.one} ${i + 1}`, looks: 2, image: look(i), position: 'center 28%' })) };
};
export const SAMPLE_HIDDEN = Array.from({ length: 6 }, (_, i) => ({ id: `00000000-0000-0000-0000-00000000000${i}`, image: look(i), alt: 'A look', hiddenAt: '2026-11-03T10:00:00Z' }));
export const SAMPLE_FACES = { current: { front: null, left: null, right: null }, fresh: { front: null, left: null, right: null }, preparing: false, failed: null, options: [] };
