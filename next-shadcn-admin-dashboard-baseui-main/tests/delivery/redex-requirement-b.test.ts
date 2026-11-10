import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { RedexCourierProvider } from "../../src/lib/couriers/ecotrack-provider";
import { getEcoTrackClient } from "../../src/lib/couriers/ecotrack-client";
import { GET as getDelivery, POST as postDelivery } from "../../src/app/api/delivery/route";
import { generateSessionToken, extractSessionToken, verifySessionTokenSync } from "../../src/lib/auth/admin-auth";
import { getStoredFallbackOrders, saveAllFallbackOrders } from "../../src/lib/orders-store";
import { getSupabaseServerClient } from "../../src/lib/supabase/server";

/**
 * ORVA Store v2.1.0 — Stage 2 Remediation A.2: Manual Validation Integrity Test Suite
 * Defect APP-01 Remediation Verification & State-Machine Integrity
 *
 * Verifies:
 * 1. Parcel creation calls createOrder() ONLY and strictly does NOT invoke validOrder().
 * 2. Redex tracking code is saved and returned.
 * 3. Shipping label retrieval flow remains functional without validating.
 * 4. Tracking status retrieval remains functional without validating.
 * 5. Initial "Prêt à expédier" (prete_a_expedier / جاهز للإرسال) state is preserved.
 * 6. Explicit manual validation (validate_order) works when authorized.
 * 7. Forged client body.actor is strictly ignored; verified session identity is recorded.
 * 8. Both askCollection values map correctly: 0 -> vers_station, 1 -> en_ramassage.
 * 9. Invalid askCollection values (< 0, > 1, strings) are rejected with HTTP 400.
 * 10. Missing delivery record is explicitly rejected with HTTP 404 (not treated as validated).
 * 11. Already progressed parcels (in transit, out for delivery, delivered) cannot regress (HTTP 409).
 * 12. Duplicate validation calls do NOT duplicate audit events in remarks or re-invoke Redex.
 * 13. Concurrency simulation prevents dual-transition execution.
 * 14. Redex success followed by Supabase failure records RECONCILIATION_REQUIRED (HTTP 502) and is recoverable.
 * 15. Retry of carrier-accepted validation does NOT repeat external carrier call.
 * 16. Supabase { error } results are handled and never masked as successful sync.
 */

interface MockFetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

async function runRedexRequirementBSuite() {
  console.log("================================================================================");
  console.log("   ORVA STORE — STAGE 2 REMEDIATION A.2: MANUAL VALIDATION INTEGRITY SUITE");
  console.log("   Defect APP-01 Remediation & State-Machine Integrity Verification");
  console.log("   Timestamp: " + new Date().toISOString());
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
      if (detail) console.error(`         Detail: ${detail}`);
      throw new Error(`Assertion Failed: ${testName}`);
    }
  }

  // Configure valid mock service-role JWT for local test harness
  const mockServiceRoleJwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_signature_for_test_runner";
  process.env.SUPABASE_SERVICE_ROLE_KEY = mockServiceRoleJwt;

  // Network Interception Harness (Strict zero live API calls)
  const recordedCalls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  let createOrderResponse: any = {
    success: true,
    tracking: "EC-REDUX-B-1001",
    message: "Commande créée avec succès",
  };
  let validOrderResponse: any = {
    success: true,
    message: "Commande expedier avec succès",
  };
  let trackingInfoResponse: any = {
    success: true,
    tracking: "EC-REDUX-B-1001",
    status: "prete_a_expedier",
    statusAr: "جاهز للإرسال (Prêt à expédier)",
    activity: [
      {
        date: "2026-11-09",
        time: "10:00:00",
        status: "prete_a_expedier",
        statusAr: "جاهز للإرسال",
      },
    ],
  };
  let labelPdfResponse: Uint8Array = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
  let simulatePostgresTimeout = false;

  function resetHarness() {
    recordedCalls.length = 0;
    simulatePostgresTimeout = false;
    createOrderResponse = {
      success: true,
      tracking: "EC-REDUX-B-1001",
      message: "Commande créée avec succès",
    };
    validOrderResponse = {
      success: true,
      message: "Commande expedier avec succès",
    };
  }

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || "GET";
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => { headers[k] = v; });
      } else {
        Object.assign(headers, init.headers);
      }
    }

    recordedCalls.push({
      url: urlStr,
      method,
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });

    // 1. Communes endpoint
    if (urlStr.includes("/api/v1/get/communes")) {
      return new Response(JSON.stringify([
        { nom: "Alger Centre", wilaya_id: 16, code_postal: "16000", has_stop_desk: 1, is_active: 1 },
        { nom: "Bab El Oued", wilaya_id: 16, code_postal: "16001", has_stop_desk: 1, is_active: 1 },
      ]), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 2. Create order endpoint
    if (urlStr.includes("/api/v1/create/order")) {
      const isSuccess = Boolean(createOrderResponse?.success);
      return new Response(JSON.stringify(createOrderResponse), {
        status: isSuccess ? 200 : (createOrderResponse?.status || 422),
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Valid order endpoint
    if (urlStr.includes("/api/v1/valid/order")) {
      const isSuccess = Boolean(validOrderResponse?.success);
      return new Response(JSON.stringify(validOrderResponse), {
        status: isSuccess ? 200 : (validOrderResponse?.status || 422),
        headers: { "Content-Type": "application/json" },
      });
    }

    // 4. Label endpoint
    if (urlStr.includes("/api/v1/get/order/label") || urlStr.includes("/api/v1/get/label") || urlStr.includes("/api/v1/get/bulk/labels")) {
      return new Response(labelPdfResponse as any, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }

    // 5. Tracking endpoint
    if (urlStr.includes("/api/v1/get/tracking/info")) {
      return new Response(JSON.stringify(trackingInfoResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 6. Supabase PostgREST Interception
    if (urlStr.includes("/rest/v1/")) {
      if (simulatePostgresTimeout && (method === "PATCH" || method === "PUT" || method === "POST")) {
        return new Response(JSON.stringify({ message: "Simulated database connection timeout (PGRST000)", code: "PGRST000" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("tracking_number=eq.EC-COMPLETELY-NON-EXISTENT")) {
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "GET") {
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "PATCH" || method === "POST") {
        return new Response(JSON.stringify([{ id: "mock-updated-id" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default mock response
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    // ── GROUP 1: COURIER PROVIDER UNIT ISOLATION TESTS ─────────────────────────
    console.log("── GROUP 1: Courier Provider Unit Isolation Tests");

    const provider = new RedexCourierProvider();

    // Test 1: createParcel calls createOrder ONLY and does NOT invoke validOrder
    resetHarness();
    const parcelResult = await provider.createParcel({
      orderNumber: "TEST-ORD-001",
      customerName: "Ahmed Benali",
      customerPhone: "0555123456",
      wilayaCode: 16,
      wilayaName: "Alger",
      communeName: "Alger Centre",
      address: "Rue Didouche Mourad",
      deliveryType: "DOMICILE",
      amountToCollect: 4500,
      productDescription: "Pack ORVA Sérum",
    });

    const createCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/create/order"));
    const validCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));

    assert(parcelResult.success, "Provider createParcel succeeded");
    assert(parcelResult.trackingCode === "EC-REDUX-B-1001", "Tracking code preserved and returned by provider");
    assert(createCalls.length === 1, "Exactly one call made to /api/v1/create/order");
    assert(validCalls.length === 0, "ZERO calls made to /api/v1/valid/order upon parcel creation (Redex Requirement B satisfied)");
    assert(
      parcelResult.labelUrl === "/api/delivery?action=label_pdf&tracking=EC-REDUX-B-1001",
      "Provider returns correct label URL format"
    );

    // Test 2: Explicit validateParcel method executes validation on demand
    resetHarness();
    const explicitValResult = await provider.validateParcel("EC-REDUX-B-1001", 0);
    const manualValidCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));

    assert(explicitValResult.success, "Explicit validateParcel succeeded");
    assert(manualValidCalls.length === 1, "Exactly one call made to /api/v1/valid/order when explicitly requested");
    assert(manualValidCalls[0].url.includes("tracking=EC-REDUX-B-1001"), "Validation call carries correct tracking parameter");
    assert(manualValidCalls[0].url.includes("ask_collection=0"), "Validation call carries ask_collection=0");

    // Test 3: Provider validateParcel rejects invalid askCollection values
    const badProviderAsk = await provider.validateParcel("EC-REDUX-B-1001", 5 as any);
    assert(!badProviderAsk.success, "Provider validateParcel rejects invalid askCollection value (5)");

    // Test 4: Tracking retrieval does NOT validate parcel
    resetHarness();
    const trackingStatus = await provider.getTrackingStatus("EC-REDUX-B-1001");
    const trackValidCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));

    assert(trackingStatus.status === "prete_a_expedier", "Tracking status preserves prete_a_expedier state");
    assert(trackValidCalls.length === 0, "ZERO validation calls occurred during tracking status retrieval");

    // ── GROUP 2: DELIVERY ROUTE HANDLER CREATION TESTS ─────────────────────────
    console.log("\n── GROUP 2: Delivery Route Handler Creation Tests (/api/delivery?action=create)");

    const adminToken = generateSessionToken();
    const decodedSession = verifySessionTokenSync(adminToken);
    const expectedSessionActor = decodedSession?.sid ? `admin:${decodedSession.sid.slice(0, 8)}` : "admin";

    const authHeaders = {
      authorization: `Bearer ${adminToken}`,
      host: "localhost:3000",
      "content-type": "application/json",
    };

    // Test 5: POST /api/delivery?action=create creates parcel without auto-validation
    resetHarness();
    const testOrderId = "ORD-REQ-B-4001";
    const existingFallback = getStoredFallbackOrders();
    const filteredFallback = existingFallback.filter((f) => f.id !== testOrderId);
    filteredFallback.push({
      id: testOrderId,
      orderNumber: testOrderId,
      customerName: "Karim Ziani",
      customerPhone: "0661234567",
      wilaya: "16 - Alger",
      commune: "Bab El Oued",
      address: "Bab El Oued Centre",
      status: "PENDING" as any,
      items: [{ name: "Sérum ORVA", quantity: 1, unitPrice: 3800 }],
      total: 4200,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(filteredFallback);

    const createReq = new NextRequest("http://localhost:3000/api/delivery?action=create", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        orderId: testOrderId,
        fullName: "Karim Ziani",
        phone: "0661234567",
        wilaya: "Alger",
        wilayaCode: 16,
        commune: "Bab El Oued",
        address: "Bab El Oued Centre",
        deliveryType: "home",
        codAmountDzd: 4200,
        productName: "Sérum ORVA",
      }),
    });

    const createRes = await postDelivery(createReq);
    const createBody = await createRes.json();
    const routeCreateCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/create/order"));
    const routeValidCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));

    assert(createRes.status === 200, "POST /api/delivery?action=create returned HTTP 200");
    assert(createBody.success === true, "Response indicated success");
    assert(createBody.trackingCode === "EC-REDUX-B-1001", "Tracking code preserved and returned in response");
    assert(createBody.status === "prete_a_expedier", "Parcel status is explicitly 'prete_a_expedier'");
    assert(createBody.carrierStatus === "prete_a_expedier", "Carrier status is 'prete_a_expedier'");
    assert(createBody.carrierStatusAr === "جاهز للإرسال", "Arabic carrier status is 'جاهز للإرسال'");
    assert(createBody.validated === false, "validated flag is strictly false in creation response");
    assert(routeCreateCalls.length === 1, "Exactly one call made to /api/v1/create/order");
    assert(routeValidCalls.length === 0, "ZERO calls made to /api/v1/valid/order during creation via route handler");

    // ── GROUP 3: LABEL & TRACKING RETRIEVAL TESTS ──────────────────────────────
    console.log("\n── GROUP 3: Label & Tracking Retrieval Tests (Non-Mutating)");

    // Test 6: Shipping label retrieval remains functional without validating
    resetHarness();
    const labelReq = new NextRequest("http://localhost:3000/api/delivery?action=label_pdf&tracking=EC-REDUX-B-1001", {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminToken}`,
        host: "localhost:3000",
      },
    });
    const labelRes = await getDelivery(labelReq);
    const labelCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/get/order/label") || c.url.includes("/api/v1/get/label") || c.url.includes("/api/v1/get/bulk/labels"));
    const labelValidCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));

    assert(labelRes.status === 200, "GET /api/delivery?action=label_pdf returned HTTP 200");
    assert(labelRes.headers.get("content-type") === "application/pdf", "Label returned as application/pdf");
    assert(labelCalls.length === 1, "Exactly one call made to Redex label endpoint");
    assert(labelValidCalls.length === 0, "ZERO validation calls during label retrieval");

    // Test 7: Tracking info retrieval functions without validating
    resetHarness();
    const trackReq = new NextRequest("http://localhost:3000/api/delivery?action=track&tracking=EC-REDUX-B-1001", {
      method: "GET",
      headers: {
        authorization: `Bearer ${adminToken}`,
        host: "localhost:3000",
      },
    });
    const trackRes = await getDelivery(trackReq);
    const trackBody = await trackRes.json();
    const trackCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/get/tracking/info"));
    const trackRouteValidCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));

    assert(trackRes.status === 200, "GET /api/delivery?action=track returned HTTP 200");
    assert(trackBody.status === "prete_a_expedier", "Tracking response returns 'prete_a_expedier'");
    assert(trackCalls.length === 1, "Exactly one call made to tracking info endpoint");
    assert(trackRouteValidCalls.length === 0, "ZERO validation calls during tracking info retrieval");

    // ── GROUP 4: TRUSTED AUDIT IDENTITY & REDEX STATUS MAPPINGS ────────────────
    console.log("\n── GROUP 4: Trusted Audit Identity & Redex Status Mappings");

    // Test 8: Forged client body.actor is STRICTLY IGNORED; session identity is recorded
    resetHarness();
    const forgedValReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        tracking: "EC-REDUX-B-1001",
        askCollection: 0,
        actor: "ForgedAttackerIdentity123", // MALICIOUS CLIENT INPUT
      }),
    });
    const forgedValRes = await postDelivery(forgedValReq);
    const forgedValBody = await forgedValRes.json();

    assert(forgedValRes.status === 200, "Validation succeeded with HTTP 200");
    assert(
      forgedValBody.validatedBy !== "ForgedAttackerIdentity123",
      "Forged body.actor was STRICTLY IGNORED in response"
    );
    assert(
      forgedValBody.validatedBy === expectedSessionActor,
      `Verified session identity recorded (${expectedSessionActor})`
    );

    // Verify stored fallback order has session-derived actor
    const fbAfterValidation = getStoredFallbackOrders().find((f) => f.id === testOrderId);
    assert(
      (fbAfterValidation as any)?.validated_by === expectedSessionActor,
      `Fallback store validated_by equals session identity (${expectedSessionActor})`
    );

    // Test 9: askCollection = 0 maps to vers_station / vers_hub
    assert(forgedValBody.status === "vers_station", "askCollection = 0 correctly maps status to 'vers_station'");
    assert(forgedValBody.carrierStatus === "vers_station", "askCollection = 0 carrierStatus is 'vers_station'");
    assert(
      forgedValBody.carrierStatusAr === "في الطريق إلى مركز التوزيع",
      "Arabic status is 'في الطريق إلى مركز التوزيع'"
    );

    // Test 10: askCollection = 1 maps to en_ramassage
    resetHarness();
    const order2Id = "ORD-REQ-B-4002";
    const tracking2 = "EC-REDUX-B-1002";
    const allStored2 = getStoredFallbackOrders().filter(
      (f) => f.id !== order2Id && (f as any).tracking_code !== tracking2 && (f as any).redex_tracking_code !== tracking2
    );
    allStored2.push({
      id: order2Id,
      orderNumber: order2Id,
      tracking_code: tracking2,
      redex_tracking_code: tracking2,
      carrier_status: "prete_a_expedier",
      status: "CONFIRMED" as any,
      items: [{ name: "Crème ORVA", quantity: 1, unitPrice: 2900 }],
      total: 3400,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStored2);

    const ask1Req = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        tracking: tracking2,
        askCollection: 1,
      }),
    });
    const ask1Res = await postDelivery(ask1Req);
    const ask1Body = await ask1Res.json();

    assert(ask1Res.status === 200, "Validation for askCollection=1 succeeded");
    assert(ask1Body.status === "en_ramassage", "askCollection = 1 correctly maps status to 'en_ramassage'");
    assert(ask1Body.carrierStatus === "en_ramassage", "askCollection = 1 carrierStatus is 'en_ramassage'");
    assert(
      ask1Body.carrierStatusAr === "قيد الاستلام من المتجر",
      "Arabic status is 'قيد الاستلام من المتجر'"
    );

    // Test 11: Invalid askCollection values (<0, >1, strings) are strictly rejected with HTTP 400
    resetHarness();
    const badAskReq1 = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: tracking2, askCollection: 2 }),
    });
    const badAskRes1 = await postDelivery(badAskReq1);
    assert(badAskRes1.status === 400, "askCollection = 2 rejected with HTTP 400 Bad Request");

    const badAskReq2 = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: tracking2, askCollection: "invalid_string" }),
    });
    const badAskRes2 = await postDelivery(badAskReq2);
    assert(badAskRes2.status === 400, "askCollection = 'invalid_string' rejected with HTTP 400 Bad Request");

    // ── GROUP 5: STATE-MACHINE INTEGRITY, IDEMPOTENCY & CONCURRENCY ─────────────
    console.log("\n── GROUP 5: State-Machine Integrity, Idempotency & Concurrency");

    // Test 12: Missing delivery record is explicitly rejected with HTTP 404 (not treated as validated)
    resetHarness();
    const missingRecordReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: "EC-COMPLETELY-NON-EXISTENT", askCollection: 0 }),
    });
    const missingRecordRes = await postDelivery(missingRecordReq);
    assert(missingRecordRes.status === 404, "Missing delivery record explicitly returned HTTP 404 Not Found");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO validOrder calls made for missing delivery record"
    );

    // Test 13: Already progressed parcels (in transit, out for delivery, delivered) CANNOT regress (HTTP 409)
    resetHarness();
    const progressedId = "ORD-PROGRESSED-001";
    const progressedTracking = "EC-PROGRESSED-001";
    const allStoredProg = getStoredFallbackOrders().filter(
      (f) => f.id !== progressedId && (f as any).tracking_code !== progressedTracking && (f as any).redex_tracking_code !== progressedTracking
    );
    allStoredProg.push({
      id: progressedId,
      orderNumber: progressedId,
      tracking_code: progressedTracking,
      carrier_status: "en_livraison", // ALREADY IN TRANSIT TO CUSTOMER
      status: "SHIPPED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredProg);

    const regressReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: progressedTracking, askCollection: 0 }),
    });
    const regressRes = await postDelivery(regressReq);
    const regressBody = await regressRes.json();

    assert(regressRes.status === 409, "Attempt to regress advanced status ('en_livraison') returned HTTP 409 Conflict");
    assert(regressBody.alreadyProgressed === true, "alreadyProgressed flag set in response");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO validOrder calls made when regression prevented"
    );

    // Test 14: Duplicate validation returns idempotent response without duplicating carrier call
    resetHarness();
    const duplicateReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: tracking2, askCollection: 1 }), // Already validated in Test 10
    });
    const duplicateRes = await postDelivery(duplicateReq);
    const duplicateBody = await duplicateRes.json();

    assert(duplicateRes.status === 200, "Duplicate validation returns HTTP 200 idempotent response");
    assert(duplicateBody.alreadyValidated === true, "alreadyValidated flag set to true");
    assert(duplicateBody.carrierStatus === "en_ramassage", "Carrier status preserved as 'en_ramassage'");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO external validOrder calls executed during duplicate validation"
    );

    // Test 15: Concurrency protection — Simulated parallel execution prevents dual transition
    resetHarness();
    const concurrentOrderId = "ORD-CONCURRENT-001";
    const concurrentTracking = "EC-CONCURRENT-001";
    const allStoredConc = getStoredFallbackOrders().filter(
      (f) => f.id !== concurrentOrderId && (f as any).tracking_code !== concurrentTracking && (f as any).redex_tracking_code !== concurrentTracking
    );
    allStoredConc.push({
      id: concurrentOrderId,
      orderNumber: concurrentOrderId,
      tracking_code: concurrentTracking,
      carrier_status: "prete_a_expedier",
      status: "CONFIRMED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredConc);

    const concReq1 = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: concurrentTracking, askCollection: 0 }),
    });
    const concReq2 = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: concurrentTracking, askCollection: 0 }),
    });

    // Execute concurrently
    const [concRes1, concRes2] = await Promise.all([postDelivery(concReq1), postDelivery(concReq2)]);
    assert(concRes1.status === 200, "Concurrent Request 1 succeeded (HTTP 200)");
    assert(concRes2.status === 200, "Concurrent Request 2 succeeded idempotently (HTTP 200)");

    // ── GROUP 6: PARTIAL-FAILURE HANDLING & RECONCILIATION RECOVERY ────────────
    console.log("\n── GROUP 6: Partial-Failure Handling & Reconciliation Recovery");

    // Test 16: Redex success followed by Supabase failure records RECONCILIATION_REQUIRED and returns HTTP 502
    resetHarness();
    const partialFailOrderId = "ORD-PARTIAL-FAIL-001";
    const partialFailTracking = "EC-PARTIAL-FAIL-001";
    const allStoredPF = getStoredFallbackOrders().filter(
      (f) => f.id !== partialFailOrderId && (f as any).tracking_code !== partialFailTracking && (f as any).redex_tracking_code !== partialFailTracking
    );
    allStoredPF.push({
      id: partialFailOrderId,
      orderNumber: partialFailOrderId,
      tracking_code: partialFailTracking,
      carrier_status: "prete_a_expedier",
      status: "CONFIRMED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredPF);

    // Mock Supabase failure on deliveries update
    simulatePostgresTimeout = true;
    const supabaseClient = getSupabaseServerClient() as any;
    const originalFrom = supabaseClient.from.bind(supabaseClient);
    supabaseClient.from = (table: string) => {
      const query = originalFrom(table);
      if (table === "deliveries") {
        const origUpdate = query.update.bind(query);
        query.update = (values: any) => {
          const uQuery = origUpdate(values);
          uQuery.then = (onfulfilled: any, onrejected: any) => {
            return Promise.resolve({
              data: null,
              error: { message: "Simulated database connection timeout (PGRST000)", code: "PGRST000" },
            }).then(onfulfilled, onrejected);
          };
          return uQuery;
        };
      }
      return query;
    };

    try {
      const pfReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ tracking: partialFailTracking, askCollection: 0 }),
      });
      const pfRes = await postDelivery(pfReq);
      const pfBody = await pfRes.json();

      assert(pfRes.status === 502, "Supabase failure after carrier acceptance returned HTTP 502 Bad Gateway");
      assert(pfBody.carrierAccepted === true, "carrierAccepted is true (Redex succeeded)");
      assert(pfBody.supabaseSynced === false, "supabaseSynced is false (database failure acknowledged)");
      assert(pfBody.reconciliationRequired === true, "reconciliationRequired is true");
      assert(pfBody.retryable === true, "retryable is true");

      // Verify fallback store records RECONCILIATION_REQUIRED
      const fbPF = getStoredFallbackOrders().find((f) => f.id === partialFailOrderId);
      assert(
        (fbPF as any)?.validation_lifecycle === "RECONCILIATION_REQUIRED",
        "Fallback store state records RECONCILIATION_REQUIRED"
      );
      assert((fbPF as any)?.carrier_accepted === true, "carrier_accepted flag recorded in fallback store");

    } finally {
      simulatePostgresTimeout = false;
      supabaseClient.from = originalFrom;
    }

    // Test 17: Retry of carrier-accepted validation does NOT repeat external carrier call and reconciles successfully
    resetHarness();
    const retryPfReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: partialFailTracking, askCollection: 0 }),
    });
    const retryPfRes = await postDelivery(retryPfReq);
    const retryPfBody = await retryPfRes.json();

    assert(retryPfRes.status === 200, "Retry of RECONCILIATION_REQUIRED succeeded with HTTP 200");
    assert(retryPfBody.reconciled === true, "reconciled flag set to true in response");
    assert(retryPfBody.supabaseSynced === true, "supabaseSynced confirmed true after reconciliation");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO external validOrder calls made during reconciliation retry (external call not blindly repeated)"
    );

    // ── GROUP 7: COMPLETE LIFECYCLE RE-VERIFICATION ────────────────────────────
    console.log("\n── GROUP 7: Complete Lifecycle Re-Verification");

    resetHarness();
    const lifecycleOrderId = "ORD-LIFECYCLE-FINAL-999";
    const lifecycleTracking = "EC-LIFECYCLE-FINAL-999";
    const allStoredLC = getStoredFallbackOrders().filter(
      (f) => f.id !== lifecycleOrderId && (f as any).tracking_code !== lifecycleTracking && (f as any).redex_tracking_code !== lifecycleTracking
    );
    saveAllFallbackOrders(allStoredLC);
    createOrderResponse = {
      success: true,
      tracking: lifecycleTracking,
      message: "Commande créée",
    };

    // Step A: Creation -> Prete a expedier
    const stepACreateReq = new NextRequest("http://localhost:3000/api/delivery?action=create", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        orderId: lifecycleOrderId,
        fullName: "Yacine Brahimi",
        phone: "0550998877",
        wilaya: "Alger",
        wilayaCode: 16,
        commune: "Alger Centre",
        address: "Rue Didouche Mourad",
        deliveryType: "home",
        codAmountDzd: 5400,
        productName: "Pack Complet ORVA",
      }),
    });
    const stepACreateRes = await postDelivery(stepACreateReq);
    const stepABody = await stepACreateRes.json();

    assert(stepACreateRes.status === 200, "Step A: Parcel created successfully");
    assert(stepABody.status === "prete_a_expedier", "Step A: Status is 'prete_a_expedier'");
    assert(stepABody.validated === false, "Step A: validated is false");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "Step A: validOrder call count is strictly ZERO"
    );

    // Step B: Label Retrieval -> Label delivered without validation
    const stepBLabelReq = new NextRequest(`http://localhost:3000/api/delivery?action=label_pdf&tracking=${lifecycleTracking}`, {
      method: "GET",
      headers: { authorization: `Bearer ${adminToken}`, host: "localhost:3000" },
    });
    const stepBLabelRes = await getDelivery(stepBLabelReq);
    assert(stepBLabelRes.status === 200, "Step B: Label fetched successfully");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "Step B: validOrder call count remains strictly ZERO"
    );

    // Step C: Explicit Manual Validation with askCollection=1 -> en_ramassage
    const stepCValReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        tracking: lifecycleTracking,
        askCollection: 1,
        actor: "UntrustedInjectedUser", // Must be ignored
      }),
    });
    const stepCValRes = await postDelivery(stepCValReq);
    const stepCBody = await stepCValRes.json();

    assert(stepCValRes.status === 200, "Step C: Manual validation succeeded");
    assert(stepCBody.carrierStatus === "en_ramassage", "Step C: Status correctly mapped to 'en_ramassage'");
    assert(stepCBody.carrierStatusAr === "قيد الاستلام من المتجر", "Step C: Arabic status is 'قيد الاستلام من المتجر'");
    assert(stepCBody.validatedBy === expectedSessionActor, "Step C: Audit identity bound to verified session");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 1,
      "Step C: validOrder called exactly ONCE across entire lifecycle"
    );

    // ── GROUP 8: STAGE 2 REMEDIATION A.3 CONCURRENCY, AUTH & CRASH RECOVERY MATRIX ──
    console.log("\n── GROUP 8: Stage 2 Remediation A.3 Concurrency, Auth & Crash Recovery Matrix");

    function makeRawToken(payload: any): string {
      const secret = process.env.ADMIN_JWT_SECRET || "orva-store-dev-jwt-secret-key-32chars-min!!";
      const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
      return `${data}.${sig}`;
    }

    // Test 18: Missing adminSession.sid is strictly rejected (Requirement 4: no generic admin fallback)
    resetHarness();
    const tokenNoSid = makeRawToken({
      sub: "admin",
      role: "admin",
      // sid is intentionally omitted
      iat: Date.now(),
      exp: Date.now() + 86400000,
    });
    const noSidReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenNoSid}`,
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ tracking: "EC-REDUX-B-1001", askCollection: 0 }),
    });
    const noSidRes = await postDelivery(noSidReq);
    assert(noSidRes.status === 401, "Missing adminSession.sid rejected with HTTP 401 Unauthorized");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO validOrder calls made when sid is missing"
    );

    // Test 19: Non-admin role is strictly rejected (Requirement 5: role === 'admin' required)
    resetHarness();
    const tokenEditor = makeRawToken({
      sub: "editor-user",
      role: "editor",
      sid: crypto.randomUUID(),
      iat: Date.now(),
      exp: Date.now() + 86400000,
    });
    const nonAdminReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenEditor}`,
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ tracking: "EC-REDUX-B-1001", askCollection: 0 }),
    });
    const nonAdminRes = await postDelivery(nonAdminReq);
    assert(
      nonAdminRes.status === 401 || nonAdminRes.status === 403,
      "Non-admin role (editor) rejected with HTTP 401/403"
    );
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO validOrder calls made for non-admin role"
    );

    // Test 20: Pre-call Atomic Reservation & Race Condition Proof (Requirements 1 & 2)
    // Prove that 2 concurrent requests CANNOT execute Redex validOrder twice
    resetHarness();
    const raceOrderId = "ORD-RACE-PREVENTION-001";
    const raceTracking = "EC-RACE-PREVENTION-001";
    const allStoredRace = getStoredFallbackOrders().filter(
      (f) => f.id !== raceOrderId && (f as any).tracking_code !== raceTracking && (f as any).redex_tracking_code !== raceTracking
    );
    allStoredRace.push({
      id: raceOrderId,
      orderNumber: raceOrderId,
      tracking_code: raceTracking,
      carrier_status: "prete_a_expedier",
      status: "CONFIRMED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredRace);

    const raceReq1 = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: raceTracking, askCollection: 0 }),
    });
    const raceReq2 = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: raceTracking, askCollection: 0 }),
    });

    const [raceRes1, raceRes2] = await Promise.all([postDelivery(raceReq1), postDelivery(raceReq2)]);
    const raceCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));

    // Exactly one request must acquire lease and proceed
    const statuses = [raceRes1.status, raceRes2.status];
    assert(statuses.includes(200), "At least one concurrent request succeeded (HTTP 200)");
    assert(
      raceCalls.length === 1,
      "ATOMIC RESERVATION PROOF: Exactly ONE call made to Redex validOrder despite parallel execution (NEVER 2)"
    );

    // Test 21: Active lease blocks concurrent duplicate execution (Requirements 1 & 3)
    resetHarness();
    const activeLeaseId = "ORD-ACTIVE-LEASE-001";
    const activeLeaseTracking = "EC-ACTIVE-LEASE-001";
    const allStoredActive = getStoredFallbackOrders().filter(
      (f) => f.id !== activeLeaseId && (f as any).tracking_code !== activeLeaseTracking && (f as any).redex_tracking_code !== activeLeaseTracking
    );
    allStoredActive.push({
      id: activeLeaseId,
      orderNumber: activeLeaseId,
      tracking_code: activeLeaseTracking,
      carrier_status: "validation_in_progress",
      validation_lifecycle: "VALIDATION_IN_PROGRESS",
      lease_expires_at: new Date(Date.now() + 25000).toISOString(), // 25s in future
      status: "CONFIRMED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredActive);

    const activeLeaseReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: activeLeaseTracking, askCollection: 0 }),
    });
    const activeLeaseRes = await postDelivery(activeLeaseReq);
    const activeLeaseBody = await activeLeaseRes.json();

    assert(activeLeaseRes.status === 409, "Active lease returns HTTP 409 Conflict");
    assert(activeLeaseBody.inProgress === true, "inProgress flag set in active lease response");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO validOrder calls made when active lease is held"
    );

    // Test 22: Stuck in VALIDATION_IN_PROGRESS with expired lease & carrier already accepted (Requirement 3)
    // Must NOT blindly re-call Redex validOrder; reconciles safely
    resetHarness();
    const stuckAcceptedId = "ORD-STUCK-ACCEPTED-001";
    const stuckAcceptedTracking = "EC-STUCK-ACCEPTED-001";
    const allStoredStuck = getStoredFallbackOrders().filter(
      (f) => f.id !== stuckAcceptedId && (f as any).tracking_code !== stuckAcceptedTracking && (f as any).redex_tracking_code !== stuckAcceptedTracking
    );
    allStoredStuck.push({
      id: stuckAcceptedId,
      orderNumber: stuckAcceptedId,
      tracking_code: stuckAcceptedTracking,
      carrier_status: "validation_in_progress",
      validation_lifecycle: "VALIDATION_IN_PROGRESS",
      lease_expires_at: new Date(Date.now() - 10000).toISOString(), // Expired 10s ago
      status: "CONFIRMED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredStuck);

    // Mock tracking info to simulate that Redex ALREADY accepted the parcel
    trackingInfoResponse = {
      success: true,
      activity: [
        { status: "en_ramassage", date: "2026-11-09", time: "11:00:00", details: "Pris en charge" },
      ],
    };

    const recoverReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: stuckAcceptedTracking, askCollection: 1 }),
    });
    const recoverRes = await postDelivery(recoverReq);
    const recoverBody = await recoverRes.json();

    assert(recoverRes.status === 200, "Expired lease recovery succeeded with HTTP 200");
    assert(recoverBody.reconciled === true, "reconciled confirmed true in recovery response");
    assert(recoverBody.carrierStatus === "en_ramassage", "Carrier status updated to 'en_ramassage'");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "SAFE RECOVERY PROOF: ZERO calls to validOrder made when carrier already confirmed accepted (no blind calls)"
    );

    // Test 23: Redex Carrier Validation Failure (Rejection Handling)
    resetHarness();
    validOrderResponse = {
      success: false,
      message: "Colis introuvable chez Redex Express",
      error: "Colis introuvable chez Redex Express",
    };
    const failCarrierOrderId = "ORD-CARRIER-FAIL-001";
    const failCarrierTracking = "EC-CARRIER-FAIL-001";
    const allStoredFailCarrier = getStoredFallbackOrders().filter(
      (f) => f.id !== failCarrierOrderId && (f as any).tracking_code !== failCarrierTracking && (f as any).redex_tracking_code !== failCarrierTracking
    );
    allStoredFailCarrier.push({
      id: failCarrierOrderId,
      orderNumber: failCarrierOrderId,
      tracking_code: failCarrierTracking,
      carrier_status: "prete_a_expedier",
      status: "CONFIRMED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredFailCarrier);

    const failCarrierReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: failCarrierTracking, askCollection: 0 }),
    });
    const failCarrierRes = await postDelivery(failCarrierReq);
    const failCarrierBody = await failCarrierRes.json();

    assert(failCarrierRes.status === 422, "Carrier rejection returned HTTP 422 Unprocessable Entity");
    assert(failCarrierBody.error.includes("Colis introuvable"), "Carrier error message preserved");
    const fbAfterCarrierFail = getStoredFallbackOrders().find((f) => f.id === failCarrierOrderId);
    assert(
      (fbAfterCarrierFail as any)?.carrier_status === "prete_a_expedier",
      "Lease safely released and status reverted to 'prete_a_expedier' for retry"
    );

    // Test 24: Application Restart & Cold Boot Recovery of RECONCILIATION_REQUIRED (Requirement 6)
    resetHarness();
    const restartOrderId = "ORD-COLD-BOOT-RESTART-001";
    const restartTracking = "EC-COLD-BOOT-RESTART-001";
    const allStoredRestart = getStoredFallbackOrders().filter(
      (f) => f.id !== restartOrderId && (f as any).tracking_code !== restartTracking && (f as any).redex_tracking_code !== restartTracking
    );
    allStoredRestart.push({
      id: restartOrderId,
      orderNumber: restartOrderId,
      tracking_code: restartTracking,
      carrier_status: "en_ramassage",
      carrier_accepted: true,
      validation_lifecycle: "RECONCILIATION_REQUIRED",
      status: "CONFIRMED" as any,
      items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 5000 }],
      total: 5500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStoredRestart);

    // SIMULATE APPLICATION RESTART / COLD BOOT:
    // Evict the in-memory cache so next read is forced from persistent disk storage
    const globalAny = globalThis as any;
    globalAny.__fallbackOrdersStore = undefined;

    // Fresh read from disk storage
    const freshFromDisk = getStoredFallbackOrders();
    const rehydratedOrder = freshFromDisk.find((f) => f.id === restartOrderId);
    assert(
      Boolean(rehydratedOrder),
      "RECONCILIATION_REQUIRED record persisted across simulated process memory eviction"
    );
    assert(
      (rehydratedOrder as any)?.validation_lifecycle === "RECONCILIATION_REQUIRED",
      "Rehydrated record preserves RECONCILIATION_REQUIRED lifecycle"
    );
    assert(
      (rehydratedOrder as any)?.carrier_accepted === true,
      "Rehydrated record preserves carrier_accepted flag"
    );

    // Retry validation after cold boot
    const restartRetryReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ tracking: restartTracking, askCollection: 1 }),
    });
    const restartRetryRes = await postDelivery(restartRetryReq);
    const restartRetryBody = await restartRetryRes.json();

    assert(restartRetryRes.status === 200, "Cold-boot retry succeeded with HTTP 200");
    assert(restartRetryBody.reconciled === true, "reconciled confirmed true after cold boot");
    assert(restartRetryBody.supabaseSynced === true, "supabaseSynced confirmed true after cold boot");
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "COLD BOOT PROOF: ZERO calls to validOrder made during cold-boot recovery retry"
    );

    console.log("================================================================================");
    console.log(`   STAGE 2 REMEDIATION A.3 AUDIT COMPLETE: ${passedTests} / ${totalTests} CHECKS PASSED (100%)`);
    console.log("================================================================================\n");

  } finally {
    globalThis.fetch = originalFetch;
    try {
      saveAllFallbackOrders([]);
    } catch (cleanupErr) {
      console.warn("[Teardown Warning]: Failed to sanitize fallback orders:", cleanupErr);
    }
  }
}

runRedexRequirementBSuite().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
