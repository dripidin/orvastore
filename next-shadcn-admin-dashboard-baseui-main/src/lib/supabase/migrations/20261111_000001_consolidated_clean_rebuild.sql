-- ============================================================================
-- ORVA Store v2.1.0 — Consolidated Clean Database Rebuild Migration
-- Migration: 20261111_000001_consolidated_clean_rebuild.sql
-- Target: Supabase Cloud PostgreSQL (Project Ref: olmsjkhdfghyydogcvvy)
-- Fully Transactional, Idempotent, RLS Hardened
-- ============================================================================

BEGIN;

-- 0. EXTENSIONS & SAFETY TIMEOUTS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- ============================================================================
-- 1. CATALOG & PRODUCTS DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_fr TEXT,
    slug TEXT NOT NULL UNIQUE,
    sku TEXT UNIQUE,
    short_description TEXT,
    description TEXT,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    base_price NUMERIC NOT NULL CHECK (base_price >= 0),
    original_price NUMERIC CHECK (original_price >= 0),
    savings NUMERIC DEFAULT 0 CHECK (savings >= 0),
    currency TEXT DEFAULT 'DZD',
    status TEXT DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    is_featured BOOLEAN DEFAULT true,
    stock_quantity INTEGER DEFAULT 50 CHECK (stock_quantity >= 0),
    story TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_collections (
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, collection_id)
);

CREATE TABLE IF NOT EXISTS public.variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sku TEXT,
    price_override NUMERIC CHECK (price_override >= 0),
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.variants(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    role TEXT DEFAULT 'GALLERY' CHECK (role IN ('COVER', 'GALLERY', 'DETAIL', 'VARIANT', 'LIFESTYLE', 'BACKGROUND', 'EDITORIAL')),
    alt_text TEXT,
    display_order INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. CUSTOMERS, ORDERS & COMMERCE DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    phone2 TEXT,
    email TEXT,
    wilaya TEXT,
    commune TEXT,
    address TEXT,
    notes TEXT,
    orders_count INTEGER DEFAULT 1,
    total_spent NUMERIC DEFAULT 0 CHECK (total_spent >= 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
    customer_name TEXT,
    full_name TEXT,
    customer_phone TEXT,
    phone TEXT,
    customer_phone2 TEXT,
    wilaya_code INTEGER CHECK (wilaya_code >= 1 AND wilaya_code <= 58),
    wilaya_name TEXT,
    wilaya TEXT,
    commune_name TEXT,
    commune TEXT,
    delivery_wilaya TEXT,
    delivery_commune TEXT,
    delivery_method TEXT DEFAULT 'DOMICILE' CHECK (delivery_method IN ('DOMICILE', 'STOP_DESK')),
    delivery_type TEXT DEFAULT 'DOMICILE',
    delivery_address TEXT,
    delivery_time TEXT DEFAULT '24 - 48 H',
    origin_hub TEXT DEFAULT 'BISKRA_07',
    pack_id TEXT,
    product_name TEXT,
    product_title TEXT,
    quantity INTEGER DEFAULT 1,
    subtotal NUMERIC DEFAULT 0 CHECK (subtotal >= 0),
    delivery_fee NUMERIC DEFAULT 0 CHECK (delivery_fee >= 0),
    shipping_fee TEXT,
    product_total TEXT,
    price_num NUMERIC,
    grand_total TEXT,
    total NUMERIC DEFAULT 0 CHECK (total >= 0),
    total_payable NUMERIC DEFAULT 0 CHECK (total_payable >= 0),
    currency TEXT DEFAULT 'DZD',
    status TEXT DEFAULT 'pending',
    payment_method TEXT DEFAULT 'COD',
    payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PAID')),
    tracking_code TEXT,
    redex_tracking_code TEXT,
    tracking_url TEXT,
    in_redex BOOLEAN DEFAULT false,
    courier TEXT DEFAULT 'REDEX',
    courier_provider TEXT DEFAULT 'REDEX',
    risk_score NUMERIC DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_level TEXT DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    risk_decision TEXT DEFAULT 'ALLOW' CHECK (risk_decision IN ('ALLOW', 'ACCEPT', 'REVIEW', 'REJECT')),
    risk_reasons JSONB DEFAULT '[]'::jsonb,
    customer_notes TEXT,
    operator_notes TEXT,
    notes TEXT,
    remarks JSONB DEFAULT '[]'::jsonb,
    store_id TEXT DEFAULT 'orvastore',
    client_ip TEXT,
    device_id TEXT,
    client_ip_hash TEXT,
    idempotency_key TEXT,
    payload_hash TEXT,
    unit_price NUMERIC,
    total_price NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT orders_order_id_key UNIQUE (order_id),
    CONSTRAINT orders_order_number_key UNIQUE (order_number),
    CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key)
);

-- Trigger function to guarantee 100% dual-column synchronization on orders
CREATE OR REPLACE FUNCTION public.sync_orders_dual_columns()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_id := COALESCE(NEW.order_id, NEW.order_number);
    NEW.order_number := COALESCE(NEW.order_number, NEW.order_id);
    NEW.customer_name := COALESCE(NEW.customer_name, NEW.full_name);
    NEW.full_name := COALESCE(NEW.full_name, NEW.customer_name);
    NEW.customer_phone := COALESCE(NEW.customer_phone, NEW.phone);
    NEW.phone := COALESCE(NEW.phone, NEW.customer_phone);
    NEW.wilaya_name := COALESCE(NEW.wilaya_name, NEW.wilaya);
    NEW.wilaya := COALESCE(NEW.wilaya, NEW.wilaya_name);
    NEW.commune_name := COALESCE(NEW.commune_name, NEW.commune);
    NEW.commune := COALESCE(NEW.commune, NEW.commune_name);
    NEW.delivery_wilaya := COALESCE(NEW.delivery_wilaya, NEW.wilaya, NEW.wilaya_name);
    NEW.delivery_commune := COALESCE(NEW.delivery_commune, NEW.commune, NEW.commune_name);
    NEW.delivery_method := COALESCE(NEW.delivery_method, NEW.delivery_type, 'DOMICILE');
    NEW.delivery_type := COALESCE(NEW.delivery_type, NEW.delivery_method, 'DOMICILE');
    NEW.product_name := COALESCE(NEW.product_name, NEW.product_title);
    NEW.product_title := COALESCE(NEW.product_title, NEW.product_name);
    NEW.total := COALESCE(NEW.total, NEW.total_payable, NEW.price_num, 0);
    NEW.total_payable := COALESCE(NEW.total_payable, NEW.total, NEW.price_num, 0);
    NEW.subtotal := COALESCE(NEW.subtotal, 0);
    NEW.delivery_fee := COALESCE(NEW.delivery_fee, 0);
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_orders_dual_columns ON public.orders;
CREATE TRIGGER trg_sync_orders_dual_columns
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_orders_dual_columns();

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES public.variants(id) ON DELETE SET NULL,
    pack_id TEXT CHECK (pack_id IN ('PACK1', 'PACK2', 'PACK3')),
    product_name TEXT,
    product_name_snapshot TEXT NOT NULL,
    variant_label_snapshot TEXT,
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total NUMERIC NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 3. LOGISTICS, RE-ROUTING, RECONCILIATION & AUDIT DOMAIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'REDEX',
    tracking_number TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS public.order_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL DEFAULT 'STATUS_CHANGE',
    title TEXT NOT NULL,
    description TEXT,
    actor TEXT NOT NULL DEFAULT 'SYSTEM',
    tracking_number TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    source_order_id TEXT,
    conversion_sequence INTEGER NOT NULL DEFAULT 1,
    timestamp_utc TIMESTAMPTZ DEFAULT now(),
    operator TEXT NOT NULL DEFAULT 'Admin',
    reason TEXT NOT NULL DEFAULT 'Re-routing',
    override_applied BOOLEAN DEFAULT false,
    previous_customer_name TEXT,
    new_customer_name TEXT,
    previous_phone TEXT,
    new_phone TEXT,
    previous_wilaya TEXT,
    new_wilaya TEXT,
    previous_commune TEXT,
    new_commune TEXT,
    previous_delivery_type TEXT,
    new_delivery_type TEXT,
    previous_shipping_fee NUMERIC,
    new_shipping_fee NUMERIC,
    previous_total NUMERIC,
    new_total NUMERIC,
    financial_difference NUMERIC DEFAULT 0,
    formatted_courier_note TEXT,
    new_tracking_code TEXT,
    courier_tracking_code TEXT,
    previous_state JSONB DEFAULT '{}'::jsonb,
    new_state JSONB DEFAULT '{}'::jsonb,
    diff JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_validation_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id TEXT NOT NULL UNIQUE,
    tracking_code TEXT NOT NULL,
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    carrier_provider TEXT NOT NULL DEFAULT 'REDEX',
    ask_collection INTEGER NOT NULL CHECK (ask_collection IN (0, 1)),
    target_carrier_status TEXT NOT NULL CHECK (target_carrier_status IN ('en_ramassage', 'vers_station')),
    reconciliation_state TEXT NOT NULL CHECK (
        reconciliation_state IN (
            'PENDING_CARRIER',
            'CARRIER_ACCEPTED_DB_FAILED',
            'RECONCILED',
            'FAILED',
            'STALE_ABANDONED'
        )
    ),
    carrier_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    carrier_accepted_at TIMESTAMPTZ,
    external_carrier_status TEXT,
    verified_actor TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    lease_token TEXT,
    lease_expires_at TIMESTAMPTZ,
    recovery_receipt_signature TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cod_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL UNIQUE REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    expected_amount NUMERIC NOT NULL CHECK (expected_amount >= 0),
    collected_amount NUMERIC NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
    difference NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COLLECTED', 'RECONCILED', 'DISCREPANCY')),
    reconciled_at TIMESTAMPTZ,
    reconciled_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_session_revocations (
    sid TEXT PRIMARY KEY,
    revoked_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    reason TEXT DEFAULT 'ADMIN_LOGOUT'
);

CREATE TABLE IF NOT EXISTS public.courier_configurations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    family TEXT NOT NULL CHECK (family IN ('yalidine', 'procolis', 'ecotrack', 'maystro')),
    base_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    supports_stop_desk BOOLEAN DEFAULT true,
    api_key TEXT,
    api_token TEXT,
    api_secret TEXT,
    account_id TEXT,
    origin_hub TEXT DEFAULT '07',
    webhook_secret TEXT,
    config JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'SYSTEM',
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 4. SETTINGS SINGLETON & PUBLIC VIEW
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    brand_name TEXT DEFAULT 'ORVA Store',
    brand_name_ar TEXT DEFAULT 'متجر أورفا',
    contact_email TEXT DEFAULT 'contact@orva-store.com',
    contact_phone TEXT DEFAULT '+213 798 28 24 95',
    whatsapp TEXT DEFAULT '+213798282495',
    customer_service_phone TEXT DEFAULT '0798282495',
    customer_service_email TEXT DEFAULT 'support@orva-store.com',
    business_address TEXT DEFAULT 'Biskra, Algérie',
    origin_hub_wilaya_code INTEGER DEFAULT 7,
    origin_hub_wilaya_name TEXT DEFAULT 'Biskra',
    default_currency TEXT DEFAULT 'DZD',
    meta_pixel_id TEXT DEFAULT '',
    meta_capi_token TEXT DEFAULT '',
    meta_test_event_code TEXT DEFAULT '',
    telegram_bot_token TEXT DEFAULT '',
    telegram_chat_id TEXT DEFAULT '',
    telegram_alerts_enabled BOOLEAN DEFAULT true,
    active_courier_provider TEXT DEFAULT 'redex',
    delivery_settings JSONB DEFAULT '{"cod_enabled": true, "default_method": "DOMICILE", "origin_hub": "BISKRA_07", "custom_fees": {}}'::jsonb,
    integrations JSONB DEFAULT '{"courier": {"active_provider": "redex", "enabled": true}, "telegram": {"enabled": true, "bot_token": "", "chat_id": "", "events": ["ORDER_CREATED", "SHIPMENT_CREATED", "DELIVERED"]}, "meta": {"pixel_id": "", "capi_enabled": false, "capi_token": ""}}'::jsonb,
    localization JSONB DEFAULT '{"default_language": "ar", "supported_languages": ["ar", "fr"]}'::jsonb,
    reassurance_pillars JSONB DEFAULT '[
      {"id": 1, "titleAr": "المعاينة قبل الدفع", "descAr": "يحق لك فتح الطرد والتأكد من مطابقة جميع السلع قبل دفع المستحقات للموزع."},
      {"id": 2, "titleAr": "شحن سريع 24-48 ساعة", "descAr": "توصيل مضمون ومحكم إلى 58 ولاية من مركز التوزيع المركزي ببسكرة."},
      {"id": 3, "titleAr": "الدفع عند الاستلام 100%", "descAr": "تسوق بأمان تام بدون الحاجة إلى بطاقة بنكية، ادفع نقداً لموزع البريد عند الاستلام."},
      {"id": 4, "titleAr": "تأكيد الطلب هاتفياً", "descAr": "يتصل بك فريق خدمة العملاء قبل الشحن لتأكيد العنوان وموعد الاستلام المناسب."}
    ]'::jsonb,
    homepage_content JSONB DEFAULT '{}'::jsonb,
    social_links JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE VIEW public.public_site_settings AS
SELECT
    brand_name,
    brand_name_ar,
    customer_service_phone,
    origin_hub_wilaya_code,
    origin_hub_wilaya_name,
    default_currency
FROM public.site_settings
WHERE id = 1;

-- ============================================================================
-- 5. PERFORMANCE & LOOKUP INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_collections_slug ON public.collections(slug);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_media_product ON public.product_media(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON public.orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_code ON public.orders(tracking_code);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_tracking_number ON public.deliveries(tracking_number);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_timeline_order ON public.order_timeline_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_conversions_order_id ON public.order_conversions(order_id);
CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_tracking ON public.delivery_validation_reconciliations(tracking_code);
CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_state ON public.delivery_validation_reconciliations(reconciliation_state);
CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_order ON public.delivery_validation_reconciliations(order_id);
CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_lease ON public.delivery_validation_reconciliations(lease_expires_at) WHERE reconciliation_state = 'PENDING_CARRIER';
CREATE INDEX IF NOT EXISTS idx_reconciliation_order ON public.cod_reconciliations(order_id);
CREATE INDEX IF NOT EXISTS idx_revocations_expires_at ON public.admin_session_revocations(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) & PRIVILEGE HARDENING
-- ============================================================================

-- 6.1 Enable RLS on all 18 tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_validation_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cod_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_session_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 6.2 Drop existing policies idempotently
DO $$
DECLARE
    tbl RECORD;
    pol RECORD;
BEGIN
    FOR tbl IN
        SELECT tablename FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
              'categories', 'collections', 'products', 'product_collections',
              'variants', 'product_media', 'customers', 'orders', 'order_items',
              'deliveries', 'order_timeline_events', 'order_conversions',
              'delivery_validation_reconciliations', 'cod_reconciliations',
              'admin_session_revocations', 'site_settings', 'courier_configurations',
              'audit_logs'
          )
    LOOP
        FOR pol IN
            SELECT policyname FROM pg_catalog.pg_policies
            WHERE schemaname = 'public' AND tablename = tbl.tablename
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl.tablename);
        END LOOP;
    END LOOP;
END $$;

-- 6.3 Public Storefront Read-Only Policies (Catalog Domain)
CREATE POLICY "Public categories are viewable" ON categories FOR SELECT TO anon, authenticated, service_role USING (active = true);
CREATE POLICY "Public collections are viewable" ON collections FOR SELECT TO anon, authenticated, service_role USING (active = true);
CREATE POLICY "Published products are viewable" ON products FOR SELECT TO anon, authenticated, service_role USING (status = 'PUBLISHED');
CREATE POLICY "Published product connections are viewable" ON product_collections FOR SELECT TO anon, authenticated, service_role USING (
    product_id IN (SELECT id FROM products WHERE status = 'PUBLISHED')
);
CREATE POLICY "Published variants are viewable" ON variants FOR SELECT TO anon, authenticated, service_role USING (
    is_available = true AND product_id IN (SELECT id FROM products WHERE status = 'PUBLISHED')
);
CREATE POLICY "Published product media is viewable" ON product_media FOR SELECT TO anon, authenticated, service_role USING (
    (is_archived IS NOT TRUE) AND product_id IN (SELECT id FROM products WHERE status = 'PUBLISHED')
);

-- 6.4 Storefront Checkout Policies (INSERT only, zero SELECT for anon)
CREATE POLICY "Anon can create customers during checkout" ON customers FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);
CREATE POLICY "Anon can create orders during checkout" ON orders FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);
CREATE POLICY "Anon can create order_items during checkout" ON order_items FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);
CREATE POLICY "Anon can create deliveries record during checkout" ON deliveries FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);

-- 6.5 Service Role Full Access Policies across all 18 tables
CREATE POLICY "Service role full access on categories" ON categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on collections" ON collections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on products" ON products FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on product_collections" ON product_collections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on variants" ON variants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on product_media" ON product_media FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on customers" ON customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on orders" ON orders FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on order_items" ON order_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on deliveries" ON deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on timeline" ON order_timeline_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on order_conversions" ON order_conversions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on delivery_validation_reconciliations" ON delivery_validation_reconciliations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on reconciliations" ON cod_reconciliations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on admin_session_revocations" ON admin_session_revocations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on site_settings" ON site_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on courier_configurations" ON courier_configurations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6.6 Authenticated Admin Full Access Policies
CREATE POLICY "Admins full access on categories" ON categories FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on collections" ON collections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on products" ON products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on product_collections" ON product_collections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on variants" ON variants FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on product_media" ON product_media FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on customers" ON customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on orders" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on order_items" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on deliveries" ON deliveries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on timeline" ON order_timeline_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on order_conversions" ON order_conversions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on reconciliations" ON cod_reconciliations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on site_settings" ON site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on courier_configurations" ON courier_configurations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on audit_logs" ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6.7 Privilege Grants & Revocations
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT ON TABLE categories, collections, products, product_collections, variants, product_media TO anon;
GRANT SELECT ON public.public_site_settings TO anon, authenticated, service_role;
GRANT INSERT ON TABLE orders, customers, order_items, deliveries TO anon;

GRANT ALL PRIVILEGES ON TABLE categories, collections, products, product_collections, variants, product_media, customers, orders, order_items, deliveries, order_timeline_events, order_conversions, cod_reconciliations, site_settings, courier_configurations, audit_logs TO authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- ============================================================================
-- 7. OFFICIAL PRODUCTION SEED DATA
-- ============================================================================

-- 7.1 Category
INSERT INTO public.categories (name, slug, description, display_order, active)
VALUES ('Utility & Workshop Tools', 'tools', 'معدات الصيانة والورش واللحام الاحترافية', 1, true)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    active = EXCLUDED.active;

-- 7.2 The 3 Official Packs (Packs 1, 2, 3)
-- Pack 1: 4,950 DZD
INSERT INTO public.products (slug, sku, name, name_fr, short_description, description, base_price, original_price, savings, status, is_featured, stock_quantity, metadata)
VALUES (
    'pack1',
    'ORVA-P1-4950',
    'باك كومبريسار و المفاتيح 4 في 1',
    'Pack Compresseur & Clés 4-en-1',
    'باك الخدمة والصيانة 4 في 1 للسيارة والمنزل: منفاخ TOYOTA، علبة مفاتيح 46 قطعة STARLCE PRO، مفك مرن 11 قطعة، وطقم مفكات 6 قطع.',
    'الحل العملي الأمثل لحالات الطوارئ على الطريق وصيانة المنزل اليومية.',
    4950,
    9750,
    4800,
    'PUBLISHED',
    true,
    50,
    jsonb_build_object(
        'packId', 'PACK1',
        'itemsCount', 4,
        'heroAsset', '/images/packs/pack-1/pack1 4950.webp',
        'items', jsonb_build_array(
            'منفاخ عجلات TOYOTA مع عداد ضغط مدمج',
            'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO',
            'مفك مرن 11 قطعة STARLCE PRO',
            'طقم مفكات 6 قطع'
        )
    )
)
ON CONFLICT (slug) DO UPDATE SET
    sku = EXCLUDED.sku,
    name = EXCLUDED.name,
    name_fr = EXCLUDED.name_fr,
    short_description = EXCLUDED.short_description,
    description = EXCLUDED.description,
    base_price = EXCLUDED.base_price,
    original_price = EXCLUDED.original_price,
    savings = EXCLUDED.savings,
    status = EXCLUDED.status,
    is_featured = EXCLUDED.is_featured,
    stock_quantity = EXCLUDED.stock_quantity,
    metadata = EXCLUDED.metadata;

-- Pack 2: 12,950 DZD
INSERT INTO public.products (slug, sku, name, name_fr, short_description, description, base_price, original_price, savings, status, is_featured, stock_quantity, metadata)
VALUES (
    'pack2',
    'ORVA-P2-12950',
    'باك الفيسوز كراون Elite',
    'Pack Visseuse Crown Elite 5-en-1',
    'باك الورشة والأشغال 5 في 1: ماكينة ثقب CROWN 20V الأصلية ببطاريتين 20V، طقم مفكات 6 قطع، علبة مفاتيح 46 قطعة STARLCE PRO، مفك مرن، وقفازات حماية GILAN.',
    'مجموعة الحرفيين وعشاق الأعمال اليدوية الشاملة.',
    12950,
    21250,
    8300,
    'PUBLISHED',
    true,
    40,
    jsonb_build_object(
        'packId', 'PACK2',
        'itemsCount', 5,
        'heroAsset', '/images/packs/pack-2/pack2 12950.webp',
        'items', jsonb_build_array(
            'ماكينة ثقب CROWN 20V الأصلية (مع 2 بطاريات 20V وحقيبة 29 قطعة)',
            'طقم مفكات 6 قطع',
            'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO',
            'مفك مرن 11 قطعة STARLCE PRO',
            'قفازات حماية احترافية GILAN'
        )
    )
)
ON CONFLICT (slug) DO UPDATE SET
    sku = EXCLUDED.sku,
    name = EXCLUDED.name,
    name_fr = EXCLUDED.name_fr,
    short_description = EXCLUDED.short_description,
    description = EXCLUDED.description,
    base_price = EXCLUDED.base_price,
    original_price = EXCLUDED.original_price,
    savings = EXCLUDED.savings,
    status = EXCLUDED.status,
    is_featured = EXCLUDED.is_featured,
    stock_quantity = EXCLUDED.stock_quantity,
    metadata = EXCLUDED.metadata;

-- Pack 3: 15,950 DZD
INSERT INTO public.products (slug, sku, name, name_fr, short_description, description, base_price, original_price, savings, status, is_featured, stock_quantity, metadata)
VALUES (
    'pack3',
    'ORVA-P3-15950',
    'باك سودير كراون الصلب',
    'Pack Soudeur Crown MMA-200 Mini',
    'باك اللحام الاحترافي: ماكينة لحام CROWN CT33102 MMA-200 MINI بنظام أمان VRD، قفازات GILAN المضادة للقطع والحرارة، طقم مفكات KKKR، وقناع وفرشاة وكوابل.',
    'ماكينة اللحام المتطورة ذات الحجم الصغير والأداء الصناعي الجبار.',
    15950,
    24500,
    8550,
    'PUBLISHED',
    true,
    30,
    jsonb_build_object(
        'packId', 'PACK3',
        'itemsCount', 6,
        'heroAsset', '/images/packs/pack-3/pack3 15950.webp',
        'items', jsonb_build_array(
            'ماكينة لحام CROWN CT33102 MMA-200 MINI',
            'تحكم في قوة اللحام (Current Control)',
            'نظام أمان VRD مدمج',
            'قفازات الحماية GILAN Anti-Cut',
            'طقم مفكات 6 قطع KKKR',
            'قناع لحام + فرشاة سلك + كوابل لحام'
        )
    )
)
ON CONFLICT (slug) DO UPDATE SET
    sku = EXCLUDED.sku,
    name = EXCLUDED.name,
    name_fr = EXCLUDED.name_fr,
    short_description = EXCLUDED.short_description,
    description = EXCLUDED.description,
    base_price = EXCLUDED.base_price,
    original_price = EXCLUDED.original_price,
    savings = EXCLUDED.savings,
    status = EXCLUDED.status,
    is_featured = EXCLUDED.is_featured,
    stock_quantity = EXCLUDED.stock_quantity,
    metadata = EXCLUDED.metadata;

-- 7.3 Couriers (Redex, Yalidine, ZR Express)
INSERT INTO public.courier_configurations (id, name, name_ar, family, base_url, is_active, is_default, supports_stop_desk, origin_hub)
VALUES
    ('redex', 'Redex Delivery DZ', 'ريديكس للتوصيل (Redex)', 'ecotrack', 'https://redex.ecotrack.dz', true, true, true, '07'),
    ('yalidine', 'Yalidine Express', 'ياليدين إكسبريس (Yalidine)', 'yalidine', 'https://api.yalidine.app', true, false, true, '07'),
    ('zrexpress', 'ZR Express (Procolis)', 'زد آر إكسبريس (ZR Express)', 'procolis', 'https://procolis.com/api', true, false, true, '07')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    name_ar = EXCLUDED.name_ar,
    family = EXCLUDED.family,
    base_url = EXCLUDED.base_url,
    is_active = EXCLUDED.is_active,
    is_default = EXCLUDED.is_default,
    supports_stop_desk = EXCLUDED.supports_stop_desk,
    origin_hub = EXCLUDED.origin_hub;

-- 7.4 Site Settings Singleton (id = 1)
INSERT INTO public.site_settings (
    id, brand_name, brand_name_ar, contact_email, contact_phone, customer_service_phone,
    origin_hub_wilaya_code, origin_hub_wilaya_name, default_currency, active_courier_provider, telegram_alerts_enabled
)
VALUES (
    1, 'ORVA Store', 'متجر أورفا', 'contact@orva-store.com', '+213 798 28 24 95', '0798282495',
    7, 'Biskra', 'DZD', 'redex', true
)
ON CONFLICT (id) DO UPDATE SET
    brand_name = EXCLUDED.brand_name,
    brand_name_ar = EXCLUDED.brand_name_ar,
    contact_email = EXCLUDED.contact_email,
    contact_phone = EXCLUDED.contact_phone,
    customer_service_phone = EXCLUDED.customer_service_phone,
    origin_hub_wilaya_code = EXCLUDED.origin_hub_wilaya_code,
    origin_hub_wilaya_name = EXCLUDED.origin_hub_wilaya_name,
    default_currency = EXCLUDED.default_currency,
    active_courier_provider = EXCLUDED.active_courier_provider,
    telegram_alerts_enabled = EXCLUDED.telegram_alerts_enabled;

-- 8. POSTGREST SCHEMA CACHE RELOAD NOTIFICATION
NOTIFY pgrst, 'reload schema';

COMMIT;
