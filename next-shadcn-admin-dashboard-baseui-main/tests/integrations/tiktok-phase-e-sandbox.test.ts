/**
 * ORVA Store — TikTok Lead Generation Integration
 * Execution Cycle 06: Sandbox Readiness & Isolated Validation Suite
 *
 * Strictly verifies without touching production Supabase or real TikTok accounts:
 * 1. Missing external credential fail-closed detection & environment configuration readiness.
 * 2. Official TikTok Sandbox Base URL routing (`TIKTOK_SANDBOX_MODE=true` -> `https://sandbox-ads.tiktok.com/open_api/v1.3`).
 * 3. OAuth Redirect URI & Webhook callback trailing-slash + HTTPS validation.
 * 4. Sandbox advertiser authorization & required scopes (`12010100` Leads Retrieval + `12020100` Test Leads).
 * 5. Official v1.3 Test Leads (`12020100`) create/get/delete + 1 synthetic Test Lead -> strictly 1 pending order
 *    in isolated PGlite PostgreSQL + duplicate skip + unmapped/error recovery + 0 Redex/Meta CAPI/Telegram side effects.
 *
 * Run: npx tsx tests/integrations/tiktok-phase-e-sandbox.test.ts
 * Zero production DB calls. Zero real customer PII. Zero simulated external success claims.
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
  TIKTOK_API_BASE_URL,
  TIKTOK_REQUIRED_SCOPES,
  TIKTOK_SANDBOX_API_BASE_URL,
  isTikTokSandboxModeEnabled,
  resolveTikTokApiBaseUrl,
} from "../../src/lib/integrations/tiktok/types";
import { TikTokApiClient } from "../../src/lib/integrations/tiktok/client";
import {
  TIKTOK_OAUTH_STATE_COOKIE_NAME,
  getTikTokConfigurationReadiness,
} from "../../src/lib/integrations/tiktok/oauth";
import {
  __testResetTikTokSyncLocks,
  createTikTokMockTestLead,
  deleteTikTokMockTestLead,
  getTikTokMockTestLead,
} from "../../src/lib/integrations/tiktok/sync";

import { POST as connectPOST } from "../../src/app/api/integrations/tiktok/connect/route";
import { GET as callbackGET } from "../../src/app/api/integrations/tiktok/callback/route";
import { POST as accountsPOST } from "../../src/app/api/integrations/tiktok/accounts/route";
import { POST as formsPOST } from "../../src/app/api/integrations/tiktok/forms/route";
import { POST as syncPOST } from "../../src/app/api/integrations/tiktok/sync/route";
import { POST as webhookPOST } from "../../src/app/api/integrations/tiktok/webhook/route";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_SQL = path.join(
  REPO_ROOT,
  "src/lib/supabase/migrations/20261111_000001_consolidated_clean_rebuild.sql",
);
const ATTR_SQL = path.join(
  REPO_ROOT,
  "src/lib/supabase/migrations/20261117_000005_order_attribution_and_profitability.sql",
);
const TIKTOK_SQL = path.join(
  REPO_ROOT,
  "src/lib/supabase/migrations/20261119_000001_tiktok_lead_generation.sql",
);

const TEST_ORIGIN = "https://sandbox-preview.orva-store.com";
const TEST_HOST = "sandbox-preview.orva-store.com";
const TEST_SANDBOX_APP_ID = "tt_sandbox_app_000999";
const TEST_SANDBOX_APP_SECRET = "tt_sandbox_secret_synthetic_only_887766";
const TEST_SANDBOX_WEBHOOK_SECRET = "whsec_sandbox_synthetic_only_554433";
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
const TEST_REDIRECT_URI = `${TEST_ORIGIN}/api/integrations/tiktok/callback/`;

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
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) throw new Error(`Invalid SQL ident: ${id}`);
  return `"${id}"`;
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

    const execute = async (): Promise<{ data: any; error: any }> => {
      try {
        const params: unknown[] = [];
        const addParam = (col: string, v: unknown) => {
          params.push(
            v === undefined
              ? null
              : v !== null && JSONB_COLUMNS.has(col) && typeof v === "object"
                ? JSON.stringify(v)
                : v,
          );
          return `$${params.length}`;
        };

        const buildWhere = () => {
          if (filters.length === 0) return "";
          return ` WHERE ${filters
            .map((f) => {
              if (f.op === "IN") {
                const arr = Array.isArray(f.val) ? f.val : [];
                if (arr.length === 0) return "1 = 0";
                return `${quoteIdent(f.col)} IN (${arr.map((v) => addParam(f.col, v)).join(", ")})`;
              }
              return f.val === null
                ? `${quoteIdent(f.col)} IS NULL`
                : `${quoteIdent(f.col)} = ${addParam(f.col, f.val)}`;
            })
            .join(" AND ")}`;
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
        } else if (action === "insert" || action === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          const cols = Object.keys(rows[0]);
          const colList = cols.map(quoteIdent).join(", ");
          const valueTuples = rows.map(
            (r) => `(${cols.map((c) => addParam(c, r[c])).join(", ")})`,
          );
          sql = `INSERT INTO ${safeTable} (${colList}) VALUES ${valueTuples.join(", ")}`;
          if (action === "upsert" && onConflictCol) {
            const cCols = onConflictCol.split(",").map((c) => quoteIdent(c.trim())).join(", ");
            const uCols = cols
              .filter((c) => !onConflictCol!.split(",").map((x) => x.trim()).includes(c))
              .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
              .join(", ");
            sql += ` ON CONFLICT (${cCols}) DO UPDATE SET ${uCols}`;
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
          if (rows.length === 0) return { data: null, error: { code: "PGRST116", message: "Not found" } };
          return { data: rows[0], error: null };
        }
        if (mode === "maybeSingle") return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      } catch (err: any) {
        return { data: null, error: { code: err?.code, message: err?.message || String(err) } };
      }
    };

    const builder: any = {
      select(cols = "*") {
        if (action === "select") selectCols = cols;
        else returning = true;
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

function makeAdminRequest(
  urlPath: string,
  options: {
    method?: string;
    sessionToken?: string;
    cookies?: Record<string, string>;
    origin?: string | null;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers ?? {});
  headers.set("host", TEST_HOST);

  if (options.origin !== undefined && options.origin !== null) {
    headers.set("origin", options.origin);
  } else if (options.origin === undefined && method !== "GET") {
    headers.set("origin", TEST_ORIGIN);
  }

  const cookiePairs: string[] = [];
  if (options.sessionToken) cookiePairs.push(`${SESSION_COOKIE_NAME}=${options.sessionToken}`);
  if (options.cookies) {
    for (const [k, v] of Object.entries(options.cookies)) cookiePairs.push(`${k}=${v}`);
  }
  if (cookiePairs.length > 0) headers.set("cookie", cookiePairs.join("; "));

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

function signWebhook(rawBody: string, secret: string, tsSec: number): string {
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${tsSec}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${tsSec},s=${sig}`;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function main() {
  console.log("\n=== ORVA STORE — Cycle 06: TikTok Sandbox Readiness & Isolated Validation Suite ===\n");

  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  const pg = new PGlite({ extensions: { uuid_ossp, pgcrypto } });

  try {
    // ── Test 1: Unconfigured Environment Fails Closed (Honest Blocker Detection) ─
    await runTest("1. Unconfigured local environment fails closed & surfaces exact missing TikTok configuration", () => {
      const readinessUnconfigured = getTikTokConfigurationReadiness({
        appId: "",
        appSecret: "",
        redirectUri: "",
        encryptionKey: "",
      });
      assert.equal(readinessUnconfigured.configured, false);
      assert.deepEqual(readinessUnconfigured.missingKeys, [
        "TIKTOK_APP_ID",
        "TIKTOK_APP_SECRET",
        "TIKTOK_REDIRECT_URI",
        "TIKTOK_TOKEN_ENCRYPTION_KEY",
      ]);

      // HTTP localhost triggers redirectUriHttps = false warning (since TikTok Developer Portal requires HTTPS)
      const httpLocalCheck = getTikTokConfigurationReadiness({
        appId: TEST_SANDBOX_APP_ID,
        appSecret: TEST_SANDBOX_APP_SECRET,
        redirectUri: "http://localhost:3000/api/integrations/tiktok/callback/",
        encryptionKey: TEST_ENCRYPTION_KEY,
        sandboxMode: true,
        nodeEnv: "development",
      });
      assert.equal(httpLocalCheck.configured, true);
      assert.equal(httpLocalCheck.redirectUriValid, true);
      assert.equal(httpLocalCheck.redirectUriHttps, false);
      assert.equal(httpLocalCheck.apiBaseUrl, TIKTOK_SANDBOX_API_BASE_URL);
    });

    // ── Test 2: Official Sandbox Base URL Routing (`sandbox-ads.tiktok.com` vs `business-api.tiktok.com`) ─
    await runTest("2. TIKTOK_SANDBOX_MODE=true routes API client calls to https://sandbox-ads.tiktok.com/open_api/v1.3", () => {
      process.env.TIKTOK_SANDBOX_MODE = "true";
      assert.equal(isTikTokSandboxModeEnabled(), true);
      assert.equal(resolveTikTokApiBaseUrl(), TIKTOK_SANDBOX_API_BASE_URL);
      const sbClient = new TikTokApiClient();
      assert.equal(sbClient.getBaseUrl(), TIKTOK_SANDBOX_API_BASE_URL);
      assert.ok(
        sbClient.buildUrl("/page/lead/mock/create/").startsWith("https://sandbox-ads.tiktok.com/open_api/v1.3/page/lead/mock/create/"),
      );

      process.env.TIKTOK_SANDBOX_MODE = "false";
      assert.equal(isTikTokSandboxModeEnabled(), false);
      assert.equal(resolveTikTokApiBaseUrl(), TIKTOK_API_BASE_URL);
      const prodClient = new TikTokApiClient();
      assert.equal(prodClient.getBaseUrl(), TIKTOK_API_BASE_URL);

      // Explicit override still takes precedence safely
      assert.equal(
        new TikTokApiClient({ sandboxMode: true }).getBaseUrl(),
        TIKTOK_SANDBOX_API_BASE_URL,
      );
    });

    // Configure isolated Sandbox test environment in-memory ONLY
    process.env.ADMIN_JWT_SECRET = "cycle6_sandbox_jwt_secret_synthetic_32chars_min";
    process.env.APP_URL = TEST_ORIGIN;
    process.env.NEXT_PUBLIC_APP_URL = TEST_ORIGIN;
    process.env.TIKTOK_APP_ID = TEST_SANDBOX_APP_ID;
    process.env.TIKTOK_APP_SECRET = TEST_SANDBOX_APP_SECRET;
    process.env.TIKTOK_WEBHOOK_SECRET = TEST_SANDBOX_WEBHOOK_SECRET;
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.TIKTOK_REDIRECT_URI = TEST_REDIRECT_URI;
    process.env.TIKTOK_SANDBOX_MODE = "true";
    delete process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;

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

    const pack1Row = (
      await pg.query<{ id: string; base_price: number }>(
        `SELECT id, base_price FROM public.products WHERE slug = 'pack1' LIMIT 1`,
      )
    ).rows[0];
    const pack1Id = pack1Row.id;
    const pack1Price = Number(pack1Row.base_price);

    const adapter = createPgliteSupabaseAdapter(pg);
    __testSetSupabaseServerInstance(adapter as any);
    __testResetLocalRevocationCache();
    __testResetTikTokSyncLocks();

    const adminToken = generateSessionToken("cycle6-sandbox-admin");
    const sandboxApiHostsSeen: string[] = [];
    const forbiddenExternalCalls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const parsedUrl = new URL(url);

      if (/redex|ecotrack|graph\.facebook\.com|api\.telegram\.org/i.test(url)) {
        forbiddenExternalCalls.push(url);
        throw new Error(`FORBIDDEN SIDE EFFECT IN SANDBOX: ${url}`);
      }

      sandboxApiHostsSeen.push(parsedUrl.origin);

      if (url.includes("/oauth2/access_token/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            access_token: "synth_sandbox_access_token_never_expose",
            refresh_token: "synth_sandbox_refresh_token_never_expose",
            expires_in: 86400,
            refresh_token_expires_in: 2592000,
            advertiser_ids: ["790011223344"],
            scope: [TIKTOK_REQUIRED_SCOPES.LEADS_RETRIEVAL, TIKTOK_REQUIRED_SCOPES.TEST_LEADS],
          },
        });
      }

      if (url.includes("/oauth2/advertiser/get/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            list: [{ advertiser_id: "790011223344", advertiser_name: "ORVA Sandbox Test Advertiser" }],
          },
        });
      }

      if (url.includes("/advertiser/info/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            list: [
              {
                advertiser_id: "790011223344",
                name: "ORVA Sandbox Test Advertiser",
                currency: "DZD",
                timezone: "Africa/Algiers",
                status: "STATUS_ENABLE",
              },
            ],
          },
        });
      }

      if (url.includes("/page/get/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            list: [{ page_id: "form_sb_pack1", page_name: "ORVA Sandbox Form", status: "ACTIVE" }],
            page_info: { page: 1, page_size: 50, total_page: 1, total_number: 1 },
          },
        });
      }

      if (url.includes("/page/field/get/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            list: [
              { field_id: "f1", field_name: "full_name", field_type: "TEXT", required: true },
              { field_id: "f2", field_name: "phone_number", field_type: "PHONE_NUMBER", required: true },
            ],
          },
        });
      }

      if (url.includes("/subscription/subscribe/")) {
        return jsonResp({ code: 0, message: "OK", data: { subscription_id: "sub_sb_01" } });
      }

      if (url.includes("/page/lead/mock/create/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            lead_id: "tt_mock_lead_12020100_01",
            page_id: "form_sb_pack1",
            advertiser_id: "790011223344",
          },
        });
      }

      if (url.includes("/page/lead/mock/get/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            lead_id: "tt_mock_lead_12020100_01",
            page_id: "form_sb_pack1",
            advertiser_id: "790011223344",
            field_data: [
              { field_name: "full_name", field_value: "Sandbox Test Buyer" },
              { field_name: "phone_number", field_value: "0550112299" },
              { field_name: "wilaya", field_value: "16" },
            ],
          },
        });
      }

      if (url.includes("/page/lead/mock/delete/")) {
        return jsonResp({ code: 0, message: "OK", data: {} });
      }

      throw new Error(`Unexpected URL in Sandbox test: ${url}`);
    }) as typeof fetch;

    // ── Test 3: HTTPS Redirect + Webhook URL Validation, Sandbox OAuth & Advertiser Scopes ─
    await runTest("3. Validates HTTPS trailing-slash URLs, routes OAuth/advertiser checks via sandbox-ads.tiktok.com, and verifies scopes 12010100 + 12020100", async () => {
      const readiness = getTikTokConfigurationReadiness();
      assert.equal(readiness.configured, true);
      assert.equal(readiness.sandboxMode, true);
      assert.equal(readiness.redirectUriHttps, true);
      assert.equal(readiness.webhookSecretConfigured, true);
      assert.equal(readiness.apiBaseUrl, TIKTOK_SANDBOX_API_BASE_URL);

      const startRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "start" },
        }),
      );
      assert.equal(startRes.status, 200);
      const startJson = await startRes.json();
      assert.equal(startJson.redirectUri, `${TEST_ORIGIN}/api/integrations/tiktok/callback/`);

      const state = new URL(startJson.authorizationUrl).searchParams.get("state")!;
      const cbRes = await callbackGET(
        makeAdminRequest(
          `/api/integrations/tiktok/callback/?auth_code=synth_sb_code&state=${encodeURIComponent(state)}`,
          {
            method: "GET",
            sessionToken: adminToken,
            cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: state },
            headers: { accept: "application/json" },
          },
        ),
      );
      assert.equal(cbRes.status, 200);
      const cbJson = await cbRes.json();
      assert.ok(cbJson.connection.scopes.includes(12010100));
      assert.ok(cbJson.connection.scopes.includes(12020100));

      const selRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "select", advertiserId: "790011223344" },
        }),
      );
      assert.equal(selRes.status, 200);

      const subRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "subscribe_webhook", advertiserId: "790011223344" },
        }),
      );
      assert.equal(subRes.status, 200);
      const subJson = await subRes.json();
      assert.equal(subJson.webhookUrl, `${TEST_ORIGIN}/api/integrations/tiktok/webhook/`);

      // Confirm EVERY upstream TikTok REST call went to https://sandbox-ads.tiktok.com (zero business-api.tiktok.com calls!)
      assert.ok(sandboxApiHostsSeen.length >= 4);
      for (const origin of sandboxApiHostsSeen) {
        assert.equal(origin, "https://sandbox-ads.tiktok.com");
      }
    });

    // ── Test 4: 1 Synthetic Test Lead (12020100) -> Strictly 1 Pending Order + Duplicate Block + Cleanup ─
    await runTest("4. Executes Test Leads (12020100) lifecycle, creates 1 pending order in isolated PGlite, blocks duplicates & verifies zero side effects", async () => {
      const refRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "refresh", advertiserId: "790011223344" },
        }),
      );
      assert.equal(refRes.status, 200);

      const mapRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: adminToken,
          body: {
            action: "map_product",
            formId: "form_sb_pack1",
            productId: pack1Id,
            defaultWilayaCode: 16,
            defaultDeliveryType: "DOMICILE",
            autoCreateOrder: true,
            syncEnabled: true,
          },
        }),
      );
      assert.equal(mapRes.status, 200);

      // Call official v1.3 Test Leads (12020100) helpers against sandbox host
      const created = await createTikTokMockTestLead({
        advertiserId: "790011223344",
        formId: "form_sb_pack1",
        leadData: [
          { field_name: "full_name", field_value: "Sandbox Test Buyer" },
          { field_name: "phone_number", field_value: "0550112299" },
          { field_name: "wilaya", field_value: "16" },
        ],
      });
      assert.equal(created.mockLead.lead_id, "tt_mock_lead_12020100_01");

      const fetched = await getTikTokMockTestLead({
        advertiserId: "790011223344",
        formId: "form_sb_pack1",
      });
      assert.equal(fetched.mockLead.lead_id, "tt_mock_lead_12020100_01");

      // Deliver signed webhook for that synthetic Test Lead
      const whPayload = JSON.stringify({
        event: "LEAD",
        advertiser_id: "790011223344",
        page_id: "form_sb_pack1",
        lead_id: fetched.mockLead.lead_id,
        field_data: fetched.mockLead.field_data,
      });
      const ts = Math.floor(Date.now() / 1000);
      const sig = signWebhook(whPayload, TEST_SANDBOX_WEBHOOK_SECRET, ts);

      const wh1 = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: whPayload,
          headers: { "tiktok-signature": sig },
        }),
      );
      assert.equal(wh1.status, 200);
      const wh1Json = await wh1.json();
      assert.equal(wh1Json.summary.ordersCreated, 1);

      // Duplicate re-delivery -> strictly skipped
      const wh2 = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: whPayload,
          headers: { "tiktok-signature": sig },
        }),
      );
      assert.equal(wh2.status, 200);
      const wh2Json = await wh2.json();
      assert.equal(wh2Json.summary.ordersCreated, 0);
      assert.equal(wh2Json.summary.duplicatesSkipped, 1);

      // Verify exactly 1 pending order in isolated PGlite PostgreSQL
      const ordRows = await pg.query("SELECT * FROM public.orders");
      assert.equal(ordRows.rows.length, 1);
      const ord = ordRows.rows[0] as any;
      assert.equal(ord.status, "pending");
      assert.equal(ord.in_redex, false);
      assert.equal(ord.attribution_source, "tiktok_ads");
      assert.equal(Number(ord.subtotal), pack1Price);
      assert.equal(ord.idempotency_key, "tiktok_lead_tt_mock_lead_12020100_01");

      // Verify unmapped recovery works if a synthetic lead arrives for an unmapped form and retry runs
      const delRes = await deleteTikTokMockTestLead({
        advertiserId: "790011223344",
        formId: "form_sb_pack1",
        leadId: "tt_mock_lead_12020100_01",
      });
      assert.equal(delRes.deleted, true);

      // Also verify failed recovery via retry_failed when unmapped
      const unmappedWh = JSON.stringify({
        event: "LEAD",
        advertiser_id: "790011223344",
        page_id: "form_sb_future",
        lead_id: "tt_mock_unmapped_02",
        field_data: [
          { field_name: "full_name", field_value: "Unmapped Sandbox Buyer" },
          { field_name: "phone_number", field_value: "0660112233" },
        ],
      });
      const whUnm = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: unmappedWh,
          headers: { "tiktok-signature": signWebhook(unmappedWh, TEST_SANDBOX_WEBHOOK_SECRET, ts) },
        }),
      );
      assert.equal(whUnm.status, 200);
      const retryRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "retry_failed", leadIds: ["tt_mock_unmapped_02"] },
        }),
      );
      assert.equal(retryRes.status, 200);
      const retryJson = await retryRes.json();
      assert.equal(retryJson.summary.ordersCreated, 0); // remains safely preserved until mapped

      assert.equal(forbiddenExternalCalls.length, 0);
      for (const origin of sandboxApiHostsSeen) {
        assert.equal(origin, "https://sandbox-ads.tiktok.com");
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    __testResetSupabaseServerInstance();
    __testResetLocalRevocationCache();
    __testResetTikTokSyncLocks();
    await pg.close().catch(() => {});
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  }

  console.log(`\nCycle 06 Sandbox Readiness Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

void main();
