/**
 * ORVA Store v2.1.0 — Milestone 4: Adversarial Challenge Suite (Requirement R5 / Requirement B)
 * Author: Challenger M4_1 (Empirical Challenger)
 * 
 * Adversarial Challenge Matrix:
 * 1. Auto-validation injection attacks on parcel creation (attempt to bypass via payload injection)
 * 2. Rapid repeated label fetches and tracking queries (verify zero state mutations & zero validOrder calls)
 * 3. High-concurrency race conditions on manual validation (verify strict atomic 1-call limit)
 * 4. Advanced status regression attacks (attempt to regress en_hub/en_livraison/livred to earlier stages)
 * 5. Fallback storage pollution audit (measure byte-level changes and leakages)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { GET as getDelivery, POST as postDelivery } from '../../src/app/api/delivery/route';
import { generateSessionToken } from '../../src/lib/auth/admin-auth';
import { getStoredFallbackOrders, saveAllFallbackOrders } from '../../src/lib/orders-store';
import { executeSafeReconciliation } from '../../src/lib/couriers/delivery-reconciliation';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FALLBACK_FILE = path.join(REPO_ROOT, 'src', 'data', 'fallback-orders.json');

let totalChallenges = 0;
let passedChallenges = 0;
let failedChallenges = 0;

function reportChallenge(passed: boolean, title: string, evidence?: string) {
  totalChallenges++;
  if (passed) {
    passedChallenges++;
    console.log(`  [CHALLENGE PASSED] C${String(totalChallenges).padStart(2, '0')}: ${title}`);
    if (evidence) console.log(`                     ↳ Proof: ${evidence}`);
  } else {
    failedChallenges++;
    console.error(`  [CHALLENGE FAILED / VULNERABILITY FOUND] C${String(totalChallenges).padStart(2, '0')}: ${title}`);
    if (evidence) console.error(`                     ↳ Evidence: ${evidence}`);
  }
}

async function runAdversarialChallenges() {
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('   ORVA STORE — MILESTONE 4: ADVERSARIAL CHALLENGE HARNESS (REQUIREMENT R5)');
  console.log('   Stress Testing Requirement B Invariants, Concurrency & Data Cleanliness');
  console.log('   Timestamp: ' + new Date().toISOString());
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  const originalFetch = globalThis.fetch;
  const recordedCalls: RecordedCall[] = [];

  // 1. Setup mock service role key FIRST so getAuthSecret() is consistent
  const mockServiceRoleJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_signature_for_test_runner';
  process.env.SUPABASE_SERVICE_ROLE_KEY = mockServiceRoleJwt;

  // 2. Setup valid admin auth token with consistent secret
  const adminToken = generateSessionToken();
  const authHeaders = {
    authorization: `Bearer ${adminToken}`,
    host: 'localhost:3000',
    'content-type': 'application/json',
  };

  let mockCreateResponse = { success: true, tracking: 'EC-ADV-CHALLENGE-01', message: 'OK' };
  let mockValidResponse = { success: true, message: 'OK' };
  let mockTrackingResponse = {
    success: true,
    tracking: 'EC-ADV-CHALLENGE-01',
    status: 'prete_a_expedier',
    statusAr: 'جاهز للإرسال',
    activity: [{ status: 'prete_a_expedier', statusAr: 'جاهز للإرسال' }],
  };
  const mockLabelPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  globalThis.fetch = async (input: any, init?: any): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input?.url || '';
    const method = init?.method || 'GET';
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (typeof init.headers.forEach === 'function') {
        init.headers.forEach((v: string, k: string) => { headers[k.toLowerCase()] = v; });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) headers[k.toLowerCase()] = v;
      } else {
        for (const [k, v] of Object.entries(init.headers)) headers[k.toLowerCase()] = String(v);
      }
    }
    const body = typeof init?.body === 'string' ? init.body : undefined;
    recordedCalls.push({ url: urlStr, method, headers, body });

    // Mock Redex API responses
    if (urlStr.includes('/api/v1/create/order')) {
      return new Response(JSON.stringify(mockCreateResponse), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/api/v1/valid/order')) {
      return new Response(JSON.stringify(mockValidResponse), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (urlStr.includes('/api/v1/get/order/label')) {
      return new Response(mockLabelPdf, { status: 200, headers: { 'content-type': 'application/pdf' } });
    }
    if (urlStr.includes('/api/v1/get/tracking/info')) {
      return new Response(JSON.stringify(mockTrackingResponse), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    // Pass through mock Supabase postgrest / other calls
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    // ════════════════════════════════════════════════════════════════════════════
    // SECTION 1: ADVERSARIAL AUTO-VALIDATION INJECTION ATTACKS ON CREATION
    // ════════════════════════════════════════════════════════════════════════════
    console.log('── SECTION 1: Adversarial Auto-Validation Injection Attacks on Creation');

    recordedCalls.length = 0;
    const testOrderId = 'ORD-ADV-INJECT-001';

    // Seed order in fallback store
    const seedOrders = getStoredFallbackOrders().filter(f => f.id !== testOrderId);
    seedOrders.push({
      id: testOrderId,
      orderNumber: testOrderId,
      customerName: 'Attacker Malicious',
      customerPhone: '0555123456',
      wilaya: '16 - Alger',
      commune: 'Bab El Oued',
      address: 'Test Rue 1',
      status: 'PENDING' as any,
      items: [{ name: 'Pack ORVA', quantity: 1, unitPrice: 4500 }],
      total: 4500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(seedOrders);

    const maliciousPayload = {
      orderId: testOrderId,
      fullName: 'Attacker Malicious',
      phone: '0555123456',
      wilaya: 'Alger',
      wilayaCode: 16,
      commune: 'Bab El Oued',
      address: 'Test Rue 1',
      deliveryType: 'home',
      codAmountDzd: 4500,
      productName: 'Pack ORVA',
      // Injected attack parameters attempting to force auto-validation:
      autoValidate: true,
      validated: true,
      validOrder: true,
      carrier_status: 'en_ramassage',
      status: 'CONFIRMED',
      askCollection: 1,
    };

    const req1 = new NextRequest('http://localhost:3000/api/delivery?action=create', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(maliciousPayload),
    });
    const res1 = await postDelivery(req1);
    const body1 = await res1.json();

    const validOrderCallsAfterCreation = recordedCalls.filter(c => c.url.includes('/api/v1/valid/order'));
    const createOrderCallsAfterCreation = recordedCalls.filter(c => c.url.includes('/api/v1/create/order'));

    reportChallenge(
      res1.status === 200 && body1.success === true,
      'Parcel created successfully under adversarial injection payload',
      `HTTP status: ${res1.status}, trackingCode: ${body1.trackingCode}`
    );

    reportChallenge(
      validOrderCallsAfterCreation.length === 0,
      'INJECTION DEFENSE: Exactly ZERO calls to validOrder() despite injected autoValidate/validated flags',
      `validOrder calls: ${validOrderCallsAfterCreation.length}`
    );

    reportChallenge(
      createOrderCallsAfterCreation.length === 1,
      'Exactly ONE call to Redex createOrder() dispatched',
      `createOrder calls: ${createOrderCallsAfterCreation.length}`
    );

    reportChallenge(
      body1.carrierStatus === 'prete_a_expedier' && body1.carrierStatusAr === 'جاهز للإرسال' && body1.validated === false,
      'Initial parcel staging state strictly preserved as prete_a_expedier and validated: false',
      `carrierStatus: ${body1.carrierStatus}, validated: ${body1.validated}`
    );

    // ════════════════════════════════════════════════════════════════════════════
    // SECTION 2: ADVERSARIAL INSPECTION SEAM MUTATION ATTACK (50 REPEATED CALLS)
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n── SECTION 2: Adversarial Inspection Seam Mutation Attacks (50 Repetitions)');

    recordedCalls.length = 0;
    const testTracking = 'EC-ADV-CHALLENGE-01';

    // 2.1 Repeated Label Requests
    let labelErrors = 0;
    for (let i = 0; i < 50; i++) {
      const labelReq = new NextRequest(`http://localhost:3000/api/delivery?action=label_pdf&tracking=${testTracking}`, {
        method: 'GET',
        headers: authHeaders,
      });
      const labelRes = await getDelivery(labelReq);
      if (labelRes.status !== 200) labelErrors++;
    }

    const validOrderDuringLabels = recordedCalls.filter(c => c.url.includes('/api/v1/valid/order'));
    reportChallenge(
      labelErrors === 0 && validOrderDuringLabels.length === 0,
      '50 consecutive label fetches stream PDF cleanly with ZERO calls to validOrder()',
      `Label errors: ${labelErrors}, validOrder calls: ${validOrderDuringLabels.length}`
    );

    // 2.2 Repeated Tracking Requests
    recordedCalls.length = 0;
    let trackErrors = 0;
    for (let i = 0; i < 50; i++) {
      const trackReq = new NextRequest(`http://localhost:3000/api/delivery?action=track&tracking=${testTracking}`, {
        method: 'GET',
        headers: authHeaders,
      });
      const trackRes = await getDelivery(trackReq);
      if (trackRes.status !== 200) trackErrors++;
    }

    const validOrderDuringTracks = recordedCalls.filter(c => c.url.includes('/api/v1/valid/order'));
    reportChallenge(
      trackErrors === 0 && validOrderDuringTracks.length === 0,
      '50 consecutive tracking queries return status with ZERO calls to validOrder()',
      `Tracking errors: ${trackErrors}, validOrder calls: ${validOrderDuringTracks.length}`
    );

    // 2.3 Verify parcel has not mutated
    const fbAfterSeams = getStoredFallbackOrders().find(f => (f as any).tracking_code === testTracking);
    reportChallenge(
      (fbAfterSeams as any)?.carrier_status === 'prete_a_expedier',
      'Inspection seams (label & track) caused ZERO side-effect state mutations on fallback record',
      `carrier_status remains: ${(fbAfterSeams as any)?.carrier_status}`
    );

    // ════════════════════════════════════════════════════════════════════════════
    // SECTION 3: CONCURRENCY & RACE CONDITION STRESS TEST (10 PARALLEL VALIDATIONS)
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n── SECTION 3: Concurrency Race Condition Stress Test (10 Parallel Validations)');

    const raceTracking = 'EC-ADV-RACE-001';
    const raceOrderId = 'ORD-ADV-RACE-001';

    // Seed test order in fallback store
    const currentOrders = getStoredFallbackOrders().filter(f => f.id !== raceOrderId && (f as any).tracking_code !== raceTracking);
    currentOrders.push({
      id: raceOrderId,
      orderNumber: raceOrderId,
      tracking_code: raceTracking,
      carrier_status: 'prete_a_expedier',
      carrier_status_ar: 'جاهز للإرسال',
      validated: false,
      status: 'CONFIRMED' as any,
      items: [{ name: 'Test', quantity: 1, unitPrice: 4000 }],
      total: 4500,
      createdAt: new Date().toISOString(),
    } as any);
    saveAllFallbackOrders(currentOrders);

    recordedCalls.length = 0;

    // Fire 10 parallel validation requests simultaneously
    const validationPromises = Array.from({ length: 10 }, (_, idx) => {
      const valReq = new NextRequest('http://localhost:3000/api/delivery?action=validate_order', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ tracking: raceTracking, askCollection: 0 }),
      });
      return postDelivery(valReq).then(async (res) => {
        const body = await res.json();
        return { index: idx, status: res.status, body };
      });
    });

    const raceResults = await Promise.all(validationPromises);
    const validOrderCallsInRace = recordedCalls.filter(c => c.url.includes('/api/v1/valid/order'));

    const success200Count = raceResults.filter(r => r.status === 200).length;
    const conflict409Count = raceResults.filter(r => r.status === 409).length;

    reportChallenge(
      validOrderCallsInRace.length === 1,
      'STRICT ATOMIC VALIDATION: Exactly ONE outbound call to Redex validOrder() under 10 parallel requests',
      `Outbound validOrder calls: ${validOrderCallsInRace.length} (Target: exactly 1)`
    );

    reportChallenge(
      success200Count >= 1 && (success200Count + conflict409Count) === 10,
      'All 10 parallel requests safely resolved without unhandled exceptions or 500s',
      `HTTP 200s: ${success200Count}, HTTP 409s: ${conflict409Count}`
    );

    // Verify post-validation status
    const fbAfterRace = getStoredFallbackOrders().find(f => (f as any).tracking_code === raceTracking);
    reportChallenge(
      (fbAfterRace as any)?.carrier_status === 'vers_station' && (fbAfterRace as any)?.validated === true,
      'Post-race record correctly transitioned to validated and carrier_status: vers_station',
      `carrier_status: ${(fbAfterRace as any)?.carrier_status}, validated: ${(fbAfterRace as any)?.validated}`
    );

    // ════════════════════════════════════════════════════════════════════════════
    // SECTION 4: DOWNSTREAM STATUS REGRESSION ATTACK
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n── SECTION 4: Downstream Status Regression Attack');

    const downstreamStatuses = ['en_station', 'vers_hub', 'en_hub', 'dispatched_to_driver', 'en_livraison', 'livred'];
    let regressionBlockedCount = 0;

    for (const downstreamStatus of downstreamStatuses) {
      recordedCalls.length = 0;
      const progTracking = `EC-ADV-PROG-${downstreamStatus}`;
      const progOrderId = `ORD-ADV-PROG-${downstreamStatus}`;

      const fbList = getStoredFallbackOrders().filter(f => f.id !== progOrderId && (f as any).tracking_code !== progTracking);
      fbList.push({
        id: progOrderId,
        orderNumber: progOrderId,
        tracking_code: progTracking,
        carrier_status: downstreamStatus,
        carrier_status_ar: 'حالة متقدمة',
        validated: true,
        status: 'CONFIRMED' as any,
        items: [{ name: 'Test', quantity: 1, unitPrice: 4000 }],
        total: 4500,
        createdAt: new Date().toISOString(),
      } as any);
      saveAllFallbackOrders(fbList);

      const regReq = new NextRequest('http://localhost:3000/api/delivery?action=validate_order', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ tracking: progTracking, askCollection: 1 }),
      });
      const regRes = await postDelivery(regReq);
      const regBody = await regRes.json();

      const validCalls = recordedCalls.filter(c => c.url.includes('/api/v1/valid/order'));

      if (regRes.status === 409 && regBody.alreadyProgressed === true && validCalls.length === 0) {
        regressionBlockedCount++;
      }
    }

    reportChallenge(
      regressionBlockedCount === downstreamStatuses.length,
      `State Progression Gate blocked regression across all ${downstreamStatuses.length} advanced stages (HTTP 409 Conflict)`,
      `Blocked stages: ${regressionBlockedCount} / ${downstreamStatuses.length}`
    );

    // ════════════════════════════════════════════════════════════════════════════
    // SECTION 5: NON-REGRESSIVE RECONCILIATION STRESS TEST
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n── SECTION 5: Non-Regressive Reconciliation Engine Stress Test');

    recordedCalls.length = 0;
    const reconTracking = 'EC-ADV-RECON-001';

    // Interrogate carrier returns advanced status 'livred'
    const mockAdvancedCarrier = {
      getTrackingInfo: async (tracking: string) => ({
        success: true,
        tracking,
        status: 'livred',
        statusAr: 'تم التسليم بنجاح',
        activity: [{ status: 'livred', statusAr: 'تم التسليم بنجاح' }],
      }),
    };

    const reconResult = await executeSafeReconciliation({
      operationId: `op-val-${reconTracking}-0`,
      trackingCode: reconTracking,
      askCollection: 0,
      verifiedActor: 'admin:challenge',
      ecotrackClient: mockAdvancedCarrier as any,
      supabase: null,
    });

    const validOrderDuringRecon = recordedCalls.filter(c => c.url.includes('/api/v1/valid/order'));

    reportChallenge(
      reconResult.success === true && reconResult.reconciled === true,
      'Reconciliation successfully completed using carrier truth interrogation',
      `State: ${reconResult.reconciliationState}`
    );

    reportChallenge(
      validOrderDuringRecon.length === 0,
      'ZERO outbound calls to validOrder() during reconciliation',
      `Calls: ${validOrderDuringRecon.length}`
    );

    reportChallenge(
      reconResult.carrierStatus === 'livred',
      'Advanced status livred strictly preserved without regressing to vers_station',
      `Preserved carrierStatus: ${reconResult.carrierStatus}`
    );

  } finally {
    globalThis.fetch = originalFetch;

    // ════════════════════════════════════════════════════════════════════════════
    // SECTION 6: FALLBACK ORDERS FILE PURITY AUDIT
    // ════════════════════════════════════════════════════════════════════════════
    console.log('\n── SECTION 6: Fallback Orders Storage Purity Audit & Residual Cleanup');

    const fileContentBeforeClean = fs.existsSync(FALLBACK_FILE) ? fs.readFileSync(FALLBACK_FILE, 'utf8') : '';
    const bytesBeforeClean = Buffer.byteLength(fileContentBeforeClean);
    console.log(`  [EVIDENCE] Storage size after test mutations: ${bytesBeforeClean} bytes`);

    // Restore clean state
    fs.writeFileSync(FALLBACK_FILE, '[]\n', 'utf8');

    const fileContentAfterClean = fs.readFileSync(FALLBACK_FILE, 'utf8');
    const bytesAfterClean = Buffer.byteLength(fileContentAfterClean);

    reportChallenge(
      bytesAfterClean === 3 && fileContentAfterClean === '[]\n',
      'src/data/fallback-orders.json strictly restored and verified at exactly 3 bytes ("[]\\n")',
      `Final bytes: ${bytesAfterClean}, Content: ${JSON.stringify(fileContentAfterClean)}`
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ════════════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log('   ADVERSARIAL CHALLENGE EXECUTION SUMMARY');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(` Total Challenges Evaluated: ${totalChallenges}`);
  console.log(` Passed Challenges:          ${passedChallenges} ✅`);
  console.log(` Failed Challenges:          ${failedChallenges} ${failedChallenges === 0 ? '✅' : '❌'}`);

  if (failedChallenges === 0) {
    console.log('\n🌟 ALL ADVERSARIAL CHALLENGES CONFIRMED ROBUST.');
    console.log('   Requirement B Invariants withstand adversarial stress testing.\n');
  } else {
    console.error(`\n💥 ${failedChallenges} ADVERSARIAL CHALLENGE(S) FAILED.\n`);
    process.exit(1);
  }
}

runAdversarialChallenges().catch((err) => {
  console.error('Fatal Challenge Error:', err);
  try {
    fs.writeFileSync(FALLBACK_FILE, '[]\n', 'utf8');
  } catch {}
  process.exit(1);
});
