-- ============================================================================
-- ORVA Store — Emergency Security Containment Script (Final Hardened Revision)
-- Scope: Immediately lock down data leaks on all 10 sensitive tables:
--        orders, customers, order_items, audit_logs, deliveries,
--        order_conversions, order_timeline_events, site_settings,
--        cod_reconciliations, and courier_configurations
--        (plus admin_session_revocations if present).
-- Guarantees:
--   1. Enables RLS on all existing sensitive tables.
--   2. Audits and drops ALL existing RLS policies on the sensitive tables via
--      direct pg_catalog.pg_policies inspection (not only known policy names),
--      recreating strictly service_role-only policies.
--   3. Explicitly inspects and revokes all column-level privileges (pg_attribute.attacl)
--      as well as table-level, sequence-level, and schema CREATE privileges
--      from PUBLIC, anon, and authenticated.
--   4. Hardens default privileges without exception-swallowing handlers, and
--      independently verifies pg_default_acl for every targetable creator role.
--   5. Preserves 100% of customer/order data (zero DELETE/UPDATE/TRUNCATE/DROP TABLE)
--      and preserves server-side service_role functionality.
--   6. Runs in-transaction post-remediation verification assertions before COMMIT.
-- Status: PREPARED FOR OPERATOR REVIEW — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. BOUNDED LOCK AND STATEMENT TIMEOUTS (DDL-01 LOCK SAFETY)
-- Prevents lock queuing and connection pool exhaustion during DDL acquisition
-- ============================================================================
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

-- ============================================================================
-- 1. CATALOG-DRIVEN RLS, TABLE PRIVILEGE & COLUMN PRIVILEGE CONTAINMENT
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
    -- Mandatory check: core orders table must exist in production
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'orders'
    ) THEN
        RAISE EXCEPTION 'CONTAINMENT_ABORT: Core table public.orders does not exist in schema public.';
    END IF;

    FOREACH tbl IN ARRAY sensitive_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- 1.1 Enable Row Level Security on the table
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

            -- 1.2 Catalog Inspection of Existing RLS Policies:
            -- Identify and drop EVERY existing policy on public.<tbl> via pg_catalog.pg_policies
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

            -- 1.3 Create deterministic service_role-only RLS policy
            policy_name := 'service_role_full_access_' || tbl;
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
                policy_name,
                tbl
            );

            -- 1.4 Explicit Column-Level Privilege Inspection & Remediation:
            -- Inspect every non-dropped user column in pg_catalog.pg_attribute and revoke
            -- any column-level grants from PUBLIC, anon, and authenticated.
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

            -- 1.5 Table-Level Privilege Remediation & service_role Preservation
            EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated;', tbl);
            EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role;', tbl);

            RAISE NOTICE 'CONTAINMENT_HARDENED: public.% (RLS enabled, policies replaced, table & column ACLs revoked from PUBLIC/anon/authenticated, service_role granted).', tbl;
        ELSE
            RAISE WARNING 'TABLE_NOT_PRESENT: public.% does not exist yet in schema public; skipped until created by migration 20261108_000002.', tbl;
        END IF;
    END LOOP;
END $$;


-- ============================================================================
-- 2. SCHEMA AND SEQUENCE PRIVILEGE HARDENING
-- ============================================================================
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- ============================================================================
-- 3. DEFAULT PRIVILEGES HARDENING & INDEPENDENT VERIFICATION (NO EXCEPTION SWALLOWING)
-- ============================================================================
-- 3.1 Always harden default privileges for the current executing role
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- 3.2 Harden default privileges for every actual owner of relations in schema public
--     and core operational creator roles, failing hard if any required role cannot be hardened.
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

            -- Independent catalog verification in pg_catalog.pg_default_acl
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
-- 4. IN-TRANSACTION POST-REMEDIATION VERIFICATION GATE
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
    rls_enabled BOOLEAN;
    invalid_policy_count INT;
    service_policy_count INT;
    table_priv_leak_count INT;
    public_table_acl_leak_count INT;
    col_priv_leak_count INT;
    col_acl_leak_count INT;
    service_priv_ok BOOLEAN;
    seq_leak_count INT;
    public_seq_acl_leak_count INT;
    public_schema_create_leak_count INT;
    r RECORD;
    owner_defacl_table_exists BOOLEAN;
    owner_defacl_seq_exists BOOLEAN;
    owner_leaked_defacl_count INT;
    owner_service_role_count INT;
BEGIN
    FOREACH tbl IN ARRAY sensitive_tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            -- 4.1 Verify RLS is enabled
            SELECT c.relrowsecurity INTO rls_enabled
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = tbl;

            IF NOT COALESCE(rls_enabled, false) THEN
                RAISE EXCEPTION 'VERIFICATION_FAILED: RLS is not enabled on public.%.', tbl;
            END IF;

            -- 4.2 Verify no policy on public.<tbl> applies to PUBLIC, anon, or authenticated
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

            -- 4.3 Verify anon and authenticated have zero effective table privileges,
            --     and PUBLIC (grantee = 0) has zero table ACL grants via aclexplode
            SELECT COUNT(*) INTO table_priv_leak_count
            FROM (VALUES ('anon'), ('authenticated')) AS roln(role_name)
            CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(priv)
            WHERE has_table_privilege(roln.role_name, format('public.%I', tbl), p.priv);

            IF table_priv_leak_count > 0 THEN
                RAISE EXCEPTION 'VERIFICATION_FAILED: Found % effective table privilege leak(s) for anon/authenticated on public.%.', table_priv_leak_count, tbl;
            END IF;

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
              AND (
                  acl.grantee = 0
                  OR acl.grantee::regrole::text IN ('anon', 'authenticated')
              );

            IF public_table_acl_leak_count > 0 THEN
                RAISE EXCEPTION 'VERIFICATION_FAILED: Found % direct table ACL grant(s) to PUBLIC (grantee=0), anon, or authenticated on public.%.', public_table_acl_leak_count, tbl;
            END IF;

            -- 4.4 Verify anon and authenticated have zero effective column-level privileges,
            --     and PUBLIC (grantee = 0), anon, and authenticated have zero column ACL grants via aclexplode
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
                RAISE EXCEPTION 'VERIFICATION_FAILED: Found % direct column ACL entry/entries for PUBLIC (grantee=0)/anon/authenticated on public.%.', col_acl_leak_count, tbl;
            END IF;

            -- 4.5 Verify service_role retains full CRUD privileges
            SELECT (
                has_table_privilege('service_role', format('public.%I', tbl), 'SELECT') AND
                has_table_privilege('service_role', format('public.%I', tbl), 'INSERT') AND
                has_table_privilege('service_role', format('public.%I', tbl), 'UPDATE') AND
                has_table_privilege('service_role', format('public.%I', tbl), 'DELETE')
            ) INTO service_priv_ok;

            IF NOT COALESCE(service_priv_ok, false) THEN
                RAISE EXCEPTION 'VERIFICATION_FAILED: service_role lacks full CRUD privileges on public.%.', tbl;
            END IF;
        END IF;
    END LOOP;

    -- 4.6 Verify no sequence privileges exist for anon/authenticated (effective) or PUBLIC (aclexplode grantee = 0)
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
      AND (
          acl.grantee = 0
          OR acl.grantee::regrole::text IN ('anon', 'authenticated')
      );

    IF public_seq_acl_leak_count > 0 THEN
        RAISE EXCEPTION 'VERIFICATION_FAILED: Found % direct sequence ACL grant(s) to PUBLIC (grantee=0), anon, or authenticated in schema public.', public_seq_acl_leak_count;
    END IF;

    -- 4.7 Verify schema CREATE privilege is revoked from PUBLIC (aclexplode grantee = 0), anon, and authenticated
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
      AND acl.privilege_type = 'CREATE'
      AND (
          acl.grantee = 0
          OR acl.grantee::regrole::text IN ('anon', 'authenticated')
      );

    IF public_schema_create_leak_count > 0
       OR has_schema_privilege('anon', 'public', 'CREATE')
       OR has_schema_privilege('authenticated', 'public', 'CREATE') THEN
        RAISE EXCEPTION 'VERIFICATION_FAILED: PUBLIC (grantee=0), anon, or authenticated still holds CREATE privilege on schema public.';
    END IF;

    -- 4.8 Verify default privileges for all actual object owners in schema public
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
