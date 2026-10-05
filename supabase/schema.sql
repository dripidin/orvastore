-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR ORVA STORE (orvastore)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT UNIQUE NOT NULL,
    store_id TEXT NOT NULL DEFAULT 'orvastore',
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    wilaya TEXT NOT NULL,
    commune TEXT DEFAULT 'الجزائر',
    delivery_type TEXT DEFAULT 'توصيل للمنزل',
    delivery_time TEXT DEFAULT '24 - 48 H',
    quantity INTEGER DEFAULT 1,
    product_name TEXT DEFAULT 'Pack 1 Pro',
    product_total TEXT DEFAULT '4950 د.ج',
    shipping_fee TEXT DEFAULT '500 د.ج',
    price_num NUMERIC DEFAULT 4950,
    grand_total TEXT DEFAULT '5450 د.ج',
    status TEXT DEFAULT 'pending',
    in_redex BOOLEAN DEFAULT false,
    redex_tracking_code TEXT,
    notes TEXT,
    remarks JSONB DEFAULT '[]'::jsonb,
    client_ip TEXT,
    client_ip_hash TEXT,
    device_id TEXT,
    risk_score INTEGER DEFAULT 0,
    risk_level TEXT DEFAULT 'LOW',
    risk_decision TEXT DEFAULT 'ALLOW',
    risk_reasons TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Order Items Table (for multi-item order support)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price NUMERIC DEFAULT 4950,
    total_price NUMERIC DEFAULT 4950,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Rate Limiting / Fraud Tracking Table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip TEXT,
    device_id TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    total_orders INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    cancelled INTEGER DEFAULT 0,
    rejected INTEGER DEFAULT 0,
    no_response INTEGER DEFAULT 0,
    trust_score INTEGER DEFAULT 50,
    risk_level TEXT DEFAULT 'LOW',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Watchlist Table
CREATE TABLE IF NOT EXISTS public.watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,
    identifier_type TEXT DEFAULT 'PHONE',
    reason TEXT,
    status TEXT DEFAULT 'watchlist',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMPTZ
);

-- 7. Risk Events Table
CREATE TABLE IF NOT EXISTS public.risk_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    store_id TEXT DEFAULT 'orvastore',
    order_id TEXT,
    actor_phone TEXT,
    device_id TEXT,
    ip_hash TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Indexes for High Performance Queries
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_in_redex ON public.orders(in_redex);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_time ON public.rate_limits(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_dev_time ON public.rate_limits(device_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_watchlist_identifier ON public.watchlist(identifier);

-- 9. Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_orders_updated_at ON public.orders;
CREATE TRIGGER tr_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 10. Row Level Security (RLS) Configuration
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
DROP POLICY IF EXISTS "Service role full access on orders" ON public.orders;
CREATE POLICY "Service role full access on orders" ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on order_items" ON public.order_items;
CREATE POLICY "Service role full access on order_items" ON public.order_items FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on rate_limits" ON public.rate_limits;
CREATE POLICY "Service role full access on rate_limits" ON public.rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on customers" ON public.customers;
CREATE POLICY "Service role full access on customers" ON public.customers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on watchlist" ON public.watchlist;
CREATE POLICY "Service role full access on watchlist" ON public.watchlist FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on risk_events" ON public.risk_events;
CREATE POLICY "Service role full access on risk_events" ON public.risk_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow public (anon + authenticated) insertion and read
DROP POLICY IF EXISTS "Allow anon order insertion" ON public.orders;
CREATE POLICY "Allow anon order insertion" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon order read" ON public.orders;
CREATE POLICY "Allow anon order read" ON public.orders FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow anon rate limit insert" ON public.rate_limits;
CREATE POLICY "Allow anon rate limit insert" ON public.rate_limits FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon rate limit select" ON public.rate_limits;
CREATE POLICY "Allow anon rate limit select" ON public.rate_limits FOR SELECT TO anon, authenticated USING (true);
