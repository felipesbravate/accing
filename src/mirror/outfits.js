// Placeholder recommendations (generated looks from image-test, Juliana run 2026-10-28T16-31-08) until generation and
// ranking are wired to Supabase. The first is the one shown in the centre when the mirror opens.
export const SAMPLE_OUTFITS = [
  { id: 'look-5', image: '/samples/look-5.webp', alt: 'Light blue racer tank, black high-waisted jeans and black strappy sandals' },
  { id: 'look-8', image: '/samples/look-8.webp', alt: 'Generated outfit, look 8' },
  { id: 'look-2', image: '/samples/look-2.webp', alt: 'Generated outfit, look 2' },
  { id: 'look-4', image: '/samples/look-4.webp', alt: 'Generated outfit, look 4' },
  { id: 'look-1', image: '/samples/look-1.webp', alt: 'Generated outfit, look 1' },
];

// "Today's suggestions" is the default: looks for today's weekday and weather. The others override the season.
export const SEASONS = ["Today's suggestions", 'Summer', 'Mid-season', 'Winter', 'All'];
export const OCCASIONS = ['Casual', 'Office day', 'Dinner', 'Party'];
