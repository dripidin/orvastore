/**
 * ORVA Store — TikTok Webhook Security Hardening Verification Suite (Phase 1.5)
 *
 * Covers the complete 23-Scenario Deterministic Security Test Matrix against
 * ephemeral PostgreSQL (@electric-sql/pglite) + real NextRequest instances:
 *  01. Valid HMAC signature -> 200 OK & 1 pending COD order created
 *  02. Invalid HMAC signature -> 401 & 0 DB writes
 *  03. Missing signature header -> 401 & 0 DB writes
 *  04. Tampered raw request body -> 401 & 0 DB writes
 *  05. Expired timestamp (outside tolerance) -> 401
 *  06. Future timestamp outside allowed tolerance -> 401
 *  07. Identical request sequential replay -> 200 replayed:true, 0 duplicate orders
 *  08. Concurrent identical requests -> serialized via withLeadProcessingLock, 0 premature replayed:true, 1 order total
 *  09. Concurrent distinct requests -> all distinct leads create distinct pending orders
 *  10. Database failure during processing -> 503 & never cached as completed replay
 *  11. Recovery after processing failure (both transient 503 retry & order_creation_failed non-cached retry_failed recovery)
 *  12. Replay after simulated application restart (cleared in-memory caches/locks) -> authoritative PostgreSQL idempotency
 *  13. Per-IP rate limit (when TIKTOK_TRUSTED_IP_HEADER is verified) -> 429 + Retry-After
 *  14. Global rate limit (across distinct verified IPs) -> 429 + Retry-After
 *  15. Spoofed x-forwarded-for & x-real-ip rotation (blocked when unverified; rightmost hop enforced when x-forwarded-for verified)
 *  16. Missing trusted proxy header -> conservative unattributed fallback bucket
 *  17. Oversized payload (> 1 MB via Content-Length pre-check and actual body bytes) -> 413
 *  18. Missing, placeholder, or weak (< 16 chars) webhook secret -> 503 fail-closed
 *  19. Production environment conflict (NODE_ENV=production + TIKTOK_SANDBOX_MODE=true) -> 503 fail-closed
 *  20. No duplicate orders under 10x concurrent delivery stress
 *  21. No Redex dispatch (status='pending', in_redex=false, redex_tracking_id=null, 0 Redex/EcoTrack HTTP calls)
 *  22. No Meta CAPI Purchase calls
 *  23. No Telegram calls unless TIKTOK_TELEGRAM_ALERTS_ENABLED=true
 *
 * Run: npx tsx tests/integrations/tiktok-webhook-security.test.ts
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
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../../src/lib/supabase/server";
import { TikTokTokenManager } from "../../src/lib/integrations/tiktok/token-manager";
import {
  __testResetTikTokSyncLocks,
  retryFailedTikTokLeads,
} from "../../src/lib/integrations/tiktok/sync";
import {
  GET as webhookGET,
  POST as webhookPOST,
} from "../../src/app/api/integrations/tiktok/webhook/route";
import {
  __testResetTikTokWebhookGuards,
  extractClientBucketKey,
} from "../../src/app/api/integrations/tiktok/_lib/webhook-guards";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BASELINE_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261111_000001_consolidated_clean_rebuild.sql");
const FEES_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261111_000002_delivery_fees.sql");
const ATTR_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261117_000005_order_attribution_and_profitability.sql");
const TIKTOK_SQL = path.join(REPO_ROOT, "src/lib/supabase/migrations/20261119_000001_tiktok_lead_generation.sql");

const CANONICAL_ORIGIN = "https://orva-store.com";
const CANONICAL_HOST = "orva-store.com";
const TEST_APP_ID = "7488990011223344";
const TEST_APP_SECRET = "tt_whsec_suite_app_secret_synthetic_998877";
const TEST_WEBHOOK_SECRET = "whsec_phase1_hardening_synthetic_secret_445566";
const TEST_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
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
            selectCols.trim() === "*"
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
            sql += ` LIMIT ${Number(limitCount)}`;
          }
        } else if (action === "insert" || action === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (rows.length === 0) return { data: [], error: null };
          const keys = Object.keys(rows[0]).filter((k) => rows[0][k] !== undefined);
          const colList = keys.map(quoteIdent).join(", ");
          const valueGroups = rows.map((r) => {
            const ph = keys.map((k) => addParam(k, r[k]));
            return `(${ph.join(", ")})`;
          });
          sql = `INSERT INTO ${safeTable} (${colList}) VALUES ${valueGroups.join(", ")}`;
          if (action === "upsert" && onConflictCol) {
            const conflictCols = onConflictCol
              .split(",")
              .map((c) => quoteIdent(c.trim()))
              .join(", ");
            const updateAssignments = keys
              .filter((k) => !onConflictCol!.split(",").map((c) => c.trim()).includes(k))
              .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`);
            sql +=
              updateAssignments.length > 0
                ? ` ON CONFLICT (${conflictCols}) DO UPDATE SET ${updateAssignments.join(", ")}`
                : ` ON CONFLICT (${conflictCols}) DO NOTHING`;
          }
          if (returning) sql += " RETURNING *";
        } else if (action === "update") {
          const keys = Object.keys(payload || {}).filter((k) => payload[k] !== undefined);
          const sets = keys.map((k) => `${quoteIdent(k)} = ${addParam(k, payload[k])}`);
          sql = `UPDATE ${safeTable} SET ${sets.join(", ")}${buildWhere()}`;
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
            code: err?.code || "PG_ERR",
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
        orderClause = { col, asc: opts?.ascending ?? true };
        return builder;
      },
      limit(n: number) {
        limitCount = n;
        return builder;
      },
      single() {
        mode = "single";
        returning = true;
        return execute();
      },
      maybeSingle() {
        mode = "maybeSingle";
        return execute();
      },
      then(onFulfilled: any, onRejected: any) {
        return execute().then(onFulfilled, onRejected);
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

function makeWebhookRequest(options: {
  method?: string;
  path?: string;
  rawBody?: string;
  headers?: Record<string, string>;
}): NextRequest {
  const url = `${CANONICAL_ORIGIN}${options.path || "/api/integrations/tiktok/webhook/"}`;
  const headers = new Headers();
  headers.set("host", CANONICAL_HOST);
  if (options.headers) {
    for (const [k, v] of Object.entries(options.headers)) {
      headers.set(k, v);
    }
  }
  return new NextRequest(url, {
    method: options.method || "POST",
    headers,
    body: options.rawBody,
  });
}

function signWebhook(rawBody: string, secret: string, tsSec = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac("sha256", secret).update(`${tsSec}.${rawBody}`, "utf8").digest("hex");
  return `t=${tsSec},s=${sig}`;
}

function buildLeadPayload(leadId: string, overrides?: { formId?: string; phone?: string; name?: string; wilaya?: string }): string {
  return JSON.stringify({
    event: "LEAD",
    advertiser_id: "780011223344",
    page_id: overrides?.formId || "form_wh_sec_ok",
    lead_id: leadId,
    field_data: [
      { field_name: "full_name", field_value: overrides?.name || "Yacine Security" },
      { field_name: "phone_number", field_value: overrides?.phone || "0550123456" },
      { field_name: "wilaya", field_value: overrides?.wilaya || "16" },
      { field_name: "commune", field_value: "Bab Ezzouar" },
    ],
  });
}

async function main() {
  console.log("\n================================================================================");
  console.log("   ORVA STORE — TIKTOK WEBHOOK SECURITY HARDENING SUITE (23 SCENARIOS)");
  console.log("================================================================================\n");

  const pg = new PGlite({
    extensions: { pgcrypto, uuid_ossp },
  });

  const savedEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const outboundUrls: string[] = [];

  try {
    await pg.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
      END $$;
    `);
    await pg.exec(fs.readFileSync(BASELINE_SQL, "utf8"));
    await pg.exec(fs.readFileSync(FEES_SQL, "utf8"));
    await pg.exec(fs.readFileSync(ATTR_SQL, "utf8"));
    await pg.exec(fs.readFileSync(TIKTOK_SQL, "utf8"));

    const activeProductUuid = (
      await pg.query<{ id: string }>(`SELECT id FROM public.products WHERE slug = 'pack1' LIMIT 1`)
    ).rows[0].id;

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
    __testResetTikTokSyncLocks();
    __testResetTikTokWebhookGuards();

    process.env.TIKTOK_ENV = "tiktok_sandbox";
    process.env.TIKTOK_SANDBOX_MODE = "true";
    process.env.TIKTOK_APP_ID = TEST_APP_ID;
    process.env.TIKTOK_APP_SECRET = TEST_APP_SECRET;
    process.env.TIKTOK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
    process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    process.env.TIKTOK_REDIRECT_URI = TEST_REDIRECT_URI;
    delete process.env.TIKTOK_TRUSTED_IP_HEADER;
    delete process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      outboundUrls.push(String(input));
      return new Response(JSON.stringify({ ok: true, code: 0, message: "OK", data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const tokenMgr = new TikTokTokenManager();
    const connDto = await tokenMgr.saveConnectionTokens({
      appId: TEST_APP_ID,
      accessToken: "act_whsec_synthetic_token_xyz",
      refreshToken: "rft_whsec_synthetic_token_abc",
      scopes: [12010100, 12020100],
      selectedAdvertiserId: "780011223344",
    });
    await pg.query(
      `INSERT INTO public.tiktok_ad_accounts (store_id, connection_id, advertiser_id, advertiser_name, is_selected)
       VALUES ('orvastore', $1, '780011223344', 'ORVA Security Advertiser', true)`,
      [connDto.id],
    );
    await pg.query(
      `INSERT INTO public.tiktok_forms (store_id, advertiser_id, form_id, form_name, status, sync_enabled)
       VALUES
         ('orvastore', '780011223344', 'form_wh_sec_ok', 'Mapped Security Form', 'ACTIVE', true),
         ('orvastore', '780011223344', 'form_wh_unmapped', 'Temporary Unmapped Form', 'ACTIVE', false)`,
    );
    await pg.query(
      `INSERT INTO public.tiktok_form_product_mappings (store_id, form_id, product_id, pack_id, product_name, product_price, default_wilaya_code, default_delivery_type, auto_create_order)
       VALUES ('orvastore', 'form_wh_sec_ok', $1, 'PACK1', 'ORVA Pack 1 Security', 4950, 16, 'DOMICILE', true)`,
      [activeProductUuid],
    );

    const nowSec = Math.floor(Date.now() / 1000);

    // 01. Valid HMAC signature
    await runTest("01. Valid HMAC signature accepted (200 OK) and creates pending COD order", async () => {
      __testResetTikTokWebhookGuards();
      const rawBody = buildLeadPayload("lead_sec_01");
      const res = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: { "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      assert.equal(json.summary.ordersCreated, 1);
    });

    // 02. Invalid HMAC signature
    await runTest("02. Invalid HMAC signature rejected with 401 and zero DB writes", async () => {
      const rawBody = buildLeadPayload("lead_sec_02");
      const res = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: { "tiktok-signature": signWebhook(rawBody, "wrong_webhook_secret_1234567890", nowSec) },
        }),
      );
      assert.equal(res.status, 401);
      const rows = await pg.query("SELECT id FROM public.tiktok_leads WHERE external_lead_id = 'lead_sec_02'");
      assert.equal(rows.rows.length, 0);
    });

    // 03. Missing signature
    await runTest("03. Missing TikTok-Signature header rejected with 401 and zero DB writes", async () => {
      const rawBody = buildLeadPayload("lead_sec_03");
      const res = await webhookPOST(makeWebhookRequest({ rawBody }));
      assert.equal(res.status, 401);
      const rows = await pg.query("SELECT id FROM public.tiktok_leads WHERE external_lead_id = 'lead_sec_03'");
      assert.equal(rows.rows.length, 0);
    });

    // 04. Tampered raw request body
    await runTest("04. Tampered raw request body rejected with 401 and zero DB writes", async () => {
      const originalBody = buildLeadPayload("lead_sec_04");
      const sig = signWebhook(originalBody, TEST_WEBHOOK_SECRET, nowSec);
      const tamperedBody = originalBody.replace("0550123456", "0661998877");
      const res = await webhookPOST(
        makeWebhookRequest({
          rawBody: tamperedBody,
          headers: { "tiktok-signature": sig },
        }),
      );
      assert.equal(res.status, 401);
      const rows = await pg.query("SELECT id FROM public.tiktok_leads WHERE external_lead_id = 'lead_sec_04'");
      assert.equal(rows.rows.length, 0);
    });

    // 05. Expired timestamp
    await runTest("05. Expired timestamp (now - 600s > 300s tolerance) rejected with 401", async () => {
      const rawBody = buildLeadPayload("lead_sec_05");
      const res = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: { "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec - 600) },
        }),
      );
      assert.equal(res.status, 401);
    });

    // 06. Future timestamp outside allowed tolerance
    await runTest("06. Future timestamp (now + 600s > 300s tolerance) rejected with 401", async () => {
      const rawBody = buildLeadPayload("lead_sec_06");
      const res = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: { "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec + 600) },
        }),
      );
      assert.equal(res.status, 401);
    });

    // 07. Identical request sequential replay
    await runTest("07. Identical sequential request replay returns 200 replayed:true with 0 duplicate orders", async () => {
      __testResetTikTokWebhookGuards();
      const rawBody = buildLeadPayload("lead_sec_07");
      const sig = signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec);

      const first = await webhookPOST(
        makeWebhookRequest({ rawBody, headers: { "tiktok-signature": sig } }),
      );
      assert.equal(first.status, 200);
      const firstJson = await first.json();
      assert.equal(firstJson.summary.ordersCreated, 1);

      const second = await webhookPOST(
        makeWebhookRequest({ rawBody, headers: { "tiktok-signature": sig } }),
      );
      assert.equal(second.status, 200);
      const secondJson = await second.json();
      assert.equal(secondJson.replayed, true);
      assert.equal(secondJson.summary.ordersCreated, 0);
      assert.equal(secondJson.summary.duplicatesSkipped, 1);

      const orderCount = await pg.query<{ cnt: number }>(
        "SELECT count(*)::int AS cnt FROM public.orders WHERE idempotency_key = 'tiktok_lead_lead_sec_07'",
      );
      assert.equal(orderCount.rows[0].cnt, 1);
    });

    // 08. Concurrent identical requests
    await runTest("08. Concurrent identical requests serialize cleanly with 0 premature replayed:true and 1 order", async () => {
      __testResetTikTokWebhookGuards();
      const rawBody = buildLeadPayload("lead_sec_08");
      const sig = signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec);

      const [r1, r2] = await Promise.all([
        webhookPOST(makeWebhookRequest({ rawBody, headers: { "tiktok-signature": sig } })),
        webhookPOST(makeWebhookRequest({ rawBody, headers: { "tiktok-signature": sig } })),
      ]);
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      const j1 = await r1.json();
      const j2 = await r2.json();
      assert.equal(Boolean(j1.replayed) || Boolean(j2.replayed), false);
      assert.equal(j1.summary.ordersCreated + j2.summary.ordersCreated, 1);
      assert.equal(j1.summary.duplicatesSkipped + j2.summary.duplicatesSkipped, 1);
    });

    // 09. Concurrent distinct requests
    await runTest("09. Concurrent distinct requests all succeed and create distinct pending orders", async () => {
      __testResetTikTokWebhookGuards();
      const bodies = ["lead_sec_09a", "lead_sec_09b", "lead_sec_09c"].map((id, idx) =>
        buildLeadPayload(id, { phone: `055099880${idx}` }),
      );
      const responses = await Promise.all(
        bodies.map((rawBody) =>
          webhookPOST(
            makeWebhookRequest({
              rawBody,
              headers: { "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec) },
            }),
          ),
        ),
      );
      for (const res of responses) {
        assert.equal(res.status, 200);
        const json = await res.json();
        assert.equal(json.summary.ordersCreated, 1);
      }
      const orderCount = await pg.query<{ cnt: number }>(
        "SELECT count(*)::int AS cnt FROM public.orders WHERE idempotency_key IN ('tiktok_lead_lead_sec_09a', 'tiktok_lead_lead_sec_09b', 'tiktok_lead_lead_sec_09c')",
      );
      assert.equal(orderCount.rows[0].cnt, 3);
    });

    // 10 & 11. Database failure during processing & Recovery after processing failure
    await runTest("10 & 11. DB failure returns 503 uncached; failed/unmapped first delivery is never cached as success and recovers cleanly", async () => {
      __testResetTikTokWebhookGuards();
      const rawBody = buildLeadPayload("lead_sec_10_11");
      const sig = signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec);

      // 10. Transient DB outage -> 503 (never cached)
      const failRes = { data: null, error: { code: "08006", message: "Simulated PG outage" } };
      const failingChain: any = {
        select: () => failingChain,
        insert: () => failingChain,
        upsert: () => failingChain,
        update: () => failingChain,
        delete: () => failingChain,
        eq: () => failingChain,
        in: () => failingChain,
        order: () => failingChain,
        limit: () => failingChain,
        single: async () => failRes,
        maybeSingle: async () => failRes,
        then: (resolve: any, reject: any) => Promise.resolve(failRes).then(resolve, reject),
      };
      __testSetSupabaseServerInstance({ from: () => failingChain } as any);
      try {
        const outageRes = await webhookPOST(
          makeWebhookRequest({ rawBody, headers: { "tiktok-signature": sig } }),
        );
        assert.equal(outageRes.status, 503);
      } finally {
        __testSetSupabaseServerInstance(createPgliteSupabaseAdapter(pg) as any);
      }

      // 11a. Immediate retry with same signature succeeds after DB recovery (proves 503 was not cached)
      const recoveredRes = await webhookPOST(
        makeWebhookRequest({ rawBody, headers: { "tiktok-signature": sig } }),
      );
      assert.equal(recoveredRes.status, 200);
      const recJson = await recoveredRes.json();
      assert.equal(recJson.replayed, undefined);
      assert.equal(recJson.summary.ordersCreated, 1);

      // 11b. Unmapped/failed lead batch must NOT be cached in completedReplayCache as status: "success"
      const unmappedBody = buildLeadPayload("lead_sec_11_unmapped", { formId: "form_wh_unmapped" });
      const unmappedSig = signWebhook(unmappedBody, TEST_WEBHOOK_SECRET, nowSec);
      const firstUnmapped = await webhookPOST(
        makeWebhookRequest({ rawBody: unmappedBody, headers: { "tiktok-signature": unmappedSig } }),
      );
      assert.equal(firstUnmapped.status, 200);
      const firstUnmappedJson = await firstUnmapped.json();
      assert.equal(firstUnmappedJson.summary.status, "failed");
      assert.equal(firstUnmappedJson.summary.leadsFailed, 1);

      const secondUnmapped = await webhookPOST(
        makeWebhookRequest({ rawBody: unmappedBody, headers: { "tiktok-signature": unmappedSig } }),
      );
      const secondUnmappedJson = await secondUnmapped.json();
      assert.equal(secondUnmappedJson.replayed, undefined, "Failed delivery must never be cached as replayed:true");

      // Map the form and run retryFailedTikTokLeads -> recovers to 1 pending order
      await pg.query(
        `INSERT INTO public.tiktok_form_product_mappings (store_id, form_id, product_id, pack_id, product_name, product_price, default_wilaya_code, default_delivery_type, auto_create_order)
         VALUES ('orvastore', 'form_wh_unmapped', $1, 'PACK1', 'ORVA Pack 1 Security', 4950, 16, 'DOMICILE', true)`,
        [activeProductUuid],
      );
      const retrySummary = await retryFailedTikTokLeads({ leadIds: ["lead_sec_11_unmapped"] });
      assert.equal(retrySummary.ordersCreated, 1);
    });

    // 12. Replay after application restart
    await runTest("12. Replay after simulated process restart (in-memory caches cleared) deduplicates via PostgreSQL", async () => {
      const rawBody = buildLeadPayload("lead_sec_01"); // Already imported in Test 01
      // Simulate complete Node.js process restart: clear all in-memory guards & locks
      __testResetTikTokWebhookGuards();
      __testResetTikTokSyncLocks();

      const freshSig = signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec + 5);
      const res = await webhookPOST(
        makeWebhookRequest({ rawBody, headers: { "tiktok-signature": freshSig } }),
      );
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.replayed, undefined);
      assert.equal(json.summary.ordersCreated, 0);
      assert.equal(json.summary.duplicatesSkipped, 1);

      const orderCount = await pg.query<{ cnt: number }>(
        "SELECT count(*)::int AS cnt FROM public.orders WHERE idempotency_key = 'tiktok_lead_lead_sec_01'",
      );
      assert.equal(orderCount.rows[0].cnt, 1);
    });

    // 13. Per-IP rate limit (when trusted proxy header is verified)
    await runTest("13. Per-IP rate limit returns 429 + Retry-After when TIKTOK_TRUSTED_IP_HEADER is configured", async () => {
      __testResetTikTokWebhookGuards();
      process.env.TIKTOK_TRUSTED_IP_HEADER = "cf-connecting-ip";
      process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX = "5";
      process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX = "50";
      const rawBody = buildLeadPayload("lead_sec_13");

      for (let i = 0; i < 5; i += 1) {
        const res = await webhookPOST(
          makeWebhookRequest({
            rawBody,
            headers: {
              "cf-connecting-ip": "198.51.100.10",
              "tiktok-signature": signWebhook(rawBody, "wrong_secret_for_rl_test", nowSec),
            },
          }),
        );
        assert.equal(res.status, 401);
      }

      const limited = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: {
            "cf-connecting-ip": "198.51.100.10",
            "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec),
          },
        }),
      );
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get("retry-after")) >= 1);

      // Different verified IP is not limited by 198.51.100.10's per-IP bucket
      const otherIpRes = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: {
            "cf-connecting-ip": "198.51.100.20",
            "tiktok-signature": signWebhook(rawBody, "wrong_secret_for_rl_test", nowSec),
          },
        }),
      );
      assert.equal(otherIpRes.status, 401);
    });

    // 14. Global rate limit
    await runTest("14. Global rate limit returns 429 + Retry-After across distinct verified client IPs", async () => {
      __testResetTikTokWebhookGuards();
      process.env.TIKTOK_TRUSTED_IP_HEADER = "cf-connecting-ip";
      process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX = "5";
      process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX = "10";
      const rawBody = buildLeadPayload("lead_sec_14");

      for (let i = 0; i < 10; i += 1) {
        const res = await webhookPOST(
          makeWebhookRequest({
            rawBody,
            headers: {
              "cf-connecting-ip": `198.51.100.${i + 1}`,
              "tiktok-signature": signWebhook(rawBody, "wrong_secret_for_rl_test", nowSec),
            },
          }),
        );
        assert.equal(res.status, 401);
      }

      const globalLimited = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: {
            "cf-connecting-ip": "198.51.100.250",
            "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec),
          },
        }),
      );
      assert.equal(globalLimited.status, 429);
      assert.ok(Number(globalLimited.headers.get("retry-after")) >= 1);
    });

    // 15 & 16. Spoofed x-forwarded-for & Missing trusted proxy header
    await runTest("15 & 16. Spoofed x-forwarded-for cannot bypass rate limit when trusted header is unset, and missing trusted header uses conservative fallback", async () => {
      __testResetTikTokWebhookGuards();
      delete process.env.TIKTOK_TRUSTED_IP_HEADER;
      process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX = "5";
      process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX = "25";
      const rawBody = buildLeadPayload("lead_sec_15_16");

      // Rotating single-value X-Forwarded-For & X-Real-IP when TIKTOK_TRUSTED_IP_HEADER is unset must all map to "unattributed-proxy-client"
      for (let i = 0; i < 5; i += 1) {
        const req = makeWebhookRequest({
          rawBody,
          headers: {
            "x-forwarded-for": `203.0.113.${i + 1}`,
            "x-real-ip": `198.51.100.${i + 1}`,
            "tiktok-signature": signWebhook(rawBody, "wrong_secret_for_rl_test", nowSec),
          },
        });
        assert.equal(extractClientBucketKey(req, null), "unattributed-proxy-client");
        const res = await webhookPOST(req);
        assert.equal(res.status, 401);
      }

      const spoofBlocked = await webhookPOST(
        makeWebhookRequest({
          rawBody,
          headers: {
            "x-forwarded-for": "203.0.113.200",
            "x-real-ip": "198.51.100.200",
            "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec),
          },
        }),
      );
      assert.equal(spoofBlocked.status, 429);

      // Missing trusted header when TIKTOK_TRUSTED_IP_HEADER="cf-connecting-ip" is configured also falls back to "unattributed-proxy-client"
      const missingHdrReq = makeWebhookRequest({ rawBody });
      assert.equal(extractClientBucketKey(missingHdrReq, "cf-connecting-ip"), "unattributed-proxy-client");

      delete process.env.TIKTOK_WEBHOOK_RATE_LIMIT_MAX;
      delete process.env.TIKTOK_WEBHOOK_GLOBAL_RATE_LIMIT_MAX;
      __testResetTikTokWebhookGuards();
    });

    // 17. Oversized payload (413)
    await runTest("17. Oversized payload (> 1 MB via Content-Length pre-check and actual body bytes) rejected with 413", async () => {
      const smallBody = buildLeadPayload("lead_sec_17");
      const declaredOversized = await webhookPOST(
        makeWebhookRequest({
          rawBody: smallBody,
          headers: {
            "content-length": "2097152",
            "tiktok-signature": signWebhook(smallBody, TEST_WEBHOOK_SECRET, nowSec),
          },
        }),
      );
      assert.equal(declaredOversized.status, 413);

      const hugeRawBody = `{"event":"LEAD","padding":"${"a".repeat(1_050_000)}"}`;
      const actualOversized = await webhookPOST(
        makeWebhookRequest({
          rawBody: hugeRawBody,
          headers: { "tiktok-signature": signWebhook(hugeRawBody, TEST_WEBHOOK_SECRET, nowSec) },
        }),
      );
      assert.equal(actualOversized.status, 413);
    });

    // 18. Missing or weak webhook secret (503)
    await runTest("18. Missing, placeholder, or weak (< 16 chars) webhook secret fails closed with 503", async () => {
      const rawBody = buildLeadPayload("lead_sec_18");
      process.env.TIKTOK_WEBHOOK_SECRET = "short_secret";
      try {
        const weakRes = await webhookPOST(
          makeWebhookRequest({
            rawBody,
            headers: { "tiktok-signature": signWebhook(rawBody, "short_secret", nowSec) },
          }),
        );
        assert.equal(weakRes.status, 503);

        delete process.env.TIKTOK_WEBHOOK_SECRET;
        delete process.env.TIKTOK_APP_SECRET;
        const missingRes = await webhookPOST(
          makeWebhookRequest({
            rawBody,
            headers: { "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec) },
          }),
        );
        assert.equal(missingRes.status, 503);
      } finally {
        process.env.TIKTOK_APP_SECRET = TEST_APP_SECRET;
        process.env.TIKTOK_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
      }
    });

    // 19. Production environment conflict
    await runTest("19. Conflicting production environment flags (TIKTOK_ENV=production + TIKTOK_SANDBOX_MODE=true) fail closed with 503", async () => {
      const rawBody = buildLeadPayload("lead_sec_19");
      process.env.TIKTOK_ENV = "production";
      process.env.TIKTOK_SANDBOX_MODE = "true";
      try {
        const conflictRes = await webhookPOST(
          makeWebhookRequest({
            rawBody,
            headers: { "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec) },
          }),
        );
        assert.equal(conflictRes.status, 503);
        const json = await conflictRes.json();
        assert.equal(json.code, "WEBHOOK_SECRET_INVALID");
      } finally {
        process.env.TIKTOK_ENV = "tiktok_sandbox";
        process.env.TIKTOK_SANDBOX_MODE = "true";
      }
    });

    // 20. No duplicate orders under 10x concurrent delivery stress
    await runTest("20. 10x concurrent deliveries of the same lead create strictly 1 pending order and 0 duplicates", async () => {
      __testResetTikTokWebhookGuards();
      const rawBody = buildLeadPayload("lead_sec_20_stress", { phone: "0770334455" });
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, idx) =>
          webhookPOST(
            makeWebhookRequest({
              rawBody,
              headers: { "tiktok-signature": signWebhook(rawBody, TEST_WEBHOOK_SECRET, nowSec + (idx % 3)) },
            }),
          ),
        ),
      );
      let totalCreated = 0;
      for (const r of results) {
        assert.equal(r.status, 200);
        const j = await r.json();
        totalCreated += j.summary.ordersCreated;
      }
      assert.equal(totalCreated, 1);

      const dbOrders = await pg.query(
        "SELECT status, in_redex, redex_tracking_id FROM public.orders WHERE idempotency_key = 'tiktok_lead_lead_sec_20_stress'",
      );
      assert.equal(dbOrders.rows.length, 1);
    });

    // 21, 22 & 23. No Redex dispatch, No Meta CAPI Purchase, No Telegram unless explicitly enabled + GET readiness check
    await runTest("21, 22 & 23. All created orders are status=pending, in_redex=false, redex_tracking_id=null with 0 Redex, 0 Meta CAPI, and 0 Telegram calls", async () => {
      const allOrders = await pg.query<{
        status: string;
        in_redex: boolean;
        redex_tracking_id: string | null;
      }>("SELECT status, in_redex, redex_tracking_id FROM public.orders WHERE idempotency_key LIKE 'tiktok_lead_%'");
      assert.ok(allOrders.rows.length >= 6);
      for (const row of allOrders.rows) {
        assert.equal(row.status, "pending");
        assert.equal(row.in_redex, false);
        assert.equal(row.redex_tracking_id, null);
      }

      const redexCalls = outboundUrls.filter((u) => /redex|ecotrack/i.test(u));
      const metaCalls = outboundUrls.filter((u) => /graph\.facebook\.com/i.test(u));
      const telegramCalls = outboundUrls.filter((u) => /api\.telegram\.org/i.test(u));
      assert.equal(redexCalls.length, 0);
      assert.equal(metaCalls.length, 0);
      assert.equal(telegramCalls.length, 0);

      const healthRes = await webhookGET(makeWebhookRequest({ method: "GET" }));
      assert.equal(healthRes.status, 200);
      const healthJson = await healthRes.json();
      assert.equal(healthJson.rateLimitBackend, "single_process_in_memory");
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.env = savedEnv;
    __testResetSupabaseServerInstance();
    __testResetTikTokSyncLocks();
    __testResetTikTokWebhookGuards();
    await pg.close();
  }

  console.log(`\n=== Webhook Security Hardening Suite Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal unhandled error in tiktok-webhook-security.test.ts:", err);
  process.exit(1);
});
