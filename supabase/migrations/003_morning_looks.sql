-- 003: the day's looks are made before the person opens the app (2026-10-30). Safe to re-run.
-- Every morning pg_cron queues one 'make_looks' job per person who has picked a base photo, then wakes the worker.
-- The worker fills in the weather (Open-Meteo, from home_lat/home_lon) and the occasion (default_occasion, or work on
-- weekdays and a relaxed day at weekends).
--
-- Before running this file: Database → Extensions → enable pg_cron and pg_net. After it, store the worker's address and
-- secret once (see the end of this file).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS home_lon DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS home_timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
  ADD COLUMN IF NOT EXISTS default_occasion TEXT,
  ADD COLUMN IF NOT EXISTS morning_looks INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS morning_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- One morning job per person per day (their own date), only for people with a picked base photo and at least one photo.
CREATE OR REPLACE FUNCTION public.queue_morning_looks()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n INT;
BEGIN
  INSERT INTO public.generation_jobs (user_id, status, job_type, payload)
  SELECT u.id, 'pending', 'make_looks',
         jsonb_build_object('kind', 'morning', 'looks', LEAST(GREATEST(u.morning_looks, 1), 6),
                            'day', (now() AT TIME ZONE u.home_timezone)::date, 'date', now(), 'daypart', 'morning')
    FROM public.users u
   WHERE u.morning_enabled AND u.base_path IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.wardrobe_photos p WHERE p.user_id = u.id AND p.is_active)
     AND NOT EXISTS (SELECT 1 FROM public.generation_jobs j
                      WHERE j.user_id = u.id AND j.job_type = 'make_looks' AND j.payload->>'kind' = 'morning'
                        AND j.payload->>'day' = ((now() AT TIME ZONE u.home_timezone)::date)::text);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.queue_morning_looks() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_morning_looks() TO service_role;

-- Wakes the worker (address and secret from Supabase Vault). Does nothing if there is nothing to do.
CREATE OR REPLACE FUNCTION public.wake_worker()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE url TEXT; secret TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.generation_jobs WHERE status = 'pending') THEN RETURN; END IF;
  SELECT decrypted_secret INTO url FROM vault.decrypted_secrets WHERE name = 'worker_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'worker_secret';
  IF url IS NULL OR secret IS NULL THEN RAISE WARNING 'worker_url or worker_secret missing from Vault'; RETURN; END IF;
  PERFORM net.http_post(url := url || '/wake', headers := jsonb_build_object('x-worker-secret', secret), body := '{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.wake_worker() FROM PUBLIC, anon, authenticated;

-- 05:00 UTC = 06:00 in Madrid in winter, 07:00 in summer. Looks take ~25 s each, so they are ready long before breakfast.
SELECT cron.unschedule('accing-morning-looks') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'accing-morning-looks');
SELECT cron.schedule('accing-morning-looks', '0 5 * * *', $$ SELECT public.queue_morning_looks(); SELECT public.wake_worker(); $$);

-- Once, by hand, with the values from ~/Projects/accing/.env.local (never commit them):
--   SELECT vault.create_secret('https://accing-worker.fly.dev', 'worker_url');
--   SELECT vault.create_secret('<WORKER_SECRET value>', 'worker_secret');
-- Home for the forecast (Barcelona shown):
--   UPDATE public.users SET home_lat = 41.38, home_lon = 2.17 WHERE email = '<your email>';
