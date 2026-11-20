/**
 * ORVA Store — TikTok Lead Generation Integration
 * Phase A2 Verification Suite (Domain Services & Business Logic)
 *
 * Executes ALL Phase A2 services (oauth.ts, accounts.ts, forms.ts, leads.ts, sync.ts)
 * against REAL ephemeral PostgreSQL (@electric-sql/pglite) initialized with ORVA's
 * baseline migrations + Phase A1 TikTok migration, plus mocked TikTok Business API v1.3
 * responses and synthetic non-PII customer fixtures.
 *
 * Run: npx tsx tests/integrations/tiktok-phase-a2.test.ts
 * Zero production DB calls. Zero real customer PII. Zero real TikTok credentials.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../../src/lib/supabase/server";
import { TikTokApiClient } from "../../src/lib/integrations/tiktok/client";
import { TikTokTokenManager } from "../../src/lib/integrations/tiktok/token-manager";
import { TikTokApiError } from "../../src/lib/integrations/tiktok/types";
import {
  buildTikTokAuthorizationUrl,
  createTikTokRefreshHandler,
  disconnectTikTokAccount,
  exchangeAuthorizationCode,
  generateOAuthState,
  getTikTokConfigurationReadiness,
  validateTikTokRedirectUri,
  verifyOAuthState,
} from "../../src/lib/integrations/tiktok/oauth";
import {
  listStoredAdvertisers,
  manageAdvertiserWebhookSubscription,
  selectAdvertiserAccount,
  syncAuthorizedAdvertisers,
} from "../../src/lib/integrations/tiktok/accounts";
import {
  listMappableCatalogProducts,
  listStoredFormsWithMappings,
  normalizeTikTokFormFields,
  saveFormProductMapping,
  setFormSyncEnabled,
  syncAdvertiserInstantForms,
} from "../../src/lib/integrations/tiktok/forms";
import {
  MISSING_ADDRESS_CONFIRMATION_NOTE,
  createPendingOrderFromTikTokLead,
  extractLeadsFromWebhookPayload,
  isTikTokTelegramAlertsEnabled,
  normalizeAndValidateLeadPhone,
  normalizeLeadFields,
  parseTikTokLeadsCsv,
  processNormalizedTikTokLead,
  resolveAlgerianCommune,
  resolveAlgerianWilaya,
} from "../../src/lib/integrations/tiktok/leads";
import {
  __testResetTikTokSyncLocks,
  extractCsvFilesFromZipBuffer,
  extractLeadsFromDownloadedExport,
  pollLeadExportTask,
  processWebhookLeadEvent,
  reconcileHistoricalLeads,
  retryFailedTikTokLeads,
  syncEnabledForms,
  syncFormLeads,
  verifyTikTokWebhookSignature,
} from "../../src/lib/integrations/tiktok/sync";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261111_000001_consolidated_clean_rebuild.sql");
const ATTR_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261117_000005_order_attribution_and_profitability.sql");
const TIKTOK_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261119_000001_tiktok_lead_generation.sql");

const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
const TEST_OAUTH_CONFIG = {
  appId: "test_app_77112233",
  appSecret: "test_secret_super_strong_value_99887766",
  redirectUri: "https://www.orva-store.com/api/integrations/tiktok/callback/",
  sandboxMode: true,
  nodeEnv: "production",
};

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

// ── Lightweight PGlite -> Supabase PostgREST Query Adapter ───────────────────
// Executes real PostgreSQL SQL against PGlite so all FKs, CHECKs, UNIQUEs, and
// triggers (sync_orders_dual_columns) are authentically enforced in Phase A2 tests.

const JSONB_COLUMNS = new Set([
  "scopes",
  "raw_metadata",
  "fields_schema",
  "raw_field_data",
  "details",
  "metadata",
  "remarks",
  "risk_reasons",
  "integrations",
]);

function quoteIdent(id: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Invalid SQL identifier: ${id}`);
  }
  return `"${id}"`;
}

function serializeParam(col: string, val: unknown): unknown {
  if (val === undefined) return null;
  if (val !== null && JSONB_COLUMNS.has(col) && typeof val === "object") {
    return JSON.stringify(val);
  }
  return val;
}

function createPgliteSupabaseAdapter(pg: PGlite) {
  function createBuilder(table: string) {
    const safeTable = `public.${quoteIdent(table)}`;
    let action: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let selectCols = "*";
    let payload: any = null;
    let onConflictCol: string | null = null;
    let returning = false;
    let mode: "many" | "single" | "maybeSingle" = "many";
    const filters: Array<{ col: string; op: "=" | "IN"; val: unknown }> = [];
    let orderClause: { col: string; asc: boolean } | null = null;
    let limitCount: number | null = null;

    const execute = async (): Promise<{ data: any; error: any }> => {
      try {
        const params: unknown[] = [];
        const addParam = (col: string, v: unknown) => {
          params.push(serializeParam(col, v));
          return `$${params.length}`;
        };

        const buildWhere = () => {
          if (filters.length === 0) return "";
          const clauses = filters.map((f) => {
            if (f.op === "IN") {
              const arr = Array.isArray(f.val) ? f.val : [];
              if (arr.length === 0) return "1 = 0";
              const ph = arr.map((v) => addParam(f.col, v)).join(", ");
              return `${quoteIdent(f.col)} IN (${ph})`;
            }
            if (f.val === null) return `${quoteIdent(f.col)} IS NULL`;
            return `${quoteIdent(f.col)} = ${addParam(f.col, f.val)}`;
          });
          return ` WHERE ${clauses.join(" AND ")}`;
        };

        let sql = "";
        if (action === "select") {
          const cols =
            selectCols === "*"
              ? "*"
              : selectCols
                  .split(",")
                  .map((c) => quoteIdent(c.trim()))
                  .join(", ");
          sql = `SELECT ${cols} FROM ${safeTable}${buildWhere()}`;
          if (orderClause) {
            sql += ` ORDER BY ${quoteIdent(orderClause.col)} ${orderClause.asc ? "ASC" : "DESC"}`;
          }
          if (limitCount !== null) {
            sql += ` LIMIT ${limitCount}`;
          }
        } else if (action === "insert" || action === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (rows.length === 0) {
            return { data: mode === "many" ? [] : null, error: null };
          }
          const cols = Object.keys(rows[0]);
          const colList = cols.map(quoteIdent).join(", ");
          const valueTuples = rows.map(
            (r) => `(${cols.map((c) => addParam(c, r[c])).join(", ")})`,
          );
          sql = `INSERT INTO ${safeTable} (${colList}) VALUES ${valueTuples.join(", ")}`;
          if (action === "upsert" && onConflictCol) {
            const conflictCols = onConflictCol.split(",").map((c) => quoteIdent(c.trim())).join(", ");
            const updateCols = cols
              .filter((c) => !onConflictCol!.split(",").map((x) => x.trim()).includes(c))
              .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
              .join(", ");
            sql += ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateCols}`;
          }
          if (returning) {
            sql += ` RETURNING *`;
          }
        } else if (action === "update") {
          const cols = Object.keys(payload);
          const sets = cols.map((c) => `${quoteIdent(c)} = ${addParam(c, payload[c])}`).join(", ");
          sql = `UPDATE ${safeTable} SET ${sets}${buildWhere()}`;
          if (returning) sql += " RETURNING *";
        } else if (action === "delete") {
          sql = `DELETE FROM ${safeTable}${buildWhere()}`;
          if (returning) sql += " RETURNING *";
        }

        const res = await pg.query(sql, params);
        const rows = res.rows ?? [];
        if (mode === "single") {
          if (rows.length === 0) {
            return { data: null, error: { code: "PGRST116", message: "Row not found" } };
          }
          return { data: rows[0], error: null };
        }
        if (mode === "maybeSingle") {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      } catch (err: any) {
        return {
          data: null,
          error: {
            code: err?.code || "PG_ERROR",
            message: err?.message || String(err),
          },
        };
      }
    };

    const builder: any = {
      select(cols = "*") {
        if (action === "insert" || action === "upsert" || action === "update" || action === "delete") {
          returning = true;
        } else {
          action = "select";
          selectCols = cols;
        }
        return builder;
      },
      insert(data: any) {
        action = "insert";
        payload = data;
        return builder;
      },
      upsert(data: any, opts?: { onConflict?: string }) {
        action = "upsert";
        payload = data;
        onConflictCol = opts?.onConflict ?? null;
        return builder;
      },
      update(data: any) {
        action = "update";
        payload = data;
        return builder;
      },
      delete() {
        action = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push({ col, op: "=", val });
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push({ col, op: "IN", val: vals });
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderClause = { col, asc: opts?.ascending !== false };
        return builder;
      },
      limit(n: number) {
        limitCount = n;
        return builder;
      },
      single() {
        mode = "single";
        return execute();
      },
      maybeSingle() {
        mode = "maybeSingle";
        return execute();
      },
      then(resolve: any, reject: any) {
        return execute().then(resolve, reject);
      },
    };

    return builder;
  }

  return {
    from(table: string) {
      return createBuilder(table);
    },
  };
}

/** Builds a genuine PKZIP archive (DEFLATE method 8) in memory using pure Node.js zlib. */
function buildTestZipBuffer(files: Array<{ name: string; content: string; method?: 0 | 8 }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const rawBuf = Buffer.from(file.content, "utf8");
    const method = file.method ?? 8;
    const compBuf = method === 8 ? zlib.deflateRawSync(rawBuf) : rawBuf;

    // Local File Header (30 bytes + filename + compressed data)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(0, 14); // CRC (not required by inflateRawSync)
    lfh.writeUInt32LE(compBuf.length, 18);
    lfh.writeUInt32LE(rawBuf.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localParts.push(lfh, nameBuf, compBuf);

    // Central Directory Header (46 bytes + filename)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(0, 16);
    cdh.writeUInt32LE(compBuf.length, 20);
    cdh.writeUInt32LE(rawBuf.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);

    centralParts.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + compBuf.length;
  }

  const centralDirBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function createInitializedPg(): Promise<PGlite> {
  const pg = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
  await pg.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
    END $$;
  `);
  await pg.exec(fs.readFileSync(BASELINE_SQL, "utf8"));
  await pg.exec(fs.readFileSync(ATTR_SQL, "utf8"));
  await pg.exec(fs.readFileSync(TIKTOK_SQL, "utf8"));
  return pg;
}

async function main() {
  console.log("\n=== ORVA STORE — TikTok Phase A2 Verification Suite ===\n");

  const pg = await createInitializedPg();
  const adapter = createPgliteSupabaseAdapter(pg);
  __testSetSupabaseServerInstance(adapter);

  const tokenManager = new TikTokTokenManager({ encryptionKey: TEST_ENCRYPTION_KEY });
  const silentLogger = { warn: () => undefined, error: () => undefined };
  const noSleep = async () => undefined;

  // Fetch real seeded product UUIDs from PGlite (PACK2 + insert a custom non-PACK product + archived product)
  const pack2Res = await pg.query<{ id: string }>(
    `SELECT id FROM public.products WHERE slug = 'pack2' LIMIT 1`,
  );
  const pack2Id = pack2Res.rows[0].id;

  const customProdRes = await pg.query<{ id: string }>(
    `INSERT INTO public.products (slug, sku, name, base_price, status, stock_quantity)
     VALUES ('drill-pro-20v', 'ORVA-DRILL-20V', 'مثقاب كهربائي برو 20V', 8900, 'PUBLISHED', 25)
     RETURNING id`,
  );
  const customProductId = customProdRes.rows[0].id;

  const archivedProdRes = await pg.query<{ id: string }>(
    `INSERT INTO public.products (slug, sku, name, base_price, status, stock_quantity)
     VALUES ('old-archived-tool', 'ORVA-ARCHIVED', 'منتج مؤرشف', 4000, 'ARCHIVED', 0)
     RETURNING id`,
  );
  const archivedProductId = archivedProdRes.rows[0].id;

  // ── 1. OAUTH SERVICE TESTS ─────────────────────────────────────────────────
  console.log("1. OAuth State, Redirect Validation, Token Exchange, Refresh & Disconnect");

  await runTest("Validates HTTPS redirect URIs and fails closed on HTTP/credentials/fragments", () => {
    assert.equal(
      validateTikTokRedirectUri("https://www.orva-store.com/api/integrations/tiktok/callback/", { nodeEnv: "production" }).valid,
      true,
    );
    assert.equal(
      validateTikTokRedirectUri("http://www.orva-store.com/api/integrations/tiktok/callback/", { nodeEnv: "production" }).valid,
      false,
    );
    assert.equal(
      validateTikTokRedirectUri("http://localhost:3000/api/integrations/tiktok/callback/", { nodeEnv: "development" }).valid,
      true,
    );
    assert.equal(
      validateTikTokRedirectUri("http://localhost:3000/api/integrations/tiktok/callback/", { nodeEnv: "production" }).valid,
      false,
    );
    assert.equal(
      validateTikTokRedirectUri("https://user:pass@orva-store.com/cb", { nodeEnv: "production" }).valid,
      false,
    );
    assert.equal(
      validateTikTokRedirectUri("https://orva-store.com/cb#frag", { nodeEnv: "production" }).valid,
      false,
    );

    const readiness = getTikTokConfigurationReadiness({
      appId: TEST_OAUTH_CONFIG.appId,
      appSecret: TEST_OAUTH_CONFIG.appSecret,
      redirectUri: TEST_OAUTH_CONFIG.redirectUri,
      encryptionKey: TEST_ENCRYPTION_KEY,
      nodeEnv: "production",
    });
    assert.equal(readiness.configured, true);
    assert.equal(readiness.telegramAlertsOptIn, false);
  });

  await runTest("Generates and verifies HMAC-SHA256 OAuth CSRF state (rejects tampering, expiry, cookie mismatch)", () => {
    const baseTime = Date.UTC(2026, 10, 19, 12, 0, 0);
    const { authorizationUrl, state } = buildTikTokAuthorizationUrl({
      storeId: "orvastore",
      actor: "admin",
      nowMs: baseTime,
      configOverrides: TEST_OAUTH_CONFIG,
    });

    const parsedUrl = new URL(authorizationUrl);
    assert.equal(parsedUrl.origin, "https://business-api.tiktok.com");
    assert.equal(parsedUrl.searchParams.get("app_id"), TEST_OAUTH_CONFIG.appId);
    assert.equal(parsedUrl.searchParams.get("state"), state);
    assert.equal(parsedUrl.searchParams.get("redirect_uri"), TEST_OAUTH_CONFIG.redirectUri);

    // Valid check + matching cookie
    const ok = verifyOAuthState(state, {
      expectedCookieState: state,
      expectedStoreId: "orvastore",
      nowMs: baseTime + 5_000,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.equal(ok.valid, true);
    assert.equal(ok.payload?.storeId, "orvastore");

    // Tampered signature rejected
    const tampered = `${state.slice(0, -2)}AA`;
    assert.equal(
      verifyOAuthState(tampered, { expectedCookieState: tampered, nowMs: baseTime + 5_000, configOverrides: TEST_OAUTH_CONFIG }).valid,
      false,
    );

    // Cookie mismatch rejected
    const other = generateOAuthState({ nowMs: baseTime, configOverrides: TEST_OAUTH_CONFIG });
    assert.equal(
      verifyOAuthState(state, { expectedCookieState: other.state, nowMs: baseTime + 5_000, configOverrides: TEST_OAUTH_CONFIG }).valid,
      false,
    );

    // Expired state rejected (>10m)
    assert.equal(
      verifyOAuthState(state, { expectedCookieState: state, nowMs: baseTime + 11 * 60 * 1000, configOverrides: TEST_OAUTH_CONFIG }).valid,
      false,
    );
  });

  await runTest("Exchanges auth_code via mocked TikTok v1.3 API, encrypts tokens at rest, and strips secrets from DTO", async () => {
    const baseTime = Date.now();
    const { state } = generateOAuthState({ nowMs: baseTime, configOverrides: TEST_OAUTH_CONFIG });

    const capture: { body: Record<string, unknown> | null } = { body: null };
    const mockClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url, init) => {
        assert.ok(String(url).endsWith("/open_api/v1.3/oauth2/access_token/"));
        capture.body = JSON.parse(String(init?.body || "{}"));
        return jsonResponse({
          code: 0,
          message: "OK",
          request_id: "req_oauth_1",
          data: {
            access_token: "synthetic_access_token_v1",
            refresh_token: "synthetic_refresh_token_v1",
            expires_in: 3600,
            refresh_token_expires_in: 86400 * 30,
            advertiser_ids: ["700111222", "700333444"],
            scope: [12010100, 12020100],
          },
        });
      },
    });

    const result = await exchangeAuthorizationCode({
      authCode: "synthetic_auth_code_xyz",
      state,
      expectedCookieState: state,
      nowMs: baseTime + 1_000,
      configOverrides: TEST_OAUTH_CONFIG,
      client: mockClient,
      tokenManager,
    });

    assert.equal(capture.body?.grant_type, "authorization_code");
    assert.equal(capture.body?.auth_code, "synthetic_auth_code_xyz");
    assert.equal(result.connection.status, "connected");
    assert.equal(result.connection.hasRefreshToken, true);
    assert.deepEqual(result.advertiserIds, ["700111222", "700333444"]);
    assert.equal("access_token_encrypted" in (result.connection as any), false);

    // Verify encrypted ciphertext stored in PGlite (not plaintext)
    const dbRow = await pg.query<{ access_token_encrypted: string }>(
      `SELECT access_token_encrypted FROM public.tiktok_connections WHERE store_id = 'orvastore'`,
    );
    assert.ok(dbRow.rows[0].access_token_encrypted.startsWith("v1:"));
    assert.ok(!dbRow.rows[0].access_token_encrypted.includes("synthetic_access_token_v1"));
  });

  await runTest("Rotates expired access & refresh tokens when refresh_token is supported", async () => {
    const expiredCheckTime = Date.now() + 2 * 60 * 60 * 1000; // +2 hours (past 1h expiry)
    const agedTokenMgr = new TikTokTokenManager({
      encryptionKey: TEST_ENCRYPTION_KEY,
      nowImpl: () => expiredCheckTime,
    });

    const refreshClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body || "{}"));
        assert.equal(body.grant_type, "refresh_token");
        assert.equal(body.refresh_token, "synthetic_refresh_token_v1");
        return jsonResponse({
          code: 0,
          message: "OK",
          data: {
            access_token: "synthetic_access_token_v2_rotated",
            refresh_token: "synthetic_refresh_token_v2_rotated",
            expires_in: 7200,
            refresh_token_expires_in: 86400 * 30,
            scope: [12010100],
          },
        });
      },
    });

    const refreshed = await agedTokenMgr.getValidAccessToken({
      storeId: "orvastore",
      refreshHandler: createTikTokRefreshHandler({
        client: refreshClient,
        configOverrides: TEST_OAUTH_CONFIG,
        nowMs: () => expiredCheckTime,
      }),
    });

    assert.equal(refreshed.accessToken, "synthetic_access_token_v2_rotated");
    assert.equal(refreshed.connection.status, "connected");
  });

  // ── 2. ADVERTISER ACCOUNT SERVICE TESTS ────────────────────────────────────
  console.log("2. Advertiser Account Sync, Lead Permission Verification, Selection & Webhooks");

  await runTest("Syncs authorized advertisers, enriches metadata, and detects revoked accounts", async () => {
    let callCount = 0;
    const advClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url) => {
        callCount += 1;
        const urlStr = String(url);
        if (urlStr.includes("/oauth2/advertiser/get/")) {
          return jsonResponse({
            code: 0,
            message: "OK",
            data: {
              list: [
                { advertiser_id: "700111222", advertiser_name: "ORVA DZ Main Ads" },
                { advertiser_id: "700333444", advertiser_name: "ORVA Secondary NoLead" },
              ],
            },
          });
        }
        if (urlStr.includes("/advertiser/info/")) {
          return jsonResponse({
            code: 0,
            message: "OK",
            data: {
              list: [
                { advertiser_id: "700111222", currency: "DZD", timezone: "Africa/Algiers", status: "STATUS_ENABLE" },
                { advertiser_id: "700333444", currency: "USD", timezone: "Africa/Algiers", status: "STATUS_ENABLE" },
              ],
            },
          });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      },
    });

    const synced = await syncAuthorizedAdvertisers({
      client: advClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.equal(callCount, 2);
    assert.equal(synced.accounts.length, 2);
    assert.equal(synced.revokedIds.length, 0);

    // Re-sync with 700333444 removed upstream -> marked STATUS_REVOKED
    const advRevokeClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/oauth2/advertiser/get/")) {
          return jsonResponse({
            code: 0,
            message: "OK",
            data: { list: [{ advertiser_id: "700111222", advertiser_name: "ORVA DZ Main Ads" }] },
          });
        }
        return jsonResponse({ code: 40001, message: "No permission for advertiser/info" });
      },
    });

    const resynced = await syncAuthorizedAdvertisers({
      client: advRevokeClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.deepEqual(resynced.revokedIds, ["700333444"]);
    assert.ok(resynced.metadataWarning !== null);
    const stored = await listStoredAdvertisers("orvastore");
    const revokedAcc = stored.find((a) => a.advertiserId === "700333444");
    assert.equal(revokedAcc?.accountStatus, "STATUS_REVOKED");
  });

  await runTest("Enforces Lead permission verification during advertiser selection & handles webhook subscribe/unsubscribe", async () => {
    // Reject selection of revoked account
    await assert.rejects(
      () =>
        selectAdvertiserAccount({
          advertiserId: "700333444",
          tokenManager,
          configOverrides: TEST_OAUTH_CONFIG,
        }),
      (err: unknown) => err instanceof TikTokApiError && err.category === "AUTH_PERMISSION_DENIED",
    );

    // Reject selection when advertiser lacks scope 12010100 (40001 on /page/get/)
    const deniedProbeClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async () => jsonResponse({ code: 40001, message: "Missing Leads Retrieval 12010100" }),
    });
    await assert.rejects(
      () =>
        selectAdvertiserAccount({
          advertiserId: "700111222",
          client: deniedProbeClient,
          tokenManager,
          configOverrides: TEST_OAUTH_CONFIG,
        }),
      (err: unknown) => err instanceof TikTokApiError && err.category === "AUTH_PERMISSION_DENIED",
    );

    // Succeed when Lead permission probe passes
    const okClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/page/get/")) {
          return jsonResponse({ code: 0, message: "OK", data: { list: [] } });
        }
        if (urlStr.includes("/subscription/subscribe/")) {
          return jsonResponse({ code: 0, message: "OK", data: { subscription_id: "sub_lead_001" } });
        }
        if (urlStr.includes("/subscription/unsubscribe/")) {
          return jsonResponse({ code: 0, message: "OK", data: {} });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      },
    });

    const selected = await selectAdvertiserAccount({
      advertiserId: "700111222",
      client: okClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.equal(selected.selectedAccount.isSelected, true);
    assert.equal(selected.leadPermissionVerified, true);

    const sub = await manageAdvertiserWebhookSubscription({
      advertiserId: "700111222",
      action: "subscribe",
      callbackUrl: "https://www.orva-store.com/api/integrations/tiktok/webhook/",
      client: okClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.equal(sub.webhookSubscribed, true);
    assert.equal(sub.subscriptionId, "sub_lead_001");

    const unsub = await manageAdvertiserWebhookSubscription({
      advertiserId: "700111222",
      action: "unsubscribe",
      client: okClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.equal(unsub.webhookSubscribed, false);
  });

  // ── 3. INSTANT FORMS & REAL CATALOG PRODUCT MAPPING TESTS ──────────────────
  console.log("3. Instant Forms Sync, Field Normalization, Removed Forms & Real Catalog Mapping");

  await runTest("Retrieves paginated Instant Forms, normalizes fields, and detects removed forms", async () => {
    const formsClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url) => {
        const urlStr = String(url);
        if (urlStr.includes("/page/get/") && urlStr.includes("page=1")) {
          return jsonResponse({
            code: 0,
            message: "OK",
            data: {
              list: [
                { page_id: "form_pack2_ar", page_name: "نموذج باك 2 كراون", status: "ACTIVE" },
                { page_id: "form_drill_fr", page_name: "Formulaire Perceuse 20V", status: "ACTIVE" },
              ],
              page_info: { page: 1, page_size: 100, total_page: 2 },
            },
          });
        }
        if (urlStr.includes("/page/get/") && urlStr.includes("page=2")) {
          return jsonResponse({
            code: 0,
            message: "OK",
            data: {
              list: [{ page_id: "form_old_temp", page_name: "Temp Campaign Form", status: "ACTIVE" }],
              page_info: { page: 2, page_size: 100, total_page: 2 },
            },
          });
        }
        if (urlStr.includes("/page/field/get/")) {
          return jsonResponse({
            code: 0,
            message: "OK",
            data: {
              list: [
                { field_id: "f1", field_name: "الاسم الكامل", field_type: "NAME", required: true },
                { field_id: "f2", field_name: "رقم الهاتف", field_type: "PHONE", required: true },
                { field_id: "f3", field_name: "الولاية", field_type: "TEXT", required: true },
              ],
            },
          });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      },
    });

    const firstSync = await syncAdvertiserInstantForms({
      advertiserId: "700111222",
      client: formsClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.equal(firstSync.createdFormIds.length, 3);
    assert.equal(firstSync.removedFormIds.length, 0);
    assert.equal(firstSync.forms[0].fields.length, 3);

    // Field normalizer handles heterogeneous keys
    const normFields = normalizeTikTokFormFields({
      questions: [{ id: 10, label: "Téléphone", type: "phone_number", is_required: 1 }],
    });
    assert.equal(normFields.length, 1);
    assert.equal(normFields[0].field_name, "Téléphone");
    assert.equal(normFields[0].required, true);

    // Second sync omits form_old_temp -> marked DELETED & sync_enabled=false
    const secondClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url) => {
        if (String(url).includes("/page/get/")) {
          return jsonResponse({
            code: 0,
            message: "OK",
            data: {
              list: [
                { page_id: "form_pack2_ar", page_name: "نموذج باك 2 كراون", status: "ACTIVE" },
                { page_id: "form_drill_fr", page_name: "Formulaire Perceuse 20V", status: "ACTIVE" },
              ],
              page_info: { page: 1, page_size: 100, total_page: 1 },
            },
          });
        }
        return jsonResponse({ code: 0, message: "OK", data: { list: [] } });
      },
    });

    const secondSync = await syncAdvertiserInstantForms({
      advertiserId: "700111222",
      client: secondClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.deepEqual(secondSync.removedFormIds, ["form_old_temp"]);
    const deletedForm = secondSync.forms.find((f) => f.formId === "form_old_temp");
    assert.equal(deletedForm?.status, "DELETED");
    assert.equal(deletedForm?.syncEnabled, false);
  });

  await runTest("Maps forms to REAL ORVA catalog products (UUID FK), rejects archived products & unmapped sync enable", async () => {
    const mappable = await listMappableCatalogProducts();
    assert.ok(mappable.some((p) => p.id === pack2Id));
    assert.ok(mappable.some((p) => p.id === customProductId));
    assert.ok(!mappable.some((p) => p.id === archivedProductId));

    // Enabling sync before mapping fails closed
    await assert.rejects(
      () => setFormSyncEnabled({ formId: "form_pack2_ar", syncEnabled: true }),
      (err: unknown) => err instanceof TikTokApiError && err.category === "INVALID_PARAMETERS",
    );

    // Mapping an archived product fails closed
    await assert.rejects(
      () =>
        saveFormProductMapping({
          formId: "form_pack2_ar",
          productId: archivedProductId,
        }),
      (err: unknown) => err instanceof TikTokApiError && err.category === "INVALID_PARAMETERS",
    );

    // Map form_pack2_ar -> real PACK2 (authoritative price 12,950 DZD from public.products)
    const mappedPack2 = await saveFormProductMapping({
      formId: "form_pack2_ar",
      productId: pack2Id,
      defaultWilayaCode: 16,
      defaultDeliveryType: "DOMICILE",
      autoCreateOrder: true,
      syncEnabled: true,
    });
    assert.equal(mappedPack2.syncEnabled, true);
    assert.equal(mappedPack2.mapping?.productId, pack2Id);
    assert.equal(mappedPack2.mapping?.packId, "PACK2");
    assert.equal(mappedPack2.mapping?.productPrice, 12950);

    // Map form_drill_fr -> real custom product (STOP_DESK default to test Decision 3 fallback!)
    const mappedCustom = await saveFormProductMapping({
      formId: "form_drill_fr",
      productId: customProductId,
      defaultWilayaCode: 31,
      defaultDeliveryType: "STOP_DESK",
      autoCreateOrder: true,
      syncEnabled: true,
    });
    assert.equal(mappedCustom.mapping?.packId, "DRILL-PRO-20V");
    assert.equal(mappedCustom.mapping?.productPrice, 8900);

    const joined = await listStoredFormsWithMappings({ advertiserId: "700111222" });
    assert.equal(joined.filter((f) => f.mapping !== null).length, 2);
  });

  // ── 4. MULTILINGUAL NORMALIZATION, PHONE & WILAYA RESOLUTION TESTS ─────────
  console.log("4. Arabic/French Field Normalization, Algerian Phone & 58-Wilaya Resolution");

  await runTest("Normalizes Arabic & French lead fields, Arabic-Indic phone digits, and 58 wilayas", () => {
    const arFields = normalizeLeadFields({
      "الاسم الكامل": "كريم بن علي",
      "رقم الهاتف": "+213 ٥٥٠ ١٢ ٣٤ ٥٦",
      الولاية: "16 - الجزائر العاصمة",
      البلدية: "باب الزوار",
    });
    assert.equal(arFields.customerName, "كريم بن علي");
    assert.equal(arFields.customerPhoneNormalized, "0550123456");
    assert.equal(arFields.phoneValid, true);
    assert.equal(arFields.deliveryAddressRaw, null);

    const frFields = normalizeLeadFields({
      "Nom complet": "Yacine Mansouri",
      "Numéro de téléphone": "00213 661-99-88-77",
      Wilaya: "Béjaïa",
      Commune: "Akbou",
      "Type de livraison": "Point Relais / Stop Desk",
    });
    assert.equal(frFields.customerName, "Yacine Mansouri");
    assert.equal(frFields.customerPhoneNormalized, "0661998877");
    assert.equal(frFields.phoneValid, true);
    assert.equal(frFields.requestedDeliveryType, "STOP_DESK");

    assert.equal(normalizeAndValidateLeadPhone("02145678").valid, false);
    assert.equal(normalizeAndValidateLeadPhone("0770123456").valid, true);

    assert.equal(resolveAlgerianWilaya("Béjaïa", 16).wilaya.code, 6);
    assert.equal(resolveAlgerianWilaya("الجزائر العاصمة", 7).wilaya.code, 16);
    assert.equal(resolveAlgerianWilaya("إليزي", 16).wilaya.code, 33);
    assert.equal(resolveAlgerianWilaya("Timimoun", 16).wilaya.code, 49);
    assert.equal(resolveAlgerianWilaya("Unknown Place", 7).wilayaFallbackApplied, true);
    assert.equal(resolveAlgerianWilaya("Unknown Place", 7).wilaya.code, 7);
    assert.equal(resolveAlgerianCommune("", 16).communeFallbackApplied, true);
  });

  // ── 5. ORDER CREATION RULES, DECISIONS 1 / 2 / 3 & DEDUPLICATION ───────────
  console.log("5. Pending Order Creation, Decisions 1-3, Custom pack_id CHECK & Deduplication");

  await runTest("Decision 1 & 2: Creates pending order with empty missing address, bilingual note, in_redex=false, and opt-in Telegram disabled by default", async () => {
    let telegramCalls = 0;
    const prevEnv = process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;
    delete process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;

    try {
      assert.equal(await isTikTokTelegramAlertsEnabled(), false);

      const outcome = await processNormalizedTikTokLead({
        lead: {
          externalLeadId: "tt_lead_ar_001",
          formId: "form_pack2_ar",
          advertiserId: "700111222",
          campaignId: "camp_101",
          campaignName: "Ramadan_Pack2_DZ",
          fields: {
            "الاسم الكامل": "سمير قاسمي",
            "رقم الهاتف": "+213 550 11 22 33",
            الولاية: "الجزائر",
            البلدية: "القبة",
          },
        },
        loadLiveDeliveryFees: async () => null,
        telegramOptions: {
          fetchImpl: async () => {
            telegramCalls += 1;
            return jsonResponse({ ok: true });
          },
          loadTelegramCredentials: async () => ({ botToken: "123:synthetic", chatId: "999", enabled: true }),
        },
      });

      if (outcome.telegramNotificationPromise) {
        const tgRes = await outcome.telegramNotificationPromise;
        assert.equal(tgRes.sent, false);
        assert.equal(tgRes.skippedReason, "opt_in_disabled");
      }
      assert.equal(telegramCalls, 0, "Telegram MUST NOT send when opt-in is disabled");
      assert.equal(outcome.syncStatus, "order_created");
      assert.ok(outcome.orderId);

      // Verify exact DB row in real PostgreSQL public.orders & public.order_items
      const ordRes = await pg.query<any>(
        `SELECT * FROM public.orders WHERE order_id = $1`,
        [outcome.orderId],
      );
      const ord = ordRes.rows[0];
      assert.equal(ord.status, "pending");
      assert.equal(ord.in_redex, false);
      assert.equal(ord.attribution_source, "tiktok_ads");
      assert.equal(ord.idempotency_key, "tiktok_lead_tt_lead_ar_001");
      assert.equal(ord.delivery_address, ""); // Decision 2: strictly empty, never fabricated
      assert.equal(ord.notes, MISSING_ADDRESS_CONFIRMATION_NOTE);
      assert.equal(ord.operator_notes, MISSING_ADDRESS_CONFIRMATION_NOTE);
      assert.equal(Number(ord.subtotal), 12950);
      assert.equal(Number(ord.delivery_fee), 500); // Zone 2 Alger Domicile
      assert.equal(Number(ord.total_payable), 13450);
      assert.equal(ord.metadata.addressMissing, true);

      const itemRes = await pg.query<any>(
        `SELECT * FROM public.order_items WHERE order_id = $1`,
        [outcome.orderId],
      );
      assert.equal(itemRes.rows.length, 1);
      assert.equal(itemRes.rows[0].product_id, pack2Id);
      assert.equal(itemRes.rows[0].pack_id, "PACK2");
    } finally {
      if (prevEnv !== undefined) process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED = prevEnv;
    }
  });

  await runTest("Decision 3 & Custom Catalog Product: Automatically falls back STOP_DESK -> DOMICILE in Wilaya 49 (Timimoun) & respects order_items.pack_id CHECK", async () => {
    const outcome = await processNormalizedTikTokLead({
      lead: {
        externalLeadId: "tt_lead_south_002",
        formId: "form_drill_fr", // mapped to custom product drill-pro-20v with default_delivery_type = STOP_DESK
        advertiserId: "700111222",
        fields: {
          "Nom complet": "Nabil Touati",
          Téléphone: "0661445566",
          Wilaya: "49 - Timimoun",
          Commune: "Timimoun",
        },
      },
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });

    assert.equal(outcome.syncStatus, "order_created");
    assert.ok(outcome.orderId);

    const ord = (await pg.query<any>(`SELECT * FROM public.orders WHERE order_id = $1`, [outcome.orderId])).rows[0];
    assert.equal(ord.wilaya_code, 49);
    assert.equal(ord.delivery_method, "DOMICILE"); // Fallback from STOP_DESK!
    assert.equal(Number(ord.delivery_fee), 1000); // Zone 5 Domicile tariff
    assert.equal(Number(ord.subtotal), 8900);
    assert.equal(Number(ord.total_payable), 9900);
    assert.equal(ord.metadata.deliveryTypeFallback.applied, true);
    assert.equal(ord.metadata.deliveryTypeFallback.requested, "STOP_DESK");
    assert.equal(ord.metadata.deliveryTypeFallback.effective, "DOMICILE");

    // Verify order_items succeeded with pack_id=NULL for custom product (CHECK constraint preserved!)
    const item = (await pg.query<any>(`SELECT * FROM public.order_items WHERE order_id = $1`, [outcome.orderId])).rows[0];
    assert.equal(item.product_id, customProductId);
    assert.equal(item.pack_id, null);
    assert.equal(item.variant_label_snapshot, "DRILL-PRO-20V");
  });

  await runTest("Decision 1 Opt-In Telegram: Strictly non-blocking when failing/timing out, masks phones in logs, and NEVER sends on duplicates or invalid leads", async () => {
    const loggedEntries: Array<Record<string, unknown>> = [];
    let tgAttempts = 0;

    // 1. Failing Telegram MUST NOT fail or delay order creation
    const started = Date.now();
    const res = await processNormalizedTikTokLead({
      lead: {
        externalLeadId: "tt_lead_tg_optin_003",
        formId: "form_pack2_ar",
        advertiserId: "700111222",
        fields: {
          full_name: "Amine Chergui",
          phone_number: "0770889900",
          wilaya: "25 - Constantine",
          address: "Cité Boussouf Bloc B",
        },
      },
      loadLiveDeliveryFees: async () => null,
      telegramOptions: {
        optInEnabled: true,
        timeoutMs: 2500,
        loadTelegramCredentials: async () => ({ botToken: "999999:synthetic_bot_secret", chatId: "1234567890", enabled: true }),
        fetchImpl: async () => {
          tgAttempts += 1;
          await new Promise((r) => setTimeout(r, 40));
          throw new Error("Simulated Telegram API outage");
        },
        logger: {
          warn: (_msg, ctx) => {
            if (ctx) loggedEntries.push(ctx);
          },
        },
      },
    });
    const orderElapsed = Date.now() - started;
    assert.equal(res.syncStatus, "order_created");
    assert.ok(orderElapsed < 1500, "Order creation must not wait on Telegram failure");

    const tgResult = await res.telegramNotificationPromise;
    assert.equal(tgResult?.sent, false);
    assert.equal(tgAttempts, 1);
    const serializedLogs = JSON.stringify(loggedEntries);
    assert.ok(!serializedLogs.includes("0770889900"), "Raw customer phone MUST NOT appear in logs");
    assert.ok(serializedLogs.includes("0770 •• •• 00"), "Masked phone expected in diagnostic log");
    assert.ok(!serializedLogs.includes("synthetic_bot_secret"), "Telegram bot token MUST NOT appear in logs");

    // 2. Re-processing identical lead (duplicate) MUST NOT create duplicate order OR fire Telegram
    const dup = await processNormalizedTikTokLead({
      lead: {
        externalLeadId: "tt_lead_tg_optin_003",
        formId: "form_pack2_ar",
        advertiserId: "700111222",
        fields: { full_name: "Amine Chergui", phone_number: "0770889900", wilaya: "Constantine" },
      },
      loadLiveDeliveryFees: async () => null,
      telegramOptions: {
        optInEnabled: true,
        loadTelegramCredentials: async () => ({ botToken: "999999:synthetic_bot_secret", chatId: "1234567890", enabled: true }),
        fetchImpl: async () => {
          tgAttempts += 1;
          return jsonResponse({ ok: true });
        },
      },
    });
    assert.equal(dup.duplicate, true);
    assert.equal(dup.syncStatus, "duplicate_skipped");
    assert.equal(dup.orderId, res.orderId);
    assert.equal(tgAttempts, 1, "Telegram MUST NOT fire on duplicate lead");

    // 3. Invalid phone lead MUST be preserved as invalid_phone, create 0 orders, and NEVER fire Telegram
    const inv = await processNormalizedTikTokLead({
      lead: {
        externalLeadId: "tt_lead_badphone_004",
        formId: "form_pack2_ar",
        advertiserId: "700111222",
        fields: { full_name: "Test Invalid", phone_number: "021334455", wilaya: "Alger" },
      },
      loadLiveDeliveryFees: async () => null,
      telegramOptions: {
        optInEnabled: true,
        loadTelegramCredentials: async () => ({ botToken: "999999:synthetic_bot_secret", chatId: "1234567890", enabled: true }),
        fetchImpl: async () => {
          tgAttempts += 1;
          return jsonResponse({ ok: true });
        },
      },
    });
    assert.equal(inv.syncStatus, "invalid_phone");
    assert.equal(inv.orderId, null);
    assert.equal(tgAttempts, 1, "Telegram MUST NOT fire on invalid lead");

    const badLeadRow = (
      await pg.query<any>(`SELECT * FROM public.tiktok_leads WHERE external_lead_id = 'tt_lead_badphone_004'`)
    ).rows[0];
    assert.equal(badLeadRow.sync_status, "invalid_phone");
    assert.equal(badLeadRow.phone_valid, false);
  });

  await runTest("Direct createPendingOrderFromTikTokLead() enforces idempotency_key deduplication without duplicates", async () => {
    const mapping = (
      await pg.query<any>(`SELECT * FROM public.tiktok_form_product_mappings WHERE form_id = 'form_pack2_ar'`)
    ).rows[0];
    const lead = {
      externalLeadId: "tt_direct_idemp_005",
      formId: "form_pack2_ar",
      advertiserId: "700111222",
      fields: { full_name: "Mourad Saidi", phone_number: "0555223344", wilaya: "Oran" },
    };
    const normalized = normalizeLeadFields(lead.fields);

    const first = await createPendingOrderFromTikTokLead({
      lead,
      normalized,
      mapping,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });
    const second = await createPendingOrderFromTikTokLead({
      lead,
      normalized,
      mapping,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.orderId, first.orderId);

    const cnt = await pg.query<{ count: string }>(
      `SELECT count(*) FROM public.orders WHERE idempotency_key = 'tiktok_lead_tt_direct_idemp_005'`,
    );
    assert.equal(Number(cnt.rows[0].count), 1);
  });

  // ── 6. CSV, ZIP, ASYNC POLLING, WEBHOOK, RETRY & CONCURRENCY TESTS ─────────
  console.log("6. CSV/ZIP Extraction, Async Task Polling, Webhook Signature, Retry & Concurrency");

  await runTest("Parses RFC-4180 UTF-8 CSV (BOM + Arabic/French quoted commas) & decompresses real DEFLATE ZIP archives with zip-bomb guard", async () => {
    const csvSample =
      "\uFEFFlead_id,created_time,campaign_name,الاسم الكامل,رقم الهاتف,الولاية,العنوان\r\n" +
      'tt_zip_001,2026-11-19T10:00:00Z,Winter_Promo,"خالد, بن يوسف",+213551223344,19 - سطيف,"حي 500 مسكن, عمارة 4"\r\n';

    const directCsvLeads = parseTikTokLeadsCsv(csvSample, { formId: "form_pack2_ar", advertiserId: "700111222" });
    assert.equal(directCsvLeads.length, 1);
    assert.equal(directCsvLeads[0].externalLeadId, "tt_zip_001");
    assert.equal(directCsvLeads[0].fields["الاسم الكامل"], "خالد, بن يوسف");
    assert.equal(directCsvLeads[0].fields["العنوان"], "حي 500 مسكن, عمارة 4");

    const zipBuf = buildTestZipBuffer([{ name: "leads_part1.csv", content: csvSample, method: 8 }]);
    const unpacked = extractCsvFilesFromZipBuffer(zipBuf);
    assert.equal(unpacked.length, 1);
    assert.equal(unpacked[0].fileName, "leads_part1.csv");

    const extractedFromZip = await extractLeadsFromDownloadedExport({
      contentType: "application/zip",
      body: zipBuf,
      formId: "form_pack2_ar",
      advertiserId: "700111222",
    });
    assert.equal(extractedFromZip.length, 1);
    assert.equal(extractedFromZip[0].externalLeadId, "tt_zip_001");

    // Path traversal inside ZIP rejected
    const evilZip = buildTestZipBuffer([{ name: "../etc/passwd.csv", content: csvSample, method: 0 }]);
    assert.throws(
      () => extractCsvFilesFromZipBuffer(evilZip),
      (err: unknown) => err instanceof TikTokApiError && err.category === "RESPONSE_VALIDATION_ERROR",
    );

    // SSRF guard on untrusted file_url in JSON export
    await assert.rejects(
      () =>
        extractLeadsFromDownloadedExport({
          contentType: "application/json",
          body: Buffer.from(JSON.stringify({ file_url: "https://evil.example.com/leads.csv" })),
          formId: "form_pack2_ar",
          advertiserId: "700111222",
        }),
      (err: unknown) => err instanceof TikTokApiError && err.category === "RESPONSE_VALIDATION_ERROR",
    );
  });

  await runTest("Verifies TikTok-Signature HMAC-SHA256 header and processes signed webhook lead payload", async () => {
    const webhookSecret = "whsec_synthetic_test_key_556677";
    const nowSec = 1_763_580_000;
    const webhookPayload = {
      event: "LEAD",
      timestamp: nowSec,
      advertiser_id: "700111222",
      data: {
        lead_id: "tt_webhook_live_006",
        form_id: "form_pack2_ar",
        campaign_id: "camp_wh_22",
        campaign_name: "TikTok_Live_Leads",
        lead_info: [
          { field_name: "Nom complet", field_value: "Farid Meziane" },
          { field_name: "Téléphone", field_value: "0771998877" },
          { field_name: "Wilaya", field_value: "07 - Biskra" },
        ],
      },
    };
    const rawBody = JSON.stringify(webhookPayload);
    const sigHex = crypto
      .createHmac("sha256", webhookSecret)
      .update(`${nowSec}.${rawBody}`, "utf8")
      .digest("hex");

    const okSig = verifyTikTokWebhookSignature({
      rawBody,
      signatureHeader: `t=${nowSec},s=${sigHex}`,
      secret: webhookSecret,
      nowSec: nowSec + 10,
    });
    assert.equal(okSig.valid, true);

    // Replayed timestamp (>300s old) rejected
    const expiredSig = verifyTikTokWebhookSignature({
      rawBody,
      signatureHeader: `t=${nowSec},s=${sigHex}`,
      secret: webhookSecret,
      nowSec: nowSec + 400,
    });
    assert.equal(expiredSig.valid, false);

    // Tampered body rejected
    const badBodySig = verifyTikTokWebhookSignature({
      rawBody: `${rawBody} `,
      signatureHeader: `t=${nowSec},s=${sigHex}`,
      secret: webhookSecret,
      nowSec: nowSec + 10,
    });
    assert.equal(badBodySig.valid, false);

    // Process webhook lead event
    const parsedLeads = extractLeadsFromWebhookPayload(webhookPayload);
    assert.equal(parsedLeads.length, 1);

    const whResult = await processWebhookLeadEvent({
      payload: webhookPayload,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });
    assert.equal(whResult.status, "success");
    assert.equal(whResult.ordersCreated, 1);
    assert.equal(whResult.leadsFailed, 0);
  });

  await runTest("Polls async TikTok export task with exponential backoff, downloads ZIP, syncs leads & records tiktok_sync_logs", async () => {
    const delays: number[] = [];
    let pollStep = 0;

    const zipBody = buildTestZipBuffer([
      {
        name: "export.csv",
        content:
          "lead_id,created_time,الاسم الكامل,رقم الهاتف,الولاية\n" +
          "tt_async_007,2026-11-19T11:00:00Z,بلال زروقي,0550334455,23 - عنابة\n" +
          "tt_webhook_live_006,2026-11-19T11:05:00Z,Farid Meziane,0771998877,07 - Biskra\n", // duplicate from webhook!
      },
    ]);

    const asyncClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url, init) => {
        const urlStr = String(url);
        if (urlStr.includes("/page/lead/task/download/")) {
          return new Response(new Uint8Array(zipBody), {
            status: 200,
            headers: { "content-type": "application/zip" },
          });
        }
        if (urlStr.includes("/page/lead/task/")) {
          const body = JSON.parse(String(init?.body || "{}"));
          if (!body.task_id) {
            return jsonResponse({ code: 0, message: "OK", data: { task_id: "task_99001", status: "PROCESSING" } });
          }
          pollStep += 1;
          return jsonResponse({
            code: 0,
            message: "OK",
            data: { task_id: "task_99001", status: pollStep < 2 ? "RUNNING" : "SUCCEED" },
          });
        }
        throw new Error(`Unexpected URL: ${urlStr}`);
      },
    });

    const summary = await syncFormLeads({
      advertiserId: "700111222",
      formId: "form_pack2_ar",
      triggerSource: "manual",
      client: asyncClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
      pollMaxAttempts: 4,
      pollBaseDelayMs: 500,
      sleepImpl: async (ms) => {
        delays.push(ms);
      },
    });

    assert.deepEqual(delays, [500, 1000]);
    assert.equal(summary.leadsFetched, 2);
    assert.equal(summary.ordersCreated, 1);
    assert.equal(summary.duplicatesSkipped, 1);
    assert.equal(summary.leadsFailed, 0);
    assert.equal(summary.status, "success");
    assert.ok(summary.logId);

    // Failed async task throws non-retryable TikTokApiError
    const failingTaskClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async () => jsonResponse({ code: 0, message: "OK", data: { task_id: "task_fail", status: "FAILED" } }),
    });
    await assert.rejects(
      () =>
        pollLeadExportTask({
          accessToken: "tok",
          advertiserId: "700111222",
          pageId: "form_pack2_ar",
          taskId: "task_fail",
          baseDelayMs: 0,
          sleepImpl: noSleep,
          client: failingTaskClient,
        }),
      (err: unknown) => err instanceof TikTokApiError && err.retryable === false,
    );
  });

  await runTest("Preserves unmapped leads and recovers them via retryFailedTikTokLeads() once mapped", async () => {
    // Create a new unmapped form in DB
    await pg.query(
      `INSERT INTO public.tiktok_forms (store_id, advertiser_id, form_id, form_name, status, sync_enabled)
       VALUES ('orvastore', '700111222', 'form_late_map', 'Late Mapped Form', 'ACTIVE', false)`,
    );

    const firstTry = await processWebhookLeadEvent({
      payload: {
        event: "LEAD",
        advertiser_id: "700111222",
        data: {
          lead_id: "tt_retry_recover_008",
          form_id: "form_late_map",
          lead_info: [
            { field_name: "full_name", field_value: "Hicham Boudiaf" },
            { field_name: "phone_number", field_value: "0662334455" },
            { field_name: "wilaya", field_value: "09 - Blida" },
          ],
        },
      },
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });
    assert.equal(firstTry.leadsFailed, 1);
    assert.equal(firstTry.ordersCreated, 0);

    const beforeRow = (
      await pg.query<any>(`SELECT sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id = 'tt_retry_recover_008'`)
    ).rows[0];
    assert.equal(beforeRow.sync_status, "unmapped_form");
    assert.equal(beforeRow.order_id, null);

    // Admin maps the form later -> retryFailedTikTokLeads promotes lead to order_created!
    await saveFormProductMapping({
      formId: "form_late_map",
      productId: pack2Id,
      defaultWilayaCode: 16,
      defaultDeliveryType: "DOMICILE",
      autoCreateOrder: true,
      syncEnabled: true,
    });

    const retryRes = await retryFailedTikTokLeads({
      leadIds: ["tt_retry_recover_008"],
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });
    assert.equal(retryRes.ordersCreated, 1);
    assert.equal(retryRes.leadsFailed, 0);

    const afterRow = (
      await pg.query<any>(`SELECT sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id = 'tt_retry_recover_008'`)
    ).rows[0];
    assert.equal(afterRow.sync_status, "order_created");
    assert.ok(afterRow.order_id);
  });

  await runTest("Prevents overlapping concurrent form syncs and serializes concurrent duplicate webhook deliveries", async () => {
    __testResetTikTokSyncLocks();

    // 1. Overlapping syncFormLeads() lock check
    let releaseFirstTask!: () => void;
    const taskHold = new Promise<void>((r) => {
      releaseFirstTask = r;
    });

    const slowClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url) => {
        if (String(url).includes("/page/lead/task/download/")) {
          return new Response("lead_id,full_name,phone_number\n", {
            status: 200,
            headers: { "content-type": "text/csv" },
          });
        }
        await taskHold;
        return jsonResponse({ code: 0, message: "OK", data: { task_id: "task_conc_1", status: "SUCCEED" } });
      },
    });

    const p1 = syncFormLeads({
      advertiserId: "700111222",
      formId: "form_pack2_ar",
      client: slowClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });

    // Wait a tick so p1 acquires lock
    await new Promise((r) => setTimeout(r, 15));

    const p2 = await syncFormLeads({
      advertiserId: "700111222",
      formId: "form_pack2_ar",
      client: slowClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });
    assert.equal(p2.skippedConcurrent, true);

    releaseFirstTask();
    const res1 = await p1;
    assert.equal(res1.status, "success");

    // 2. Concurrent duplicate webhook events for the exact same external_lead_id produce exactly 1 order
    const concurrentPayload = {
      event: "LEAD",
      advertiser_id: "700111222",
      data: {
        lead_id: "tt_concurrent_race_009",
        form_id: "form_pack2_ar",
        lead_info: [
          { field_name: "full_name", field_value: "Salim Khelifi" },
          { field_name: "phone_number", field_value: "0559112233" },
          { field_name: "wilaya", field_value: "31 - Oran" },
        ],
      },
    };

    const [c1, c2, c3] = await Promise.all([
      processWebhookLeadEvent({
        payload: concurrentPayload,
        loadLiveDeliveryFees: async () => null,
        telegramOptions: { optInEnabled: false },
      }),
      processWebhookLeadEvent({
        payload: concurrentPayload,
        loadLiveDeliveryFees: async () => null,
        telegramOptions: { optInEnabled: false },
      }),
      processWebhookLeadEvent({
        payload: concurrentPayload,
        loadLiveDeliveryFees: async () => null,
        telegramOptions: { optInEnabled: false },
      }),
    ]);

    assert.equal(c1.ordersCreated + c2.ordersCreated + c3.ordersCreated, 1);
    assert.equal(c1.duplicatesSkipped + c2.duplicatesSkipped + c3.duplicatesSkipped, 2);

    const raceOrderCount = await pg.query<{ count: string }>(
      `SELECT count(*) FROM public.orders WHERE idempotency_key = 'tiktok_lead_tt_concurrent_race_009'`,
    );
    assert.equal(Number(raceOrderCount.rows[0].count), 1);
  });

  await runTest("Runs syncEnabledForms(), reconcileHistoricalLeads() (clamped <= 90d), logs upstream failures, and disconnects cleanly", async () => {
    // Failure logging test: upstream 40105 writes failed sync log & marks connection token_expired
    const expiredClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async () => jsonResponse({ code: 40105, message: "Access token expired or revoked" }),
    });

    await assert.rejects(
      () =>
        syncFormLeads({
          advertiserId: "700111222",
          formId: "form_pack2_ar",
          client: expiredClient,
          tokenManager,
          configOverrides: TEST_OAUTH_CONFIG,
        }),
      (err: unknown) => err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED",
    );

    const connAfterFail = await tokenManager.getPublicConnection("orvastore");
    assert.equal(connAfterFail?.status, "revoked");

    const failedLogs = await pg.query<{ status: string }>(
      `SELECT status FROM public.tiktok_sync_logs WHERE status = 'failed'`,
    );
    assert.ok(failedLogs.rows.length >= 1);

    // Reconnect fresh token & test syncEnabledForms + reconcileHistoricalLeads clamping >90d -> 90d
    await tokenManager.saveConnectionTokens({
      storeId: "orvastore",
      appId: TEST_OAUTH_CONFIG.appId,
      accessToken: "synthetic_reconnected_token",
      selectedAdvertiserId: "700111222",
    });

    const emptyCsvClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url) => {
        if (String(url).includes("/page/lead/task/download/")) {
          return new Response("lead_id,full_name,phone_number\n", {
            status: 200,
            headers: { "content-type": "text/csv" },
          });
        }
        return jsonResponse({ code: 0, message: "OK", data: { task_id: "task_hist_1", status: "SUCCEED" } });
      },
    });

    const enabledRes = await syncEnabledForms({
      client: emptyCsvClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });
    assert.equal(enabledRes.formsSynced, 3);
    assert.equal(enabledRes.totals.status, "success");

    const reconRes = await reconcileHistoricalLeads({
      lookbackDays: 365, // Must clamp to TikTok 90-day retention cap
      client: emptyCsvClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
      loadLiveDeliveryFees: async () => null,
      telegramOptions: { optInEnabled: false },
    });
    assert.equal(reconRes.lookbackDays, 90);
    assert.equal(reconRes.formsProcessed, 3);

    // Disconnect revokes upstream & purges DB connection cleanly
    const revokeCapture: { payload: Record<string, unknown> | null } = { payload: null };
    const revokeClient = new TikTokApiClient({
      logger: silentLogger,
      sleepImpl: noSleep,
      fetchImpl: async (url, init) => {
        assert.ok(String(url).endsWith("/open_api/v1.3/oauth2/revoke_token/"));
        revokeCapture.payload = JSON.parse(String(init?.body || "{}"));
        return jsonResponse({ code: 0, message: "OK", data: {} });
      },
    });

    const disc = await disconnectTikTokAccount({
      client: revokeClient,
      tokenManager,
      configOverrides: TEST_OAUTH_CONFIG,
    });
    assert.equal(disc.disconnected, true);
    assert.equal(disc.upstreamRevoked, true);
    assert.equal(revokeCapture.payload?.access_token, "synthetic_reconnected_token");
    assert.equal(await tokenManager.getPublicConnection("orvastore"), null);
  });

  __testResetSupabaseServerInstance();
  await pg.close();

  console.log(`\nPhase A2 Suite Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Phase A2 verification runner crashed:", err);
  process.exit(1);
});
