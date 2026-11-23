import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { POST as webhookPost } from "../../src/app/api/couriers/webhook/route";
import { computeWilayaRiskGuardrails, evaluateWilayaRiskForCheckout } from "../../src/lib/analytics/wilaya-risk-guardrails";
import { EcoTrackClient } from "../../src/lib/couriers/ecotrack-client";
import { mapCourierStatusRich } from "../../src/lib/delivery/courier-status-mapper";
import { getStoredFallbackOrders, saveAllFallbackOrders } from "../../src/lib/orders-store";
import { normalizeOrvaOrder } from "../../src/lib/orva-api";
import { parseCourierExcelBuffer, type ParsedCourierRow } from "../../src/lib/reconciliation/excel-parser";
import {
  applyAuthoritativeCourierAutoHeal,
  runMultiCourierReconciliation,
} from "../../src/lib/reconciliation/reconciliation-engine";
import * as XLSX from "xlsx";

function makeWorkbookBuffer(rows: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Orders");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function runTests() {
  console.log("── Stage 5 Verification: Forensic 4 Orders, 5-Tier Fuzzy Matching, Auto-Heal, Webhook & Wilaya Guardrails ──");
  let passed = 0;
  function verify(cond: boolean, label: string) {
    assert.ok(cond, label);
    passed += 1;
    console.log(`  [PASS] ${String(passed).padStart(2, "0")}: ${label}`);
  }

  const prevStored = structuredClone(getStoredFallbackOrders());
  const prevEnvSecret = process.env.COURIER_WEBHOOK_SECRET;
  const originalFetch = globalThis.fetch;

  try {
    // Seed 4 exact forensic store orders + extra orders for fuzzy/scoped tests
    saveAllFallbackOrders([
      {
        id: "PACK2-789399",
        orderNumber: "PACK2-789399",
        customerName: "Hadjou Fateh",
        customerPhone: "0555773197",
        customerPhone2: null,
        wilayaCode: 15,
        wilayaName: "15 - Tizi Ouzou",
        communeName: "Tizi Ouzou",
        deliveryType: "DOMICILE",
        deliveryAddress: "Centre",
        packId: "PACK2",
        productName: "باك الفيسوز كراون CROWN 20V",
        productPrice: 13390,
        shippingFee: 750,
        totalPayable: 14140,
        status: "SHIPPED",
        originHub: "BISKRA_07",
        createdAt: "2026-11-20T10:00:00Z",
        in_redex: true,
        redex_tracking_code: "ECEOSK261120183196",
        courier_id: "redex",
      } as any,
      {
        id: "PACK2-151174",
        orderNumber: "PACK2-151174",
        customerName: "جيار جلال",
        customerPhone: "0540143584",
        customerPhone2: null,
        wilayaCode: 16,
        wilayaName: "16 - Alger",
        communeName: "Alger",
        deliveryType: "DOMICILE",
        deliveryAddress: "Alger",
        packId: "PACK2",
        productName: "باك الفيسوز كراون CROWN 20V",
        productPrice: 13390,
        shippingFee: 700,
        totalPayable: 14090,
        quantity: 1,
        status: "SHIPPED",
        originHub: "BISKRA_07",
        createdAt: "2026-11-20T11:00:00Z",
        in_redex: true,
        redex_tracking_code: "ECEOSK261120182844",
        courier_id: "redex",
      } as any,
      {
        id: "ORVA-P4-CROWN-639442",
        orderNumber: "ORVA-P4-CROWN-639442",
        customerName: "ميلودي توفيق",
        customerPhone: "0666869888",
        customerPhone2: null,
        wilayaCode: 1,
        wilayaName: "01 - Adrar",
        communeName: "Adrar",
        deliveryType: "DOMICILE",
        deliveryAddress: "Adrar",
        packId: "PACK4",
        productName: "عرض خاص CROWN",
        productPrice: 15200,
        shippingFee: 1300,
        totalPayable: 16500,
        quantity: 1,
        status: "SHIPPED",
        originHub: "BISKRA_07",
        createdAt: "2026-11-16T10:00:00Z",
        in_redex: true,
        redex_tracking_code: "ECEOSK261116173337",
        courier_id: "redex",
      } as any,
      {
        id: "PACK1-853823",
        orderNumber: "PACK1-853823",
        customerName: "Bandjlloule",
        customerPhone: "0663485045",
        customerPhone2: null,
        wilayaCode: 55,
        wilayaName: "55 - Touggourt",
        communeName: "Touggourt",
        deliveryType: "DOMICILE",
        deliveryAddress: "Touggourt",
        packId: "PACK1",
        productName: "Pack 1",
        productPrice: 5100,
        shippingFee: 800,
        totalPayable: 5900,
        quantity: 1,
        status: "RETURNED",
        originHub: "BISKRA_07",
        createdAt: "2026-11-11T10:00:00Z",
        in_redex: true,
        redex_tracking_code: "ECEOSK261111161317",
        courier_id: "redex",
      } as any,
      {
        id: "PACK1-998877",
        orderNumber: "PACK1-998877",
        customerName: "Kamel Benali",
        customerPhone: "0771998877",
        customerPhone2: null,
        wilayaCode: 19,
        wilayaName: "19 - Sétif",
        communeName: "El Eulma",
        deliveryType: "DOMICILE",
        deliveryAddress: "El Eulma",
        packId: "PACK1",
        productName: "Pack 1",
        productPrice: 4500,
        shippingFee: 600,
        totalPayable: 5100,
        quantity: 1,
        status: "CONFIRMED",
        originHub: "BISKRA_07",
        createdAt: "2026-11-21T10:00:00Z",
        in_redex: false,
        courier_id: "redex",
      } as any,
    ]);

    // 1. EcoTrack getAllOrdersPaginated status enrichment (en_process -> suspendu via get/orders/status) + remarks extraction
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/v1/get/orders/status")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ECEOSK261111161317: {
                status: "suspendu",
                driver_phone: "0661000011",
                activity: [{ date: "2026-11-16", time: "09:35", status: "suspendu", station: "30 - Ouargla (P)" }],
              },
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/v1/get/orders")) {
        return new Response(
          JSON.stringify({
            current_page: 1,
            last_page: 1,
            total: 1,
            data: [
              {
                tracking: "ECEOSK261111161317",
                reference: "853823",
                client: "Bandjlloule",
                phone: "0663485045",
                wilaya_id: 55,
                montant: "5900",
                global_status: "en_process",
                stop_desk: 1,
                tarif_prestation: "800",
                tarif_retour: "100",
                status_reason: [
                  { livreur: "01. Omari livré", remarque: "Livraison au bureau - توصيل للمكتب" },
                  { remarque: "raouf : 16000" },
                ],
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;

    const eco = new EcoTrackClient({ courierId: "redex", baseUrl: "https://redex.ecotrack.dz", token: "tok_test" });
    const paginated = await eco.getAllOrdersPaginated({ maxPages: 1 });
    verify(
      paginated.success &&
        paginated.orders[0]?.status === "suspendu" &&
        paginated.orders[0]?.driverPhone === "0661000011" &&
        paginated.orders[0]?.stopDesk === true &&
        Boolean(paginated.orders[0]?.remarksSummary?.includes("raouf : 16000")),
      "EcoTrack getAllOrdersPaginated enriches en_process with getBulkOrdersStatus & extracts remarks/stop_desk",
    );

    // 2. Forensic 4 Orders Diagnosis + 5-Tier Fuzzy Matching + Auto-Heal
    const redexRows: ParsedCourierRow[] = [
      // Order 1: Hadjou Fateh (stripped ref "789399", 1-digit phone typo on secondary phone scenario, -140 commercial discount)
      {
        rowIndex: 1,
        courierId: "redex",
        courierName: "Redex Express",
        sourceFileName: "API:redex",
        trackingCode: "ECEOSK261120183196",
        reference: "789399",
        boutique: "ORVA",
        customerName: "Hadjou Fateh",
        customerPhone: "0555773197",
        customerPhoneTail9: "555773197",
        customerPhone2: "",
        wilayaRaw: "15",
        wilayaCode: 15,
        commune: "Tizi Ouzou",
        address: "",
        montantDzd: 14000,
        productName: "",
        rawStatus: "en_livraison",
        normalizedStatus: mapCourierStatusRich("en_livraison").normalizedStatus,
        mappedStoreStatus: mapCourierStatusRich("en_livraison").orderStatus,
        financialStatus: "",
        deliveryFeeDzd: 750,
        returnFeeDzd: 100,
        stopDesk: false,
        driverName: "",
        driverPhone: "",
        createdAt: null,
        updatedAt: null,
        rawRow: {},
      },
      // Order 2: جيار جلال (upsell x2: 13390*2 + 700 = 27480, matched even via stripped ref "151174" without tracking!)
      {
        rowIndex: 2,
        courierId: "redex",
        courierName: "Redex Express",
        sourceFileName: "API:redex",
        trackingCode: "",
        reference: "151174",
        boutique: "ORVA",
        customerName: "جيار جلال",
        customerPhone: "+213540143584",
        customerPhoneTail9: "540143584",
        customerPhone2: "",
        wilayaRaw: "16",
        wilayaCode: 16,
        commune: "Alger",
        address: "",
        montantDzd: 27480,
        productName: "",
        rawStatus: "en_livraison",
        normalizedStatus: mapCourierStatusRich("en_livraison").normalizedStatus,
        mappedStoreStatus: mapCourierStatusRich("en_livraison").orderStatus,
        financialStatus: "",
        deliveryFeeDzd: 700,
        returnFeeDzd: 100,
        stopDesk: false,
        driverName: "",
        driverPhone: "",
        createdAt: null,
        updatedAt: null,
        rawRow: {},
      },
      // Order 3: ميلودي توفيق (Stop Desk tariff shift 16500 -> 16000, -500 DZD + remark "raouf : 16000")
      {
        rowIndex: 3,
        courierId: "redex",
        courierName: "Redex Express",
        sourceFileName: "API:redex",
        trackingCode: "ECEOSK261116173337",
        reference: "ORVA-P4-CROWN-639442",
        boutique: "ORVA",
        customerName: "ميلودي توفيق",
        customerPhone: "0666869888",
        customerPhoneTail9: "666869888",
        customerPhone2: "",
        wilayaRaw: "1",
        wilayaCode: 1,
        commune: "Adrar",
        address: "",
        montantDzd: 16000,
        productName: "",
        rawStatus: "en_livraison",
        normalizedStatus: mapCourierStatusRich("en_livraison").normalizedStatus,
        mappedStoreStatus: mapCourierStatusRich("en_livraison").orderStatus,
        financialStatus: "",
        deliveryFeeDzd: 800,
        returnFeeDzd: 100,
        stopDesk: true,
        remarksSummary: "01. Omari livré: Livraison au bureau | raouf : 16000",
        driverName: "",
        driverPhone: "",
        createdAt: null,
        updatedAt: null,
        rawRow: { stop_desk: 1 },
      },
      // Order 4: Bandjlloule (Store terminal "returned" vs Authoritative Courier "en_livraison" -> out_for_delivery)
      {
        rowIndex: 4,
        courierId: "redex",
        courierName: "Redex Express",
        sourceFileName: "API:redex",
        trackingCode: "ECEOSK261111161317",
        reference: "853823",
        boutique: "ORVA",
        customerName: "Bandjlloule",
        customerPhone: "0663485045",
        customerPhoneTail9: "663485045",
        customerPhone2: "",
        wilayaRaw: "55",
        wilayaCode: 55,
        commune: "Touggourt",
        address: "",
        montantDzd: 5900,
        productName: "",
        rawStatus: "en_livraison",
        normalizedStatus: mapCourierStatusRich("en_livraison").normalizedStatus,
        mappedStoreStatus: mapCourierStatusRich("en_livraison").orderStatus,
        financialStatus: "",
        deliveryFeeDzd: 800,
        returnFeeDzd: 100,
        stopDesk: false,
        driverName: "",
        driverPhone: "",
        createdAt: null,
        updatedAt: null,
        rawRow: {},
      },
      // Tier 4 Fuzzy Phone Typo test (1 digit off: 0771998878 vs 0771998877 in same wilaya 19 + close amount)
      {
        rowIndex: 5,
        courierId: "redex",
        courierName: "Redex Express",
        sourceFileName: "API:redex",
        trackingCode: "",
        reference: "",
        boutique: "ORVA",
        customerName: "Kamel Benali",
        customerPhone: "0771998878",
        customerPhoneTail9: "771998878",
        customerPhone2: "",
        wilayaRaw: "19",
        wilayaCode: 19,
        commune: "El Eulma",
        address: "",
        montantDzd: 5100,
        productName: "",
        rawStatus: "livred",
        normalizedStatus: mapCourierStatusRich("livred").normalizedStatus,
        mappedStoreStatus: mapCourierStatusRich("livred").orderStatus,
        financialStatus: "livred",
        deliveryFeeDzd: 600,
        returnFeeDzd: 100,
        stopDesk: false,
        driverName: "",
        driverPhone: "",
        createdAt: null,
        updatedAt: null,
        rawRow: {},
      },
      // Unmatched parcel must remain courier_only (never auto-imported)
      {
        rowIndex: 6,
        courierId: "redex",
        courierName: "Redex Express",
        sourceFileName: "API:redex",
        trackingCode: "ECEOSK-EXT-999",
        reference: "EXTERNAL-1",
        boutique: "OTHER",
        customerName: "Zinou X",
        customerPhone: "0550999888",
        customerPhoneTail9: "550999888",
        customerPhone2: "",
        wilayaRaw: "16",
        wilayaCode: 16,
        commune: "Alger",
        address: "",
        montantDzd: 4500,
        productName: "",
        rawStatus: "en_livraison",
        normalizedStatus: mapCourierStatusRich("en_livraison").normalizedStatus,
        mappedStoreStatus: mapCourierStatusRich("en_livraison").orderStatus,
        financialStatus: "",
        deliveryFeeDzd: 600,
        returnFeeDzd: 100,
        stopDesk: false,
        driverName: "",
        driverPhone: "",
        createdAt: null,
        updatedAt: null,
        rawRow: {},
      },
    ];

    const recon = await runMultiCourierReconciliation({
      batches: [{ courierId: "redex", courierName: "Redex Express", sourceType: "api", rows: redexRows }],
      includeStoreOnly: true,
    });

    const row1 = recon.rows.find((r) => r.storeOrderId === "PACK2-789399");
    const row2 = recon.rows.find((r) => r.storeOrderId === "PACK2-151174");
    const row3 = recon.rows.find((r) => r.storeOrderId === "ORVA-P4-CROWN-639442");
    const row4 = recon.rows.find((r) => r.storeOrderId === "PACK1-853823");
    const rowFuzzy = recon.rows.find((r) => r.storeOrderId === "PACK1-998877");
    const rowExt = recon.rows.find((r) => r.trackingCode === "ECEOSK-EXT-999");

    verify(
      row1?.discrepancyCategory === "commercial_rounding_discount" &&
        row1.codDiffDzd === -140 &&
        row1.autoHealPatch?.totalPayableDzd === 14000,
      "Forensic Order 1 (PACK2-789399) detects -140 DZD commercial discount",
    );
    verify(
      row2?.matchMethod === "exact_or_stripped_reference" &&
        row2.discrepancyCategory === "quantity_upsell" &&
        row2.autoHealPatch?.quantity === 2 &&
        row2.autoHealPatch?.totalPayableDzd === 27480,
      "Forensic Order 2 (PACK2-151174) matches stripped ref '151174' & diagnoses 2x Quantity Upsell (27,480 DZD)",
    );
    verify(
      row3?.discrepancyCategory === "stop_desk_tariff_shift" &&
        row3.autoHealPatch?.deliveryType === "STOP_DESK" &&
        row3.autoHealPatch?.deliveryFeeDzd === 800 &&
        row3.autoHealPatch?.totalPayableDzd === 16000 &&
        Boolean(row3.remarksSummary?.includes("raouf : 16000")),
      "Forensic Order 3 (ORVA-P4-CROWN-639442) diagnoses Stop Desk -500 DZD tariff shift & extracts remarks",
    );
    verify(
      row4?.discrepancyCategory === "terminal_store_override_conflict" &&
        row4.autoHealPatch?.storeStatus === "out_for_delivery",
      "Forensic Order 4 (PACK1-853823) flags terminal store override conflict against out_for_delivery",
    );
    verify(
      rowFuzzy?.matchMethod === "fuzzy_phone_typo" && rowFuzzy.autoHealPatch?.storeStatus === "delivered",
      "5-Tier Fuzzy Matcher links 1-digit phone typo in same wilaya",
    );
    verify(rowExt?.bucket === "courier_only", "Unmatched courier order stays in courier_only tab without auto-import");

    // 3. Apply authoritative auto-heal (/grill-me decision: courier COD + status are authoritative)
    const healed = await applyAuthoritativeCourierAutoHeal(recon);
    verify(
      healed.healedCount === 5 &&
        healed.summary.counts.matched_unsynced === 0 &&
        healed.summary.counts.matched_synced === 5,
      "Authoritative auto-heal promotes all 5 discrepancy rows to matched_synced (0 unsynced remaining)",
    );

    const updatedOrders = getStoredFallbackOrders();
    const healedOrder2 = updatedOrders.find((o) => o.orderNumber === "PACK2-151174") as any;
    const healedOrder3 = updatedOrders.find((o) => o.orderNumber === "ORVA-P4-CROWN-639442") as any;
    const healedOrder4 = updatedOrders.find((o) => o.orderNumber === "PACK1-853823") as any;
    verify(
      healedOrder2?.totalPayable === 27480 && healedOrder2?.quantity === 2,
      "Persists upsell quantity=2 and totalPayable=27,480 in store order",
    );
    verify(
      healedOrder3?.totalPayable === 16000 && healedOrder3?.deliveryType === "STOP_DESK" && healedOrder3?.shippingFee === 800,
      "Persists STOP_DESK deliveryType and 800 DZD fee in store order",
    );
    verify(
      healedOrder4?.status === "OUT_FOR_DELIVERY",
      "Updates Bandjlloule store status authoritatively from RETURNED to OUT_FOR_DELIVERY",
    );

    // 4. Scoped store_only: syncing empty Yalidine never flags Redex parcels!
    const yalidineRecon = await runMultiCourierReconciliation({
      batches: [{ courierId: "yalidine", courierName: "Yalidine", sourceType: "api", rows: [] }],
      includeStoreOnly: true,
    });
    verify(
      yalidineRecon.counts.store_only === 0,
      "Scoped store_only prevents Redex orders from appearing missing during empty Yalidine sync",
    );

    // 5. Excel parser extracts stop_desk & status_reason cleanly when columns exist
    const excelBuf = makeWorkbookBuffer([
      {
        Tracking: "TRK-X1",
        Reference: "789399",
        Client: "Test",
        Telephone: "0555000111",
        Wilaya: "15",
        Montant: 14000,
        Statut: "en_livraison",
      },
    ]);
    const parsedExcel = parseCourierExcelBuffer({
      buffer: excelBuf,
      fileName: "test.xlsx",
      courierId: "redex",
      courierName: "Redex",
    });
    verify(parsedExcel.rowCount === 1 && parsedExcel.rows[0].reference === "789399", "Parses Excel stripped reference cleanly");

    // 6. Real-Time Webhook POST /api/couriers/webhook + 8-status progression
    process.env.COURIER_WEBHOOK_SECRET = "test_webhook_secret_99";
    const unauthReq = new NextRequest("http://localhost:3000/api/couriers/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tracking: "ECEOSK261111161317", status: "livred" }),
    });
    const unauthRes = await webhookPost(unauthReq);
    verify(unauthRes.status === 401, "Webhook rejects unauthenticated requests with HTTP 401");

    const authReq = new NextRequest("http://localhost:3000/api/couriers/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": "test_webhook_secret_99",
      },
      body: JSON.stringify({
        courier_id: "redex",
        tracking: "ECEOSK261111161317",
        status: "livred",
        montant: 5900,
      }),
    });
    const authRes = await webhookPost(authReq);
    const authJson = await authRes.json();
    verify(
      authRes.status === 200 && authJson.success && authJson.results?.[0]?.status === "delivered",
      "Webhook updates matched order to delivered (8-status lifecycle) with valid secret",
    );

    // 7. Wilaya Risk Guardrails (< 70% delivery rate)
    const riskSampleOrders = [
      normalizeOrvaOrder({ id: "R1", wilaya: "58 - El Menia", status: "delivered", grand_total: "5000" })!,
      normalizeOrvaOrder({ id: "R2", wilaya: "58 - El Menia", status: "returned", grand_total: "5000" })!,
      normalizeOrvaOrder({ id: "R3", wilaya: "58 - El Menia", status: "returned", grand_total: "5000" })!,
      normalizeOrvaOrder({ id: "R4", wilaya: "58 - El Menia", status: "returned", grand_total: "5000" })!,
      normalizeOrvaOrder({ id: "R5", wilaya: "16 - Alger", status: "delivered", grand_total: "5000" })!,
      normalizeOrvaOrder({ id: "R6", wilaya: "16 - Alger", status: "delivered", grand_total: "5000" })!,
      normalizeOrvaOrder({ id: "R7", wilaya: "16 - Alger", status: "delivered", grand_total: "5000" })!,
      normalizeOrvaOrder({ id: "R8", wilaya: "99", status: "returned", grand_total: "5000" })!,
    ];
    const guardrails = computeWilayaRiskGuardrails(riskSampleOrders);
    verify(
      guardrails.highRiskWilayas.length === 1 &&
        guardrails.highRiskWilayas[0].wilayaCode === 58 &&
        guardrails.highRiskWilayas[0].deliveryRatePct === 25 &&
        guardrails.highRiskWilayas[0].riskTier === "CRITICAL",
      "Wilaya Risk Guardrails detects < 70% delivery rate (Wilaya 58 = 25% CRITICAL)",
    );

    const checkoutEval58 = await evaluateWilayaRiskForCheckout(58, riskSampleOrders);
    const checkoutEval16 = await evaluateWilayaRiskForCheckout(16, riskSampleOrders);
    verify(
      checkoutEval58.warningTriggered === true &&
        checkoutEval58.riskDecision === "REVIEW" &&
        Boolean(checkoutEval58.telegramWarningLine) &&
        checkoutEval16.warningTriggered === false &&
        checkoutEval16.riskDecision === "ALLOW",
      "Checkout Wilaya guardrail flags high-risk wilaya as REVIEW with Telegram alert & keeps healthy wilaya ALLOW",
    );

    console.log(`\nALL ${passed} TESTS PASSED!`);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevEnvSecret === undefined) delete process.env.COURIER_WEBHOOK_SECRET;
    else process.env.COURIER_WEBHOOK_SECRET = prevEnvSecret;
    saveAllFallbackOrders(prevStored);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
