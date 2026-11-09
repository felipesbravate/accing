'use client';
// Keeps the trail of pages visited in this tab, for the back arrows (src/ui/nav.js). Renders nothing.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { recordVisit } from './nav.js';

export default function NavTrail() {
  const path = usePathname();
  useEffect(() => { if (path) recordVisit(path); }, [path]);
  return null;
}
