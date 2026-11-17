-- ============================================================================
-- ORVA Store — Campaign Attribution, Redex Tracking & Profitability Engine
-- Migration: 20261117_000005_order_attribution_and_profitability.sql
-- Adds the 7 attribution & courier reconciliation columns to public.orders,
-- updates sync_orders_dual_columns() trigger, and creates fast analytics indexes.
-- Run once in the Supabase SQL Editor (idempotent & non-destructive).
-- ============================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fb_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_adset_id TEXT,
  ADD COLUMN IF NOT EXISTS fb_ad_id TEXT,
  ADD COLUMN IF NOT EXISTS fbclid TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS attribution_source TEXT DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS redex_tracking_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_fb_campaign_id
  ON public.orders (fb_campaign_id)
  WHERE fb_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_utm_campaign
  ON public.orders (utm_campaign)
  WHERE utm_campaign IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_attribution_source
  ON public.orders (attribution_source);

CREATE INDEX IF NOT EXISTS idx_orders_redex_tracking_id
  ON public.orders (redex_tracking_id)
  WHERE redex_tracking_id IS NOT NULL;

-- Extend existing dual-column trigger so redex_tracking_id stays 100% in sync
-- with redex_tracking_code and tracking_code on every insert/update.
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
    NEW.redex_tracking_id := COALESCE(NEW.redex_tracking_id, NEW.redex_tracking_code, NEW.tracking_code);
    NEW.redex_tracking_code := COALESCE(NEW.redex_tracking_code, NEW.redex_tracking_id, NEW.tracking_code);
    NEW.tracking_code := COALESCE(NEW.tracking_code, NEW.redex_tracking_id, NEW.redex_tracking_code);
    NEW.attribution_source := COALESCE(NULLIF(trim(NEW.attribution_source), ''), 'direct');
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing orders safely
UPDATE public.orders
SET
  redex_tracking_id = COALESCE(redex_tracking_id, redex_tracking_code, tracking_code),
  attribution_source = COALESCE(NULLIF(trim(attribution_source), ''), 'direct')
WHERE redex_tracking_id IS NULL
   OR attribution_source IS NULL;

COMMIT;
