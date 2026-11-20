/**
 * ORVA Store — TikTok Lead Generation Integration
 * Phase 4: Environment Preparation, Security Hardening & 21-Scenario Readiness Suite
 *
 * Covers every mandatory Phase 4 scenario plus amended corrections:
 * - Centralized 5-mode env contract & explicit NODE_ENV / TIKTOK_ENV / TIKTOK_SANDBOX_MODE conflict matrix
 * - Configurable unverified constraints (TIKTOK_STRICT_NUMERIC_APP_ID, TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET)
 * - Unmocked outbound network block in test / mocked_sandbox modes
 * - Two-tier webhook sliding-window rate limiter (spoof-resistant x-forwarded-for handling, 429 + Retry-After)
 * - Concurrency-safe webhook replay protection (primary DB idempotency, no premature replayed:true in-flight,
 *   503 uncached on transient DB outage, post-completion optimization cache on subsequent sequential replay)
 * - All 21 security, OAuth, webhook, lead normalization, Wilaya 49-58, address, recovery, redaction,
 *   Redex isolation & Meta CAPI isolation checks against isolated PGlite PostgreSQL.
 *
 * Run: npx tsx tests/integrations/tiktok-env-readiness.test.ts
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";

import {
  SESSION_COOKIE_NAME,
  __testResetLocalRevocationCache,
  generateSessionToken,
} from "../../src/lib/auth/admin-auth";
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../../src/lib/supabase/server";
import {
  assertValidTikTokEnvironmentMode,
  resolveTikTokEnvironmentMode,
  validateTikTokAppId,
  validateTikTokEnvironment,
} from "../../src/lib/integrations/tiktok/env";
import { TikTokApiClient } from "../../src/lib/integrations/tiktok/client";
import {
  TIKTOK_OAUTH_STATE_COOKIE_NAME,
  generateOAuthState,
  getTikTokConfigurationReadiness,
  resolveTikTokOAuthConfig,
  verifyOAuthState,
} from "../../src/lib/integrations/tiktok/oauth";
import {
  TikTokTokenManager,
  encryptTikTokToken,
} from "../../src/lib/integrations/tiktok/token-manager";
import { MISSING_ADDRESS_CONFIRMATION_NOTE } from "../../src/lib/integrations/tiktok/leads";
import { __testResetTikTokSyncLocks } from "../../src/lib/integrations/tiktok/sync";
import { redactSensitiveForLog } from "../../src/lib/integrations/tiktok/types";

import {
  GET as connectGET,
  POST as connectPOST,
} from "../../src/app/api/integrations/tiktok/connect/route";
import { GET as callbackGET } from "../../src/app/api/integrations/tiktok/callback/route";
import { GET as accountsGET } from "../../src/app/api/integrations/tiktok/accounts/route";
import { GET as formsGET } from "../../src/app/api/integrations/tiktok/forms/route";
import { POST as syncPOST } from "../../src/app/api/integrations/tiktok/sync/route";
import {
  GET as webhookGET,
  POST as webhookPOST,
} from "../../src/app/api/integrations/tiktok/webhook/route";
import { __testResetTikTokWebhookGuards } from "../../src/app/api/integrations/tiktok/_lib/webhook-guards";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261111_000001_consolidated_clean_rebuild.sql");
const FEES_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261111_000002_delivery_fees.sql");
const ATTR_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261117_000005_order_attribution_and_profitability.sql");
const TIKTOK_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261119_000001_tiktok_lead_generation.sql");

const CANONICAL_ORIGIN = "https://orva-store.com";
const CANONICAL_HOST = "orva-store.com";
const TEST_APP_ID = "7488990011223344";
const TEST_APP_SECRET = "tt_readiness_app_secret_synthetic_99887766";
const TEST_WEBHOOK_SECRET = "whsec_readiness_synthetic_secret_44556677";
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
const TEST_CRON_SECRET = "cron_readiness_synthetic_secret_min_32_chars_ok";
const TEST_REDIRECT_URI = `${CANONICAL_ORIGIN}/api/integrations/tiktok/callback/`;

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
          if (returning) sql += " RETURNING *";
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
      in(col: string, val: unknown[]) {
        filters.push({ col, op: "IN", val });
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

function makeRequest(
  urlPath: string,
  options: {
    method?: string;
    sessionToken?: string | null;
    bearerToken?: string | null;
    origin?: string | null;
    host?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {},
): NextRequest {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  headers.set("host", options.host ?? CANONICAL_HOST);

  if (options.origin !== null) {
    headers.set("origin", options.origin ?? CANONICAL_ORIGIN);
  }
  if (options.bearerToken) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
  }

  const cookieParts: string[] = [];
  if (options.sessionToken) {
    cookieParts.push(`${SESSION_COOKIE_NAME}=${options.sessionToken}`);
  }
  if (options.cookies) {
    for (const [k, v] of Object.entries(options.cookies)) {
      cookieParts.push(`${k}=${v}`);
    }
  }
  if (cookieParts.length > 0) {
    headers.set("cookie", cookieParts.join("; "));
  }

  let bodyStr = options.rawBody;
  if (bodyStr === undefined && options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }

  return new NextRequest(`${CANONICAL_ORIGIN}${urlPath}`, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : bodyStr,
  });
}

function signWebhook(rawBody: string, secret: string, tsSec: number): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${tsSec}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${tsSec},s=${sig}`;
}

function assertNoSecretLeakage(payload: unknown, secrets: string[], context: string): void {
  const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const s of secrets) {
    assert.equal(
      serialized.includes(s),
      false,
      `${context} leaked sensitive value substring`,
    );
  }
}

async function runSuite() {
  console.log("\n================================================================================");
  console.log("   ORVA STORE — TIKTOK INTEGRATION ENVIRONMENT READINESS SUITE (21+ SCENARIOS)");
  console.log("================================================================================\n");

  const savedEnv = { ...process.env };
  const pg = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  const originalFetch = globalThis.fetch;

  let activeProductUuid = "";
  let archivedProductUuid = "";
  const outboundUrls: string[] = [];

  try {
    // Initialize isolated PGlite PostgreSQL roles + ORVA baseline + attribution + TikTok migrations
    await pg.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
    `);
    await pg.exec(fs.readFileSync(BASELINE_SQL, "utf8"));
    await pg.exec(fs.readFileSync(FEES_SQL, "utf8"));
    await pg.exec(fs.readFileSync(ATTR_SQL, "utf8"));
    await pg.exec(fs.readFileSync(TIKTOK_SQL, "utf8"));

    // Read seeded Pack 1 product + seed 1 archived product using real schema columns
    activeProductUuid = (
      await pg.query<{ id: string }>(`SELECT id FROM public.products WHERE slug = 'pack1' LIMIT 1`)
    ).rows[0].id;
    archivedProductUuid = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.products (slug, sku, name, base_price, status, stock_quantity)
         VALUES ('pack-arch-readiness', 'SKU-ARCH-RDY', 'Archived Kit', 3500, 'ARCHIVED', 0)
         RETURNING id`,
      )
    ).rows[0].id;

    // Seed cached delivery_fees for wilaya 16 (Alger), 51 (Ouled Djellal — Southern), and 7 (Biskra)
    await pg.query(
      `INSERT INTO public.delivery_fees (wilaya_id, service_type, tarif_domicile, tarif_stopdesk)
       VALUES
         (16, 'ecotrack', 500, 300),
         (51, 'ecotrack', 950, 600),
         (7, 'ecotrack', 700, 450)
       ON CONFLICT (wilaya_id, service_type) DO UPDATE
       SET tarif_domicile = EXCLUDED.tarif_domicile, tarif_stopdesk = EXCLUDED.tarif_stopdesk`,
    );

    __testSetSupabaseServerInstance(createPgliteSupabaseAdapter(pg) as any);
    __testResetLocalRevocationCache();
    __testResetTikTokSyncLocks();
    __testResetTikTokWebhookGuards();

    // Baseline admin env
    process.env.ADMIN_JWT_SECRET = "readiness_admin_jwt_secret_synthetic_32chars";
    process.env.APP_URL = CANONICAL_ORIGIN;
    process.env.NEXT_PUBLIC_APP_URL = CANONICAL_ORIGIN;
    delete process.env.TIKTOK_ENV;
    delete process.env.TIKTOK_SANDBOX_MODE;
    delete process.env.TIKTOK_STRICT_NUMERIC_APP_ID;
    delete process.env.TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET;
    delete process.env.TIKTOK_TRUSTED_IP_HEADER;
    delete process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const adminToken = generateSessionToken();

    // Mock global fetch so zero real outbound requests ever escape
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      outboundUrls.push(url);
      return new Response(JSON.stringify({ code: 0, message: "OK", data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    // ── Scenario 1: Missing TikTok credentials ────────────────────────────────
    await runTest("01. Missing TikTok credentials produce NOT_CONFIGURED and fail-closed /connect/", async () => {
      delete process.env.TIKTOK_APP_ID;
      delete process.env.TIKTOK_APP_SECRET;
      delete process.env.TIKTOK_REDIRECT_URI;
      delete process.env.TIKTOK_WEBHOOK_SECRET;
      delete process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;

      const report = validateTikTokEnvironment({
        appId: "",
        appSecret: "",
        redirectUri: "",
        encryptionKey: "",
        nodeEnv: "development",
      });
      assert.equal(report.configurationStatus, "NOT_CONFIGURED");
      assert.equal(report.configured, false);
      assert.deepEqual(report.missingKeys, [
        "TIKTOK_APP_ID",
        "TIKTOK_APP_SECRET",
        "TIKTOK_REDIRECT_URI",
        "TIKTOK_TOKEN_ENCRYPTION_KEY",
      ]);

      const connRes = await connectGET(makeRequest("/api/integrations/tiktok/connect/", { sessionToken: adminToken }));
      assert.equal(connRes.status, 200);
      const connJson = await connRes.json();
      assert.equal(connJson.readiness.configurationStatus, "NOT_CONFIGURED");
      assert.equal(connJson.readiness.configured, false);

      const startRes = await connectPOST(
        makeRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "start" },
        }),
      );
      assert.equal(startRes.status, 400);
    });

    // ── Scenario 2: Invalid App ID format ─────────────────────────────────────
    await runTest("02. Invalid & placeholder App IDs fail as MISCONFIGURED; strict numeric is configurable", () => {
      const badSpaces = validateTikTokAppId("app with spaces");
      assert.equal(badSpaces.valid, false);
      assert.equal(badSpaces.issue?.code, "APP_ID_INVALID_FORMAT");

      const placeholder = validateTikTokAppId("your_tiktok_app_id");
      assert.equal(placeholder.valid, false);
      assert.equal(placeholder.issue?.code, "APP_ID_PLACEHOLDER");

      const nonNumericAdvisory = validateTikTokAppId("tt_alpha_app_01", { strictNumeric: false });
      assert.equal(nonNumericAdvisory.valid, true);
      assert.ok(nonNumericAdvisory.warning?.includes("REQUIRES VERIFICATION"));

      const nonNumericStrict = validateTikTokAppId("tt_alpha_app_01", { strictNumeric: true });
      assert.equal(nonNumericStrict.valid, false);
      assert.equal(nonNumericStrict.issue?.code, "APP_ID_NOT_NUMERIC");

      const report = validateTikTokEnvironment({
        environmentMode: "production",
        appId: "bad!app@id",
        appSecret: TEST_APP_SECRET,
        redirectUri: TEST_REDIRECT_URI,
        encryptionKey: TEST_ENCRYPTION_KEY,
        webhookSecret: TEST_WEBHOOK_SECRET,
      });
      assert.equal(report.configurationStatus, "MISCONFIGURED");
      assert.equal(report.appIdValid, false);
      assert.equal(report.configured, false);
    });

    // ── Scenario 3: Missing & Malformed Encryption Key ────────────────────────
    await runTest("03. Missing encryption key -> NOT_CONFIGURED; malformed/low-entropy key -> MISCONFIGURED", () => {
      const missingKeyReport = validateTikTokEnvironment({
        appId: TEST_APP_ID,
        appSecret: TEST_APP_SECRET,
        redirectUri: TEST_REDIRECT_URI,
        encryptionKey: "",
      });
      assert.equal(missingKeyReport.configurationStatus, "NOT_CONFIGURED");
      assert.ok(missingKeyReport.missingKeys.includes("TIKTOK_TOKEN_ENCRYPTION_KEY"));
      assert.equal(missingKeyReport.encryptionKeyValid, false);

      const weakKeyReport = validateTikTokEnvironment({
        appId: TEST_APP_ID,
        appSecret: TEST_APP_SECRET,
        redirectUri: TEST_REDIRECT_URI,
        encryptionKey: "0".repeat(64),
      });
      assert.equal(weakKeyReport.configurationStatus, "MISCONFIGURED");
      assert.equal(weakKeyReport.encryptionKeyValid, false);
      assert.ok(weakKeyReport.configurationErrors.some((e) => e.code === "ENCRYPTION_KEY_INVALID"));

      assert.throws(() => encryptTikTokToken("act_sample_token", ""));
    });

    // Activate valid sandbox test env for route/OAuth/lead tests
    process.env.TIKTOK_ENV = "tiktok_sandbox";
    process.env.TIKTOK_SANDBOX_MODE = "true";
    process.env.TIKTOK_APP_ID = TEST_APP_ID;
    process.env.TIKTOK_APP_SECRET = TEST_APP_SECRET;
    process.env.TIKTOK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.TIKTOK_REDIRECT_URI = TEST_REDIRECT_URI;
    process.env.TIKTOK_SYNC_CRON_SECRET = TEST_CRON_SECRET;

    // ── Scenario 4 & 5: Invalid OAuth State & Expired OAuth State ─────────────
    await runTest("04 & 05. Invalid OAuth state & expired (>10m) OAuth state rejected cleanly", async () => {
      const t0 = Date.UTC(2026, 10, 20, 12, 0, 0);
      const { state } = generateOAuthState({ storeId: "orvastore", actor: "admin", nowMs: t0 });

      // Tampered HMAC signature
      const tampered = `${state.slice(0, -3)}XYZ`;
      assert.equal(verifyOAuthState(tampered, { expectedCookieState: tampered, nowMs: t0 + 1000 }).valid, false);

      // Cookie mismatch
      const other = generateOAuthState({ storeId: "orvastore", actor: "admin", nowMs: t0 });
      assert.equal(verifyOAuthState(state, { expectedCookieState: other.state, nowMs: t0 + 1000 }).valid, false);

      // Expired > 10 minutes
      const expired = verifyOAuthState(state, {
        expectedCookieState: state,
        nowMs: t0 + 11 * 60 * 1000,
      });
      assert.equal(expired.valid, false);
      assert.ok((expired.reason || "").toLowerCase().includes("expired"));

      // Route callback without HTML Accept returns fail-closed 403 JSON; with Accept: text/html redirects 302 to invalid_state
      const cbJsonRes = await callbackGET(
        makeRequest(`/api/integrations/tiktok/callback/?auth_code=code_123&state=${encodeURIComponent(tampered)}`, {
          sessionToken: adminToken,
          cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: tampered },
        }),
      );
      assert.equal(cbJsonRes.status, 403);

      const cbHtmlRes = await callbackGET(
        makeRequest(`/api/integrations/tiktok/callback/?auth_code=code_123&state=${encodeURIComponent(tampered)}`, {
          sessionToken: adminToken,
          cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: tampered },
          headers: { accept: "text/html" },
        }),
      );
      assert.equal(cbHtmlRes.status, 302);
      const loc = cbHtmlRes.headers.get("location") || "";
      assert.ok(loc.includes("tiktok_status=error") && loc.includes("tiktok_error=invalid_state"));
    });

    // Seed authorized advertiser + mapped form in isolated PGlite DB
    const tokenMgr = new TikTokTokenManager();
    const connDto = await tokenMgr.saveConnectionTokens({
      appId: TEST_APP_ID,
      accessToken: "act_readiness_synthetic_token_xyz",
      refreshToken: "rft_readiness_synthetic_token_abc",
      scopes: [12010100, 12020100],
      selectedAdvertiserId: "780011223344",
    });
    await pg.query(
      `INSERT INTO public.tiktok_ad_accounts (store_id, connection_id, advertiser_id, advertiser_name, is_selected)
       VALUES ('orvastore', $1, '780011223344', 'ORVA Readiness Advertiser', true)`,
      [connDto.id],
    );
    await pg.query(
      `INSERT INTO public.tiktok_forms (store_id, advertiser_id, form_id, form_name, status, sync_enabled)
       VALUES
         ('orvastore', '780011223344', 'form_mapped_ok', 'Mapped Active Form', 'ACTIVE', true),
         ('orvastore', '780011223344', 'form_unmapped_1', 'Unmapped Form', 'ACTIVE', false),
         ('orvastore', '780011223344', 'form_archived_prod', 'Archived Product Form', 'ACTIVE', true)`,
    );
    await pg.query(
      `INSERT INTO public.tiktok_form_product_mappings (store_id, form_id, product_id, pack_id, product_name, product_price, default_wilaya_code, default_delivery_type, auto_create_order)
       VALUES
         ('orvastore', 'form_mapped_ok', $1, 'PACK1', 'ORVA Pack 1 Pro', 4950, 16, 'DOMICILE', true),
         ('orvastore', 'form_archived_prod', $2, 'PACK1', 'Archived Kit', 3500, 16, 'DOMICILE', true)`,
      [activeProductUuid, archivedProductUuid],
    );

    // ── Scenario 6: Invalid Webhook Signature ─────────────────────────────────
    await runTest("06. Invalid, missing, or tampered webhook signatures return HTTP 401 with zero DB writes", async () => {
      __testResetTikTokWebhookGuards();
      const body = JSON.stringify({ event: "LEAD", advertiser_id: "780011223344", page_id: "form_mapped_ok", lead_id: "bad_sig_lead" });
      const nowSec = Math.floor(Date.now() / 1000);

      const missingHeader = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", { method: "POST", origin: null, rawBody: body }),
      );
      assert.equal(missingHeader.status, 401);

      const wrongSecret = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: { "tiktok-signature": signWebhook(body, "wrong_secret_value_000000", nowSec) },
        }),
      );
      assert.equal(wrongSecret.status, 401);

      const tamperedBody = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body.replace("bad_sig_lead", "tampered_id"),
          headers: { "tiktok-signature": signWebhook(body, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(tamperedBody.status, 401);

      const leadRows = await pg.query("SELECT id FROM public.tiktok_leads WHERE external_lead_id = 'bad_sig_lead'");
      assert.equal(leadRows.rows.length, 0);
    });

    // ── Scenario 7: Replay Protection, Concurrency Safety & Two-Tier Rate Limiting ─
    await runTest("07. Webhook expired timestamp (401), concurrency-safe replay cache & spoof-resistant rate limit (429)", async () => {
      __testResetTikTokWebhookGuards();
      const body = JSON.stringify({
        event: "LEAD",
        advertiser_id: "780011223344",
        page_id: "form_mapped_ok",
        lead_id: "lead_replay_check_01",
        field_data: [
          { field_name: "full_name", field_value: "Amine Replay" },
          { field_name: "phone_number", field_value: "0550112233" },
          { field_name: "wilaya", field_value: "16" },
        ],
      });
      const nowSec = Math.floor(Date.now() / 1000);

      // 7a. Expired timestamp (> 300s) -> 401
      const expiredRes = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: { "tiktok-signature": signWebhook(body, TEST_WEBHOOK_SECRET, nowSec - 600) },
        }),
      );
      assert.equal(expiredRes.status, 401);

      // 7b. Transient DB error must NOT be cached in memory -> 503, allowing clean retry recovery once DB returns
      const sig = signWebhook(body, TEST_WEBHOOK_SECRET, nowSec);
      const makeFailingChain = () => {
        const failRes = { data: null, error: { code: "08006", message: "Simulated transient PG failure" } };
        const chain: any = {
          select: () => chain,
          insert: () => chain,
          upsert: () => chain,
          update: () => chain,
          delete: () => chain,
          eq: () => chain,
          in: () => chain,
          order: () => chain,
          limit: () => chain,
          single: async () => failRes,
          maybeSingle: async () => failRes,
          then: (resolve: any, reject: any) => Promise.resolve(failRes).then(resolve, reject),
        };
        return chain;
      };
      const failingAdapter = { from: () => makeFailingChain() };
      __testSetSupabaseServerInstance(failingAdapter as any);
      try {
        const dbErrRes = await webhookPOST(
          makeRequest("/api/integrations/tiktok/webhook/", {
            method: "POST",
            origin: null,
            rawBody: body,
            headers: { "tiktok-signature": sig },
          }),
        );
        assert.equal(dbErrRes.status, 503);
      } finally {
        // Restore PGlite adapter unconditionally so later tests never see failingAdapter
        __testSetSupabaseServerInstance(createPgliteSupabaseAdapter(pg) as any);
      }

      // Retry with SAME signature succeeds and creates the order (proves 503 was NOT cached!)
      const recoveredFirst = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: { "tiktok-signature": sig },
        }),
      );
      assert.equal(recoveredFirst.status, 200);
      const firstJson = await recoveredFirst.json();
      assert.equal(firstJson.summary.ordersCreated, 1);

      // 7c. Subsequent sequential replay within 300s hits post-completion optimization cache (200, replayed: true)
      const seqReplay = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: { "tiktok-signature": sig },
        }),
      );
      assert.equal(seqReplay.status, 200);
      const replayJson = await seqReplay.json();
      assert.equal(replayJson.replayed, true);
      assert.equal(replayJson.summary.ordersCreated, 0);
      assert.equal(replayJson.summary.duplicatesSkipped, 1);

      // 7d. Concurrent identical deliveries serialize via withLeadProcessingLock & NEVER prematurely return replayed:true
      const raceBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "780011223344",
        page_id: "form_mapped_ok",
        lead_id: "lead_concurrent_replay_02",
        field_data: [
          { field_name: "full_name", field_value: "Karim Concurrent" },
          { field_name: "phone_number", field_value: "0661223344" },
          { field_name: "wilaya", field_value: "16" },
        ],
      });
      const raceSig = signWebhook(raceBody, TEST_WEBHOOK_SECRET, nowSec);
      const [r1, r2] = await Promise.all([
        webhookPOST(makeRequest("/api/integrations/tiktok/webhook/", { method: "POST", origin: null, rawBody: raceBody, headers: { "tiktok-signature": raceSig } })),
        webhookPOST(makeRequest("/api/integrations/tiktok/webhook/", { method: "POST", origin: null, rawBody: raceBody, headers: { "tiktok-signature": raceSig } })),
      ]);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      const j1 = await r1.json();
      const j2 = await r2.json();
      assert.equal(Boolean(j1.replayed) || Boolean(j2.replayed), false);
      assert.equal(j1.summary.ordersCreated + j2.summary.ordersCreated, 1);

      // 7e. Two-tier rate limiter enforces 429 + Retry-After & resists X-Forwarded-For spoofing (both unset and verified modes)
      __testResetTikTokWebhookGuards();
      process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX = "5";
      process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX = "12";
      delete process.env.TIKTOK_TRUSTED_IP_HEADER;
      for (let i = 0; i < 5; i += 1) {
        const okRes = await webhookPOST(
          makeRequest("/api/integrations/tiktok/webhook/", {
            method: "POST",
            origin: null,
            rawBody: body,
            headers: {
              "x-forwarded-for": `198.51.100.${i + 1}`,
              "x-real-ip": `203.0.113.${i + 1}`,
              "tiktok-signature": signWebhook(body, "bad", nowSec),
            },
          }),
        );
        assert.notEqual(okRes.status, 429);
      }
      const blockedUnverifiedRes = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: {
            "x-forwarded-for": "198.51.100.99", // Rotating spoofed IP cannot bypass unattributed bucket when TIKTOK_TRUSTED_IP_HEADER is unset
            "x-real-ip": "203.0.113.99",
            "tiktok-signature": sig,
          },
        }),
      );
      assert.equal(blockedUnverifiedRes.status, 429);
      assert.ok(Number(blockedUnverifiedRes.headers.get("retry-after")) >= 1);

      // When TIKTOK_TRUSTED_IP_HEADER="x-forwarded-for" is explicitly verified, leftmost spoofed IPs still bucket on rightmost hop
      __testResetTikTokWebhookGuards();
      process.env.TIKTOK_TRUSTED_IP_HEADER = "x-forwarded-for";
      for (let i = 0; i < 5; i += 1) {
        const okRes = await webhookPOST(
          makeRequest("/api/integrations/tiktok/webhook/", {
            method: "POST",
            origin: null,
            rawBody: body,
            headers: {
              "x-forwarded-for": `198.51.100.${i + 1}, 10.0.0.1`,
              "tiktok-signature": signWebhook(body, "bad", nowSec),
            },
          }),
        );
        assert.notEqual(okRes.status, 429);
      }
      const blockedVerifiedRes = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: {
            "x-forwarded-for": "203.0.113.99, 10.0.0.1",
            "tiktok-signature": sig,
          },
        }),
      );
      assert.equal(blockedVerifiedRes.status, 429);
      assert.ok(Number(blockedVerifiedRes.headers.get("retry-after")) >= 1);
      delete process.env.TIKTOK_TRUSTED_IP_HEADER;
      delete process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX;
      delete process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX;
      __testResetTikTokWebhookGuards();
    });

    // ── Scenario 8: Duplicate Lead Delivery (Fresh Signature -> DB Idempotency) ──
    await runTest("08. Duplicate lead delivery with fresh signature deduplicates authoritatively via PostgreSQL", async () => {
      const nowSec = Math.floor(Date.now() / 1000) + 1;
      const body = JSON.stringify({
        event: "LEAD",
        advertiser_id: "780011223344",
        page_id: "form_mapped_ok",
        lead_id: "lead_replay_check_01",
        field_data: [
          { field_name: "full_name", field_value: "Amine Replay" },
          { field_name: "phone_number", field_value: "0550112233" },
          { field_name: "wilaya", field_value: "16" },
        ],
      });
      const dupRes = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: { "tiktok-signature": signWebhook(body, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(dupRes.status, 200);
      const dupJson = await dupRes.json();
      assert.equal(dupJson.replayed, undefined);
      assert.equal(dupJson.summary.ordersCreated, 0);
      assert.equal(dupJson.summary.duplicatesSkipped, 1);
      const countRes = await pg.query("SELECT id FROM public.orders WHERE idempotency_key = 'tiktok_lead_lead_replay_check_01'");
      assert.equal(countRes.rows.length, 1);
    });

    // ── Scenario 9 & 10: Missing Phone & Invalid Algerian Phone ───────────────
    await runTest("09 & 10. Missing phone & invalid Algerian phone saved as invalid_phone with zero orders", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const batchBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "780011223344",
        page_id: "form_mapped_ok",
        list: [
          {
            lead_id: "lead_missing_phone_09",
            field_data: [
              { field_name: "full_name", field_value: "No Phone Client" },
              { field_name: "wilaya", field_value: "16" },
            ],
          },
          {
            lead_id: "lead_invalid_phone_10",
            field_data: [
              { field_name: "full_name", field_value: "Fixed Phone Client" },
              { field_name: "phone_number", field_value: "021554433" },
              { field_name: "wilaya", field_value: "16" },
            ],
          },
        ],
      });
      const res = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: batchBody,
          headers: { "tiktok-signature": signWebhook(batchBody, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.summary.ordersCreated, 0);
      assert.equal(json.summary.leadsFailed, 2);

      const saved = await pg.query<{ external_lead_id: string; sync_status: string; order_id: string | null }>(
        "SELECT external_lead_id, sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id IN ('lead_missing_phone_09', 'lead_invalid_phone_10')",
      );
      assert.equal(saved.rows.length, 2);
      assert.ok(saved.rows.every((r) => r.sync_status === "invalid_phone" && r.order_id === null));
    });

    // ── Scenario 11, 12, 13: Unknown Wilaya, Southern STOP_DESK Fallback, Missing Address ─
    await runTest("11, 12 & 13. Unknown wilaya fallback, Southern 49-58 STOP_DESK->DOMICILE & empty street address", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        event: "LEAD",
        advertiser_id: "780011223344",
        page_id: "form_mapped_ok",
        list: [
          {
            lead_id: "lead_unknown_wilaya_11",
            field_data: [
              { field_name: "full_name", field_value: "Unknown Wilaya Buyer" },
              { field_name: "phone_number", field_value: "0770889900" },
              { field_name: "wilaya", field_value: "Atlantis-999" },
            ],
          },
          {
            lead_id: "lead_south_stopdesk_12_13",
            field_data: [
              { field_name: "full_name", field_value: "Youssef South" },
              { field_name: "phone_number", field_value: "0555998877" },
              { field_name: "wilaya", field_value: "51 - اولاد جلال" },
              { field_name: "delivery_method", field_value: "Stop Desk" },
            ],
          },
        ],
      });
      const res = await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: body,
          headers: { "tiktok-signature": signWebhook(body, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.summary.ordersCreated, 2);

      const unknownRow = (
        await pg.query<{ wilaya_code: number; metadata: any }>(
          "SELECT wilaya_code, metadata FROM public.orders WHERE idempotency_key = 'tiktok_lead_lead_unknown_wilaya_11'",
        )
      ).rows[0];
      assert.equal(unknownRow.wilaya_code, 16);
      assert.equal(unknownRow.metadata.wilayaFallbackApplied, true);

      const southRow = (
        await pg.query<{
          wilaya_code: number;
          delivery_method: string;
          delivery_fee: number;
          delivery_address: string;
          notes: string;
          operator_notes: string;
          status: string;
          in_redex: boolean;
          metadata: any;
        }>(
          "SELECT wilaya_code, delivery_method, delivery_fee, delivery_address, notes, operator_notes, status, in_redex, metadata FROM public.orders WHERE idempotency_key = 'tiktok_lead_lead_south_stopdesk_12_13'",
        )
      ).rows[0];
      assert.equal(southRow.wilaya_code, 51);
      assert.equal(southRow.delivery_method, "DOMICILE");
      assert.equal(Number(southRow.delivery_fee), 950);
      assert.equal(southRow.metadata.deliveryTypeFallback.applied, true);
      assert.equal(southRow.delivery_address, "");
      assert.equal(southRow.notes, MISSING_ADDRESS_CONFIRMATION_NOTE);
      assert.equal(southRow.operator_notes, MISSING_ADDRESS_CONFIRMATION_NOTE);
      assert.equal(southRow.status, "pending");
      assert.equal(southRow.in_redex, false);
    });

    // ── Scenario 14, 15, 16: Mapping Failure, Order Creation Failure & Recovery ──
    await runTest("14, 15 & 16. Unmapped form & order_creation_failed leads preserved and recovered cleanly via retry_failed", async () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const unmappedBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "780011223344",
        page_id: "form_unmapped_1",
        lead_id: "lead_unmapped_14",
        field_data: [
          { field_name: "full_name", field_value: "Unmapped Buyer" },
          { field_name: "phone_number", field_value: "0661445566" },
          { field_name: "wilaya", field_value: "7" },
        ],
      });
      const archivedBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "780011223344",
        page_id: "form_archived_prod",
        lead_id: "lead_failed_order_15",
        field_data: [
          { field_name: "full_name", field_value: "Failed Order Buyer" },
          { field_name: "phone_number", field_value: "0771445566" },
          { field_name: "wilaya", field_value: "16" },
        ],
      });

      await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: unmappedBody,
          headers: { "tiktok-signature": signWebhook(unmappedBody, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      await webhookPOST(
        makeRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: archivedBody,
          headers: { "tiktok-signature": signWebhook(archivedBody, TEST_WEBHOOK_SECRET, nowSec + 1) },
        }),
      );

      const statesBefore = await pg.query<{ external_lead_id: string; sync_status: string; order_id: string | null }>(
        "SELECT external_lead_id, sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id IN ('lead_unmapped_14', 'lead_failed_order_15') ORDER BY external_lead_id ASC",
      );
      assert.equal(statesBefore.rows[0].sync_status, "order_creation_failed");
      assert.equal(statesBefore.rows[1].sync_status, "unmapped_form");

      // Remediate both mappings to active Pack 1, then trigger retry_failed
      await pg.query(
        `INSERT INTO public.tiktok_form_product_mappings (store_id, form_id, product_id, pack_id, product_name, product_price, default_wilaya_code, default_delivery_type, auto_create_order)
         VALUES ('orvastore', 'form_unmapped_1', $1, 'PACK1', 'ORVA Pack 1 Pro', 4950, 7, 'DOMICILE', true)`,
        [activeProductUuid],
      );
      await pg.query(
        `UPDATE public.tiktok_form_product_mappings SET product_id = $1 WHERE form_id = 'form_archived_prod'`,
        [activeProductUuid],
      );

      const retryRes = await syncPOST(
        makeRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "retry_failed" },
        }),
      );
      assert.equal(retryRes.status, 200);
      const retryJson = await retryRes.json();
      assert.equal(retryJson.summary.ordersCreated, 2);

      const statesAfter = await pg.query<{ external_lead_id: string; sync_status: string; order_id: string | null }>(
        "SELECT external_lead_id, sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id IN ('lead_unmapped_14', 'lead_failed_order_15')",
      );
      assert.ok(statesAfter.rows.every((r) => r.sync_status === "order_created" && Boolean(r.order_id)));
    });

    // ── Scenario 17: Unauthorized Dashboard Access ────────────────────────────
    await runTest("17. Unauthorized dashboard access rejected with 401 & cross-origin cookie POST rejected with 403", async () => {
      assert.equal((await connectGET(makeRequest("/api/integrations/tiktok/connect/"))).status, 401);
      assert.equal((await accountsGET(makeRequest("/api/integrations/tiktok/accounts/"))).status, 401);
      assert.equal((await formsGET(makeRequest("/api/integrations/tiktok/forms/"))).status, 401);

      const csrfRes = await connectPOST(
        makeRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          origin: "https://evil-attacker.example",
          body: { action: "start" },
        }),
      );
      assert.equal(csrfRes.status, 403);
    });

    // ── Scenario 18: Credential Redaction ─────────────────────────────────────
    await runTest("18. Credential redaction prevents leakage across readiness, logs, errors & endpoints", async () => {
      const secrets = [
        TEST_APP_SECRET,
        TEST_WEBHOOK_SECRET,
        TEST_ENCRYPTION_KEY,
        TEST_CRON_SECRET,
        "act_readiness_synthetic_token_xyz",
        "rft_readiness_synthetic_token_abc",
      ];
      const report = validateTikTokEnvironment();
      const readiness = getTikTokConfigurationReadiness();
      assertNoSecretLeakage(report, secrets, "validateTikTokEnvironment");
      assertNoSecretLeakage(readiness, secrets, "getTikTokConfigurationReadiness");

      const connJson = await (await connectGET(makeRequest("/api/integrations/tiktok/connect/", { sessionToken: adminToken }))).json();
      assertNoSecretLeakage(connJson, secrets, "GET /connect/");

      const whJson = await (await webhookGET(makeRequest("/api/integrations/tiktok/webhook/"))).json();
      assertNoSecretLeakage(whJson, secrets, "GET /webhook/");

      const redacted = redactSensitiveForLog({
        authorization: `Bearer ${TEST_CRON_SECRET}`,
        note: `failed with ${TEST_APP_SECRET} and ${TEST_WEBHOOK_SECRET}`,
        phone: "0550112233",
      });
      assertNoSecretLeakage(redacted, secrets, "redactSensitiveForLog");
    });

    // ── Scenario 19: Production Validation, Mode Precedence & Unmocked Network Guard ─
    await runTest("19. Mode precedence conflicts fail closed, prod validates canonical config & test/mocked_sandbox blocks unmocked network", async () => {
      // Ambiguous/conflicting mode combinations fail closed (pass tiktokEnvRaw: "" when testing unset TIKTOK_ENV)
      assert.equal(
        resolveTikTokEnvironmentMode({ environmentMode: "production", sandboxMode: true }).valid,
        false,
      );
      assert.equal(
        resolveTikTokEnvironmentMode({ environmentMode: "tiktok_sandbox", sandboxMode: false }).valid,
        false,
      );
      assert.equal(
        resolveTikTokEnvironmentMode({ tiktokEnvRaw: "", nodeEnv: "production", sandboxMode: true }).valid,
        false,
      );
      assert.equal(
        resolveTikTokEnvironmentMode({ nodeEnv: "test", environmentMode: "production" }).valid,
        false,
      );
      assert.equal(
        resolveTikTokEnvironmentMode({ nodeEnv: "development", environmentMode: "production" }).valid,
        false,
      );
      assert.throws(() => assertValidTikTokEnvironmentMode({ environmentMode: "production", sandboxMode: true }));

      // Local dev rejects accidental production domain redirect URI
      const localProdRisk = validateTikTokEnvironment({
        environmentMode: "local",
        appId: TEST_APP_ID,
        appSecret: TEST_APP_SECRET,
        redirectUri: TEST_REDIRECT_URI,
        encryptionKey: TEST_ENCRYPTION_KEY,
        sandboxMode: false,
        nodeEnv: "development",
      });
      assert.equal(localProdRisk.configurationStatus, "MISCONFIGURED");
      assert.ok(localProdRisk.configurationErrors.some((e) => e.code === "LOCAL_PRODUCTION_CREDENTIAL_RISK"));

      // Production rejects wrong path, origin mismatch, HTTP redirect & placeholder secrets
      const badProdPath = validateTikTokEnvironment({
        environmentMode: "production",
        sandboxMode: false,
        appId: TEST_APP_ID,
        appSecret: TEST_APP_SECRET,
        redirectUri: `${CANONICAL_ORIGIN}/api/integrations/tiktok/callback`, // missing trailing slash
        encryptionKey: TEST_ENCRYPTION_KEY,
        webhookSecret: TEST_WEBHOOK_SECRET,
        appUrl: CANONICAL_ORIGIN,
      });
      assert.equal(badProdPath.productionReady, false);
      assert.ok(badProdPath.configurationErrors.some((e) => e.code === "REDIRECT_URI_INVALID_PATH"));

      const badOriginMismatch = validateTikTokEnvironment({
        environmentMode: "production",
        sandboxMode: false,
        appId: TEST_APP_ID,
        appSecret: TEST_APP_SECRET,
        redirectUri: "https://other-storefront-domain.dz/api/integrations/tiktok/callback/",
        encryptionKey: TEST_ENCRYPTION_KEY,
        webhookSecret: TEST_WEBHOOK_SECRET,
        appUrl: CANONICAL_ORIGIN,
      });
      assert.equal(badOriginMismatch.productionReady, false);
      assert.ok(badOriginMismatch.configurationErrors.some((e) => e.code === "REDIRECT_URI_ORIGIN_MISMATCH"));

      // Opt-in dedicated webhook secret rejects fallback in production when enabled
      const savedEnvLocal = { ...process.env };
      try {
        process.env.TIKTOK_ENV = "production";
        process.env.TIKTOK_SANDBOX_MODE = "false";
        process.env.TIKTOK_REQUIRE_DEDICATED_WEBHOOK_SECRET = "true";
        delete process.env.TIKTOK_WEBHOOK_SECRET;
        const missingDedWhRes = await webhookPOST(
          makeRequest("/api/integrations/tiktok/webhook/", { method: "POST", origin: null, rawBody: "{}" }),
        );
        assert.equal(missingDedWhRes.status, 503);
      } finally {
        Object.assign(process.env, savedEnvLocal);
      }

      // Valid Hostinger canonical production config passes cleanly
      const validProd = validateTikTokEnvironment({
        environmentMode: "production",
        appId: TEST_APP_ID,
        appSecret: TEST_APP_SECRET,
        redirectUri: TEST_REDIRECT_URI,
        encryptionKey: TEST_ENCRYPTION_KEY,
        webhookSecret: TEST_WEBHOOK_SECRET,
        cronSecret: TEST_CRON_SECRET,
        sandboxMode: false,
        appUrl: CANONICAL_ORIGIN,
        strictNumericAppId: true,
        requireDedicatedWebhookSecret: true,
        nodeEnv: "production",
      });
      assert.equal(validProd.configurationStatus, "READY");
      assert.equal(validProd.configured, true);
      assert.equal(validProd.productionReady, true);
      assert.equal(validProd.apiBaseUrl, "https://business-api.tiktok.com/open_api/v1.3");
      assert.throws(() =>
        resolveTikTokOAuthConfig({
          environmentMode: "production",
          sandboxMode: true,
          appId: TEST_APP_ID,
          appSecret: TEST_APP_SECRET,
          redirectUri: TEST_REDIRECT_URI,
        }),
      );

      // Verify TikTokApiClient unmocked network block in test / mocked_sandbox modes
      globalThis.fetch = originalFetch;
      try {
        const testClient = new TikTokApiClient({ environmentMode: "mocked_sandbox" });
        await assert.rejects(
          () => testClient.requestJson({ method: "GET", path: "/page/get/", accessToken: "fake" }),
          (err: any) => err?.category === "INVALID_PARAMETERS" && /mocked_sandbox/i.test(err.message),
        );
      } finally {
        globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
          outboundUrls.push(String(input));
          return new Response(JSON.stringify({ code: 0, message: "OK", data: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }) as typeof fetch;
      }
    });

    // ── Scenario 20 & 21: Zero Redex Dispatch, Zero Meta CAPI, Default-OFF Telegram ─
    await runTest("20 & 21. Zero Redex dispatch, zero unconfirmed Meta CAPI Purchase & Telegram disabled by default", async () => {
      const orders = await pg.query<{ status: string; in_redex: boolean; redex_tracking_id: string | null }>(
        "SELECT status, in_redex, redex_tracking_id FROM public.orders",
      );
      assert.ok(orders.rows.length >= 5);
      assert.ok(orders.rows.every((o) => o.status === "pending" && o.in_redex === false && o.redex_tracking_id === null));

      assert.equal(outboundUrls.filter((u) => u.includes("redex.ecotrack.dz")).length, 0);
      assert.equal(outboundUrls.filter((u) => u.includes("graph.facebook.com")).length, 0);
      assert.equal(outboundUrls.filter((u) => u.includes("api.telegram.org")).length, 0);

      // Static source isolation check across all TikTok server modules
      const tiktokSrcDir = path.join(REPO_ROOT, "src/lib/integrations/tiktok");
      const files = fs.readdirSync(tiktokSrcDir).filter((f) => f.endsWith(".ts"));
      for (const f of files) {
        const src = fs.readFileSync(path.join(tiktokSrcDir, f), "utf8");
        assert.equal(/import\s+.*submitCodOrderAction/.test(src), false, `${f} must never import submitCodOrderAction`);
        assert.equal(/graph\.facebook\.com/.test(src), false, `${f} must never call graph.facebook.com`);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    Object.keys(process.env).forEach((k) => {
      if (!(k in savedEnv)) delete process.env[k];
    });
    Object.assign(process.env, savedEnv);
    __testResetSupabaseServerInstance();
    __testResetLocalRevocationCache();
    __testResetTikTokSyncLocks();
    __testResetTikTokWebhookGuards();
    await pg.close().catch(() => undefined);
  }

  console.log(`\n=== Environment Readiness Suite Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exit(1);
}

void runSuite();
