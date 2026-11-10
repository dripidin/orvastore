// scripts/verify-service-role.mjs
// ============================================================================
// ORVA Store — Server-Side Service Role Key Administrative Verification Script
// Run on server / backend deployment environment only (Node.js).
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('[CRITICAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

// Security invariant: never print, log, or expose secret keys or key fragments
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function runAdministrativeVerification() {
  console.log('--- ORVA Store: Server-Side Service Role Authority Verification ---');

  let hasError = false;

  // 1. Supabase Auth Admin API Verification
  // What this proves: Validates that the service_role key carries administrative
  // privileges against Supabase Auth (GoTrue), allowing user management and admin ops.
  try {
    const { data: users, error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (authError) {
      console.error('[FAIL] Check 1 (Auth Admin API): Rejected by Supabase Auth:', authError.message);
      hasError = true;
    } else {
      console.log('[PASS] Check 1 (Auth Admin API): Administrative authority confirmed.');
    }
  } catch (err) {
    console.error('[FAIL] Check 1 (Auth Admin API): Network/Client exception:', err.message);
    hasError = true;
  }

  // 2. Database Policy & Query Access Verification
  // What this proves: Validates that the client connects to PostgREST, authenticates as
  // role 'service_role', and satisfies table-level policies on production relations.
  // Note: This proves table query access under service_role credentials; it does not
  // independently test role BYPASSRLS attribute (which is verified via PostgreSQL catalog).
  try {
    const { count, error: dbError } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true });

    if (dbError) {
      console.error('[FAIL] Check 2 (Database Access): Query rejected by database:', dbError.message);
      hasError = true;
    } else {
      console.log('[PASS] Check 2 (Database Access): Database query access verified under service_role credentials.');
    }
  } catch (err) {
    console.error('[FAIL] Check 2 (Database Access): Network/Client exception:', err.message);
    hasError = true;
  }

  if (hasError) {
    console.error('\n[CRITICAL] Service role authority verification FAILED. Investigate credentials before proceeding.');
    process.exit(1);
  }

  console.log('\n[PASS] All administrative checks passed. Server-side credentials valid.');
}

runAdministrativeVerification();

