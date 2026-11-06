// The mirror's first load streams behind this (the splash covers it when Accing opens from the home screen): the
// mirror's shape in skeleton bars and silhouettes (src/mirror/Skeleton.jsx). It lives in the (home) group so that
// changing pages elsewhere keeps the current screen up until the next one is ready (2026-11-06: a white screen
// flashed before every slide).
import { MirrorSkeleton } from '../../src/mirror/Skeleton.jsx';
import '../../src/ui/components.css';
import '../../src/mirror/mirror.css';

export default function Loading() { return <MirrorSkeleton />; }
