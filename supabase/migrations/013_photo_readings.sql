-- 013: what the garment reader found in each outfit photo (2026-11-12). The Wardrobe used to know a garment only
-- through the looks made with it, so a sweater that suited none of the day's looks never showed up. The worker saves
-- each photo's reading here on every run ([{ category, description, box, formality, exposure, season }]); the
-- Wardrobe lists those garments even before a look uses them. Photos not read yet stay null until the next run.
ALTER TABLE public.wardrobe_photos
  ADD COLUMN IF NOT EXISTS items JSONB,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
