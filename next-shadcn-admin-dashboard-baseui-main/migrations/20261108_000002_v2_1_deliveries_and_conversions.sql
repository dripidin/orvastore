-- ============================================================================
-- ORVA Store — Release v2.1.0 Database Migration
-- Deliveries Table, Order Tracking Isolation & Operational Status Alignment
-- ============================================================================

-- 1. DELIVERIES TABLE (Single Source of Truth for Shipping & Redex Tracking)
CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'REDEX',
    tracking_number TEXT NOT NULL,
    tracking_url TEXT,
    status TEXT DEFAULT 'CREATED' CHECK (status IN (
        'PENDING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT', 
        'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'
    )),
    carrier_status TEXT DEFAULT 'prete_a_expedier',
    carrier_status_ar TEXT DEFAULT 'جاهز للإرسال',
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lightning-fast order and tracking lookups
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_tracking ON public.deliveries(tracking_number);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for deliveries
DROP POLICY IF EXISTS "Allow anon insert deliveries" ON public.deliveries;
CREATE POLICY "Allow anon insert deliveries" ON public.deliveries FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon select deliveries" ON public.deliveries;
CREATE POLICY "Allow anon select deliveries" ON public.deliveries FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon update deliveries" ON public.deliveries;
CREATE POLICY "Allow anon update deliveries" ON public.deliveries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on deliveries" ON public.deliveries;
CREATE POLICY "Service role full access on deliveries" ON public.deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 2. ORDER CONVERSIONS / RE-ROUTING AUDIT TABLE (تحويل الطلبية)
CREATE TABLE IF NOT EXISTS public.order_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    source_order_id TEXT,
    conversion_sequence INTEGER NOT NULL DEFAULT 1,
    operator TEXT DEFAULT 'Admin',
    reason TEXT NOT NULL,
    previous_state JSONB DEFAULT '{}'::jsonb,
    new_state JSONB DEFAULT '{}'::jsonb,
    formatted_courier_note TEXT,
    new_tracking_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_conversions_order_id ON public.order_conversions(order_id);
ALTER TABLE public.order_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon access order_conversions" ON public.order_conversions;
CREATE POLICY "Allow anon access order_conversions" ON public.order_conversions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on order_conversions" ON public.order_conversions;
CREATE POLICY "Service role full access on order_conversions" ON public.order_conversions FOR ALL TO service_role USING (true) WITH CHECK (true);


-- 3. ENSURE ORDERS TABLE HAS NECESSARY COLUMNS FOR REDEX & TRACKING
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'tracking_code') THEN
        ALTER TABLE public.orders ADD COLUMN tracking_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'redex_tracking_code') THEN
        ALTER TABLE public.orders ADD COLUMN redex_tracking_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'in_redex') THEN
        ALTER TABLE public.orders ADD COLUMN in_redex BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'courier') THEN
        ALTER TABLE public.orders ADD COLUMN courier TEXT DEFAULT 'REDEX';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'remarks') THEN
        ALTER TABLE public.orders ADD COLUMN remarks JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;
