-- ============================================================
-- BESTBILL POS - SUPABASE DATABASE SCHEMA & AUTO-CLEANUP
-- ============================================================

-- 1. Create Hotels Table
CREATE TABLE IF NOT EXISTS public.hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_code VARCHAR(100) UNIQUE NOT NULL,
  hotel_name VARCHAR(255) NOT NULL,
  location TEXT,
  phone VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on hotels
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;

-- Hotels RLS Policies
CREATE POLICY "Owners can view their own hotels"
  ON public.hotels FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert their own hotels"
  ON public.hotels FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own hotels"
  ON public.hotels FOR UPDATE
  USING (auth.uid() = owner_id);

-- 2. Create Analytics Snapshots Table (Stores 15-min POS summary updates)
CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_code VARCHAR(100) NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_revenue NUMERIC(12, 2) DEFAULT 0.00,
  total_orders INT DEFAULT 0,
  cash_collection NUMERIC(12, 2) DEFAULT 0.00,
  online_collection NUMERIC(12, 2) DEFAULT 0.00,
  dine_in_sales NUMERIC(12, 2) DEFAULT 0.00,
  parcel_sales NUMERIC(12, 2) DEFAULT 0.00,
  payment_summary JSONB DEFAULT '[]'::jsonb,
  top_items JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast query filtering by owner, hotel, and date range
CREATE INDEX IF NOT EXISTS idx_analytics_owner_date 
  ON public.analytics_snapshots (owner_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_analytics_hotel_date 
  ON public.analytics_snapshots (hotel_code, snapshot_date);

-- Enable RLS on analytics_snapshots
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Analytics Snapshots RLS Policies
CREATE POLICY "Owners can view their own analytics snapshots"
  ON public.analytics_snapshots FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can insert analytics snapshots"
  ON public.analytics_snapshots FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update analytics snapshots"
  ON public.analytics_snapshots FOR UPDATE
  USING (auth.uid() = owner_id);

-- 3. AUTOMATED 15-MONTH DATA RETENTION CLEANUP
-- Function to delete analytics snapshots older than 15 months
CREATE OR REPLACE FUNCTION purge_old_analytics_snapshots()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.analytics_snapshots
  WHERE created_at < NOW() - INTERVAL '15 months';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: To execute automatically every day in Supabase, run:
-- SELECT cron.schedule('purge-15mo-analytics', '0 2 * * *', 'SELECT purge_old_analytics_snapshots();');
