/**
 * Accing - Daily Mirror MVP
 * PostgreSQL Schema Initialization
 *
 * Run this migration in Supabase SQL Editor:
 * 1. Copy the entire file
 * 2. Paste into Supabase SQL Editor
 * 3. Click "Run"
 *
 * Tables: users, wardrobe_items, outfits, generation_jobs
 */

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- Face validation
  face_reference_photo_1_url TEXT,
  face_reference_photo_2_url TEXT,
  face_reference_photo_3_url TEXT,
  face_embedding VECTOR(512), -- ArcFace embedding

  -- Preferences
  preferred_style TEXT,
  preferred_colors TEXT[],

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index on email for quick lookups
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- WARDROBE_ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS wardrobe_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Item details
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- e.g., 'top', 'bottom', 'shoe', 'accessory'
  color TEXT,
  material TEXT,
  season TEXT[], -- e.g., ['spring', 'summer', 'fall', 'winter']

  -- Image
  image_url TEXT NOT NULL,

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX idx_wardrobe_items_user_id ON wardrobe_items(user_id);
CREATE INDEX idx_wardrobe_items_category ON wardrobe_items(category);
CREATE INDEX idx_wardrobe_items_is_active ON wardrobe_items(is_active);

-- ============================================================================
-- OUTFITS TABLE (Generated recommendations)
-- ============================================================================
CREATE TABLE IF NOT EXISTS outfits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Context
  contextual_date TIMESTAMP WITH TIME ZONE NOT NULL,
  daypart TEXT NOT NULL, -- 'morning', 'afternoon', 'evening', 'night'
  weather TEXT, -- temperature, condition
  occasion TEXT, -- 'casual', 'formal', 'sports', etc.

  -- Generated image
  generated_image_path TEXT NOT NULL,

  -- Validation
  validation_status TEXT DEFAULT 'pending', -- 'pending', 'validating', 'validated', 'failed'
  validation_confidence FLOAT,

  -- Metadata
  is_saved BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP + INTERVAL '24 hours',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX idx_outfits_user_id ON outfits(user_id);
CREATE INDEX idx_outfits_contextual_date ON outfits(contextual_date);
CREATE INDEX idx_outfits_is_saved ON outfits(is_saved);
CREATE INDEX idx_outfits_validation_status ON outfits(validation_status);
CREATE INDEX idx_outfits_expires_at ON outfits(expires_at);

-- ============================================================================
-- OUTFIT_ITEMS TABLE (Junction table: which wardrobe items in each outfit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS outfit_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outfit_id UUID NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
  wardrobe_item_id UUID NOT NULL REFERENCES wardrobe_items(id),

  -- Position in outfit (e.g., 'top', 'bottom', 'shoe')
  position TEXT NOT NULL,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_outfit_items_outfit_id ON outfit_items(outfit_id);
CREATE INDEX idx_outfit_items_wardrobe_item_id ON outfit_items(wardrobe_item_id);

-- ============================================================================
-- GENERATION_JOBS TABLE (Track API calls to Nano Banana)
-- ============================================================================
CREATE TABLE IF NOT EXISTS generation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Job metadata
  status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  job_type TEXT NOT NULL, -- 'initial', 'prefetch', 'regenerate', 'refine'

  -- API call details
  nano_banana_job_id TEXT,
  prompt TEXT,

  -- Result
  outfit_id UUID REFERENCES outfits(id),
  error_message TEXT,

  -- Timing
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_generation_jobs_user_id ON generation_jobs(user_id);
CREATE INDEX idx_generation_jobs_status ON generation_jobs(status);
CREATE INDEX idx_generation_jobs_outfit_id ON generation_jobs(outfit_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE outfit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs ENABLE ROW LEVEL SECURITY;

-- Users: Can only view/edit own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- Wardrobe Items: Can only view/edit own items
CREATE POLICY "Users can view own wardrobe"
  ON wardrobe_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wardrobe items"
  ON wardrobe_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wardrobe items"
  ON wardrobe_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wardrobe items"
  ON wardrobe_items FOR DELETE
  USING (auth.uid() = user_id);

-- Outfits: Can only view/edit own outfits
CREATE POLICY "Users can view own outfits"
  ON outfits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own outfits"
  ON outfits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own outfits"
  ON outfits FOR UPDATE
  USING (auth.uid() = user_id);

-- Outfit Items: Can only view if outfit belongs to them
CREATE POLICY "Users can view outfit items in own outfits"
  ON outfit_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM outfits
    WHERE outfits.id = outfit_items.outfit_id
    AND outfits.user_id = auth.uid()
  ));

-- Generation Jobs: Can only view own jobs
CREATE POLICY "Users can view own generation jobs"
  ON generation_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generation jobs"
  ON generation_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own generation jobs"
  ON generation_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- UTILITY FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wardrobe_items_updated_at BEFORE UPDATE ON wardrobe_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_outfits_updated_at BEFORE UPDATE ON outfits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- NOTES
-- ============================================================================
--
-- VECTOR EXTENSION:
-- If you need ArcFace embeddings (vector/512), first enable pgvector:
--   CREATE EXTENSION IF NOT EXISTS vector;
--
-- Otherwise, remove the `face_embedding VECTOR(512)` line and use a TEXT field:
--   face_embedding TEXT (store as JSON)
--
-- NEXT STEPS:
-- 1. Create storage bucket for images (Settings > Storage > New bucket)
-- 2. Set bucket name to 'wardrobe' and 'outfits'
-- 3. Configure CORS if needed for image uploads
-- 4. Seed test data via auth flow
