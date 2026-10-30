-- 004: per-person limit on new looks, ready for membership tiers (2026-10-30). Safe to re-run.
-- The app allows a number of on-demand batches (3 looks each) per day: users.daily_batches if set, else the plan's
-- default in src/server/looks.js (PLAN_LIMITS). The morning run and test jobs don't count.
-- People can update their own profile row (RLS), so a trigger stops them from changing their own plan or limit;
-- only the service role or the SQL editor can.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS daily_batches INT CHECK (daily_batches IS NULL OR daily_batches >= 0);

CREATE OR REPLACE FUNCTION public.protect_plan()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.plan IS DISTINCT FROM OLD.plan OR NEW.daily_batches IS DISTINCT FROM OLD.daily_batches) THEN
    RAISE EXCEPTION 'plan and daily_batches can only be changed by Accing';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_plan ON public.users;
CREATE TRIGGER protect_plan BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.protect_plan();

-- Examples (SQL editor):
--   UPDATE public.users SET daily_batches = 20 WHERE email = '<email>';   -- one person's own limit
--   UPDATE public.users SET daily_batches = NULL WHERE email = '<email>'; -- back to their plan's default
