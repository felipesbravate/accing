// Features that exist only while developing (next dev), not on accing.vercel.app. Next.js inlines NODE_ENV at build
// time, so production bundles don't even contain the switched-off branches' entry points.
/** Update face photos (Settings, Figma 297:3383): Felipe, 2026-11-06, "hide it for now, leave it only local". */
export const FACE_UPDATE = process.env.NODE_ENV !== 'production';
