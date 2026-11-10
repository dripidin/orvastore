#!/usr/bin/env node
/**
 * ORVA Store v2.1.0 — Milestone 1: Pre-Reset Backup Extraction Engine
 * Target Supabase Project: olmsjkhdfghyydogcvvy
 * Path: scripts/backup-pre-reset.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const EXPECTED_PROJECT_REF = 'olmsjkhdfghyydogcvvy';
const DEFAULT_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const DEFAULT_ANON_KEY = 'sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu';

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '.env.local'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

if (!SUPABASE_URL.includes(EXPECTED_PROJECT_REF)) {
  console.error(`[FATAL ERROR] Refusing to run backup: Target URL "${SUPABASE_URL}" does not contain expected project reference "${EXPECTED_PROJECT_REF}".`);
  process.exit(1);
}

const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'pre-reset');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

console.log('\n============================================================');
console.log('  ORVA Store v2.1.0 — Pre-Reset Backup Extraction Engine');
console.log('============================================================\n');
console.log(`[INFO] Connected to Supabase Project: ${EXPECTED_PROJECT_REF}`);
console.log(`[INFO] Supabase URL:                  ${SUPABASE_URL}`);
console.log(`[INFO] Target Backup Directory:       ${BACKUP_DIR}\n`);

const TABLES = ['orders', 'products', 'customers', 'order_items', 'audit_logs', 'inventory'];

async function fetchTableData(table) {
  let allRows = [];
  let offset = 0;
  const limit = 500;
  let totalReported = null;

  while (true) {
    const endpoint = `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`;
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'count=exact'
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to fetch table "${table}": HTTP ${res.status} ${res.statusText} — ${errText}`);
    }

    const contentRange = res.headers.get('content-range');
    if (contentRange) {
      const parts = contentRange.split('/');
      if (parts[1] && parts[1] !== '*') {
        totalReported = parseInt(parts[1], 10);
      } else {
        totalReported = 0;
      }
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) {
      throw new Error(`Unexpected non-array response for table "${table}": ${JSON.stringify(rows)}`);
    }

    allRows = allRows.concat(rows);

    if (rows.length < limit || (totalReported !== null && allRows.length >= totalReported)) {
      break;
    }
    offset += limit;
  }

  return { rows: allRows, totalReported };
}

function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

const PRE_RESET_SCHEMA_SQL = `-- =============================================================================
-- PRE-RESET SCHEMA SNAPSHOT — ORVA STORE (PROJECT: ${EXPECTED_PROJECT_REF})
-- Reconstructed DDL for legacy tables captured prior to database reset
-- Captured at: ${new Date().toISOString()}
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table 1: orders (Legacy pre-reset schema, 312 historical records)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id TEXT NOT NULL,
    store_id TEXT,
    full_name TEXT,
    phone TEXT,
    wilaya TEXT,
    commune TEXT,
    delivery_type TEXT,
    delivery_time TEXT,
    quantity INTEGER,
    product_name TEXT,
    product_total TEXT,
    shipping_fee TEXT,
    price_num NUMERIC,
    grand_total TEXT,
    status TEXT DEFAULT 'pending',
    in_redex BOOLEAN DEFAULT false,
    redex_tracking_code TEXT,
    notes TEXT,
    remarks JSONB DEFAULT '[]'::jsonb,
    client_ip TEXT,
    device_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    client_ip_hash TEXT,
    risk_score NUMERIC DEFAULT 0,
    risk_level TEXT DEFAULT 'LOW',
    risk_decision TEXT DEFAULT 'ALLOW',
    risk_reasons TEXT,
    unit_price NUMERIC,
    total_price NUMERIC,
    courier TEXT DEFAULT 'manual',
    tracking_code TEXT
);

-- Table 2: products (Legacy pre-reset schema, 1 historical SPEAR-DZ pack)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    base_price NUMERIC NOT NULL,
    compare_price NUMERIC,
    cost_price NUMERIC,
    is_bundle BOOLEAN DEFAULT false,
    bundle_items JSONB,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table 3: customers (Legacy empty table)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    total_orders INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table 4: order_items (Legacy empty table)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC,
    total_price NUMERIC,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 5: audit_logs (Legacy empty table)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Table 6: inventory (Legacy empty obsolete table)
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID,
    sku TEXT,
    stock_quantity INTEGER DEFAULT 0,
    count INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);
`;

async function main() {
  const timestamp = new Date().toISOString();
  const manifest = {
    manifestVersion: '1.0.0',
    projectRef: EXPECTED_PROJECT_REF,
    project_ref: EXPECTED_PROJECT_REF,
    supabaseUrl: SUPABASE_URL,
    supabase_url: SUPABASE_URL,
    extractedAt: timestamp,
    extracted_at: timestamp,
    extractor: 'ORVA Store M1 Pre-Reset Backup Engine',
    total_orders_extracted: 0,
    total_products_extracted: 0,
    totalFiles: 0,
    totalRecords: 0,
    files: {}
  };

  const summary = [];

  for (const table of TABLES) {
    process.stdout.write(`[EXTRACTING] Table "${table}"... `);
    const { rows, totalReported } = await fetchTableData(table);
    const filename = `${table}.json`;
    const filePath = path.join(BACKUP_DIR, filename);
    const jsonContent = JSON.stringify(rows, null, 2);

    fs.writeFileSync(filePath, jsonContent, 'utf8');

    const buf = Buffer.from(jsonContent, 'utf8');
    const bytes = buf.byteLength;
    const sha256 = computeSha256(buf);

    if (table === 'orders') manifest.total_orders_extracted = rows.length;
    if (table === 'products') manifest.total_products_extracted = rows.length;
    manifest.totalRecords += rows.length;
    manifest.totalFiles += 1;

    manifest.files[filename] = {
      table,
      path: `backups/pre-reset/${filename}`,
      bytes,
      byteSize: bytes,
      record_count: rows.length,
      rowCount: rows.length,
      postgrest_reported_count: totalReported,
      sha256,
      contentType: 'application/json'
    };

    console.log(`DONE (${rows.length} rows, ${bytes} bytes, SHA-256: ${sha256.slice(0, 16)}...)`);

    summary.push({
      file: filename,
      records: rows.length,
      bytes: `${(bytes / 1024).toFixed(2)} KB`,
      sha256: sha256.slice(0, 16) + '...'
    });
  }

  process.stdout.write(`[EXTRACTING] Schema snapshot (pre_reset_schema.sql)... `);
  const schemaFile = 'pre_reset_schema.sql';
  const schemaPath = path.join(BACKUP_DIR, schemaFile);
  fs.writeFileSync(schemaPath, PRE_RESET_SCHEMA_SQL, 'utf8');

  const schemaBuf = Buffer.from(PRE_RESET_SCHEMA_SQL, 'utf8');
  const schemaBytes = schemaBuf.byteLength;
  const schemaSha256 = computeSha256(schemaBuf);

  manifest.totalFiles += 1;
  manifest.files[schemaFile] = {
    type: 'schema_ddl',
    path: `backups/pre-reset/${schemaFile}`,
    bytes: schemaBytes,
    byteSize: schemaBytes,
    record_count: null,
    rowCount: null,
    sha256: schemaSha256,
    contentType: 'application/sql'
  };

  console.log(`DONE (${schemaBytes} bytes, SHA-256: ${schemaSha256.slice(0, 16)}...)`);

  summary.push({
    file: schemaFile,
    records: 'DDL',
    bytes: `${(schemaBytes / 1024).toFixed(2)} KB`,
    sha256: schemaSha256.slice(0, 16) + '...'
  });

  const manifestFile = 'manifest.json';
  const manifestPath = path.join(BACKUP_DIR, manifestFile);
  const manifestContent = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(manifestPath, manifestContent, 'utf8');

  console.log('\n============================================================');
  console.log('[SUCCESS] All pre-reset backup files created successfully:');
  console.table(summary);
  console.log(`Manifest written to: ${manifestPath}`);
  console.log(`Total Orders: ${manifest.total_orders_extracted} | Total Products: ${manifest.total_products_extracted}`);
  console.log('============================================================\n');
}

main().catch(err => {
  console.error(`\n[FATAL BACKUP ERROR]`, err);
  process.exit(1);
});
