-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA FOR E-COMMERCE STORES (TNT CLOCK & ORVA STORE)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Create Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT UNIQUE NOT NULL,
    store_id TEXT NOT NULL DEFAULT 'yamahasac',
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    wilaya TEXT NOT NULL,
    commune TEXT DEFAULT 'الجزائر',
    delivery_type TEXT DEFAULT 'توصيل للمنزل',
    delivery_time TEXT DEFAULT '24 - 48 H',
    quantity INTEGER DEFAULT 1,
    product_name TEXT DEFAULT 'Sac Banane Moto Yamaha',
    product_total TEXT DEFAULT '3900 د.ج',
    shipping_fee TEXT DEFAULT '500 د.ج',
    price_num NUMERIC DEFAULT 3900,
    grand_total TEXT DEFAULT '4400 د.ج',
    status TEXT DEFAULT 'pending',
    in_redex BOOLEAN DEFAULT false,
    redex_tracking_code TEXT,
    notes TEXT,
    remarks JSONB DEFAULT '[]'::jsonb,
    client_ip TEXT,
    device_id TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Order Items Table (for multi-item order support)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price NUMERIC DEFAULT 3900,
    total_price NUMERIC DEFAULT 3900,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Create Rate Limiting / Fraud Tracking Table
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip TEXT,
    device_id TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Indexes for High Performance Queries
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_in_redex ON public.orders(in_redex);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_time ON public.rate_limits(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_dev_time ON public.rate_limits(device_id, created_at DESC);

-- 6. Trigger to automatically update updated_at timestamp
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

-- 7. Row Level Security (RLS) Configuration
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Allow server functions (service_role) full access
DROP POLICY IF EXISTS "Service role full access on orders" ON public.orders;
CREATE POLICY "Service role full access on orders"
    ON public.orders
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on order_items" ON public.order_items;
CREATE POLICY "Service role full access on order_items"
    ON public.order_items
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on rate_limits" ON public.rate_limits;
CREATE POLICY "Service role full access on rate_limits"
    ON public.rate_limits
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow public (anon) insertion for storefront orders
DROP POLICY IF EXISTS "Allow anon order insertion" ON public.orders;
CREATE POLICY "Allow anon order insertion"
    ON public.orders
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon rate limit check" ON public.rate_limits;
CREATE POLICY "Allow anon rate limit check"
    ON public.rate_limits
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Enable Realtime publication for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
