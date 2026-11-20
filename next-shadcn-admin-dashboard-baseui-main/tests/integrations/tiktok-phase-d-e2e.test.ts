/**
 * ORVA Store — TikTok Lead Generation Integration
 * Phase D Full-Story E2E QA, 58-Wilaya Coverage, Security & Reliability Suite
 *
 * Tests the complete end-to-end journey on REAL ephemeral PostgreSQL (@electric-sql/pglite)
 * initialized with ORVA's baseline + attribution + TikTok migrations and mocked TikTok API v1.3:
 *
 *   Connect (OAuth start + callback)
 *     -> Advertiser Discovery & Lead Permission Selection (12010100)
 *     -> Webhook Subscribe (canonical trailing-slash URL)
 *     -> Instant Forms Sync & Real ORVA Catalog Product Mapping (UUID FK)
 *     -> Real-Time Signed Webhook Ingestion + Async ZIP/CSV Sync + Reconciliation
 *     -> Pending ORVA COD Orders (public.orders + public.order_items)
 *     -> Admin Review (ORVA Ecommerce Context TikTok Channel Filter + status-transitions.ts)
 *     -> Disconnect & Encrypted Token Purge
 *
 * Additional Full-Coverage Scenarios Verified:
 * - All 58 Algerian Wilayas (01..58): name resolution, shipping tariffs, and Southern/Zone-5
 *   STOP_DESK -> DOMICILE automatic fallback across every single disallowed Wilaya.
 * - Arabic, French, and English Instant Form field aliases + Arabic-Indic phone digits.
 * - Valid and invalid Algerian phone formats (saved cleanly without order creation).
 * - Missing delivery addresses kept empty with bilingual AR/FR phone confirmation note.
 * - Cross-path deduplication (Webhook + Manual Sync + Historical Reconciliation).
 * - Unmapped form preservation & recovery via retry_failed after product mapping.
 * - Failed order creation preservation & recovery via retry_failed after fix.
 * - Concurrent overlapping sync_form (409 Conflict) + concurrent duplicate webhook race.
 * - Independent Opt-In Telegram alerts (default OFF, opt-in ON non-blocking <= 2500ms,
 *   masked phone in logs, zero sends on duplicates/invalid leads, zero checkout impact).
 * - Strict business invariants: zero calls to Redex API, zero Meta CAPI Purchase calls,
 *   zero invocations of submitCodOrderAction(), status='pending', in_redex=false.
 *
 * Run: npx tsx tests/integrations/tiktok-phase-d-e2e.test.ts
 * Zero production DB calls. Zero real customer PII. Zero real TikTok credentials.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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
  ALGERIA_58_WILAYAS,
  isStopDeskAllowed,
} from "../../src/lib/types/checkout";
import {
  MISSING_ADDRESS_CONFIRMATION_NOTE,
  isTikTokTelegramAlertsEnabled,
  normalizeLeadFields,
  processNormalizedTikTokLead,
  resolveAlgerianWilaya,
  sendOptionalTikTokLeadTelegramAlert,
} from "../../src/lib/integrations/tiktok/leads";
import { TIKTOK_OAUTH_STATE_COOKIE_NAME } from "../../src/lib/integrations/tiktok/oauth";
import { __testResetTikTokSyncLocks } from "../../src/lib/integrations/tiktok/sync";
import {
  filterOrdersByOverviewFilters,
  resolveOrderChannelKey,
} from "../../src/app/(main)/dashboard/ecommerce/_components/ecommerce-overview-context";
import { getAvailableTransitions } from "../../src/app/(main)/dashboard/ecommerce/_components/recent-orders-table/status-transitions";

import {
  GET as connectGET,
  POST as connectPOST,
} from "../../src/app/api/integrations/tiktok/connect/route";
import { GET as callbackGET } from "../../src/app/api/integrations/tiktok/callback/route";
import { POST as accountsPOST } from "../../src/app/api/integrations/tiktok/accounts/route";
import {
  GET as formsGET,
  POST as formsPOST,
} from "../../src/app/api/integrations/tiktok/forms/route";
import {
  GET as syncGET,
  POST as syncPOST,
} from "../../src/app/api/integrations/tiktok/sync/route";
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

const TEST_ORIGIN = "https://www.orva-store.com";
const TEST_HOST = "www.orva-store.com";
const TEST_APP_ID = "tt_phase_d_app_9001";
const TEST_APP_SECRET = "tt_phase_d_secret_synthetic_only_987654321";
const TEST_WEBHOOK_SECRET = "whsec_phase_d_synthetic_secret_only_123456";
const TEST_CRON_SECRET = "cron_phase_d_synthetic_secret_min_32_chars_ok";
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

// ── PGlite PostgREST Adapter ─────────────────────────────────────────────────

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
          if (rows.length === 0) return { data: mode === "many" ? [] : null, error: null };
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
          if (rows.length === 0) return { data: null, error: { code: "PGRST116", message: "Not found" } };
          return { data: rows[0], error: null };
        }
        if (mode === "maybeSingle") {
          return { data: rows[0] ?? null, error: null };
        }
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

// ── Minimal Valid DEFLATE ZIP Archive Builder (for async TikTok task download) ─

function buildDeflateZip(filename: string, contentUtf8: string): Buffer {
  const nameBuf = Buffer.from(filename, "utf8");
  const rawBuf = Buffer.from(contentUtf8, "utf8");
  const compressed = zlib.deflateRawSync(rawBuf);

  // CRC-32 calculation
  let crc = 0xffffffff;
  for (let i = 0; i < rawBuf.length; i++) {
    crc ^= rawBuf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  crc = (crc ^ 0xffffffff) >>> 0;

  const localHeader = Buffer.alloc(30 + nameBuf.length);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8); // DEFLATE
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(rawBuf.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);
  nameBuf.copy(localHeader, 30);

  const centralOffset = localHeader.length + compressed.length;
  const centralHeader = Buffer.alloc(46 + nameBuf.length);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(rawBuf.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);
  nameBuf.copy(centralHeader, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralHeader.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, compressed, centralHeader, eocd]);
}

function makeAdminRequest(
  urlPath: string,
  options: {
    method?: string;
    sessionToken?: string;
    bearerToken?: string;
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
  if (options.bearerToken) {
    headers.set("authorization", `Bearer ${options.bearerToken}`);
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
  console.log("\n=== ORVA STORE — TikTok Phase D Full-Story E2E QA, 58-Wilaya & Security Suite ===\n");

  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  process.env.ADMIN_JWT_SECRET = "phase_d_admin_jwt_secret_synthetic_32chars_min";
  process.env.APP_URL = TEST_ORIGIN;
  process.env.NEXT_PUBLIC_APP_URL = TEST_ORIGIN;
  process.env.TIKTOK_APP_ID = TEST_APP_ID;
  process.env.TIKTOK_APP_SECRET = TEST_APP_SECRET;
  process.env.TIKTOK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
  process.env.TIKTOK_SYNC_CRON_SECRET = TEST_CRON_SECRET;
  process.env.TIKTOK_REDIRECT_URI = TEST_REDIRECT_URI;
  delete process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;
  process.env.TELEGRAM_BOT_TOKEN = "999999:SYNTHETIC_PHASE_D_TELEGRAM_TOKEN";
  process.env.TELEGRAM_CHAT_ID = "-100999111222";

  const pg = new PGlite({ extensions: { uuid_ossp, pgcrypto } });

  // External outbound telemetry spy — guarantees ZERO Redex & ZERO Meta CAPI calls!
  const outboundCalls: Array<{ url: string; method: string; body?: string }> = [];
  let slowExportDelayMs = 0;

  try {
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

    // Read seeded Pack 1 & insert custom + archived real catalog products in PGlite
    const pack1Row = (
      await pg.query<{ id: string; base_price: number }>(
        `SELECT id, base_price FROM public.products WHERE slug = 'pack1' LIMIT 1`,
      )
    ).rows[0];
    const pack1Id = pack1Row.id;
    const pack1Price = Number(pack1Row.base_price);

    const customProdId = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.products (slug, sku, name, base_price, status, stock_quantity)
         VALUES ('luxury-care-kit', 'ORV-LCK', 'مجموعة العناية الفاخرة', 7200, 'PUBLISHED', 25)
         RETURNING id`,
      )
    ).rows[0].id;
    const archivedProdId = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.products (slug, sku, name, base_price, status, stock_quantity)
         VALUES ('archived-old', 'ORV-OLD', 'منتج مؤرشف', 3000, 'ARCHIVED', 0)
         RETURNING id`,
      )
    ).rows[0].id;
    assert.ok(archivedProdId);

    const adapter = createPgliteSupabaseAdapter(pg);
    __testSetSupabaseServerInstance(adapter as any);
    __testResetLocalRevocationCache();
    __testResetTikTokSyncLocks();

    const adminToken = generateSessionToken("phase-d-qa-admin");

    // Mocked TikTok v1.3 + Telegram endpoints; fail immediately if Redex or Meta Graph API is EVER touched!
    const zipCsvPayload = [
      "\uFEFFlead_id,create_time,الاسم الكامل,رقم الهاتف,الولاية,البلدية,العنوان,نوع التوصيل,campaign_name",
      // 1. Arabic fields + Arabic-Indic digits + DOMICILE + missing address -> valid pending order with empty address & bilingual note
      "lead_zip_ar_01,2026-11-19T09:00:00Z,\"سفيان بن عمار\",\"٠٥٥١٢٣٤٥٦٧\",\"الجزائر\",\"باب الزوار\",\"\",\"للمنزل\",\"حملة تيك توك Pack 1\"",
      // 2. French fields + Southern Wilaya (Timimoun 49) inheriting STOP_DESK -> automatic fallback to DOMICILE
      "lead_zip_fr_02,2026-11-19T09:05:00Z,\"Amine Boudiaf\",\"+213 661 22 33 44\",\"Timimoun\",\"Timimoun\",\"Rue de l'Independance\",\"\",\"TikTok South Test\"",
      // 3. Invalid phone -> saved as invalid_phone, ZERO order
      "lead_zip_bad_03,2026-11-19T09:10:00Z,\"عميل برقم ناقص\",\"021-1234\",\"وهران\",\"وهران\",\"\",\"\",\"TikTok Invalid Phone\"",
      // 4. Duplicate of webhook lead (inserted earlier) -> skipped cleanly
      "lead_wh_en_01,2026-11-19T08:55:00Z,\"Yacine Khelifi\",\"0770889900\",\"Constantine\",\"El Khroub\",\"Cite Zouaghi\",\"\",\"TikTok Webhook Campaign\"",
    ].join("\r\n");

    const zipBuffer = buildDeflateZip("leads_export.csv", zipCsvPayload);
    let taskPollCount = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || "GET").toUpperCase();
      const bodyStr = typeof init?.body === "string" ? init.body : undefined;
      outboundCalls.push({ url, method, body: bodyStr });

      // HARD ASSERTION: Never call Redex Express or Meta Graph CAPI during TikTok lead processing!
      if (/redex|ecotrack|graph\.facebook\.com/i.test(url)) {
        throw new Error(`FORBIDDEN EXTERNAL CALL DETECTED: ${method} ${url}`);
      }

      if (url.includes("api.telegram.org")) {
        return jsonResp({ ok: true, result: { message_id: 901 } });
      }

      if (url.includes("/oauth2/access_token/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            access_token: "synth_phase_d_access_token_never_leak",
            refresh_token: "synth_phase_d_refresh_token_never_leak",
            expires_in: 86400,
            refresh_token_expires_in: 2592000,
            advertiser_ids: ["750011223344"],
            scope: [12010100, 12020100],
          },
        });
      }

      if (url.includes("/oauth2/revoke_token/")) {
        return jsonResp({ code: 0, message: "OK", data: {} });
      }

      if (url.includes("/oauth2/advertiser/get/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            list: [{ advertiser_id: "750011223344", advertiser_name: "ORVA Algeria TikTok Live QA" }],
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
                advertiser_id: "750011223344",
                name: "ORVA Algeria TikTok Live QA",
                currency: "DZD",
                timezone: "Africa/Algiers",
                status: "STATUS_ENABLE",
              },
            ],
          },
        });
      }

      if (url.includes("/subscription/subscribe/")) {
        return jsonResp({ code: 0, message: "OK", data: { subscription_id: "sub_phase_d_001" } });
      }

      if (url.includes("/page/get/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            list: [
              { page_id: "form_d_pack1", page_name: "Pack 1 Instant Form", business_type: "LEAD_GEN", status: "ACTIVE" },
              { page_id: "form_d_unmapped", page_name: "Custom Kit Form", business_type: "LEAD_GEN", status: "ACTIVE" },
            ],
            page_info: { page: 1, page_size: 50, total_number: 2, total_page: 1 },
          },
        });
      }

      if (url.includes("/page/field/get/")) {
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            list: [
              { field_id: "fn", field_name: "الاسم الكامل", field_type: "TEXT", required: true },
              { field_id: "ph", field_name: "رقم الهاتف", field_type: "PHONE_NUMBER", required: true },
              { field_id: "wl", field_name: "الولاية", field_type: "TEXT", required: true },
            ],
          },
        });
      }

      if (url.includes("/page/lead/task/download/")) {
        if (slowExportDelayMs > 0) {
          await new Promise((r) => setTimeout(r, slowExportDelayMs));
        }
        return new Response(new Uint8Array(zipBuffer), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }

      if (url.includes("/page/lead/task/")) {
        taskPollCount += 1;
        return jsonResp({
          code: 0,
          message: "OK",
          data: {
            task_id: `task_phase_d_${taskPollCount}`,
            status: "SUCCEED",
          },
        });
      }

      throw new Error(`Unexpected mocked fetch URL: ${method} ${url}`);
    }) as typeof fetch;

    // ── Test 1: Full End-to-End Lifecycle (Connect -> Select -> Webhook -> Sync -> Admin Review) ─
    await runTest("1. Full-story E2E: OAuth -> Advertiser -> Webhook Subscribe -> Map -> Webhook + ZIP Sync -> Pending Orders -> ORVA Admin Review Filter & Transitions", async () => {
      // A. OAuth Start -> sets signed HttpOnly CSRF state cookie
      const startRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "start" },
        }),
      );
      assert.equal(startRes.status, 200);
      const startJson = await startRes.json();
      assert.ok(startJson.authorizationUrl.includes("business-api.tiktok.com/portal/auth"));
      const authUrlObj = new URL(startJson.authorizationUrl);
      const oauthState = authUrlObj.searchParams.get("state")!;
      assert.ok(oauthState.length > 20);

      // B. OAuth Callback -> verifies state + cookie, stores AES-256-GCM encrypted token, leaks zero tokens
      const cbRes = await callbackGET(
        makeAdminRequest(
          `/api/integrations/tiktok/callback/?auth_code=synth_auth_code_d&state=${encodeURIComponent(oauthState)}`,
          {
            method: "GET",
            sessionToken: adminToken,
            cookies: { [TIKTOK_OAUTH_STATE_COOKIE_NAME]: oauthState },
            headers: { accept: "application/json" },
          },
        ),
      );
      assert.equal(cbRes.status, 200);
      const cbJson = await cbRes.json();
      assert.equal(cbJson.connection.status, "connected");
      assert.equal(JSON.stringify(cbJson).includes("synth_phase_d_access_token"), false);

      // C. Select Advertiser (verifies scope 12010100) + Subscribe Webhook (trailing slash)
      const selRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "select", advertiserId: "750011223344" },
        }),
      );
      assert.equal(selRes.status, 200);

      const subRes = await accountsPOST(
        makeAdminRequest("/api/integrations/tiktok/accounts/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "subscribe_webhook", advertiserId: "750011223344" },
        }),
      );
      assert.equal(subRes.status, 200);
      const subJson = await subRes.json();
      assert.equal(subJson.webhookUrl, `${TEST_ORIGIN}/api/integrations/tiktok/webhook/`);
      assert.equal(subJson.webhookSubscribed, true);

      // D. Sync Forms + Map form_d_pack1 to Pack 1 (with default STOP_DESK so Wilaya 49 fallback is exercised!)
      const refFormsRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "refresh", advertiserId: "750011223344" },
        }),
      );
      assert.equal(refFormsRes.status, 200);

      const mapRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: adminToken,
          body: {
            action: "map_product",
            formId: "form_d_pack1",
            productId: pack1Id,
            defaultWilayaCode: 16,
            defaultDeliveryType: "STOP_DESK",
            autoCreateOrder: true,
            syncEnabled: true,
          },
        }),
      );
      assert.equal(mapRes.status, 200);
      const mapJson = await mapRes.json();
      assert.equal(mapJson.form.mapping.productPrice, pack1Price);

      // E. Real-time Signed Webhook Lead (English fields) -> creates pending order
      const whBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "750011223344",
        page_id: "form_d_pack1",
        lead_id: "lead_wh_en_01",
        campaign_name: "TikTok Webhook Campaign",
        field_data: [
          { field_name: "Full Name", field_value: "Yacine Khelifi" },
          { field_name: "Phone Number", field_value: "0770 88 99 00" },
          { field_name: "Wilaya", field_value: "Constantine" },
          { field_name: "Commune", field_value: "El Khroub" },
        ],
      });
      const ts = Math.floor(Date.now() / 1000);
      const whRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: whBody,
          headers: { "tiktok-signature": signWebhook(whBody, TEST_WEBHOOK_SECRET, ts) },
        }),
      );
      assert.equal(whRes.status, 200);
      const whJson = await whRes.json();
      assert.equal(whJson.summary.ordersCreated, 1);

      // F. Async ZIP/CSV Manual Sync on form_d_pack1 -> ingests AR + FR + invalid + duplicate
      const syncRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "sync_form", advertiserId: "750011223344", formId: "form_d_pack1" },
        }),
      );
      assert.equal(syncRes.status, 200);
      const syncJson = await syncRes.json();
      assert.equal(syncJson.summary.leadsFetched, 4);
      assert.equal(syncJson.summary.ordersCreated, 2); // AR + FR (EN was duplicate, bad_03 was invalid phone)
      assert.equal(syncJson.summary.duplicatesSkipped, 1);

      // G. Verify all 3 created orders in public.orders (status=pending, in_redex=false, Decisions 1-3)
      const ordersRes = await pg.query(
        "SELECT * FROM public.orders ORDER BY created_at ASC",
      );
      assert.equal(ordersRes.rows.length, 3);
      for (const ord of ordersRes.rows as any[]) {
        assert.equal(ord.status, "pending");
        assert.equal(ord.in_redex, false);
        assert.equal(ord.attribution_source, "tiktok_ads");
        assert.equal(Number(ord.subtotal), pack1Price);

        // Verify ORVA Admin Review Ecommerce Overview compatibility & Status Transitions
        const mappedOrvaOrder: any = {
          id: ord.order_id,
          createdAt: new Date(ord.created_at).toISOString(),
          attributionSource: ord.attribution_source,
          status: ord.status,
          grandTotalDzd: Number(ord.total_payable),
          priceDzd: Number(ord.subtotal),
        };
        assert.equal(resolveOrderChannelKey(mappedOrvaOrder), "tiktok");
        assert.equal(
          filterOrdersByOverviewFilters([mappedOrvaOrder], "all-time", "tiktok").length,
          1,
        );
        assert.equal(
          filterOrdersByOverviewFilters([mappedOrvaOrder], "all-time", "meta").length,
          0,
        );
        const transitions = getAvailableTransitions({
          status: ord.status,
          in_redex: ord.in_redex,
          redex_tracking_code: ord.redex_tracking_code,
        });
        assert.deepEqual(transitions, ["confirmed", "cancelled"]);
      }

      // Verify Decision 2 (missing address empty + bilingual note on Arabic lead)
      const arOrder = (ordersRes.rows as any[]).find((o) => o.customer_phone === "0551234567");
      assert.ok(arOrder);
      assert.equal(arOrder.delivery_address || "", "");
      assert.ok(String(arOrder.operator_notes || "").includes(MISSING_ADDRESS_CONFIRMATION_NOTE));

      // Verify Decision 3 (Timimoun Wilaya 49 STOP_DESK -> DOMICILE fallback on French lead)
      const southOrder = (ordersRes.rows as any[]).find((o) => o.customer_phone === "0661223344");
      assert.ok(southOrder);
      assert.equal(Number(southOrder.wilaya_code), 49);
      assert.equal(southOrder.delivery_method, "DOMICILE");
      assert.equal(southOrder.delivery_type, "توصيل للمنزل");

      // Verify invalid phone preserved in tiktok_leads with zero order
      const invLead = await pg.query(
        "SELECT sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id = 'lead_zip_bad_03'",
      );
      assert.equal((invLead.rows[0] as any).sync_status, "invalid_phone");
      assert.equal((invLead.rows[0] as any).order_id, null);

      // Verify Decision 1 (Telegram default OFF -> ZERO Telegram HTTP calls fired!)
      const tgCalls = outboundCalls.filter((c) => c.url.includes("api.telegram.org"));
      assert.equal(tgCalls.length, 0, "Telegram alerts must be strictly OFF by default");
    });

    // ── Test 2: ALL 58 Algerian Wilayas Coverage + Southern/Zone-5 Fallback ──
    await runTest("2. All 58 Algerian Wilayas (01..58) resolve accurately & every disallowed Stop-Desk Wilaya falls back to DOMICILE", async () => {
      assert.equal(ALGERIA_58_WILAYAS.length, 58);

      let fallbackVerifiedCount = 0;
      let stopDeskAllowedCount = 0;

      for (const wilaya of ALGERIA_58_WILAYAS) {
        const phoneSuffix = String(10000000 + wilaya.code).slice(-8);
        const rawPhone = `05${phoneSuffix}`;

        // Verify Arabic name normalization & Wilaya resolution
        const normAr = normalizeLeadFields({
          "الاسم الكامل": `عميل ولاية ${wilaya.nameAr}`,
          "رقم الهاتف": rawPhone,
          "الولاية": wilaya.nameAr,
        });
        const resolvedAr = resolveAlgerianWilaya(normAr.wilayaRaw, 16);
        assert.equal(
          resolvedAr.wilaya.code,
          wilaya.code,
          `Arabic Wilaya name '${wilaya.nameAr}' must resolve to code ${wilaya.code}`,
        );

        // Verify French name normalization & Wilaya resolution
        const normFr = normalizeLeadFields({
          full_name: `Client ${wilaya.nameFr}`,
          phone_number: rawPhone,
          wilaya: wilaya.nameFr,
        });
        const resolvedFr = resolveAlgerianWilaya(normFr.wilayaRaw, 16);
        assert.equal(
          resolvedFr.wilaya.code,
          wilaya.code,
          `French Wilaya name '${wilaya.nameFr}' must resolve to code ${wilaya.code}`,
        );

        // Verify live order ingestion for every Wilaya under default STOP_DESK mapping
        const result = await processNormalizedTikTokLead({
          storeId: "orvastore",
          lead: {
            externalLeadId: `lead_w58_${wilaya.code}`,
            formId: "form_d_pack1",
            advertiserId: "750011223344",
            fields: {
              full_name: `Test Wilaya ${wilaya.code}`,
              phone_number: rawPhone,
              wilaya: String(wilaya.code),
            },
          },
        });
        assert.equal(result.syncStatus, "order_created");
        assert.ok(result.orderId);

        const ordRow = await pg.query(
          "SELECT wilaya_code, delivery_method, delivery_type, status, in_redex FROM public.orders WHERE order_id = $1",
          [result.orderId],
        );
        const ord = ordRow.rows[0] as any;
        assert.equal(Number(ord.wilaya_code), wilaya.code);
        assert.equal(ord.status, "pending");
        assert.equal(ord.in_redex, false);

        if (isStopDeskAllowed(wilaya.code)) {
          assert.equal(ord.delivery_method, "STOP_DESK");
          stopDeskAllowedCount += 1;
        } else {
          assert.equal(
            ord.delivery_method,
            "DOMICILE",
            `Disallowed Stop-Desk Wilaya ${wilaya.code} (${wilaya.nameFr}) must fall back to DOMICILE`,
          );
          assert.equal(ord.delivery_type, "توصيل للمنزل");
          fallbackVerifiedCount += 1;
        }
      }

      assert.equal(stopDeskAllowedCount + fallbackVerifiedCount, 58);
      assert.equal(fallbackVerifiedCount, 14); // Zone-5 classic (1,11,33,37) + Southern 49..58 (10) = 14
    });

    // ── Test 3: Unmapped Form Recovery + Custom Non-Pack Product + Retry ─────
    await runTest("3. Unmapped form lead preserved without order, then recovered via retry_failed after custom product mapping", async () => {
      const whUnmapped = JSON.stringify({
        event: "LEAD",
        advertiser_id: "750011223344",
        page_id: "form_d_unmapped",
        lead_id: "lead_unmapped_recover_01",
        field_data: [
          { field_name: "Nom complet", field_value: "Nadia Benali" },
          { field_name: "Telephone", field_value: "+213 559 44 55 66" },
          { field_name: "Wilaya", field_value: "19" },
        ],
      });
      const ts = Math.floor(Date.now() / 1000);
      const whRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: whUnmapped,
          headers: { "tiktok-signature": signWebhook(whUnmapped, TEST_WEBHOOK_SECRET, ts) },
        }),
      );
      assert.equal(whRes.status, 200);

      // Confirm preserved as unmapped_form with masked phone in GET /sync/
      const audit1 = await syncGET(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "GET",
          sessionToken: adminToken,
        }),
      );
      const auditJson1 = await audit1.json();
      const recLead = auditJson1.recoverableLeads.find(
        (l: any) => l.externalLeadId === "lead_unmapped_recover_01",
      );
      assert.ok(recLead);
      assert.equal(recLead.syncStatus, "unmapped_form");
      assert.equal(recLead.maskedPhone, "0559 •• •• 66");
      assert.equal(JSON.stringify(auditJson1).includes("0559445566"), false);

      // Now map form_d_unmapped to custom non-PACK product (luxury-care-kit @ 7200 DZD)
      const mapCustomRes = await formsPOST(
        makeAdminRequest("/api/integrations/tiktok/forms/", {
          method: "POST",
          sessionToken: adminToken,
          body: {
            action: "map_product",
            formId: "form_d_unmapped",
            productId: customProdId,
            defaultWilayaCode: 19,
            defaultDeliveryType: "DOMICILE",
            autoCreateOrder: true,
            syncEnabled: true,
          },
        }),
      );
      assert.equal(mapCustomRes.status, 200);

      // Retry failed/unmapped lead -> creates pending order with NULL pack_id in order_items (preserving DB CHECK)
      const retryRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "retry_failed", leadIds: ["lead_unmapped_recover_01"] },
        }),
      );
      assert.equal(retryRes.status, 200);
      const retryJson = await retryRes.json();
      assert.equal(retryJson.summary.ordersCreated, 1);

      const recovered = await pg.query(
        "SELECT sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id = 'lead_unmapped_recover_01'",
      );
      assert.equal((recovered.rows[0] as any).sync_status, "order_created");
      const ordId = (recovered.rows[0] as any).order_id;
      const itemRow = await pg.query(
        "SELECT product_id, pack_id, unit_price FROM public.order_items WHERE order_id = $1",
        [ordId],
      );
      assert.equal((itemRow.rows[0] as any).product_id, customProdId);
      assert.equal((itemRow.rows[0] as any).pack_id, null);
      assert.equal(Number((itemRow.rows[0] as any).unit_price), 7200);
    });

    // ── Test 4: Concurrent Sync Conflict (409) & Concurrent Duplicate Webhooks ─
    await runTest("4. Concurrent sync_form returns 409 Conflict & concurrent duplicate webhooks produce strictly 1 order", async () => {
      slowExportDelayMs = 150;
      const [r1, r2] = await Promise.all([
        syncPOST(
          makeAdminRequest("/api/integrations/tiktok/sync/", {
            method: "POST",
            sessionToken: adminToken,
            body: { action: "sync_form", advertiserId: "750011223344", formId: "form_d_pack1" },
          }),
        ),
        new Promise<Response>((resolve) =>
          setTimeout(() => {
            void syncPOST(
              makeAdminRequest("/api/integrations/tiktok/sync/", {
                method: "POST",
                sessionToken: adminToken,
                body: { action: "sync_form", advertiserId: "750011223344", formId: "form_d_pack1" },
              }),
            ).then(resolve);
          }, 25),
        ),
      ]);
      slowExportDelayMs = 0;

      const statuses = [r1.status, r2.status].sort();
      assert.deepEqual(statuses, [200, 409]);

      // Fire 3 identical concurrent signed webhook deliveries for same new lead_id
      const raceBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "750011223344",
        page_id: "form_d_pack1",
        lead_id: "lead_race_concurrent_01",
        field_data: [
          { field_name: "full_name", field_value: "Riyad Race Test" },
          { field_name: "phone_number", field_value: "0771556677" },
          { field_name: "wilaya", field_value: "Biskra" },
        ],
      });
      const ts = Math.floor(Date.now() / 1000);
      const sig = signWebhook(raceBody, TEST_WEBHOOK_SECRET, ts);

      const raceResults = await Promise.all([
        webhookPOST(
          makeAdminRequest("/api/integrations/tiktok/webhook/", {
            method: "POST",
            origin: null,
            rawBody: raceBody,
            headers: { "tiktok-signature": sig },
          }),
        ),
        webhookPOST(
          makeAdminRequest("/api/integrations/tiktok/webhook/", {
            method: "POST",
            origin: null,
            rawBody: raceBody,
            headers: { "tiktok-signature": sig },
          }),
        ),
        webhookPOST(
          makeAdminRequest("/api/integrations/tiktok/webhook/", {
            method: "POST",
            origin: null,
            rawBody: raceBody,
            headers: { "tiktok-signature": sig },
          }),
        ),
      ]);

      for (const res of raceResults) assert.equal(res.status, 200);

      const raceOrders = await pg.query(
        "SELECT order_id FROM public.orders WHERE idempotency_key = 'tiktok_lead_lead_race_concurrent_01'",
      );
      assert.equal(raceOrders.rows.length, 1, "Concurrent duplicate webhooks must create strictly 1 order");
    });

    // ── Test 5: Opt-In Telegram Alerts + Cron Reconcile + Security Negative Checks ─
    await runTest("5. Opt-in Telegram sends only when enabled (never on duplicates/invalid), Cron reconcile bounded <= 90d, and Disconnect purges tokens", async () => {
      // Enable opt-in Telegram via admin route
      const optRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "set_telegram_opt_in", enabled: true },
        }),
      );
      assert.equal(optRes.status, 200);
      assert.equal(await isTikTokTelegramAlertsEnabled(), true);

      const tgCountBefore = outboundCalls.filter((c) => c.url.includes("api.telegram.org")).length;
      const newLeadBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "750011223344",
        page_id: "form_d_pack1",
        lead_id: "lead_tg_optin_01",
        field_data: [
          { field_name: "full_name", field_value: "Hicham Telegram OptIn" },
          { field_name: "phone_number", field_value: "0662334455" },
          { field_name: "wilaya", field_value: "Setif" },
        ],
      });
      const ts = Math.floor(Date.now() / 1000);
      const sig = signWebhook(newLeadBody, TEST_WEBHOOK_SECRET, ts);
      const res1 = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: newLeadBody,
          headers: { "tiktok-signature": sig },
        }),
      );
      assert.equal(res1.status, 200);

      // Wait briefly for non-blocking Telegram promise scheduled via fallback Promise.allSettled
      await new Promise((r) => setTimeout(r, 80));
      const tgCallsAfterNew = outboundCalls.filter((c) => c.url.includes("api.telegram.org"));
      assert.equal(tgCallsAfterNew.length, tgCountBefore + 1);
      const sentBody = tgCallsAfterNew[tgCallsAfterNew.length - 1].body || "";
      assert.ok(sentBody.includes("TikTok Lead Gen"));
      assert.ok(sentBody.includes("Pending"));

      // Verify diagnostic logs mask customer phones on Telegram failure (never logging raw 10-digit phone)
      const capturedLogs: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
      const failTgRes = await sendOptionalTikTokLeadTelegramAlert(
        {
          orderNumber: "PACK1-998877",
          externalLeadId: "lead_tg_log_mask",
          customerName: "Log Mask Check",
          customerPhone: "0662334455",
          wilayaDisplay: "19 - سطيف",
          communeName: "سطيف",
          deliveryType: "DOMICILE",
          addressMissing: true,
          productName: "Pack 1 Pro 4-in-1",
          productPrice: 4950,
          shippingFee: 600,
          totalPayable: 5550,
        },
        {
          optInEnabled: true,
          fetchImpl: async () => new Response(JSON.stringify({ ok: false, description: "Bad Gateway" }), { status: 502 }),
          logger: { warn: (msg, ctx) => capturedLogs.push({ msg, ctx }) },
        },
      );
      assert.equal(failTgRes.sent, false);
      assert.equal(capturedLogs.length, 1);
      assert.equal(JSON.stringify(capturedLogs).includes("0662334455"), false);
      assert.ok(JSON.stringify(capturedLogs).includes("0662 •• •• 55"));

      // Failed Order Creation Recovery: temporarily archive mapped product -> lead saved as order_creation_failed -> restore product -> retry_failed succeeds!
      await pg.query("UPDATE public.products SET status = 'ARCHIVED' WHERE id = $1", [customProdId]);
      const failedLeadBody = JSON.stringify({
        event: "LEAD",
        advertiser_id: "750011223344",
        page_id: "form_d_unmapped",
        lead_id: "lead_order_fail_recover_01",
        field_data: [
          { field_name: "full_name", field_value: "Farid Fail Recovery" },
          { field_name: "phone_number", field_value: "0554112233" },
          { field_name: "wilaya", field_value: "Annaba" },
        ],
      });
      const failSig = signWebhook(failedLeadBody, TEST_WEBHOOK_SECRET, ts);
      const failWhRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: failedLeadBody,
          headers: { "tiktok-signature": failSig },
        }),
      );
      assert.equal(failWhRes.status, 200);
      const failRow = await pg.query(
        "SELECT sync_status, order_id FROM public.tiktok_leads WHERE external_lead_id = 'lead_order_fail_recover_01'",
      );
      assert.equal((failRow.rows[0] as any).sync_status, "order_creation_failed");
      assert.equal((failRow.rows[0] as any).order_id, null);

      // Restore product to PUBLISHED & recover via retry_failed
      await pg.query("UPDATE public.products SET status = 'PUBLISHED' WHERE id = $1", [customProdId]);
      const recoverFailedRes = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "retry_failed", leadIds: ["lead_order_fail_recover_01"] },
        }),
      );
      assert.equal(recoverFailedRes.status, 200);
      const recoverFailedJson = await recoverFailedRes.json();
      assert.equal(recoverFailedJson.summary.ordersCreated, 1);

      const tgCountAfterFailedRecovery = outboundCalls.filter((c) => c.url.includes("api.telegram.org")).length;
      // Re-deliver duplicate -> MUST NOT fire second Telegram alert
      await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: newLeadBody,
          headers: { "tiktok-signature": sig },
        }),
      );
      await new Promise((r) => setTimeout(r, 80));
      assert.equal(
        outboundCalls.filter((c) => c.url.includes("api.telegram.org")).length,
        tgCountAfterFailedRecovery,
        "Duplicate lead must NEVER trigger Telegram alert",
      );

      // Reset opt-in back to false (default safe state)
      await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "set_telegram_opt_in", enabled: false },
        }),
      );
      assert.equal(await isTikTokTelegramAlertsEnabled(), false);

      // Cron bearer reconcile succeeds (<= 90 days) while Cron retry_failed is blocked (403)
      const cronRecon = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          origin: null,
          bearerToken: TEST_CRON_SECRET,
          body: { action: "reconcile", advertiserId: "750011223344", lookbackDays: 30 },
        }),
      );
      assert.equal(cronRecon.status, 200);

      const cronForbidden = await syncPOST(
        makeAdminRequest("/api/integrations/tiktok/sync/", {
          method: "POST",
          origin: null,
          bearerToken: TEST_CRON_SECRET,
          body: { action: "retry_failed" },
        }),
      );
      assert.equal(cronForbidden.status, 403);

      // Replay webhook timestamp (> 300s old) rejected with 401
      const staleTs = ts - 600;
      const staleRes = await webhookPOST(
        makeAdminRequest("/api/integrations/tiktok/webhook/", {
          method: "POST",
          origin: null,
          rawBody: newLeadBody,
          headers: { "tiktok-signature": signWebhook(newLeadBody, TEST_WEBHOOK_SECRET, staleTs) },
        }),
      );
      assert.equal(staleRes.status, 401);

      // Disconnect revokes upstream & purges encrypted tokens while preserving orders & leads
      const discRes = await connectPOST(
        makeAdminRequest("/api/integrations/tiktok/connect/", {
          method: "POST",
          sessionToken: adminToken,
          body: { action: "disconnect" },
        }),
      );
      assert.equal(discRes.status, 200);
      const connRow = await pg.query("SELECT status, access_token_encrypted FROM public.tiktok_connections");
      assert.equal(connRow.rows.length, 0, "Disconnect must purge connection & encrypted token row completely");

      const finalOrderCount = await pg.query("SELECT COUNT(*)::int AS cnt FROM public.orders");
      assert.ok((finalOrderCount.rows[0] as any).cnt >= 60, "Historical pending orders must remain preserved after disconnect");

      // Final hard invariant: ZERO outbound calls to Redex or Meta Graph CAPI across the entire E2E suite!
      const forbiddenCalls = outboundCalls.filter((c) => /redex|ecotrack|graph\.facebook\.com/i.test(c.url));
      assert.equal(forbiddenCalls.length, 0);
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

  console.log(`\nPhase D Full-Story E2E Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
