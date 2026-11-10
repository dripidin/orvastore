-- ============================================================================
-- ORVA Store — Release v2.1.0 Database Migration (Final Production Revision)
-- Preflight-Guarded, Deterministic Constraints, Fully Transactional
-- Complete Defense-in-Depth RLS, Table Grants, Column Grants, Schema & Default Privileges
-- Target Tables (11):
--   orders, deliveries, order_conversions, order_timeline_events,
--   site_settings, admin_session_revocations, customers, order_items,
--   audit_logs, cod_reconciliations, courier_configurations
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. BOUNDED LOCK AND STATEMENT TIMEOUTS (DDL-01 LOCK SAFETY)
-- Prevents lock queuing and connection pool exhaustion during DDL acquisition
-- ============================================================================
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- ============================================================================
-- 1. ORDERS TABLE (Foundation Schema, Legacy Compatibility & Uniqueness)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_phone2 TEXT,
    wilaya_code INTEGER,
    wilaya_name TEXT,
    commune_name TEXT,
    delivery_type TEXT DEFAULT 'DOMICILE',
    delivery_method TEXT DEFAULT 'DOMICILE',
    delivery_address TEXT,
    pack_id TEXT,
    product_title TEXT,
    quantity INTEGER DEFAULT 1,
    subtotal NUMERIC DEFAULT 0,
    delivery_fee NUMERIC DEFAULT 0,
    shipping_fee NUMERIC DEFAULT 0,
    total NUMERIC DEFAULT 0,
    total_payable NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    tracking_code TEXT,
    redex_tracking_code TEXT,
    tracking_url TEXT,
    in_redex BOOLEAN DEFAULT false,
    courier TEXT DEFAULT 'REDEX',
    courier_provider TEXT DEFAULT 'REDEX',
    remarks JSONB DEFAULT '[]'::jsonb,
    idempotency_key TEXT,
    payload_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
DECLARE
    null_order_id_count INT := 0;
    duplicate_order_id_count INT := 0;
    blank_idempotency_count INT := 0;
    duplicate_idempotency_count INT := 0;
    existing_uq_name TEXT;
    v_id_type TEXT;
    v_id_udt TEXT;
    v_id_nullable TEXT;
    v_orders_count BIGINT;
    v_snapshot_count BIGINT;
    v_snapshot_digest TEXT;
    v_null_snap_ids BIGINT;
    v_dup_snap_ids BIGINT;
BEGIN
    -- 1.1 Ensure all required and optional columns exist on public.orders before any UPDATE or constraint
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'id') THEN
        ALTER TABLE public.orders ADD COLUMN id UUID DEFAULT gen_random_uuid();
        UPDATE public.orders SET id = gen_random_uuid() WHERE id IS NULL;
        ALTER TABLE public.orders ALTER COLUMN id SET NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_id') THEN
        ALTER TABLE public.orders ADD COLUMN order_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_name') THEN
        ALTER TABLE public.orders ADD COLUMN customer_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_phone') THEN
        ALTER TABLE public.orders ADD COLUMN customer_phone TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_phone2') THEN
        ALTER TABLE public.orders ADD COLUMN customer_phone2 TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'wilaya_code') THEN
        ALTER TABLE public.orders ADD COLUMN wilaya_code INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'wilaya_name') THEN
        ALTER TABLE public.orders ADD COLUMN wilaya_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'commune_name') THEN
        ALTER TABLE public.orders ADD COLUMN commune_name TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_type') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_type TEXT DEFAULT 'DOMICILE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_method') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_method TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_address') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_address TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'pack_id') THEN
        ALTER TABLE public.orders ADD COLUMN pack_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'product_title') THEN
        ALTER TABLE public.orders ADD COLUMN product_title TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'quantity') THEN
        ALTER TABLE public.orders ADD COLUMN quantity INTEGER DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'subtotal') THEN
        ALTER TABLE public.orders ADD COLUMN subtotal NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_fee') THEN
        ALTER TABLE public.orders ADD COLUMN delivery_fee NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'shipping_fee') THEN
        ALTER TABLE public.orders ADD COLUMN shipping_fee NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total') THEN
        ALTER TABLE public.orders ADD COLUMN total NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_payable') THEN
        ALTER TABLE public.orders ADD COLUMN total_payable NUMERIC DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status') THEN
        ALTER TABLE public.orders ADD COLUMN status TEXT DEFAULT 'PENDING';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_code') THEN
        ALTER TABLE public.orders ADD COLUMN tracking_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'redex_tracking_code') THEN
        ALTER TABLE public.orders ADD COLUMN redex_tracking_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_url') THEN
        ALTER TABLE public.orders ADD COLUMN tracking_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'in_redex') THEN
        ALTER TABLE public.orders ADD COLUMN in_redex BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'courier') THEN
        ALTER TABLE public.orders ADD COLUMN courier TEXT DEFAULT 'REDEX';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'courier_provider') THEN
        ALTER TABLE public.orders ADD COLUMN courier_provider TEXT DEFAULT 'REDEX';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'remarks') THEN
        ALTER TABLE public.orders ADD COLUMN remarks JSONB DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'idempotency_key') THEN
        ALTER TABLE public.orders ADD COLUMN idempotency_key TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'payload_hash') THEN
        ALTER TABLE public.orders ADD COLUMN payload_hash TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_at') THEN
        ALTER TABLE public.orders ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'updated_at') THEN
        ALTER TABLE public.orders ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;

    -- 1.2 Legacy Schema Backfill (Non-Overwriting, Type-Validated):
    -- Preserve all historical production order data across legacy and v2.1 columns without
    -- overwriting existing non-null / non-empty / non-zero values.

    -- 1.2.0 Data-Safe Pre-Migration Snapshot & Schema Compatibility Gate:
    -- Verify snapshot table and manifest table do NOT already exist (prevent reusing stale or incomplete snapshots)
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = '_v21_orders_pre_migration_state'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Pre-migration snapshot table public._v21_orders_pre_migration_state already exists. A previous migration may have aborted or a stale snapshot is present. Drop the table manually after verifying state before re-running migration.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = '_v21_snapshot_manifest'
    ) THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Pre-migration snapshot manifest table public._v21_snapshot_manifest already exists. A previous migration may have aborted or a stale manifest is present. Drop the table manually after verifying state before re-running migration.';
    END IF;

    -- Validate production orders.id type and nullability (must be non-nullable UUID)
    SELECT data_type, udt_name, is_nullable
    INTO v_id_type, v_id_udt, v_id_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'id';

    IF v_id_type IS NULL THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Expected primary key column public.orders.id does not exist.';
    END IF;

    IF v_id_udt <> 'uuid' THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Expected public.orders.id to have type UUID, but found % (udt_name: %). Incompatible production schema.', v_id_type, v_id_udt;
    END IF;

    IF v_id_nullable = 'YES' THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Expected public.orders.id to be NOT NULL, but found nullable.';
    END IF;

    -- Create dedicated staging snapshot table
    EXECUTE $snap$
        CREATE TABLE public._v21_orders_pre_migration_state (
            id UUID NOT NULL,
            order_id TEXT,
            unit_price NUMERIC,
            total_price NUMERIC,
            full_name TEXT,
            phone TEXT,
            redex_tracking_code TEXT,
            courier TEXT,
            tracking_code TEXT,
            snapshot_at TIMESTAMPTZ DEFAULT now()
        );
        REVOKE ALL ON public._v21_orders_pre_migration_state FROM PUBLIC, anon, authenticated, service_role;
        GRANT SELECT ON public._v21_orders_pre_migration_state TO service_role;
    $snap$;

    -- Populate snapshot table with exact pre-migration state of all existing columns
    EXECUTE format($pop$
        INSERT INTO public._v21_orders_pre_migration_state (
            id, order_id, unit_price, total_price, full_name, phone, redex_tracking_code, courier, tracking_code
        )
        SELECT
            id,
            %s AS order_id,
            %s AS unit_price,
            %s AS total_price,
            %s AS full_name,
            %s AS phone,
            %s AS redex_tracking_code,
            %s AS courier,
            %s AS tracking_code
        FROM public.orders;
    $pop$,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_id') THEN 'order_id' ELSE 'NULL::text' END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'unit_price') THEN 'unit_price' ELSE 'NULL::numeric' END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_price') THEN 'total_price' ELSE 'NULL::numeric' END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'full_name') THEN 'full_name' ELSE 'NULL::text' END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'phone') THEN 'phone' ELSE 'NULL::text' END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'redex_tracking_code') THEN 'redex_tracking_code' ELSE 'NULL::text' END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'courier') THEN 'courier' ELSE 'NULL::text' END,
        CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_code') THEN 'tracking_code' ELSE 'NULL::text' END
    );

    -- Verify Snapshot row count equals orders row count
    SELECT count(*) FROM public.orders INTO v_orders_count;
    SELECT count(*) FROM public._v21_orders_pre_migration_state INTO v_snapshot_count;
    IF v_snapshot_count <> v_orders_count THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Snapshot row count mismatch. public.orders has % rows, but snapshot captured % rows.', v_orders_count, v_snapshot_count;
    END IF;

    -- Verify no NULL snapshot IDs
    SELECT count(*) FROM public._v21_orders_pre_migration_state WHERE id IS NULL INTO v_null_snap_ids;
    IF v_null_snap_ids > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Snapshot contains % null id value(s). All snapshot IDs must be non-null.', v_null_snap_ids;
    END IF;

    -- Verify no duplicate snapshot IDs
    SELECT count(*) FROM (
        SELECT id FROM public._v21_orders_pre_migration_state GROUP BY id HAVING count(*) > 1
    ) dup INTO v_dup_snap_ids;
    IF v_dup_snap_ids > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Snapshot contains % duplicate id value(s). All snapshot IDs must be unique.', v_dup_snap_ids;
    END IF;

    -- Create snapshot manifest table for cryptographic authenticity & completeness verification
    EXECUTE $manifest$
        CREATE TABLE public._v21_snapshot_manifest (
            id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            schema_version TEXT NOT NULL,
            migration_id TEXT NOT NULL,
            row_count BIGINT NOT NULL,
            snapshot_digest TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        REVOKE ALL ON public._v21_snapshot_manifest FROM PUBLIC, anon, authenticated, service_role;
        GRANT SELECT ON public._v21_snapshot_manifest TO service_role;
    $manifest$;

    -- Compute deterministic SHA-256 cryptographic digest across all snapshot rows and all restored columns
    -- Uses canonical JSONB serialization with trim_scale numeric normalization and explicit UTF-8 byte encoding
    SELECT encode(sha256(coalesce(string_agg(row_hash, '' ORDER BY id), '')::bytea), 'hex')
    INTO v_snapshot_digest
    FROM (
        SELECT id, encode(sha256(convert_to((jsonb_build_object(
            'id', id::text,
            'order_id', order_id,
            'unit_price', CASE WHEN unit_price IS NULL THEN NULL ELSE trim_scale(unit_price)::text END,
            'total_price', CASE WHEN total_price IS NULL THEN NULL ELSE trim_scale(total_price)::text END,
            'full_name', full_name,
            'phone', phone,
            'redex_tracking_code', redex_tracking_code,
            'courier', courier,
            'tracking_code', tracking_code
        ))::text, 'UTF8')), 'hex') AS row_hash
        FROM public._v21_orders_pre_migration_state
    ) sub;

    -- Store manifest entry
    INSERT INTO public._v21_snapshot_manifest (
        id, schema_version, migration_id, row_count, snapshot_digest
    ) VALUES (
        1,
        'v2.1',
        '20261108_000002_v2_1_deliveries_and_conversions',
        v_snapshot_count,
        v_snapshot_digest
    );

    -- 1.2a order_id <-> order_number synchronization & legacy NOT NULL relaxation
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
    ) THEN
        UPDATE public.orders
        SET order_id = trim(order_number)
        WHERE (order_id IS NULL OR trim(order_id) = '')
          AND order_number IS NOT NULL
          AND trim(order_number) != '';

        UPDATE public.orders
        SET order_number = trim(order_id)
        WHERE (order_number IS NULL OR trim(order_number) = '')
          AND order_id IS NOT NULL
          AND trim(order_id) != '';

        ALTER TABLE public.orders ALTER COLUMN order_number DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_wilaya' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN delivery_wilaya DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_commune' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN delivery_commune DROP NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'subtotal' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN subtotal DROP NOT NULL;
    END IF;

    -- Drop legacy restrictive check constraints on public.orders that conflict with v2.1 / production values
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
        ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_type_check') THEN
        ALTER TABLE public.orders DROP CONSTRAINT orders_delivery_type_check;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_method_check') THEN
        ALTER TABLE public.orders DROP CONSTRAINT orders_delivery_method_check;
    END IF;

    -- 1.2b customer_name <-> full_name
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'full_name'
    ) THEN
        UPDATE public.orders
        SET customer_name = trim(full_name)
        WHERE (customer_name IS NULL OR trim(customer_name) = '')
          AND full_name IS NOT NULL
          AND trim(full_name) != '';

        UPDATE public.orders
        SET full_name = trim(customer_name)
        WHERE (full_name IS NULL OR trim(full_name) = '')
          AND customer_name IS NOT NULL
          AND trim(customer_name) != '';
    END IF;

    -- 1.2c customer_phone <-> phone
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'phone'
    ) THEN
        UPDATE public.orders
        SET customer_phone = trim(phone)
        WHERE (customer_phone IS NULL OR trim(customer_phone) = '')
          AND phone IS NOT NULL
          AND trim(phone) != '';

        UPDATE public.orders
        SET phone = trim(customer_phone)
        WHERE (phone IS NULL OR trim(phone) = '')
          AND customer_phone IS NOT NULL
          AND trim(customer_phone) != '';
    END IF;

    -- 1.2d wilaya_code & wilaya_name <- wilaya / delivery_wilaya
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'wilaya'
    ) THEN
        UPDATE public.orders
        SET wilaya_code = (regexp_match(wilaya, '^\s*(\d{1,2})\s*-'))[1]::integer
        WHERE wilaya_code IS NULL
          AND wilaya IS NOT NULL
          AND wilaya ~ '^\s*\d{1,2}\s*-'
          AND (regexp_match(wilaya, '^\s*(\d{1,2})\s*-'))[1]::integer BETWEEN 1 AND 58;

        UPDATE public.orders
        SET wilaya_name = COALESCE(
            NULLIF(trim(regexp_replace(regexp_replace(wilaya, '^\s*\d{1,2}\s*-\s*', ''), '\s*[—–-].*$', '')), ''),
            trim(wilaya)
        )
        WHERE (wilaya_name IS NULL OR trim(wilaya_name) = '')
          AND wilaya IS NOT NULL
          AND trim(wilaya) != '';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_wilaya'
    ) THEN
        UPDATE public.orders
        SET wilaya_code = (regexp_match(delivery_wilaya, '^\s*(\d{1,2})\s*-'))[1]::integer
        WHERE wilaya_code IS NULL
          AND delivery_wilaya IS NOT NULL
          AND delivery_wilaya ~ '^\s*\d{1,2}\s*-'
          AND (regexp_match(delivery_wilaya, '^\s*(\d{1,2})\s*-'))[1]::integer BETWEEN 1 AND 58;

        UPDATE public.orders
        SET wilaya_name = COALESCE(
            NULLIF(trim(regexp_replace(regexp_replace(delivery_wilaya, '^\s*\d{1,2}\s*-\s*', ''), '\s*[—–-].*$', '')), ''),
            trim(delivery_wilaya)
        )
        WHERE (wilaya_name IS NULL OR trim(wilaya_name) = '')
          AND delivery_wilaya IS NOT NULL
          AND trim(delivery_wilaya) != '';
    END IF;

    -- 1.2e commune_name <- commune / delivery_commune / wilaya suffix
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'commune'
    ) THEN
        UPDATE public.orders
        SET commune_name = trim(commune)
        WHERE (commune_name IS NULL OR trim(commune_name) = '')
          AND commune IS NOT NULL
          AND trim(commune) != '';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_commune'
    ) THEN
        UPDATE public.orders
        SET commune_name = trim(delivery_commune)
        WHERE (commune_name IS NULL OR trim(commune_name) = '')
          AND delivery_commune IS NOT NULL
          AND trim(delivery_commune) != '';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'wilaya'
    ) THEN
        UPDATE public.orders
        SET commune_name = NULLIF(trim((regexp_match(wilaya, '—\s*(.+)$'))[1]), '')
        WHERE (commune_name IS NULL OR trim(commune_name) = '')
          AND wilaya IS NOT NULL
          AND wilaya ~ '—\s*.+$';
    END IF;

    -- 1.2f delivery_method & delivery_address <- delivery_type / notes
    UPDATE public.orders
    SET delivery_method = CASE
        WHEN delivery_type ILIKE '%stop%desk%'
          OR delivery_type LIKE '%مكتب%'
          OR lower(trim(delivery_type)) IN ('desk', 'stop_desk', 'stop-desk')
        THEN 'STOP_DESK'
        ELSE 'DOMICILE'
    END
    WHERE (delivery_method IS NULL OR trim(delivery_method) = '')
      AND delivery_type IS NOT NULL
      AND trim(delivery_type) != '';

    UPDATE public.orders
    SET delivery_method = 'DOMICILE'
    WHERE delivery_method IS NULL OR trim(delivery_method) = '';

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'notes'
    ) THEN
        UPDATE public.orders
        SET delivery_address = trim(notes)
        WHERE (delivery_address IS NULL OR trim(delivery_address) = '')
          AND notes IS NOT NULL
          AND trim(notes) != '';
    END IF;

    UPDATE public.orders
    SET delivery_address = CASE
        WHEN delivery_method = 'STOP_DESK' THEN 'Bureau Stop-Desk'
        ELSE COALESCE(
            NULLIF(trim(
                COALESCE(commune_name, '') ||
                CASE
                    WHEN wilaya_name IS NOT NULL AND trim(wilaya_name) != ''
                    THEN CASE WHEN commune_name IS NOT NULL AND trim(commune_name) != '' THEN ' — ' ELSE '' END || trim(wilaya_name)
                    ELSE ''
                END
            ), ''),
            'Domicile'
        )
    END
    WHERE delivery_address IS NULL OR trim(delivery_address) = '';

    ALTER TABLE public.orders ALTER COLUMN delivery_method SET DEFAULT 'DOMICILE';

    -- 1.2g product_title <- product_name & pack_id <- order_id prefix
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'product_name'
    ) THEN
        UPDATE public.orders
        SET product_title = trim(product_name)
        WHERE (product_title IS NULL OR trim(product_title) = '')
          AND product_name IS NOT NULL
          AND trim(product_name) != '';
    END IF;

    UPDATE public.orders
    SET pack_id = upper((regexp_match(order_id, '^(PACK[123])-', 'i'))[1])
    WHERE (pack_id IS NULL OR trim(pack_id) = '')
      AND order_id IS NOT NULL
      AND order_id ~* '^(PACK[123])-';

    UPDATE public.orders
    SET pack_id = 'PACK1'
    WHERE (pack_id IS NULL OR trim(pack_id) = '')
      AND product_title IS NOT NULL
      AND trim(product_title) != '';

    -- 1.2h Financial Backfill (delivery_fee, subtotal, total, total_payable, unit_price, total_price)
    UPDATE public.orders
    SET delivery_fee = (regexp_match(replace(COALESCE(shipping_fee::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1]::numeric
    WHERE (delivery_fee IS NULL OR delivery_fee = 0)
      AND shipping_fee IS NOT NULL
      AND (regexp_match(replace(COALESCE(shipping_fee::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1] IS NOT NULL
      AND (regexp_match(replace(COALESCE(shipping_fee::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1]::numeric > 0;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'product_total'
    ) THEN
        UPDATE public.orders
        SET subtotal = (regexp_match(replace(COALESCE(product_total::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1]::numeric
        WHERE (subtotal IS NULL OR subtotal = 0)
          AND product_total IS NOT NULL
          AND (regexp_match(replace(COALESCE(product_total::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1] IS NOT NULL
          AND (regexp_match(replace(COALESCE(product_total::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1]::numeric > 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'unit_price'
    ) THEN
        UPDATE public.orders
        SET subtotal = unit_price * GREATEST(COALESCE(quantity, 1), 1)
        WHERE (subtotal IS NULL OR subtotal = 0)
          AND unit_price IS NOT NULL
          AND unit_price > 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'price_num'
    ) THEN
        UPDATE public.orders
        SET subtotal = GREATEST(price_num - COALESCE(delivery_fee, 0), 0)
        WHERE (subtotal IS NULL OR subtotal = 0)
          AND price_num IS NOT NULL
          AND price_num > 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'grand_total'
    ) THEN
        UPDATE public.orders
        SET total = (regexp_match(replace(COALESCE(grand_total::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1]::numeric
        WHERE (total IS NULL OR total = 0)
          AND grand_total IS NOT NULL
          AND (regexp_match(replace(COALESCE(grand_total::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1] IS NOT NULL
          AND (regexp_match(replace(COALESCE(grand_total::text, ''), ',', ''), '(\d+(?:\.\d+)?)'))[1]::numeric > 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_price'
    ) THEN
        UPDATE public.orders
        SET total = total_price
        WHERE (total IS NULL OR total = 0)
          AND total_price IS NOT NULL
          AND total_price > 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'price_num'
    ) THEN
        UPDATE public.orders
        SET total = price_num
        WHERE (total IS NULL OR total = 0)
          AND price_num IS NOT NULL
          AND price_num > 0;
    END IF;

    UPDATE public.orders
    SET total = COALESCE(subtotal, 0) + COALESCE(delivery_fee, 0)
    WHERE (total IS NULL OR total = 0)
      AND (COALESCE(subtotal, 0) + COALESCE(delivery_fee, 0)) > 0;

    UPDATE public.orders
    SET total_payable = total
    WHERE (total_payable IS NULL OR total_payable = 0)
      AND total IS NOT NULL
      AND total > 0;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'unit_price'
    ) THEN
        UPDATE public.orders
        SET unit_price = ROUND(subtotal / GREATEST(COALESCE(quantity, 1), 1), 2)
        WHERE (unit_price IS NULL OR unit_price = 0)
          AND subtotal IS NOT NULL
          AND subtotal > 0;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'total_price'
    ) THEN
        UPDATE public.orders
        SET total_price = total_payable
        WHERE (total_price IS NULL OR total_price = 0)
          AND total_payable IS NOT NULL
          AND total_payable > 0;
    END IF;

    -- 1.2i Tracking & Courier Backfill (tracking_code <-> redex_tracking_code, courier_provider <-> courier)
    UPDATE public.orders
    SET tracking_code = trim(redex_tracking_code)
    WHERE (tracking_code IS NULL OR trim(tracking_code) = '')
      AND redex_tracking_code IS NOT NULL
      AND trim(redex_tracking_code) != '';

    UPDATE public.orders
    SET redex_tracking_code = trim(tracking_code)
    WHERE (redex_tracking_code IS NULL OR trim(redex_tracking_code) = '')
      AND tracking_code IS NOT NULL
      AND trim(tracking_code) != '';

    UPDATE public.orders
    SET courier_provider = upper(trim(courier))
    WHERE (courier_provider IS NULL OR trim(courier_provider) = '')
      AND courier IS NOT NULL
      AND trim(courier) != '';

    UPDATE public.orders
    SET courier = upper(trim(courier_provider))
    WHERE (courier IS NULL OR trim(courier) = '')
      AND courier_provider IS NOT NULL
      AND trim(courier_provider) != '';

    -- 1.3 Unconditional Preflight Validation on orders.order_id before SET NOT NULL & UNIQUE
    SELECT COUNT(*) INTO null_order_id_count
    FROM public.orders
    WHERE order_id IS NULL OR trim(order_id) = '';

    IF null_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % orders with NULL or whitespace order_id. Cannot enforce NOT NULL / UNIQUE constraint on orders.order_id.', null_order_id_count;
    END IF;

    SELECT COUNT(*) INTO duplicate_order_id_count
    FROM (
        SELECT order_id
        FROM public.orders
        GROUP BY order_id
        HAVING COUNT(*) > 1
    ) dupes;

    IF duplicate_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % duplicate order_id value(s) in public.orders. Deduplication required.', duplicate_order_id_count;
    END IF;

    ALTER TABLE public.orders ALTER COLUMN order_id SET NOT NULL;

    -- Catalog-driven discovery of any single-column UNIQUE constraint on public.orders(order_id)
    SELECT con.conname INTO existing_uq_name
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = con.conrelid
     AND a.attnum = con.conkey[1]
    WHERE con.conrelid = 'public.orders'::regclass
      AND con.contype = 'u'
      AND cardinality(con.conkey) = 1
      AND a.attname = 'order_id'
    ORDER BY (con.conname = 'orders_order_id_key') DESC, con.conname
    LIMIT 1;

    IF existing_uq_name IS NULL THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_order_id_key UNIQUE (order_id);
    ELSIF existing_uq_name != 'orders_order_id_key' THEN
        RAISE NOTICE 'CATALOG_UQ_DISCOVERY: Renaming non-standard UNIQUE constraint % on public.orders(order_id) to orders_order_id_key', existing_uq_name;
        EXECUTE format('ALTER TABLE public.orders RENAME CONSTRAINT %I TO orders_order_id_key;', existing_uq_name);
    END IF;

    -- 1.4 Unconditional Preflight Validation on orders.idempotency_key before UNIQUE
    SELECT COUNT(*) INTO blank_idempotency_count
    FROM public.orders
    WHERE idempotency_key IS NOT NULL AND trim(idempotency_key) = '';

    IF blank_idempotency_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % orders with empty/whitespace idempotency_key. Normalize to NULL before applying UNIQUE constraint.', blank_idempotency_count;
    END IF;

    SELECT COUNT(*) INTO duplicate_idempotency_count
    FROM (
        SELECT idempotency_key
        FROM public.orders
        WHERE idempotency_key IS NOT NULL
        GROUP BY idempotency_key
        HAVING COUNT(*) > 1
    ) dupes;

    IF duplicate_idempotency_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % duplicate non-null idempotency_key value(s) in public.orders. Deduplication required before UNIQUE constraint can be applied.', duplicate_idempotency_count;
    END IF;

    existing_uq_name := NULL;
    SELECT con.conname INTO existing_uq_name
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = con.conrelid
     AND a.attnum = con.conkey[1]
    WHERE con.conrelid = 'public.orders'::regclass
      AND con.contype = 'u'
      AND cardinality(con.conkey) = 1
      AND a.attname = 'idempotency_key'
    ORDER BY (con.conname = 'orders_idempotency_key_key') DESC, con.conname
    LIMIT 1;

    IF existing_uq_name IS NULL THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);
    ELSIF existing_uq_name != 'orders_idempotency_key_key' THEN
        RAISE NOTICE 'CATALOG_UQ_DISCOVERY: Renaming non-standard UNIQUE constraint % on public.orders(idempotency_key) to orders_idempotency_key_key', existing_uq_name;
        EXECUTE format('ALTER TABLE public.orders RENAME CONSTRAINT %I TO orders_idempotency_key_key;', existing_uq_name);
    END IF;
END $$;


-- ============================================================================
-- 2. DELIVERIES TABLE (Logistics & Redex Courier Records)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'REDEX',
    tracking_number TEXT NOT NULL,
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

DO $$
DECLARE
    null_delivery_order_id_count INT := 0;
    unmapped_deliveries_count INT := 0;
    null_tracking_count INT := 0;
    duplicate_tracking_count INT := 0;
    invalid_status_count INT := 0;
    fk_rec RECORD;
    uq_rec RECORD;
    existing_tracking_uq TEXT;
BEGIN
    -- 2.1 Ensure all required and optional columns exist BEFORE any UPDATE, ALTER, or CONSTRAINT
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'id') THEN
        ALTER TABLE public.deliveries ADD COLUMN id UUID DEFAULT gen_random_uuid();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'order_id') THEN
        ALTER TABLE public.deliveries ADD COLUMN order_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'provider') THEN
        ALTER TABLE public.deliveries ADD COLUMN provider TEXT NOT NULL DEFAULT 'REDEX';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'tracking_number') THEN
        ALTER TABLE public.deliveries ADD COLUMN tracking_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'tracking_url') THEN
        ALTER TABLE public.deliveries ADD COLUMN tracking_url TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'status') THEN
        ALTER TABLE public.deliveries ADD COLUMN status TEXT DEFAULT 'CREATED';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'carrier_status') THEN
        ALTER TABLE public.deliveries ADD COLUMN carrier_status TEXT DEFAULT 'prete_a_expedier';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'carrier_status_ar') THEN
        ALTER TABLE public.deliveries ADD COLUMN carrier_status_ar TEXT DEFAULT 'جاهز للإرسال';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'raw_response') THEN
        ALTER TABLE public.deliveries ADD COLUMN raw_response JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'created_at') THEN
        ALTER TABLE public.deliveries ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'updated_at') THEN
        ALTER TABLE public.deliveries ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;

    -- 2.2 Catalog-driven discovery & removal of ALL foreign keys on public.deliveries(order_id)
    FOR fk_rec IN
        SELECT
            con.oid AS con_oid,
            con.conname,
            con.confrelid,
            con.confdeltype,
            cardinality(con.conkey) AS key_len,
            cardinality(con.confkey) AS fkey_len,
            ref_attr.attname AS ref_col_name,
            pg_get_constraintdef(con.oid) AS con_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = ANY(con.conkey)
        LEFT JOIN pg_catalog.pg_attribute ref_attr
          ON ref_attr.attrelid = con.confrelid
         AND ref_attr.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.deliveries'::regclass
          AND con.contype = 'f'
          AND src_attr.attname = 'order_id'
        ORDER BY con.conname
    LOOP
        IF fk_rec.key_len != 1 OR fk_rec.fkey_len != 1 THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Composite foreign key % on public.deliveries(order_id) (%) is not supported for automatic replacement.',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        IF fk_rec.confrelid != 'public.orders'::regclass OR COALESCE(fk_rec.ref_col_name, '') NOT IN ('id', 'order_id') THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Foreign key % on public.deliveries(order_id) references unexpected target (%). Expected public.orders(id) or public.orders(order_id).',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        RAISE NOTICE 'CATALOG_FK_DISCOVERY: Dropping FK % on public.deliveries(order_id) -> public.orders(%) [confdeltype=%, def=%]',
            fk_rec.conname, fk_rec.ref_col_name, fk_rec.confdeltype, fk_rec.con_def;

        EXECUTE format('ALTER TABLE public.deliveries DROP CONSTRAINT %I;', fk_rec.conname);
    END LOOP;

    -- Catalog-driven discovery & removal of any single-column UNIQUE constraint on public.deliveries(order_id)
    FOR uq_rec IN
        SELECT
            con.conname,
            pg_get_constraintdef(con.oid) AS con_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = con.conkey[1]
        WHERE con.conrelid = 'public.deliveries'::regclass
          AND con.contype = 'u'
          AND cardinality(con.conkey) = 1
          AND src_attr.attname = 'order_id'
        ORDER BY con.conname
    LOOP
        RAISE NOTICE 'CATALOG_UQ_DISCOVERY: Dropping legacy single-column UNIQUE constraint % on public.deliveries(order_id) [def=%]',
            uq_rec.conname, uq_rec.con_def;
        EXECUTE format('ALTER TABLE public.deliveries DROP CONSTRAINT %I;', uq_rec.conname);
    END LOOP;

    -- 2.3 Ensure order_id is TEXT
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'deliveries'
          AND column_name = 'order_id'
          AND data_type != 'text'
    ) THEN
        ALTER TABLE public.deliveries ALTER COLUMN order_id TYPE TEXT USING order_id::text;
    END IF;

    -- 2.4 Verified Legacy UUID Remapping against parent public.orders(id)
    UPDATE public.deliveries d
    SET order_id = o.order_id
    FROM public.orders o
    WHERE lower(trim(d.order_id)) = lower(o.id::text)
      AND d.order_id IS DISTINCT FROM o.order_id;

    -- 2.5 Preflight validation for NULL/blank and orphan order_id before FK creation
    SELECT COUNT(*) INTO null_delivery_order_id_count
    FROM public.deliveries
    WHERE order_id IS NULL OR trim(order_id) = '';

    IF null_delivery_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % delivery records with NULL or empty order_id.', null_delivery_order_id_count;
    END IF;

    SELECT COUNT(*) INTO unmapped_deliveries_count
    FROM public.deliveries d
    LEFT JOIN public.orders o ON d.order_id = o.order_id
    WHERE o.order_id IS NULL;

    IF unmapped_deliveries_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % delivery records referencing non-existent order_id values. Cannot apply deliveries_order_id_fkey.', unmapped_deliveries_count;
    END IF;

    ALTER TABLE public.deliveries ALTER COLUMN order_id SET NOT NULL;

    ALTER TABLE public.deliveries
        ADD CONSTRAINT deliveries_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE RESTRICT;

    -- 2.6 Preflight validation on deliveries.tracking_number BEFORE SET NOT NULL and UNIQUE
    SELECT COUNT(*) INTO null_tracking_count
    FROM public.deliveries
    WHERE tracking_number IS NULL OR trim(tracking_number) = '';

    IF null_tracking_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % delivery records with NULL or empty tracking_number.', null_tracking_count;
    END IF;

    SELECT COUNT(*) INTO duplicate_tracking_count
    FROM (
        SELECT tracking_number
        FROM public.deliveries
        GROUP BY tracking_number
        HAVING COUNT(*) > 1
    ) dupes;

    IF duplicate_tracking_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % duplicate tracking_number(s) in public.deliveries.', duplicate_tracking_count;
    END IF;

    ALTER TABLE public.deliveries ALTER COLUMN tracking_number SET NOT NULL;

    SELECT con.conname INTO existing_tracking_uq
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = con.conrelid
     AND a.attnum = con.conkey[1]
    WHERE con.conrelid = 'public.deliveries'::regclass
      AND con.contype = 'u'
      AND cardinality(con.conkey) = 1
      AND a.attname = 'tracking_number'
    ORDER BY (con.conname = 'deliveries_tracking_number_key') DESC, con.conname
    LIMIT 1;

    IF existing_tracking_uq IS NULL THEN
        ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_tracking_number_key UNIQUE (tracking_number);
    ELSIF existing_tracking_uq != 'deliveries_tracking_number_key' THEN
        RAISE NOTICE 'CATALOG_UQ_DISCOVERY: Renaming non-standard UNIQUE constraint % on public.deliveries(tracking_number) to deliveries_tracking_number_key', existing_tracking_uq;
        EXECUTE format('ALTER TABLE public.deliveries RENAME CONSTRAINT %I TO deliveries_tracking_number_key;', existing_tracking_uq);
    END IF;

    -- 2.7 Validate status values and refresh deliveries_status_check
    SELECT COUNT(*) INTO invalid_status_count
    FROM public.deliveries
    WHERE status IS NOT NULL
      AND status NOT IN (
          'PENDING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT',
          'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'
      );

    IF invalid_status_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % delivery records with invalid status values.', invalid_status_count;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'deliveries_status_check'
          AND conrelid = 'public.deliveries'::regclass
    ) THEN
        ALTER TABLE public.deliveries DROP CONSTRAINT deliveries_status_check;
    END IF;

    ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_status_check CHECK (status IN (
        'PENDING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT',
        'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED'
    ));
END $$;

CREATE INDEX IF NOT EXISTS idx_deliveries_order_id ON public.deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_tracking_number ON public.deliveries(tracking_number);


-- ============================================================================
-- 3. ORDER CONVERSIONS / RE-ROUTING AUDIT TABLE (تحويل الطلبية)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    source_order_id TEXT,
    conversion_sequence INTEGER NOT NULL DEFAULT 1,
    operator TEXT DEFAULT 'Admin',
    reason TEXT NOT NULL DEFAULT 'Re-routing',
    previous_state JSONB DEFAULT '{}'::jsonb,
    new_state JSONB DEFAULT '{}'::jsonb,
    formatted_courier_note TEXT,
    new_tracking_code TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
DECLARE
    null_conversion_order_id_count INT := 0;
    unmapped_conversions_count INT := 0;
    fk_rec RECORD;
BEGIN
    -- 3.1 Ensure all required and optional columns exist BEFORE any UPDATE, ALTER, or CONSTRAINT
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'id') THEN
        ALTER TABLE public.order_conversions ADD COLUMN id UUID DEFAULT gen_random_uuid();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'order_id') THEN
        ALTER TABLE public.order_conversions ADD COLUMN order_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'source_order_id') THEN
        ALTER TABLE public.order_conversions ADD COLUMN source_order_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'conversion_sequence') THEN
        ALTER TABLE public.order_conversions ADD COLUMN conversion_sequence INTEGER NOT NULL DEFAULT 1;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'operator') THEN
        ALTER TABLE public.order_conversions ADD COLUMN operator TEXT DEFAULT 'Admin';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'reason') THEN
        ALTER TABLE public.order_conversions ADD COLUMN reason TEXT NOT NULL DEFAULT 'Re-routing';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'previous_state') THEN
        ALTER TABLE public.order_conversions ADD COLUMN previous_state JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'new_state') THEN
        ALTER TABLE public.order_conversions ADD COLUMN new_state JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'formatted_courier_note') THEN
        ALTER TABLE public.order_conversions ADD COLUMN formatted_courier_note TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'new_tracking_code') THEN
        ALTER TABLE public.order_conversions ADD COLUMN new_tracking_code TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_conversions' AND column_name = 'created_at') THEN
        ALTER TABLE public.order_conversions ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;

    -- 3.2 Catalog-driven discovery & removal of ALL foreign keys on public.order_conversions(order_id)
    FOR fk_rec IN
        SELECT
            con.oid AS con_oid,
            con.conname,
            con.confrelid,
            con.confdeltype,
            cardinality(con.conkey) AS key_len,
            cardinality(con.confkey) AS fkey_len,
            ref_attr.attname AS ref_col_name,
            pg_get_constraintdef(con.oid) AS con_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = ANY(con.conkey)
        LEFT JOIN pg_catalog.pg_attribute ref_attr
          ON ref_attr.attrelid = con.confrelid
         AND ref_attr.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.order_conversions'::regclass
          AND con.contype = 'f'
          AND src_attr.attname = 'order_id'
        ORDER BY con.conname
    LOOP
        IF fk_rec.key_len != 1 OR fk_rec.fkey_len != 1 THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Composite foreign key % on public.order_conversions(order_id) (%) is not supported for automatic replacement.',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        IF fk_rec.confrelid != 'public.orders'::regclass OR COALESCE(fk_rec.ref_col_name, '') NOT IN ('id', 'order_id') THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Foreign key % on public.order_conversions(order_id) references unexpected target (%). Expected public.orders(id) or public.orders(order_id).',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        RAISE NOTICE 'CATALOG_FK_DISCOVERY: Dropping FK % on public.order_conversions(order_id) -> public.orders(%) [confdeltype=%, def=%]',
            fk_rec.conname, fk_rec.ref_col_name, fk_rec.confdeltype, fk_rec.con_def;

        EXECUTE format('ALTER TABLE public.order_conversions DROP CONSTRAINT %I;', fk_rec.conname);
    END LOOP;

    -- 3.3 Ensure order_id is TEXT
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order_conversions'
          AND column_name = 'order_id'
          AND data_type != 'text'
    ) THEN
        ALTER TABLE public.order_conversions ALTER COLUMN order_id TYPE TEXT USING order_id::text;
    END IF;

    -- 3.4 Verified Legacy UUID Remapping against parent public.orders(id)
    UPDATE public.order_conversions c
    SET order_id = o.order_id
    FROM public.orders o
    WHERE lower(trim(c.order_id)) = lower(o.id::text)
      AND c.order_id IS DISTINCT FROM o.order_id;

    -- 3.5 Preflight validation for NULL/blank and orphan order_id before FK creation
    SELECT COUNT(*) INTO null_conversion_order_id_count
    FROM public.order_conversions
    WHERE order_id IS NULL OR trim(order_id) = '';

    IF null_conversion_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % conversion records with NULL or empty order_id.', null_conversion_order_id_count;
    END IF;

    SELECT COUNT(*) INTO unmapped_conversions_count
    FROM public.order_conversions c
    LEFT JOIN public.orders o ON c.order_id = o.order_id
    WHERE o.order_id IS NULL;

    IF unmapped_conversions_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % conversion records referencing non-existent order_id values. Cannot apply order_conversions_order_id_fkey.', unmapped_conversions_count;
    END IF;

    ALTER TABLE public.order_conversions ALTER COLUMN order_id SET NOT NULL;

    ALTER TABLE public.order_conversions
        ADD CONSTRAINT order_conversions_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE RESTRICT;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_conversions_order_id ON public.order_conversions(order_id);


-- ============================================================================
-- 4. ORDER TIMELINE EVENTS TABLE (تاريخ وأحداث الطلبية الموثقة)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL DEFAULT 'STATUS_CHANGE',
    title TEXT NOT NULL DEFAULT 'Timeline Event',
    description TEXT,
    actor TEXT NOT NULL DEFAULT 'SYSTEM',
    tracking_number TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
DECLARE
    null_timeline_order_id_count INT := 0;
    unmapped_timeline_count INT := 0;
    fk_rec RECORD;
BEGIN
    -- 4.1 Ensure all required and optional columns exist BEFORE any UPDATE, ALTER, or CONSTRAINT
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'id') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN id UUID DEFAULT gen_random_uuid();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'order_id') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN order_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'event_type') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'STATUS_CHANGE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'title') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN title TEXT NOT NULL DEFAULT 'Timeline Event';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'description') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN description TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'actor') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN actor TEXT NOT NULL DEFAULT 'SYSTEM';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'tracking_number') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN tracking_number TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'metadata') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_timeline_events' AND column_name = 'created_at') THEN
        ALTER TABLE public.order_timeline_events ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;

    -- 4.2 Catalog-driven discovery & removal of ALL foreign keys on public.order_timeline_events(order_id)
    FOR fk_rec IN
        SELECT
            con.oid AS con_oid,
            con.conname,
            con.confrelid,
            con.confdeltype,
            cardinality(con.conkey) AS key_len,
            cardinality(con.confkey) AS fkey_len,
            ref_attr.attname AS ref_col_name,
            pg_get_constraintdef(con.oid) AS con_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = ANY(con.conkey)
        LEFT JOIN pg_catalog.pg_attribute ref_attr
          ON ref_attr.attrelid = con.confrelid
         AND ref_attr.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.order_timeline_events'::regclass
          AND con.contype = 'f'
          AND src_attr.attname = 'order_id'
        ORDER BY con.conname
    LOOP
        IF fk_rec.key_len != 1 OR fk_rec.fkey_len != 1 THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Composite foreign key % on public.order_timeline_events(order_id) (%) is not supported for automatic replacement.',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        IF fk_rec.confrelid != 'public.orders'::regclass OR COALESCE(fk_rec.ref_col_name, '') NOT IN ('id', 'order_id') THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Foreign key % on public.order_timeline_events(order_id) references unexpected target (%). Expected public.orders(id) or public.orders(order_id).',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        RAISE NOTICE 'CATALOG_FK_DISCOVERY: Dropping FK % on public.order_timeline_events(order_id) -> public.orders(%) [confdeltype=%, def=%]',
            fk_rec.conname, fk_rec.ref_col_name, fk_rec.confdeltype, fk_rec.con_def;

        EXECUTE format('ALTER TABLE public.order_timeline_events DROP CONSTRAINT %I;', fk_rec.conname);
    END LOOP;

    -- 4.3 Ensure order_id is TEXT
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order_timeline_events'
          AND column_name = 'order_id'
          AND data_type != 'text'
    ) THEN
        ALTER TABLE public.order_timeline_events ALTER COLUMN order_id TYPE TEXT USING order_id::text;
    END IF;

    -- 4.4 Verified Legacy UUID Remapping against parent public.orders(id)
    UPDATE public.order_timeline_events e
    SET order_id = o.order_id
    FROM public.orders o
    WHERE lower(trim(e.order_id)) = lower(o.id::text)
      AND e.order_id IS DISTINCT FROM o.order_id;

    -- 4.5 Preflight validation for NULL/blank and orphan order_id before FK creation
    SELECT COUNT(*) INTO null_timeline_order_id_count
    FROM public.order_timeline_events
    WHERE order_id IS NULL OR trim(order_id) = '';

    IF null_timeline_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % timeline event records with NULL or empty order_id.', null_timeline_order_id_count;
    END IF;

    SELECT COUNT(*) INTO unmapped_timeline_count
    FROM public.order_timeline_events e
    LEFT JOIN public.orders o ON e.order_id = o.order_id
    WHERE o.order_id IS NULL;

    IF unmapped_timeline_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % timeline event records referencing non-existent order_id values. Cannot apply order_timeline_events_order_id_fkey.', unmapped_timeline_count;
    END IF;

    ALTER TABLE public.order_timeline_events ALTER COLUMN order_id SET NOT NULL;

    ALTER TABLE public.order_timeline_events
        ADD CONSTRAINT order_timeline_events_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE RESTRICT;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_timeline_events_order_id ON public.order_timeline_events(order_id);


-- ============================================================================
-- 5. SITE SETTINGS TABLE (إعدادات المتجر والتكاملات الحساسة)
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
    reassurance_pillars JSONB DEFAULT '[]'::jsonb,
    homepage_content JSONB DEFAULT '{}'::jsonb,
    social_links JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'brand_name') THEN
        ALTER TABLE public.site_settings ADD COLUMN brand_name TEXT DEFAULT 'ORVA Store';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'brand_name_ar') THEN
        ALTER TABLE public.site_settings ADD COLUMN brand_name_ar TEXT DEFAULT 'متجر أورفا';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'contact_email') THEN
        ALTER TABLE public.site_settings ADD COLUMN contact_email TEXT DEFAULT 'contact@orva-store.com';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'contact_phone') THEN
        ALTER TABLE public.site_settings ADD COLUMN contact_phone TEXT DEFAULT '+213 798 28 24 95';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'whatsapp') THEN
        ALTER TABLE public.site_settings ADD COLUMN whatsapp TEXT DEFAULT '+213798282495';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'customer_service_phone') THEN
        ALTER TABLE public.site_settings ADD COLUMN customer_service_phone TEXT DEFAULT '0798282495';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'customer_service_email') THEN
        ALTER TABLE public.site_settings ADD COLUMN customer_service_email TEXT DEFAULT 'support@orva-store.com';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'business_address') THEN
        ALTER TABLE public.site_settings ADD COLUMN business_address TEXT DEFAULT 'Biskra, Algérie';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'origin_hub_wilaya_code') THEN
        ALTER TABLE public.site_settings ADD COLUMN origin_hub_wilaya_code INTEGER DEFAULT 7;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'origin_hub_wilaya_name') THEN
        ALTER TABLE public.site_settings ADD COLUMN origin_hub_wilaya_name TEXT DEFAULT 'Biskra';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'default_currency') THEN
        ALTER TABLE public.site_settings ADD COLUMN default_currency TEXT DEFAULT 'DZD';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'meta_pixel_id') THEN
        ALTER TABLE public.site_settings ADD COLUMN meta_pixel_id TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'meta_capi_token') THEN
        ALTER TABLE public.site_settings ADD COLUMN meta_capi_token TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'meta_test_event_code') THEN
        ALTER TABLE public.site_settings ADD COLUMN meta_test_event_code TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'telegram_bot_token') THEN
        ALTER TABLE public.site_settings ADD COLUMN telegram_bot_token TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'telegram_chat_id') THEN
        ALTER TABLE public.site_settings ADD COLUMN telegram_chat_id TEXT DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'telegram_alerts_enabled') THEN
        ALTER TABLE public.site_settings ADD COLUMN telegram_alerts_enabled BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'active_courier_provider') THEN
        ALTER TABLE public.site_settings ADD COLUMN active_courier_provider TEXT DEFAULT 'redex';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'delivery_settings') THEN
        ALTER TABLE public.site_settings ADD COLUMN delivery_settings JSONB DEFAULT '{"cod_enabled": true, "default_method": "DOMICILE", "origin_hub": "BISKRA_07", "custom_fees": {}}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'integrations') THEN
        ALTER TABLE public.site_settings ADD COLUMN integrations JSONB DEFAULT '{"courier": {"active_provider": "redex", "enabled": true}, "telegram": {"enabled": true, "bot_token": "", "chat_id": "", "events": ["ORDER_CREATED", "SHIPMENT_CREATED", "DELIVERED"]}, "meta": {"pixel_id": "", "capi_enabled": false, "capi_token": ""}}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'localization') THEN
        ALTER TABLE public.site_settings ADD COLUMN localization JSONB DEFAULT '{"default_language": "ar", "supported_languages": ["ar", "fr"]}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'reassurance_pillars') THEN
        ALTER TABLE public.site_settings ADD COLUMN reassurance_pillars JSONB DEFAULT '[]'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'homepage_content') THEN
        ALTER TABLE public.site_settings ADD COLUMN homepage_content JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'social_links') THEN
        ALTER TABLE public.site_settings ADD COLUMN social_links JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'created_at') THEN
        ALTER TABLE public.site_settings ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'site_settings' AND column_name = 'updated_at') THEN
        ALTER TABLE public.site_settings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

INSERT INTO public.site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- 6. ADMIN SESSION REVOCATIONS TABLE (Durable Cross-Instance Invalidation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_session_revocations (
    sid TEXT PRIMARY KEY,
    revoked_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_session_revocations' AND column_name = 'revoked_at') THEN
        ALTER TABLE public.admin_session_revocations ADD COLUMN revoked_at TIMESTAMPTZ DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'admin_session_revocations' AND column_name = 'expires_at') THEN
        ALTER TABLE public.admin_session_revocations ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_session_revocations_exp ON public.admin_session_revocations(expires_at);


-- ============================================================================
-- 7. AUXILIARY SENSITIVE TABLES (Ensure Presence & Canonical FK Normalization)
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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'phone2') THEN
        ALTER TABLE public.customers ADD COLUMN phone2 TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'email') THEN
        ALTER TABLE public.customers ADD COLUMN email TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'wilaya') THEN
        ALTER TABLE public.customers ADD COLUMN wilaya TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'commune') THEN
        ALTER TABLE public.customers ADD COLUMN commune TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'address') THEN
        ALTER TABLE public.customers ADD COLUMN address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'notes') THEN
        ALTER TABLE public.customers ADD COLUMN notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'orders_count') THEN
        ALTER TABLE public.customers ADD COLUMN orders_count INTEGER DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'total_spent') THEN
        ALTER TABLE public.customers ADD COLUMN total_spent NUMERIC DEFAULT 0;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL REFERENCES public.orders(order_id) ON DELETE RESTRICT,
    product_id UUID,
    variant_id UUID,
    pack_id TEXT CHECK (pack_id IN ('PACK1', 'PACK2', 'PACK3')),
    product_name TEXT,
    product_name_snapshot TEXT,
    variant_label_snapshot TEXT,
    unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_price NUMERIC,
    line_total NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
DECLARE
    null_item_order_id_count INT := 0;
    unmapped_items_count INT := 0;
    fk_rec RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_id') THEN
        ALTER TABLE public.order_items ADD COLUMN product_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'variant_id') THEN
        ALTER TABLE public.order_items ADD COLUMN variant_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'pack_id') THEN
        ALTER TABLE public.order_items ADD COLUMN pack_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_name') THEN
        ALTER TABLE public.order_items ADD COLUMN product_name TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'product_name_snapshot') THEN
        ALTER TABLE public.order_items ADD COLUMN product_name_snapshot TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'variant_label_snapshot') THEN
        ALTER TABLE public.order_items ADD COLUMN variant_label_snapshot TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'total_price') THEN
        ALTER TABLE public.order_items ADD COLUMN total_price NUMERIC;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'line_total') THEN
        ALTER TABLE public.order_items ADD COLUMN line_total NUMERIC;
    END IF;

    -- Catalog-driven discovery & removal of ALL foreign keys on public.order_items(order_id)
    FOR fk_rec IN
        SELECT
            con.oid AS con_oid,
            con.conname,
            con.confrelid,
            con.confdeltype,
            cardinality(con.conkey) AS key_len,
            cardinality(con.confkey) AS fkey_len,
            ref_attr.attname AS ref_col_name,
            pg_get_constraintdef(con.oid) AS con_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = ANY(con.conkey)
        LEFT JOIN pg_catalog.pg_attribute ref_attr
          ON ref_attr.attrelid = con.confrelid
         AND ref_attr.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.order_items'::regclass
          AND con.contype = 'f'
          AND src_attr.attname = 'order_id'
        ORDER BY con.conname
    LOOP
        IF fk_rec.key_len != 1 OR fk_rec.fkey_len != 1 THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Composite foreign key % on public.order_items(order_id) (%) is not supported for automatic replacement.',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        IF fk_rec.confrelid != 'public.orders'::regclass OR COALESCE(fk_rec.ref_col_name, '') NOT IN ('id', 'order_id') THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Foreign key % on public.order_items(order_id) references unexpected target (%). Expected public.orders(id) or public.orders(order_id).',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        RAISE NOTICE 'CATALOG_FK_DISCOVERY: Dropping FK % on public.order_items(order_id) -> public.orders(%) [confdeltype=%, def=%]',
            fk_rec.conname, fk_rec.ref_col_name, fk_rec.confdeltype, fk_rec.con_def;

        EXECUTE format('ALTER TABLE public.order_items DROP CONSTRAINT %I;', fk_rec.conname);
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'order_items'
          AND column_name = 'order_id'
          AND data_type != 'text'
    ) THEN
        ALTER TABLE public.order_items ALTER COLUMN order_id TYPE TEXT USING order_id::text;
    END IF;

    UPDATE public.order_items oi
    SET order_id = o.order_id
    FROM public.orders o
    WHERE lower(trim(oi.order_id)) = lower(o.id::text)
      AND oi.order_id IS DISTINCT FROM o.order_id;

    SELECT COUNT(*) INTO null_item_order_id_count
    FROM public.order_items
    WHERE order_id IS NULL OR trim(order_id) = '';

    IF null_item_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % order_items records with NULL or empty order_id.', null_item_order_id_count;
    END IF;

    SELECT COUNT(*) INTO unmapped_items_count
    FROM public.order_items oi
    LEFT JOIN public.orders o ON oi.order_id = o.order_id
    WHERE o.order_id IS NULL;

    IF unmapped_items_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % order_items records referencing non-existent order_id values. Cannot apply order_items_order_id_fkey.', unmapped_items_count;
    END IF;

    ALTER TABLE public.order_items ALTER COLUMN order_id SET NOT NULL;

    ALTER TABLE public.order_items
        ADD CONSTRAINT order_items_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE RESTRICT;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'SYSTEM',
    details JSONB DEFAULT '{}'::jsonb,
    payload JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'details') THEN
        ALTER TABLE public.audit_logs ADD COLUMN details JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'payload') THEN
        ALTER TABLE public.audit_logs ADD COLUMN payload JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'ip_address') THEN
        ALTER TABLE public.audit_logs ADD COLUMN ip_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'user_agent') THEN
        ALTER TABLE public.audit_logs ADD COLUMN user_agent TEXT;
    END IF;
END $$;

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

DO $$
DECLARE
    null_recon_order_id_count INT := 0;
    unmapped_recon_count INT := 0;
    duplicate_recon_order_id_count INT := 0;
    fk_rec RECORD;
    uq_rec RECORD;
BEGIN
    -- Catalog-driven discovery & removal of ALL foreign keys on public.cod_reconciliations(order_id)
    FOR fk_rec IN
        SELECT
            con.oid AS con_oid,
            con.conname,
            con.confrelid,
            con.confdeltype,
            cardinality(con.conkey) AS key_len,
            cardinality(con.confkey) AS fkey_len,
            ref_attr.attname AS ref_col_name,
            pg_get_constraintdef(con.oid) AS con_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = ANY(con.conkey)
        LEFT JOIN pg_catalog.pg_attribute ref_attr
          ON ref_attr.attrelid = con.confrelid
         AND ref_attr.attnum = con.confkey[1]
        WHERE con.conrelid = 'public.cod_reconciliations'::regclass
          AND con.contype = 'f'
          AND src_attr.attname = 'order_id'
        ORDER BY con.conname
    LOOP
        IF fk_rec.key_len != 1 OR fk_rec.fkey_len != 1 THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Composite foreign key % on public.cod_reconciliations(order_id) (%) is not supported for automatic replacement.',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        IF fk_rec.confrelid != 'public.orders'::regclass OR COALESCE(fk_rec.ref_col_name, '') NOT IN ('id', 'order_id') THEN
            RAISE EXCEPTION 'PREFLIGHT_ABORT: Foreign key % on public.cod_reconciliations(order_id) references unexpected target (%). Expected public.orders(id) or public.orders(order_id).',
                fk_rec.conname, fk_rec.con_def;
        END IF;

        RAISE NOTICE 'CATALOG_FK_DISCOVERY: Dropping FK % on public.cod_reconciliations(order_id) -> public.orders(%) [confdeltype=%, def=%]',
            fk_rec.conname, fk_rec.ref_col_name, fk_rec.confdeltype, fk_rec.con_def;

        EXECUTE format('ALTER TABLE public.cod_reconciliations DROP CONSTRAINT %I;', fk_rec.conname);
    END LOOP;

    -- Catalog-driven discovery & removal of any single-column UNIQUE constraint on public.cod_reconciliations(order_id) before type conversion
    FOR uq_rec IN
        SELECT
            con.conname,
            pg_get_constraintdef(con.oid) AS con_def
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = con.conkey[1]
        WHERE con.conrelid = 'public.cod_reconciliations'::regclass
          AND con.contype = 'u'
          AND cardinality(con.conkey) = 1
          AND src_attr.attname = 'order_id'
        ORDER BY con.conname
    LOOP
        RAISE NOTICE 'CATALOG_UQ_DISCOVERY: Dropping single-column UNIQUE constraint % on public.cod_reconciliations(order_id) prior to normalization [def=%]',
            uq_rec.conname, uq_rec.con_def;
        EXECUTE format('ALTER TABLE public.cod_reconciliations DROP CONSTRAINT %I;', uq_rec.conname);
    END LOOP;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'cod_reconciliations'
          AND column_name = 'order_id'
          AND data_type != 'text'
    ) THEN
        ALTER TABLE public.cod_reconciliations ALTER COLUMN order_id TYPE TEXT USING order_id::text;
    END IF;

    UPDATE public.cod_reconciliations cr
    SET order_id = o.order_id
    FROM public.orders o
    WHERE lower(trim(cr.order_id)) = lower(o.id::text)
      AND cr.order_id IS DISTINCT FROM o.order_id;

    SELECT COUNT(*) INTO null_recon_order_id_count
    FROM public.cod_reconciliations
    WHERE order_id IS NULL OR trim(order_id) = '';

    IF null_recon_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % cod_reconciliations records with NULL or empty order_id.', null_recon_order_id_count;
    END IF;

    SELECT COUNT(*) INTO unmapped_recon_count
    FROM public.cod_reconciliations cr
    LEFT JOIN public.orders o ON cr.order_id = o.order_id
    WHERE o.order_id IS NULL;

    IF unmapped_recon_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % cod_reconciliations records referencing non-existent order_id values. Cannot apply cod_reconciliations_order_id_fkey.', unmapped_recon_count;
    END IF;

    SELECT COUNT(*) INTO duplicate_recon_order_id_count
    FROM (
        SELECT order_id
        FROM public.cod_reconciliations
        GROUP BY order_id
        HAVING COUNT(*) > 1
    ) dupes;

    IF duplicate_recon_order_id_count > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT_ABORT: Found % duplicate order_id value(s) in public.cod_reconciliations.', duplicate_recon_order_id_count;
    END IF;

    ALTER TABLE public.cod_reconciliations ALTER COLUMN order_id SET NOT NULL;

    ALTER TABLE public.cod_reconciliations
        ADD CONSTRAINT cod_reconciliations_order_id_key UNIQUE (order_id);

    ALTER TABLE public.cod_reconciliations
        ADD CONSTRAINT cod_reconciliations_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE RESTRICT;
END $$;

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


-- ============================================================================
-- 8. UNIFIED CATALOG-DRIVEN RLS, COLUMN PRIVILEGE & TABLE PRIVILEGE HARDENING
-- ============================================================================

DO $$
DECLARE
    sensitive_tables CONSTANT TEXT[] := ARRAY[
        'orders',
        'customers',
        'order_items',
        'audit_logs',
        'deliveries',
        'order_conversions',
        'order_timeline_events',
        'site_settings',
        'cod_reconciliations',
        'courier_configurations',
        'admin_session_revocations'
    ];
    tbl TEXT;
    pol RECORD;
    col RECORD;
    policy_name TEXT;
BEGIN
    FOREACH tbl IN ARRAY sensitive_tables LOOP
        -- 8.1 Enable Row Level Security unconditionally
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

        -- 8.2 Catalog Inspection of Existing RLS Policies:
        -- Drop EVERY existing policy on public.<tbl> discovered in pg_catalog.pg_policies
        FOR pol IN
            SELECT
                schemaname,
                tablename,
                policyname,
                permissive,
                roles::text AS roles_list,
                cmd
            FROM pg_catalog.pg_policies
            WHERE schemaname = 'public'
              AND tablename = tbl
            ORDER BY policyname
        LOOP
            RAISE NOTICE 'CATALOG_POLICY_AUDIT: Dropping policy %.% -> % (permissive=%, roles=%, cmd=%)',
                pol.schemaname, pol.tablename, pol.policyname, pol.permissive, pol.roles_list, pol.cmd;
            EXECUTE format('DROP POLICY %I ON public.%I;', pol.policyname, tbl);
        END LOOP;

        -- 8.3 Create deterministic service_role-only RLS policy
        policy_name := 'service_role_full_access_' || tbl;
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
            policy_name,
            tbl
        );

        -- 8.4 Explicit Column-Level Privilege Inspection & Remediation
        FOR col IN
            SELECT
                a.attname AS column_name,
                a.attacl::text AS column_acl
            FROM pg_catalog.pg_attribute a
            JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
              AND c.relname = tbl
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
        LOOP
            IF col.column_acl IS NOT NULL THEN
                RAISE NOTICE 'COLUMN_ACL_AUDIT: Remediating explicit column ACL on public.%.% (attacl=%)',
                    tbl, col.column_name, col.column_acl;
            END IF;
            EXECUTE format(
                'REVOKE ALL (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated;',
                col.column_name,
                tbl
            );
        END LOOP;

        -- 8.5 Table-Level Privilege Remediation & service_role Preservation
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated;', tbl);
        EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role;', tbl);
    END LOOP;
END $$;


-- ============================================================================
-- 9. SCHEMA, SEQUENCE & DEFAULT PRIVILEGES HARDENING (NO EXCEPTION SWALLOWING)
-- ============================================================================

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

DO $$
DECLARE
    r RECORD;
    table_defacl_exists BOOLEAN;
    seq_defacl_exists BOOLEAN;
    leaked_defacl_count INT;
    service_role_defacl_count INT;
    has_set_option_col BOOLEAN;
    can_set_role BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attrelid = 'pg_catalog.pg_auth_members'::regclass
          AND attname = 'set_option'
          AND NOT attisdropped
    ) INTO has_set_option_col;

    FOR r IN
        SELECT DISTINCT
            rol.rolname,
            rol.oid AS role_oid,
            EXISTS (
                SELECT 1
                FROM pg_catalog.pg_class c
                JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public'
                  AND c.relkind IN ('r', 'p', 'S')
                  AND c.relowner = rol.oid
            ) AS owns_public_objects
        FROM pg_catalog.pg_roles rol
        WHERE rol.rolname = current_user
           OR rol.oid IN (
               SELECT c.relowner
               FROM pg_catalog.pg_class c
               JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
           )
           OR (
               has_schema_privilege(rol.oid, 'public', 'CREATE')
               AND left(rol.rolname, 3) <> 'pg_'
               AND rol.rolname NOT IN ('anon', 'authenticated', 'authenticator', 'service_role', 'supabase_admin')
           )
        ORDER BY rol.rolname
    LOOP
        can_set_role := false;
        IF r.rolname = current_user THEN
            can_set_role := true;
        ELSIF has_set_option_col THEN
            EXECUTE $dyn$
                WITH RECURSIVE role_graph AS (
                    SELECT member, roleid, set_option
                    FROM pg_catalog.pg_auth_members
                    WHERE member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                      AND set_option = true
                    UNION
                    SELECT m.member, m.roleid, m.set_option
                    FROM pg_catalog.pg_auth_members m
                    JOIN role_graph rg ON m.member = rg.roleid
                    WHERE m.set_option = true
                )
                SELECT EXISTS (SELECT 1 FROM role_graph WHERE roleid = $1)
            $dyn$ INTO can_set_role USING r.role_oid;
        ELSE
            EXECUTE $dyn$
                WITH RECURSIVE role_graph AS (
                    SELECT member, roleid
                    FROM pg_catalog.pg_auth_members
                    WHERE member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
                    UNION
                    SELECT m.member, m.roleid
                    FROM pg_catalog.pg_auth_members m
                    JOIN role_graph rg ON m.member = rg.roleid
                )
                SELECT EXISTS (SELECT 1 FROM role_graph WHERE roleid = $1)
            $dyn$ INTO can_set_role USING r.role_oid;
        END IF;

        IF can_set_role THEN
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;', r.rolname);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;', r.rolname);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO service_role;', r.rolname);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;', r.rolname);

            SELECT EXISTS (
                SELECT 1 FROM pg_catalog.pg_default_acl
                WHERE defaclrole = r.role_oid
                  AND defaclnamespace = 'public'::regnamespace
                  AND defaclobjtype = 'r'
            ) INTO table_defacl_exists;

            SELECT EXISTS (
                SELECT 1 FROM pg_catalog.pg_default_acl
                WHERE defaclrole = r.role_oid
                  AND defaclnamespace = 'public'::regnamespace
                  AND defaclobjtype = 'S'
            ) INTO seq_defacl_exists;

            IF NOT table_defacl_exists OR NOT seq_defacl_exists THEN
                RAISE EXCEPTION 'DEFAULT_ACL_VERIFICATION_FAILED: Missing pg_default_acl entry for role % in schema public (table_defacl=%, seq_defacl=%).',
                    r.rolname, table_defacl_exists, seq_defacl_exists;
            END IF;

            SELECT COUNT(*) INTO leaked_defacl_count
            FROM pg_catalog.pg_default_acl d
            CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(d.defaclacl) > 0 THEN d.defaclacl ELSE NULL END) acl
            WHERE d.defaclrole = r.role_oid
              AND d.defaclnamespace = 'public'::regnamespace
              AND d.defaclobjtype IN ('r', 'S')
              AND (
                  acl.grantee = 0
                  OR acl.grantee::regrole::text IN ('anon', 'authenticated')
              );

            IF leaked_defacl_count > 0 THEN
                RAISE EXCEPTION 'DEFAULT_ACL_VERIFICATION_FAILED: Role % still has % default privilege grant(s) to PUBLIC, anon, or authenticated.',
                    r.rolname, leaked_defacl_count;
            END IF;

            SELECT COUNT(DISTINCT d.defaclobjtype) INTO service_role_defacl_count
            FROM pg_catalog.pg_default_acl d
            CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(d.defaclacl) > 0 THEN d.defaclacl ELSE NULL END) acl
            WHERE d.defaclrole = r.role_oid
              AND d.defaclnamespace = 'public'::regnamespace
              AND d.defaclobjtype IN ('r', 'S')
              AND acl.grantee = 'service_role'::regrole;

            IF service_role_defacl_count < 2 THEN
                RAISE EXCEPTION 'DEFAULT_ACL_VERIFICATION_FAILED: Role % is missing service_role default grants in schema public.',
                    r.rolname;
            END IF;

            RAISE NOTICE 'VERIFIED_DEFAULT_ACL: Creator role % hardened and verified in pg_default_acl for tables and sequences.', r.rolname;
        ELSE
            RAISE EXCEPTION 'CREATOR_ROLE_HARDENING_FAILED: Role % owns tables or sequences in schema public, but executing role (%) is not a member of % and cannot configure its default privileges.',
                r.rolname, current_user, r.rolname;
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- 10. IN-TRANSACTION POST-MIGRATION VERIFICATION GATE
-- ============================================================================

DO $$
DECLARE
    sensitive_tables CONSTANT TEXT[] := ARRAY[
        'orders',
        'customers',
        'order_items',
        'audit_logs',
        'deliveries',
        'order_conversions',
        'order_timeline_events',
        'site_settings',
        'cod_reconciliations',
        'courier_configurations',
        'admin_session_revocations'
    ];
    child_order_tables CONSTANT TEXT[] := ARRAY[
        'deliveries',
        'order_conversions',
        'order_timeline_events',
        'order_items',
        'cod_reconciliations'
    ];
    tbl TEXT;
    child_tbl TEXT;
    rls_enabled BOOLEAN;
    invalid_policy_count INT;
    service_policy_count INT;
    public_table_acl_leak_count INT;
    table_priv_leak_count INT;
    col_priv_leak_count INT;
    col_acl_leak_count INT;
    service_priv_ok BOOLEAN;
    public_seq_acl_leak_count INT;
    seq_leak_count INT;
    public_schema_create_leak_count INT;
    fk_total_count INT;
    fk_valid_count INT;
    col_data_type TEXT;
    col_nullable TEXT;
    r RECORD;
    owner_defacl_table_exists BOOLEAN;
    owner_defacl_seq_exists BOOLEAN;
    owner_leaked_defacl_count INT;
    owner_service_role_count INT;
BEGIN
    FOREACH tbl IN ARRAY sensitive_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Required table public.% does not exist after migration.', tbl;
        END IF;

        SELECT c.relrowsecurity INTO rls_enabled
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = tbl;

        IF NOT COALESCE(rls_enabled, false) THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: RLS is not enabled on public.%.', tbl;
        END IF;

        SELECT COUNT(*) INTO invalid_policy_count
        FROM pg_catalog.pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = tbl
          AND (
              p.roles && ARRAY['public', 'anon', 'authenticated']::name[]
              OR p.roles != ARRAY['service_role']::name[]
          );

        IF invalid_policy_count > 0 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Found % non-service_role policy/policies on public.%.', invalid_policy_count, tbl;
        END IF;

        SELECT COUNT(*) INTO service_policy_count
        FROM pg_catalog.pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = tbl
          AND p.roles = ARRAY['service_role']::name[];

        IF service_policy_count != 1 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Expected exactly 1 service_role policy on public.%, found %.', tbl, service_policy_count;
        END IF;

        -- PUBLIC is an ACL pseudo-role (grantee = 0), not a pg_roles entry.
        -- Inspect PUBLIC table grants via aclexplode (falling back to acldefault when relacl IS NULL).
        SELECT COUNT(*) INTO public_table_acl_leak_count
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(
            CASE
                WHEN c.relacl IS NULL THEN acldefault('r'::"char", c.relowner)
                WHEN cardinality(c.relacl) > 0 THEN c.relacl
                ELSE NULL
            END
        ) acl
        WHERE n.nspname = 'public'
          AND c.relname = tbl
          AND acl.grantee = 0;

        IF public_table_acl_leak_count > 0 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Found % PUBLIC (grantee=0) table ACL grant(s) on public.%.', public_table_acl_leak_count, tbl;
        END IF;

        SELECT COUNT(*) INTO table_priv_leak_count
        FROM (VALUES ('anon'), ('authenticated')) AS roln(role_name)
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
        WHERE has_table_privilege(roln.role_name, format('public.%I', tbl), p.priv);

        IF table_priv_leak_count > 0 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Found % effective table privilege leak(s) for anon/authenticated on public.%.', table_priv_leak_count, tbl;
        END IF;

        SELECT COUNT(*) INTO col_priv_leak_count
        FROM (VALUES ('anon'), ('authenticated')) AS roln(role_name)
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) AS p(priv)
        WHERE has_any_column_privilege(roln.role_name, format('public.%I', tbl), p.priv);

        IF col_priv_leak_count > 0 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Found % effective column-level privilege leak(s) for anon/authenticated on public.%.', col_priv_leak_count, tbl;
        END IF;

        SELECT COUNT(*) INTO col_acl_leak_count
        FROM pg_catalog.pg_attribute a
        JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(a.attacl) > 0 THEN a.attacl ELSE NULL END) acl
        WHERE n.nspname = 'public'
          AND c.relname = tbl
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND (
              acl.grantee = 0
              OR acl.grantee::regrole::text IN ('anon', 'authenticated')
          );

        IF col_acl_leak_count > 0 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Found % direct column ACL entry/entries for PUBLIC/anon/authenticated on public.%.', col_acl_leak_count, tbl;
        END IF;

        SELECT (
            has_table_privilege('service_role', format('public.%I', tbl), 'SELECT') AND
            has_table_privilege('service_role', format('public.%I', tbl), 'INSERT') AND
            has_table_privilege('service_role', format('public.%I', tbl), 'UPDATE') AND
            has_table_privilege('service_role', format('public.%I', tbl), 'DELETE')
        ) INTO service_priv_ok;

        IF NOT COALESCE(service_priv_ok, false) THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: service_role lacks full CRUD privileges on public.%.', tbl;
        END IF;
    END LOOP;

    -- Verify child order_id column types and canonical ON DELETE RESTRICT foreign keys via pg_constraint
    FOREACH child_tbl IN ARRAY child_order_tables LOOP
        SELECT data_type, is_nullable INTO col_data_type, col_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = child_tbl
          AND column_name = 'order_id';

        IF COALESCE(col_data_type, '') != 'text' OR COALESCE(col_nullable, '') != 'NO' THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: public.%(order_id) must be TEXT NOT NULL (found data_type=%, is_nullable=%).',
                child_tbl, col_data_type, col_nullable;
        END IF;

        SELECT COUNT(*) INTO fk_total_count
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = ANY(con.conkey)
        WHERE con.conrelid = format('public.%I', child_tbl)::regclass
          AND con.contype = 'f'
          AND src_attr.attname = 'order_id';

        SELECT COUNT(*) INTO fk_valid_count
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_attribute src_attr
          ON src_attr.attrelid = con.conrelid
         AND src_attr.attnum = con.conkey[1]
        JOIN pg_catalog.pg_attribute ref_attr
          ON ref_attr.attrelid = con.confrelid
         AND ref_attr.attnum = con.confkey[1]
        WHERE con.conrelid = format('public.%I', child_tbl)::regclass
          AND con.contype = 'f'
          AND cardinality(con.conkey) = 1
          AND cardinality(con.confkey) = 1
          AND src_attr.attname = 'order_id'
          AND con.confrelid = 'public.orders'::regclass
          AND ref_attr.attname = 'order_id'
          AND con.confdeltype = 'r'
          AND con.conname = child_tbl || '_order_id_fkey';

        IF fk_total_count != 1 OR fk_valid_count != 1 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Expected exactly 1 canonical ON DELETE RESTRICT foreign key (%_order_id_fkey -> public.orders(order_id)) on public.%(order_id), found total=%, valid=%.',
                child_tbl, child_tbl, fk_total_count, fk_valid_count;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO public_seq_acl_leak_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(
        CASE
            WHEN c.relacl IS NULL THEN acldefault('s'::"char", c.relowner)
            WHEN cardinality(c.relacl) > 0 THEN c.relacl
            ELSE NULL
        END
    ) acl
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND acl.grantee = 0;

    IF public_seq_acl_leak_count > 0 THEN
        RAISE EXCEPTION 'VERIFICATION_FAILED: Found % PUBLIC (grantee=0) sequence ACL grant(s) in schema public.', public_seq_acl_leak_count;
    END IF;

    SELECT COUNT(*) INTO seq_leak_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roln(role_name)
    CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(priv)
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND has_sequence_privilege(roln.role_name, c.oid, p.priv);

    IF seq_leak_count > 0 THEN
        RAISE EXCEPTION 'VERIFICATION_FAILED: Found % effective sequence privilege leak(s) for anon/authenticated in schema public.', seq_leak_count;
    END IF;

    SELECT COUNT(*) INTO public_schema_create_leak_count
    FROM pg_catalog.pg_namespace n
    CROSS JOIN LATERAL aclexplode(
        CASE
            WHEN n.nspacl IS NULL THEN acldefault('n'::"char", n.nspowner)
            WHEN cardinality(n.nspacl) > 0 THEN n.nspacl
            ELSE NULL
        END
    ) acl
    WHERE n.nspname = 'public'
      AND acl.grantee = 0
      AND acl.privilege_type = 'CREATE';

    IF public_schema_create_leak_count > 0
       OR has_schema_privilege('anon', 'public', 'CREATE')
       OR has_schema_privilege('authenticated', 'public', 'CREATE') THEN
        RAISE EXCEPTION 'VERIFICATION_FAILED: PUBLIC, anon, or authenticated still holds CREATE privilege on schema public.';
    END IF;

    -- 10.8 Verify default privileges for all actual object owners in schema public
    FOR r IN
        SELECT DISTINCT rol.rolname, rol.oid AS role_oid
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_catalog.pg_roles rol ON rol.oid = c.relowner
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S')
        ORDER BY rol.rolname
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_default_acl
            WHERE defaclrole = r.role_oid
              AND defaclnamespace = 'public'::regnamespace
              AND defaclobjtype = 'r'
        ) INTO owner_defacl_table_exists;

        SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_default_acl
            WHERE defaclrole = r.role_oid
              AND defaclnamespace = 'public'::regnamespace
              AND defaclobjtype = 'S'
        ) INTO owner_defacl_seq_exists;

        IF NOT owner_defacl_table_exists OR NOT owner_defacl_seq_exists THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Actual object owner % in schema public is missing pg_default_acl hardening (table=%, seq=%).',
                r.rolname, owner_defacl_table_exists, owner_defacl_seq_exists;
        END IF;

        SELECT COUNT(*) INTO owner_leaked_defacl_count
        FROM pg_catalog.pg_default_acl d
        CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(d.defaclacl) > 0 THEN d.defaclacl ELSE NULL END) acl
        WHERE d.defaclrole = r.role_oid
          AND d.defaclnamespace = 'public'::regnamespace
          AND d.defaclobjtype IN ('r', 'S')
          AND (
              acl.grantee = 0
              OR acl.grantee::regrole::text IN ('anon', 'authenticated')
          );

        IF owner_leaked_defacl_count > 0 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Actual object owner % has % leaking default privilege(s) to PUBLIC/anon/authenticated in schema public.',
                r.rolname, owner_leaked_defacl_count;
        END IF;

        SELECT COUNT(DISTINCT d.defaclobjtype) INTO owner_service_role_count
        FROM pg_catalog.pg_default_acl d
        CROSS JOIN LATERAL aclexplode(CASE WHEN cardinality(d.defaclacl) > 0 THEN d.defaclacl ELSE NULL END) acl
        WHERE d.defaclrole = r.role_oid
          AND d.defaclnamespace = 'public'::regnamespace
          AND d.defaclobjtype IN ('r', 'S')
          AND acl.grantee = 'service_role'::regrole;

        IF owner_service_role_count < 2 THEN
            RAISE EXCEPTION 'VERIFICATION_FAILED: Actual object owner % is missing service_role default grants in schema public.',
                r.rolname;
        END IF;
    END LOOP;
END $$;

COMMIT;
