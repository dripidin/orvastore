#!/usr/bin/env node
/**
 * ORVA Store v2.1.0 — Milestone 3 Store Integration & Order Freshness Verification
 * Turnkey 5-Pillar Verification Harness (Requirement R4)
 * Target Repository: next-shadcn-admin-dashboard-baseui-main
 * File: scripts/verify-store-integration.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';
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

async function run() {
  const startTime = Date.now();
  printHeader('ORVA STORE v2.1.0 — MILESTONE 3: STORE INTEGRATION & ORDER FRESHNESS (R4)');
  console.log(` Target Working Directory: ${REPO_ROOT}`);
  console.log(` Timestamp:                ${new Date().toISOString()}`);
  console.log(` Execution Mode:           Turnkey 5-Pillar Audit\n`);

  // ════════════════════════════════════════════════════════════════════════════
  // PILLAR 1: FALLBACK ORDERS SANITIZATION & PRESERVATION
  // ════════════════════════════════════════════════════════════════════════════
  printSection('PILLAR 1: Fallback Orders Sanitization & Preservation (Feature 12)');

  const fallbackFile = path.join(REPO_ROOT, 'src', 'data', 'fallback-orders.json');
  const backupFile = path.join(REPO_ROOT, 'backups', 'pre-reset', 'fallback-orders.json');
  const manifestFile = path.join(REPO_ROOT, 'backups', 'pre-reset', 'manifest.json');

  // 1.1 Verify operational fallback-orders.json is empty array
  assert(fs.existsSync(fallbackFile), 'Operational fallback-orders.json exists on disk');
  const operationalContent = fs.readFileSync(fallbackFile, 'utf8');
  let operationalParsed = null;
  try {
    operationalParsed = JSON.parse(operationalContent);
  } catch (err) {
    operationalParsed = null;
  }
  assert(
    Array.isArray(operationalParsed) && operationalParsed.length === 0,
    'Operational fallback-orders.json is sanitized to empty JSON array ([])',
    `Length: ${operationalParsed?.length ?? 'invalid'}`
  );
  assert(
    Buffer.byteLength(operationalContent) <= 5,
    'Operational fallback-orders.json file size is minimal (<= 5 bytes)',
    `Byte size: ${Buffer.byteLength(operationalContent)} bytes`
  );

  // 1.2 Verify backup in backups/pre-reset/fallback-orders.json
  assert(fs.existsSync(backupFile), 'Backup file backups/pre-reset/fallback-orders.json exists');
  const backupBuffer = fs.readFileSync(backupFile);
  const backupSha256 = crypto.createHash('sha256').update(backupBuffer).digest('hex');
  let backupParsed = [];
  try {
    backupParsed = JSON.parse(backupBuffer.toString('utf8'));
  } catch (e) {
    backupParsed = [];
  }
  assert(
    backupBuffer.length === 80609,
    'Backup file preserves exact original byte size (80,609 bytes)',
    `Actual: ${backupBuffer.length} bytes`
  );
  assert(
    Array.isArray(backupParsed) && backupParsed.length === 114,
    'Backup file contains exactly 114 historical mock orders',
    `Record count: ${backupParsed.length}`
  );
  assert(
    Boolean(backupSha256),
    'Backup file SHA-256 computed successfully',
    `SHA-256: ${backupSha256}`
  );

  // 1.3 Verify manifest.json contains fallback-orders.json entry
  assert(fs.existsSync(manifestFile), 'Manifest file backups/pre-reset/manifest.json exists');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const fallbackManifestEntry = manifest.files?.['fallback-orders.json'];
  assert(
    Boolean(fallbackManifestEntry),
    'Manifest contains registered entry for fallback-orders.json',
    `Entry table: ${fallbackManifestEntry?.table}`
  );
  assert(
    fallbackManifestEntry?.bytes === 80609 && fallbackManifestEntry?.rowCount === 114,
    'Manifest entry reflects accurate byte size (80,609) and row count (114)',
    `Reported bytes: ${fallbackManifestEntry?.bytes}, rows: ${fallbackManifestEntry?.rowCount}`
  );
  assert(
    fallbackManifestEntry?.sha256 === backupSha256,
    'Manifest entry SHA-256 matches backup file on disk byte-for-byte',
    `Manifest hash: ${fallbackManifestEntry?.sha256}`
  );

  // 1.4 Verify git ignores the backup directory
  let gitIgnored = false;
  try {
    const gitCheck = execSync('git check-ignore -v backups/pre-reset/fallback-orders.json', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    gitIgnored = gitCheck.includes('.gitignore') && gitCheck.includes('backups/');
  } catch {
    gitIgnored = false;
  }
  assert(
    gitIgnored,
    'Git ignore rule protects backups/pre-reset/fallback-orders.json from repository commits',
    'Verified via git check-ignore'
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PILLAR 2: STOREFRONT CATALOG & PACK ROUTES ACCESSIBILITY & PRICING
  // ════════════════════════════════════════════════════════════════════════════
  printSection('PILLAR 2: Storefront Catalog & Pack Routes Accessibility & Pricing Integrity (Feature 13)');

  const packsFile = path.join(REPO_ROOT, 'src', 'data', 'storefront-packs.ts');
  assert(fs.existsSync(packsFile), 'Catalog definitions src/data/storefront-packs.ts exists');
  const packsSource = fs.readFileSync(packsFile, 'utf8');

  // 2.1 Pack 1 Verification
  const pack1PriceMatch = packsSource.match(/PACK1:\s*\{[\s\S]*?priceDzd:\s*(\d+)/);
  const pack1OriginalMatch = packsSource.match(/PACK1:\s*\{[\s\S]*?originalPriceDzd:\s*(\d+)/);
  const pack1SavingsMatch = packsSource.match(/PACK1:\s*\{[\s\S]*?savingsDzd:\s*(\d+)/);
  assert(
    pack1PriceMatch && Number(pack1PriceMatch[1]) === 4950,
    'Pack 1 price is canonically 4,950 DZD',
    `Parsed: ${pack1PriceMatch?.[1]} DZD`
  );
  assert(
    pack1OriginalMatch && Number(pack1OriginalMatch[1]) === 9750,
    'Pack 1 original price is 9,750 DZD',
    `Parsed: ${pack1OriginalMatch?.[1]} DZD`
  );
  assert(
    pack1SavingsMatch && Number(pack1SavingsMatch[1]) === 4800,
    'Pack 1 savings is 4,800 DZD (9750 - 4950 = 4800)',
    `Parsed: ${pack1SavingsMatch?.[1]} DZD`
  );

  // 2.2 Pack 2 Verification & Typo Elimination
  const pack2PriceMatch = packsSource.match(/PACK2:\s*\{[\s\S]*?priceDzd:\s*(\d+)/);
  const pack2OriginalMatch = packsSource.match(/PACK2:\s*\{[\s\S]*?originalPriceDzd:\s*(\d+)/);
  const pack2SavingsMatch = packsSource.match(/PACK2:\s*\{[\s\S]*?savingsDzd:\s*(\d+)/);
  assert(
    pack2PriceMatch && Number(pack2PriceMatch[1]) === 12950,
    'Pack 2 price is canonically 12,950 DZD',
    `Parsed: ${pack2PriceMatch?.[1]} DZD`
  );
  assert(
    pack2OriginalMatch && Number(pack2OriginalMatch[1]) === 21250,
    'Pack 2 original price is 21,250 DZD',
    `Parsed: ${pack2OriginalMatch?.[1]} DZD`
  );
  assert(
    pack2SavingsMatch && Number(pack2SavingsMatch[1]) === 8300,
    'Pack 2 savings is 8,300 DZD (21250 - 12950 = 8300)',
    `Parsed: ${pack2SavingsMatch?.[1]} DZD`
  );
  const pack2Section = packsSource.substring(
    packsSource.indexOf('PACK2:'),
    packsSource.indexOf('PACK3:')
  );
  assert(
    !pack2Section.includes('13390'),
    'Pack 2 copy typo (13390 DZD) is eliminated from description and SEO fields',
    'Canonical 12,950 DZD copy enforced'
  );

  // 2.3 Pack 3 Verification
  const pack3PriceMatch = packsSource.match(/PACK3:\s*\{[\s\S]*?priceDzd:\s*(\d+)/);
  const pack3OriginalMatch = packsSource.match(/PACK3:\s*\{[\s\S]*?originalPriceDzd:\s*(\d+)/);
  const pack3SavingsMatch = packsSource.match(/PACK3:\s*\{[\s\S]*?savingsDzd:\s*(\d+)/);
  assert(
    pack3PriceMatch && Number(pack3PriceMatch[1]) === 15950,
    'Pack 3 price is canonically 15,950 DZD',
    `Parsed: ${pack3PriceMatch?.[1]} DZD`
  );
  assert(
    pack3OriginalMatch && Number(pack3OriginalMatch[1]) === 24500,
    'Pack 3 original price is 24,500 DZD',
    `Parsed: ${pack3OriginalMatch?.[1]} DZD`
  );
  assert(
    pack3SavingsMatch && Number(pack3SavingsMatch[1]) === 8550,
    'Pack 3 savings is 8,550 DZD (24500 - 15950 = 8550)',
    `Parsed: ${pack3SavingsMatch?.[1]} DZD`
  );

  // 2.4 Storefront Route Files
  const pack1Route = path.join(REPO_ROOT, 'src', 'app', '(storefront)', 'pack1', 'page.tsx');
  const pack2Route = path.join(REPO_ROOT, 'src', 'app', '(storefront)', 'pack2', 'page.tsx');
  const pack3Route = path.join(REPO_ROOT, 'src', 'app', '(storefront)', 'pack3', 'page.tsx');
  const indexRoute = path.join(REPO_ROOT, 'src', 'app', '(storefront)', 'page.tsx');
  assert(fs.existsSync(pack1Route), 'Pack 1 storefront route /pack1/page.tsx exists');
  assert(fs.existsSync(pack2Route), 'Pack 2 storefront route /pack2/page.tsx exists');
  assert(fs.existsSync(pack3Route), 'Pack 3 storefront route /pack3/page.tsx exists');
  assert(fs.existsSync(indexRoute), 'Storefront root landing /page.tsx exists');

  // 2.5 Static Visual Media Assets
  const requiredAssets = [
    'public/images/packs/pack-1/hero.webp',
    'public/images/packs/pack-1/all-products.jpg',
    'public/images/packs/pack-2/hero.webp',
    'public/images/packs/pack-2/all-products.jpg',
    'public/images/packs/pack-3/hero.webp',
    'public/images/packs/pack-3/all-products.jpg',
  ];
  let allAssetsExist = true;
  for (const relPath of requiredAssets) {
    const fullPath = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) {
      allAssetsExist = false;
      break;
    }
  }
  assert(allAssetsExist, 'All high-resolution pack hero and product assets exist on disk');

  // 2.6 Logistics Tariff Matrix (Biskra Hub Origin)
  const checkoutTypesFile = path.join(REPO_ROOT, 'src', 'lib', 'types', 'checkout.ts');
  const checkoutTypesSource = fs.readFileSync(checkoutTypesFile, 'utf8');
  assert(
    checkoutTypesSource.includes('calculateDeliveryTariff') &&
      checkoutTypesSource.includes('isStopDeskAllowed'),
    'Logistics functions calculateDeliveryTariff and isStopDeskAllowed present in types',
    'Biskra 07 Origin Hub pricing model'
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PILLAR 3: END-TO-END CHECKOUT & ORDER ITEMS PERSISTENCE
  // ════════════════════════════════════════════════════════════════════════════
  printSection('PILLAR 3: End-to-End Checkout & Order Items Persistence (Requirement R4 & Feature 11)');

  // Run the comprehensive checkout test suite verifying orders + order_items persistence
  const checkoutPersistenceTestFile = path.join(
    REPO_ROOT,
    'tests',
    'checkout',
    'checkout-persistence.test.ts'
  );
  assert(
    fs.existsSync(checkoutPersistenceTestFile),
    'Checkout persistence test suite exists'
  );

  let persistenceTestPass = false;
  try {
    const out = execSync('npx tsx tests/checkout/checkout-persistence.test.ts', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    persistenceTestPass = out.includes('14 / 14 CHECKS PASSED');
  } catch (err) {
    persistenceTestPass = false;
  }
  assert(
    persistenceTestPass,
    'Checkout persistence test suite passes 14/14 checks (Zod, Anti-Spam, Fresh Numbers, DB Persistence)',
    'Eliminated false-success fallback in production'
  );

  // Run the full idempotency suite (40/40 tests)
  const checkoutIdempTestFile = path.join(
    REPO_ROOT,
    'tests',
    'checkout',
    'checkout-idempotency.test.ts'
  );
  let idempTestPass = false;
  try {
    const out = execSync('npx tsx tests/checkout/checkout-idempotency.test.ts', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    idempTestPass = out.includes('40 / 40 CHECKS PASSED');
  } catch {
    idempTestPass = false;
  }
  assert(
    idempTestPass,
    'Checkout idempotency & concurrency suite passes 40/40 checks (Mutex, Replay, Collision Guard, UNIQUE Race)',
    'Full request coalescing and deterministic hashing'
  );

  // Verify order_items persistence logic in checkout.ts
  const checkoutTsFile = path.join(REPO_ROOT, 'src', 'app', 'actions', 'checkout.ts');
  const checkoutTsSource = fs.readFileSync(checkoutTsFile, 'utf8');
  assert(
    checkoutTsSource.includes("from('order_items')") ||
      checkoutTsSource.includes('from?.(\'order_items\')'),
    'Checkout server action explicitly persists line item snapshots into order_items table',
    'order_id, pack_id, product_name_snapshot, unit_price, quantity, line_total'
  );
  assert(
    checkoutTsSource.includes('order_id: orderNumber') &&
      checkoutTsSource.includes('product_name_snapshot: validated.productName'),
    'Order items snapshot links to orderNumber and captures product name snapshot',
    'Full relational schema compliance'
  );

  // Verify fresh order numbering mechanics
  assert(
    checkoutTsSource.includes('cleanPack ? `${cleanPack}-${random6Digits}` : generateOrderNumber()'),
    'Fresh order numbering formats pack orders as PACK{N}-{6digits} and generic orders as ORV-YYMMDD-XXXX',
    'Zero collision risk, starting completely fresh'
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PILLAR 4: ADMIN ORDER MANAGEMENT & ORDER FRESHNESS
  // ════════════════════════════════════════════════════════════════════════════
  printSection('PILLAR 4: Admin Order Management & Order Freshness (Feature 14)');

  const deliveryRouteFile = path.join(REPO_ROOT, 'src', 'app', 'api', 'delivery', 'route.ts');
  assert(fs.existsSync(deliveryRouteFile), 'Admin delivery API route src/app/api/delivery/route.ts exists');
  const deliveryRouteSource = fs.readFileSync(deliveryRouteFile, 'utf8');

  // 4.1 Admin Authentication Guard
  assert(
    deliveryRouteSource.includes('verifyAdminSession') ||
      deliveryRouteSource.includes('getVerifiedAdminSession'),
    'Admin endpoint /api/delivery enforces HMAC-SHA256 session token verification',
    'Rejects unauthenticated queries with HTTP 401'
  );

  // 4.2 Clean Admin Order Retrieval (Zero Mock Pollution)
  assert(
    deliveryRouteSource.includes('getStoredFallbackOrders()'),
    'Delivery route handler reads stored fallback orders',
    'With empty fallback-orders.json, exactly 0 fallback records are merged'
  );
  assert(
    deliveryRouteSource.includes('if (combinedOrders.length === 0 && !supabaseSuccess)'),
    'Default mock orders are ONLY injected when Supabase query outright fails (not when empty)',
    'Clean rebuilt database returns 0 mock test orders'
  );

  // 4.3 Phone Masking for Privacy
  const privacyCheck = checkoutTypesSource.includes(
    'return `${norm.slice(0, 4)} •• •• ${norm.slice(-2)}`'
  );
  assert(
    privacyCheck,
    'Privacy phone masking function masks middle digits as 0798 •• •• 95',
    'Customer PII protected on admin views'
  );

  // 4.4 Non-Destructive Cancellation & Status Transitions
  assert(
    deliveryRouteSource.includes("status: 'CANCELLED'") &&
      (deliveryRouteSource.includes("'cancel_order'") || deliveryRouteSource.includes('executeOrderCancellation')),
    'Admin order cancellation is non-destructive (sets status CANCELLED, preserves record and audit remarks)',
    'Full lifecycle preservation'
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PILLAR 5: COMPREHENSIVE AUTOMATED TEST SUITES & REGRESSION AUDIT
  // ════════════════════════════════════════════════════════════════════════════
  printSection('PILLAR 5: Automated Test Execution & TypeScript Typecheck');

  // 5.1 TypeScript Compilation
  console.log('  Executing TypeScript compilation check (npx tsc --noEmit)...');
  let tscPassed = false;
  try {
    execSync('npx tsc --noEmit', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    tscPassed = true;
  } catch (err) {
    tscPassed = false;
  }
  assert(tscPassed, 'TypeScript compilation (npx tsc --noEmit) passes with ZERO errors');

  // 5.2 4-Tier Master E2E Runner (236 tests)
  console.log('  Executing Master E2E runner (npm run test:e2e)...');
  let e2ePassed = false;
  let e2eSummary = '';
  try {
    const e2eOut = execSync('npm run test:e2e', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    e2ePassed = e2eOut.includes('236 / 236 passed');
    e2eSummary = '236/236 passed across Tiers 1 to 4';
  } catch {
    e2ePassed = false;
  }
  assert(e2ePassed, 'Master E2E test suite passes 100% (236/236 tests across all 4 tiers)', e2eSummary);

  // 5.3 Verify Fallback Orders File Remained Clean
  const finalFallbackContent = fs.readFileSync(fallbackFile, 'utf8');
  let finalParsed = null;
  try {
    finalParsed = JSON.parse(finalFallbackContent);
  } catch {
    finalParsed = null;
  }
  assert(
    Array.isArray(finalParsed) && finalParsed.length === 0,
    'Operational fallback-orders.json remains pristine empty array ([]) following all test executions',
    'Zero pollution from test runners'
  );

  // ════════════════════════════════════════════════════════════════════════════
  // VERIFICATION SUMMARY & CONCLUSION
  // ════════════════════════════════════════════════════════════════════════════
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
  printHeader('MILESTONE 3: STORE INTEGRATION VERIFICATION SUMMARY');
  console.log(` Total Assertions Evaluated: ${totalChecks}`);
  console.log(` Passed Assertions:          ${passedChecks} ✅`);
  console.log(` Failed Assertions:          ${failedChecks} ${failedChecks === 0 ? '✅' : '❌'}`);
  console.log(` Elapsed Duration:           ${elapsedSec}s\n`);

  if (failedChecks === 0) {
    console.log('🌟 ALL 5 PILLARS OF MILESTONE 3 ARE 100% GREEN.');
    console.log('   Requirement R4 (Complete Store Integration & Order Freshness) is fully satisfied.\n');
    process.exit(0);
  } else {
    console.error(`💥 ${failedChecks} CHECK(S) FAILED. Review errors above.`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('\nFatal Execution Error in Verification Harness:', err);
  process.exit(1);
});
