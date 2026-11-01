-- 009: why a look was hidden (Figma 216:1373, "Look hidden. What was off?"), 2026-11-01. Safe to re-run.
-- reason: too_warm | too_cold | not_my_style, or null when the person didn't say (it's optional). context: what was on
-- screen when they hid it: {"filter": "today" | "summer" | "mid" | "winter" | "all" | "favorites", "occasion": "Casual"}.
-- users.warmth_offset (°C): each "too warm" adds 1 and each "too cold" takes 1 away, between -4 and 4. The season
-- filters add it to the weather before judging a look (src/mirror/warmth.js CALIBRATION.offset): someone who finds
-- looks too warm is shown lighter ones. "Not my style" is kept for the stylist; it doesn't change the offset.
-- Until this runs, hiding still works; the reason just isn't kept.

ALTER TABLE public.hidden_combinations
  ADD COLUMN IF NOT EXISTS reason TEXT CHECK (reason IN ('too_warm', 'too_cold', 'not_my_style')),
  ADD COLUMN IF NOT EXISTS context JSONB;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS warmth_offset REAL NOT NULL DEFAULT 0 CHECK (warmth_offset BETWEEN -4 AND 4);

-- The reason is added to the row the hide just made: people may update their own rows.
DROP POLICY IF EXISTS "own hidden update" ON public.hidden_combinations;
CREATE POLICY "own hidden update" ON public.hidden_combinations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
