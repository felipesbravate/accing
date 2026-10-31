-- 007: favourite and hidden looks (Figma "Favorite & hide", 191:1372), 2026-10-31. Safe to re-run.
-- favorites: looks the person hearted; the "Favorites" season filter shows them again (the image is already made, so
-- seeing a favourite again costs nothing). hidden_combinations: garment combinations the person hid ("Look hidden.
-- You won't see it again."); combo is src/mirror/seasons.js comboKey(): the look's garment descriptions, lower case,
-- sorted, joined with " + ". The app leaves every look with a hidden combo out of the mirror, today's and earlier.
-- The worker doesn't read this table yet, so it can still make that combination again; the app then hides it.
-- Until this runs, the mirror still works: hearts and hides then last only until the page reloads.

CREATE TABLE IF NOT EXISTS public.favorites (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  outfit_id  UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, outfit_id)
);

CREATE TABLE IF NOT EXISTS public.hidden_combinations (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  combo      TEXT NOT NULL CHECK (length(combo) BETWEEN 1 AND 2000),
  outfit_id  UUID REFERENCES public.outfits(id) ON DELETE SET NULL, -- the look it was hidden from
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, combo)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hidden_combinations ENABLE ROW LEVEL SECURITY;

-- Each person reads and changes only their own rows. A favourite must point at one of their own looks.
DROP POLICY IF EXISTS "own favorites read" ON public.favorites;
DROP POLICY IF EXISTS "own favorites add" ON public.favorites;
DROP POLICY IF EXISTS "own favorites remove" ON public.favorites;
CREATE POLICY "own favorites read" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own favorites add" ON public.favorites FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.outfits o WHERE o.id = outfit_id AND o.user_id = auth.uid()));
CREATE POLICY "own favorites remove" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own hidden read" ON public.hidden_combinations;
DROP POLICY IF EXISTS "own hidden add" ON public.hidden_combinations;
DROP POLICY IF EXISTS "own hidden remove" ON public.hidden_combinations;
CREATE POLICY "own hidden read" ON public.hidden_combinations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own hidden add" ON public.hidden_combinations FOR INSERT WITH CHECK (
  auth.uid() = user_id AND (outfit_id IS NULL OR EXISTS (SELECT 1 FROM public.outfits o WHERE o.id = outfit_id AND o.user_id = auth.uid())));
CREATE POLICY "own hidden remove" ON public.hidden_combinations FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.favorites, public.hidden_combinations TO authenticated;
