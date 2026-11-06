// Only the mirror's first load streams behind this blank shell (the splash covers it). It lives in the (home) group so
// that changing pages elsewhere keeps the current screen up until the next one is ready (2026-11-06: a white screen
// flashed before every slide).
export default function Loading() { return <main style={{ minHeight: '100vh' }} aria-busy="true" />; }
