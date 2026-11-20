/**
 * ORVA Store — TikTok Lead Generation Integration
 * Phase B Route-Level Verification Suite (All 6 Next.js API Route Handlers)
 *
 * Tests:
 * - /api/integrations/tiktok/connect/   (GET, POST)
 * - /api/integrations/tiktok/callback/  (GET)
 * - /api/integrations/tiktok/accounts/  (GET, POST)
 * - /api/integrations/tiktok/forms/     (GET, POST)
 * - /api/integrations/tiktok/sync/      (GET, POST)
 * - /api/integrations/tiktok/webhook/   (GET, POST)
 *
 * Runs against REAL ephemeral PostgreSQL (@electric-sql/pglite) initialized with ORVA's
 * baseline migrations + Phase A1 TikTok migration, real NextRequest instances, real
 * admin-auth HMAC sessions + CSRF origin verification + durable revocation, and mocked
 * upstream TikTok v1.3 HTTP responses.
 *
 * Run: npx tsx tests/integrations/tiktok-phase-b.test.ts
 * Zero production DB calls. Zero real customer PII. Zero real TikTok credentials.
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
  invalidateSession,
} from "../../src/lib/auth/admin-auth";
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../../src/lib/supabase/server";
import {
  TIKTOK_OAUTH_STATE_COOKIE_NAME,
  generateOAuthState,
} from "../../src/lib/integrations/tiktok/oauth";
import { MISSING_ADDRESS_CONFIRMATION_NOTE } from "../../src/lib/integrations/tiktok/leads";
import { __testResetTikTokSyncLocks } from "../../src/lib/integrations/tiktok/sync";

import {
  GET as connectGET,
  POST as connectPOST,
} from "../../src/app/api/integrations/tiktok/connect/route";
import { GET as callbackGET } from "../../src/app/api/integrations/tiktok/callback/route";
import {
  GET as accountsGET,
  POST as accountsPOST,
} from "../../src/app/api/integrations/tiktok/accounts/route";
import {
  GET as formsGET,
  POST as formsPOST,
} from "../../src/app/api/integrations/tiktok/forms/route";
import {
  GET as syncGET,
  POST as syncPOST,
} from "../../src/app/api/integrations/tiktok/sync/route";
import {
  GET as webhookGET,
  POST as webhookPOST,
} from "../../src/app/api/integrations/tiktok/webhook/route";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261111_000001_consolidated_clean_rebuild.sql");
const ATTR_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261117_000005_order_attribution_and_profitability.sql");
const TIKTOK_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261119_000001_tiktok_lead_generation.sql");

const TEST_APP_ID = "tt_phase_b_app_889900";
const TEST_APP_SECRET = "tt_phase_b_secret_synthetic_9988776655";
const TEST_WEBHOOK_SECRET = "whsec_phase_b_synthetic_secret_445566";
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
const TEST_CRON_SECRET = "cron_phase_b_synthetic_secret_min_32_chars";
const TEST_REDIRECT_URI = "https://www.orva-store.com/api/integrations/tiktok/callback/";
const TEST_ORIGIN = "https://www.orva-store.com";
const TEST_HOST = "www.orva-store.com";

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

// ── PGlite -> Supabase PostgREST Query Adapter ───────────────────────────────

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

function jsonHttpResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeAdminRequest(
  urlPath: string,
  options: {
    method?: string;
    sessionToken?: string;
    bearerToken?: string;
    cookies?: Record<string, string>;
    origin?: string | null;
    host?: string;
    accept?: string;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers ?? {});
  headers.set("host", options.host ?? TEST_HOST);

  if (options.accept) {
    headers.set("accept", options.accept);
  }
  if (options.origin !== undefined && options.origin !== null) {
    headers.set("origin", options.origin);
  } else if (options.origin === undefined && method !== "GET") {
    headers.set("origin", TEST_ORIGIN);
  }
  if (options.bearerToken) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
  }

  const cookiePairs: string[] = [];
  if (options.sessionToken) {
    cookiePairs.push(`${SESSION_COOKIE_NAME}=${options.sessionToken}`);
  }
  if (options.cookies) {
    for (const [k, v] of Object.entries(options.cookies)) {
      cookiePairs.push(`${k}=${v}`);
    }
  }
  if (cookiePairs.length > 0) {
    headers.set("cookie", cookiePairs.join("; "));
  }

  let bodyStr: string | undefined;
  if (options.rawBody !== undefined) {
    bodyStr = options.rawBody;
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  } else if (options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }

  return new NextRequest(`${TEST_ORIGIN}${urlPath}`, {
    method,
    headers,
    body: method !== "GET" && method !== "HEAD" ? bodyStr : undefined,
  });
}

function signWebhookBody(rawBody: string, secret: string, tsSec: number): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${tsSec}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${tsSec},s=${sig}`;
}

function assertNoSecretLeakage(payload: unknown, label: string): void {
  const text = JSON.stringify(payload);
  for (const forbidden of [
    TEST_APP_SECRET,
    TEST_WEBHOOK_SECRET,
    TEST_ENCRYPTION_KEY,
    TEST_CRON_SECRET,
    "synthetic_phase_b_access_token",
    "synthetic_phase_b_refresh_token",
    "access_token_encrypted",
    "refresh_token_encrypted",
  ]) {
    assert.ok(!text.includes(forbidden), `Secret/token leaked in ${label}: found '${forbidden}'`);
  }
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
  console.log("\n=== ORVA STORE — TikTok Phase B Route Verification Suite ===\n");

  // Save & configure isolated synthetic test environment variables
  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  process.env.ADMIN_JWT_SECRET = "phase_b_admin_jwt_secret_synthetic_32chars_min";
  process.env.APP_URL = TEST_ORIGIN;
  process.env.NEXT_PUBLIC_APP_URL = TEST_ORIGIN;
  process.env.TIKTOK_APP_ID = TEST_APP_ID;
  process.env.TIKTOK_APP_SECRET = TEST_APP_SECRET;
  process.env.TIKTOK_REDIRECT_URI = TEST_REDIRECT_URI;
  process.env.TIKTOK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.TIKTOK_SYNC_CRON_SECRET = TEST_CRON_SECRET;
  process.env.TIKTOK_SANDBOX_MODE = "true";
  process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED = "false"; // Strictly disabled by default (Decision 1)
  process.env.TELEGRAM_BOT_TOKEN = "999999:synthetic_tg_token_must_not_be_called";
  process.env.TELEGRAM_CHAT_ID = "1234567890";
  process.env.META_PIXEL_ID = "123456789012345";
  process.env.META_CAPI_TOKEN = "synthetic_meta_capi_must_not_be_called";
  process.env.REDEX_API_TOKEN = "synthetic_redex_must_not_be_called";
  delete process.env.DEV_BYPASS_ADMIN_AUTH;

  const pg = await createInitializedPg();
  __testSetSupabaseServerInstance(createPgliteSupabaseAdapter(pg));
  __testResetLocalRevocationCache();
  __testResetTikTokSyncLocks();

  // Seed products in PGlite
  const pack2Id = (await pg.query<{ id: string }>(`SELECT id FROM public.products WHERE slug = 'pack2' LIMIT 1`)).rows[0].id;
  const customProductId = (
    await pg.query<{ id: string }>(
      `INSERT INTO public.products (slug, sku, name, base_price, status, stock_quantity)
       VALUES ('wrench-kit-dz', 'ORVA-WRENCH-DZ', 'طقم مفاتيح محترف DZ', 6500, 'PUBLISHED', 30)
       RETURNING id`,
    )
  ).rows[0].id;
  const archivedProductId = (
    await pg.query<{ id: string }>(
      `INSERT INTO public.products (slug, sku, name, base_price, status, stock_quantity)
       VALUES ('retired-item', 'ORVA-RETIRED', 'منتج متوقف', 3000, 'ARCHIVED', 0)
       RETURNING id`,
    )
  ).rows[0].id;

  // Global mocked fetch tracking ALL outbound calls (ensures zero Redex / Meta CAPI / Telegram leakage!)
  const outboundCalls: string[] = [];
  let denyLeadProbeForAdvId: string | null = null;
  let holdSlowSyncResolve: (() => void) | null = null;
  let slowSyncMode = false;

  globalThis.fetch = (async (input: any, init?: any): Promise<Response> => {
    const urlStr = String(typeof input === "string" ? input : input?.url || "");
    outboundCalls.push(urlStr);

    // Strictly forbid unintended external side effects
    assert.ok(!urlStr.includes("graph.facebook.com"), `Forbidden Meta CAPI call triggered: ${urlStr}`);
    assert.ok(!urlStr.includes("redex.ecotrack.dz"), `Forbidden Redex API call triggered: ${urlStr}`);
    assert.ok(!urlStr.includes("api.telegram.org"), `Forbidden Telegram alert sent while opt-in disabled: ${urlStr}`);

    if (urlStr.includes("/open_api/v1.3/oauth2/access_token/")) {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.auth_code === "bad_code_fail") {
        return jsonHttpResponse({ code: 40002, message: "Invalid auth_code" });
      }
      return jsonHttpResponse({
        code: 0,
        message: "OK",
        request_id: "req_b_token",
        data: {
          access_token: "synthetic_phase_b_access_token",
          refresh_token: "synthetic_phase_b_refresh_token",
          expires_in: 7200,
          refresh_token_expires_in: 86400 * 30,
          advertiser_ids: ["710001", "710002"],
          scope: [12010100, 12020100],
        },
      });
    }

    if (urlStr.includes("/open_api/v1.3/oauth2/revoke_token/")) {
      return jsonHttpResponse({ code: 0, message: "OK", data: {} });
    }

    if (urlStr.includes("/open_api/v1.3/oauth2/advertiser/get/")) {
      return jsonHttpResponse({
        code: 0,
        message: "OK",
        data: {
          list: [
            { advertiser_id: "710001", advertiser_name: "ORVA Main TikTok Ads" },
            { advertiser_id: "710002", advertiser_name: "ORVA Restricted Account" },
          ],
        },
      });
    }

    if (urlStr.includes("/open_api/v1.3/advertiser/info/")) {
      return jsonHttpResponse({
        code: 0,
        message: "OK",
        data: {
          list: [
            { advertiser_id: "710001", currency: "DZD", timezone: "Africa/Algiers", status: "STATUS_ENABLE" },
            { advertiser_id: "710002", currency: "DZD", timezone: "Africa/Algiers", status: "STATUS_ENABLE" },
          ],
        },
      });
    }

    if (urlStr.includes("/open_api/v1.3/page/get/")) {
      const parsed = new URL(urlStr);
      const advId = parsed.searchParams.get("advertiser_id");
      if (denyLeadProbeForAdvId && advId === denyLeadProbeForAdvId) {
        return jsonHttpResponse({ code: 40001, message: "Missing Leads Retrieval permission 12010100" });
      }
      return jsonHttpResponse({
        code: 0,
        message: "OK",
        data: {
          list: [
            { page_id: "form_b_pack2", page_name: "نموذج باك 2 تيك توك", status: "ACTIVE" },
            { page_id: "form_b_wrench", page_name: "Formulaire Clés DZ", status: "ACTIVE" },
          ],
          page_info: { page: 1, page_size: 100, total_page: 1 },
        },
      });
    }

    if (urlStr.includes("/open_api/v1.3/page/field/get/")) {
      return jsonHttpResponse({
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

    if (urlStr.includes("/open_api/v1.3/subscription/subscribe/")) {
      return jsonHttpResponse({ code: 0, message: "OK", data: { subscription_id: "sub_phase_b_71" } });
    }

    if (urlStr.includes("/open_api/v1.3/subscription/unsubscribe/")) {
      return jsonHttpResponse({ code: 0, message: "OK", data: {} });
    }

    if (urlStr.includes("/open_api/v1.3/page/lead/task/download/")) {
      return new Response(
        "lead_id,created_time,campaign_name,الاسم الكامل,رقم الهاتف,الولاية\n" +
          "tt_sync_csv_001,2026-11-19T14:00:00Z,Campaign_Sync,رضا عمري,0551998877,16 - الجزائر\n",
        { status: 200, headers: { "content-type": "text/csv" } },
      );
    }

    if (urlStr.includes("/open_api/v1.3/page/lead/task/")) {
      if (slowSyncMode) {
        await new Promise<void>((resolve) => {
          holdSlowSyncResolve = resolve;
        });
      }
      return jsonHttpResponse({
        code: 0,
        message: "OK",
        data: { task_id: "task_phase_b_1", status: "SUCCEED" },
      });
    }

    throw new Error(`Unexpected outbound fetch URL in Phase B test: ${urlStr}`);
  }) as typeof fetch;

  const validAdminToken = generateSessionToken();

  try {
    // ── GROUP 1: AUTHENTICATION, REVOCATION & CSRF ENFORCEMENT ───────────────
    console.log("1. Authentication, Invalid/Revoked Sessions & CSRF Origin Enforcement");

    await runTest("Rejects unauthenticated requests with 401 and Cache-Control: no-store across all 5 admin route groups", async () => {
      const checks = [
        await connectGET(makeAdminRequest("/api/integrations/tiktok/connect/")),
        await connectPOST(makeAdminRequest("/api/integrations/tiktok/connect/", { method: "POST", body: { action: "start" } })),
        await callbackGET(makeAdminRequest("/api/integrations/tiktok/callback/?auth_code=x&state=y")),
        await accountsGET(makeAdminRequest("/api/integrations/tiktok/accounts/")),
        await accountsPOST(makeAdminRequest("/api/integrations/tiktok/accounts/", { method: "POST", body: { action: "refresh" } })),
        await formsGET(makeAdminRequest("/api/integrations/tiktok/forms/")),
        await formsPOST(makeAdminRequest("/api/integrations/tiktok/forms/", { method: "POST", body: { action: "refresh" } })),
        await syncGET(makeAdminRequest("/api/integrations/tiktok/sync/")),
        await syncPOST(makeAdminRequest("/api/integrations/tiktok/sync/", { method: "POST", body: { action: "sync_all" } })),
      ];

      for (const res of checks) {
        assert.equal(res.status, 401);
        assert.ok((res.headers.get("cache-control") || "").includes("no-store"));
      }
    });

    await runTest("Rejects forged and durably revoked admin session tokens with 401", async () => {
      const forgedRes = await connectGET(
        makeAdminRequest("/api/integrations/tiktok/connect/", { sessionToken: "forged.invalidsignature" }),
      );
      assert.equal(forgedRes.status, 401);

      const revokedToken = generateSessionToken();
      assert.equal(await invalidateSession(revokedToken), true);
      __testResetLocalRevocationCache(); // force durable DB check in PGlite

      const revokedRes = await accountsGET(
        makeAdminRequest("/api/integrations/tiktok/accounts/", { sessionToken: revokedToken }),
      );
      assert.equal(revokedRes.status, 401);
    });

    await runTest("Rejects CSRF origin violations on authenticated mutating requests with 403 Forbidden", async () => {
      // Cross-origin attacker
      const evilOriginRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: validAdminToken,
          origin: "https://evil-attacker.example",
          body: { action: "start" },
        }),
      );
      assert.equal(evilOriginRes.status, 403);
      assert.equal((await evilOriginRes.json()).code, "CSRF_ORIGIN_MISMATCH");

      // Missing Origin & Referer with cookie
      const missingOriginRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: validAdminToken,
          origin: null,
          body: { action: "refresh" },
        }),
      );
      assert.equal(missingOriginRes.status, 403);

      // Cookie + Bearer simultaneously MUST NOT bypass Origin check
      const mixedHeaderRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: validAdminToken,
          bearerToken: validAdminToken,
          origin: "https://evil-attacker.example",
          body: { action: "sync_all" },
        }),
      );
      assert.equal(mixedHeaderRes.status, 403);
    });

    // ── GROUP 2: OAUTH START, CALLBACK STATE & REPLAY PROTECTION ─────────────
    console.log("2. OAuth Connect, Double-Submit State Cookie, Callback Failures & Token Leakage Audit");

    let issuedStateCookie = "";

    await runTest("POST /connect { action: 'start' } returns authUrl, sets HttpOnly state cookie, and leaks zero secrets", async () => {
      const statusRes = await connectGET(
        makeAdminRequest("/api/integrations/tiktok/connect/", { sessionToken: validAdminToken }),
      );
      assert.equal(statusRes.status, 200);
      const statusJson = await statusRes.json();
      assert.equal(statusJson.readiness.configured, true);
      assert.equal(statusJson.readiness.telegramAlertsOptIn, false);
      assertNoSecretLeakage(statusJson, "connect GET");

      const startRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "start" },
        }),
      );
      assert.equal(startRes.status, 200);
      assert.ok((startRes.headers.get("cache-control") || "").includes("no-store"));

      const startJson = await startRes.json();
      assert.equal(startJson.success, true);
      assert.ok(startJson.authorizationUrl.startsWith("https://business-api.tiktok.com/portal/auth"));
      assertNoSecretLeakage(startJson, "connect POST start");

      const setCookie = startRes.headers.get("set-cookie") || "";
      assert.ok(setCookie.includes(`${TIKTOK_OAUTH_STATE_COOKIE_NAME}=`));
      assert.ok(setCookie.toLowerCase().includes("httponly"));
      assert.ok(setCookie.toLowerCase().includes("samesite=lax"));

      const urlObj = new URL(startJson.authorizationUrl);
      issuedStateCookie = urlObj.searchParams.get("state") || "";
      assert.ok(issuedStateCookie.length > 40);
    });

    await runTest("GET /callback rejects missing/invalid/expired/mismatched OAuth states and handles upstream denials safely", async () => {
      // Missing state cookie -> 403
      const noCookieRes = await callbackGET(
        makeAdminRequest(`/api/integrations/tiktok/callback/?auth_code=abc&state=${encodeURIComponent(issuedStateCookie)}`, {
          sessionToken: validAdminToken,
        }),
      );
      assert.equal(noCookieRes.status, 403);

      // Mismatched double-submit cookie -> 403
      const mismatchRes = await callbackGET(
        makeAdminRequest(`/api/integrations/tiktok/callback/?auth_code=abc&state=${encodeURIComponent(issuedStateCookie)}`, {
          sessionToken: validAdminToken,
          cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: "different_state.value" },
        }),
      );
      assert.equal(mismatchRes.status, 403);

      // Expired state (>10m ago) -> 403
      const expired = generateOAuthState({ nowMs: Date.now() - 20 * 60 * 1000 });
      const expiredRes = await callbackGET(
        makeAdminRequest(`/api/integrations/tiktok/callback/?auth_code=abc&state=${encodeURIComponent(expired.state)}`, {
          sessionToken: validAdminToken,
          cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: expired.state },
        }),
      );
      assert.equal(expiredRes.status, 403);

      // Upstream error=access_denied with browser HTML Accept -> safe 302 redirect (no raw error reflection)
      const deniedHtmlRes = await callbackGET(
        makeAdminRequest("/api/integrations/tiktok/callback/?error=<script>alert(1)</script>", {
          sessionToken: validAdminToken,
          accept: "text/html,application/xhtml+xml",
          cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: issuedStateCookie },
        }),
      );
      assert.equal(deniedHtmlRes.status, 302);
      const loc = deniedHtmlRes.headers.get("location") || "";
      assert.ok(loc.includes("/dashboard/settings/?tab=tiktok&tiktok_status=error&tiktok_error=oauth_denied"));
      assert.ok(!loc.includes("<script>"));

      // Upstream token exchange error -> 400
      const badCodeRes = await callbackGET(
        makeAdminRequest(`/api/integrations/tiktok/callback/?auth_code=bad_code_fail&state=${encodeURIComponent(issuedStateCookie)}`, {
          sessionToken: validAdminToken,
          cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: issuedStateCookie },
        }),
      );
      assert.equal(badCodeRes.status, 400);
    });

    await runTest("GET /callback succeeds with valid state + cookie, clears one-time cookie, syncs advertisers & leaks zero tokens", async () => {
      const okRes = await callbackGET(
        makeAdminRequest(`/api/integrations/tiktok/callback/?auth_code=valid_code_123&state=${encodeURIComponent(issuedStateCookie)}`, {
          sessionToken: validAdminToken,
          cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: issuedStateCookie },
        }),
      );
      assert.equal(okRes.status, 200);
      assert.ok((okRes.headers.get("cache-control") || "").includes("no-store"));
      const setCookie = okRes.headers.get("set-cookie") || "";
      assert.ok(setCookie.includes("Max-Age=0"), "OAuth state cookie MUST be cleared on callback");

      const okJson = await okRes.json();
      assert.equal(okJson.success, true);
      assert.equal(okJson.connection.status, "connected");
      assert.equal(okJson.advertisersSynced, 2);
      assertNoSecretLeakage(okJson, "callback GET success");
    });

    // ── GROUP 3: ADVERTISER SELECTION & INSTANT FORM PRODUCT MAPPING ─────────
    console.log("3. Advertiser Selection, Webhook Subscription & Real Catalog Form Mapping");

    await runTest("POST /accounts enforces server-side advertiser ownership, Lead permission check & canonical webhook URL", async () => {
      // Unknown advertiser rejected (400)
      const unknownRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "select", advertiserId: "999999999" },
        }),
      );
      assert.equal(unknownRes.status, 400);

      // Extra spoofed field (verifyLeadAccess: false) rejected by .strict() (400)
      const spoofRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "select", advertiserId: "710002", verifyLeadAccess: false },
        }),
      );
      assert.equal(spoofRes.status, 400);

      // Advertiser without Leads Retrieval permission rejected (403)
      denyLeadProbeForAdvId = "710002";
      const deniedRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "select", advertiserId: "710002" },
        }),
      );
      assert.equal(deniedRes.status, 403);
      denyLeadProbeForAdvId = null;

      // Authorized advertiser with Lead permission succeeds (200)
      const okSelRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "select", advertiserId: "710001" },
        }),
      );
      assert.equal(okSelRes.status, 200);
      const okSelJson = await okSelRes.json();
      assert.equal(okSelJson.selectedAccount.advertiserId, "710001");
      assert.equal(okSelJson.selectedAccount.isSelected, true);
      assertNoSecretLeakage(okSelJson, "accounts POST select");

      // Subscribe webhook uses canonical server trailing-slash URL
      const subRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "subscribe_webhook", advertiserId: "710001" },
        }),
      );
      assert.equal(subRes.status, 200);
      const subJson = await subRes.json();
      assert.equal(subJson.webhookSubscribed, true);
      assert.equal(subJson.webhookUrl, `${TEST_ORIGIN}/api/integrations/tiktok/webhook/`);
    });

    await runTest("GET & POST /forms rejects spoofed prices/archived products and maps real ORVA catalog UUIDs", async () => {
      // Refresh forms from mocked TikTok API
      const refRes = await formsGET(
        makeAdminRequest("/api/integrations/tiktok/forms/?refresh=1", { sessionToken: validAdminToken }),
      );
      assert.equal(refRes.status, 200);
      const refJson = await refRes.json();
      assert.equal(refJson.forms.length, 2);
      assert.ok(refJson.catalogProducts.some((p: any) => p.id === pack2Id));
      assert.ok(!refJson.catalogProducts.some((p: any) => p.id === archivedProductId));
      assertNoSecretLeakage(refJson, "forms GET refresh");

      // Reject client attempting to spoof productPrice (400 via .strict())
      const spoofPriceRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "map_product", formId: "form_b_pack2", productId: pack2Id, productPrice: 1 },
        }),
      );
      assert.equal(spoofPriceRes.status, 400);

      // Reject archived product (400)
      const archRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "map_product", formId: "form_b_pack2", productId: archivedProductId },
        }),
      );
      assert.equal(archRes.status, 400);

      // Reject toggling sync before mapping (400)
      const preToggleRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "toggle_sync", formId: "form_b_pack2", syncEnabled: true },
        }),
      );
      assert.equal(preToggleRes.status, 400);

      // Map form_b_pack2 -> real PACK2 (12,950 DZD from public.products)
      const map1Res = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: {
            action: "map_product",
            formId: "form_b_pack2",
            productId: pack2Id,
            defaultWilayaCode: 16,
            defaultDeliveryType: "DOMICILE",
            autoCreateOrder: true,
            syncEnabled: true,
          },
        }),
      );
      assert.equal(map1Res.status, 200);
      const map1Json = await map1Res.json();
      assert.equal(map1Json.form.mapping.productPrice, 12950);
      assert.equal(map1Json.form.mapping.packId, "PACK2");

      // Map form_b_wrench -> custom product wrench-kit-dz with STOP_DESK default (to verify Decision 3 via webhook!)
      const map2Res = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: {
            action: "map_product",
            formId: "form_b_wrench",
            productId: customProductId,
            defaultWilayaCode: 31,
            defaultDeliveryType: "STOP_DESK",
            autoCreateOrder: true,
            syncEnabled: true,
          },
        }),
      );
      assert.equal(map2Res.status, 200);
      assert.equal((await map2Res.json()).form.mapping.productPrice, 6500);
    });

    // ── GROUP 4: WEBHOOK SIGNATURE, REPLAY, MALFORMED PAYLOADS & IDEMPOTENCY ──
    console.log("4. Webhook Signature Verification, Replay Defense, Malformed Payloads & Pending Orders");

    await runTest("GET /webhook validates challenge safely & POST /webhook rejects missing secret (503), bad sig (401), replay (401), and malformed JSON (400)", async () => {
      const chOk = await webhookGET(makeAdminRequest("/api/integrations/tiktok/webhook/?challenge=tt_verify_2026"));
      assert.equal(chOk.status, 200);
      assert.equal((await chOk.json()).challenge, "tt_verify_2026");

      const chBad = await webhookGET(makeAdminRequest("/api/integrations/tiktok/webhook/?challenge=<script>"));
      assert.equal(chBad.status, 400);

      // Missing signature header -> 401
      const nowSec = Math.floor(Date.now() / 1000);
      const validPayload = JSON.stringify({ event: "LEAD", advertiser_id: "710001", data: {} });
      const noSigRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: validPayload,
        }),
      );
      assert.equal(noSigRes.status, 401);

      // Tampered raw body (signature computed for different text) -> 401 BEFORE JSON parsing
      const badSigRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: "{ not even json",
          headers: { "tiktok-signature": signWebhookBody(validPayload, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(badSigRes.status, 401);

      // Replay attempt (> 5 minutes old) -> 401
      const oldTs = nowSec - 600;
      const replayRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: validPayload,
          headers: { "tiktok-signature": signWebhookBody(validPayload, TEST_WEBHOOK_SECRET, oldTs) },
        }),
      );
      assert.equal(replayRes.status, 401);

      // Valid signature on malformed JSON -> 400
      const malformedRaw = "{ broken_json";
      const malformedRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: malformedRaw,
          headers: { "tiktok-signature": signWebhookBody(malformedRaw, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(malformedRes.status, 400);

      // Valid signature on non-object JSON primitive -> 400
      const primitiveRaw = '"just-a-string"';
      const primitiveRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: primitiveRaw,
          headers: { "tiktok-signature": signWebhookBody(primitiveRaw, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(primitiveRes.status, 400);

      // Fail closed (503) if server secrets are unset
      const prevWh = process.env.TIKTOK_WEBHOOK_SECRET;
      const prevApp = process.env.TIKTOK_APP_SECRET;
      delete process.env.TIKTOK_WEBHOOK_SECRET;
      delete process.env.TIKTOK_APP_SECRET;
      try {
        const noSecretRes = await webhookPOST(
          makeAdminRequest("/api/integrations/tiktok/webhook/", { method: "POST", rawBody: validPayload }),
        );
        assert.equal(noSecretRes.status, 503);
      } finally {
        process.env.TIKTOK_WEBHOOK_SECRET = prevWh;
        process.env.TIKTOK_APP_SECRET = prevApp;
      }
    });

    await runTest("POST /webhook creates pending COD order (Decisions 1-3 intact), skips duplicates cleanly, and never calls Redex/Meta CAPI/Telegram", async () => {
      const nowSec = Math.floor(Date.now() / 1000);

      // 1. Arabic lead with missing street address (Decision 2) + Southern Wilaya 49 STOP_DESK fallback (Decision 3)
      const whBody1 = JSON.stringify({
        event: "LEAD",
        timestamp: nowSec,
        advertiser_id: "710001",
        data: {
          lead_id: "tt_wh_phase_b_001",
          form_id: "form_b_wrench",
          campaign_name: "TikTok_Wrench_DZ",
          lead_info: [
            { field_name: "الاسم الكامل", field_value: "طارق بلقاسم" },
            { field_name: "رقم الهاتف", field_value: "+213 661 22 33 44" },
            { field_name: "الولاية", field_value: "49 - تيميمون" },
          ],
        },
      });

      const res1 = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: whBody1,
          headers: { "tiktok-signature": signWebhookBody(whBody1, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(res1.status, 200);
      assert.ok((res1.headers.get("cache-control") || "").includes("no-store"));
      const json1 = await res1.json();
      assert.equal(json1.success, true);
      assert.equal(json1.received, true);
      assert.equal(json1.summary.ordersCreated, 1);
      assert.equal(json1.summary.duplicatesSkipped, 0);
      assert.equal("backgroundTasks" in json1.summary, false);
      assertNoSecretLeakage(json1, "webhook POST 1");

      // Inspect real PostgreSQL order row
      const ordRow = (
        await pg.query<any>(
          `SELECT * FROM public.orders WHERE idempotency_key = 'tiktok_lead_tt_wh_phase_b_001'`,
        )
      ).rows[0];
      assert.equal(ordRow.status, "pending");
      assert.equal(ordRow.in_redex, false);
      assert.equal(ordRow.attribution_source, "tiktok_ads");
      assert.equal(ordRow.delivery_address, ""); // Decision 2: empty, never fabricated
      assert.equal(ordRow.notes, MISSING_ADDRESS_CONFIRMATION_NOTE);
      assert.equal(ordRow.delivery_method, "DOMICILE"); // Decision 3: fallback from STOP_DESK
      assert.equal(Number(ordRow.subtotal), 6500);
      assert.equal(Number(ordRow.delivery_fee), 1000);
      assert.equal(Number(ordRow.total_payable), 7500);

      // 2. Duplicate re-delivery of identical signed webhook -> 200 OK, 0 new orders, 1 duplicate skipped
      const resDup = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: whBody1,
          headers: { "tiktok-signature": signWebhookBody(whBody1, TEST_WEBHOOK_SECRET, nowSec + 2) },
        }),
      );
      assert.equal(resDup.status, 200);
      const jsonDup = await resDup.json();
      assert.equal(jsonDup.summary.ordersCreated, 0);
      assert.equal(jsonDup.summary.duplicatesSkipped, 1);

      const countRes = await pg.query<{ count: string }>(
        `SELECT count(*) FROM public.orders WHERE idempotency_key = 'tiktok_lead_tt_wh_phase_b_001'`,
      );
      assert.equal(Number(countRes.rows[0].count), 1);

      // 3. Invalid phone lead preserved for recovery without failing webhook 200 acknowledgement
      const badPhoneBody = JSON.stringify({
        event: "LEAD",
        timestamp: nowSec,
        advertiser_id: "710001",
        data: {
          lead_id: "tt_wh_phase_b_badphone",
          form_id: "form_b_pack2",
          lead_info: [
            { field_name: "full_name", field_value: "Bad Phone Lead" },
            { field_name: "phone_number", field_value: "021556677" },
          ],
        },
      });
      const resBadPhone = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: badPhoneBody,
          headers: { "tiktok-signature": signWebhookBody(badPhoneBody, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(resBadPhone.status, 200);
      assert.equal((await resBadPhone.json()).summary.leadsFailed, 1);
    });

    // ── GROUP 5: SYNC, CRON AUTH, CONCURRENCY 409, MASKED AUDIT & DISCONNECT ─
    console.log("5. Sync Route, Cron Authorization, Concurrent Lock (409), Masked Audit & Disconnect");

    await runTest("POST /sync enforces cron secret restrictions, returns 409 on overlapping sync_form, and GET /sync masks phones", async () => {
      // Invalid cron bearer -> 401
      const badCronRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          bearerToken: "wrong_cron_secret_value",
          body: { action: "sync_all" },
        }),
      );
      assert.equal(badCronRes.status, 401);

      // Valid cron calling forbidden action (retry_failed) -> 403
      const cronForbiddenRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          bearerToken: TEST_CRON_SECRET,
          body: { action: "retry_failed" },
        }),
      );
      assert.equal(cronForbiddenRes.status, 403);

      // Valid cron executing sync_all -> 200 OK
      const cronOkRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          bearerToken: TEST_CRON_SECRET,
          body: { action: "sync_all" },
        }),
      );
      assert.equal(cronOkRes.status, 200);
      const cronOkJson = await cronOkRes.json();
      assert.equal(cronOkJson.formsSynced, 2);
      assert.equal(cronOkJson.totals.ordersCreated, 1); // deduplicated across forms
      assertNoSecretLeakage(cronOkJson, "sync POST cron sync_all");

      // Concurrent overlapping sync_form -> 409 Conflict
      slowSyncMode = true;
      const p1 = syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "sync_form", formId: "form_b_pack2" },
        }),
      );
      await new Promise((r) => setTimeout(r, 20));
      const resConcurrent = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "sync_form", formId: "form_b_pack2" },
        }),
      );
      assert.equal(resConcurrent.status, 409);
      assert.equal((await resConcurrent.json()).code, "CONCURRENT_SYNC_IN_PROGRESS");

      slowSyncMode = false;
      holdSlowSyncResolve?.();
      const res1 = await p1;
      assert.equal(res1.status, 200);

      // GET /sync returns logs & recoverable leads with ZERO raw phones or secrets
      const syncGetRes = await syncGET(
        makeAdminRequest("/api/integrations/tiktok/sync/?limit=10", { sessionToken: validAdminToken }),
      );
      assert.equal(syncGetRes.status, 200);
      assert.ok((syncGetRes.headers.get("cache-control") || "").includes("no-store"));
      const syncGetJson = await syncGetRes.json();
      assert.ok(syncGetJson.logs.length >= 2);
      assert.ok(syncGetJson.leadStats.byStatus.order_created >= 2);
      assert.ok(syncGetJson.leadStats.byStatus.invalid_phone >= 1);
      const syncText = JSON.stringify(syncGetJson);
      assert.ok(!syncText.includes("0661223344"), "Raw customer phone MUST NOT leak in GET /sync");
      assert.ok(!syncText.includes("0551998877"), "Raw customer phone MUST NOT leak in GET /sync");
      assertNoSecretLeakage(syncGetJson, "sync GET");
    });

    await runTest("POST /sync recovers unmapped leads via retry_failed, runs bounded reconcile, and POST /webhook rejects >1MB payloads (413)", async () => {
      // Oversized webhook payload (> 1 MB) -> 413 Payload Too Large
      const hugeBody = "x".repeat(1_048_600);
      const hugeRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: hugeBody,
        }),
      );
      assert.equal(hugeRes.status, 413);

      // Insert an unmapped form and deliver a valid signed webhook lead for it
      await pg.query(
        `INSERT INTO public.tiktok_forms (store_id, advertiser_id, form_id, form_name, status, sync_enabled)
         VALUES ('orvastore', '710001', 'form_b_unmapped', 'Unmapped Form B', 'ACTIVE', false)`,
      );

      const nowSec = Math.floor(Date.now() / 1000);
      const unmappedBody = JSON.stringify({
        event: "LEAD",
        timestamp: nowSec,
        advertiser_id: "710001",
        data: {
          lead_id: "tt_wh_phase_b_unmapped_010",
          form_id: "form_b_unmapped",
          lead_info: [
            { field_name: "Nom complet", field_value: "Riad Mansour" },
            { field_name: "Téléphone", field_value: "0772445566" },
            { field_name: "Wilaya", field_value: "25 - Constantine" },
          ],
        },
      });

      const unmappedWhRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          rawBody: unmappedBody,
          headers: { "tiktok-signature": signWebhookBody(unmappedBody, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(unmappedWhRes.status, 200);
      assert.equal((await unmappedWhRes.json()).summary.leadsFailed, 1);

      // Map the form through POST /forms, then recover via POST /sync { action: "retry_failed" }
      const mapRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: {
            action: "map_product",
            formId: "form_b_unmapped",
            productId: pack2Id,
            defaultWilayaCode: 16,
            defaultDeliveryType: "DOMICILE",
            autoCreateOrder: true,
            syncEnabled: true,
          },
        }),
      );
      assert.equal(mapRes.status, 200);

      const retryRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "retry_failed", leadIds: ["tt_wh_phase_b_unmapped_010"] },
        }),
      );
      assert.equal(retryRes.status, 200);
      const retryJson = await retryRes.json();
      assert.equal(retryJson.summary.ordersCreated, 1);
      assert.equal(retryJson.summary.leadsFailed, 0);

      // Reconcile via admin session -> 200 OK
      const reconRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "reconcile", lookbackDays: 7 },
        }),
      );
      assert.equal(reconRes.status, 200);
      const reconJson = await reconRes.json();
      assert.equal(reconJson.lookbackDays, 7);
      assert.equal(reconJson.formsProcessed, 3);
    });

    await runTest("POST /connect { action: 'disconnect' } revokes token, purges DB, and clears OAuth state cookie", async () => {
      const discRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: validAdminToken,
          body: { action: "disconnect" },
        }),
      );
      assert.equal(discRes.status, 200);
      const discJson = await discRes.json();
      assert.equal(discJson.disconnected, true);
      assert.equal(discJson.upstreamRevoked, true);
      assert.ok((discRes.headers.get("set-cookie") || "").includes("Max-Age=0"));

      const afterStatus = await connectGET(
        makeAdminRequest("/api/integrations/tiktok/connect/", { sessionToken: validAdminToken }),
      );
      assert.equal((await afterStatus.json()).connection, null);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
    __testResetSupabaseServerInstance();
    __testResetLocalRevocationCache();
    __testResetTikTokSyncLocks();
    await pg.close();
  }

  console.log(`\nPhase B Suite Summary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Phase B verification runner crashed:", err);
  process.exit(1);
});
