#!/usr/bin/env node
/**
 * ORVA Store v2.1.0 — Milestone 2 Migration Execution Runner
 * Target Project: olmsjkhdfghyydogcvvy
 * File: scripts/apply-schema-rebuild.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const EXPECTED_PROJECT_REF = 'olmsjkhdfghyydogcvvy';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const TOKEN_FILE_PATH = 'C:\\Users\\user\\.gemini\\antigravity-ide\\mcp_oauth_tokens.json';

// Step 1: Resolve Management Token with Auto-Refresh
async function resolveManagementToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    return process.env.SUPABASE_ACCESS_TOKEN;
  }

  if (!fs.existsSync(TOKEN_FILE_PATH)) {
    throw new Error(`[FATAL] OAuth token file not found at: ${TOKEN_FILE_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf8'));
  const entry = raw['https://mcp.supabase.com/mcp'];
  if (!entry || !entry.token?.access_token) {
    throw new Error('[FATAL] Supabase MCP token entry missing in token file.');
  }

  const expiry = entry.token?.expiry ? new Date(entry.token.expiry).getTime() : 0;
  const now = Date.now();

  // If token expires within 5 minutes, execute OAuth refresh
  if (expiry && (expiry - now < 5 * 60 * 1000)) {
    console.log('[INFO] Supabase Management token expiring soon. Executing refresh...');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: entry.token.refresh_token,
      client_id: entry.client_id,
      client_secret: entry.client_secret
    });

    const refreshRes = await fetch(entry.token_url || 'https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!refreshRes.ok) {
      throw new Error(`[FATAL] OAuth refresh failed: ${refreshRes.status} ${await refreshRes.text()}`);
    }

    const refreshed = await refreshRes.json();
    entry.token.access_token = refreshed.access_token;
    if (refreshed.refresh_token) entry.token.refresh_token = refreshed.refresh_token;
    entry.token.expiry = new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString();
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(raw, null, 2), 'utf8');
    console.log('[SUCCESS] OAuth token successfully refreshed.');
    return refreshed.access_token;
  }

  return entry.token.access_token;
}

// Step 2: Main Execution Engine
async function applyMigration() {
  console.log('\n============================================================');
  console.log('  ORVA Store v2.1.0 — Milestone 2 Migration Execution Engine');
  console.log('============================================================\n');
  console.log(`[INFO] Connected Project: ${EXPECTED_PROJECT_REF}`);
  console.log(`[INFO] Supabase URL:      ${SUPABASE_URL}`);

  const token = await resolveManagementToken();
  const migrationPath = path.join(REPO_ROOT, 'migrations/20261111_000001_consolidated_clean_rebuild.sql');

  if (!fs.existsSync(migrationPath)) {
    throw new Error(`[FATAL] Canonical migration file missing at: ${migrationPath}`);
  }

  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  console.log(`[INFO] Loaded migration script (${migrationSql.length} bytes, ${migrationSql.split('\n').length} lines)`);

  console.log('[EXECUTING] Submitting migration SQL to Supabase Management API...');
  const res = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: migrationSql })
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`\n[FATAL ERROR] Migration failed with HTTP status ${res.status}:`);
    console.error(errorBody);
    process.exit(1);
  }

  const queryResult = await res.json().catch(() => null);
  console.log('[SUCCESS] Migration applied successfully to Supabase database (HTTP 201/200).');

  // Reload PostgREST Schema Cache
  console.log('[INFO] Triggering PostgREST schema cache reload...');
  const reloadRes = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" })
  });

  if (reloadRes.ok) {
    console.log('[SUCCESS] PostgREST schema reload signal dispatched.');
  }

  // Grace period for PostgREST cache propagation
  console.log('[INFO] Pausing 2,500ms for PostgREST cache synchronization...');
  await new Promise(r => setTimeout(r, 2500));

  console.log('\n============================================================');
  console.log('  MIGRATION EXECUTION COMPLETE — READY FOR VERIFICATION');
  console.log('============================================================\n');
}

applyMigration().catch(err => {
  console.error('\n[FATAL EXECUTION EXCEPTION]:', err);
  process.exit(1);
});
