-- 008: home city and its typical seasons, 2026-11-01. Safe to re-run.
-- home_lat / home_lon / home_timezone (migration 003) are now filled in automatically from the IP location Vercel adds
-- to each request, the first time they're missing (src/server/location.js). home_city is shown nowhere yet; it makes the
-- row readable. climate: the typical daytime high and night low of summer, mid-season and winter at home (Open-Meteo
-- archive, last five years; src/lib/climate.js), e.g. {"summer":{"high":28.1,"low":21.0},"mid":{...},"winter":{...},
-- "lat":41.38,"lon":2.17,"years":"2021–2025"}. The season filters judge each look's warmth against it.
-- Until this runs the app still works: the filters use a temperate default and nothing is saved.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS home_city TEXT,
  ADD COLUMN IF NOT EXISTS climate JSONB;
