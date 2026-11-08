-- Migration: 20261107_000001_initial_schema.sql
-- Description: Production Database Schema for ORVA Store COD E-Commerce
-- Project Ref: olmsjkhdfghyydogcvvy

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. CATALOG & PRODUCTS
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_fr TEXT,
    slug TEXT NOT NULL UNIQUE,
    sku TEXT UNIQUE,
    short_description TEXT,
    description TEXT,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS product_collections (
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, collection_id)
);

CREATE TABLE IF NOT EXISTS variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sku TEXT,
    price_override NUMERIC CHECK (price_override >= 0),
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES variants(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    role TEXT DEFAULT 'GALLERY' CHECK (role IN ('COVER', 'GALLERY', 'DETAIL', 'VARIANT', 'LIFESTYLE', 'BACKGROUND', 'EDITORIAL')),
    alt_text TEXT,
    display_order INTEGER DEFAULT 0,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. CUSTOMERS, ORDERS & COD COMMERCE
CREATE TABLE IF NOT EXISTS customers (
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

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
    customer_name TEXT,
    customer_phone TEXT,
    customer_phone2 TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED')),
    payment_method TEXT DEFAULT 'COD',
    payment_status TEXT DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PAID')),
    subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
    delivery_fee NUMERIC NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
    total NUMERIC NOT NULL CHECK (total >= 0),
    currency TEXT DEFAULT 'DZD',
    delivery_method TEXT DEFAULT 'DOMICILE' CHECK (delivery_method IN ('DOMICILE', 'STOP_DESK')),
    delivery_type TEXT DEFAULT 'DOMICILE' CHECK (delivery_type IN ('DOMICILE', 'STOP_DESK')),
    delivery_wilaya TEXT NOT NULL,
    delivery_commune TEXT NOT NULL,
    delivery_address TEXT DEFAULT 'Bureau Stop-Desk',
    wilaya_code INTEGER CHECK (wilaya_code >= 1 AND wilaya_code <= 58),
    wilaya_name TEXT,
    commune_name TEXT,
    origin_hub TEXT DEFAULT 'BISKRA_07',
    tracking_code TEXT,
    tracking_url TEXT,
    courier_provider TEXT DEFAULT 'REDEX',
    risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    risk_level TEXT DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    risk_decision TEXT DEFAULT 'ACCEPT' CHECK (risk_decision IN ('ACCEPT', 'REVIEW', 'REJECT')),
    risk_reasons JSONB DEFAULT '[]'::jsonb,
    customer_notes TEXT,
    operator_notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES variants(id) ON DELETE SET NULL,
    pack_id TEXT CHECK (pack_id IN ('PACK1', 'PACK2', 'PACK3')),
    product_name_snapshot TEXT NOT NULL,
    variant_label_snapshot TEXT,
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    line_total NUMERIC NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'MOCK',
    tracking_number TEXT,
    tracking_url TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CREATED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED')),
    raw_response JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    actor TEXT NOT NULL DEFAULT 'SYSTEM',
    tracking_number TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cod_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
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

-- 3. ORDER RE-ROUTING (تحويل الطلبية), COURIERS & AUDIT
CREATE TABLE IF NOT EXISTS order_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    conversion_sequence INTEGER NOT NULL DEFAULT 1,
    timestamp_utc TIMESTAMPTZ DEFAULT now(),
    operator TEXT NOT NULL DEFAULT 'SYSTEM',
    reason TEXT NOT NULL,
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
    courier_tracking_code TEXT,
    diff JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courier_configurations (
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

CREATE TABLE IF NOT EXISTS audit_logs (
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

-- 4. STORE SETTINGS & CMS CONTENT (SINGLETON)
CREATE TABLE IF NOT EXISTS site_settings (
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

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_deliveries_tracking ON deliveries(tracking_number);
CREATE INDEX IF NOT EXISTS idx_timeline_order ON order_timeline_events(order_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_order ON cod_reconciliations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_conversions_order ON order_conversions(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- 6. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cod_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- 6.1 Public Storefront Read-Only Policies
CREATE POLICY "Public categories are viewable" ON categories FOR SELECT USING (active = true);
CREATE POLICY "Public collections are viewable" ON collections FOR SELECT USING (active = true);
CREATE POLICY "Published products are viewable" ON products FOR SELECT USING (status = 'PUBLISHED');
CREATE POLICY "Published product connections are viewable" ON product_collections FOR SELECT USING (
    product_id IN (SELECT id FROM products WHERE status = 'PUBLISHED')
);
CREATE POLICY "Published variants are viewable" ON variants FOR SELECT USING (
    product_id IN (SELECT id FROM products WHERE status = 'PUBLISHED')
);
CREATE POLICY "Published product media is viewable" ON product_media FOR SELECT USING (
    product_id IN (SELECT id FROM products WHERE status = 'PUBLISHED')
);
-- Safe public storefront view (exposes ONLY non-sensitive branding and hub info)
CREATE OR REPLACE VIEW public_site_settings AS
SELECT
    brand_name,
    brand_name_ar,
    customer_service_phone,
    origin_hub_wilaya_code,
    default_currency
FROM site_settings
WHERE id = 1;

GRANT SELECT ON public_site_settings TO anon, authenticated, service_role;

-- 6.2 Anonymous 1-Page COD Checkout Insert Policies
CREATE POLICY "Anon can create customers during checkout" ON customers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anon can create orders during checkout" ON orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anon can create order_items during checkout" ON order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anon can create deliveries record during checkout" ON deliveries FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 6.3 Service Role & Authenticated Admin Full Access
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
CREATE POLICY "Service role full access on reconciliations" ON cod_reconciliations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on order_conversions" ON order_conversions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on courier_configurations" ON courier_configurations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on audit_logs" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on site_settings" ON site_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Admin Policies
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
CREATE POLICY "Admins full access on reconciliations" ON cod_reconciliations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on order_conversions" ON order_conversions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on courier_configurations" ON courier_configurations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on audit_logs" ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access on site_settings" ON site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 7. SEED DATA (THE 3 PACKS, COURIERS & SINGLETON SETTINGS)
INSERT INTO categories (name, slug, description, display_order)
VALUES ('Utility & Workshop Tools', 'tools', 'معدات الصيانة والورش واللحام الاحترافية', 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO products (slug, sku, name, name_fr, short_description, description, base_price, original_price, savings, status, is_featured, stock_quantity, metadata)
VALUES
    ('pack1', 'ORVA-P1-4950', 'باك كومبريسار و المفاتيح 4 في 1', 'Pack Compresseur & Clés 4-en-1', 'باك الخدمة والصيانة 4 في 1 للسيارة والمنزل: منفاخ TOYOTA، علبة مفاتيح 46 قطعة STARLCE PRO، مفك مرن 11 قطعة، وطقم مفكات 6 قطع.', 'الحل العملي الأمثل لحالات الطوارئ على الطريق وصيانة المنزل اليومية.', 4950, 9750, 4800, 'PUBLISHED', true, 50, '{"packId": "PACK1", "itemsCount": 4, "heroAsset": "/images/packs/pack-1/pack1 4950.webp", "items": ["منفاخ عجلات TOYOTA مع عداد ضغط مدمج", "علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO", "مفك مرن 11 قطعة STARLCE PRO", "طقم مفكات 6 قطع"]}'::jsonb),
    ('pack2', 'ORVA-P2-12950', 'باك الفيسوز كراون Elite', 'Pack Visseuse Crown Elite 5-en-1', 'باك الورشة والأشغال 5 في 1: ماكينة ثقب CROWN 20V الأصلية ببطاريتين 20V، طقم مفكات 6 قطع، علبة مفاتيح 46 قطعة STARLCE PRO، مفك مرن، وقفازات حماية GILAN.', 'مجموعة الحرفيين وعشاق الأعمال اليدوية الشاملة.', 12950, 21250, 8300, 'PUBLISHED', true, 40, '{"packId": "PACK2", "itemsCount": 5, "heroAsset": "/images/packs/pack-2/pack2 12950.webp", "items": ["ماكينة ثقب CROWN 20V الأصلية (مع 2 بطاريات 20V وحقيبة 29 قطعة)", "طقم مفكات 6 قطع", "علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO", "مفك مرن 11 قطعة STARLCE PRO", "قفازات حماية احترافية GILAN"]}'::jsonb),
    ('pack3', 'ORVA-P3-15950', 'باك سودير كراون الصلب', 'Pack Soudeur Crown MMA-200 Mini', 'باك اللحام الاحترافي: ماكينة لحام CROWN CT33102 MMA-200 MINI بنظام أمان VRD، قفازات GILAN المضادة للقطع والحرارة، طقم مفكات KKKR، وقناع وفرشاة وكوابل.', 'ماكينة اللحام المتطورة ذات الحجم الصغير والأداء الصناعي الجبار.', 15950, 24500, 8550, 'PUBLISHED', true, 30, '{"packId": "PACK3", "itemsCount": 6, "heroAsset": "/images/packs/pack-3/pack3 15950.webp", "items": ["ماكينة لحام CROWN CT33102 MMA-200 MINI", "تحكم في قوة اللحام (Current Control)", "نظام أمان VRD مدمج", "قفازات الحماية GILAN Anti-Cut", "طقم مفكات 6 قطع KKKR", "قناع لحام + فرشاة سلك + كوابل لحام"]}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET
    base_price = EXCLUDED.base_price,
    original_price = EXCLUDED.original_price,
    savings = EXCLUDED.savings,
    metadata = EXCLUDED.metadata;

INSERT INTO courier_configurations (id, name, name_ar, family, base_url, is_active, is_default, supports_stop_desk, origin_hub)
VALUES
    ('redex', 'Redex Delivery DZ', 'ريديكس للتوصيل (Redex)', 'ecotrack', 'https://redex.ecotrack.dz', true, true, true, '07'),
    ('yalidine', 'Yalidine Express', 'ياليدين إكسبريس (Yalidine)', 'yalidine', 'https://api.yalidine.app', true, false, true, '07'),
    ('zrexpress', 'ZR Express (Procolis)', 'زد آر إكسبريس (ZR Express)', 'procolis', 'https://procolis.com/api', true, false, true, '07')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    name_ar = EXCLUDED.name_ar,
    family = EXCLUDED.family,
    base_url = EXCLUDED.base_url;

INSERT INTO site_settings (id, brand_name, brand_name_ar, customer_service_phone, origin_hub_wilaya_code, origin_hub_wilaya_name, default_currency, active_courier_provider)
VALUES (1, 'ORVA Store', 'متجر أورفا', '0798282495', 7, 'Biskra', 'DZD', 'redex')
ON CONFLICT (id) DO UPDATE SET
    brand_name = EXCLUDED.brand_name,
    brand_name_ar = EXCLUDED.brand_name_ar,
    customer_service_phone = EXCLUDED.customer_service_phone,
    origin_hub_wilaya_code = EXCLUDED.origin_hub_wilaya_code,
    origin_hub_wilaya_name = EXCLUDED.origin_hub_wilaya_name;
