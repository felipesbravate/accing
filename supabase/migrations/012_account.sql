-- 012 (2026-11-06): Profile, Settings and the new onboarding step. Safe to re-run. Figma "Main screens" (226:2154).
--   • users.styles: onboarding step 4 "How do you express yourself?" (275:12737), up to 3 style identities.
--   • users.avatar_path: the profile photo (Profile 268:11591, the edit button on the avatar).
--   • users.removed_garments: garments removed from the Wardrobe (312:5607); the pipeline never uses them again.
--   • users.password_changed_at: "Last changed 3 months ago" in Settings (270:1948).
--   • Remaking looks after new face photos (297:3383): users.remake_from marks when; outfits.remade_at which looks
--     already have the new face. Today's suggestions are remade at once (the app queues them), the rest 2 an hour (below).
--   • People can delete their own looks and look files (Wardrobe "Remove") and their whole account (287:3811).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS styles TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_path TEXT;            -- wardrobe bucket: <id>/avatar-<stamp>.jpg
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS removed_garments JSONB NOT NULL DEFAULT '[]'; -- [{photo_id, category, description}]
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS remake_from TIMESTAMPTZ;
ALTER TABLE public.outfits ADD COLUMN IF NOT EXISTS remade_at TIMESTAMPTZ;

-- Own looks: delete (Wardrobe "Remove" takes the garment's looks with it).
DROP POLICY IF EXISTS "Users can delete own outfits" ON public.outfits;
CREATE POLICY "Users can delete own outfits" ON public.outfits FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "outfits: delete own files" ON storage.objects;
CREATE POLICY "outfits: delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'outfits' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Delete account: the app first removes the person's files (their own session may), then calls this. Deleting the
-- auth user cascades to public.users and every table that references it.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  DELETE FROM public.generation_jobs WHERE user_id = me;
  DELETE FROM auth.users WHERE id = me;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Every hour: for each person with new face photos, 2 more of their looks are remade (newest first), until all are.
CREATE OR REPLACE FUNCTION public.queue_remakes()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  INSERT INTO public.generation_jobs (user_id, status, job_type, payload)
  SELECT o.user_id, 'pending', 'remake_look', jsonb_build_object('outfit_id', o.id, 'kind', 'hourly')
    FROM (
      SELECT o.*, row_number() OVER (PARTITION BY o.user_id ORDER BY o.created_at DESC) AS k
        FROM public.outfits o JOIN public.users u ON u.id = o.user_id
       WHERE u.remake_from IS NOT NULL AND u.base_path IS NOT NULL
         AND o.status = 'ready' AND o.created_at < u.remake_from
         AND (o.remade_at IS NULL OR o.remade_at < u.remake_from)
         AND NOT EXISTS (SELECT 1 FROM public.generation_jobs j WHERE j.job_type = 'remake_look'
                          AND j.payload->>'outfit_id' = o.id::text AND j.created_at >= u.remake_from)
    ) o
   WHERE o.k <= 2;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.queue_remakes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_remakes() TO service_role;

SELECT cron.unschedule('accing-remakes') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'accing-remakes');
SELECT cron.schedule('accing-remakes', '17 * * * *', $$ SELECT public.queue_remakes(); SELECT public.wake_worker(); $$);
