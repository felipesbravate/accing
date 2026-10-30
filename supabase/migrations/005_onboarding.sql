-- 005: onboarding (2026-10-30). Safe to re-run.
-- consent_at: when the person agreed to the use of their face photos and face fingerprint (Onboarding 2 — Consent).
-- onboarding_later_at: they tapped Skip ("Not now"); the mirror then shows "Your mirror is waiting" instead of sending
-- them back into onboarding each time. onboarded_at: they picked their base photo ("This is me").
-- Who still needs onboarding is decided by base_path (002): no picked base photo, no looks.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_later_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- People who already have a picked base photo (set up from the Mac with worker/enqueue.mjs) count as onboarded.
UPDATE public.users SET onboarded_at = COALESCE(onboarded_at, now()) WHERE base_path IS NOT NULL;
