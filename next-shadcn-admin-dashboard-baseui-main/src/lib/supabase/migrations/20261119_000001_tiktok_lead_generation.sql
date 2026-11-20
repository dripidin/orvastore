-- ============================================================================
-- ORVA Store — TikTok Lead Generation Integration (Phase A1 Foundation)
-- Migration: 20261119_000001_tiktok_lead_generation.sql
--
-- Scope:
--   Strictly additive migration creating the 6 isolated TikTok Lead Generation
--   tables with relational foreign keys, UNIQUE constraints, CHECK constraints,
--   performance indexes, and strict service_role-only RLS & privilege hardening.
--
-- Safety Guarantees:
--   - Does NOT modify existing public.orders, public.products, public.deliveries,
--     or public.site_settings tables.
--   - Fully transactional and idempotent (safe to re-run).
--   - Zero PUBLIC, anon, or authenticated access to tokens or customer lead PII.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- ============================================================================
-- 1. TIKTOK OAUTH CONNECTIONS (ENCRYPTED TOKENS ONLY)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL DEFAULT 'orvastore' CHECK (length(trim(store_id)) > 0),
    app_id TEXT NOT NULL CHECK (length(trim(app_id)) > 0),
    access_token_encrypted TEXT NOT NULL CHECK (length(trim(access_token_encrypted)) > 0),
    refresh_token_encrypted TEXT,
    token_encryption_version SMALLINT NOT NULL DEFAULT 1 CHECK (token_encryption_version >= 1),
    scopes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scopes) = 'array'),
    status TEXT NOT NULL DEFAULT 'connected' CHECK (
        status IN ('connected', 'token_expired', 'revoked', 'disconnected', 'error')
    ),
    token_expires_at TIMESTAMPTZ,
    refresh_expires_at TIMESTAMPTZ,
    selected_advertiser_id TEXT,
    connected_by TEXT NOT NULL DEFAULT 'admin' CHECK (length(trim(connected_by)) > 0),
    last_error TEXT,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tiktok_connections_store_id_key UNIQUE (store_id)
);

-- ============================================================================
-- 2. TIKTOK ADVERTISER ACCOUNTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_ad_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL DEFAULT 'orvastore' CHECK (length(trim(store_id)) > 0),
    connection_id UUID NOT NULL REFERENCES public.tiktok_connections(id) ON DELETE CASCADE,
    advertiser_id TEXT NOT NULL CHECK (length(trim(advertiser_id)) > 0),
    advertiser_name TEXT NOT NULL CHECK (length(trim(advertiser_name)) > 0),
    currency TEXT NOT NULL DEFAULT 'DZD',
    timezone TEXT NOT NULL DEFAULT 'Africa/Algiers',
    account_status TEXT NOT NULL DEFAULT 'STATUS_ENABLE',
    is_selected BOOLEAN NOT NULL DEFAULT false,
    webhook_subscribed BOOLEAN NOT NULL DEFAULT false,
    webhook_subscription_id TEXT,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tiktok_ad_accounts_advertiser_id_key UNIQUE (advertiser_id)
);

-- ============================================================================
-- 3. TIKTOK INSTANT FORMS (PAGES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL DEFAULT 'orvastore' CHECK (length(trim(store_id)) > 0),
    advertiser_id TEXT NOT NULL REFERENCES public.tiktok_ad_accounts(advertiser_id) ON DELETE CASCADE,
    form_id TEXT NOT NULL CHECK (length(trim(form_id)) > 0),
    form_name TEXT NOT NULL CHECK (length(trim(form_name)) > 0),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (
        status IN ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED', 'UNKNOWN')
    ),
    fields_schema JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(fields_schema) = 'array'),
    sync_enabled BOOLEAN NOT NULL DEFAULT false,
    last_synced_at TIMESTAMPTZ,
    total_leads_imported INTEGER NOT NULL DEFAULT 0 CHECK (total_leads_imported >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tiktok_forms_form_id_key UNIQUE (form_id)
);

-- ============================================================================
-- 4. TIKTOK FORM -> ORVA PRODUCT MAPPINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_form_product_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL DEFAULT 'orvastore' CHECK (length(trim(store_id)) > 0),
    form_id TEXT NOT NULL REFERENCES public.tiktok_forms(form_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    pack_id TEXT NOT NULL CHECK (length(trim(pack_id)) > 0),
    product_name TEXT NOT NULL CHECK (length(trim(product_name)) > 0),
    product_price NUMERIC NOT NULL CHECK (product_price >= 0),
    default_wilaya_code INTEGER NOT NULL DEFAULT 16 CHECK (default_wilaya_code BETWEEN 1 AND 58),
    default_delivery_type TEXT NOT NULL DEFAULT 'DOMICILE' CHECK (
        default_delivery_type IN ('DOMICILE', 'STOP_DESK')
    ),
    auto_create_order BOOLEAN NOT NULL DEFAULT true,
    lead_source_label TEXT NOT NULL DEFAULT 'tiktok_ads' CHECK (length(trim(lead_source_label)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tiktok_form_product_mappings_form_id_key UNIQUE (form_id)
);

-- ============================================================================
-- 5. TIKTOK LEADS (IDEMPOTENT EXTERNAL LEAD LEDGER)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL DEFAULT 'orvastore' CHECK (length(trim(store_id)) > 0),
    external_lead_id TEXT NOT NULL CHECK (length(trim(external_lead_id)) > 0),
    form_id TEXT NOT NULL CHECK (length(trim(form_id)) > 0),
    advertiser_id TEXT NOT NULL CHECK (length(trim(advertiser_id)) > 0),
    campaign_id TEXT,
    campaign_name TEXT,
    adgroup_id TEXT,
    ad_id TEXT,
    customer_name TEXT,
    customer_phone_raw TEXT,
    customer_phone_normalized TEXT,
    phone_valid BOOLEAN NOT NULL DEFAULT false,
    wilaya_code INTEGER CHECK (wilaya_code IS NULL OR (wilaya_code BETWEEN 1 AND 58)),
    wilaya_name TEXT,
    commune_name TEXT,
    delivery_address TEXT,
    mapped_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    mapped_product_name TEXT,
    order_id TEXT REFERENCES public.orders(order_id) ON DELETE SET NULL,
    sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        sync_status IN (
            'pending',
            'order_created',
            'lead_saved_no_order',
            'duplicate_skipped',
            'invalid_phone',
            'unmapped_form',
            'order_creation_failed'
        )
    ),
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    error_message TEXT,
    raw_field_data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_field_data) = 'object'),
    lead_created_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tiktok_leads_external_lead_id_key UNIQUE (external_lead_id)
);

-- ============================================================================
-- 6. TIKTOK SYNCHRONIZATION AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiktok_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id TEXT NOT NULL DEFAULT 'orvastore' CHECK (length(trim(store_id)) > 0),
    advertiser_id TEXT,
    form_id TEXT,
    trigger_source TEXT NOT NULL CHECK (
        trigger_source IN ('manual', 'webhook', 'scheduled', 'reconciliation')
    ),
    status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    leads_fetched INTEGER NOT NULL DEFAULT 0 CHECK (leads_fetched >= 0),
    leads_imported INTEGER NOT NULL DEFAULT 0 CHECK (leads_imported >= 0),
    orders_created INTEGER NOT NULL DEFAULT 0 CHECK (orders_created >= 0),
    duplicates_skipped INTEGER NOT NULL DEFAULT 0 CHECK (duplicates_skipped >= 0),
    leads_failed INTEGER NOT NULL DEFAULT 0 CHECK (leads_failed >= 0),
    duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
    error_message TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 7. PERFORMANCE & LOOKUP INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tiktok_connections_status
    ON public.tiktok_connections (status);

CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_connection_id
    ON public.tiktok_ad_accounts (connection_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_ad_accounts_store_selected
    ON public.tiktok_ad_accounts (store_id, is_selected)
    WHERE is_selected = true;

CREATE INDEX IF NOT EXISTS idx_tiktok_forms_advertiser_id
    ON public.tiktok_forms (advertiser_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_forms_sync_enabled
    ON public.tiktok_forms (advertiser_id, sync_enabled)
    WHERE sync_enabled = true;

CREATE INDEX IF NOT EXISTS idx_tiktok_form_mappings_product_id
    ON public.tiktok_form_product_mappings (product_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_leads_form_id
    ON public.tiktok_leads (form_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_leads_advertiser_id
    ON public.tiktok_leads (advertiser_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_leads_sync_status
    ON public.tiktok_leads (sync_status);

CREATE INDEX IF NOT EXISTS idx_tiktok_leads_order_id
    ON public.tiktok_leads (order_id)
    WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tiktok_leads_imported_at
    ON public.tiktok_leads (imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_started_at
    ON public.tiktok_sync_logs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_tiktok_sync_logs_advertiser_form
    ON public.tiktok_sync_logs (advertiser_id, form_id);

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) & STRICT PRIVILEGE HARDENING
-- ============================================================================

ALTER TABLE public.tiktok_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_form_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_sync_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tiktok_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_ad_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_forms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_form_product_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_leads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_sync_logs FORCE ROW LEVEL SECURITY;

-- Drop existing policies idempotently
DROP POLICY IF EXISTS "Service role full access on tiktok_connections" ON public.tiktok_connections;
DROP POLICY IF EXISTS "Service role full access on tiktok_ad_accounts" ON public.tiktok_ad_accounts;
DROP POLICY IF EXISTS "Service role full access on tiktok_forms" ON public.tiktok_forms;
DROP POLICY IF EXISTS "Service role full access on tiktok_form_product_mappings" ON public.tiktok_form_product_mappings;
DROP POLICY IF EXISTS "Service role full access on tiktok_leads" ON public.tiktok_leads;
DROP POLICY IF EXISTS "Service role full access on tiktok_sync_logs" ON public.tiktok_sync_logs;

-- Service role ONLY policies (zero anon or authenticated browser access to tokens or leads)
CREATE POLICY "Service role full access on tiktok_connections"
    ON public.tiktok_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on tiktok_ad_accounts"
    ON public.tiktok_ad_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on tiktok_forms"
    ON public.tiktok_forms FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on tiktok_form_product_mappings"
    ON public.tiktok_form_product_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on tiktok_leads"
    ON public.tiktok_leads FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on tiktok_sync_logs"
    ON public.tiktok_sync_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Explicit privilege revocations and minimal service_role grants
REVOKE ALL PRIVILEGES ON TABLE
    public.tiktok_connections,
    public.tiktok_ad_accounts,
    public.tiktok_forms,
    public.tiktok_form_product_mappings,
    public.tiktok_leads,
    public.tiktok_sync_logs
FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
    public.tiktok_connections,
    public.tiktok_ad_accounts,
    public.tiktok_forms,
    public.tiktok_form_product_mappings,
    public.tiktok_leads,
    public.tiktok_sync_logs
TO service_role;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
