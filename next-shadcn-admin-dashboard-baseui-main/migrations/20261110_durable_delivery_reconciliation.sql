-- ============================================================================
-- ORVA Store — Stage 2 Remediation B: Durable Delivery Reconciliation Schema
-- Migration: 20261110_durable_delivery_reconciliation.sql
-- Scope: Implements dedicated durable delivery validation reconciliation table
--        (distinct from financial COD collection reconciliations).
-- Invariants:
--   1. Transactional and preflight-guarded (fails closed if parent orders table missing).
--   2. Bounded lock acquisition (3s) and statement timeout (30s).
--   3. Strict RLS enabled with service_role-only access policy.
--   4. Revokes all privileges from PUBLIC, anon, and authenticated.
--   5. Stable operation_id idempotency constraint prevents duplicate records.
-- ============================================================================

BEGIN;

-- 0. Bounded lock and statement timeouts (DDL-01 Safety)
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- 1. Preflight sanity check: parent orders table and order_id must exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'orders'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Parent table public.orders does not exist. Cannot apply delivery_validation_reconciliations migration.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_id'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Column order_id does not exist on public.orders. Cannot apply foreign key constraint.';
    END IF;
END $$;

-- 2. Create dedicated delivery_validation_reconciliations table
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

-- 3. Dedicated indexes for high-throughput lookup and recovery scanning
CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_tracking
    ON public.delivery_validation_reconciliations(tracking_code);

CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_state
    ON public.delivery_validation_reconciliations(reconciliation_state);

CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_order
    ON public.delivery_validation_reconciliations(order_id);

CREATE INDEX IF NOT EXISTS idx_deliv_val_recon_lease
    ON public.delivery_validation_reconciliations(lease_expires_at)
    WHERE reconciliation_state = 'PENDING_CARRIER';

-- 4. Complete Defense-in-Depth RLS and Privilege Hardening
ALTER TABLE public.delivery_validation_reconciliations ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname FROM pg_catalog.pg_policies
        WHERE schemaname = 'public' AND tablename = 'delivery_validation_reconciliations'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.delivery_validation_reconciliations;', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY service_role_full_access_delivery_validation_reconciliations
    ON public.delivery_validation_reconciliations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE public.delivery_validation_reconciliations FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.delivery_validation_reconciliations TO service_role;

COMMIT;

