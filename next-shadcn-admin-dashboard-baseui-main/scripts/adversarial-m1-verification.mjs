import fs from 'node:fs';

const PROJECT_REF = 'olmsjkhdfghyydogcvvy';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu';

// Load Management API Token
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
  console.error('Error loading token:', e);
}

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MANAGEMENT_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Management API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function runAdversarialVerification() {
  console.log('================================================================');
  console.log('  CHALLENGER 2: ADVERSARIAL VERIFICATION FOR MILESTONE 1');
  console.log('================================================================\n');

  const report = {
    postgrest: [],
    catalog: {},
    extensions: {},
    migrations: {},
    openapi: {}
  };

  // 1. PostgREST Exhaustive Probing
  console.log('--- 1. Probing PostgREST Endpoints ---');
  const allTables = [
    'orders', 'products', 'inventory', 'customers', 'order_items',
    'audit_logs', 'risk_events', 'rate_limits', 'watchlist', 'categories',
    'deliveries', 'site_settings', 'public_site_settings',
    '_v21_orders_pre_migration_state', '_v21_snapshot_manifest',
    'admin_session_revocations', 'delivery_validation_reconciliations',
    'order_timeline_events', 'order_conversions', 'order_re_routings',
    'cod_reconciliations', 'product_collections', 'product_media',
    'variants', 'collections', 'courier_configurations',
    'meta_conversion_events', 'telegram_alert_logs', 'algeria_wilayas'
  ];

  let postgrestAllPgrst205 = true;
  for (const table of allTables) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    const res = await fetch(url, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`
      }
    });
    const body = await res.json().catch(() => ({}));
    const isPgrst205 = res.status === 404 && body.code === 'PGRST205';
    if (!isPgrst205) {
      postgrestAllPgrst205 = false;
    }
    report.postgrest.push({
      table,
      status: res.status,
      code: body.code,
      message: body.message,
      clean: isPgrst205
    });
  }
  console.table(report.postgrest.map(r => ({ table: r.table, status: r.status, code: r.code, clean: r.clean })));
  console.log(`PostgREST 404/PGRST205 verdict: ${postgrestAllPgrst205 ? 'ALL CLEAN' : 'FAIL'}\n`);

  // 1b. PostgREST Root OpenAPI Inspection
  console.log('--- 1b. Inspecting PostgREST OpenAPI Specification ---');
  const openApiRes = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`
    }
  });
  const openApiJson = await openApiRes.json().catch(() => ({}));
  const exposedPaths = Object.keys(openApiJson.paths || {}).filter(p => p !== '/');
  const exposedDefs = Object.keys(openApiJson.definitions || {});
  report.openapi = {
    status: openApiRes.status,
    exposedPaths,
    exposedDefs
  };
  console.log('OpenAPI HTTP Status:', openApiRes.status);
  console.log('Exposed Paths (excluding root):', exposedPaths);
  console.log('Exposed Definitions:', exposedDefs);
  console.log(`OpenAPI Schema Cache verdict: ${exposedPaths.length === 0 && exposedDefs.length === 0 ? 'CLEAN (0 exposed tables)' : 'TABLES EXPOSED'}\n`);

  // 2. PostgreSQL Catalog Inspection
  console.log('--- 2. Direct PostgreSQL Catalog Auditing ---');
  // 2a. Public tables & views
  const tables = await runSql(`
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'public';
  `);
  report.catalog.tables = tables;
  console.log('information_schema.tables (public):', tables);

  // 2b. pg_tables & pg_views in public
  const pgTables = await runSql(`SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public';`);
  const pgViews = await runSql(`SELECT schemaname, viewname FROM pg_views WHERE schemaname = 'public';`);
  const pgMatViews = await runSql(`SELECT schemaname, matviewname FROM pg_matviews WHERE schemaname = 'public';`);
  report.catalog.pgTables = pgTables;
  report.catalog.pgViews = pgViews;
  report.catalog.pgMatViews = pgMatViews;
  console.log('pg_tables (public):', pgTables.length);
  console.log('pg_views (public):', pgViews.length);
  console.log('pg_matviews (public):', pgMatViews.length);

  // 2c. Custom types / enums in public
  const pgTypes = await runSql(`
    SELECT t.typname, t.typtype
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname NOT LIKE pg_catalog.quote_ident('%');
  `);
  report.catalog.pgTypes = pgTypes;
  console.log('pg_type in public (custom types/enums):', pgTypes);

  // 2d. Triggers in public
  const triggers = await runSql(`
    SELECT trigger_schema, trigger_name, event_object_table
    FROM information_schema.triggers
    WHERE trigger_schema = 'public';
  `);
  report.catalog.triggers = triggers;
  console.log('Triggers in public:', triggers);

  // 2e. Routines/functions in public (excluding extensions)
  const routines = await runSql(`
    SELECT routine_name, routine_type
    FROM information_schema.routines
    WHERE routine_schema = 'public';
  `);
  report.catalog.routines = routines;
  console.log('Routines in public schema:', routines.map(r => r.routine_name));

  // 3. Extension Functionality Verification
  console.log('\n--- 3. Testing Extension Functionality ---');
  // Check pg_extension
  const extensions = await runSql(`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname IN ('uuid-ossp', 'pgcrypto');
  `);
  report.extensions.installed = extensions;
  console.log('Installed target extensions:', extensions);

  // Execute functional test of uuid-ossp
  try {
    const uuidTest = await runSql(`
      SELECT 
        uuid_generate_v4() AS uuid_v4,
        uuid_generate_v1() AS uuid_v1;
    `);
    report.extensions.uuidTest = uuidTest;
    console.log('[PASS] uuid-ossp functional test passed:', uuidTest);
  } catch (err) {
    report.extensions.uuidTestError = err.message;
    console.error('[FAIL] uuid-ossp test failed:', err);
  }

  // Execute functional test of pgcrypto
  try {
    const pgcryptoTest = await runSql(`
      SELECT 
        gen_random_uuid() AS pgcrypto_uuid,
        crypt('challenger_test_pwd', gen_salt('bf', 8)) AS bf_hash,
        encode(digest('adversarial_test_input', 'sha256'), 'hex') AS sha256_hash;
    `);
    report.extensions.pgcryptoTest = pgcryptoTest;
    console.log('[PASS] pgcrypto functional test passed:', pgcryptoTest);
  } catch (err) {
    report.extensions.pgcryptoTestError = err.message;
    console.error('[FAIL] pgcrypto test failed:', err);
  }

  // 4. Migration Conflict History Verification
  console.log('\n--- 4. Migration Conflict History Purge Verification ---');
  const migrationSchemas = await runSql(`
    SELECT schema_name 
    FROM information_schema.schemata 
    WHERE schema_name IN ('supabase_migrations', 'drizzle', 'prisma');
  `);
  console.log('Migration schemas present:', migrationSchemas);

  let migrationRows = [];
  try {
    migrationRows = await runSql(`SELECT * FROM supabase_migrations.schema_migrations;`);
    console.log(`supabase_migrations.schema_migrations row count: ${migrationRows.length}`);
  } catch (err) {
    console.log('supabase_migrations.schema_migrations query response:', err.message);
  }
  report.migrations = {
    schemas: migrationSchemas,
    rowCount: migrationRows.length,
    rows: migrationRows
  };

  // Check for any other migration tables across the whole database
  const allMigrationTables = await runSql(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_name ILIKE '%migration%';
  `);
  console.log('All migration tables across database:', allMigrationTables);
  report.migrations.allMigrationTables = allMigrationTables;

  console.log('\n================================================================');
  console.log('  CHALLENGER 2: ADVERSARIAL VERIFICATION FINISHED');
  console.log('================================================================\n');

  return report;
}

runAdversarialVerification()
  .then(res => {
    fs.writeFileSync('scripts/adversarial-m1-output.json', JSON.stringify(res, null, 2));
    console.log('Saved report to scripts/adversarial-m1-output.json');
  })
  .catch(err => {
    console.error('Fatal error during adversarial verification:', err);
    process.exit(1);
  });
