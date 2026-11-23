-- ============================================================================
-- ORVA Store — Multi-Courier Logistics Hub, Full EcoTrack 6-Section API,
-- 69 Algerian Wilayas, Excel/API Reconciliation, AI File Memory &
-- Many-to-Many Meta Ads Profitability
-- Migration: 20261123_000001_logistics_hub_69_wilayas_and_multi_ads.sql
-- Idempotent & safe for both live Supabase and local PGlite verification.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- 1. Upgrade Wilaya constraints from 58 -> 69 (Law 26-06)
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_wilaya_code_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_wilaya_code_check CHECK (wilaya_code IS NULL OR (wilaya_code >= 1 AND wilaya_code <= 69));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = 'tiktok_form_product_mappings'
  ) THEN
    ALTER TABLE public.tiktok_form_product_mappings DROP CONSTRAINT IF EXISTS tiktok_form_product_mappings_default_wilaya_code_check;
    ALTER TABLE public.tiktok_form_product_mappings ADD CONSTRAINT tiktok_form_product_mappings_default_wilaya_code_check CHECK (default_wilaya_code BETWEEN 1 AND 69);
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = 'tiktok_leads'
  ) THEN
    ALTER TABLE public.tiktok_leads DROP CONSTRAINT IF EXISTS tiktok_leads_wilaya_code_check;
    ALTER TABLE public.tiktok_leads ADD CONSTRAINT tiktok_leads_wilaya_code_check CHECK (wilaya_code IS NULL OR (wilaya_code BETWEEN 1 AND 69));
  END IF;
END $$;

-- 2. Expand courier_configurations family & columns
ALTER TABLE public.courier_configurations DROP CONSTRAINT IF EXISTS courier_configurations_family_check;
ALTER TABLE public.courier_configurations ADD CONSTRAINT courier_configurations_family_check CHECK (
  family IN ('ecotrack', 'yalidine', 'procolis', 'zrexpress', 'noest', 'maystro', 'excel_only', 'custom')
);

ALTER TABLE public.courier_configurations
  ADD COLUMN IF NOT EXISTS auto_validate BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_external_excel_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tracking_url_template TEXT,
  ADD COLUMN IF NOT EXISTS rate_limit_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS store_identifiers JSONB NOT NULL DEFAULT '["ORVA","ORV-","PACK1-","PACK2-","PACK3-","REROUTE-","ORD-"]'::jsonb;

-- 3. Ensure delivery_fees exists and supports return / pickup / exchange tariffs
CREATE TABLE IF NOT EXISTS public.delivery_fees (
  wilaya_id INTEGER NOT NULL,
  service_type TEXT NOT NULL DEFAULT 'ecotrack',
  tarif_domicile NUMERIC NOT NULL DEFAULT 0,
  tarif_stopdesk NUMERIC NOT NULL DEFAULT 0,
  tarif_retour NUMERIC NOT NULL DEFAULT 0,
  tarif_pickup NUMERIC NOT NULL DEFAULT 0,
  tarif_echange NUMERIC NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wilaya_id, service_type)
);

ALTER TABLE public.delivery_fees
  ADD COLUMN IF NOT EXISTS tarif_retour NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_pickup NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarif_echange NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.delivery_fees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Delivery fees are readable" ON public.delivery_fees;
CREATE POLICY "Delivery fees are readable" ON public.delivery_fees
  FOR SELECT TO anon, authenticated, service_role USING (true);
DROP POLICY IF EXISTS "Service role full access on delivery_fees" ON public.delivery_fees;
CREATE POLICY "Service role full access on delivery_fees" ON public.delivery_fees
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Expand public.orders with Attribution Columns, Dual-Track Status Bridge, Driver/Desk/Remarks, and Return Fees
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fb_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS attribution_source TEXT DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS redex_tracking_id TEXT,
  ADD COLUMN IF NOT EXISTS courier_id TEXT DEFAULT 'redex',
  ADD COLUMN IF NOT EXISTS courier_status TEXT,
  ADD COLUMN IF NOT EXISTS courier_status_ar TEXT,
  ADD COLUMN IF NOT EXISTS normalized_courier_status TEXT,
  ADD COLUMN IF NOT EXISTS courier_location_stage TEXT,
  ADD COLUMN IF NOT EXISTS courier_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_source TEXT DEFAULT 'store',
  ADD COLUMN IF NOT EXISTS manual_status_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_order_id TEXT,
  ADD COLUMN IF NOT EXISTS import_source TEXT DEFAULT 'storefront',
  ADD COLUMN IF NOT EXISTS tracking_checkpoints JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS return_fee_dzd NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS driver_phone TEXT,
  ADD COLUMN IF NOT EXISTS current_station TEXT,
  ADD COLUMN IF NOT EXISTS desk_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS courier_remarks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS financial_status TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_fb_campaign_id
  ON public.orders (fb_campaign_id) WHERE fb_campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_utm_campaign
  ON public.orders (utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_attribution_source
  ON public.orders (attribution_source);
CREATE INDEX IF NOT EXISTS idx_orders_redex_tracking_id
  ON public.orders (redex_tracking_id) WHERE redex_tracking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_courier_id
  ON public.orders (courier_id) WHERE courier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_normalized_courier_status
  ON public.orders (normalized_courier_status) WHERE normalized_courier_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_external_order_id
  ON public.orders (external_order_id) WHERE external_order_id IS NOT NULL;

-- Harden search_path on sync_orders_dual_columns while keeping all columns synchronized
CREATE OR REPLACE FUNCTION public.sync_orders_dual_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
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
    NEW.redex_tracking_id := COALESCE(NEW.redex_tracking_id, NEW.redex_tracking_code, NEW.tracking_code);
    NEW.redex_tracking_code := COALESCE(NEW.redex_tracking_code, NEW.redex_tracking_id, NEW.tracking_code);
    NEW.tracking_code := COALESCE(NEW.tracking_code, NEW.redex_tracking_id, NEW.redex_tracking_code);
    NEW.attribution_source := COALESCE(NULLIF(trim(NEW.attribution_source), ''), 'direct');
    NEW.courier_id := COALESCE(NULLIF(trim(NEW.courier_id), ''), lower(NULLIF(trim(NEW.courier_provider), '')), lower(NULLIF(trim(NEW.courier), '')), 'redex');
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Backfill attribution, tracking, and courier_id on existing orders cleanly (also validates trg_sync_orders_dual_columns)
UPDATE public.orders
SET
  fb_campaign_id = COALESCE(NULLIF(trim(fb_campaign_id), ''), NULLIF(trim(metadata->'attribution'->>'fb_campaign_id'), '')),
  fb_adset_id = COALESCE(NULLIF(trim(fb_adset_id), ''), NULLIF(trim(metadata->'attribution'->>'fb_adset_id'), '')),
  fb_ad_id = COALESCE(NULLIF(trim(fb_ad_id), ''), NULLIF(trim(metadata->'attribution'->>'fb_ad_id'), '')),
  fbclid = COALESCE(NULLIF(trim(fbclid), ''), NULLIF(trim(metadata->'attribution'->>'fbclid'), '')),
  utm_campaign = COALESCE(NULLIF(trim(utm_campaign), ''), NULLIF(trim(metadata->'attribution'->>'utm_campaign'), '')),
  attribution_source = COALESCE(
    NULLIF(NULLIF(trim(attribution_source), ''), 'direct'),
    NULLIF(trim(metadata->'attribution'->>'attribution_source'), ''),
    'direct'
  ),
  redex_tracking_id = COALESCE(
    NULLIF(trim(redex_tracking_id), ''),
    NULLIF(trim(redex_tracking_code), ''),
    NULLIF(trim(tracking_code), ''),
    NULLIF(trim(metadata->'attribution'->>'redex_tracking_id'), '')
  ),
  courier_id = COALESCE(
    NULLIF(NULLIF(lower(trim(courier_id)), ''), 'redex'),
    NULLIF(NULLIF(lower(trim(courier_provider)), ''), 'redex'),
    NULLIF(NULLIF(lower(trim(courier)), ''), 'redex'),
    NULLIF(lower(trim(courier_id)), ''),
    'redex'
  )
WHERE (
  fb_campaign_id IS NULL AND NULLIF(trim(metadata->'attribution'->>'fb_campaign_id'), '') IS NOT NULL
) OR (
  fb_adset_id IS NULL AND NULLIF(trim(metadata->'attribution'->>'fb_adset_id'), '') IS NOT NULL
) OR (
  fb_ad_id IS NULL AND NULLIF(trim(metadata->'attribution'->>'fb_ad_id'), '') IS NOT NULL
) OR (
  fbclid IS NULL AND NULLIF(trim(metadata->'attribution'->>'fbclid'), '') IS NOT NULL
) OR (
  utm_campaign IS NULL AND NULLIF(trim(metadata->'attribution'->>'utm_campaign'), '') IS NOT NULL
) OR (
  attribution_source IS NULL
  OR (
    attribution_source = 'direct'
    AND NULLIF(trim(metadata->'attribution'->>'attribution_source'), '') IS NOT NULL
    AND trim(metadata->'attribution'->>'attribution_source') <> 'direct'
  )
) OR (
  redex_tracking_id IS NULL
  AND (
    NULLIF(trim(redex_tracking_code), '') IS NOT NULL
    OR NULLIF(trim(tracking_code), '') IS NOT NULL
    OR NULLIF(trim(metadata->'attribution'->>'redex_tracking_id'), '') IS NOT NULL
  )
) OR courier_id IS NULL OR (
  courier_id = 'redex'
  AND (
    NULLIF(NULLIF(lower(trim(courier_provider)), ''), 'redex') IS NOT NULL
    OR NULLIF(NULLIF(lower(trim(courier)), ''), 'redex') IS NOT NULL
  )
);

-- 5. Per-Courier 69-Wilaya Coverage & Tariffs (including tarif_retour)
CREATE TABLE IF NOT EXISTS public.courier_wilaya_coverage (
  courier_id TEXT NOT NULL REFERENCES public.courier_configurations(id) ON DELETE CASCADE,
  wilaya_code INTEGER NOT NULL CHECK (wilaya_code BETWEEN 1 AND 69),
  is_active BOOLEAN NOT NULL DEFAULT true,
  home_enabled BOOLEAN NOT NULL DEFAULT true,
  stop_desk_enabled BOOLEAN NOT NULL DEFAULT false,
  tarif_domicile NUMERIC NOT NULL DEFAULT 0 CHECK (tarif_domicile >= 0),
  tarif_stopdesk NUMERIC NOT NULL DEFAULT 0 CHECK (tarif_stopdesk >= 0),
  tarif_retour NUMERIC NOT NULL DEFAULT 0 CHECK (tarif_retour >= 0),
  tarif_pickup NUMERIC NOT NULL DEFAULT 0 CHECK (tarif_pickup >= 0),
  tarif_echange NUMERIC NOT NULL DEFAULT 0 CHECK (tarif_echange >= 0),
  mapped_carrier_wilaya_code INTEGER CHECK (mapped_carrier_wilaya_code IS NULL OR (mapped_carrier_wilaya_code BETWEEN 1 AND 69)),
  source TEXT NOT NULL DEFAULT 'manual',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (courier_id, wilaya_code)
);

CREATE INDEX IF NOT EXISTS idx_courier_wilaya_coverage_wilaya
  ON public.courier_wilaya_coverage (wilaya_code, is_active);

-- 6. Courier Stop Desks / Stations
CREATE TABLE IF NOT EXISTS public.courier_stop_desks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id TEXT NOT NULL REFERENCES public.courier_configurations(id) ON DELETE CASCADE,
  station_code TEXT NOT NULL,
  name TEXT NOT NULL,
  wilaya_code INTEGER NOT NULL CHECK (wilaya_code BETWEEN 1 AND 69),
  commune TEXT,
  address TEXT,
  phones JSONB NOT NULL DEFAULT '[]'::jsonb,
  map_url TEXT,
  working_hours TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (courier_id, station_code)
);

CREATE INDEX IF NOT EXISTS idx_courier_stop_desks_courier_wilaya
  ON public.courier_stop_desks (courier_id, wilaya_code, is_active);

-- 7. Courier API Telemetry & Rate-Limit Logs
CREATE TABLE IF NOT EXISTS public.courier_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'GET',
  status_code INTEGER,
  latency_ms INTEGER,
  rate_limit_remaining INTEGER,
  rate_limit_reset TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_api_logs_courier_created
  ON public.courier_api_logs (courier_id, created_at DESC);

-- 8. Excel / API Reconciliation Imports & Rows
CREATE TABLE IF NOT EXISTS public.reconciliation_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_id TEXT NOT NULL,
  courier_name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('excel', 'csv', 'api_sync', 'multi_file')),
  file_name TEXT,
  file_hash TEXT,
  file_role TEXT NOT NULL DEFAULT 'courier_export',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  matched_synced INTEGER NOT NULL DEFAULT 0 CHECK (matched_synced >= 0),
  matched_unsynced INTEGER NOT NULL DEFAULT 0 CHECK (matched_unsynced >= 0),
  store_only INTEGER NOT NULL DEFAULT 0 CHECK (store_only >= 0),
  courier_only INTEGER NOT NULL DEFAULT 0 CHECK (courier_only >= 0),
  duplicates_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicates_count >= 0),
  store_owned_returns_count INTEGER NOT NULL DEFAULT 0 CHECK (store_owned_returns_count >= 0),
  comparison_vs_previous JSONB NOT NULL DEFAULT '{}'::jsonb,
  notification_level TEXT NOT NULL DEFAULT 'info' CHECK (
    notification_level IN ('info', 'fresh', 'updated', 'duplicate', 'stale_warning')
  ),
  notification_message TEXT,
  accounting_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_imports_courier_created
  ON public.reconciliation_imports (courier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_imports_file_hash
  ON public.reconciliation_imports (file_hash) WHERE file_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reconciliation_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.reconciliation_imports(id) ON DELETE CASCADE,
  courier_id TEXT NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('matched_synced', 'matched_unsynced', 'store_only', 'courier_only', 'duplicate')),
  store_order_id TEXT,
  tracking_code TEXT,
  reference TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  wilaya_code INTEGER,
  wilaya_name TEXT,
  commune TEXT,
  store_status TEXT,
  courier_status TEXT,
  normalized_courier_status TEXT,
  cod_amount NUMERIC DEFAULT 0,
  delivery_fee NUMERIC DEFAULT 0,
  return_fee NUMERIC DEFAULT 0,
  financial_status TEXT,
  is_store_owned_return BOOLEAN NOT NULL DEFAULT false,
  diff JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_status TEXT NOT NULL DEFAULT 'open' CHECK (
    resolution_status IN ('open', 'synced', 'imported', 'pushed', 'linked', 'switched', 'resolved', 'ignored')
  ),
  resolved_at TIMESTAMPTZ,
  raw_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_rows_import_bucket
  ON public.reconciliation_rows (import_id, bucket);
CREATE INDEX IF NOT EXISTS idx_reconciliation_rows_tracking
  ON public.reconciliation_rows (tracking_code) WHERE tracking_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reconciliation_rows_store_order
  ON public.reconciliation_rows (store_order_id) WHERE store_order_id IS NOT NULL;

-- 9. Persistent Store for Files Uploaded to Orva Agent AI (Old vs New Awareness + Accounting)
CREATE TABLE IF NOT EXISTS public.ai_uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
  file_role TEXT NOT NULL DEFAULT 'orders_export',
  courier_id TEXT,
  courier_name TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  order_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  accounting_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  diff_vs_previous JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_alert TEXT NOT NULL DEFAULT 'fresh' CHECK (
    status_alert IN ('fresh', 'updated', 'duplicate', 'stale_warning')
  ),
  alert_message TEXT,
  raw_preview JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_uploaded_files_hash
  ON public.ai_uploaded_files (file_hash);
CREATE INDEX IF NOT EXISTS idx_ai_uploaded_files_courier_created
  ON public.ai_uploaded_files (courier_id, created_at DESC);

-- 10. Many-to-Many Product <-> Meta Ads Campaign Links
CREATE TABLE IF NOT EXISTS public.product_campaign_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  campaign_key TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  cost_mode TEXT NOT NULL DEFAULT 'meta_live_cpa' CHECK (
    cost_mode IN ('meta_live_cpa', 'campaign_budget_cpa', 'fixed_cpa')
  ),
  campaign_spend_usd NUMERIC,
  campaign_spend_dzd NUMERIC,
  exchange_rate_dzd NUMERIC DEFAULT 245 CHECK (exchange_rate_dzd IS NULL OR exchange_rate_dzd > 0),
  attributed_orders_count INTEGER DEFAULT 0 CHECK (attributed_orders_count IS NULL OR attributed_orders_count >= 0),
  computed_cpa_dzd NUMERIC NOT NULL DEFAULT 0 CHECK (computed_cpa_dzd >= 0),
  allocation_weight NUMERIC NOT NULL DEFAULT 1.0 CHECK (allocation_weight > 0),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, campaign_key)
);

CREATE INDEX IF NOT EXISTS idx_product_campaign_links_product
  ON public.product_campaign_links (product_id);
CREATE INDEX IF NOT EXISTS idx_product_campaign_links_campaign
  ON public.product_campaign_links (campaign_id) WHERE campaign_id IS NOT NULL;

-- 11. RLS & Privilege Hardening on all new tables
ALTER TABLE public.courier_wilaya_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_stop_desks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courier_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_campaign_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public coverage readable" ON public.courier_wilaya_coverage;
CREATE POLICY "Public coverage readable" ON public.courier_wilaya_coverage
  FOR SELECT TO anon, authenticated, service_role USING (is_active = true);
DROP POLICY IF EXISTS "Service role full access on courier_wilaya_coverage" ON public.courier_wilaya_coverage;
CREATE POLICY "Service role full access on courier_wilaya_coverage" ON public.courier_wilaya_coverage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public stop desks readable" ON public.courier_stop_desks;
CREATE POLICY "Public stop desks readable" ON public.courier_stop_desks
  FOR SELECT TO anon, authenticated, service_role USING (is_active = true);
DROP POLICY IF EXISTS "Service role full access on courier_stop_desks" ON public.courier_stop_desks;
CREATE POLICY "Service role full access on courier_stop_desks" ON public.courier_stop_desks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on courier_api_logs" ON public.courier_api_logs;
CREATE POLICY "Service role full access on courier_api_logs" ON public.courier_api_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on reconciliation_imports" ON public.reconciliation_imports;
CREATE POLICY "Service role full access on reconciliation_imports" ON public.reconciliation_imports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on reconciliation_rows" ON public.reconciliation_rows;
CREATE POLICY "Service role full access on reconciliation_rows" ON public.reconciliation_rows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on ai_uploaded_files" ON public.ai_uploaded_files;
CREATE POLICY "Service role full access on ai_uploaded_files" ON public.ai_uploaded_files
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on product_campaign_links" ON public.product_campaign_links;
CREATE POLICY "Service role full access on product_campaign_links" ON public.product_campaign_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE
  public.courier_api_logs,
  public.reconciliation_imports,
  public.reconciliation_rows,
  public.ai_uploaded_files,
  public.product_campaign_links
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.delivery_fees,
  public.courier_wilaya_coverage,
  public.courier_stop_desks
TO anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.delivery_fees,
  public.courier_wilaya_coverage,
  public.courier_stop_desks,
  public.courier_api_logs,
  public.reconciliation_imports,
  public.reconciliation_rows,
  public.ai_uploaded_files,
  public.product_campaign_links
TO service_role;

-- 12. Update default storefront 58 wilayas -> 69 wilayas copy cleanly if matching default string
UPDATE public.site_settings
SET reassurance_pillars = replace(reassurance_pillars::text, '58 ولاية', '69 ولاية')::jsonb
WHERE id = 1 AND reassurance_pillars::text LIKE '%58 ولاية%';

NOTIFY pgrst, 'reload schema';

COMMIT;
