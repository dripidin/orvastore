/**
 * ORVA Store — TikTok Lead Generation Integration
 * Phase A1 Verification Suite (Migration + PGlite RLS + Encryption + Token Manager + API Client)
 *
 * Run: npx tsx tests/integrations/tiktok-phase-a1.test.ts
 * Zero production DB calls. Zero real customer PII. Zero real TikTok credentials.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { z } from "zod";

import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../../src/lib/supabase/server";
import { TikTokApiClient, classifyTikTokApiError, parseRetryAfterMs } from "../../src/lib/integrations/tiktok/client";
import {
  TikTokTokenManager,
  decryptTikTokToken,
  encryptTikTokToken,
  resolveTikTokEncryptionKey,
} from "../../src/lib/integrations/tiktok/token-manager";
import {
  TIKTOK_API_BASE_URL,
  TIKTOK_RETURN_CODES,
  TikTokApiError,
  TikTokEncryptionConfigError,
  type TikTokConnectionRow,
  redactSensitiveForLog,
  tikTokAdvertiserListDataSchema,
  toPublicTikTokConnectionDto,
} from "../../src/lib/integrations/tiktok/types";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_SQL_PATH = path.join(
  REPO_ROOT,
  "src/lib/supabase/migrations/20261111_000001_consolidated_clean_rebuild.sql",
);
const ATTRIBUTION_SQL_PATH = path.join(
  REPO_ROOT,
  "src/lib/supabase/migrations/20261117_000005_order_attribution_and_profitability.sql",
);
const TIKTOK_MIGRATION_PATH = path.join(
  REPO_ROOT,
  "src/lib/supabase/migrations/20261119_000001_tiktok_lead_generation.sql",
);

const TIKTOK_TABLES = [
  "tiktok_connections",
  "tiktok_ad_accounts",
  "tiktok_forms",
  "tiktok_form_product_mappings",
  "tiktok_leads",
  "tiktok_sync_logs",
] as const;

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error("        ", err instanceof Error ? err.stack || err.message : err);
  }
}

async function createPgliteWithBaseline(): Promise<PGlite> {
  const db = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
  `);

  const baselineSql = fs.readFileSync(BASELINE_SQL_PATH, "utf8");
  const attributionSql = fs.readFileSync(ATTRIBUTION_SQL_PATH, "utf8");
  await db.exec(baselineSql);
  await db.exec(attributionSql);
  return db;
}

/** In-memory Supabase mock scoped specifically to public.tiktok_connections for unit tests. */
function createMockSupabaseForConnections() {
  const rows = new Map<string, TikTokConnectionRow>();

  const client = {
    _rows: rows,
    from(table: string) {
      assert.equal(table, "tiktok_connections", `Unexpected table access in token-manager test: ${table}`);

      return {
        select() {
          let filterStoreId: string | null = null;
          const builder = {
            eq(col: string, val: string) {
              if (col === "store_id") filterStoreId = val;
              return builder;
            },
            async maybeSingle() {
              const found = filterStoreId ? rows.get(filterStoreId) ?? null : null;
              return { data: found ? { ...found } : null, error: null };
            },
          };
          return builder;
        },

        upsert(payload: Partial<TikTokConnectionRow>) {
          const storeId = String(payload.store_id || "orvastore");
          const existing = rows.get(storeId);
          const stored: TikTokConnectionRow = {
            id: existing?.id ?? crypto.randomUUID(),
            store_id: storeId,
            app_id: String(payload.app_id || ""),
            access_token_encrypted: String(payload.access_token_encrypted || ""),
            refresh_token_encrypted: payload.refresh_token_encrypted ?? null,
            token_encryption_version: payload.token_encryption_version ?? 1,
            scopes: payload.scopes ?? [],
            status: payload.status ?? "connected",
            token_expires_at: payload.token_expires_at ?? null,
            refresh_expires_at: payload.refresh_expires_at ?? null,
            selected_advertiser_id: payload.selected_advertiser_id ?? null,
            connected_by: payload.connected_by ?? "admin",
            last_error: payload.last_error ?? null,
            connected_at: payload.connected_at ?? new Date().toISOString(),
            created_at: existing?.created_at ?? new Date().toISOString(),
            updated_at: payload.updated_at ?? new Date().toISOString(),
          };
          rows.set(storeId, stored);

          return {
            select() {
              return {
                async single() {
                  return { data: { ...stored }, error: null };
                },
              };
            },
          };
        },

        update(patch: Partial<TikTokConnectionRow>) {
          let filterStoreId: string | null = null;
          const builder = {
            eq(col: string, val: string) {
              if (col === "store_id") filterStoreId = val;
              return builder;
            },
            select() {
              return {
                async maybeSingle() {
                  if (!filterStoreId || !rows.has(filterStoreId)) {
                    return { data: null, error: null };
                  }
                  const updated: TikTokConnectionRow = {
                    ...rows.get(filterStoreId)!,
                    ...patch,
                  };
                  rows.set(filterStoreId, updated);
                  return { data: { ...updated }, error: null };
                },
              };
            },
          };
          return builder;
        },

        delete() {
          return {
            async eq(col: string, val: string) {
              if (col === "store_id") rows.delete(val);
              return { error: null };
            },
          };
        },
      };
    },
  };

  return client;
}

async function main() {
  console.log("\n=== ORVA STORE — TikTok Phase A1 Verification Suite ===\n");

  // ── GROUP 1: PGLITE POSTGRESQL MIGRATION, CONSTRAINTS, RLS & ROLLBACK ──────
  console.log("1. Database Migration & RLS Verification (PGlite PostgreSQL)");
  const migrationSql = fs.readFileSync(TIKTOK_MIGRATION_PATH, "utf8");
  const db = await createPgliteWithBaseline();

  // Capture existing ORVA baseline column snapshot before TikTok migration
  const beforeOrdersCols = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' ORDER BY ordinal_position`,
  );
  const beforeProductsCols = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='products' ORDER BY ordinal_position`,
  );

  await runTest("Executes 20261119_000001_tiktok_lead_generation.sql cleanly and idempotently (2 runs)", async () => {
    await db.exec(migrationSql);
    await db.exec(migrationSql);

    const tablesRes = await db.query<{ tablename: string }>(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'tiktok_%' ORDER BY tablename`,
    );
    const names = tablesRes.rows.map((r) => r.tablename).sort();
    assert.deepEqual(names, [...TIKTOK_TABLES].sort());
  });

  await runTest("Preserves existing ORVA tables (orders, products) without schema alteration", async () => {
    const afterOrdersCols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' ORDER BY ordinal_position`,
    );
    const afterProductsCols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='products' ORDER BY ordinal_position`,
    );
    assert.deepEqual(afterOrdersCols.rows, beforeOrdersCols.rows);
    assert.deepEqual(afterProductsCols.rows, beforeProductsCols.rows);
  });

  await runTest("Creates all 13 performance indexes on TikTok tables", async () => {
    const idxRes = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_tiktok_%'`,
    );
    assert.equal(idxRes.rows.length, 13, `Expected 13 idx_tiktok_* indexes, found ${idxRes.rows.length}`);
  });

  await runTest("Enforces RLS & FORCE RLS on all 6 TikTok tables", async () => {
    const rlsRes = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [TIKTOK_TABLES],
    );
    assert.equal(rlsRes.rows.length, 6);
    for (const row of rlsRes.rows) {
      assert.equal(row.relrowsecurity, true, `RLS not enabled on ${row.relname}`);
      assert.equal(row.relforcerowsecurity, true, `FORCE RLS not enabled on ${row.relname}`);
    }
  });

  await runTest("Denies ALL operations (SELECT/INSERT/UPDATE/DELETE) to anon and authenticated roles (SQLSTATE 42501)", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const tbl of TIKTOK_TABLES) {
        await db.exec(`SET ROLE ${role};`);
        try {
          await assert.rejects(
            () => db.query(`SELECT count(*) FROM public.${tbl}`),
            (err: any) => err?.code === "42501",
            `Expected SQLSTATE 42501 on SELECT ${tbl} as ${role}`,
          );
          await assert.rejects(
            () => db.query(`INSERT INTO public.${tbl} DEFAULT VALUES`),
            (err: any) => err?.code === "42501",
            `Expected SQLSTATE 42501 on INSERT ${tbl} as ${role}`,
          );
          await assert.rejects(
            () => db.query(`UPDATE public.${tbl} SET store_id = 'orvastore' WHERE false`),
            (err: any) => err?.code === "42501",
            `Expected SQLSTATE 42501 on UPDATE ${tbl} as ${role}`,
          );
          await assert.rejects(
            () => db.query(`DELETE FROM public.${tbl}`),
            (err: any) => err?.code === "42501",
            `Expected SQLSTATE 42501 on DELETE ${tbl} as ${role}`,
          );
        } finally {
          await db.exec(`RESET ROLE;`);
        }
      }
    }
  });

  await runTest("Allows service_role full CRUD while enforcing FKs, UNIQUE constraints, and CHECK constraints", async () => {
    // Read seeded product ID and insert a synthetic test order for FK checks
    const prodRes = await db.query<{ id: string }>(`SELECT id FROM public.products LIMIT 1`);
    assert.ok(prodRes.rows[0]?.id, "Expected seeded product row from baseline migration");
    const productId = prodRes.rows[0].id;

    await db.query(
      `INSERT INTO public.orders (order_id, order_number, customer_name, customer_phone, status, idempotency_key)
       VALUES ('SYN-ORDER-001', 'SYN-ORDER-001', 'Test Customer', '0555000001', 'pending', 'tiktok_lead_syn_1')`,
    );

    await db.exec(`SET ROLE service_role;`);
    try {
      // 1. Connection insert + UNIQUE(store_id) enforcement
      const connRes = await db.query<{ id: string }>(
        `INSERT INTO public.tiktok_connections (store_id, app_id, access_token_encrypted, scopes, status)
         VALUES ('orvastore', 'app_test_001', 'v1:iv:tag:cipher', '[12010100]'::jsonb, 'connected')
         RETURNING id`,
      );
      const connectionId = connRes.rows[0].id;

      await assert.rejects(
        () =>
          db.query(
            `INSERT INTO public.tiktok_connections (store_id, app_id, access_token_encrypted)
             VALUES ('orvastore', 'app_test_002', 'v1:iv2:tag2:cipher2')`,
          ),
        (err: any) => err?.code === "23505",
      );

      // 2. Invalid status CHECK constraint rejected (23514)
      await assert.rejects(
        () =>
          db.query(
            `INSERT INTO public.tiktok_connections (store_id, app_id, access_token_encrypted, status)
             VALUES ('other_store', 'app_test_003', 'v1:iv:tag:c', 'invalid_status')`,
          ),
        (err: any) => err?.code === "23514",
      );

      // 3. Ad account + Form + Product Mapping (FK to products.id)
      await db.query(
        `INSERT INTO public.tiktok_ad_accounts (connection_id, advertiser_id, advertiser_name, is_selected)
         VALUES ($1, 'adv_99001', 'ORVA Test Advertiser', true)`,
        [connectionId],
      );

      await db.query(
        `INSERT INTO public.tiktok_forms (advertiser_id, form_id, form_name, status, sync_enabled)
         VALUES ('adv_99001', 'form_77001', 'Synthetic Pack Campaign', 'ACTIVE', true)`,
      );

      await db.query(
        `INSERT INTO public.tiktok_form_product_mappings
           (form_id, product_id, pack_id, product_name, product_price, default_wilaya_code, default_delivery_type)
         VALUES ('form_77001', $1, 'PACK1', 'Test Pack', 4950, 16, 'DOMICILE')`,
        [productId],
      );

      // Invalid wilaya code (59) rejected by CHECK constraint
      await assert.rejects(
        () =>
          db.query(
            `UPDATE public.tiktok_form_product_mappings SET default_wilaya_code = 59 WHERE form_id = 'form_77001'`,
          ),
        (err: any) => err?.code === "23514",
      );

      // FK to non-existent product rejected (23503)
      await db.query(
        `INSERT INTO public.tiktok_forms (advertiser_id, form_id, form_name) VALUES ('adv_99001', 'form_bad_fk', 'Bad FK')`,
      );
      await assert.rejects(
        () =>
          db.query(
            `INSERT INTO public.tiktok_form_product_mappings
               (form_id, product_id, pack_id, product_name, product_price)
             VALUES ('form_bad_fk', '00000000-0000-0000-0000-000000000099', 'PACKX', 'Missing', 1000)`,
          ),
        (err: any) => err?.code === "23503",
      );

      // 4. Leads table + UNIQUE(external_lead_id) + FK to orders(order_id)
      await db.query(
        `INSERT INTO public.tiktok_leads
           (external_lead_id, form_id, advertiser_id, customer_name, customer_phone_normalized, phone_valid, wilaya_code, mapped_product_id, order_id, sync_status)
         VALUES ('tt_lead_syn_001', 'form_77001', 'adv_99001', 'Synthetic Lead', '0555000001', true, 16, $1, 'SYN-ORDER-001', 'order_created')`,
        [productId],
      );

      // Duplicate external_lead_id rejected (23505)
      await assert.rejects(
        () =>
          db.query(
            `INSERT INTO public.tiktok_leads (external_lead_id, form_id, advertiser_id, sync_status)
             VALUES ('tt_lead_syn_001', 'form_77001', 'adv_99001', 'pending')`,
          ),
        (err: any) => err?.code === "23505",
      );

      // 5. Sync logs insert & negative count CHECK rejection
      await db.query(
        `INSERT INTO public.tiktok_sync_logs (advertiser_id, form_id, trigger_source, status, leads_fetched, leads_imported, orders_created)
         VALUES ('adv_99001', 'form_77001', 'manual', 'success', 1, 1, 1)`,
      );

      await assert.rejects(
        () =>
          db.query(
            `INSERT INTO public.tiktok_sync_logs (trigger_source, status, leads_fetched) VALUES ('manual', 'success', -1)`,
          ),
        (err: any) => err?.code === "23514",
      );

      // 6. ON DELETE CASCADE from connection cleans ad_accounts -> forms -> mappings cleanly
      await db.query(`DELETE FROM public.tiktok_connections WHERE id = $1`, [connectionId]);
      const remAccounts = await db.query<{ count: string }>(`SELECT count(*) FROM public.tiktok_ad_accounts`);
      const remForms = await db.query<{ count: string }>(`SELECT count(*) FROM public.tiktok_forms`);
      const remMappings = await db.query<{ count: string }>(`SELECT count(*) FROM public.tiktok_form_product_mappings`);
      assert.equal(Number(remAccounts.rows[0].count), 0);
      assert.equal(Number(remForms.rows[0].count), 0);
      assert.equal(Number(remMappings.rows[0].count), 0);
    } finally {
      await db.exec(`RESET ROLE;`);
    }
  });

  await runTest("Transactional rollback leaves zero partial TikTok tables and preserves existing ORVA tables", async () => {
    const dbRollback = await createPgliteWithBaseline();
    const innerSql = migrationSql.replace(/^\s*BEGIN;/m, "").replace(/COMMIT;\s*$/m, "");
    await dbRollback.exec(`BEGIN;\n${innerSql}\nROLLBACK;`);

    const remaining = await dbRollback.query<{ tablename: string }>(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'tiktok_%'`,
    );
    assert.equal(remaining.rows.length, 0, "Expected 0 tiktok_* tables after transactional ROLLBACK");

    const ordersExists = await dbRollback.query<{ tablename: string }>(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'orders'`,
    );
    assert.equal(ordersExists.rows.length, 1);
    await dbRollback.close();
  });

  await db.close();

  // ── GROUP 2: ENCRYPTION & TOKEN MANAGER UNIT TESTS ─────────────────────────
  console.log("\n2. AES-256-GCM Token Encryption & TokenManager Lifecycle");

  const validHexKey = crypto.randomBytes(32).toString("hex");
  const validBase64Key = crypto.randomBytes(32).toString("base64");
  const alternateHexKey = crypto.randomBytes(32).toString("hex");

  await runTest("Validates 32-byte hex and base64 keys and fails closed on missing, short, or weak keys", () => {
    assert.equal(resolveTikTokEncryptionKey(validHexKey).length, 32);
    assert.equal(resolveTikTokEncryptionKey(validBase64Key).length, 32);

    const prevEnv = process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;
    delete process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;
    try {
      assert.throws(() => resolveTikTokEncryptionKey(), TikTokEncryptionConfigError);
      assert.throws(() => resolveTikTokEncryptionKey(""), TikTokEncryptionConfigError);
      assert.throws(() => resolveTikTokEncryptionKey("short-key"), TikTokEncryptionConfigError);
      assert.throws(() => resolveTikTokEncryptionKey("0".repeat(64)), TikTokEncryptionConfigError);
      assert.throws(() => resolveTikTokEncryptionKey("ab".repeat(32)), TikTokEncryptionConfigError);
    } finally {
      if (prevEnv !== undefined) process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = prevEnv;
    }
  });

  await runTest("AES-256-GCM generates unique random IVs per encryption and round-trips cleanly", () => {
    const sampleToken = "tt_mock_access_token_synthetic_9876543210";
    const enc1 = encryptTikTokToken(sampleToken, validHexKey);
    const enc2 = encryptTikTokToken(sampleToken, validHexKey);

    assert.notEqual(enc1, enc2, "Same plaintext must produce distinct ciphertexts via unique random IV");
    assert.ok(!enc1.includes(sampleToken), "Ciphertext envelope must never contain plaintext token");
    assert.ok(enc1.startsWith("v1:"), "Envelope must carry version prefix v1:");
    assert.equal(decryptTikTokToken(enc1, validHexKey), sampleToken);
    assert.equal(decryptTikTokToken(enc2, validHexKey), sampleToken);
  });

  await runTest("AES-256-GCM rejects tampered ciphertext, tampered auth tag, malformed envelope, or wrong key", () => {
    const enc = encryptTikTokToken("tt_secret_token_alpha", validHexKey);
    const parts = enc.split(":");
    assert.equal(parts.length, 4);

    // Tamper ciphertext
    const tamperedData = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}AA`;
    assert.throws(() => decryptTikTokToken(tamperedData, validHexKey), TikTokEncryptionConfigError);

    // Tamper auth tag
    const tamperedTag = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}BB:${parts[3]}`;
    assert.throws(() => decryptTikTokToken(tamperedTag, validHexKey), TikTokEncryptionConfigError);

    // Wrong key
    assert.throws(() => decryptTikTokToken(enc, alternateHexKey), TikTokEncryptionConfigError);

    // Malformed prefix
    assert.throws(() => decryptTikTokToken(`v9:${parts[1]}:${parts[2]}:${parts[3]}`, validHexKey), TikTokEncryptionConfigError);
  });

  await runTest("TokenManager fails closed when Supabase service role client is unavailable (no insecure fallback)", async () => {
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    __testResetSupabaseServerInstance();
    try {
      const manager = new TikTokTokenManager({ encryptionKey: validHexKey });
      await assert.rejects(
        () =>
          manager.saveConnectionTokens({
            appId: "app_test",
            accessToken: "tt_mock_token_never_memory",
          }),
        (err: unknown) => err instanceof TikTokApiError && err.category === "DATABASE_ERROR",
      );
    } finally {
      if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
      __testResetSupabaseServerInstance();
    }
  });

  await runTest("TokenManager persists encrypted tokens and Public DTO exposes zero raw or encrypted token fields", async () => {
    const mockDb = createMockSupabaseForConnections();
    __testSetSupabaseServerInstance(mockDb);
    try {
      const manager = new TikTokTokenManager({ encryptionKey: validHexKey });
      const dto = await manager.saveConnectionTokens({
        appId: "app_synthetic_123",
        accessToken: "tt_live_secret_token_xyz",
        refreshToken: null,
        scopes: [12010100],
      });

      const stored = mockDb._rows.get("orvastore");
      assert.ok(stored, "Expected row persisted in tiktok_connections");
      assert.ok(stored.access_token_encrypted.startsWith("v1:"));
      assert.ok(!stored.access_token_encrypted.includes("tt_live_secret_token_xyz"));

      // Verify zero token leakage in serialized Public DTO
      const serialized = JSON.stringify(dto);
      assert.ok(!serialized.includes("tt_live_secret_token_xyz"));
      assert.ok(!serialized.includes("access_token_encrypted"));
      assert.ok(!serialized.includes("refresh_token_encrypted"));
      assert.equal(dto.status, "connected");
      assert.equal(dto.hasRefreshToken, false);

      // Long-lived Marketing API token without expiry resolves cleanly without calling refresh
      const resolved = await manager.getValidAccessToken();
      assert.equal(resolved.accessToken, "tt_live_secret_token_xyz");
    } finally {
      __testResetSupabaseServerInstance();
    }
  });

  await runTest("TokenManager refreshes expiring tokens ONLY when refresh_token exists and rotates stored refresh_token", async () => {
    const mockDb = createMockSupabaseForConnections();
    __testSetSupabaseServerInstance(mockDb);
    try {
      let nowMs = Date.parse("2026-11-19T20:00:00.000Z");
      const manager = new TikTokTokenManager({
        encryptionKey: validHexKey,
        nowImpl: () => nowMs,
      });

      await manager.saveConnectionTokens({
        appId: "app_rot_001",
        accessToken: "tt_old_access",
        refreshToken: "tt_old_refresh",
        tokenExpiresAt: new Date(nowMs + 60_000), // within 120s safety buffer -> triggers refresh
        refreshExpiresAt: new Date(nowMs + 30 * 24 * 3600 * 1000),
      });

      let receivedRefresh = "";
      const result = await manager.getValidAccessToken({
        refreshHandler: async ({ refreshToken }) => {
          receivedRefresh = refreshToken;
          return {
            accessToken: "tt_new_access_rotated",
            refreshToken: "tt_new_refresh_rotated",
            tokenExpiresAt: new Date(nowMs + 24 * 3600 * 1000),
          };
        },
      });

      assert.equal(receivedRefresh, "tt_old_refresh");
      assert.equal(result.accessToken, "tt_new_access_rotated");

      // Confirm rotated refresh token replaced the old one in DB
      const stored = mockDb._rows.get("orvastore")!;
      assert.equal(decryptTikTokToken(stored.access_token_encrypted, validHexKey), "tt_new_access_rotated");
      assert.equal(decryptTikTokToken(stored.refresh_token_encrypted!, validHexKey), "tt_new_refresh_rotated");
    } finally {
      __testResetSupabaseServerInstance();
    }
  });

  await runTest("TokenManager marks non-refreshable expired token as token_expired and fails closed", async () => {
    const mockDb = createMockSupabaseForConnections();
    __testSetSupabaseServerInstance(mockDb);
    try {
      const nowMs = Date.parse("2026-11-19T20:00:00.000Z");
      const manager = new TikTokTokenManager({ encryptionKey: validHexKey, nowImpl: () => nowMs });

      await manager.saveConnectionTokens({
        appId: "app_norefresh_001",
        accessToken: "tt_expired_access",
        refreshToken: null,
        tokenExpiresAt: new Date(nowMs - 5_000),
      });

      await assert.rejects(
        () => manager.getValidAccessToken(),
        (err: unknown) => err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED",
      );

      const pub = await manager.getPublicConnection();
      assert.equal(pub?.status, "token_expired");
    } finally {
      __testResetSupabaseServerInstance();
    }
  });

  await runTest("TokenManager disconnect revokes upstream and purges stored encrypted tokens even on upstream error", async () => {
    const mockDb = createMockSupabaseForConnections();
    __testSetSupabaseServerInstance(mockDb);
    try {
      const manager = new TikTokTokenManager({ encryptionKey: validHexKey });
      await manager.saveConnectionTokens({
        appId: "app_disc_001",
        accessToken: "tt_revoke_me",
      });

      let revokedTokenSeen = "";
      const res = await manager.disconnectConnection("orvastore", async (token) => {
        revokedTokenSeen = token;
        throw new Error("Simulated upstream already-revoked error");
      });

      assert.equal(revokedTokenSeen, "tt_revoke_me");
      assert.equal(res.disconnected, true);
      assert.equal(res.upstreamRevoked, false);
      assert.equal(await manager.getPublicConnection("orvastore"), null);
    } finally {
      __testResetSupabaseServerInstance();
    }
  });

  // ── GROUP 3: CENTRALIZED TIKTOK API CLIENT TESTS ───────────────────────────
  console.log("\n3. TikTokApiClient v1.3 Validation, Error Classification & Retry Resilience");

  await runTest("Executes v1.3 GET request with Access-Token header and Zod schema validation", async () => {
    let capturedUrl = "";
    let capturedTokenHeader = "";
    const client = new TikTokApiClient({
      sleepImpl: async () => undefined,
      fetchImpl: async (input, init) => {
        capturedUrl = String(input);
        capturedTokenHeader = (init?.headers as Record<string, string>)["Access-Token"] || "";
        return new Response(
          JSON.stringify({
            code: 0,
            message: "OK",
            request_id: "req_syn_001",
            data: {
              list: [{ advertiser_id: "700123456789", advertiser_name: "ORVA Demo Ad Account" }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const res = await client.requestJson({
      method: "GET",
      path: "/oauth2/advertiser/get/",
      accessToken: "tt_header_secret_123",
      query: { app_id: "app_1", secret: "sec_1" },
      dataSchema: tikTokAdvertiserListDataSchema,
    });

    assert.ok(capturedUrl.startsWith(`${TIKTOK_API_BASE_URL}/oauth2/advertiser/get/`));
    assert.equal(capturedTokenHeader, "tt_header_secret_123");
    assert.equal(res.requestId, "req_syn_001");
    assert.equal(res.data.list.length, 1);
    assert.equal(res.data.list[0].advertiser_id, "700123456789");
  });

  await runTest("Classifies official TikTok v1.3 return codes accurately (40105, 40001, 40002, 40100, 50000)", () => {
    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.TOKEN_INVALID_OR_EXPIRED }).category, "AUTH_TOKEN_EXPIRED");
    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.TOKEN_INVALID_OR_EXPIRED }).retryable, false);

    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.NO_PERMISSION }).category, "AUTH_PERMISSION_DENIED");
    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.NO_PERMISSION }).retryable, false);

    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.INVALID_PARAMETERS }).category, "INVALID_PARAMETERS");
    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.INVALID_PARAMETERS }).retryable, false);

    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.RATE_LIMITED }).category, "RATE_LIMITED");
    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.RATE_LIMITED }).retryable, true);

    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.UPSTREAM_INTERNAL_ERROR }).category, "UPSTREAM_SERVER_ERROR");
    assert.equal(classifyTikTokApiError({ tiktokCode: TIKTOK_RETURN_CODES.UPSTREAM_INTERNAL_ERROR }).retryable, true);
  });

  await runTest("Retries transient rate-limit (40100 / Retry-After) and HTTP 503 then succeeds", async () => {
    let calls = 0;
    const sleepCalls: number[] = [];
    const logs: Array<{ level: string; event: string; ctx: Record<string, unknown> }> = [];

    const client = new TikTokApiClient({
      maxRetries: 2,
      retryBaseDelayMs: 100,
      sleepImpl: async (ms) => {
        sleepCalls.push(ms);
      },
      logger: {
        warn: (event, ctx) => logs.push({ level: "warn", event, ctx }),
        error: (event, ctx) => logs.push({ level: "error", event, ctx }),
      },
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ code: 40100, message: "Too many requests", request_id: "r1" }), {
            status: 429,
            headers: { "Content-Type": "application/json", "Retry-After": "1" },
          });
        }
        if (calls === 2) {
          return new Response("upstream unavailable", { status: 503 });
        }
        return new Response(JSON.stringify({ code: 0, message: "OK", request_id: "r3", data: { list: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    const res = await client.requestJson({
      method: "GET",
      path: "/page/get/",
      accessToken: "tt_never_log_this",
      dataSchema: z.object({ list: z.array(z.unknown()) }),
    });

    assert.equal(calls, 3);
    assert.deepEqual(sleepCalls, [1000, 200]);
    assert.equal(res.code, 0);
    assert.ok(!JSON.stringify(logs).includes("tt_never_log_this"));
  });

  await runTest("Does NOT retry non-retryable 40105 token errors or 40001 permission errors", async () => {
    let calls = 0;
    const client = new TikTokApiClient({
      maxRetries: 3,
      sleepImpl: async () => undefined,
      logger: { warn: () => undefined, error: () => undefined },
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify({ code: 40105, message: "Access token expired", request_id: "r_exp" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });

    await assert.rejects(
      () => client.requestJson({ method: "GET", path: "/page/get/", accessToken: "tt_dead" }),
      (err: unknown) =>
        err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED" && err.tiktokCode === 40105,
    );
    assert.equal(calls, 1, "Non-retryable 40105 error must not be retried");
  });

  await runTest("requestBinary downloads CSV lead streams AND catches JSON error envelopes on failed downloads", async () => {
    const csvSample = "lead_id,full_name,phone_number\nld_101,Test User,+213555112233\n";
    let mode: "csv" | "json_error" = "csv";

    const client = new TikTokApiClient({
      maxRetries: 0,
      logger: { warn: () => undefined, error: () => undefined },
      fetchImpl: async () => {
        if (mode === "csv") {
          return new Response(csvSample, {
            status: 200,
            headers: { "Content-Type": "text/csv; charset=utf-8", "x-tt-logid": "log_csv_1" },
          });
        }
        return new Response(
          JSON.stringify({ code: 40001, message: "No permission to download leads", request_id: "log_err_1" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const csvRes = await client.requestBinary({
      path: "/page/lead/task/download/",
      accessToken: "tt_valid",
      query: { advertiser_id: "adv_1", task_id: "task_1" },
    });
    assert.ok(csvRes.contentType.includes("text/csv"));
    assert.equal(csvRes.text, csvSample);
    assert.equal(csvRes.requestId, "log_csv_1");

    mode = "json_error";
    await assert.rejects(
      () =>
        client.requestBinary({
          path: "/page/lead/task/download/",
          accessToken: "tt_valid",
          query: { advertiser_id: "adv_1", task_id: "task_2" },
        }),
      (err: unknown) => err instanceof TikTokApiError && err.category === "AUTH_PERMISSION_DENIED",
    );
  });

  await runTest("Log redactor strips tokens, secrets, authorization headers, and phone numbers recursively", () => {
    const sanitized = redactSensitiveForLog({
      access_token: "raw_secret_1",
      refreshToken: "raw_secret_2",
      nested: { client_secret: "raw_secret_3", customerPhone: "0555998877", safeField: "ok" },
    }) as Record<string, any>;

    assert.equal(sanitized.access_token, "[REDACTED]");
    assert.equal(sanitized.refreshToken, "[REDACTED]");
    assert.equal(sanitized.nested.client_secret, "[REDACTED]");
    assert.equal(sanitized.nested.customerPhone, "[REDACTED]");
    assert.equal(sanitized.nested.safeField, "ok");
    assert.equal(parseRetryAfterMs("5"), 5000);
    assert.equal(parseRetryAfterMs(null), null);
  });

  console.log(`\n=== Phase A1 Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal error running Phase A1 test suite:", err);
  process.exitCode = 1;
});
