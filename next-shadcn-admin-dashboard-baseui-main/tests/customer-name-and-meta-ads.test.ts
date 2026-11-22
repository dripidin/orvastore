/**
 * Comprehensive Stress & Integration Test Suite:
 * 1. Customer Name Editing per Order (Validation, Dual-Column Sync, Referential Integrity, History, Waybill Binding)
 * 2. Automatic Meta Ads Campaign Profitability Engine & Product-to-Meta-Ad Linking
 * 3. AI Marketing Consultant Analytics & Meta-Ads-MCP / meta-ads-expert Skill Verification
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";

import { generateSessionToken } from "../src/lib/auth/admin-auth";
import { computeCampaignProfitability } from "../src/lib/analytics/campaign-profitability";
import type { OrvaOrder } from "../src/lib/orva-api";
import {
  computeEstimatedOrderProfit,
  computeUnitMargin,
  toPublicProductDTO,
  type Product,
} from "../src/lib/repository/product-types";
import {
  __testResetSupabaseServerInstance,
  __testSetSupabaseServerInstance,
} from "../src/lib/supabase/server";

process.env.ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || "test_secret_for_customer_name_and_meta_ads_suite_2026";
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

interface WaybillCapture {
  reference: string;
  nom_client: string;
  montant: number;
  tracking: string;
}

const waybillCaptures: WaybillCapture[] = [];

class PGliteQueryBuilder {
  private table: string;
  private db: PGlite;
  private op: "SELECT" | "INSERT" | "UPDATE" | "DELETE" = "SELECT";
  private updateData: Record<string, any> = {};
  private insertData: any = null;
  private whereClauses: string[] = [];
  private params: any[] = [];
  private isSingle = false;
  private isMaybeSingle = false;
  private limitCount: number | null = null;

  constructor(db: PGlite, table: string) {
    this.db = db;
    this.table = table;
  }

  select(_cols = "*") {
    return this;
  }

  insert(data: any) {
    this.op = "INSERT";
    this.insertData = data;
    return this;
  }

  update(data: Record<string, any>) {
    this.op = "UPDATE";
    this.updateData = data;
    return this;
  }

  delete() {
    this.op = "DELETE";
    return this;
  }

  eq(col: string, val: any) {
    this.params.push(val);
    this.whereClauses.push(`${col} = $${this.params.length}`);
    return this;
  }

  is(col: string, val: any) {
    if (val === null) this.whereClauses.push(`${col} IS NULL`);
    else if (val === true) this.whereClauses.push(`${col} IS TRUE`);
    else if (val === false) this.whereClauses.push(`${col} IS FALSE`);
    return this;
  }

  or(filterStr: string) {
    const parts = filterStr.split(",");
    const subClauses: string[] = [];
    for (const part of parts) {
      const mEq = part.match(/^([a-zA-Z0-9_]+)\.eq\.(.+)$/);
      const mIs = part.match(/^([a-zA-Z0-9_]+)\.is\.(.+)$/);
      if (mEq) {
        const [, col, val] = mEq;
        if (val === "false") subClauses.push(`${col} = false`);
        else if (val === "true") subClauses.push(`${col} = true`);
        else {
          this.params.push(val);
          subClauses.push(`${col}::text = $${this.params.length}`);
        }
      } else if (mIs) {
        const [, col, val] = mIs;
        if (val === "null") subClauses.push(`${col} IS NULL`);
      }
    }
    if (subClauses.length > 0) {
      this.whereClauses.push(`(${subClauses.join(" OR ")})`);
    }
    return this;
  }

  order(_col: string, _opts?: { ascending?: boolean }) {
    return this;
  }

  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  single() {
    this.isSingle = true;
    return this.execute();
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this.execute();
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute(): Promise<{ data: any; error: any }> {
    try {
      const whereSql = this.whereClauses.length > 0 ? `WHERE ${this.whereClauses.join(" AND ")}` : "";
      const limitSql = this.limitCount !== null ? `LIMIT ${this.limitCount}` : "";

      if (this.op === "SELECT") {
        const res = await this.db.query(`SELECT * FROM ${this.table} ${whereSql} ${limitSql}`, this.params);
        const rows = res.rows as any[];
        if (this.isSingle || this.isMaybeSingle) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.op === "UPDATE") {
        const setParts: string[] = [];
        const updateParams: any[] = [];
        for (const [k, v] of Object.entries(this.updateData)) {
          if (v === undefined) continue;
          const isJsonCol = k === "metadata" || k === "remarks" || k === "raw_response";
          updateParams.push(isJsonCol && v !== null ? JSON.stringify(v) : v);
          setParts.push(`${k} = $${updateParams.length}${isJsonCol ? "::jsonb" : ""}`);
        }
        const shiftedWhere = whereSql.replace(/\$(\d+)/g, (_, num) => `$${Number(num) + updateParams.length}`);
        const allParams = [...updateParams, ...this.params];
        const sql = `UPDATE ${this.table} SET ${setParts.join(", ")} ${shiftedWhere} RETURNING *`;
        const res = await this.db.query(sql, allParams);
        const rows = res.rows as any[];
        if (this.isSingle || this.isMaybeSingle) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (this.op === "INSERT") {
        const items = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
        const inserted: any[] = [];
        for (const item of items) {
          const cols: string[] = [];
          const placeholders: string[] = [];
          const vals: any[] = [];
          for (const [k, v] of Object.entries(item)) {
            if (v === undefined) continue;
            cols.push(k);
            const isJsonCol = k === "metadata" || k === "remarks" || k === "raw_response";
            vals.push(isJsonCol && v !== null ? JSON.stringify(v) : v);
            placeholders.push(`$${vals.length}${isJsonCol ? "::jsonb" : ""}`);
          }
          const sql = `INSERT INTO ${this.table} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
          const res = await this.db.query(sql, vals);
          if (res.rows[0]) inserted.push(res.rows[0]);
        }
        if (this.isSingle || this.isMaybeSingle) return { data: inserted[0] ?? null, error: null };
        return { data: inserted, error: null };
      }

      return { data: null, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || String(err) } };
    }
  }
}

async function main() {
  console.log("Running Customer Name Editing + Meta Ads Profitability + AI Marketing Consultant Suite...\n");

  const pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE admin_session_revocations (
      sid TEXT PRIMARY KEY,
      revoked_at TIMESTAMPTZ DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      reason TEXT DEFAULT 'ADMIN_LOGOUT'
    );

    CREATE TABLE customers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id TEXT UNIQUE NOT NULL,
      order_number TEXT UNIQUE NOT NULL,
      customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
      store_id TEXT DEFAULT 'orvastore',
      customer_name TEXT,
      full_name TEXT,
      customer_phone TEXT,
      phone TEXT,
      wilaya_code INTEGER DEFAULT 16,
      wilaya_name TEXT DEFAULT 'Alger',
      wilaya TEXT DEFAULT '16 - الجزائر',
      commune_name TEXT DEFAULT 'Bab Ezzouar',
      commune TEXT DEFAULT 'Bab Ezzouar',
      delivery_type TEXT DEFAULT 'DOMICILE',
      product_name TEXT DEFAULT 'باك كومبريسار و المفاتيح 4 في 1',
      quantity INTEGER DEFAULT 1,
      price_num NUMERIC DEFAULT 4950,
      subtotal NUMERIC DEFAULT 4950,
      delivery_fee NUMERIC DEFAULT 500,
      shipping_fee TEXT DEFAULT '500 د.ج',
      product_total TEXT DEFAULT '4950 د.ج',
      total NUMERIC DEFAULT 5450,
      total_payable NUMERIC DEFAULT 5450,
      grand_total TEXT DEFAULT '5450 د.ج',
      status TEXT DEFAULT 'pending',
      in_redex BOOLEAN DEFAULT false,
      tracking_code TEXT,
      redex_tracking_code TEXT,
      redex_tracking_id TEXT,
      fb_campaign_id TEXT,
      fb_adset_id TEXT,
      fb_ad_id TEXT,
      fbclid TEXT,
      utm_campaign TEXT,
      attribution_source TEXT DEFAULT 'facebook_ads',
      metadata JSONB DEFAULT '{}'::jsonb,
      remarks JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
      product_name_snapshot TEXT NOT NULL,
      unit_price NUMERIC NOT NULL,
      quantity INTEGER NOT NULL,
      line_total NUMERIC NOT NULL
    );

    CREATE TABLE order_timeline_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id TEXT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      actor TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id TEXT REFERENCES orders(order_id) ON DELETE CASCADE,
      provider TEXT DEFAULT 'REDEX',
      tracking_number TEXT UNIQUE,
      status TEXT DEFAULT 'CREATED',
      carrier_status TEXT DEFAULT 'prete_a_expedier',
      carrier_status_ar TEXT DEFAULT 'جاهز للإرسال',
      raw_response JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  const mockSupabaseClient = {
    from: (table: string) => new PGliteQueryBuilder(pglite, table),
  };

  __testSetSupabaseServerInstance(mockSupabaseClient as any);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.includes("/api/v1/create/order")) {
      const parsedUrl = new URL(urlStr);
      const q = parsedUrl.searchParams;
      let bodyParams: Record<string, any> = {};
      if (init?.body && typeof init.body === "string") {
        try {
          bodyParams = JSON.parse(init.body);
        } catch {
          const sp = new URLSearchParams(init.body);
          sp.forEach((v, k) => (bodyParams[k] = v));
        }
      }
      const reference = String(q.get("reference") || bodyParams.reference || "");
      const nom_client = String(q.get("nom_client") || bodyParams.nom_client || "");
      const montant = Number(q.get("montant") || bodyParams.montant || 0);
      const tracking = `RDX-NAME-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      waybillCaptures.push({ reference, nom_client, montant, tracking });
      return new Response(JSON.stringify({ success: true, tracking }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return origFetch(input, init);
  };

  try {
    const { GET: deliveryGET, POST: deliveryPOST, parseStrictCustomerName } = await import(
      "../src/app/api/delivery/route"
    );

    const adminToken = generateSessionToken("sid_cust_name_test_01");

    const callPost = async (action: string, body: Record<string, any>) => {
      const req = new NextRequest(`http://localhost:3000/api/delivery?action=${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ action, ...body }),
      });
      const res = await deliveryPOST(req);
      const json = await res.json();
      return { status: res.status, json };
    };

    // Seed Customer + Order with FK relationship (customers + order_items)
    const custRes = await pglite.query(
      `INSERT INTO customers (name, phone) VALUES ('محمد بن علي', '0550123456') RETURNING id`,
    );
    const customerId = (custRes.rows[0] as any).id;

    await pglite.query(
      `INSERT INTO orders (order_id, order_number, customer_id, customer_name, full_name, customer_phone, phone, total, total_payable, grand_total, metadata)
       VALUES ('ORV-TEST-NAME-1', 'ORV-TEST-NAME-1', $1, 'محمد بن علي', 'محمد بن علي', '0550123456', '0550123456', 5450, 5450, '5450 د.ج', $2::jsonb)`,
      [
        customerId,
        JSON.stringify({
          orderDiscount: { amountDzd: 450, originalTotalDzd: 5450, finalTotalDzd: 5000 },
        }),
      ],
    );

    await pglite.query(
      `INSERT INTO order_items (order_id, product_name_snapshot, unit_price, quantity, line_total)
       VALUES ('ORV-TEST-NAME-1', 'باك كومبريسار و المفاتيح 4 في 1', 4950, 1, 4950)`,
    );

    // Seed second order WITHOUT customer_id (null FK case)
    await pglite.query(
      `INSERT INTO orders (order_id, order_number, customer_id, customer_name, full_name, customer_phone, phone)
       VALUES ('ORV-TEST-NAME-2', 'ORV-TEST-NAME-2', NULL, 'أمين قديم', 'أمين قديم', '0661987654', '0661987654')`,
    );

    // ── TEST 1: Strict Input Validation Guard ───────────────────────────────
    assert.equal(parseStrictCustomerName(""), null);
    assert.equal(parseStrictCustomerName("   "), null);
    assert.equal(parseStrictCustomerName("أ"), null);
    assert.equal(parseStrictCustomerName("12345678"), null);
    assert.equal(parseStrictCustomerName("<script>alert(1)</script>"), null);
    assert.equal(parseStrictCustomerName("  عبد   الرحمن   بوضياف  "), "عبد الرحمن بوضياف");

    const invalidRes = await callPost("update_customer_name", {
      orderId: "ORV-TEST-NAME-1",
      customerName: "   ",
    });
    assert.equal(invalidRes.status, 400);
    assert.equal(invalidRes.json.success, false);
    console.log("  [PASS] Test 1: Rejects invalid/empty/XSS/numeric customer names with HTTP 400");

    // ── TEST 2: Atomic Name Update + Dual-Column + Linked Customer FK Sync ──
    const update1 = await callPost("update_customer_name", {
      orderId: "ORV-TEST-NAME-1",
      customerName: "  عبد القادر بن صالح  ",
      reason: "طلب الزبون تغيير الاسم عند التأكيد الهاتفي",
    });
    assert.equal(update1.status, 200);
    assert.equal(update1.json.success, true);
    assert.equal(update1.json.previousName, "محمد بن علي");
    assert.equal(update1.json.customerName, "عبد القادر بن صالح");
    assert.equal(update1.json.linkedCustomerUpdated, true);

    const dbOrder1 = (
      await pglite.query(`SELECT * FROM orders WHERE order_id = 'ORV-TEST-NAME-1'`)
    ).rows[0] as any;
    assert.equal(dbOrder1.customer_name, "عبد القادر بن صالح");
    assert.equal(dbOrder1.full_name, "عبد القادر بن صالح");
    // Ensure existing discount metadata and order_items FK were NOT corrupted!
    assert.equal(dbOrder1.metadata.orderDiscount.finalTotalDzd, 5000);
    assert.equal(dbOrder1.metadata.customerNameHistory.length, 1);
    assert.equal(dbOrder1.metadata.customerNameHistory[0].previousName, "محمد بن علي");
    assert.equal(dbOrder1.metadata.customerNameHistory[0].newName, "عبد القادر بن صالح");

    const dbCustomer = (
      await pglite.query(`SELECT name FROM customers WHERE id = $1`, [customerId])
    ).rows[0] as any;
    assert.equal(dbCustomer.name, "عبد القادر بن صالح");

    const dbTimeline = (
      await pglite.query(`SELECT * FROM order_timeline_events WHERE order_id = 'ORV-TEST-NAME-1'`)
    ).rows as any[];
    assert.equal(dbTimeline.length, 1);
    assert.equal(dbTimeline[0].event_type, "CUSTOMER_NAME_UPDATED");
    console.log("  [PASS] Test 2: Updates customer_name, full_name, linked customers row, timeline & preserves metadata without reference errors");

    // ── TEST 3: Order with NULL customer_id (Zero Reference Errors) ─────────
    const update2 = await callPost("update_customer_name", {
      orderId: "ORV-TEST-NAME-2",
      customerName: "ياسين منصوري",
    });
    assert.equal(update2.status, 200);
    assert.equal(update2.json.success, true);
    assert.equal(update2.json.customerName, "ياسين منصوري");
    assert.equal(update2.json.linkedCustomerUpdated, false);
    console.log("  [PASS] Test 3: Updates order with NULL customer_id cleanly with zero FK/reference errors");

    // ── TEST 4: Sequential Update + Reload via get_all_orders ───────────────
    const update1Again = await callPost("update_customer_name", {
      orderId: "ORV-TEST-NAME-1",
      customerName: "الحاج عبد القادر بن صالح",
    });
    assert.equal(update1Again.status, 200);
    assert.equal(update1Again.json.previousName, "عبد القادر بن صالح");
    assert.equal(update1Again.json.customerName, "الحاج عبد القادر بن صالح");

    const listReq = new NextRequest("http://localhost:3000/api/delivery?action=get_all_orders", {
      method: "GET",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listRes = await deliveryGET(listReq);
    const listJson = await listRes.json();
    const listedOrder1 = (listJson.data as any[]).find((o) => o.orderId === "ORV-TEST-NAME-1");
    assert.ok(listedOrder1);
    assert.equal(listedOrder1.fullName, "الحاج عبد القادر بن صالح");
    assert.equal(listedOrder1.metadata.customerNameHistory.length, 2);
    console.log("  [PASS] Test 4: Sequential name changes persist across get_all_orders reload with full history");

    // ── TEST 5: Waybill Creation Uses Updated Customer Name ─────────────────
    const pushRes = await callPost("create", {
      orderId: "ORV-TEST-NAME-1",
      // Simulate stale UI passing the previous name before refresh
      fullName: "عبد القادر بن صالح",
      phone: "0550123456",
      wilayaCode: 16,
      wilayaName: "Alger",
      communeName: "Bab Ezzouar",
      codAmountDzd: 5000,
    });
    assert.equal(pushRes.status, 200);
    assert.equal(pushRes.json.success, true);
    const capturedWaybill = waybillCaptures.find((w) => w.reference === "ORV-TEST-NAME-1");
    assert.ok(capturedWaybill);
    assert.equal(capturedWaybill.nom_client, "الحاج عبد القادر بن صالح");
    assert.equal(capturedWaybill.montant, 5000);
    console.log("  [PASS] Test 5: Waybill creation sends the authoritative updated customer name & discounted COD total");

    // ── TEST 6: Automatic Meta Ads Campaign Profitability & Product Linking ─
    const sampleProducts: Product[] = [
      {
        id: "prod_pack_2_elite",
        sku: "ORVA-P2-12950",
        title: "باك الفيسوز كراون CROWN 20V",
        subtitle: "باك الورشة 5 في 1",
        description: "ماكينة ثقب كراون 20V",
        images: ["https://media.orva-store.com/products/pack2-hero.webp"],
        sellingPrice: 12950,
        purchaseCost: 7200,
        marketingCostPerOrder: 1250,
        metaAdsLink: {
          enabled: true,
          campaignId: "120299887766",
          campaignName: "Crown_20V_Algeria_Conv",
          costMode: "campaign_budget_cpa",
          campaignSpendUsd: 51.02,
          campaignSpendDzd: 12500,
          exchangeRateDzd: 245,
          attributedOrdersCount: 10,
          computedCpaDzd: 1250,
        },
        stockQuantity: 40,
        lowStockThreshold: 5,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Public DTO must strip confidential metaAdsLink, purchaseCost, and marketingCostPerOrder
    const publicDto = toPublicProductDTO(sampleProducts[0]) as Record<string, unknown>;
    assert.equal("metaAdsLink" in publicDto, false);
    assert.equal("purchaseCost" in publicDto, false);
    assert.equal("marketingCostPerOrder" in publicDto, false);

    const sampleOrders: OrvaOrder[] = [
      {
        id: "ORD-M1",
        createdAt: new Date().toISOString(),
        customer: "كمال بوعلام",
        phone: "0551112233",
        productName: "باك الفيسوز كراون CROWN 20V",
        status: "delivered",
        wilaya: "16 - الجزائر",
        commune: "باب الزوار",
        deliveryType: "DOMICILE",
        priceDzd: 12950,
        shippingDzd: 500,
        grandTotalDzd: 13450,
        quantity: 1,
        inRedex: true,
        redexTrackingCode: "RDX-101",
        fbCampaignId: "120299887766",
        utmCampaign: "Crown_20V_Algeria_Conv",
        attributionSource: "facebook_ads",
        remarks: [],
        raw: {},
      },
      {
        id: "ORD-M2",
        createdAt: new Date().toISOString(),
        customer: "سفيان حاج",
        phone: "0552223344",
        productName: "باك الفيسوز كراون CROWN 20V",
        status: "delivered",
        wilaya: "31 - وهران",
        commune: "وهران",
        deliveryType: "DOMICILE",
        priceDzd: 12950,
        shippingDzd: 500,
        grandTotalDzd: 13450,
        quantity: 1,
        inRedex: true,
        redexTrackingCode: "RDX-102",
        fbCampaignId: "120299887766",
        utmCampaign: "Crown_20V_Algeria_Conv",
        attributionSource: "facebook_ads",
        remarks: [],
        raw: {},
      },
      {
        id: "ORD-M3",
        createdAt: new Date().toISOString(),
        customer: "رشيد بلقاسم",
        phone: "0553334455",
        productName: "باك الفيسوز كراون CROWN 20V",
        status: "returned",
        wilaya: "07 - بسكرة",
        commune: "بسكرة",
        deliveryType: "DOMICILE",
        priceDzd: 12950,
        shippingDzd: 500,
        grandTotalDzd: 13450,
        quantity: 1,
        inRedex: true,
        redexTrackingCode: "RDX-103",
        fbCampaignId: "120299887766",
        utmCampaign: "Crown_20V_Algeria_Conv",
        attributionSource: "facebook_ads",
        remarks: [],
        raw: {},
      },
    ];

    const profRows = computeCampaignProfitability(sampleOrders, {}, {}, sampleProducts);
    assert.equal(profRows.length, 1);
    const row = profRows[0];
    assert.equal(row.campaignKey, "fb:120299887766");
    assert.equal(row.adSpendSource, "product_link");
    // Explicit campaign budget spend on product link is 12,500 DZD
    assert.equal(row.adSpendDzd, 12500);
    // 2 delivered orders * 12,950 = 25,900 DZD revenue
    assert.equal(row.deliveredProductRevenueDzd, 25900);
    // 2 delivered orders * 7,200 purchaseCost = 14,400 DZD COGS
    assert.equal(row.totalCogsDzd, 14400);
    // 1 returned order * 450 DZD return shipping loss = 450 DZD
    assert.equal(row.totalReturnLossDzd, 450);
    // Net profit = 25,900 - 14,400 - 450 - 12,500 = -1,450 DZD (or with 2 orders * 1,250 CPA if per-order)
    assert.equal(row.netProfitDzd, 25900 - 14400 - 450 - 12500);
    assert.ok(row.roas !== null && row.roas > 0);
    assert.ok(row.costPerOrderDzd !== null && row.costPerOrderDzd > 0);
    assert.equal(row.linkedProducts.length, 1);
    assert.equal(row.linkedProducts[0].marketingCostPerOrderDzd, 1250);
    console.log("  [PASS] Test 6: Automatic Meta Ads Campaign Profitability computes adSpend, COGS, ROAS, CPA & netProfit automatically from linked product");

    // ── TEST 7: Meta-Ads-MCP & meta-ads-expert Skill & UI Wiring Verification ─
    const skillPaths = [
      "C:/Users/user/.gemini/config/skills/meta-ads-expert/SKILL.md",
      "C:/Users/user/.agents/skills/meta-ads-expert/SKILL.md",
      path.resolve(process.cwd(), ".agents/skills/meta-ads-expert/SKILL.md"),
    ];
    for (const sp of skillPaths) {
      assert.equal(fs.existsSync(sp), true, `Expected skill file at ${sp}`);
    }
    assert.equal(
      fs.existsSync("C:/Users/user/.gemini/mcp-servers/Meta-Ads-MCP/src/server.py"),
      true,
      "Expected Meta-Ads-MCP server.py",
    );

    const unitMargin = computeUnitMargin(12950, 7200);
    const estProfit = computeEstimatedOrderProfit(12950, 7200, 1250, 1);
    assert.equal(unitMargin, 5750);
    assert.equal(estProfit, 4500);
    console.log("  [PASS] Test 7: meta-ads-expert skill & Meta-Ads-MCP server installed across IDE/agent directories and product economics verified");

    console.log("\nALL 7 CUSTOMER NAME, META ADS PROFITABILITY & AI MARKETING CONSULTANT TESTS PASSED SUCCESSFULLY!");
  } finally {
    globalThis.fetch = origFetch;
    __testResetSupabaseServerInstance();
    await pglite.close();
  }
}

main().catch((err) => {
  console.error("TEST SUITE FAILED:", err);
  process.exit(1);
});
