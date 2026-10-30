-- 006: email-first sign-in (Figma 177:2303 → 186:3991 or 177:2816), 2026-10-30. Safe to re-run.
-- After the email step the app shows the password field for an existing account, or "Create an account" for a new
-- one. Only yes/no comes back: no name or other detail. Anyone can learn whether an email has an Accing account,
-- which is the trade-off of this design (sign-up already reveals it when an email is taken).
CREATE OR REPLACE FUNCTION public.account_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email)));
$$;
REVOKE ALL ON FUNCTION public.account_exists(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_exists(TEXT) TO anon, authenticated;
