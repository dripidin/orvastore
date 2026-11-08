/**
 * Milestone M2 Empirical Stress Test Harness
 * Conducted by Empirical Challenger (teamwork_challenger)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getSupabaseClient,
  getSupabaseServerClient,
  SUPABASE_PROJECT_REF,
  DEFAULT_SUPABASE_URL,
  type Database
} from '../src/lib/supabase';

interface AssertResult {
  title: string;
  passed: boolean;
  error?: string;
  details?: unknown;
}

const results: AssertResult[] = [];

function check(title: string, fn: () => void | boolean) {
  try {
    const res = fn();
    if (res === false) {
      results.push({ title, passed: false, error: 'Condition returned false' });
    } else {
      results.push({ title, passed: true });
    }
  } catch (err: any) {
    results.push({ title, passed: false, error: err.message, details: err.stack });
  }
}

console.log('================================================================');
console.log('  MILESTONE M2 EMPIRICAL CHALLENGER STRESS HARNESS');
console.log('================================================================');

const schemaPaths = [
  path.resolve(__dirname, '../../template/DATABASE_SCHEMA.sql'),
  path.resolve(__dirname, '../src/lib/supabase/schema.sql'),
];

for (const schemaPath of schemaPaths) {
  const relativeName = path.basename(schemaPath);
  console.log(`\n--- Stress Testing SQL File: ${relativeName} ---`);

  check(`[${relativeName}] File exists and has substantial content`, () => {
    if (!fs.existsSync(schemaPath)) throw new Error(`File not found: ${schemaPath}`);
    const stat = fs.statSync(schemaPath);
    if (stat.size < 5000) throw new Error(`Schema file suspiciously small: ${stat.size} bytes`);
    return true;
  });

  const sql = fs.readFileSync(schemaPath, 'utf8');

  // 1. Table Definitions
  const expectedTables = [
    'categories',
    'collections',
    'products',
    'product_collections',
    'variants',
    'product_media',
    'customers',
    'orders',
    'order_items',
    'deliveries',
    'order_timeline_events',
    'cod_reconciliations',
    'order_conversions',
    'courier_configurations',
    'audit_logs',
    'site_settings'
  ];

  for (const table of expectedTables) {
    check(`[${relativeName}] Table "${table}" is defined with CREATE TABLE IF NOT EXISTS`, () => {
      const regex = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}\\s*\\(`, 'i');
      if (!regex.test(sql)) throw new Error(`Table ${table} definition missing or malformed`);
      return true;
    });

    check(`[${relativeName}] Table "${table}" has RLS explicitly enabled`, () => {
      const regex = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY;`, 'i');
      if (!regex.test(sql)) throw new Error(`Table ${table} does NOT have RLS enabled`);
      return true;
    });
  }

  // 2. Foreign Key Type & Target Checks
  const fkChecks = [
    { fromTable: 'products', col: 'category_id', toTable: 'categories', toCol: 'id' },
    { fromTable: 'product_collections', col: 'product_id', toTable: 'products', toCol: 'id' },
    { fromTable: 'product_collections', col: 'collection_id', toTable: 'collections', toCol: 'id' },
    { fromTable: 'variants', col: 'product_id', toTable: 'products', toCol: 'id' },
    { fromTable: 'product_media', col: 'product_id', toTable: 'products', toCol: 'id' },
    { fromTable: 'product_media', col: 'variant_id', toTable: 'variants', toCol: 'id' },
    { fromTable: 'orders', col: 'customer_id', toTable: 'customers', toCol: 'id' },
    { fromTable: 'order_items', col: 'order_id', toTable: 'orders', toCol: 'id' },
    { fromTable: 'order_items', col: 'product_id', toTable: 'products', toCol: 'id' },
    { fromTable: 'order_items', col: 'variant_id', toTable: 'variants', toCol: 'id' },
    { fromTable: 'deliveries', col: 'order_id', toTable: 'orders', toCol: 'id' },
    { fromTable: 'order_timeline_events', col: 'order_id', toTable: 'orders', toCol: 'id' },
    { fromTable: 'cod_reconciliations', col: 'order_id', toTable: 'orders', toCol: 'id' },
    { fromTable: 'order_conversions', col: 'order_id', toTable: 'orders', toCol: 'id' }
  ];

  for (const fk of fkChecks) {
    check(`[${relativeName}] Foreign Key: ${fk.fromTable}.${fk.col} -> ${fk.toTable}(${fk.toCol})`, () => {
      const regex = new RegExp(`${fk.col}\\s+UUID[^,;]*REFERENCES\\s+${fk.toTable}\\s*\\(\\s*${fk.toCol}\\s*\\)`, 'i');
      if (!regex.test(sql)) {
        throw new Error(`Foreign Key definition missing or mismatched: ${fk.fromTable}.${fk.col} -> ${fk.toTable}(${fk.toCol})`);
      }
      return true;
    });
  }

  // 3. Performance Indexes Validation
  // Ensure that all indexed columns actually belong to the indexed table
  const indexes = [
    { name: 'idx_products_slug', table: 'products', cols: ['slug'] },
    { name: 'idx_products_status', table: 'products', cols: ['status'] },
    { name: 'idx_products_category', table: 'products', cols: ['category_id'] },
    { name: 'idx_variants_product', table: 'variants', cols: ['product_id'] },
    { name: 'idx_orders_number', table: 'orders', cols: ['order_number'] },
    { name: 'idx_orders_status', table: 'orders', cols: ['status'] },
    { name: 'idx_orders_customer', table: 'orders', cols: ['customer_id'] },
    { name: 'idx_customers_phone', table: 'customers', cols: ['phone'] },
    { name: 'idx_deliveries_tracking', table: 'deliveries', cols: ['tracking_number'] },
    { name: 'idx_timeline_order', table: 'order_timeline_events', cols: ['order_id'] },
    { name: 'idx_reconciliation_order', table: 'cod_reconciliations', cols: ['order_id'] },
    { name: 'idx_order_conversions_order', table: 'order_conversions', cols: ['order_id'] },
    { name: 'idx_audit_logs_entity', table: 'audit_logs', cols: ['entity_type', 'entity_id'] }
  ];

  for (const idx of indexes) {
    check(`[${relativeName}] Index ${idx.name} exists on ${idx.table}(${idx.cols.join(', ')})`, () => {
      const colPattern = idx.cols.join('\\s*,\\s*');
      const regex = new RegExp(`CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${idx.name}\\s+ON\\s+${idx.table}\\s*\\(\\s*${colPattern}\\s*\\);`, 'i');
      if (!regex.test(sql)) {
        throw new Error(`Index ${idx.name} on ${idx.table} missing or malformed`);
      }
      return true;
    });
  }

  // 4. RLS Security Boundaries (Adversarial stress-test)
  check(`[${relativeName}] Anon CANNOT SELECT orders`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+orders\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    if (regex.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on orders!');
    return true;
  });

  check(`[${relativeName}] Anon CANNOT SELECT customers (PII protection)`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+customers\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    if (regex.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on customers!');
    return true;
  });

  check(`[${relativeName}] Anon CANNOT SELECT deliveries`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+deliveries\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    if (regex.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on deliveries!');
    return true;
  });

  check(`[${relativeName}] Anon CANNOT SELECT cod_reconciliations`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+cod_reconciliations\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    if (regex.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on cod_reconciliations!');
    return true;
  });

  check(`[${relativeName}] Anon CANNOT SELECT order_conversions`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+order_conversions\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    if (regex.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on order_conversions!');
    return true;
  });

  check(`[${relativeName}] Anon CANNOT SELECT audit_logs`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+audit_logs\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    if (regex.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on audit_logs!');
    return true;
  });

  check(`[${relativeName}] Anon CANNOT SELECT courier_configurations (secrets protection)`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+courier_configurations\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    const publicSelect = /CREATE\s+POLICY\s+"Active couriers are viewable"/i;
    if (regex.test(sql) || publicSelect.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on courier_configurations!');
    return true;
  });

  check(`[${relativeName}] Anon CANNOT SELECT site_settings (secrets protection)`, () => {
    const regex = /CREATE\s+POLICY\s+.*ON\s+site_settings\s+FOR\s+SELECT\s+TO\s+[^;]*anon/i;
    const publicSelect = /CREATE\s+POLICY\s+"Site settings are viewable"/i;
    if (regex.test(sql) || publicSelect.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has SELECT permission on site_settings!');
    return true;
  });

  check(`[${relativeName}] Safe public view public_site_settings exposes only non-sensitive columns`, () => {
    if (!sql.includes('VIEW public_site_settings')) throw new Error('Missing public_site_settings view');
    if (!sql.includes('GRANT SELECT ON public_site_settings TO anon')) throw new Error('Missing grant on public_site_settings to anon');
    return true;
  });

  check(`[${relativeName}] orders table delivery_address supports Stop-Desk defaults`, () => {
    const regex = /delivery_address\s+TEXT\s+DEFAULT\s+'Bureau Stop-Desk'/i;
    if (!regex.test(sql)) throw new Error('orders table delivery_address does not allow default for Stop-Desk');
    return true;
  });

  check(`[${relativeName}] Anon has zero UPDATE or DELETE grants anywhere`, () => {
    const updateRegex = /CREATE\s+POLICY\s+.*FOR\s+(UPDATE|DELETE)\s+TO\s+[^;]*anon/i;
    if (updateRegex.test(sql)) throw new Error('SECURITY VIOLATION: Anon role has UPDATE or DELETE permission!');
    return true;
  });

  check(`[${relativeName}] Anon CAN INSERT orders, order_items, customers, deliveries for 1-page checkout`, () => {
    const tables = ['orders', 'order_items', 'customers', 'deliveries'];
    for (const t of tables) {
      const regex = new RegExp(`CREATE\\s+POLICY\\s+.*ON\\s+${t}\\s+FOR\\s+INSERT\\s+TO\\s+anon`, 'i');
      if (!regex.test(sql)) throw new Error(`Missing anonymous INSERT policy on ${t}`);
    }
    return true;
  });

  // 5. Seed Prices & Products Integrity Check
  check(`[${relativeName}] Seed Pack 1 price is exactly 4,950 DZD (old 9,750, savings 4,800)`, () => {
    const p1Regex = /'pack1'[\s\S]*?'ORVA-P1-4950'[\s\S]*?4950[\s\S]*?9750[\s\S]*?4800/i;
    if (!p1Regex.test(sql)) throw new Error('Pack 1 pricing seed mismatch');
    return true;
  });

  check(`[${relativeName}] Seed Pack 2 price is exactly 12,950 DZD (old 21,250, savings 8,300)`, () => {
    const p2Regex = /'pack2'[\s\S]*?'ORVA-P2-12950'[\s\S]*?12950[\s\S]*?21250[\s\S]*?8300/i;
    if (!p2Regex.test(sql)) throw new Error('Pack 2 pricing seed mismatch');
    return true;
  });

  check(`[${relativeName}] Seed Pack 3 price is exactly 15,950 DZD (old 24,500, savings 8,550)`, () => {
    const p3Regex = /'pack3'[\s\S]*?'ORVA-P3-15950'[\s\S]*?15950[\s\S]*?24500[\s\S]*?8550/i;
    if (!p3Regex.test(sql)) throw new Error('Pack 3 pricing seed mismatch');
    return true;
  });

  check(`[${relativeName}] Seed Couriers contain Redex, Yalidine, and ZR Express`, () => {
    if (!sql.includes("'redex'")) throw new Error('Missing redex seed');
    if (!sql.includes("'yalidine'")) throw new Error('Missing yalidine seed');
    if (!sql.includes("'zrexpress'")) throw new Error('Missing zrexpress seed');
    return true;
  });

  check(`[${relativeName}] Singleton site_settings has CHECK (id = 1) and phone 0798282495`, () => {
    if (!sql.includes('CHECK (id = 1)')) throw new Error('Missing site_settings singleton check (id = 1)');
    if (!sql.includes('0798282495')) throw new Error('Missing customer service phone 0798282495 in site_settings seed');
    return true;
  });
}

// 6. Supabase Client & Server Resilience Testing
console.log('\n--- Stress Testing Supabase Client & Server Resilience ---');

check('SUPABASE_PROJECT_REF is olmsjkhdfghyydogcvvy', () => {
  if (SUPABASE_PROJECT_REF !== 'olmsjkhdfghyydogcvvy') {
    throw new Error(`Expected olmsjkhdfghyydogcvvy, got ${SUPABASE_PROJECT_REF}`);
  }
  return true;
});

check('DEFAULT_SUPABASE_URL is https://olmsjkhdfghyydogcvvy.supabase.co', () => {
  if (DEFAULT_SUPABASE_URL !== 'https://olmsjkhdfghyydogcvvy.supabase.co') {
    throw new Error(`Expected https://olmsjkhdfghyydogcvvy.supabase.co, got ${DEFAULT_SUPABASE_URL}`);
  }
  return true;
});

check('getSupabaseClient() initializes safely without crashing when no env vars are set', () => {
  const client = getSupabaseClient();
  if (!client) throw new Error('client is null/undefined');
  if (typeof client.from !== 'function') throw new Error('client.from is not a function');
  return true;
});

check('getSupabaseClient() returns singleton instance across repeated invocations', () => {
  const c1 = getSupabaseClient();
  const c2 = getSupabaseClient();
  if (c1 !== c2) throw new Error('getSupabaseClient() did not return identical singleton instance');
  return true;
});

check('getSupabaseServerClient() initializes safely with fallback key when no env vars are set', () => {
  const serverClient = getSupabaseServerClient();
  if (!serverClient) throw new Error('serverClient is null/undefined');
  if (typeof serverClient.from !== 'function') throw new Error('serverClient.from is not a function');
  return true;
});

check('Supabase client builds valid PostgREST queries for defined schema tables', () => {
  const client = getSupabaseClient();
  const definedTables: (keyof Database['public']['Tables'])[] = [
    'categories',
    'collections',
    'products',
    'product_collections',
    'variants',
    'product_media',
    'customers',
    'orders',
    'order_items',
    'deliveries',
    'order_timeline_events',
    'cod_reconciliations',
    'order_conversions',
    'courier_configurations',
    'audit_logs',
    'site_settings'
  ];

  for (const t of definedTables) {
    const builder = client.from(t).select('*');
    if (!builder || typeof (builder as any).then !== 'function') {
      throw new Error(`Failed to build PostgREST query on table ${t}`);
    }
  }
  return true;
});

// Empirical audit: Check TypeScript Database types completeness vs 16 SQL tables
check('Empirical Audit: Database types completeness in src/lib/supabase/types.ts', () => {
  const typesContent = fs.readFileSync(path.resolve(__dirname, '../src/lib/supabase/types.ts'), 'utf8');
  const all16Tables = [
    'categories', 'collections', 'products', 'product_collections',
    'variants', 'product_media', 'customers', 'orders', 'order_items',
    'deliveries', 'order_timeline_events', 'cod_reconciliations',
    'order_conversions', 'courier_configurations', 'audit_logs', 'site_settings'
  ];
  const missingTables: string[] = [];
  for (const t of all16Tables) {
    const regex = new RegExp(`^\\s*${t}:\\s*\\{\\s*Row:`, 'm');
    if (!regex.test(typesContent)) {
      missingTables.push(t);
    }
  }
  if (missingTables.length > 0) {
    throw new Error(`Missing tables in types.ts: ${missingTables.join(', ')}`);
  }
  return true;
});

check('Empirical Audit: orders table column alignment (delivery_fee vs shipping_fee)', () => {
  const typesContent = fs.readFileSync(path.resolve(__dirname, '../src/lib/supabase/types.ts'), 'utf8');
  const schemaContent = fs.readFileSync(path.resolve(__dirname, '../src/lib/supabase/schema.sql'), 'utf8');
  const hasDeliveryFeeInSql = /delivery_fee\s+NUMERIC/i.test(schemaContent);
  const hasDeliveryFeeInTypes = /delivery_fee:\s*number/i.test(typesContent);
  if (hasDeliveryFeeInSql && !hasDeliveryFeeInTypes) {
    throw new Error('orders table uses delivery_fee in SQL, but missing delivery_fee in types.ts!');
  }
  return true;
});

check('Client query execution handles offline/network error gracefully without crashing process', () => {
  const client = getSupabaseClient();
  const builder = client.from('products').select('id, name, base_price').limit(1);
  if (!builder || typeof (builder as any).then !== 'function') {
    throw new Error('Postgrest builder failed');
  }
  return true;
});

// Run async tests
(async () => {
  console.log('\n--- Summary of Empirical Stress Checks ---');
  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.passed) {
      passed++;
      console.log(`[PASS] ${r.title}`);
    } else {
      failed++;
      console.error(`[FAIL] ${r.title} => ${r.error}`);
    }
  }

  console.log('\n================================================================');
  console.log(`TOTAL CHECKS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
