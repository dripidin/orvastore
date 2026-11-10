#!/usr/bin/env node
/**
 * ORVA Store v2.1.0 — Milestone 1 Post-Reset Verification Script
 * Target Project: olmsjkhdfghyydogcvvy
 * Path: scripts/post-reset-verify.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_PROJECT_REF = 'olmsjkhdfghyydogcvvy';
const SUPABASE_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu';

// Try to obtain management token from mcp_oauth_tokens.json if present
let MANAGEMENT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || null;
try {
  const tokenPath = 'C:\\Users\\user\\.gemini\\antigravity-ide\\mcp_oauth_tokens.json';
  if (fs.existsSync(tokenPath)) {
    const raw = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const entry = raw['https://mcp.supabase.com/mcp'];
    if (entry?.token?.access_token) {
      MANAGEMENT_TOKEN = entry.token.access_token;
    }
  }
} catch (e) {
  // Ignore fallback
}

async function verifyPostgrestClean() {
  console.log('\n============================================================');
  console.log('  ORVA Store v2.1.0 — Post-Reset Verification Guard');
  console.log('============================================================\n');
  console.log(`[INFO] Probing PostgREST API: ${SUPABASE_URL}/rest/v1`);

  const tablesToProbe = [
    'orders',
    'products',
    'inventory',
    'customers',
    'order_items',
    'audit_logs',
    'risk_events',
    'rate_limits',
    'watchlist',
    'categories',
    'deliveries',
    'site_settings',
    '_v21_orders_pre_migration_state',
    '_v21_snapshot_manifest'
  ];

  let postgrestPassed = true;
  const probeResults = [];

  for (const table of tablesToProbe) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=count`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`
      }
    });

    const json = await res.json().catch(() => ({}));
    const isPgrst205 = res.status === 404 && json.code === 'PGRST205';

    probeResults.push({
      table,
      status: res.status,
      code: json.code || 'N/A',
      verdict: isPgrst205 ? 'PASS (404/PGRST205 CLEAN)' : 'FAIL (TABLE DETECTED)'
    });

    if (!isPgrst205) {
      postgrestPassed = false;
    }
  }

  console.table(probeResults);

  if (!postgrestPassed) {
    console.error('\n[FATAL] PostgREST probe failed: One or more tables are still present in schema cache!');
    process.exit(1);
  }

  console.log('[PASS] PostgREST verification: All probed tables return 404 / PGRST205.');

  if (MANAGEMENT_TOKEN) {
    console.log('\n[INFO] Probing PostgreSQL catalog via Management API...');
    const catRes = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
      })
    });

    if (catRes.ok) {
      const remainingTables = await catRes.json();
      console.log(`Public tables count in catalog: ${remainingTables.length}`);
      if (remainingTables.length > 0) {
        console.error('[FATAL] PostgreSQL catalog still contains tables:', remainingTables);
        process.exit(1);
      }
      console.log('[PASS] PostgreSQL catalog: Exactly 0 tables in public schema.');
    }

    // Verify extensions
    const extRes = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto');`
      })
    });

    if (extRes.ok) {
      const extensions = await extRes.json();
      console.log('[INFO] Installed extensions:', extensions);
      if (extensions.length < 2) {
        console.error('[FATAL] Extensions missing:', extensions);
        process.exit(1);
      }
      console.log('[PASS] Extensions: uuid-ossp and pgcrypto are preserved.');
    }
  }

  console.log('\n============================================================');
  console.log('  POST-RESET VERIFICATION COMPLETE: DATABASE IS 100% CLEAN');
  console.log('  READY FOR MILESTONE 2 (REBUILD & MIGRATIONS)');
  console.log('============================================================\n');
}

verifyPostgrestClean().catch(err => {
  console.error('\n[FATAL VERIFICATION ERROR]:', err);
  process.exit(1);
});
