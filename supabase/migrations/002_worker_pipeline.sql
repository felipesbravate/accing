-- 002: what the image worker needs (2026-10-29). Safe to re-run.
-- The worker (worker/server.mjs, on Fly.io) uses the service role key: it bypasses RLS and claims jobs with
-- public.claim_generation_job(). Users only see and write their own rows and their own storage folder.
--
-- Storage layout (both buckets private):
--   wardrobe/<user id>/faces/front.jpg | left.jpg | right.jpg     the 3 face photos
--   wardrobe/<user id>/photos/<uuid>.jpg                          full-body outfit photos (one is the base source)
--   outfits/<user id>/base/<job id>/base-prepared-N.png          prepared base photos to pick from (worker)
--   outfits/<user id>/looks/<job id>/lookN.png                   finished looks (worker)

-- Who the person is, for the pipeline.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS face_front_path TEXT,
  ADD COLUMN IF NOT EXISTS face_left_path TEXT,
  ADD COLUMN IF NOT EXISTS face_right_path TEXT,
  ADD COLUMN IF NOT EXISTS base_source_path TEXT,      -- the full-body photo chosen as the base (wardrobe bucket)
  ADD COLUMN IF NOT EXISTS base_options JSONB,         -- [{ path, identity, best }] prepared tries to pick from (outfits bucket)
  ADD COLUMN IF NOT EXISTS base_path TEXT,             -- the picked prepared base photo (outfits bucket)
  ADD COLUMN IF NOT EXISTS body_note TEXT;             -- optional "height 170 cm, weight 52 kg"

-- Full-body photos of the person in their clothes; the worker reads the garments from them on every run.
CREATE TABLE IF NOT EXISTS public.wardrobe_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  path TEXT NOT NULL,                  -- wardrobe bucket
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  retake_hint TEXT,                    -- set by the worker when a garment in it keeps failing ("in daylight, …")
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wardrobe_photos_user_id ON public.wardrobe_photos(user_id);
ALTER TABLE public.wardrobe_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own wardrobe photos" ON public.wardrobe_photos;
CREATE POLICY "Users can view own wardrobe photos" ON public.wardrobe_photos FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can add own wardrobe photos" ON public.wardrobe_photos;
CREATE POLICY "Users can add own wardrobe photos" ON public.wardrobe_photos FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own wardrobe photos" ON public.wardrobe_photos;
CREATE POLICY "Users can update own wardrobe photos" ON public.wardrobe_photos FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own wardrobe photos" ON public.wardrobe_photos;
CREATE POLICY "Users can delete own wardrobe photos" ON public.wardrobe_photos FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Jobs: job_type 'prepare_base' (onboarding: make the base photos to pick from) or 'make_looks' (payload: occasion,
-- weather, looks, seed, date, daypart). status: pending → processing → completed | failed.
ALTER TABLE public.generation_jobs
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS cost NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_generation_jobs_pending ON public.generation_jobs(created_at) WHERE status = 'pending';

-- Looks: one row per look asked for, including the ones that were dropped or refused (so the app can say why).
ALTER TABLE public.outfits ALTER COLUMN generated_image_path DROP NOT NULL;
ALTER TABLE public.outfits
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.generation_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS look_n INT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready',   -- 'ready', 'dropped', 'refused', 'failed'
  ADD COLUMN IF NOT EXISTS items JSONB,                            -- garments: [{ description, category, photo }]
  ADD COLUMN IF NOT EXISTS reasons JSONB,                          -- why it was dropped or refused
  ADD COLUMN IF NOT EXISTS retake TEXT,                            -- "retake the photo of … in daylight"
  ADD COLUMN IF NOT EXISTS cost NUMERIC(10,4);
CREATE INDEX IF NOT EXISTS idx_outfits_job_id ON public.outfits(job_id);

-- The worker takes the oldest pending job, one at a time, without two workers ever taking the same one.
CREATE OR REPLACE FUNCTION public.claim_generation_job()
RETURNS SETOF public.generation_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  UPDATE public.generation_jobs j
     SET status = 'processing', started_at = now(), attempts = j.attempts + 1
   WHERE j.id = (SELECT id FROM public.generation_jobs
                  WHERE status = 'pending'
                  ORDER BY created_at
                  LIMIT 1
                  FOR UPDATE SKIP LOCKED)
  RETURNING j.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_generation_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_job() TO service_role;

-- Storage: each signed-in user reads and writes only their own folder (<bucket>/<user id>/…).
-- Users upload to 'wardrobe'; only the worker (service role) writes to 'outfits', users read it.
DROP POLICY IF EXISTS "wardrobe: read own folder" ON storage.objects;
CREATE POLICY "wardrobe: read own folder" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "wardrobe: upload to own folder" ON storage.objects;
CREATE POLICY "wardrobe: upload to own folder" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "wardrobe: replace own files" ON storage.objects;
CREATE POLICY "wardrobe: replace own files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "wardrobe: delete own files" ON storage.objects;
CREATE POLICY "wardrobe: delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'wardrobe' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
DROP POLICY IF EXISTS "outfits: read own folder" ON storage.objects;
CREATE POLICY "outfits: read own folder" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'outfits' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
