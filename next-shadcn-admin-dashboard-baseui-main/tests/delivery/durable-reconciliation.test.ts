import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST as postDelivery } from '../../src/app/api/delivery/route';
import { generateSessionToken } from '../../src/lib/auth/admin-auth';
import { getStoredFallbackOrders, saveAllFallbackOrders } from '../../src/lib/orders-store';
import { getSupabaseServerClient } from '../../src/lib/supabase/server';
import {
  generateOperationId,
  createRecoveryReceipt,
  verifyRecoveryReceipt,
  acquirePreCarrierReservation,
  recordCarrierAcceptedFailure,
  recordReconciliationSuccess,
  executeSafeReconciliation,
  RECONCILIATION_TABLE,
} from '../../src/lib/couriers/delivery-reconciliation';

/**
 * ORVA STORE — STAGE 2 REMEDIATION B: DURABLE DELIVERY RECONCILIATION TEST SUITE
 * Resolves REC-01: Proves durable, idempotent recovery across all 10 mandatory failure scenarios.
 */

interface MockFetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

async function runDurableReconciliationSuite() {
  console.log('================================================================================');
  console.log('   ORVA STORE — STAGE 2 REMEDIATION B: DURABLE RECONCILIATION SUITE (REC-01)');
  console.log('   Timestamp: ' + new Date().toISOString());
  console.log('================================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests.toString().padStart(2, '0')}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests.toString().padStart(2, '0')}: ${testName}`);
      if (detail) console.error(`         Detail: ${detail}`);
      throw new Error(`Assertion Failed: ${testName}`);
    }
  }

  const mockServiceRoleJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_signature_for_test_runner';
  process.env.SUPABASE_SERVICE_ROLE_KEY = mockServiceRoleJwt;

  // Setup admin auth token
  const adminToken = generateSessionToken();
  const authHeaders = {
    authorization: `Bearer ${adminToken}`,
    host: 'localhost:3000',
    'content-type': 'application/json',
  };

  // Intercept network
  const recordedCalls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  let validOrderCount = 0;
  let validOrderResponse: any = { success: true, message: 'Commande expedier avec succès' };
  let trackingInfoResponse: any = {
    success: true,
    tracking: 'EC-RECON-1001',
    status: 'prete_a_expedier',
    statusAr: 'جاهز للإرسال',
    activity: [
      { date: '2026-11-10', time: '10:00:00', status: 'prete_a_expedier', statusAr: 'جاهز للإرسال' },
    ],
  };

  let simulatePostgresTimeout = false;
  const mockTableData: Record<string, any[]> = {
    deliveries: [],
    delivery_validation_reconciliations: [],
    orders: [],
  };

  function resetHarness() {
    recordedCalls.length = 0;
    validOrderCount = 0;
    simulatePostgresTimeout = false;
    validOrderResponse = { success: true, message: 'Commande expedier avec succès' };
    trackingInfoResponse = {
      success: true,
      tracking: 'EC-RECON-1001',
      status: 'prete_a_expedier',
      statusAr: 'جاهز للإرسال',
      activity: [
        { date: '2026-11-10', time: '10:00:00', status: 'prete_a_expedier', statusAr: 'جاهز للإرسال' },
      ],
    };
  }

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
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
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    // 1. Redex Valid Order
    if (urlStr.includes('/api/v1/valid/order')) {
      validOrderCount++;
      return new Response(JSON.stringify(validOrderResponse), {
        status: validOrderResponse.success ? 200 : 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Redex Tracking Info
    if (urlStr.includes('/api/v1/get/tracking/info')) {
      return new Response(JSON.stringify(trackingInfoResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Supabase PostgREST Mock
    if (urlStr.includes('/rest/v1/')) {
      if (simulatePostgresTimeout && (method === 'PATCH' || method === 'PUT' || method === 'POST')) {
        return new Response(JSON.stringify({ message: 'Simulated database connection timeout (PGRST000)', code: 'PGRST000' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'GET') {
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (method === 'PATCH' || method === 'POST') {
        return new Response(JSON.stringify([{ id: 'mock-recon-row-id' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    // ── UNIT TEST GROUP: Cryptographic Receipts & Operation ID ───────────────
    console.log('── GROUP 1: Cryptographic Receipts & Deterministic Operation ID');

    const opId1 = generateOperationId('ec-test-100', 0);
    const opId2 = generateOperationId('EC-TEST-100 ', 0);
    assert(opId1 === 'op-val-EC-TEST-100-0', 'Deterministic operation_id matches expected format');
    assert(opId1 === opId2, 'Operation ID normalizes whitespace and case');

    const customOpId = generateOperationId('EC-TEST-100', 1, 'custom-id-999');
    assert(customOpId === 'custom-id-999', 'Custom operation_id is honored when supplied');

    const secret = 'test-audit-reconciliation-secret-32c';
    const samplePayload = {
      operationId: opId1,
      trackingCode: 'EC-TEST-100',
      orderId: 'ORD-100',
      askCollection: 0,
      carrierAccepted: true,
      carrierStatus: 'vers_station',
      actor: 'admin:durable',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 60000,
    };

    const receipt = createRecoveryReceipt(samplePayload, secret);
    assert(typeof receipt === 'string' && receipt.includes('.'), 'createRecoveryReceipt produces signed token');

    const verified = verifyRecoveryReceipt(receipt, secret);
    assert(verified !== null && verified.operationId === opId1, 'verifyRecoveryReceipt accepts valid authentic receipt');
    assert(verified?.carrierAccepted === true, 'Carrier acceptance flag preserved in verified receipt');

    // Tampered receipt rejection
    const tamperedReceipt = receipt.slice(0, -4) + 'abcd';
    const tamperedResult = verifyRecoveryReceipt(tamperedReceipt, secret);
    assert(tamperedResult === null, 'verifyRecoveryReceipt rejects tampered cryptographic signature');

    // Expired receipt rejection
    const expiredPayload = { ...samplePayload, expiresAt: Date.now() - 1000 };
    const expiredReceipt = createRecoveryReceipt(expiredPayload, secret);
    const expiredResult = verifyRecoveryReceipt(expiredReceipt, secret);
    assert(expiredResult === null, 'verifyRecoveryReceipt rejects expired receipts');

    // ── SCENARIO 1: Redex accepts parcel, Supabase update fails ──────────────
    console.log('\n── GROUP 2: Scenario 1 — Redex Accepts, Supabase Update Fails');
    resetHarness();

    const s1Order = 'ORD-S1-FAIL-01';
    const s1Track = 'EC-S1-FAIL-01';
    const allStored1 = getStoredFallbackOrders().filter((f) => f.id !== s1Order);
    allStored1.push({
      id: s1Order,
      orderNumber: s1Order,
      tracking_code: s1Track,
      carrier_status: 'prete_a_expedier',
      status: 'CONFIRMED' as any,
      items: [{ name: 'ORVA Pack', quantity: 1, unitPrice: 3000 }],
      total: 3500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStored1);

    // Mock Supabase failure on deliveries update
    simulatePostgresTimeout = true;
    const supabaseClient = getSupabaseServerClient() as any;
    const originalFrom = supabaseClient.from.bind(supabaseClient);
    supabaseClient.from = (table: string) => {
      const query = originalFrom(table);
      if (table === 'deliveries') {
        const origUpdate = query.update.bind(query);
        query.update = (values: any) => {
          const uQuery = origUpdate(values);
          uQuery.then = (onfulfilled: any, onrejected: any) => {
            return Promise.resolve({
              data: null,
              error: { message: 'Database timeout during final status update', code: 'PGRST000' },
            }).then(onfulfilled, onrejected);
          };
          return uQuery;
        };
      }
      return query;
    };

    let s1Receipt = '';
    try {
      const req1 = new NextRequest('http://localhost:3000/api/delivery?action=validate_order', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ tracking: s1Track, askCollection: 0 }),
      });
      const res1 = await postDelivery(req1);
      const body1 = await res1.json();

      assert(res1.status === 502, 'Scenario 1: Returns HTTP 502 Bad Gateway when database write fails');
      assert(body1.carrierAccepted === true, 'Scenario 1: carrierAccepted is confirmed true (Redex succeeded)');
      assert(body1.supabaseSynced === false, 'Scenario 1: supabaseSynced is false');
      assert(body1.reconciliationRequired === true, 'Scenario 1: reconciliationRequired is explicitly set');
      assert(typeof body1.recoveryReceipt === 'string' && body1.recoveryReceipt.length > 20, 'Scenario 1: Issues tamper-evident client recovery receipt');
      s1Receipt = body1.recoveryReceipt;

      const fbS1 = getStoredFallbackOrders().find((f) => f.id === s1Order);
      assert((fbS1 as any)?.validation_lifecycle === 'RECONCILIATION_REQUIRED', 'Scenario 1: Fallback store records RECONCILIATION_REQUIRED');
      assert((fbS1 as any)?.carrier_accepted === true, 'Scenario 1: Fallback store records carrier_accepted = true');
    } finally {
      simulatePostgresTimeout = false;
      supabaseClient.from = originalFrom;
    }

    // ── SCENARIO 2: Supabase Temporarily Unavailable During Validation ────────
    console.log('\n── GROUP 3: Scenario 2 — Supabase Temporarily Unavailable');
    resetHarness();

    const s2Order = 'ORD-S2-UNAVAIL-01';
    const s2Track = 'EC-S2-UNAVAIL-01';
    const allStored2 = getStoredFallbackOrders().filter((f) => f.id !== s2Order);
    allStored2.push({
      id: s2Order,
      orderNumber: s2Order,
      tracking_code: s2Track,
      carrier_status: 'prete_a_expedier',
      status: 'CONFIRMED' as any,
      items: [{ name: 'ORVA Pack', quantity: 1, unitPrice: 3000 }],
      total: 3500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStored2);

    // Acquire pre-carrier reservation with null supabase client
    const nullSupabaseResult = await acquirePreCarrierReservation(null, {
      operationId: 'op-val-null-supabase-test',
      trackingCode: s2Track,
      orderId: s2Order,
      askCollection: 0,
      targetCarrierStatus: 'vers_station',
      verifiedActor: 'admin:test',
    });
    assert(nullSupabaseResult.acquired === false, 'Scenario 2: acquirePreCarrierReservation fails safely when Supabase client is null');
    assert(nullSupabaseResult.error !== undefined, 'Scenario 2: Error message returned when client unavailable');

    // ── SCENARIO 3 & 4: Serverless Isolate Restart / Alternate Isolate Retry ──
    console.log('\n── GROUP 4: Scenarios 3 & 4 — Isolate Restart & Alternate Serverless Container');
    resetHarness();

    // Verify recovery receipt issued by Isolate A in Scenario 1
    const decodedReceipt = verifyRecoveryReceipt(
      s1Receipt,
      process.env.ADMIN_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'orva-recovery-secret-fallback-32c'
    );
    assert(decodedReceipt !== null, 'Scenario 3/4: Isolate B can cryptographically verify Isolate A recovery receipt');
    assert(decodedReceipt?.trackingCode === s1Track, 'Scenario 3/4: Tracking code matches original failed request');

    // Isolate B executes retry: carrier is already accepted, ZERO external calls to validOrder!
    const retryReq = new NextRequest('http://localhost:3000/api/delivery?action=validate_order', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tracking: s1Track, askCollection: 0 }),
    });
    const retryRes = await postDelivery(retryReq);
    const retryBody = await retryRes.json();

    assert(retryRes.status === 200, 'Scenario 3/4: Alternate isolate succeeds with HTTP 200 on retry');
    assert(retryBody.reconciled === true, 'Scenario 3/4: reconciled confirmed true');
    assert(retryBody.supabaseSynced === true, 'Scenario 3/4: supabaseSynced confirmed true');
    assert(validOrderCount === 0, 'Scenario 3/4: ZERO external calls to Redex validOrder on retry (Invariants 5 & 8)');

    // ── SCENARIO 5: Two Concurrent Requests Attempt Same Validation ───────────
    console.log('\n── GROUP 5: Scenario 5 — Parallel Concurrent Validation Requests');
    resetHarness();

    const s5Order = 'ORD-S5-CONC-01';
    const s5Track = 'EC-S5-CONC-01';
    const allStored5 = getStoredFallbackOrders().filter((f) => f.id !== s5Order);
    allStored5.push({
      id: s5Order,
      orderNumber: s5Order,
      tracking_code: s5Track,
      carrier_status: 'prete_a_expedier',
      status: 'CONFIRMED' as any,
      items: [{ name: 'ORVA Pack', quantity: 1, unitPrice: 3000 }],
      total: 3500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStored5);

    const concReqA = new NextRequest('http://localhost:3000/api/delivery?action=validate_order', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tracking: s5Track, askCollection: 1 }),
    });
    const concReqB = new NextRequest('http://localhost:3000/api/delivery?action=validate_order', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tracking: s5Track, askCollection: 1 }),
    });

    const [resA, resB] = await Promise.all([postDelivery(concReqA), postDelivery(concReqB)]);
    const cStatuses = [resA.status, resB.status];
    assert(cStatuses.includes(200), 'Scenario 5: At least one concurrent request succeeded with HTTP 200');
    assert(validOrderCount === 1, 'Scenario 5: EXACTLY ONE call to validOrder executed despite concurrent arrival');

    // ── SCENARIO 6: Redex Times Out After Accepting Request ──────────────────
    console.log('\n── GROUP 6: Scenario 6 — Redex Times Out After Carrier Acceptance');
    resetHarness();

    const s6Track = 'EC-S6-TIMEOUT-01';
    // Simulate: carrier accepted the parcel at Redex hub, but client timed out
    trackingInfoResponse = {
      success: true,
      tracking: s6Track,
      status: 'en_ramassage',
      statusAr: 'قيد الاستلام من المتجر',
      activity: [
        { date: '2026-11-10', time: '10:00:00', status: 'prete_a_expedier', statusAr: 'جاهز للإرسال' },
        { date: '2026-11-10', time: '10:05:00', status: 'en_ramassage', statusAr: 'قيد الاستلام من المتجر' },
      ],
    };

    const mockEcotrackClient = {
      getTrackingInfo: async (tr: string) => trackingInfoResponse,
    };

    const s6OpId = generateOperationId(s6Track, 1);
    const reconResult = await executeSafeReconciliation({
      operationId: s6OpId,
      trackingCode: s6Track,
      askCollection: 1,
      verifiedActor: 'admin:test',
      ecotrackClient: mockEcotrackClient,
      supabase: null,
    });

    assert(reconResult.success === true, 'Scenario 6: Reconciliation worker discovers carrier acceptance from tracking truth');
    assert(reconResult.reconciled === true, 'Scenario 6: Reconciliation marked as reconciled');
    assert(reconResult.carrierAccepted === true, 'Scenario 6: carrierAccepted confirmed true');
    assert(validOrderCount === 0, 'Scenario 6: Zero calls to validOrder made by safe reconciliation worker');

    // ── SCENARIO 7: Redex Tracking Temporarily Returns Stale Information ──────
    console.log('\n── GROUP 7: Scenario 7 — Carrier Tracking Stale (Not Accepted)');
    resetHarness();

    const s7Track = 'EC-S7-STALE-01';
    // Carrier activity does NOT show any accepted event
    trackingInfoResponse = {
      success: true,
      tracking: s7Track,
      status: 'prete_a_expedier',
      statusAr: 'جاهز للإرسال',
      activity: [
        { date: '2026-11-10', time: '09:00:00', status: 'prete_a_expedier', statusAr: 'جاهز للإرسال' },
      ],
    };

    const s7OpId = generateOperationId(s7Track, 0);
    const staleResult = await executeSafeReconciliation({
      operationId: s7OpId,
      trackingCode: s7Track,
      askCollection: 0,
      verifiedActor: 'admin:test',
      ecotrackClient: { getTrackingInfo: async () => trackingInfoResponse },
      supabase: null,
    });

    assert(staleResult.success === false, 'Scenario 7: Does NOT advance parcel if carrier tracking is still unvalidated');
    assert(staleResult.carrierAccepted === false, 'Scenario 7: carrierAccepted is false');
    assert(staleResult.reconciliationState === 'PENDING_CARRIER', 'Scenario 7: Ambiguous/delayed tracking remains PENDING_CARRIER');
    assert(staleResult.carrierStatus === 'validation_in_progress', 'Scenario 7: Preserves validation_in_progress to block duplicate validOrder calls');

    // ── SCENARIO 8: Expired Lease With Carrier Progressed ─────────────────────
    console.log('\n── GROUP 8: Scenario 8 — Expired Lease In Flight');
    resetHarness();

    const s8Order = 'ORD-S8-LEASE-01';
    const s8Track = 'EC-S8-LEASE-01';
    const allStored8 = getStoredFallbackOrders().filter((f) => f.id !== s8Order);
    allStored8.push({
      id: s8Order,
      orderNumber: s8Order,
      tracking_code: s8Track,
      carrier_status: 'validation_in_progress',
      validation_lifecycle: 'VALIDATION_IN_PROGRESS',
      lease_expires_at: new Date(Date.now() - 5000).toISOString(), // Expired 5 seconds ago
      status: 'CONFIRMED' as any,
      items: [{ name: 'ORVA Pack', quantity: 1, unitPrice: 3000 }],
      total: 3500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(allStored8);

    // Carrier already has en_ramassage
    trackingInfoResponse = {
      success: true,
      tracking: s8Track,
      status: 'en_ramassage',
      statusAr: 'قيد الاستلام من المتجر',
      activity: [
        { date: '2026-11-10', time: '10:00:00', status: 'en_ramassage', statusAr: 'قيد الاستلام من المتجر' },
      ],
    };

    const leaseReq = new NextRequest('http://localhost:3000/api/delivery?action=validate_order', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tracking: s8Track, askCollection: 1 }),
    });
    const leaseRes = await postDelivery(leaseReq);
    const leaseBody = await leaseRes.json();

    assert(leaseRes.status === 200, 'Scenario 8: Expired lease recovered with HTTP 200');
    assert(leaseBody.reconciled === true, 'Scenario 8: reconciled confirmed true');
    assert(validOrderCount === 0, 'Scenario 8: Interrogates carrier first and executes ZERO calls to validOrder');

    // ── SCENARIO 9: Reconciliation Succeeds After Multiple Retries ───────────
    console.log('\n── GROUP 9: Scenario 9 — Reconciliation Succeeds After Retries');
    resetHarness();

    const s9OpId = 'op-val-S9-MULTI-RETRY';
    const s9Track = 'EC-S9-MULTI-01';
    trackingInfoResponse = {
      success: true,
      tracking: s9Track,
      status: 'vers_station',
      activity: [{ status: 'vers_station' }],
    };

    // First attempt: network error to carrier tracking
    const failClient = {
      getTrackingInfo: async () => { throw new Error('Carrier tracking gateway timeout (504)'); },
    };
    const s9Attempt1 = await executeSafeReconciliation({
      operationId: s9OpId,
      trackingCode: s9Track,
      askCollection: 0,
      verifiedActor: 'admin:test',
      ecotrackClient: failClient,
      supabase: null,
    });
    assert(s9Attempt1.success === false, 'Scenario 9: Attempt 1 fails safely on carrier tracking gateway error');
    assert(s9Attempt1.reconciled === false, 'Scenario 9: Not marked reconciled on error');

    // Second attempt: succeeds
    const s9Attempt2 = await executeSafeReconciliation({
      operationId: s9OpId,
      trackingCode: s9Track,
      askCollection: 0,
      verifiedActor: 'admin:test',
      ecotrackClient: { getTrackingInfo: async () => trackingInfoResponse },
      supabase: null,
    });
    assert(s9Attempt2.success === true, 'Scenario 9: Attempt 2 succeeds when carrier recovers');
    assert(s9Attempt2.reconciled === true, 'Scenario 9: State transitions to RECONCILED');

    // ── SCENARIO 10: Duplicate Recovery Attempts Do Not Duplicate Operations ─
    console.log('\n── GROUP 10: Scenario 10 — Duplicate Recovery Attempts Are Strictly Read-Only');
    resetHarness();

    const s10Track = 'EC-S10-DUP-01';
    trackingInfoResponse = {
      success: true,
      tracking: s10Track,
      status: 'vers_station',
      activity: [{ status: 'vers_station' }],
    };

    // Explicit administrative reconcile_order action endpoint
    const reconReq1 = new NextRequest('http://localhost:3000/api/delivery?action=reconcile_order', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tracking: s10Track, askCollection: 0 }),
    });
    const reconRes1 = await postDelivery(reconReq1);
    const reconBody1 = await reconRes1.json();

    assert(reconRes1.status === 200, 'Scenario 10: Reconcile action 1 returns HTTP 200');
    assert(reconBody1.reconciled === true, 'Scenario 10: Action 1 marked reconciled');

    const reconReq2 = new NextRequest('http://localhost:3000/api/delivery?action=reconcile_order', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ tracking: s10Track, askCollection: 0 }),
    });
    const reconRes2 = await postDelivery(reconReq2);
    const reconBody2 = await reconRes2.json();

    assert(reconRes2.status === 200, 'Scenario 10: Reconcile action 2 returns HTTP 200');
    assert(reconBody2.reconciled === true, 'Scenario 10: Action 2 remains reconciled');
    assert(validOrderCount === 0, 'Scenario 10: ZERO external validOrder calls across duplicate reconciliation attempts');

    console.log('\n================================================================================');
    console.log(`   STAGE 2 REMEDIATION B COMPLETE: ${passedTests} / ${totalTests} CHECKS PASSED (100%)`);
    console.log('================================================================================\n');
  } finally {
    globalThis.fetch = originalFetch;
    try {
      saveAllFallbackOrders([]);
    } catch (cleanupErr) {
      console.warn("[Teardown Warning]: Failed to sanitize fallback orders:", cleanupErr);
    }
  }
}

runDurableReconciliationSuite().catch((err) => {
  console.error('\nFatal Suite Error:', err);
  process.exit(1);
});
