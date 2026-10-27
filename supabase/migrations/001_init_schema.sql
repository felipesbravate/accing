-- Accing: Daily Mirror MVP schema (Supabase / PostgreSQL)
-- Paste this whole file into Supabase > SQL Editor and click Run. Safe to run more than once.
-- Tables: users, wardrobe_items, outfits, outfit_items, generation_jobs (row level security on all).

-- Extensions --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;  -- pgvector, for ArcFace face embeddings

-- USERS (one profile row per auth user, created automatically on sign-up) ----
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- Face validation
  face_reference_photo_1_url TEXT,
  face_reference_photo_2_url TEXT,
  face_reference_photo_3_url TEXT,
  face_embedding extensions.vector(512), -- ArcFace embedding

  -- Preferences
  preferred_style TEXT,
  preferred_colors TEXT[],

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WARDROBE_ITEMS ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wardrobe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'top', 'bottom', 'shoe', 'accessory'
  color TEXT,
  material TEXT,
  season TEXT[],          -- ['spring', 'summer', 'fall', 'winter']

  image_url TEXT NOT NULL,

  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_id ON public.wardrobe_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_category ON public.wardrobe_items(category);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_is_active ON public.wardrobe_items(is_active);

-- OUTFITS (generated recommendations) --------------------------------------
CREATE TABLE IF NOT EXISTS public.outfits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  contextual_date TIMESTAMPTZ NOT NULL,
  daypart TEXT NOT NULL,   -- 'morning', 'afternoon', 'evening', 'night'
  weather TEXT,
  occasion TEXT,           -- 'casual', 'office day', 'dinner', 'party'

  generated_image_path TEXT NOT NULL,

  validation_status TEXT DEFAULT 'pending', -- 'pending', 'validating', 'validated', 'failed'
  validation_confidence FLOAT,

  is_saved BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outfits_user_id ON public.outfits(user_id);
CREATE INDEX IF NOT EXISTS idx_outfits_contextual_date ON public.outfits(contextual_date);
CREATE INDEX IF NOT EXISTS idx_outfits_is_saved ON public.outfits(is_saved);
CREATE INDEX IF NOT EXISTS idx_outfits_validation_status ON public.outfits(validation_status);
CREATE INDEX IF NOT EXISTS idx_outfits_expires_at ON public.outfits(expires_at);

-- OUTFIT_ITEMS (which wardrobe items make up each outfit) -------------------
CREATE TABLE IF NOT EXISTS public.outfit_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outfit_id UUID NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  wardrobe_item_id UUID NOT NULL REFERENCES public.wardrobe_items(id),
  position TEXT NOT NULL, -- 'top', 'bottom', 'shoe'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outfit_items_outfit_id ON public.outfit_items(outfit_id);
CREATE INDEX IF NOT EXISTS idx_outfit_items_wardrobe_item_id ON public.outfit_items(wardrobe_item_id);

-- GENERATION_JOBS (calls to the image generator) ----------------------------
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  job_type TEXT NOT NULL,        -- 'initial', 'prefetch', 'regenerate', 'refine'

  nano_banana_job_id TEXT,
  prompt TEXT,

  outfit_id UUID REFERENCES public.outfits(id),
  error_message TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_id ON public.generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_outfit_id ON public.generation_jobs(outfit_id);

-- ROW LEVEL SECURITY: each person sees and changes only their own rows ------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can view own wardrobe" ON public.wardrobe_items;
CREATE POLICY "Users can view own wardrobe" ON public.wardrobe_items FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own wardrobe items" ON public.wardrobe_items;
CREATE POLICY "Users can insert own wardrobe items" ON public.wardrobe_items FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own wardrobe items" ON public.wardrobe_items;
CREATE POLICY "Users can update own wardrobe items" ON public.wardrobe_items FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can delete own wardrobe items" ON public.wardrobe_items;
CREATE POLICY "Users can delete own wardrobe items" ON public.wardrobe_items FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own outfits" ON public.outfits;
CREATE POLICY "Users can view own outfits" ON public.outfits FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own outfits" ON public.outfits;
CREATE POLICY "Users can insert own outfits" ON public.outfits FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own outfits" ON public.outfits;
CREATE POLICY "Users can update own outfits" ON public.outfits FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view outfit items in own outfits" ON public.outfit_items;
CREATE POLICY "Users can view outfit items in own outfits" ON public.outfit_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.outfits o WHERE o.id = outfit_items.outfit_id AND o.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can view own generation jobs" ON public.generation_jobs;
CREATE POLICY "Users can view own generation jobs" ON public.generation_jobs FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can insert own generation jobs" ON public.generation_jobs;
CREATE POLICY "Users can insert own generation jobs" ON public.generation_jobs FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can update own generation jobs" ON public.generation_jobs;
CREATE POLICY "Users can update own generation jobs" ON public.generation_jobs FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- Signed-in people may use these tables; the policies above decide which rows.
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wardrobe_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.outfits TO authenticated;
GRANT SELECT ON public.outfit_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.generation_jobs TO authenticated;

-- updated_at --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_wardrobe_items_updated_at ON public.wardrobe_items;
CREATE TRIGGER update_wardrobe_items_updated_at BEFORE UPDATE ON public.wardrobe_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_outfits_updated_at ON public.outfits;
CREATE TRIGGER update_outfits_updated_at BEFORE UPDATE ON public.outfits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profile row on sign-up (without it, every wardrobe/outfit insert fails) ----
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Anyone who signed up before this script ran gets a profile row too.
INSERT INTO public.users (id, email, full_name)
SELECT id, email, raw_user_meta_data ->> 'full_name' FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Still to set up in Supabase (not SQL): Storage buckets 'wardrobe' and 'outfits'.
