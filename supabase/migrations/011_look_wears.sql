-- 011: "I wore this today" (the award button, Figma 191:1372 "Favorite, hide, and choose"), 2026-11-03. Safe to re-run.
-- Kept on look_views (migration 010), one row per garment combination: the last day the person wore it and how many
-- days they have. A worn look rests from Today's suggestions like a seen one (src/mirror/suggest.js).
-- Until this runs, the button still works on the page but isn't kept.

ALTER TABLE public.look_views ADD COLUMN IF NOT EXISTS last_worn DATE;
ALTER TABLE public.look_views ADD COLUMN IF NOT EXISTS worn_times INTEGER NOT NULL DEFAULT 0;
