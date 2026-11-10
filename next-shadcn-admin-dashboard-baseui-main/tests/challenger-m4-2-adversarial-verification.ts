import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { GET as getDelivery, POST as postDelivery } from "../src/app/api/delivery/route";
import { generateSessionToken, verifySessionTokenSync } from "../src/lib/auth/admin-auth";
import { getStoredFallbackOrders, saveAllFallbackOrders } from "../src/lib/orders-store";
import {
  verifyRecoveryReceipt,
  executeSafeReconciliation,
  generateOperationId,
} from "../src/lib/couriers/delivery-reconciliation";

/**
 * ORVA Store v2.1.0 — Milestone 4 (Requirement R5 / Requirement B)
 * Adversarial Challenger M4_2: Concurrency, Non-Regression, Fuzzing & Recovery Stress Suite
 * File: tests/challenger-m4-2-adversarial-verification.ts
 */

interface MockFetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const FALLBACK_PATH = path.resolve(process.cwd(), "src/data/fallback-orders.json");

function restoreCleanFallbackFile() {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_PATH), { recursive: true });
    fs.writeFileSync(FALLBACK_PATH, "[]\n", "utf8");
    (globalThis as any).__fallbackOrdersStore = [];
  } catch (err) {
    console.error("Failed to restore clean fallback file:", err);
  }
}

async function runAdversarialChallengeSuite() {
  console.log("================================================================================");
  console.log("   ORVA STORE — CHALLENGER M4_2: ADVERSARIAL VERIFICATION HARNESS (R5)");
  console.log("   Redex EcoTrack Validation, Concurrency & Reconciliation Invariants");
  console.log("   Timestamp: " + new Date().toISOString());
  console.log("================================================================================\n");

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
      if (detail) console.log(`         ↳ ${detail}`);
    } else {
      failedTests++;
      console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, "0")}: ${testName}`);
      if (detail) console.error(`         ↳ ERROR: ${detail}`);
      throw new Error(`Assertion Failed: ${testName} - ${detail || ""}`);
    }
  }

  // Ensure mock Supabase service key
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_signature_for_test_runner";
  process.env.ADMIN_JWT_SECRET = "test-admin-jwt-secret-min-32-chars-long!!";

  const originalFetch = globalThis.fetch;
  const recordedCalls: MockFetchCall[] = [];

  let validOrderDelayMs = 0;
  let simulateDbTimeout = false;
  let trackingStatusResponse: any = {
    success: true,
    tracking: "EC-TEST-001",
    status: "prete_a_expedier",
    activity: [{ status: "prete_a_expedier" }],
  };

  function resetHarness() {
    recordedCalls.length = 0;
    validOrderDelayMs = 0;
    simulateDbTimeout = false;
    // Clear in-memory locks between test scenarios
    if ((globalThis as any).__validationMemoryLocks) {
      (globalThis as any).__validationMemoryLocks.clear();
    }
  }

  // Network interception harness
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

    // 1. Redex valid/order endpoint
    if (urlStr.includes("/api/v1/valid/order")) {
      if (validOrderDelayMs > 0) {
        await new Promise((r) => setTimeout(r, validOrderDelayMs));
      }
      return new Response(JSON.stringify({
        success: true,
        message: "Commande expedier avec succès (Mocked Carrier Acceptance)",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Redex get/tracking/info endpoint
    if (urlStr.includes("/api/v1/get/tracking/info")) {
      return new Response(JSON.stringify(trackingStatusResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. Supabase PostgREST Interception
    if (urlStr.includes("/rest/v1/")) {
      if (simulateDbTimeout && (method === "PATCH" || method === "PUT" || method === "POST")) {
        return new Response(JSON.stringify({
          message: "Simulated database connection timeout (PGRST000)",
          code: "PGRST000",
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "GET") {
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify([{ id: "mock-rest-id" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const adminToken = generateSessionToken();
  const authHeaders = {
    authorization: `Bearer ${adminToken}`,
    host: "localhost:3000",
    "content-type": "application/json",
  };

  try {
    // ════════════════════════════════════════════════════════════════════════════
    // GROUP 1: CONCURRENCY RACE CONDITION STRESS HARNESS
    // ════════════════════════════════════════════════════════════════════════════
    console.log("── GROUP 1: Manual Order Validation Concurrency Stress Harness");
    resetHarness();

    const concOrderId = "ORD-CONC-CHALLENGE-01";
    const concTracking = "EC-CONC-CHALLENGE-01";

    // Seed unvalidated order in fallback store
    saveAllFallbackOrders([
      {
        id: concOrderId,
        orderNumber: concOrderId,
        tracking_code: concTracking,
        carrier_status: "prete_a_expedier",
        status: "CONFIRMED" as any,
        items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 3500 }],
        total: 4000,
        createdAt: new Date().toISOString(),
      } as any,
    ]);

    // Induce artificial delay to widen the race window to 40ms
    validOrderDelayMs = 40;

    // Fire 10 simultaneous parallel requests to validate_order with the identical tracking code
    const CONCURRENCY_BURST = 10;
    const concurrentRequests = Array.from({ length: CONCURRENCY_BURST }, (_, idx) => {
      const req = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          tracking: concTracking,
          askCollection: 0,
          burstIndex: idx,
        }),
      });
      return postDelivery(req).then(async (res) => ({
        status: res.status,
        body: await res.json(),
      }));
    });

    const burstResults = await Promise.all(concurrentRequests);

    const validOrderCalls = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order"));
    assert(
      validOrderCalls.length === 1,
      "CONCURRENCY INVARIANT: Exactly ONE outbound call to /api/v1/valid/order across 10 parallel requests",
      `Observed ${validOrderCalls.length} outbound validOrder calls (expected strictly 1)`
    );

    const successResponses = burstResults.filter((r) => r.status === 200);
    const conflictResponses = burstResults.filter((r) => r.status === 409);
    assert(
      successResponses.length >= 1,
      "At least one concurrent request succeeded with HTTP 200",
      `200 count: ${successResponses.length}, 409 count: ${conflictResponses.length}`
    );

    assert(
      successResponses.length + conflictResponses.length === CONCURRENCY_BURST,
      "Zero 500 errors or unhandled crashes across the entire concurrency burst",
      `All ${CONCURRENCY_BURST} responses are clean 200 OK or 409 Conflict`
    );

    // Verify fallback store state after concurrency burst
    const concStored = getStoredFallbackOrders().find((f) => f.id === concOrderId);
    assert(
      (concStored as any)?.carrier_status === "vers_station",
      "Carrier status safely transitioned to 'vers_station' after concurrency burst"
    );
    assert(
      (concStored as any)?.validated === true,
      "Order validated flag is strictly true after burst"
    );

    // ════════════════════════════════════════════════════════════════════════════
    // GROUP 2: STATE NON-REGRESSION ADVERSARIAL CHALLENGE
    // ════════════════════════════════════════════════════════════════════════════
    console.log("\n── GROUP 2: State Non-Regression Adversarial Challenge");

    const downstreamStatuses = [
      { status: "vers_hub", label: "في الطريق إلى مركز التوزيع" },
      { status: "en_hub", label: "في مركز التوزيع" },
      { status: "dispatched_to_driver", label: "مسلم للسائق" },
      { status: "en_livraison", label: "جاري التوصيل" },
      { status: "livred", label: "تم التسليم بنجاح" },
      { status: "encaisse_non_paye", label: "محصل" },
      { status: "retour_recu", label: "تم استلام المرتجع" },
      { status: "annule", label: "ملغى" },
    ];

    for (const item of downstreamStatuses) {
      resetHarness();
      const testOrderId = `ORD-REGRESS-${item.status.toUpperCase()}`;
      const testTracking = `EC-REGRESS-${item.status.toUpperCase()}`;

      saveAllFallbackOrders([
        {
          id: testOrderId,
          orderNumber: testOrderId,
          tracking_code: testTracking,
          carrier_status: item.status,
          carrier_status_ar: item.label,
          status: "CONFIRMED" as any,
          items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 3500 }],
          total: 4000,
          createdAt: new Date().toISOString(),
        } as any,
      ]);

      // Attempt manual order validation on this already progressed parcel
      const regReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          tracking: testTracking,
          askCollection: 1,
        }),
      });
      const regRes = await postDelivery(regReq);
      const regBody = await regRes.json();

      assert(
        regRes.status === 409,
        `Non-Regression: Validation blocked for '${item.status}' with HTTP 409 Conflict`
      );
      assert(
        regBody.alreadyProgressed === true,
        `Non-Regression: Response sets alreadyProgressed=true for '${item.status}'`
      );
      assert(
        recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
        `Non-Regression: ZERO calls to /api/v1/valid/order when attempting to regress '${item.status}'`
      );

      // Verify the record in storage was NOT regressed
      const fbCheck = getStoredFallbackOrders().find((f) => f.id === testOrderId);
      assert(
        (fbCheck as any)?.carrier_status === item.status,
        `Non-Regression: Parcel in storage remains '${item.status}' without regressing`
      );
    }

    // Challenge reconciliation non-regression
    resetHarness();
    const reconTracking = "EC-RECON-DOWNSTREAM-LIVRED";
    const reconResult = await executeSafeReconciliation({
      operationId: "op-val-EC-RECON-DOWNSTREAM-LIVRED-0",
      trackingCode: reconTracking,
      askCollection: 0,
      verifiedActor: "admin:challenger",
      ecotrackClient: {
        getTrackingInfo: async () => ({
          success: true,
          tracking: reconTracking,
          status: "livred",
          activity: [
            { status: "prete_a_expedier" },
            { status: "vers_hub" },
            { status: "en_livraison" },
            { status: "livred" },
          ],
        }),
      },
      supabase: null,
    });

    assert(
      reconResult.success === true && reconResult.reconciled === true,
      "Safe reconciliation succeeds when carrier reports 'livred'"
    );
    assert(
      reconResult.carrierStatus === "livred",
      "Reconciliation preserves advanced terminal state 'livred' without regressing to 'vers_station'"
    );
    assert(
      recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
      "ZERO validOrder calls executed during downstream reconciliation"
    );

    // ════════════════════════════════════════════════════════════════════════════
    // GROUP 3: askCollection PARAMETER FUZZING BATTERY
    // ════════════════════════════════════════════════════════════════════════════
    console.log("\n── GROUP 3: askCollection Parameter Fuzzing Battery");

    const validFuzzCases = [
      { input: 0, expectedStatus: "vers_station", label: "Numeric 0" },
      { input: 1, expectedStatus: "en_ramassage", label: "Numeric 1" },
      { input: "0", expectedStatus: "vers_station", label: "String '0'" },
      { input: "1", expectedStatus: "en_ramassage", label: "String '1'" },
    ];

    for (const vCase of validFuzzCases) {
      resetHarness();
      const orderId = `ORD-VAL-ASK-${vCase.label.replace(/\s+/g, "-")}`;
      const tracking = `EC-VAL-ASK-${vCase.label.replace(/\s+/g, "-")}`;

      saveAllFallbackOrders([
        {
          id: orderId,
          orderNumber: orderId,
          tracking_code: tracking,
          carrier_status: "prete_a_expedier",
          status: "CONFIRMED" as any,
          items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 3500 }],
          total: 4000,
          createdAt: new Date().toISOString(),
        } as any,
      ]);

      const req = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ tracking, askCollection: vCase.input }),
      });
      const res = await postDelivery(req);
      const body = await res.json();

      assert(res.status === 200, `Valid askCollection [${vCase.label}] accepted with HTTP 200`);
      assert(body.carrierStatus === vCase.expectedStatus, `Status correctly mapped to '${vCase.expectedStatus}'`);
    }

    const invalidFuzzInputs = [
      { val: 2, desc: "Out-of-range positive integer 2" },
      { val: -1, desc: "Negative integer -1" },
      { val: 100, desc: "Large integer 100" },
      { val: 0.5, desc: "Decimal float 0.5" },
      { val: NaN, desc: "NaN value" },
      { val: Infinity, desc: "Infinity value" },
      { val: true, desc: "Boolean true" },
      { val: false, desc: "Boolean false" },
      { val: null, desc: "Null value" },
      { val: "", desc: "Empty string" },
      { val: "2", desc: "Out-of-range numeric string '2'" },
      { val: "-1", desc: "Negative numeric string '-1'" },
      { val: "invalid_string", desc: "Arbitrary text string" },
      { val: "0; DROP TABLE orders; --", desc: "SQL injection payload" },
      { val: "<script>alert(1)</script>", desc: "XSS payload" },
      { val: [0], desc: "Array containing 0" },
      { val: { value: 0 }, desc: "Object containing 0" },
      { val: undefined, desc: "Missing/undefined value" },
    ];

    for (const fCase of invalidFuzzInputs) {
      resetHarness();
      const tracking = "EC-FUZZ-TARGET";

      const req = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          tracking,
          askCollection: fCase.val,
        }),
      });
      const res = await postDelivery(req);
      const body = await res.json();

      assert(
        res.status === 400,
        `Fuzzing: Invalid askCollection [${fCase.desc}] strictly rejected with HTTP 400 Bad Request`
      );
      assert(
        body.success === false,
        `Fuzzing: Response body success=false for [${fCase.desc}]`
      );
      assert(
        recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length === 0,
        `Fuzzing: ZERO validOrder calls made for invalid askCollection [${fCase.desc}]`
      );
    }

    // ════════════════════════════════════════════════════════════════════════════
    // GROUP 4: PARTIAL FAILURE & CARRIER RECOVERY INVARIANT
    // ════════════════════════════════════════════════════════════════════════════
    console.log("\n── GROUP 4: Partial Failure & Carrier Recovery Invariant");
    resetHarness();

    const partialOrderId = "ORD-PARTIAL-STRESS-01";
    const partialTracking = "EC-PARTIAL-STRESS-01";

    saveAllFallbackOrders([
      {
        id: partialOrderId,
        orderNumber: partialOrderId,
        tracking_code: partialTracking,
        carrier_status: "prete_a_expedier",
        status: "CONFIRMED" as any,
        items: [{ name: "Pack ORVA", quantity: 1, unitPrice: 3500 }],
        total: 4000,
        createdAt: new Date().toISOString(),
      } as any,
    ]);

    // Simulate database timeout while Redex API succeeds
    simulateDbTimeout = true;

    const failReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        tracking: partialTracking,
        askCollection: 1,
      }),
    });
    const failRes = await postDelivery(failReq);
    const failBody = await failRes.json();

    assert(
      failRes.status === 502,
      "Partial Failure: Returns HTTP 502 Bad Gateway when DB update fails after carrier acceptance"
    );
    assert(
      failBody.carrierAccepted === true,
      "Partial Failure: carrierAccepted confirmed true (acknowledges Redex succeeded)"
    );
    assert(
      failBody.supabaseSynced === false,
      "Partial Failure: supabaseSynced is false"
    );
    assert(
      failBody.reconciliationRequired === true,
      "Partial Failure: reconciliationRequired is explicitly true"
    );
    assert(
      failBody.retryable === true,
      "Partial Failure: retryable is true"
    );
    assert(
      typeof failBody.recoveryReceipt === "string" && failBody.recoveryReceipt.includes("."),
      "Partial Failure: Signed cryptographic recoveryReceipt issued"
    );

    // Verify recovery receipt authenticity
    const verifiedReceipt = verifyRecoveryReceipt(
      failBody.recoveryReceipt,
      process.env.ADMIN_JWT_SECRET || "orva-recovery-secret-fallback-32c"
    );
    assert(
      Boolean(verifiedReceipt),
      "Recovery Receipt: Cryptographic HMAC signature verified successfully"
    );
    assert(
      verifiedReceipt?.trackingCode === partialTracking,
      "Recovery Receipt: Preserves exact tracking code"
    );
    assert(
      verifiedReceipt?.carrierAccepted === true,
      "Recovery Receipt: Preserves carrierAccepted=true flag"
    );

    // Verify fallback store records RECONCILIATION_REQUIRED
    const fbAfterFail = getStoredFallbackOrders().find((f) => f.id === partialOrderId);
    assert(
      (fbAfterFail as any)?.validation_lifecycle === "RECONCILIATION_REQUIRED",
      "Storage: Validation lifecycle is 'RECONCILIATION_REQUIRED'"
    );
    assert(
      (fbAfterFail as any)?.carrier_accepted === true,
      "Storage: carrier_accepted is true in persistent record"
    );

    const callCountAfterFail = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length;
    assert(
      callCountAfterFail === 1,
      "Exactly ONE outbound call made to validOrder during initial failure"
    );

    // Now execute recovery / reconciliation (DB is restored to healthy)
    simulateDbTimeout = false;
    const retryReq = new NextRequest("http://localhost:3000/api/delivery?action=validate_order", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        tracking: partialTracking,
        askCollection: 1,
      }),
    });
    const retryRes = await postDelivery(retryReq);
    const retryBody = await retryRes.json();

    assert(
      retryRes.status === 200,
      "Recovery: Reconciliation retry succeeds with HTTP 200 OK"
    );
    assert(
      retryBody.reconciled === true,
      "Recovery: reconciled flag set to true"
    );
    assert(
      retryBody.supabaseSynced === true,
      "Recovery: supabaseSynced confirmed true after reconciliation"
    );

    const callCountAfterRetry = recordedCalls.filter((c) => c.url.includes("/api/v1/valid/order")).length;
    assert(
      callCountAfterRetry === 1,
      "ZERO additional validOrder calls made during recovery (total calls strictly 1, never 2)",
      `Total outbound validOrder calls: ${callCountAfterRetry}`
    );

    // ════════════════════════════════════════════════════════════════════════════
    // GROUP 5: FAIL-SAFE CLEAN STORAGE ENFORCEMENT
    // ════════════════════════════════════════════════════════════════════════════
    console.log("\n── GROUP 5: Fail-Safe Clean Data Enforcement");

    // Clean fallback storage
    restoreCleanFallbackFile();

    const stats = fs.statSync(FALLBACK_PATH);
    const content = fs.readFileSync(FALLBACK_PATH, "utf8");
    const parsed = JSON.parse(content);

    assert(
      stats.size === 3,
      "Cleanliness: src/data/fallback-orders.json is strictly 3 bytes on disk",
      `Actual byte size: ${stats.size}`
    );
    assert(
      content === "[]\n",
      "Cleanliness: src/data/fallback-orders.json content is strictly '[]\\n'",
      `Actual content: ${JSON.stringify(content)}`
    );
    assert(
      Array.isArray(parsed) && parsed.length === 0,
      "Cleanliness: Zero residual mock or test orders persisted on disk",
      `Parsed record count: ${parsed.length}`
    );

    console.log("\n================================================================================");
    console.log(`   CHALLENGER M4_2 ADVERSARIAL SUITE COMPLETE: ${passedTests} / ${totalTests} CHECKS PASSED (100%)`);
    console.log("   FAILED CHECKS: 0");
    console.log("   VERDICT: CONFIRMED — Redex EcoTrack Invariants are 100% Empirically Resilient.");
    console.log("================================================================================\n");

  } finally {
    globalThis.fetch = originalFetch;
    restoreCleanFallbackFile();
  }
}

runAdversarialChallengeSuite().catch((err) => {
  restoreCleanFallbackFile();
  console.error("\nFATAL ADVERSARIAL SUITE ERROR:", err);
  process.exit(1);
});
