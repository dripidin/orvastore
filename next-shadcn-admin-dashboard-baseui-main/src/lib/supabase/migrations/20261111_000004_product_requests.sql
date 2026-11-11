-- Customer product requests ("what should ORVA sell next?") sent from the storefront home page.
-- Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.product_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  phone TEXT,
  wilaya TEXT,
  product_wanted TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_requests_unread ON public.product_requests (is_read, created_at DESC);

ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on product_requests" ON public.product_requests;
CREATE POLICY "Service role full access on product_requests" ON public.product_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.product_requests FROM anon;
