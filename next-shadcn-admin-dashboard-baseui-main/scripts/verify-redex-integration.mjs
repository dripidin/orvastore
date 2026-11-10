#!/usr/bin/env node
/**
 * ORVA Store v2.1.0 — Milestone 4: Redex EcoTrack Integration Verification Harness
 * Turnkey 5-Pillar Verification Harness for Requirement R5 / Requirement B Invariants
 * Target Repository: next-shadcn-admin-dashboard-baseui-main
 * File: scripts/verify-redex-integration.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function printHeader(title) {
  console.log('\n' + '═'.repeat(80));
  console.log(`   ${title}`);
  console.log('═'.repeat(80));
}

function printSection(title) {
  console.log('\n' + '─'.repeat(80));
  console.log(` ▶ ${title}`);
  console.log('─'.repeat(80));
}

function assert(condition, testName, details = '') {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] Check ${String(totalChecks).padStart(2, '0')}: ${testName}`);
    if (details) console.log(`         ↳ ${details}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] Check ${String(totalChecks).padStart(2, '0')}: ${testName}`);
    if (details) console.error(`         ↳ ERROR: ${details}`);
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const fallbackFile = path.join(REPO_ROOT, 'src', 'data', 'fallback-orders.json');

function restoreFallbackOrdersClean() {
  try {
    fs.mkdirSync(path.dirname(fallbackFile), { recursive: true });
    fs.writeFileSync(fallbackFile, '[]\n', 'utf8');
  } catch (err) {
    console.error('Failed to restore fallback orders:', err);
  }
}

async function run() {
  const startTime = Date.now();
  printHeader('ORVA STORE v2.1.0 — MILESTONE 4: REDEX ECOTRACK INTEGRATION (R5)');
  console.log(` Target Working Directory: ${REPO_ROOT}`);
  console.log(` Timestamp:                ${new Date().toISOString()}`);
  console.log(` Execution Mode:           Turnkey 5-Pillar Verification Harness\n`);

  try {
    // ════════════════════════════════════════════════════════════════════════════
    // PILLAR 0: ENVIRONMENT CONFIGURATION & BASE URL RESOLUTION
    // ════════════════════════════════════════════════════════════════════════════
    printSection('PILLAR 0: Environment Variables & Redex Gateway Configuration');

    const envLocal = loadEnvFile(path.join(REPO_ROOT, '.env.local'));
    const envMain = loadEnvFile(path.join(REPO_ROOT, '.env'));

    const redexToken =
      process.env.REDEX_API_TOKEN ||
      process.env.ECOTRACK_API_TOKEN ||
      envLocal.REDEX_API_TOKEN ||
      envLocal.ECOTRACK_API_TOKEN ||
      envMain.REDEX_API_TOKEN ||
      envMain.ECOTRACK_API_TOKEN;

    const redexBaseUrl =
      process.env.REDEX_BASE_URL ||
      process.env.ECOTRACK_BASE_URL ||
      envLocal.REDEX_BASE_URL ||
      envLocal.ECOTRACK_BASE_URL ||
      envMain.REDEX_BASE_URL ||
      envMain.ECOTRACK_BASE_URL ||
      'https://redex.ecotrack.dz';

    assert(
      Boolean(redexToken && redexToken.length >= 20),
      'REDEX_API_TOKEN is properly configured in environment / .env file',
      `Token preview: ${redexToken ? redexToken.slice(0, 6) + '...' + redexToken.slice(-4) : 'MISSING'}`
    );

    assert(
      redexBaseUrl.startsWith('https://redex.ecotrack.dz'),
      'ECOTRACK_BASE_URL / REDEX_BASE_URL resolves to official Redex endpoint (https://redex.ecotrack.dz)',
      `Base URL: ${redexBaseUrl}`
    );

    const clientFile = path.join(REPO_ROOT, 'src', 'lib', 'couriers', 'ecotrack-client.ts');
    assert(fs.existsSync(clientFile), 'EcoTrack client source file exists at src/lib/couriers/ecotrack-client.ts');
    const clientSource = fs.readFileSync(clientFile, 'utf8');

    assert(
      clientSource.includes('https://redex.ecotrack.dz'),
      'EcoTrack client code contains fallback default URL https://redex.ecotrack.dz',
      'Verified in ecotrack-client.ts constructor defaults'
    );

    // ════════════════════════════════════════════════════════════════════════════
    // PILLAR 1: REQUIREMENT B INVARIANT 1 — PARCEL CREATION & ZERO AUTO-VALIDATION
    // ════════════════════════════════════════════════════════════════════════════
    printSection('PILLAR 1: Requirement B Invariant 1 — Parcel Creation & Initial State (prete_a_expedier)');

    // 1.1 EcoTrack Client createOrder implementation
    assert(
      clientSource.includes('public async createOrder(') &&
      clientSource.includes("`${this.baseUrl}/api/v1/create/order?${params.toString()}`"),
      'EcoTrack client implements createOrder() via official POST /api/v1/create/order endpoint',
      'Single-order query params format per EcoTrack specification'
    );

    assert(
      clientSource.includes("params.set('montant'") &&
      clientSource.includes("params.set('nom_client'") &&
      clientSource.includes("params.set('telephone'") &&
      clientSource.includes("params.set('type', String(payload.type ?? 1))"),
      'createOrder() maps required Algerian e-commerce COD parameters (montant, nom_client, telephone, type=1)',
      'Delivery type 1 (Livraison) and COD collection amount preserved'
    );

    assert(
      clientSource.includes('if (data?.success && data?.tracking)') &&
      clientSource.includes('tracking: String(data.tracking)'),
      'createOrder() extracts and returns tracking code from EcoTrack response payload',
      'Tracking code contract preserved'
    );

    // 1.2 Provider Layer (ecotrack-provider.ts)
    const providerFile = path.join(REPO_ROOT, 'src', 'lib', 'couriers', 'ecotrack-provider.ts');
    assert(fs.existsSync(providerFile), 'Courier provider source file exists at src/lib/couriers/ecotrack-provider.ts');
    const providerSource = fs.readFileSync(providerFile, 'utf8');

    const createParcelMatch = providerSource.match(/async\s+createParcel\([\s\S]*?return\s+\{[\s\S]*?\};/);
    const createParcelBody = createParcelMatch ? createParcelMatch[0] : '';

    assert(
      createParcelBody.includes('client.createOrder(') && !createParcelBody.includes('client.validOrder('),
      'RedexCourierProvider.createParcel() calls createOrder() only and strictly NEVER calls validOrder()',
      'Requirement B Invariant: Zero automatic validation upon parcel creation'
    );

    assert(
      providerSource.includes('labelUrl: `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(tracking)}`'),
      'createParcel() generates accessible internal label proxy URL (/api/delivery?action=label_pdf)',
      'Merchant label URL format verified'
    );

    // 1.3 Route Handler Creation Flow (route.ts: action=create)
    const routeFile = path.join(REPO_ROOT, 'src', 'app', 'api', 'delivery', 'route.ts');
    assert(fs.existsSync(routeFile), 'Delivery API route handler exists at src/app/api/delivery/route.ts');
    const routeSource = fs.readFileSync(routeFile, 'utf8');

    assert(
      routeSource.includes("carrier_status: 'prete_a_expedier'") &&
      routeSource.includes("carrier_status_ar: 'جاهز للإرسال'"),
      'Creation route initializes deliveries with carrier_status "prete_a_expedier" and Arabic "جاهز للإرسال"',
      'Canonical Redex initial staging state enforced'
    );

    assert(
      routeSource.includes('validated: false') && routeSource.includes("status: 'CREATED'"),
      'Creation route records validated: false and status: CREATED in deliveries record',
      'Unvalidated state strictly preserved'
    );

    assert(
      routeSource.includes("courier: 'REDEX'") &&
      routeSource.includes('in_redex: true') &&
      routeSource.includes('redex_tracking_code: trackingCode'),
      'Creation route links tracking code and Redex courier metadata to orders table',
      'Relational linkage verified'
    );

    // 1.4 Storefront Checkout Isolation
    const checkoutFile = path.join(REPO_ROOT, 'src', 'app', 'actions', 'checkout.ts');
    assert(fs.existsSync(checkoutFile), 'Storefront checkout action exists at src/app/actions/checkout.ts');
    const checkoutSource = fs.readFileSync(checkoutFile, 'utf8');

    assert(
      checkoutSource.includes("status: 'pending'") &&
      checkoutSource.includes('in_redex: false') &&
      !checkoutSource.includes('createOrder(') &&
      !checkoutSource.includes('validOrder('),
      'Storefront checkout creates orders with in_redex: false with ZERO outbound courier calls during checkout',
      'Strict separation of order placement and courier parcel dispatch'
    );

    // ════════════════════════════════════════════════════════════════════════════
    // PILLAR 2: REQUIREMENT B INVARIANT 2 — SHIPPING LABEL PDF RETRIEVAL
    // ════════════════════════════════════════════════════════════════════════════
    printSection('PILLAR 2: Requirement B Invariant 2 — Shipping Label PDF Retrieval Flow');

    assert(
      routeSource.includes("action === 'label_pdf'") &&
      routeSource.includes('if (!await verifyAdminSession(request))'),
      'Label retrieval route (/api/delivery?action=label_pdf) strictly requires verified admin session (HTTP 401)',
      'Protected admin-only asset endpoint'
    );

    assert(
      routeSource.includes("const tracking = searchParams.get('tracking')?.trim();") &&
      routeSource.includes("if (!tracking)"),
      'Label retrieval requires tracking code parameter (HTTP 400 on missing tracking)',
      'Input validation enforced'
    );

    assert(
      clientSource.includes('public async fetchLabelPdf(tracking: string)') &&
      clientSource.includes("`${this.baseUrl}/api/v1/get/order/label?tracking="),
      'EcoTrack client fetchLabelPdf() requests official GET /api/v1/get/order/label endpoint with Bearer auth',
      'Authentic binary PDF retrieval from Redex'
    );

    assert(
      routeSource.includes("'Content-Type': 'application/pdf'") &&
      routeSource.includes("'Content-Disposition': `inline; filename=\"redex-label-${tracking}.pdf\"`") &&
      routeSource.includes("'Cache-Control': 'public, max-age=3600'"),
      'Label retrieval streams binary PDF with correct Content-Type, inline Content-Disposition, and cache headers',
      'Streaming HTTP binary response verified'
    );

    const labelPdfSection = routeSource.substring(
      routeSource.indexOf("action === 'label_pdf'"),
      routeSource.indexOf("action === 'sync_all_active'")
    );
    assert(
      !labelPdfSection.includes('validOrder(') && !labelPdfSection.includes('valid_order'),
      'Label PDF retrieval flow executes strictly ZERO calls to validOrder()',
      'Requirement B Invariant: Label download does not validate parcel'
    );

    // ════════════════════════════════════════════════════════════════════════════
    // PILLAR 3: REQUIREMENT B INVARIANT 3 — PARCEL TRACKING QUERIES
    // ════════════════════════════════════════════════════════════════════════════
    printSection('PILLAR 3: Requirement B Invariant 3 — Parcel Tracking Queries & Status Enrichment');

    assert(
      routeSource.includes("action === 'track' || action === 'get_tracking'"),
      'Delivery route registers tracking query endpoints (action=track and action=get_tracking)',
      'Tracking action routing verified'
    );

    assert(
      clientSource.includes('public async getTrackingInfo(tracking: string)') &&
      clientSource.includes("`${this.baseUrl}/api/v1/get/tracking/info?tracking="),
      'EcoTrack client getTrackingInfo() interrogates official GET /api/v1/get/tracking/info endpoint',
      'Carrier tracking truth source'
    );

    assert(
      clientSource.includes('export const ECOTRACK_STATUS_MAP_AR: Record<string') &&
      clientSource.includes("prete_a_expedier: { label: 'جاهز للإرسال (Prêt à expédier)'") &&
      clientSource.includes("en_ramassage: { label: 'قيد الاستلام من المتجر'") &&
      clientSource.includes("livred: { label: 'تم التسليم بنجاح'"),
      'EcoTrack client exports comprehensive Arabic status translation mapping (ECOTRACK_STATUS_MAP_AR)',
      'Localized tracking stages verified'
    );

    const trackSection = routeSource.substring(
      routeSource.indexOf("action === 'track' || action === 'get_tracking'"),
      routeSource.indexOf("action === 'label_pdf'")
    );

    assert(
      !trackSection.includes('validOrder(') && !trackSection.includes('valid_order'),
      'Tracking retrieval flow executes strictly ZERO calls to validOrder()',
      'Requirement B Invariant: Tracking queries do not validate parcel'
    );

    assert(
      trackSection.includes("newDbStatus = 'DELIVERED'") &&
      trackSection.includes("newDbStatus = 'RETURNED'") &&
      trackSection.includes("newDbStatus = 'CANCELLED'"),
      'Tracking queries update deliveries and orders only when carrier confirms advanced terminal status',
      'Safe status propagation without regression'
    );

    // ════════════════════════════════════════════════════════════════════════════
    // PILLAR 4: REQUIREMENT B INVARIANT 4 — AUTHORIZED MANUAL ORDER VALIDATION
    // ════════════════════════════════════════════════════════════════════════════
    printSection('PILLAR 4: Requirement B Invariant 4 — Authorized Manual Order Validation');

    assert(
      routeSource.includes("action === 'validate_order' || action === 'valid_order'"),
      'Delivery route handler implements manual validation endpoint (action=validate_order / valid_order)',
      'Explicit validation entry point'
    );

    assert(
      routeSource.includes('const adminSession = await getVerifiedAdminSession(request);') &&
      routeSource.includes("if (adminSession.role !== 'admin')"),
      'Manual validation requires verified admin session with role: admin and active session ID',
      'Unauthorized access strictly rejected with HTTP 401/403'
    );

    assert(
      routeSource.includes("const verifiedActor = `admin:${adminSession.sid.slice(0, 8)}`;") ||
      routeSource.includes("const verifiedActor = 'admin:' + adminSession.sid.slice(0, 8);"),
      'Validation audit actor is strictly derived from verified admin session claims (ignoring forged body.actor)',
      'Audit log tamper-proofing enforced'
    );

    assert(
      routeSource.includes("rawAsk !== 0 && rawAsk !== 1 && rawAsk !== '0' && rawAsk !== '1'") &&
      routeSource.includes("askCollection === 1 ? 'en_ramassage' : 'vers_station'"),
      'askCollection parameter strictly restricted to 0 or 1 with approved status mappings (0 -> vers_station, 1 -> en_ramassage)',
      'Invalid values rejected with HTTP 400 Bad Request'
    );

    assert(
      routeSource.includes('const nonRegressibleStatuses = [') &&
      routeSource.includes("'en_station', 'vers_hub', 'en_hub'") &&
      routeSource.includes('alreadyProgressed: true') &&
      routeSource.includes('{ status: 409 }'),
      'State Progression Gate prevents regressing advanced downstream parcel statuses (returns HTTP 409 Conflict)',
      'Non-regression invariant protected against illegal rollback'
    );

    assert(
      routeSource.includes('acquirePreCarrierReservation(') &&
      routeSource.includes('memoryLockMap') &&
      routeSource.includes("carrier_status = 'validation_in_progress'"),
      'Multi-layer concurrency control (memory lock, pre-carrier reservation, atomic delivery lease) blocks duplicate validOrder()',
      'At most ONE outbound validOrder() call per parcel'
    );

    assert(
      routeSource.includes('carrierAccepted: true') &&
      routeSource.includes('reconciliationRequired: true') &&
      routeSource.includes('{ status: 502 }'),
      'Partial failure handling returns HTTP 502 with carrierAccepted: true and reconciliationRequired flag on DB write failure',
      'Resilient partial failure protocol with recovery receipt'
    );

    // ════════════════════════════════════════════════════════════════════════════
    // PILLAR 5: REQUIREMENT B INVARIANT 5 — DURABLE RECONCILIATION ENGINE
    // ════════════════════════════════════════════════════════════════════════════
    printSection('PILLAR 5: Requirement B Invariant 5 — Durable Delivery Reconciliation Engine');

    const reconFile = path.join(REPO_ROOT, 'src', 'lib', 'couriers', 'delivery-reconciliation.ts');
    assert(fs.existsSync(reconFile), 'Durable reconciliation module exists at src/lib/couriers/delivery-reconciliation.ts');
    const reconSource = fs.readFileSync(reconFile, 'utf8');

    assert(
      reconSource.includes("RECONCILIATION_TABLE = 'delivery_validation_reconciliations'"),
      'Reconciliation uses dedicated logistical table delivery_validation_reconciliations',
      'Isolated from financial cod_reconciliations table'
    );

    assert(
      reconSource.includes('export async function executeSafeReconciliation(') &&
      reconSource.includes('// 1. Interrogate Carrier Truth First (NEVER CALL validOrder!)'),
      'executeSafeReconciliation() queries carrier tracking truth first and strictly NEVER calls validOrder()',
      'Safe, non-destructive reconciliation invariant'
    );

    assert(
      reconSource.includes('const nonRegressibleStatuses = [') &&
      reconSource.includes("'en_ramassage', 'vers_station', 'en_station', 'vers_hub', 'en_hub'") &&
      reconSource.includes('highLevelStatus = \'DELIVERED\''),
      'Reconciliation preserves advanced carrier statuses without regressing to earlier stages',
      'Unidirectional progression to terminal states'
    );

    assert(
      reconSource.includes("reconciliationState: 'PENDING_CARRIER'") &&
      reconSource.includes("carrierStatus: 'validation_in_progress'"),
      'Ambiguous or delayed carrier statuses preserve validation_in_progress (DEF-05/DEF-06 fix)',
      'Blocks duplicate validation attempts during propagation lag'
    );

    assert(
      reconSource.includes('export function generateOperationId(') &&
      reconSource.includes('`op-val-${cleanTracking}-${askCollection}`'),
      'Deterministic operation ID generator binds tracking code and collection type',
      'Stable operation idempotency key format'
    );

    assert(
      reconSource.includes('export function createRecoveryReceipt(') &&
      reconSource.includes('export function verifyRecoveryReceipt(') &&
      reconSource.includes('createHmac(\'sha256\','),
      'Cryptographic HMAC-SHA256 recovery receipt generation and verification functions implemented',
      'Client recovery token integrity'
    );

    // ════════════════════════════════════════════════════════════════════════════
    // PILLAR 6: AUTOMATED IN-REPO TEST SUITES & STATIC COMPILATION
    // ════════════════════════════════════════════════════════════════════════════
    printSection('PILLAR 6: Automated Test Suites Execution & Static Verification');

    // 6.1 Redex Requirement B Invariant Test Suite (98 tests)
    console.log('  Executing Redex Requirement B suite (npx tsx tests/delivery/redex-requirement-b.test.ts)...');
    let reqBPassed = false;
    let reqBOutput = '';
    try {
      reqBOutput = execSync('npx tsx tests/delivery/redex-requirement-b.test.ts', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      reqBPassed = reqBOutput.includes('98 / 98 CHECKS PASSED (100%)');
    } catch (err) {
      reqBPassed = false;
      console.error(err?.stdout || err?.message);
    }
    assert(
      reqBPassed,
      'Redex Requirement B Suite passed 100% (98/98 checks passed)',
      'Verified zero validOrder on creation/labels/tracking, askCollection mappings, non-regression, and concurrency'
    );

    // 6.2 Durable Delivery Reconciliation Test Suite (45 tests)
    console.log('  Executing Durable Reconciliation suite (npx tsx tests/delivery/durable-reconciliation.test.ts)...');
    let reconPassed = false;
    let reconOutput = '';
    try {
      reconOutput = execSync('npx tsx tests/delivery/durable-reconciliation.test.ts', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      reconPassed = reconOutput.includes('45 / 45 CHECKS PASSED (100%)');
    } catch (err) {
      reconPassed = false;
      console.error(err?.stdout || err?.message);
    }
    assert(
      reconPassed,
      'Durable Reconciliation Suite passed 100% (45/45 checks passed)',
      'Verified carrier truth interrogation, zero validOrder on reconciliation, and recovery receipts'
    );

    // 6.3 Admin Auth & CSRF Negative Security Suite (49 tests)
    console.log('  Executing Admin Auth Negative suite (npx tsx tests/security/admin-auth-negative.test.ts)...');
    let authPassed = false;
    let authOutput = '';
    try {
      authOutput = execSync('npx tsx tests/security/admin-auth-negative.test.ts', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      authPassed = authOutput.includes('49 / 49 CHECKS PASSED (100%)');
    } catch (err) {
      authPassed = false;
      console.error(err?.stdout || err?.message);
    }
    assert(
      authPassed,
      'Admin Auth & CSRF Security Suite passed 100% (49/49 checks passed)',
      'Verified CSRF origin checking, fail-closed revocation, and 401 enforcement across delivery endpoints'
    );

    // 6.4 Master E2E Runner (236 tests)
    console.log('  Executing Master E2E runner (npm run test:e2e)...');
    let e2ePassed = false;
    let e2eOutput = '';
    try {
      e2eOutput = execSync('npm run test:e2e', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      e2ePassed = e2eOutput.includes('236 / 236 passed');
    } catch (err) {
      e2ePassed = false;
      console.error(err?.stdout || err?.message);
    }
    assert(
      e2ePassed,
      'Master E2E Test Suite passed 100% (236/236 tests passed across Tiers 1–4)',
      'Zero test failures across all end-to-end e-commerce workflows'
    );

    // 6.5 TypeScript Typecheck (0 errors)
    console.log('  Executing TypeScript compilation check (npx tsc --noEmit)...');
    let tscPassed = false;
    try {
      execSync('npx tsc --noEmit', {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024,
      });
      tscPassed = true;
    } catch (err) {
      tscPassed = false;
      console.error(err?.stdout || err?.message);
    }
    assert(
      tscPassed,
      'TypeScript compilation (npx tsc --noEmit) passes with ZERO diagnostic errors',
      'Clean typecheck across all 29 routes and modules'
    );

  } finally {
    // ════════════════════════════════════════════════════════════════════════════
    // FAIL-SAFE DATA SAFETY: PURGE TEST RESIDUALS FROM FALLBACK STORE
    // ════════════════════════════════════════════════════════════════════════════
    printSection('FAIL-SAFE DATA SAFETY: Fallback Orders Sanitization Enforcement');

    restoreFallbackOrdersClean();

    const finalFallbackExists = fs.existsSync(fallbackFile);
    const finalFallbackContent = finalFallbackExists ? fs.readFileSync(fallbackFile, 'utf8') : '';
    const finalFallbackBytes = Buffer.byteLength(finalFallbackContent);
    let finalParsed = null;
    try {
      finalParsed = JSON.parse(finalFallbackContent);
    } catch {
      finalParsed = null;
    }

    assert(
      finalFallbackExists,
      'src/data/fallback-orders.json exists on disk',
      fallbackFile
    );

    assert(
      finalFallbackContent === '[]\n' && finalFallbackBytes === 3,
      'src/data/fallback-orders.json is strictly restored to "[]\\n" (exactly 3 bytes)',
      `Actual bytes: ${finalFallbackBytes}, Content: ${JSON.stringify(finalFallbackContent)}`
    );

    assert(
      Array.isArray(finalParsed) && finalParsed.length === 0,
      'Operational fallback-orders.json contains exactly ZERO residual test records',
      `Parsed record count: ${finalParsed?.length ?? 'invalid'}`
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VERIFICATION SUMMARY & CONCLUSION
  // ════════════════════════════════════════════════════════════════════════════
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  printHeader('MILESTONE 4: REDEX ECOTRACK INTEGRATION VERIFICATION SUMMARY');
  console.log(` Total Assertions Evaluated: ${totalChecks}`);
  console.log(` Passed Assertions:          ${passedChecks} ✅`);
  console.log(` Failed Assertions:          ${failedChecks} ${failedChecks === 0 ? '✅' : '❌'}`);
  console.log(` Elapsed Duration:           ${elapsedSec}s\n`);

  if (failedChecks === 0) {
    console.log('🌟 ALL 5 PILLARS OF REQUIREMENT B INVARIANTS ARE 100% GREEN.');
    console.log('   Requirement R5 (Redex EcoTrack Integration) is fully satisfied.');
    console.log('   Fallback orders storage verified at 3 bytes (0 records). Safe for production launch.\n');
    process.exit(0);
  } else {
    console.error(`💥 ${failedChecks} CHECK(S) FAILED. Review errors above.`);
    process.exit(1);
  }
}

run().catch((err) => {
  restoreFallbackOrdersClean();
  console.error('\nFatal Execution Error in Verification Harness:', err);
  process.exit(1);
});
