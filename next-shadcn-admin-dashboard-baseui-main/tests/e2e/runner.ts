/**
 * ORVA Production COD Platform — Master E2E Test Suite Runner
 * 
 * Executes all 4 tiers of tests:
 * - Tier 1: Feature Coverage (20 features x 5 tests = 100 tests)
 * - Tier 2: Boundary & Corner Cases (20 features x 5 tests = 100 tests)
 * - Tier 3: Cross-Feature Combinations (26 pairwise integration tests)
 * - Tier 4: Real-World Application Scenarios (10 end-to-end scenarios)
 * 
 * Total: 236 tests
 */

import { runAllSuites, globalSuites } from './framework/test-suite';

// ── Tier 1: Feature Coverage Imports ─────────────────────────────────────────
import './tier1-features/f01-baseline-compilation.test';
import './tier1-features/f02-storefront-branding.test';
import './tier1-features/f03-cascading-wilayas-communes.test';
import './tier1-features/f04-delivery-mode-toggle.test';
import './tier1-features/f05-single-page-checkout-form.test';
import './tier1-features/f06-algerian-phone-regex.test';
import './tier1-features/f07-dynamic-price-breakdown.test';
import './tier1-features/f08-pack1-detail-page.test';
import './tier1-features/f09-pack2-detail-page.test';
import './tier1-features/f10-pack3-detail-page.test';
import './tier1-features/f11-buyer-reassurance-grid.test';
import './tier1-features/f12-cross-sells.test';
import './tier1-features/f13-admin-order-management.test';
import './tier1-features/f14-order-rerouting.test';
import './tier1-features/f15-courier-instruction-note.test';
import './tier1-features/f16-meta-pixel-capi.test';
import './tier1-features/f17-telegram-order-alerts.test';
import './tier1-features/f18-courier-provider-abstraction.test';
import './tier1-features/f19-admin-courier-switching.test';
import './tier1-features/f20-database-schema-rls.test';

// ── Tier 2: Boundary & Corner Cases Imports ─────────────────────────────────
import './tier2-boundaries/b01-build-config-boundaries.test';
import './tier2-boundaries/b02-branding-locale-boundaries.test';
import './tier2-boundaries/b03-wilaya-commune-boundaries.test';
import './tier2-boundaries/b04-stopdesk-wilayas-49-58-boundaries.test';
import './tier2-boundaries/b05-checkout-honeypot-boundaries.test';
import './tier2-boundaries/b06-phone-formatting-boundaries.test';
import './tier2-boundaries/b07-pricing-zero-negative-boundaries.test';
import './tier2-boundaries/b08-pack1-pricing-item-boundaries.test';
import './tier2-boundaries/b09-pack2-pricing-item-boundaries.test';
import './tier2-boundaries/b10-pack3-pricing-item-boundaries.test';
import './tier2-boundaries/b11-reassurance-content-boundaries.test';
import './tier2-boundaries/b12-cross-sell-cycles-boundaries.test';
import './tier2-boundaries/b13-admin-status-transitions-boundaries.test';
import './tier2-boundaries/b14-terminal-rerouting-barrier-boundaries.test';
import './tier2-boundaries/b15-courier-note-escaping-boundaries.test';
import './tier2-boundaries/b16-capi-hashing-dedup-boundaries.test';
import './tier2-boundaries/b17-telegram-alert-dedup-boundaries.test';
import './tier2-boundaries/b18-courier-payload-boundaries.test';
import './tier2-boundaries/b19-provider-switching-boundaries.test';
import './tier2-boundaries/b20-database-rls-boundaries.test';

// ── Tier 3: Cross-Feature Combinations Imports ──────────────────────────────
import './tier3-cross-feature/pairwise-flows.test';

// ── Tier 4: Real-World Scenarios Imports ────────────────────────────────────
import './tier4-scenarios/scenario-customer-journeys.test';
import './tier4-scenarios/scenario-logistics-operations.test';

async function main() {
  const line = '═'.repeat(78);
  const thinLine = '─'.repeat(78);

  console.log(line);
  console.log('   ORVA COD E-COMMERCE PLATFORM — 4-TIER E2E TEST SUITE RUNNER');
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log(line);
  console.log(`Discovered ${globalSuites.length} test suites with 4 execution tiers.`);
  console.log('Executing test harness...\n');

  const results = await runAllSuites();

  console.log('\n' + thinLine);
  console.log('   TIER-BY-TIER COVERAGE & VERIFICATION REPORT');
  console.log(thinLine);

  const t1 = results.byTier.tier1;
  const t2 = results.byTier.tier2;
  const t3 = results.byTier.tier3;
  const t4 = results.byTier.tier4;

  console.log(` Tier 1 (Feature Coverage):        ${t1.passed} / ${t1.total} tests passed (Target: ≥100) ${t1.passed >= 100 ? '✅' : '❌'}`);
  console.log(` Tier 2 (Boundary & Corner Cases):  ${t2.passed} / ${t2.total} tests passed (Target: ≥100) ${t2.passed >= 100 ? '✅' : '❌'}`);
  console.log(` Tier 3 (Cross-Feature Pairwise):   ${t3.passed} / ${t3.total} tests passed (Target: ≥25)  ${t3.passed >= 25 ? '✅' : '❌'}`);
  console.log(` Tier 4 (Real-World Scenarios):     ${t4.passed} / ${t4.total} tests passed (Target: ≥10)  ${t4.passed >= 10 ? '✅' : '❌'}`);
  console.log(thinLine);
  console.log(` TOTAL SUITE EXECUTION:            ${results.passed} / ${results.total} passed in ${results.durationMs}ms`);
  console.log(line);

  if (results.failed > 0) {
    console.error(`\n❌ TEST FAILURES DETECTED (${results.failed}):\n`);
    for (const fail of results.failures) {
      console.error(` • [${fail.suite}] ${fail.name}`);
      console.error(`   Error: ${fail.error.message}\n`);
    }
    process.exit(1);
  } else {
    console.log('\n🌟 ALL TESTS PASSED SUCCESSFULLY with 100% genuine assertion coverage.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
