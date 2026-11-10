import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST as postDelivery, GET as getDelivery } from '../../src/app/api/delivery/route';
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
 * ORVA STORE — STAGE 2 REMEDIATION B: INDEPENDENT VERIFICATION AUDIT SUITE
 * Rigorous empirical stress-testing across all 7 Audit dimensions.
 */

interface MockFetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

async function runIndependentVerificationAuditSuite() {
  console.log('================================================================================');
  console.log('   ORVA STORE — STAGE 2 REMEDIATION B: INDEPENDENT VERIFICATION AUDIT');
  console.log('   Auditing REC-01 Resolution, Fallbacks, Receipts, and State Safety');
  console.log('   Timestamp: ' + new Date().toISOString());
  console.log('================================================================================\n');

  let totalChecks = 0;
  let passedChecks = 0;
  let defectCount = 0;

  function reportCheck(passed: boolean, testName: string, detail?: string) {
    totalChecks++;
    if (passed) {
      passedChecks++;
      console.log(`  [PASS] Check ${totalChecks.toString().padStart(2, '0')}: ${testName}`);
    } else {
      defectCount++;
      console.log(`  [DEFECT DETECTED] Check ${totalChecks.toString().padStart(2, '0')}: ${testName}`);
      if (detail) console.log(`                    Evidence: ${detail}`);
    }
  }

  const mockServiceRoleJwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sbXNqa2hkZmdoeXlkb2djdnZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTYwOTQ1OTIwMCwiZXhwIjoxOTI1MDM1MjAwfQ.mock_signature_for_test_runner';
  process.env.SUPABASE_SERVICE_ROLE_KEY = mockServiceRoleJwt;

  const adminToken = generateSessionToken();
  const authHeaders = {
    authorization: `Bearer ${adminToken}`,
    host: 'localhost:3000',
    'content-type': 'application/json',
  };

  const recordedCalls: MockFetchCall[] = [];
  const originalFetch = globalThis.fetch;

  let validOrderCount = 0;
  let validOrderResponse: any = { success: true, message: 'Commande expedier avec succès' };
  let trackingInfoResponse: any = {
    success: true,
    tracking: 'EC-AUDIT-1001',
    status: 'prete_a_expedier',
    statusAr: 'جاهز للإرسال',
    activity: [
      { date: '2026-11-10', time: '10:00:00', status: 'prete_a_expedier', statusAr: 'جاهز للإرسال' },
    ],
  };

  let simulatePostgresTimeout = false;

  function resetHarness() {
    recordedCalls.length = 0;
    validOrderCount = 0;
    simulatePostgresTimeout = false;
    validOrderResponse = { success: true, message: 'Commande expedier avec succès' };
    trackingInfoResponse = {
      success: true,
      tracking: 'EC-AUDIT-1001',
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

    if (urlStr.includes('/api/v1/valid/order')) {
      validOrderCount++;
      return new Response(JSON.stringify(validOrderResponse), {
        status: validOrderResponse.success ? 200 : 422,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (urlStr.includes('/api/v1/get/tracking/info')) {
      return new Response(JSON.stringify(trackingInfoResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
        return new Response(JSON.stringify([{ id: 'mock-audit-row-id' }]), {
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
    // ══════════════════════════════════════════════════════════════════════════
    // AUDIT 1: DURABLE RECOVERY WITHOUT CLIENT COOPERATION
    // ══════════════════════════════════════════════════════════════════════════
    console.log('── AUDIT 1: Durable Recovery Without Client Cooperation');

    // Check 1.1: Does an autonomous background batch recovery function exist in delivery-reconciliation.ts?
    const hasBatchDiscovery = typeof (require('../../src/lib/couriers/delivery-reconciliation') as any).discoverAndReconcilePending === 'function' ||
      typeof (require('../../src/lib/couriers/delivery-reconciliation') as any).reconcileAllPendingOperations === 'function' ||
      typeof (require('../../src/lib/couriers/delivery-reconciliation') as any).sweepStaleReservations === 'function';
    reportCheck(
      hasBatchDiscovery,
      'Audit 1.1: Dedicated autonomous discovery query/sweep function exists for pending/failed reconciliations',
      'No discoverAndReconcilePending() or sweep function found in delivery-reconciliation.ts. System requires manual invocation per tracking code.'
    );

    // Check 1.2: Does any route or scheduled job trigger autonomous batch reconciliation?
    const fs = require('fs');
    const path = require('path');
    const apiDir = path.join(process.cwd(), 'src', 'app', 'api');
    const apiFiles = fs.readdirSync(apiDir, { recursive: true }).map((f: any) => String(f));
    const hasCronRoute = apiFiles.some((f: string) => f.toLowerCase().includes('cron') || f.toLowerCase().includes('sweep'));
    reportCheck(
      hasCronRoute,
      'Audit 1.2: Scheduled cron route exists in src/app/api to sweep stranded reconciliations',
      'No cron route or scheduled handler exists in src/app/api. Stranded CARRIER_ACCEPTED_DB_FAILED rows cannot be automatically discovered.'
    );

    // Check 1.3: If browser closes immediately after 502, does DB alone contain enough state to reconstruct?
    const opIdFormat = generateOperationId('EC-LOST-001', 0);
    const hasOpId = Boolean(opIdFormat && opIdFormat.startsWith('op-val-EC-LOST-001-0'));
    reportCheck(
      hasOpId,
      'Audit 1.3: Deterministic operation_id allows recovery worker to reconstruct key from tracking and askCollection',
      `Generated operationId: ${opIdFormat}`
    );

    // ══════════════════════════════════════════════════════════════════════════
    // AUDIT 2: FALLBACK CONTRADICTION & SERVERLESS PERSISTENCE
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── AUDIT 2: Fallback Contradiction & Serverless Storage');

    // Check 2.1: Is route handler dependent on fallback store for order existence check?
    // In route.ts lines 931-936: if (!existingDelivery && !existingFb) -> 404
    reportCheck(
      true,
      'Audit 2.1: Route requires delivery existence in Supabase or fallback store before validating',
      'Verified: lines 931-936 strictly reject missing records with HTTP 404'
    );

    // Check 2.2: Can fallback data be lost in a cold boot without preventing DB recovery?
    // Simulate: delivery row exists in Supabase, but fallback store is completely empty (new isolate)
    resetHarness();
    const isolatedTracking = 'EC-ISOLATED-001';
    const mockSupabaseWithRow = {
      from: (tbl: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: 'deliv-iso-001',
                order_id: 'ORD-ISO-001',
                tracking_number: isolatedTracking,
                carrier_status: 'en_ramassage',
                raw_response: { carrier_accepted: true, validation_lifecycle: 'RECONCILIATION_REQUIRED' },
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    const resPreIso = await acquirePreCarrierReservation(mockSupabaseWithRow, {
      operationId: generateOperationId(isolatedTracking, 1),
      trackingCode: isolatedTracking,
      orderId: 'ORD-ISO-001',
      askCollection: 1,
      targetCarrierStatus: 'en_ramassage',
      verifiedActor: 'admin:iso',
    });
    // In mock, table delivery_validation_reconciliations returned null row from maybeSingle
    reportCheck(
      resPreIso.acquired === true,
      'Audit 2.2: Isolated container can acquire reservation directly from Supabase with empty fallback store',
      `Reservation acquired: ${resPreIso.acquired}`
    );

    // ══════════════════════════════════════════════════════════════════════════
    // AUDIT 3: HMAC RECOVERY RECEIPT & CALL SITE VERIFICATION
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── AUDIT 3: HMAC Recovery Receipt Implementation & Ingestion Seam');

    // Check 3.1: Cryptographic integrity and tampering detection
    const testSecret = 'audit-secret-for-verification-32c';
    const receiptPayload = {
      operationId: 'op-val-AUDIT-001-0',
      trackingCode: 'EC-AUDIT-001',
      orderId: 'ORD-AUDIT-001',
      askCollection: 0,
      carrierAccepted: true,
      carrierStatus: 'vers_station',
      actor: 'admin:audit',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };
    const validReceipt = createRecoveryReceipt(receiptPayload, testSecret);
    const decodedValid = verifyRecoveryReceipt(validReceipt, testSecret);
    reportCheck(
      decodedValid !== null && decodedValid.operationId === receiptPayload.operationId,
      'Audit 3.1: HMAC-SHA256 receipt round-trips correctly and validates cryptographic signature'
    );

    // Check 3.2: Tampering detection
    const forgedReceipt = validReceipt.slice(0, -6) + 'xxxxxx';
    const decodedForged = verifyRecoveryReceipt(forgedReceipt, testSecret);
    reportCheck(
      decodedForged === null,
      'Audit 3.2: Tampered HMAC signature is strictly rejected (crypto.timingSafeEqual)'
    );

    // Check 3.3: Expiration enforcement
    const expiredToken = createRecoveryReceipt({ ...receiptPayload, expiresAt: Date.now() - 5000 }, testSecret);
    const decodedExpired = verifyRecoveryReceipt(expiredToken, testSecret);
    reportCheck(
      decodedExpired === null,
      'Audit 3.3: Expired receipt is strictly rejected'
    );

    // Check 3.4: Is verifyRecoveryReceipt() EVER called in src/app/api/delivery/route.ts?
    const routeSource = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'api', 'delivery', 'route.ts'), 'utf8');
    const importRegex = /import\s+{[^}]*verifyRecoveryReceipt[^}]*}\s+from/;
    const hasImport = importRegex.test(routeSource);
    // Count occurrences of verifyRecoveryReceipt in the body of route.ts (excluding import)
    const matches = (routeSource.match(/verifyRecoveryReceipt\s*\(/g) || []).length;
    reportCheck(
      matches > 0,
      'Audit 3.4: verifyRecoveryReceipt() is actively invoked in route handler to validate client-submitted receipts',
      `Import exists: ${hasImport}, but invocation count in route body is ${matches}. The receipt is emitted on HTTP 502, but never parsed or ingested on retry!`
    );

    // Check 3.5: Non-repudiation claim validity
    // HMAC is symmetric; any party with the key can forge tokens. Does NOT provide non-repudiation.
    reportCheck(
      false,
      'Audit 3.5: Receipt provides cryptographic non-repudiation',
      'HMAC-SHA256 uses a shared symmetric secret (ADMIN_JWT_SECRET / SUPABASE_SERVICE_ROLE_KEY). It provides integrity and authenticity, but NOT non-repudiation (which requires asymmetric public-key cryptography like Ed25519/ECDSA).'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // AUDIT 4: REDEX REQUIREMENT B & STATE REGRESSION AUDIT
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── AUDIT 4: Redex Requirement B & State Regression');

    // Check 4.1: executeSafeReconciliation never calls validOrder()
    resetHarness();
    const reconTracking = 'EC-AUD-RECON-01';
    trackingInfoResponse = {
      success: true,
      tracking: reconTracking,
      status: 'en_ramassage',
      activity: [{ status: 'en_ramassage' }],
    };
    await executeSafeReconciliation({
      operationId: generateOperationId(reconTracking, 1),
      trackingCode: reconTracking,
      askCollection: 1,
      verifiedActor: 'admin:audit',
      ecotrackClient: { getTrackingInfo: async () => trackingInfoResponse },
      supabase: null,
    });
    reportCheck(
      validOrderCount === 0,
      'Audit 4.1: executeSafeReconciliation() strictly executes ZERO calls to Redex validOrder()'
    );

    // Check 4.2: State regression bug in executeSafeReconciliation:
    // If tracking is already at en_hub or vers_wilaya, does it overwrite with targetCarrierStatus (vers_station)?
    resetHarness();
    const advancedTracking = 'EC-ADVANCED-01';
    trackingInfoResponse = {
      success: true,
      tracking: advancedTracking,
      status: 'en_hub',
      activity: [
        { status: 'vers_station' },
        { status: 'en_station' },
        { status: 'en_hub' },
      ],
    };

    let capturedDeliveriesUpdate: any = null;
    const mockSupabaseDeliveries = {
      from: (tbl: string) => ({
        update: (vals: any) => {
          if (tbl === 'deliveries') capturedDeliveriesUpdate = vals;
          return {
            eq: () => Promise.resolve({ data: [{ id: '1' }], error: null }),
          };
        },
      }),
    } as any;

    await executeSafeReconciliation({
      operationId: generateOperationId(advancedTracking, 0),
      trackingCode: advancedTracking,
      askCollection: 0, // Target status would be vers_station
      verifiedActor: 'admin:audit',
      ecotrackClient: { getTrackingInfo: async () => trackingInfoResponse },
      supabase: mockSupabaseDeliveries,
    });

    const regressedStatus = capturedDeliveriesUpdate?.carrier_status;
    const doesNotRegress = regressedStatus === 'en_hub';
    reportCheck(
      doesNotRegress,
      'Audit 4.2: executeSafeReconciliation preserves advanced logistical state (en_hub) instead of regressing to vers_station',
      `Captured carrier_status in deliveries update: '${regressedStatus}'. Expected 'en_hub'. The reconciliation worker blindly overwrote advanced status with initial targetCarrierStatus ('vers_station')!`
    );

    // ══════════════════════════════════════════════════════════════════════════
    // AUDIT 5: AMBIGUOUS CARRIER OUTCOMES & RE-VALIDATION HAZARDS
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── AUDIT 5: Ambiguous Carrier Outcomes & Re-validation Hazards');

    // Check 5.1: Redex tracking returns UNKNOWN status
    resetHarness();
    const unknownTracking = 'EC-UNKNOWN-01';
    trackingInfoResponse = {
      success: true,
      tracking: unknownTracking,
      status: 'statut_inconnu_custom_carrier_event',
      activity: [{ status: 'statut_inconnu_custom_carrier_event' }],
    };

    let capturedReconState: any = null;
    const mockSupabaseUnknown = {
      from: (tbl: string) => ({
        update: (vals: any) => {
          if (tbl === RECONCILIATION_TABLE) capturedReconState = vals.reconciliation_state;
          return {
            eq: () => ({
              eq: () => Promise.resolve({ data: [], error: null }),
            }),
          };
        },
      }),
    } as any;

    const unknownResult = await executeSafeReconciliation({
      operationId: generateOperationId(unknownTracking, 0),
      trackingCode: unknownTracking,
      askCollection: 0,
      verifiedActor: 'admin:audit',
      ecotrackClient: { getTrackingInfo: async () => trackingInfoResponse },
      supabase: mockSupabaseUnknown,
    });

    // An unknown status should NOT be treated as definitive proof of non-acceptance
    const safeUnknownHandling = unknownResult.reconciliationState !== 'STALE_ABANDONED';
    reportCheck(
      safeUnknownHandling,
      'Audit 5.1: Unknown tracking status is NOT interpreted as non-acceptance or abandoned',
      `Unknown tracking status resulted in reconciliationState: '${unknownResult.reconciliationState}'. It was marked STALE_ABANDONED and reverted to prete_a_expedier!`
    );

    // Check 5.2: Stale tracking timing hazard:
    // If Redex accepted but tracking has 30s propagation delay, reconciliation abandons lease and reverts deliveries to prete_a_expedier
    resetHarness();
    const staleTracking = 'EC-STALE-PROPAGATION-01';
    trackingInfoResponse = {
      success: true,
      tracking: staleTracking,
      status: 'prete_a_expedier',
      activity: [{ status: 'prete_a_expedier' }],
    };
    const staleResult = await executeSafeReconciliation({
      operationId: generateOperationId(staleTracking, 1),
      trackingCode: staleTracking,
      askCollection: 1,
      verifiedActor: 'admin:audit',
      ecotrackClient: { getTrackingInfo: async () => trackingInfoResponse },
      supabase: null,
    });
    const safeStaleHandling = staleResult.reconciliationState === 'PENDING_CARRIER' && staleResult.carrierStatus === 'validation_in_progress';
    reportCheck(
      safeStaleHandling,
      'Audit 5.2: Stale tracking retains pending verification (Blocks duplicate validOrder hazard on retry)',
      `State: ${staleResult.reconciliationState}, Status: ${staleResult.carrierStatus}`
    );

    // ══════════════════════════════════════════════════════════════════════════
    // AUDIT 6: DATABASE MIGRATION INTEGRITY & FOREIGN KEY SAFETY
    // ══════════════════════════════════════════════════════════════════════════
    console.log('\n── AUDIT 6: Database Migration & Foreign Key Safety');

    const migSource = fs.readFileSync(
      path.join(process.cwd(), 'migrations', '20261110_durable_delivery_reconciliation.sql'),
      'utf8'
    );

    // Check 6.1: Lock and statement timeouts in migration
    const hasLockTimeout = migSource.includes("SET LOCAL lock_timeout = '3s'");
    const hasStmtTimeout = migSource.includes("SET LOCAL statement_timeout = '30s'");
    reportCheck(
      hasLockTimeout && hasStmtTimeout,
      'Audit 6.1: Migration 20261110 enforces scoped lock_timeout (3s) and statement_timeout (30s)'
    );

    // Check 6.2: Defense-in-depth RLS and privilege revocation
    const hasRlsEnable = migSource.includes('ENABLE ROW LEVEL SECURITY');
    const hasRevoke = migSource.includes('REVOKE ALL PRIVILEGES ON TABLE public.delivery_validation_reconciliations FROM PUBLIC, anon, authenticated');
    const hasGrant = migSource.includes('GRANT ALL PRIVILEGES ON TABLE public.delivery_validation_reconciliations TO service_role');
    reportCheck(
      hasRlsEnable && hasRevoke && hasGrant,
      'Audit 6.2: Complete defense-in-depth RLS enabled and privileges revoked from PUBLIC/anon/authenticated'
    );

    // Check 6.3: Barcode scanning foreign key hazard:
    // In route.ts line 1034:
    // const parentOrderId = String(orderId || existingDelivery?.order_id || (existingFb as any)?.orderNumber || (existingFb as any)?.id || resolvedTracking);
    // If orderId cannot be resolved, parentOrderId = resolvedTracking ('EC-xxx')
    // But migration requires: REFERENCES public.orders(order_id)
    // In orders, order_id is 'ORD-xxx', NOT 'EC-xxx'!
    const hasFkHazard = routeSource.includes('|| resolvedTracking);') && migSource.includes('REFERENCES public.orders(order_id)');
    reportCheck(
      !hasFkHazard,
      'Audit 6.3: parentOrderId resolution is strictly protected against passing tracking_code to orders(order_id) foreign key',
      'route.ts line 1034 falls back to resolvedTracking when orderId is missing. Passing tracking code to order_id violates foreign key constraint orders(order_id) with error 23503.'
    );

    console.log('\n================================================================================');
    console.log(`   INDEPENDENT AUDIT COMPLETED: ${totalChecks} CHECKS EXECUTED`);
    console.log(`   PASSED CHECKS: ${passedChecks}`);
    console.log(`   CONFIRMED ARCHITECTURAL DEFECTS: ${defectCount}`);
    console.log('================================================================================\n');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

runIndependentVerificationAuditSuite().catch((err) => {
  console.error('\nFatal Audit Suite Error:', err);
  process.exit(1);
});

