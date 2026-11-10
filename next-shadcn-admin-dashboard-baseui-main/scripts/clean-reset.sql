-- ============================================================================
-- ORVA Store v2.1.0 — Milestone 1: Clean Database Reset Script
-- Target Project: olmsjkhdfghyydogcvvy
-- Invariant: Drops all obsolete, legacy, and conflicting tables in public schema
-- Leaves PostgreSQL extensions (uuid-ossp, pgcrypto) intact
-- Flushes PostgREST schema cache
-- ============================================================================

BEGIN;

-- 1. Drop Views (reverse dependency)
DROP VIEW IF EXISTS public.public_site_settings CASCADE;

-- 2. Drop Obsolete & Pre-Migration Temporary Tables
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.risk_events CASCADE;
DROP TABLE IF EXISTS public.rate_limits CASCADE;
DROP TABLE IF EXISTS public.watchlist CASCADE;
DROP TABLE IF EXISTS public._v21_orders_pre_migration_state CASCADE;
DROP TABLE IF EXISTS public._v21_snapshot_manifest CASCADE;

-- 3. Drop Relational Children, Audit & Reconciliation Tables (with CASCADE)
DROP TABLE IF EXISTS public.delivery_validation_reconciliations CASCADE;
DROP TABLE IF EXISTS public.deliveries CASCADE;
DROP TABLE IF EXISTS public.order_timeline_events CASCADE;
DROP TABLE IF EXISTS public.order_conversions CASCADE;
DROP TABLE IF EXISTS public.cod_reconciliations CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.product_collections CASCADE;
DROP TABLE IF EXISTS public.product_media CASCADE;
DROP TABLE IF EXISTS public.variants CASCADE;

-- 4. Drop Core Entities
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.customers CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.collections CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.courier_configurations CASCADE;
DROP TABLE IF EXISTS public.site_settings CASCADE;
DROP TABLE IF EXISTS public.admin_session_revocations CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;

-- 5. Dynamic Safety Sweeper: Drop any remaining user views or tables in public schema
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop any remaining views in public schema
    FOR r IN (
        SELECT quote_ident(viewname) AS vname 
        FROM pg_views 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP VIEW IF EXISTS public.' || r.vname || ' CASCADE';
    END LOOP;

    -- Drop any remaining base tables in public schema
    FOR r IN (
        SELECT quote_ident(tablename) AS tname 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || r.tname || ' CASCADE';
    END LOOP;
END $$;

-- 6. Clean Migration Conflict History (if supabase_migrations exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'supabase_migrations'
    ) THEN
        TRUNCATE TABLE supabase_migrations.schema_migrations;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore if insufficient privileges or table absent
END $$;

-- 7. Notify PostgREST to instantly reload schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
