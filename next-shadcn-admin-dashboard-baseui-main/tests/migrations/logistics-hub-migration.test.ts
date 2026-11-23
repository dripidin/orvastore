import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

async function runTests() {
  console.log("── PGlite Verification: 20261123_000001_logistics_hub_69_wilayas_and_multi_ads.sql ──");
  let passed = 0;
  function verify(cond: boolean, label: string) {
    assert.ok(cond, label);
    passed += 1;
    console.log(`  [PASS] ${String(passed).padStart(2, "0")}: ${label}`);
  }

  const db = new PGlite({
    extensions: { uuid_ossp, pgcrypto },
  });
  await db.waitReady;

  // Provision Supabase roles inside isolated PGlite instance
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin NOLOGIN SUPERUSER; END IF;
    END $$;
  `);

  const repoRoot = path.resolve(__dirname, "../..");
  const baseSchemaSql = fs.readFileSync(path.join(repoRoot, "src/lib/supabase/schema.sql"), "utf8");
  const migrationSql = fs.readFileSync(
    path.join(repoRoot, "src/lib/supabase/migrations/20261123_000001_logistics_hub_69_wilayas_and_multi_ads.sql"),
    "utf8",
  );

  // Execute base schema + run new migration TWICE to confirm strict idempotency
  await db.exec(baseSchemaSql);
  await db.exec(migrationSql);
  await db.exec(migrationSql);
  verify(true, "Base schema + new migration executed cleanly twice (idempotent)");

  // 1. 69 Wilaya constraints on public.orders
  await db.exec(`
    INSERT INTO public.orders (order_id, order_number, customer_name, customer_phone, wilaya_code, subtotal, total, total_payable)
    VALUES ('ORV-W69', 'ORV-W69', 'Test 69', '0550123456', 69, 4500, 5000, 5000);
  `);
  verify(true, "orders accepts wilaya_code = 69 (Law 26-06)");

  let failed70 = false;
  try {
    await db.exec(`
      INSERT INTO public.orders (order_id, order_number, customer_name, customer_phone, wilaya_code, subtotal, total, total_payable)
      VALUES ('ORV-W70', 'ORV-W70', 'Bad Wilaya', '0550123456', 70, 4500, 5000, 5000);
    `);
  } catch {
    failed70 = true;
  }
  verify(failed70, "orders rejects invalid wilaya_code = 70 via CHECK constraint");

  // 2. delivery_fees + tarif_retour, tarif_pickup, tarif_echange
  await db.exec(`
    INSERT INTO public.delivery_fees (wilaya_id, service_type, tarif_domicile, tarif_stopdesk, tarif_retour, tarif_pickup, tarif_echange)
    VALUES (64, 'ecotrack', 700, 0, 350, 200, 400)
    ON CONFLICT (wilaya_id, service_type) DO UPDATE SET tarif_retour = EXCLUDED.tarif_retour;
  `);
  const feeRes = await db.query<{ tarif_retour: string }>(
    `SELECT tarif_retour FROM public.delivery_fees WHERE wilaya_id = 64 AND service_type = 'ecotrack'`,
  );
  verify(Number(feeRes.rows[0]?.tarif_retour) === 350, "delivery_fees persists tarif_retour (350 DZD)");

  // 3. Verify all 7 new tables exist & have RLS enabled
  const expectedTables = [
    "courier_wilaya_coverage",
    "courier_stop_desks",
    "courier_api_logs",
    "reconciliation_imports",
    "reconciliation_rows",
    "ai_uploaded_files",
    "product_campaign_links",
  ];
  const rlsRes = await db.query<{ relname: string; relrowsecurity: boolean }>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
    [expectedTables],
  );
  verify(
    rlsRes.rows.length === 7 && rlsRes.rows.every((r) => r.relrowsecurity),
    "All 7 new tables exist with RLS enabled",
  );

  // 4. Verify exact column contracts written by reconciliation-engine.ts & catalog/server.ts
  const impRes = await db.query<{ id: string }>(`
    INSERT INTO public.reconciliation_imports (
      courier_id, courier_name, source_type, file_name, file_hash, total_rows,
      matched_synced, matched_unsynced, store_only, courier_only, duplicates_count,
      store_owned_returns_count, accounting_snapshot
    ) VALUES (
      'redex', 'Redex Express', 'multi_file', 'test.xlsx', 'abc123', 10,
      5, 2, 1, 1, 1, 1, '{}'::jsonb
    ) RETURNING id;
  `);
  const impId = impRes.rows[0]?.id;
  verify(Boolean(impId), "reconciliation_imports accepts exact backend payload");

  await db.query(
    `
    INSERT INTO public.reconciliation_rows (
      import_id, courier_id, bucket, tracking_code, reference, store_order_id,
      customer_name, customer_phone, wilaya_code, wilaya_name, commune,
      cod_amount, return_fee, financial_status, is_store_owned_return, courier_status, store_status, diff
    ) VALUES (
      $1, 'redex', 'courier_only', 'TRK-99', 'ORV-99', NULL,
      'Client', '0550112233', 16, 'Alger', 'Alger Centre',
      4950, 350, 'retour_recu', true, 'retour_recu', NULL, '{"reason":"store return"}'::jsonb
    );
  `,
    [impId],
  );
  verify(true, "reconciliation_rows accepts exact backend payload");

  await db.exec(`
    INSERT INTO public.ai_uploaded_files (
      file_name, file_hash, mime_type, file_size_bytes, file_role, courier_id,
      row_count, order_keys, parsed_summary, diff_vs_previous, status_alert, alert_message, raw_preview
    ) VALUES (
      'audit.xlsx', 'sha256hash', 'excel', 1024, 'orders_export', 'redex',
      3, '["TRK-1"]'::jsonb, '{}'::jsonb, '{}'::jsonb, 'fresh', 'ok', '[]'::jsonb
    );
  `);
  verify(true, "ai_uploaded_files accepts exact backend payload");

  const prodRes = await db.query<{ id: string }>(`SELECT id FROM public.products LIMIT 1`);
  const pid = prodRes.rows[0]?.id;
  verify(Boolean(pid), "Seeded catalog product exists for FK test");

  await db.query(
    `
    INSERT INTO public.product_campaign_links (
      product_id, campaign_key, campaign_id, campaign_name, cost_mode,
      campaign_spend_usd, campaign_spend_dzd, exchange_rate_dzd, attributed_orders_count,
      allocation_weight, computed_cpa_dzd, is_primary, enabled
    ) VALUES (
      $1, 'fb:CAMP1', 'CAMP1', 'Pack Campaign', 'campaign_budget_cpa',
      25, 6125, 245, 10, 1.5, 613, true, true
    );
  `,
    [pid],
  );
  verify(true, "product_campaign_links accepts exact Many-to-Many payload with campaign_key");

  // 5. Function search_path hardening check
  const fnRes = await db.query<{ proconfig: string[] | null }>(
    `SELECT proconfig FROM pg_proc WHERE proname = 'sync_orders_dual_columns'`,
  );
  verify(
    Boolean(fnRes.rows[0]?.proconfig?.some((c) => c.includes("search_path=public"))),
    "sync_orders_dual_columns hardens search_path = public",
  );

  // 6. Least-privilege verification for anon & authenticated
  const privRes = await db.query<{ restricted: boolean; public_ok: boolean }>(`
    SELECT
      (NOT has_table_privilege('anon', 'public.ai_uploaded_files', 'SELECT')
       AND NOT has_table_privilege('authenticated', 'public.reconciliation_imports', 'SELECT')
       AND NOT has_table_privilege('anon', 'public.product_campaign_links', 'SELECT')) AS restricted,
      (has_table_privilege('anon', 'public.delivery_fees', 'SELECT')
       AND has_table_privilege('anon', 'public.courier_wilaya_coverage', 'SELECT')
       AND has_table_privilege('anon', 'public.courier_stop_desks', 'SELECT')) AS public_ok;
  `);
  verify(
    Boolean(privRes.rows[0]?.restricted && privRes.rows[0]?.public_ok),
    "Enforces strict least-privilege grants across public vs admin tables",
  );

  await db.close();
  console.log(`\nALL ${passed} PGLITE MIGRATION TESTS PASSED!`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
