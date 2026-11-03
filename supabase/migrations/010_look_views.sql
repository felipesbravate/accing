-- 010: which looks the person has seen, and when (Today's suggestions, src/mirror/suggest.js), 2026-11-03. Safe to re-run.
-- A look counts as seen when it was the front look of Today's suggestions for a moment. Today's suggestions then show
-- looks made today, never seen, or not seen for 7 days, at most 5 per tab. combo: the look's garment wording key
-- (src/mirror/suggest.js seenKey), so the same garments from a duplicate photo count as the same look.
-- Until this runs, nothing counts as seen: Today's suggestions show the 5 newest looks that suit today's weather.

CREATE TABLE IF NOT EXISTS public.look_views (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  combo      TEXT NOT NULL CHECK (length(combo) BETWEEN 1 AND 2000),
  outfit_id  UUID REFERENCES public.outfits(id) ON DELETE SET NULL, -- the look last seen with these garments
  last_seen  DATE NOT NULL,
  times      INTEGER NOT NULL DEFAULT 1, -- days it was seen
  PRIMARY KEY (user_id, combo)
);

ALTER TABLE public.look_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own views read" ON public.look_views;
DROP POLICY IF EXISTS "own views add" ON public.look_views;
DROP POLICY IF EXISTS "own views update" ON public.look_views;
CREATE POLICY "own views read" ON public.look_views FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own views add" ON public.look_views FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own views update" ON public.look_views FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
