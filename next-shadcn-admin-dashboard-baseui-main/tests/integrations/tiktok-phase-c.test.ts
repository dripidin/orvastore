/**
 * ORVA Store — TikTok Lead Generation Integration
 * Phase C Admin Dashboard UI, DTO Safety & Opt-In Telegram Verification Suite
 *
 * Covers:
 * 1. Connection states (not_configured, not_connected, connected, token_expired, revoked, error)
 * 2. OAuth callback redirect query handling (success + all error codes + XSS immunity)
 * 3. Advertiser listing, active selection rendering, webhook status & 403 permission handling
 * 4. Forms listing, filtering, and client-side pagination
 * 5. Real ORVA catalog product mapping payload strictness (zero client price/name/packId) + Zone-5 Stop-Desk warning
 * 6. DELETED and unmapped forms detection & sync toggle guards
 * 7. Synchronization controls (per-form, sync_all, retry_failed, reconcile <= 90d, 409 Conflict)
 * 8. Logs & lead recovery rendering (masked phones only, clear failure explanations, zero raw PII)
 * 9. Opt-in Telegram toggle end-to-end against real PGlite + connect route (default OFF, isolated from checkout, env-lock 409, zero credential leak)
 * 10. Loading, empty, error, success, unauthorized 401/403 states
 * 11. Responsive mobile/desktop & RTL markup verification
 * 12. Static client bundle security audit (zero server module imports, zero secrets, registry entry)
 *
 * Run: npx tsx tests/integrations/tiktok-phase-c.test.ts
 * Zero production DB calls. Zero real customer PII. Zero real TikTok credentials.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Next.js uses automatic JSX runtime during build; expose React globally for tsx SSR tests of shadcn UI primitives
(globalThis as Record<string, unknown>).React = React;
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
import { isTikTokTelegramAlertsEnabled } from "../../src/lib/integrations/tiktok/leads";
import {
  GET as connectGET,
  POST as connectPOST,
} from "../../src/app/api/integrations/tiktok/connect/route";
import { getIntegrationById } from "../../src/lib/settings/integrations-registry";

import {
  DEFAULT_FORMS_PAGE_SIZE,
  type MappableCatalogProduct,
  type PublicTikTokAdAccount,
  type PublicTikTokConnection,
  type PublicTikTokForm,
  type TikTokConfigurationReadiness,
  type TikTokDashboardSnapshot,
  type TikTokRecoverableLead,
  type TikTokSyncLogItem,
  buildProductMappingPayload,
  canToggleFormSync,
  clampReconcileLookbackDays,
  deriveTikTokConnectionUiState,
  filterTikTokForms,
  formatTikTokApiError,
  getLeadFailureExplanation,
  getWilayaDeliveryNotice,
  paginateItems,
  parseTikTokOAuthCallbackNotice,
} from "../../src/app/(main)/dashboard/settings/tiktok-leads-types";
import { TikTokLeadsIntegrationCard } from "../../src/app/(main)/dashboard/settings/tiktok-leads-integration-card";

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

const TEST_ORIGIN = "https://www.orva-store.com";
const TEST_HOST = "www.orva-store.com";
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

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

// ── Minimal PGlite PostgREST Adapter (for real DB verification of connect/telegramOptIn) ─

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
  "delivery_settings",
  "localization",
  "reassurance_pillars",
  "homepage_content",
  "social_links",
]);

function quoteIdent(id: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Invalid SQL identifier: ${id}`);
  }
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
          const serialized =
            v === undefined
              ? null
              : v !== null && JSONB_COLUMNS.has(col) && typeof v === "object"
                ? JSON.stringify(v)
                : v;
          params.push(serialized);
          return `$${params.length}`;
        };

        const buildWhere = () => {
          if (filters.length === 0) return "";
          return ` WHERE ${filters
            .map((f) =>
              f.val === null
                ? `${quoteIdent(f.col)} IS NULL`
                : `${quoteIdent(f.col)} = ${addParam(f.col, f.val)}`,
            )
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
          const values = rows.map((r) => `(${cols.map((c) => addParam(c, r[c])).join(", ")})`);
          sql = `INSERT INTO ${safeTable} (${colList}) VALUES ${values.join(", ")}`;
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
        }

        const res = await pg.query(sql, params);
        const rows = res.rows ?? [];
        if (mode === "single") {
          if (rows.length === 0) return { data: null, error: { code: "PGRST116", message: "Not found" } };
          return { data: rows[0], error: null };
        }
        if (mode === "maybeSingle") {
          return { data: rows[0] ?? null, error: null };
        }
        return { data: rows, error: null };
      } catch (err: any) {
        return { data: null, error: { message: err?.message || String(err) } };
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
      eq(col: string, val: unknown) {
        filters.push({ col, op: "=", val });
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

// ── Synthetic Fixtures (Zero Real Data / Zero Secrets) ───────────────────────

const SAMPLE_READINESS_OK: TikTokConfigurationReadiness = {
  configured: true,
  missingKeys: [],
  redirectUriValid: true,
  encryptionKeyValid: true,
  sandboxMode: false,
  telegramAlertsOptIn: false,
};

const SAMPLE_READINESS_MISSING: TikTokConfigurationReadiness = {
  configured: false,
  missingKeys: ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET", "TIKTOK_TOKEN_ENCRYPTION_KEY"],
  redirectUriValid: false,
  encryptionKeyValid: false,
  sandboxMode: true,
  telegramAlertsOptIn: false,
};

const SAMPLE_CONNECTION: PublicTikTokConnection = {
  id: "conn-synth-01",
  storeId: "orvastore",
  appId: "740011223344",
  status: "connected",
  scopes: [12010100, 12020100],
  hasRefreshToken: true,
  tokenExpiresAt: "2026-12-01T12:00:00.000Z",
  refreshExpiresAt: "2027-06-01T12:00:00.000Z",
  selectedAdvertiserId: "7111222333444",
  connectedBy: "admin",
  lastError: null,
  connectedAt: "2026-11-19T10:00:00.000Z",
  updatedAt: "2026-11-19T10:05:00.000Z",
};

const SAMPLE_ACCOUNTS: PublicTikTokAdAccount[] = [
  {
    id: "acc-row-1",
    advertiserId: "7111222333444",
    advertiserName: "ORVA Algeria Performance",
    currency: "USD",
    timezone: "Africa/Algiers",
    accountStatus: "STATUS_ENABLE",
    isSelected: true,
    webhookSubscribed: true,
    updatedAt: "2026-11-19T10:05:00.000Z",
  },
  {
    id: "acc-row-2",
    advertiserId: "7999888777666",
    advertiserName: "ORVA Backup Account",
    currency: "USD",
    timezone: "Africa/Algiers",
    accountStatus: "STATUS_REVOKED",
    isSelected: false,
    webhookSubscribed: false,
    updatedAt: "2026-11-19T10:05:00.000Z",
  },
];

const SAMPLE_PRODUCTS: MappableCatalogProduct[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "pack1",
    packId: "PACK1",
    title: "Pack 1 Pro 4-in-1",
    sellingPrice: 4950,
    stockQuantity: 42,
    status: "active",
    showOutOfStock: false,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "pack2",
    packId: "PACK2",
    title: "Pack 2 Crown Elite",
    sellingPrice: 6800,
    stockQuantity: 15,
    status: "active",
    showOutOfStock: false,
  },
];

const SAMPLE_FORMS: PublicTikTokForm[] = [
  {
    id: "form-row-1",
    advertiserId: "7111222333444",
    formId: "form_mapped_active",
    formName: "حملة Pack 1 الجزائر",
    status: "ACTIVE",
    fields: [
      { field_id: "f1", field_name: "الاسم الكامل", field_type: "TEXT", required: true },
      { field_id: "f2", field_name: "رقم الهاتف", field_type: "PHONE_NUMBER", required: true },
    ],
    syncEnabled: true,
    lastSyncedAt: "2026-11-19T11:00:00.000Z",
    totalLeadsImported: 18,
    mapping: {
      productId: SAMPLE_PRODUCTS[0].id,
      packId: "PACK1",
      productName: "Pack 1 Pro 4-in-1",
      productPrice: 4950,
      defaultWilayaCode: 16,
      defaultDeliveryType: "DOMICILE",
      autoCreateOrder: true,
      leadSourceLabel: "tiktok_ads",
    },
  },
  {
    id: "form-row-2",
    advertiserId: "7111222333444",
    formId: "form_unmapped_active",
    formName: "نموذج جديد بدون ربط",
    status: "ACTIVE",
    fields: [],
    syncEnabled: false,
    lastSyncedAt: null,
    totalLeadsImported: 0,
    mapping: null,
  },
  {
    id: "form-row-3",
    advertiserId: "7111222333444",
    formId: "form_deleted_old",
    formName: "حملة قديمة محذوفة",
    status: "DELETED",
    fields: [],
    syncEnabled: false,
    lastSyncedAt: "2026-11-10T09:00:00.000Z",
    totalLeadsImported: 5,
    mapping: null,
  },
];

const SAMPLE_RECOVERABLE_LEADS: TikTokRecoverableLead[] = [
  {
    id: "lead-row-1",
    externalLeadId: "tt_lead_invalid_01",
    formId: "form_mapped_active",
    advertiserId: "7111222333444",
    customerName: "كريم بن علي",
    maskedPhone: "0550 •• •• 89",
    phoneValid: false,
    wilayaCode: 16,
    wilayaName: "الجزائر",
    mappedProductName: "Pack 1 Pro 4-in-1",
    orderId: null,
    syncStatus: "invalid_phone",
    retryCount: 0,
    errorMessage: "Phone did not match Algerian 05/06/07 format.",
    importedAt: "2026-11-19T11:10:00.000Z",
  },
  {
    id: "lead-row-2",
    externalLeadId: "tt_lead_unmapped_02",
    formId: "form_unmapped_active",
    advertiserId: "7111222333444",
    customerName: "سارة منصوري",
    maskedPhone: "0661 •• •• 34",
    phoneValid: true,
    wilayaCode: 31,
    wilayaName: "وهران",
    mappedProductName: null,
    orderId: null,
    syncStatus: "unmapped_form",
    retryCount: 1,
    errorMessage: null,
    importedAt: "2026-11-19T11:15:00.000Z",
  },
  {
    id: "lead-row-3",
    externalLeadId: "tt_lead_failed_03",
    formId: "form_mapped_active",
    advertiserId: "7111222333444",
    customerName: "أمين قاسمي",
    maskedPhone: "0770 •• •• 12",
    phoneValid: true,
    wilayaCode: 7,
    wilayaName: "بسكرة",
    mappedProductName: "Pack 1 Pro 4-in-1",
    orderId: "ORV-TT-9901",
    syncStatus: "order_creation_failed",
    retryCount: 2,
    errorMessage: "Transient DB write timeout.",
    importedAt: "2026-11-19T11:20:00.000Z",
  },
];

const SAMPLE_LOGS: TikTokSyncLogItem[] = [
  {
    id: "log-1",
    advertiserId: "7111222333444",
    formId: "form_mapped_active",
    triggerSource: "manual",
    status: "partial",
    leadsFetched: 6,
    leadsImported: 5,
    ordersCreated: 3,
    duplicatesSkipped: 1,
    leadsFailed: 2,
    durationMs: 412,
    errorMessage: null,
    startedAt: "2026-11-19T11:21:00.000Z",
    completedAt: "2026-11-19T11:21:01.000Z",
  },
];

function buildFullSnapshot(overrides?: Partial<TikTokDashboardSnapshot>): TikTokDashboardSnapshot {
  return {
    readiness: SAMPLE_READINESS_OK,
    connection: SAMPLE_CONNECTION,
    telegramOptIn: {
      enabled: false,
      source: "default",
      envLocked: false,
      existingTelegramConfigured: true,
    },
    accounts: SAMPLE_ACCOUNTS,
    forms: SAMPLE_FORMS,
    catalogProducts: SAMPLE_PRODUCTS,
    logs: SAMPLE_LOGS,
    leadStats: {
      totalSampled: 12,
      byStatus: {
        order_created: 7,
        duplicate_skipped: 2,
        invalid_phone: 1,
        unmapped_form: 1,
        order_creation_failed: 1,
        lead_saved_no_order: 0,
        pending: 0,
      },
    },
    recoverableLeads: SAMPLE_RECOVERABLE_LEADS,
    ...overrides,
  };
}

function makeAdminRequest(
  urlPath: string,
  options: {
    method?: string;
    sessionToken?: string;
    origin?: string | null;
    body?: unknown;
  } = {},
): NextRequest {
  const method = options.method ?? "GET";
  const headers = new Headers();
  headers.set("host", TEST_HOST);
  if (options.origin !== undefined && options.origin !== null) {
    headers.set("origin", options.origin);
  } else if (options.origin === undefined && method !== "GET") {
    headers.set("origin", TEST_ORIGIN);
  }
  if (options.sessionToken) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${options.sessionToken}`);
  }
  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
    headers.set("content-type", "application/json");
  }
  return new NextRequest(`${TEST_ORIGIN}${urlPath}`, {
    method,
    headers,
    body: method !== "GET" ? bodyStr : undefined,
  });
}

async function main() {
  console.log("\n=== ORVA STORE — TikTok Phase C Dashboard UI & Opt-In Verification Suite ===\n");

  const savedEnv = { ...process.env };
  process.env.ADMIN_JWT_SECRET = "phase_c_admin_jwt_secret_synthetic_32chars_min";
  process.env.TIKTOK_APP_ID = "tt_phase_c_app_001";
  process.env.TIKTOK_APP_SECRET = "tt_phase_c_secret_synthetic_000111222";
  process.env.TIKTOK_REDIRECT_URI = "https://www.orva-store.com/api/integrations/tiktok/callback/";
  process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  delete process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;

  let pg: PGlite | null = null;

  try {
    // ── Test 1: Connection States Rendering (all 6 states) ───────────────────
    await runTest("1. Connection states (not_configured, not_connected, connected, token_expired, revoked, error) render honestly", () => {
      // not_configured
      const sNotCfg = deriveTikTokConnectionUiState(SAMPLE_READINESS_MISSING, null);
      assert.equal(sNotCfg.state, "not_configured");
      const htmlNotCfg = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot({
            readiness: SAMPLE_READINESS_MISSING,
            connection: null,
            accounts: [],
            forms: [],
            logs: [],
            recoverableLeads: [],
          }),
        }),
      );
      assert.ok(htmlNotCfg.includes("غير مهيأ على الخادم"));
      assert.ok(htmlNotCfg.includes("TIKTOK_APP_ID"));
      assert.ok(htmlNotCfg.includes("TIKTOK_TOKEN_ENCRYPTION_KEY"));
      assert.ok(htmlNotCfg.includes("وضع Sandbox التجريبي"));

      // not_connected
      const sNotConn = deriveTikTokConnectionUiState(SAMPLE_READINESS_OK, null);
      assert.equal(sNotConn.state, "not_connected");
      const htmlNotConn = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot({ connection: null, accounts: [], forms: [] }),
        }),
      );
      assert.ok(htmlNotConn.includes("غير متصل"));
      assert.ok(htmlNotConn.includes("ربط حساب TikTok Business"));

      // connected
      const sConn = deriveTikTokConnectionUiState(SAMPLE_READINESS_OK, SAMPLE_CONNECTION);
      assert.equal(sConn.state, "connected");
      assert.equal(sConn.requiresReconnect, false);
      const htmlConn = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(htmlConn.includes("متصل ونشط"));
      assert.ok(htmlConn.includes("فصل حساب TikTok"));
      assert.ok(htmlConn.includes("740011223344"));

      // token_expired
      const sExp = deriveTikTokConnectionUiState(SAMPLE_READINESS_OK, {
        ...SAMPLE_CONNECTION,
        status: "token_expired",
      });
      assert.equal(sExp.state, "token_expired");
      assert.equal(sExp.requiresReconnect, true);
      const htmlExp = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot({
            connection: { ...SAMPLE_CONNECTION, status: "token_expired" },
          }),
        }),
      );
      assert.ok(htmlExp.includes("انتهت صلاحية الرمز"));
      assert.ok(htmlExp.includes("يتطلب إعادة التفويض"));

      // revoked
      const sRev = deriveTikTokConnectionUiState(SAMPLE_READINESS_OK, {
        ...SAMPLE_CONNECTION,
        status: "revoked",
      });
      assert.equal(sRev.state, "revoked");
      assert.equal(sRev.requiresReconnect, true);
      const htmlRev = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot({
            connection: { ...SAMPLE_CONNECTION, status: "revoked" },
          }),
        }),
      );
      assert.ok(htmlRev.includes("تم سحب الصلاحية"));

      // error
      const sErr = deriveTikTokConnectionUiState(SAMPLE_READINESS_OK, {
        ...SAMPLE_CONNECTION,
        status: "error",
        lastError: "Upstream OAuth handshake rejected",
      });
      assert.equal(sErr.state, "error");
      assert.equal(sErr.requiresReconnect, true);
    });

    // ── Test 2: OAuth Success & Failure Redirect Handling + XSS Immunity ─────
    await runTest("2. OAuth callback query parser handles success, all error codes, and blocks XSS reflection", () => {
      const okNotice = parseTikTokOAuthCallbackNotice(
        new URLSearchParams("tab=tiktok&tiktok_status=connected"),
      );
      assert.ok(okNotice);
      assert.equal(okNotice.type, "success");
      assert.equal(okNotice.code, "connected");

      for (const code of [
        "oauth_denied",
        "missing_callback_params",
        "missing_state_cookie",
        "invalid_state",
        "token_exchange_failed",
      ]) {
        const notice = parseTikTokOAuthCallbackNotice(
          new URLSearchParams(`tab=tiktok&tiktok_status=error&tiktok_error=${code}`),
        );
        assert.ok(notice);
        assert.equal(notice.type, "error");
        assert.equal(notice.code, code);
      }

      // XSS injection attempt must NEVER be reflected
      const xssParams = new URLSearchParams(
        "tab=tiktok&tiktok_status=error&tiktok_error=<script>alert(1)</script>",
      );
      const xssNotice = parseTikTokOAuthCallbackNotice(xssParams);
      assert.ok(xssNotice);
      assert.equal(xssNotice.code, "unknown_oauth_error");
      assert.ok(!xssNotice.messageAr.includes("<script>"));
      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          callbackParams: xssParams,
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(!html.includes("<script>alert(1)</script>"));
      assert.ok(html.includes("فشل إتمام ربط TikTok Business"));
    });

    // ── Test 3: Advertiser Listing, Selection & 403 Permission Handling ──────
    await runTest("3. Advertiser listing, active/webhook badges & 403 Lead Retrieval (12010100) permission errors", () => {
      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(html.includes("ORVA Algeria Performance"));
      assert.ok(html.includes("7111222333444"));
      assert.ok(html.includes("الحساب النشط"));
      assert.ok(html.includes("Webhook مفعّل"));
      assert.ok(html.includes("STATUS_REVOKED"));
      assert.ok(html.includes("/api/integrations/tiktok/webhook/"));

      const perm403 = formatTikTokApiError(403, {
        code: "AUTH_PERMISSION_DENIED",
        error: "Missing scope 12010100 (Leads Retrieval)",
      });
      assert.equal(perm403.isPermissionError, true);
      assert.ok(perm403.messageAr.includes("12010100"));

      const csrf403 = formatTikTokApiError(403, {
        code: "CSRF_ORIGIN_MISMATCH",
        error: "Origin mismatch",
      });
      assert.equal(csrf403.isPermissionError, true);
      assert.ok(csrf403.messageAr.includes("CSRF"));
    });

    // ── Test 4: Forms Listing, Filtering & Client-Side Pagination ────────────
    await runTest("4. Instant Forms filtering and client-side pagination across 14 forms", () => {
      const fourteenForms: PublicTikTokForm[] = Array.from({ length: 14 }, (_, i) => ({
        id: `row-${i + 1}`,
        advertiserId: "7111222333444",
        formId: `form_${i + 1}`,
        formName: i === 13 ? "Deleted Legacy Form" : `TikTok Lead Form #${i + 1}`,
        status: i === 13 ? "DELETED" : "ACTIVE",
        fields: [],
        syncEnabled: i < 5,
        lastSyncedAt: null,
        totalLeadsImported: i,
        mapping:
          i < 8
            ? {
                productId: SAMPLE_PRODUCTS[0].id,
                packId: "PACK1",
                productName: "Pack 1 Pro 4-in-1",
                productPrice: 4950,
                defaultWilayaCode: 16,
                defaultDeliveryType: "DOMICILE",
                autoCreateOrder: true,
                leadSourceLabel: "tiktok_ads",
              }
            : null,
      }));

      assert.equal(filterTikTokForms(fourteenForms, "", "all").length, 14);
      assert.equal(filterTikTokForms(fourteenForms, "", "mapped").length, 8);
      assert.equal(filterTikTokForms(fourteenForms, "", "unmapped").length, 5);
      assert.equal(filterTikTokForms(fourteenForms, "", "sync_enabled").length, 5);
      assert.equal(filterTikTokForms(fourteenForms, "", "deleted").length, 1);
      assert.equal(filterTikTokForms(fourteenForms, "form_12", "all").length, 1);

      const page1 = paginateItems(fourteenForms, 1, DEFAULT_FORMS_PAGE_SIZE);
      assert.equal(page1.totalPages, 3);
      assert.equal(page1.items.length, 6);
      assert.equal(page1.startIndex, 0);
      assert.equal(page1.endIndex, 6);

      const page3 = paginateItems(fourteenForms, 3, DEFAULT_FORMS_PAGE_SIZE);
      assert.equal(page3.page, 3);
      assert.equal(page3.items.length, 2);

      // Out-of-bounds page clamped safely
      const clampedHigh = paginateItems(fourteenForms, 99, DEFAULT_FORMS_PAGE_SIZE);
      assert.equal(clampedHigh.page, 3);
      const clampedLow = paginateItems(fourteenForms, -4, DEFAULT_FORMS_PAGE_SIZE);
      assert.equal(clampedLow.page, 1);

      // Rendered pagination controls present when > 6 forms
      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot({ forms: fourteenForms }),
        }),
      );
      assert.ok(html.includes("صفحة 1 / 3"));
      assert.ok(html.includes("من أصل 14 نموذج"));
    });

    // ── Test 5: Product Mapping Payload Strictness & Southern Wilaya Notice ──
    await runTest("5. Product mapping sends strictly productId (never client price/name/packId) & displays authoritative server DZD price + Zone-5 warning", () => {
      const payload = buildProductMappingPayload({
        formId: "form_unmapped_active",
        productId: SAMPLE_PRODUCTS[0].id,
        defaultWilayaCode: 58,
        defaultDeliveryType: "STOP_DESK",
        autoCreateOrder: true,
        syncEnabled: true,
      });

      assert.equal(payload.action, "map_product");
      assert.equal(payload.productId, SAMPLE_PRODUCTS[0].id);
      assert.equal(payload.defaultWilayaCode, 58);
      assert.equal("productPrice" in payload, false);
      assert.equal("productName" in payload, false);
      assert.equal("packId" in payload, false);

      assert.throws(() =>
        buildProductMappingPayload({
          formId: "form_unmapped_active",
          productId: "",
          defaultWilayaCode: 16,
          defaultDeliveryType: "DOMICILE",
          autoCreateOrder: true,
        }),
      );

      // Zone 5 / Southern Wilaya STOP_DESK fallback notice
      const southNotice = getWilayaDeliveryNotice(58, "STOP_DESK");
      assert.ok(southNotice && southNotice.includes("DOMICILE"));
      const adrarNotice = getWilayaDeliveryNotice(1, "STOP_DESK");
      assert.ok(adrarNotice && adrarNotice.includes("DOMICILE"));
      assert.equal(getWilayaDeliveryNotice(16, "STOP_DESK"), null);
      assert.equal(getWilayaDeliveryNotice(58, "DOMICILE"), null);

      // Rendered authoritative server price & product name
      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(html.includes("Pack 1 Pro 4-in-1"));
      assert.ok(html.includes("4,950 د.ج"));
    });

    // ── Test 6: Deleted & Unmapped Forms Clearly Flagged & Sync Blocked ──────
    await runTest("6. Deleted (DELETED) and unmapped forms are clearly identified and cannot enable sync", () => {
      const mappedGuard = canToggleFormSync(SAMPLE_FORMS[0]);
      assert.equal(mappedGuard.canEnable, true);
      assert.equal(mappedGuard.allowed, true);

      const unmappedGuard = canToggleFormSync(SAMPLE_FORMS[1]);
      assert.equal(unmappedGuard.canEnable, false);
      assert.ok(unmappedGuard.reasonAr && unmappedGuard.reasonAr.includes("كتالوج ORVA"));

      const deletedGuard = canToggleFormSync(SAMPLE_FORMS[2]);
      assert.equal(deletedGuard.canEnable, false);
      assert.equal(deletedGuard.allowed, false);
      assert.ok(deletedGuard.reasonAr && deletedGuard.reasonAr.includes("حذف"));

      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(html.includes("محذوف من TikTok (DELETED)"));
      assert.ok(html.includes("غير مربوط بمنتج"));
    });

    // ── Test 7: Synchronization Controls, Reconcile <= 90d & 409 Conflict ────
    await runTest("7. Sync controls, reconciliation <= 90d clamp & 409/429 error mapping", () => {
      assert.equal(clampReconcileLookbackDays(7), 7);
      assert.equal(clampReconcileLookbackDays(90), 90);
      assert.equal(clampReconcileLookbackDays(180), 90);
      assert.equal(clampReconcileLookbackDays(0), 1);
      assert.equal(clampReconcileLookbackDays(Number.NaN), 7);

      const conflict = formatTikTokApiError(409, { code: "CONCURRENT_SYNC_IN_PROGRESS" });
      assert.equal(conflict.isConflict, true);
      assert.ok(conflict.messageAr.includes("409"));

      const rateLimit = formatTikTokApiError(429, { code: "RATE_LIMITED" });
      assert.ok(rateLimit.messageAr.includes("429"));

      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(html.includes("مزامنة جميع النماذج المفعّلة"));
      assert.ok(html.includes("إعادة محاولة العملاء الفاشلين"));
      assert.ok(html.includes("مزامنة تاريخية (حتى 90 يوماً)"));
      assert.ok(html.includes("آخر 90 يوم"));
    });

    // ── Test 8: Logs & Lead Recovery (Masked Phones ONLY, Clear Explanations) ─
    await runTest("8. Logs & lead recovery display masked phones only, Arabic failure reasons, and order links", () => {
      const inv = getLeadFailureExplanation("invalid_phone");
      assert.equal(inv.retryable, false);
      assert.ok(inv.explanationAr.includes("05 / 06 / 07"));

      const unm = getLeadFailureExplanation("unmapped_form");
      assert.equal(unm.retryable, true);
      assert.ok(unm.actionHintAr.includes("كتالوج ORVA"));

      const fail = getLeadFailureExplanation("order_creation_failed");
      assert.equal(fail.retryable, true);

      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      // Masked phones present
      assert.ok(html.includes("0550 •• •• 89"));
      assert.ok(html.includes("0661 •• •• 34"));
      assert.ok(html.includes("0770 •• •• 12"));
      // Zero unmasked 10-digit Algerian mobile phones in rendered output
      assert.equal(/(05|06|07)\d{8}/.test(html), false, "Raw unmasked Algerian phone must never appear");
      // Failure explanations rendered
      assert.ok(html.includes("رقم هاتف غير صالح"));
      assert.ok(html.includes("نموذج غير مربوط بمنتج"));
      assert.ok(html.includes("تعذر إنشاء الطلب"));
      // Order deep link rendered
      assert.ok(html.includes("/dashboard/ecommerce/?orderId=ORV-TT-9901#orders"));
      // Audit log rendered
      assert.ok(html.includes("412 ms"));
      assert.ok(html.includes("مزامنة يدوية"));
    });

    // ── Test 9: Opt-In Telegram End-to-End Against Real PGlite + Connect Route ─
    pg = new PGlite({ extensions: { uuid_ossp, pgcrypto } });
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

    // Seed site_settings row 1 with checkout Telegram credentials (synthetic)
    const syntheticBotToken = "999999:SYNTHETIC_CHECKOUT_BOT_TOKEN_DO_NOT_LEAK";
    const syntheticChatId = "-100999888777";
    await pg.query(
      `INSERT INTO public.site_settings (id, telegram_bot_token, telegram_chat_id, telegram_alerts_enabled, integrations)
       VALUES (1, $1, $2, true, $3::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         telegram_bot_token = EXCLUDED.telegram_bot_token,
         telegram_chat_id = EXCLUDED.telegram_chat_id,
         telegram_alerts_enabled = EXCLUDED.telegram_alerts_enabled,
         integrations = EXCLUDED.integrations`,
      [
        syntheticBotToken,
        syntheticChatId,
        JSON.stringify({
          courier: { active_provider: "redex", enabled: true },
          telegram: { enabled: true, bot_token: syntheticBotToken, chat_id: syntheticChatId },
        }),
      ],
    );

    const adapter = createPgliteSupabaseAdapter(pg);
    __testSetSupabaseServerInstance(adapter as any);
    __testResetLocalRevocationCache();
    const adminToken = generateSessionToken("phase-c-admin");

    await runTest("9. Opt-in Telegram alerts: default OFF, persists isolated flag without touching checkout Telegram, respects env lock 409 & zero token leak", async () => {
      // Unauthenticated 401
      const unauthRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          body: { action: "set_telegram_opt_in", enabled: true },
        }),
      );
      assert.equal(unauthRes.status, 401);

      // CSRF mismatch 403
      const csrfRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          origin: "https://evil.example.com",
          body: { action: "set_telegram_opt_in", enabled: true },
        }),
      );
      assert.equal(csrfRes.status, 403);

      // GET /connect/ defaults strictly to enabled: false & leaks zero Telegram secrets
      const get1 = await connectGET(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "GET",
          sessionToken: adminToken,
        }),
      );
      assert.equal(get1.status, 200);
      const body1 = await get1.json();
      assert.equal(body1.telegramOptIn.enabled, false);
      assert.equal(body1.telegramOptIn.source, "default");
      assert.equal(body1.telegramOptIn.envLocked, false);
      assert.equal(body1.telegramOptIn.existingTelegramConfigured, true);
      assert.equal(JSON.stringify(body1).includes(syntheticBotToken), false);
      assert.equal(JSON.stringify(body1).includes(syntheticChatId), false);
      assert.equal(await isTikTokTelegramAlertsEnabled(), false);

      // POST enable opt-in
      const enableRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "set_telegram_opt_in", enabled: true },
        }),
      );
      assert.equal(enableRes.status, 200);
      const enableBody = await enableRes.json();
      assert.equal(enableBody.telegramOptIn.enabled, true);
      assert.equal(enableBody.telegramOptIn.source, "site_settings");
      assert.equal(await isTikTokTelegramAlertsEnabled(), true);

      // Verify checkout Telegram settings were NEVER modified
      const rowCheck = await pg!.query(
        "SELECT telegram_alerts_enabled, telegram_bot_token, integrations FROM public.site_settings WHERE id = 1",
      );
      const row = rowCheck.rows[0] as any;
      assert.equal(row.telegram_alerts_enabled, true);
      assert.equal(row.telegram_bot_token, syntheticBotToken);
      assert.equal(row.integrations.telegram.enabled, true);
      assert.equal(row.integrations.courier.active_provider, "redex");
      assert.equal(row.integrations.tiktok.telegram_alerts_enabled, true);

      // POST disable opt-in
      const disableRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "set_telegram_opt_in", enabled: false },
        }),
      );
      assert.equal(disableRes.status, 200);
      assert.equal(await isTikTokTelegramAlertsEnabled(), false);

      // Env lock returns 409 Conflict
      process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED = "false";
      const lockedGet = await connectGET(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "GET",
          sessionToken: adminToken,
        }),
      );
      const lockedGetBody = await lockedGet.json();
      assert.equal(lockedGetBody.telegramOptIn.envLocked, true);
      assert.equal(lockedGetBody.telegramOptIn.source, "env");
      assert.equal(lockedGetBody.telegramOptIn.enabled, false);

      const lockedPost = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "set_telegram_opt_in", enabled: true },
        }),
      );
      assert.equal(lockedPost.status, 409);
      const lockedPostBody = await lockedPost.json();
      assert.equal(lockedPostBody.code, "TELEGRAM_OPT_IN_ENV_LOCKED");
      delete process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;

      // SSR UI displays opt-in disabled notice & explicitly clarifies zero confirmation / zero Redex dispatch
      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(html.includes("معطّل افتراضياً"));
      assert.ok(html.includes("لا يقوم أبداً بتأكيد الطلب ولا بإرساله إلى شركة التوصيل Redex"));
    });

    // ── Test 10: Unauthorized, Server Error, Loading & Empty States ──────────
    await runTest("10. Loading, empty, unauthorized (401) and server error (502/503) states", () => {
      const err401 = formatTikTokApiError(401, { code: "UNAUTHORIZED" });
      assert.equal(err401.isAuthError, true);
      assert.ok(err401.messageAr.includes("401"));

      const errExpired = formatTikTokApiError(401, { code: "AUTH_TOKEN_EXPIRED" });
      assert.equal(errExpired.isAuthError, true);
      assert.ok(errExpired.messageAr.includes("انتهت صلاحية رمز الوصول"));

      const err503 = formatTikTokApiError(503, { error: "DB down" });
      assert.ok(err503.messageAr.includes("مؤقتاً"));

      // Default mount without initialData renders loading state cleanly
      const loadingHtml = renderToStaticMarkup(React.createElement(TikTokLeadsIntegrationCard, {}));
      assert.ok(loadingHtml.includes("جاري التحقق من حالة اتصال TikTok Ads"));

      // Empty states for accounts, forms, leads, logs
      const emptyHtml = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot({
            connection: null,
            accounts: [],
            forms: [],
            logs: [],
            recoverableLeads: [],
          }),
        }),
      );
      assert.ok(emptyHtml.includes("لا توجد حسابات إعلانية مخزنة حالياً"));
      assert.ok(emptyHtml.includes("لا توجد نماذج فورية محفوظة لهذا الحساب بعد"));
      assert.ok(emptyHtml.includes("لا يوجد عملاء متعثرون أو بانتظار الاسترداد حالياً"));
      assert.ok(emptyHtml.includes("لم تُسجّل أي عملية مزامنة بعد"));
    });

    // ── Test 11: Responsive Mobile & Desktop Layout + RTL Verification ───────
    await runTest("11. Responsive desktop/mobile classes, overflow-x-auto tables & RTL container", () => {
      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.ok(html.includes('dir="rtl"'));
      assert.ok(html.includes("grid-cols-1"));
      assert.ok(html.includes("sm:grid-cols-2"));
      assert.ok(html.includes("lg:grid-cols-4"));
      assert.ok(html.includes("overflow-x-auto"));
      assert.ok(html.includes("flex-wrap"));
    });

    // ── Test 12: Static Client Security & Registry Integrity Audit ───────────
    await runTest("12. Client security audit: zero server imports, zero secrets, zero NEXT_PUBLIC_TIKTOK, registry present, zero snap codes", () => {
      const clientFiles = [
        path.join(REPO_ROOT, "src/app/(main)/dashboard/settings/tiktok-leads-types.ts"),
        path.join(REPO_ROOT, "src/app/(main)/dashboard/settings/tiktok-leads-integration-card.tsx"),
        path.join(REPO_ROOT, "src/app/(main)/dashboard/settings/settings-integrations.tsx"),
      ];

      for (const filePath of clientFiles) {
        const src = fs.readFileSync(filePath, "utf8");
        assert.equal(
          /from\s+["']@\/lib\/integrations\/tiktok/.test(src),
          false,
          `Client file ${path.basename(filePath)} must NEVER import server TikTok modules`,
        );
        assert.equal(
          /submitCodOrderAction/.test(src),
          false,
          `Client file ${path.basename(filePath)} must NEVER invoke submitCodOrderAction`,
        );
        assert.equal(
          /NEXT_PUBLIC_TIKTOK/.test(src),
          false,
          `Client file ${path.basename(filePath)} must NEVER use NEXT_PUBLIC_TIKTOK*`,
        );
        assert.equal(
          /access_token_encrypted|refresh_token_encrypted/.test(src),
          false,
          `Client file ${path.basename(filePath)} must NEVER reference encrypted token columns`,
        );
      }

      // Verify TikTok Ads tab wired into settings-integrations.tsx
      const settingsSrc = fs.readFileSync(clientFiles[2], "utf8");
      assert.ok(settingsSrc.includes('value="tiktok"'));
      assert.ok(settingsSrc.includes("TikTokLeadsIntegrationCard"));

      // Verify rendered HTML leaks zero secrets or encrypted fields
      const html = renderToStaticMarkup(
        React.createElement(TikTokLeadsIntegrationCard, {
          initialData: buildFullSnapshot(),
        }),
      );
      assert.equal(html.includes("tt_phase_c_secret_synthetic_000111222"), false);
      assert.equal(html.includes(TEST_ENCRYPTION_KEY), false);
      assert.equal(html.includes("access_token"), false);
      assert.equal(html.includes("refresh_token_encrypted"), false);

      // Verify Integrations Registry entry
      const regItem = getIntegrationById("marketing-tiktok-leads");
      assert.ok(regItem, "marketing-tiktok-leads must be registered in INTEGRATION_REGISTRY");
      assert.equal(regItem.category, "analytics");
      assert.equal(regItem.status, "not_connected");
    });

    // ── Test 13: Trailing-Slash Endpoints, Strict Zod Rejections & Legacy Tabs Preservation ─
    await runTest("13. Trailing-slash API routes, strict Zod body validation & legacy Settings tabs preserved", async () => {
      // Every TikTok API endpoint must end with a trailing slash (next.config.mjs trailingSlash: true)
      const typesSrc = fs.readFileSync(
        path.join(REPO_ROOT, "src/app/(main)/dashboard/settings/tiktok-leads-types.ts"),
        "utf8",
      );
      for (const ep of [
        "/api/integrations/tiktok/connect/",
        "/api/integrations/tiktok/accounts/",
        "/api/integrations/tiktok/forms/",
        "/api/integrations/tiktok/sync/",
        "/api/integrations/tiktok/webhook/",
      ]) {
        assert.ok(typesSrc.includes(ep), `Expected trailing-slash endpoint ${ep}`);
      }

      // Strict Zod schema must reject unexpected extra keys on set_telegram_opt_in (e.g. botToken spoofing)
      const spoofRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: {
            action: "set_telegram_opt_in",
            enabled: true,
            telegram_alerts_enabled: false,
            botToken: "spoofed_token",
          },
        }),
      );
      assert.equal(spoofRes.status, 400);

      // Verify all existing Settings tabs remain intact alongside TikTok Ads
      const settingsSrc = fs.readFileSync(
        path.join(REPO_ROOT, "src/app/(main)/dashboard/settings/settings-integrations.tsx"),
        "utf8",
      );
      for (const tab of ["general", "gemini", "analytics", "tiktok", "delivery", "notifications"]) {
        assert.ok(settingsSrc.includes(`value="${tab}"`), `Missing Settings tab value="${tab}"`);
      }

      // Verify zero snap codes beside TikTok headlines
      const cardSrc = fs.readFileSync(
        path.join(REPO_ROOT, "src/app/(main)/dashboard/settings/tiktok-leads-integration-card.tsx"),
        "utf8",
      );
      assert.equal(/snap[-_\s]?code/i.test(cardSrc), false, "No snap codes permitted in TikTok Ads UI");
    });
  } finally {
    __testResetSupabaseServerInstance();
    __testResetLocalRevocationCache();
    if (pg) await pg.close().catch(() => {});
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
  }

  console.log(`\nPhase C Test Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
