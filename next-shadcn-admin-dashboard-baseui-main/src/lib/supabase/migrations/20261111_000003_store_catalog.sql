-- ORVA store catalog: admin-managed products become the single source of truth for the storefront.
-- Run once in the Supabase SQL Editor.

-- 1. Private (never public) product economics, kept out of the publicly readable products table.
CREATE TABLE IF NOT EXISTS public.product_private (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  purchase_cost NUMERIC NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0),
  marketing_cost_per_order NUMERIC NOT NULL DEFAULT 0 CHECK (marketing_cost_per_order >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on product_private" ON public.product_private;
CREATE POLICY "Service role full access on product_private" ON public.product_private
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.product_private FROM anon;

-- 2. Public bucket for product images uploaded from the dashboard.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Product images are public" ON storage.objects;
CREATE POLICY "Product images are public" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');
