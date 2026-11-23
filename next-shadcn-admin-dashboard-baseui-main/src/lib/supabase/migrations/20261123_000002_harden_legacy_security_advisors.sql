-- ============================================================================
-- ORVA Store — Harden Legacy Supabase Security Advisors (0010, 0011, 0028, 0029)
-- Migration: 20261123_000002_harden_legacy_security_advisors.sql
-- Non-destructive & idempotent.
-- ============================================================================

-- 1. Fix security_definer_view (ERROR 0010) + revoke write privileges on public.public_site_settings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'public_site_settings' AND c.relkind = 'v'
  ) THEN
    ALTER VIEW public.public_site_settings SET (security_invoker = true);
    REVOKE ALL PRIVILEGES ON TABLE public.public_site_settings FROM PUBLIC, anon, authenticated;
    GRANT SELECT ON TABLE public.public_site_settings TO anon, authenticated, service_role;
  END IF;
END $$;

-- 2. Fix function_search_path_mutable (WARN 0011) on public.update_updated_at_column()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column' AND p.pronargs = 0
  ) THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  END IF;
END $$;

-- 3. Fix anon/authenticated_security_definer_function_executable (WARN 0028 & 0029) on public.rls_auto_enable()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable' AND p.pronargs = 0
  ) THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
