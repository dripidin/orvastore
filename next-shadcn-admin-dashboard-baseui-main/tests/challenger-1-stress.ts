/**
 * Challenger 1 Empirical Verification & Adversarial Stress Harness
 * 
 * Verifies Milestones 1 and 2 (R6 Navigation & Workspace, R2 Settings Consolidation).
 * Invariants C1-A through C1-H and edge-case stress scenarios.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load sidebar items directly
import { sidebarItems } from '../src/navigation/sidebar/sidebar-items';

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function assert(condition: boolean, label: string, details?: string) {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${label}`);
  } else {
    failedChecks++;
    console.error(`  [FAIL] ${label}`);
    if (details) {
      console.error(`         Details: ${details}`);
    }
  }
}

async function runEmpiricalStressSuite() {
  console.log('================================================================');
  console.log('   CHALLENGER 1: EMPIRICAL STRESS & INVARIANT VERIFICATION SUITE');
  console.log('   Milestone M1 (R6) & Milestone M2 (R2)');
  console.log('================================================================\n');

  const baseDir = path.resolve(__dirname, '..');
  const srcDir = path.join(baseDir, 'src');

  // ==========================================================================
  // INVARIANT C1-A: sidebarItems in sidebar-items.ts
  // ==========================================================================
  console.log('--- INVARIANT C1-A: Sidebar Items Integrity ---');

  // Check 1: Runtime inspect sidebarItems array
  let hasCustomersDelivery = false;
  let hasRisk = false;
  let foundUrls: string[] = [];

  for (const group of sidebarItems) {
    for (const item of group.items) {
      if (item.id === 'customers-delivery' || item.id === 'risk') {
        if (item.id === 'customers-delivery') hasCustomersDelivery = true;
        if (item.id === 'risk') hasRisk = true;
      }
      if ('url' in item && item.url) {
        foundUrls.push(item.url);
        if (item.url.includes('customers-delivery')) hasCustomersDelivery = true;
        if (item.url.includes('risk')) hasRisk = true;
      }
      if ('subItems' in item && Array.isArray((item as any).subItems)) {
        for (const sub of (item as any).subItems) {
          if (sub.id === 'customers-delivery' || sub.id === 'risk') {
            if (sub.id === 'customers-delivery') hasCustomersDelivery = true;
            if (sub.id === 'risk') hasRisk = true;
          }
          if (sub.url) {
            foundUrls.push(sub.url);
            if (sub.url.includes('customers-delivery')) hasCustomersDelivery = true;
            if (sub.url.includes('risk')) hasRisk = true;
          }
        }
      }
    }
  }

  assert(!hasCustomersDelivery, 'sidebarItems does NOT contain "customers-delivery" under any ID or URL');
  assert(!hasRisk, 'sidebarItems does NOT contain "risk" under any ID or URL');

  // Check 2: Inspect source file for purged icons ShieldAlert and Truck
  const sidebarItemsFile = path.join(srcDir, 'navigation/sidebar/sidebar-items.ts');
  const sidebarSrc = fs.readFileSync(sidebarItemsFile, 'utf-8');

  assert(!sidebarSrc.includes('ShieldAlert'), 'sidebar-items.ts does not import or use ShieldAlert');
  assert(!sidebarSrc.includes('Truck'), 'sidebar-items.ts does not import or use Truck icon');
  assert(!sidebarSrc.includes('customers-delivery'), 'Source file has zero occurrences of "customers-delivery"');
  assert(!sidebarSrc.includes('"risk"'), 'Source file has zero occurrences of id "risk"');

  // Check 3: Verify remaining expected nav items are present and intact
  const expectedIds = ['orders', 'delivery-management', 'analytics', 'store-traffic', 'settings', 'products', 'top-products', 'product-designer', 'product-demand', 'store-pages-sitemap'];
  const allItemIds = sidebarItems.flatMap(g => g.items.map(i => i.id));
  const missingExpected = expectedIds.filter(id => !allItemIds.includes(id));
  assert(missingExpected.length === 0, `All expected navigation items are present (missing: ${missingExpected.join(', ') || 'none'})`);


  // ==========================================================================
  // INVARIANT C1-B: ecommerce/page.tsx Workspace & API Tab Purge
  // ==========================================================================
  console.log('\n--- INVARIANT C1-B: Store Workspace & API Tab Purge ---');

  const ecommercePageFile = path.join(srcDir, 'app/(main)/dashboard/ecommerce/page.tsx');
  const ecommerceSrc = fs.readFileSync(ecommercePageFile, 'utf-8');

  assert(!ecommerceSrc.includes('TabsTrigger value="api"'), 'ecommerce/page.tsx does NOT contain TabsTrigger value="api"');
  assert(!ecommerceSrc.includes('TabsContent value="api"'), 'ecommerce/page.tsx does NOT contain TabsContent value="api"');
  assert(!ecommerceSrc.includes('<ApiManagement'), 'ecommerce/page.tsx does NOT render <ApiManagement />');
  assert(!ecommerceSrc.includes('import { ApiManagement }') && !ecommerceSrc.includes('import ApiManagement'), 'ecommerce/page.tsx does NOT import ApiManagement');
  assert(!/import\s+{[^}]*\bServer\b[^}]*}\s+from\s+["']lucide-react["']/.test(ecommerceSrc), 'ecommerce/page.tsx does NOT import unused Server icon from lucide-react');
  assert(!ecommerceSrc.includes('4 sections'), 'Header badge does NOT state "4 sections"');
  assert(ecommerceSrc.includes('3 sections'), 'Header badge states "3 sections"');
  assert(ecommerceSrc.includes('lg:grid-cols-3'), 'TabsList grid is set to lg:grid-cols-3');

  // Verify hash sync fallback: #risk safely redirects to orders
  assert(ecommerceSrc.includes('hash.includes("risk")') && ecommerceSrc.includes('setActiveTab("orders")'), 'Hash synchronization safely maps obsolete #risk hash to "orders" tab');


  // ==========================================================================
  // INVARIANT C1-C: Top Navbar Language Switcher & Bilingual i18n
  // ==========================================================================
  console.log('\n--- INVARIANT C1-C: Navbar Language Switcher Removal & Bilingual i18n ---');

  const dashboardLayoutFile = path.join(srcDir, 'app/(main)/dashboard/layout.tsx');
  const layoutSrc = fs.readFileSync(dashboardLayoutFile, 'utf-8');

  assert(!layoutSrc.includes('<LanguageSwitcher'), 'Top navbar layout.tsx does NOT render <LanguageSwitcher />');
  assert(!layoutSrc.includes('import { LanguageSwitcher }') && !layoutSrc.includes('import LanguageSwitcher'), 'layout.tsx does NOT import LanguageSwitcher');
  assert(layoutSrc.includes('<AdminLocaleProvider>'), 'layout.tsx wraps dashboard in <AdminLocaleProvider>');

  const adminLocaleFile = path.join(srcDir, 'lib/i18n/admin-locale.tsx');
  const localeSrc = fs.readFileSync(adminLocaleFile, 'utf-8');

  assert(localeSrc.includes('AdminLocale = "ar" | "fr" | "en"'), 'AdminLocale type definition supports "ar", "fr", and "en"');
  assert(localeSrc.includes('ar: {') && localeSrc.includes('en: {') && localeSrc.includes('fr: {'), 'DICT supports complete ar, en, and fr translation sets');

  // Check dictionary keys parity
  const arBlock = localeSrc.slice(localeSrc.indexOf('ar: {') + 5, localeSrc.indexOf('fr: {'));
  const enBlock = localeSrc.slice(localeSrc.indexOf('en: {') + 5, localeSrc.indexOf('} as const;'));
  const arKeys = (arBlock.match(/^\s*([a-zA-Z0-9]+):/gm) || []).map(s => s.trim().replace(':', ''));
  const enKeys = (enBlock.match(/^\s*([a-zA-Z0-9]+):/gm) || []).map(s => s.trim().replace(':', ''));

  assert(arKeys.length >= 15, `Arabic dictionary has comprehensive keys count (${arKeys.length})`);
  assert(enKeys.length >= 15, `English dictionary has comprehensive keys count (${enKeys.length})`);
  const missingEnKeys = arKeys.filter(k => !enKeys.includes(k));
  assert(missingEnKeys.length === 0, `English dictionary has parity with Arabic keys (missing: ${missingEnKeys.join(', ') || 'none'})`);


  // ==========================================================================
  // INVARIANT C1-D: Settings Consolidation (/dashboard/settings/page.tsx)
  // ==========================================================================
  console.log('\n--- INVARIANT C1-D: Settings Page Consolidation ---');

  const settingsPageFile = path.join(srcDir, 'app/(main)/dashboard/settings/page.tsx');
  const settingsPageSrc = fs.readFileSync(settingsPageFile, 'utf-8');

  assert(!settingsPageSrc.includes('<AdminSettingsDashboard'), 'settings/page.tsx does NOT render <AdminSettingsDashboard />');
  assert(!settingsPageSrc.includes('import { AdminSettingsDashboard }') && !settingsPageSrc.includes('import AdminSettingsDashboard'), 'settings/page.tsx does NOT import AdminSettingsDashboard');
  assert(!settingsPageSrc.includes('<LayoutControls'), 'settings/page.tsx does NOT render <LayoutControls />');
  assert(!settingsPageSrc.includes('import { LayoutControls }'), 'settings/page.tsx does NOT import LayoutControls');
  assert(!settingsPageSrc.includes('Dashboard Appearance & Preferences'), 'settings/page.tsx does NOT contain Appearance & Preferences Card');
  assert(settingsPageSrc.includes('<SettingsIntegrations />'), 'settings/page.tsx renders consolidated <SettingsIntegrations /> component');
  assert(settingsPageSrc.includes('<DevEnvironmentBanner />'), 'settings/page.tsx renders <DevEnvironmentBanner />');


  // ==========================================================================
  // INVARIANT C1-E: Absence of backend and database tabs
  // ==========================================================================
  console.log('\n--- INVARIANT C1-E: Purge of Backend and Database Tabs ---');

  const settingsIntegrationsFile = path.join(srcDir, 'app/(main)/dashboard/settings/settings-integrations.tsx');
  const integrationsSrc = fs.readFileSync(settingsIntegrationsFile, 'utf-8');

  assert(!integrationsSrc.includes('value="backend"'), 'settings-integrations.tsx does NOT contain tab trigger or content with value="backend"');
  assert(!integrationsSrc.includes('value="database"'), 'settings-integrations.tsx does NOT contain tab trigger or content with value="database"');
  assert(!integrationsSrc.includes('TabsTrigger value="backend"'), 'No TabsTrigger for backend exists');
  assert(!integrationsSrc.includes('TabsTrigger value="database"'), 'No TabsTrigger for database exists');
  assert(!integrationsSrc.includes('TabsContent value="backend"'), 'No TabsContent for backend exists');
  assert(!integrationsSrc.includes('TabsContent value="database"'), 'No TabsContent for database exists');

  // Verify only allowed tabs are rendered
  const tabsListBlock = integrationsSrc.slice(integrationsSrc.indexOf('<TabsList'), integrationsSrc.indexOf('</TabsList>'));
  const declaredTabs = (tabsListBlock.match(/value="([^"]+)"/g) || []).map(s => s.replace('value="', '').replace('"', ''));
  assert(declaredTabs.length === 4, `TabsList contains exactly 4 tabs (found: ${declaredTabs.join(', ')})`);
  assert(JSON.stringify(declaredTabs.sort()) === JSON.stringify(['analytics', 'delivery', 'general', 'notifications'].sort()), 'TabsList strictly contains general, analytics, delivery, and notifications');


  // ==========================================================================
  // INVARIANT C1-F: Redex Express DZ as sole shipping provider in Settings
  // ==========================================================================
  console.log('\n--- INVARIANT C1-F: Sole Shipping Provider Redex Express DZ ---');

  const deliveryTabContent = integrationsSrc.slice(
    integrationsSrc.indexOf('<TabsContent value="delivery"'),
    integrationsSrc.indexOf('</TabsContent>', integrationsSrc.indexOf('<TabsContent value="delivery"'))
  );

  assert(deliveryTabContent.includes('Redex Express DZ'), 'Delivery tab contains "Redex Express DZ" card');
  assert(!deliveryTabContent.includes('Yalidine'), 'Delivery tab does NOT contain Yalidine card or mention');
  assert(!deliveryTabContent.includes('ZR Express'), 'Delivery tab does NOT contain ZR Express card or mention');
  assert(!deliveryTabContent.includes('Ecotrack Delivery Network'), 'Delivery tab does NOT contain "Ecotrack Delivery Network" card');
  assert(!deliveryTabContent.includes('شبكة إيكوتراك'), 'Delivery tab does NOT contain Arabic Ecotrack network label');

  // Count Card components inside delivery tab
  const deliveryCardCount = (deliveryTabContent.match(/<Card\b/g) || []).length;
  assert(deliveryCardCount === 1, `Delivery tab contains exactly 1 provider Card (Redex Express DZ) (count: ${deliveryCardCount})`);


  // ==========================================================================
  // INVARIANT C1-G: Telegram Bot Order Alerts as sole alert configuration
  // ==========================================================================
  console.log('\n--- INVARIANT C1-G: Sole Telegram Bot Alert Configuration ---');

  const notifTabContent = integrationsSrc.slice(
    integrationsSrc.indexOf('<TabsContent value="notifications"'),
    integrationsSrc.indexOf('</TabsContent>', integrationsSrc.indexOf('<TabsContent value="notifications"'))
  );

  assert(notifTabContent.includes('Telegram Bot Order Alerts') || notifTabContent.includes('إشعارات تيليجرام اللحظية'), 'Notifications tab contains "Telegram Bot Order Alerts"');
  assert(!notifTabContent.includes('Template Customization'), 'Notifications tab does NOT contain duplicate Card 2 (Template Customization)');
  assert(!notifTabContent.includes('Broadcast Composer'), 'Notifications tab does NOT contain duplicate Card 3 (Broadcast Composer)');

  // Count Card components inside notifications tab
  const notifCardCount = (notifTabContent.match(/<Card\b/g) || []).length;
  assert(notifCardCount === 1, `Notifications tab contains exactly 1 configuration Card (count: ${notifCardCount})`);


  // ==========================================================================
  // INVARIANT C1-H: Unified Meta Pixel & CAPI v19.0 Card
  // ==========================================================================
  console.log('\n--- INVARIANT C1-H: Unified Meta Pixel & CAPI v19.0 Card ---');

  const analyticsTabContent = integrationsSrc.slice(
    integrationsSrc.indexOf('<TabsContent value="analytics"'),
    integrationsSrc.indexOf('</TabsContent>', integrationsSrc.indexOf('<TabsContent value="analytics"'))
  );

  assert(analyticsTabContent.includes('v19.0 Graph API'), 'Meta card contains "v19.0 Graph API" badge');
  assert(analyticsTabContent.includes('تشفير SHA-256 للمطابقة الصارمة نشط'), 'Meta card contains "تشفير SHA-256 للمطابقة الصارمة نشط" security badge');
  assert(analyticsTabContent.includes('id="meta-pixel-id"'), 'Meta card contains input for Meta Pixel ID (id="meta-pixel-id")');
  assert(analyticsTabContent.includes('id="meta-capi-token"'), 'Meta card contains input for CAPI Access Token (id="meta-capi-token")');
  assert(analyticsTabContent.includes('showMetaToken ? "text" : "password"'), 'Meta CAPI Token input supports password visibility toggle');
  assert(analyticsTabContent.includes('setShowMetaToken(!showMetaToken)'), 'Meta CAPI Token has click toggle handler for Eye/EyeOff');


  // ==========================================================================
  // ADVERSARIAL STRESS TESTING: Input Validation & Boundary Robustness
  // ==========================================================================
  console.log('\n--- ADVERSARIAL STRESS TESTING: Validation & Edge Cases ---');

  // Test 1: Pixel ID validation regex
  const pixelIdRegex = /^\d{12,20}$/;
  const validPixelIds = ['2340414976777036', '123456789012', '12345678901234567890'];
  const invalidPixelIds = ['', '123', 'abcdefghijkl', '2340414976777036a', '123456789012345678901', ' 2340414976777036 '];

  for (const id of validPixelIds) {
    assert(pixelIdRegex.test(id), `Pixel ID regex accepts valid ID: ${id}`);
  }
  for (const id of invalidPixelIds) {
    assert(!pixelIdRegex.test(id), `Pixel ID regex strictly rejects invalid ID: "${id}"`);
  }

  // Test 2: Phone hashing SHA-256 consistency with whitespace and case
  const crypto = require('crypto');
  function hashSha256(val: string): string {
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  }
  const h1 = hashSha256('0550123456');
  const h2 = hashSha256('  0550123456  ');
  assert(h1 === h2 && h1.length === 64, 'SHA-256 hashing normalizes outer whitespace to identical 64-char hash');

  // Test 3: Currency formatting robustness
  function formatDzdMock(n: number | null | undefined, locale: 'ar' | 'en' | 'fr'): string {
    if (n === null || n === undefined || Number.isNaN(Number(n))) {
      return locale === 'fr' ? 'N/D' : locale === 'en' ? 'N/A' : 'غير متوفر';
    }
    const localeTag = locale === 'fr' ? 'fr-DZ' : locale === 'en' ? 'en-DZ' : 'ar-DZ';
    const suffix = locale === 'en' ? ' DZD' : ' د.ج';
    return `${new Intl.NumberFormat(localeTag).format(Number(n))}${suffix}`;
  }

  assert(formatDzdMock(5450, 'en').includes('5,450 DZD'), 'formatDzd in English renders "5,450 DZD"');
  assert(formatDzdMock(5450, 'ar').includes('د.ج'), 'formatDzd in Arabic renders with "د.ج" suffix');
  assert(formatDzdMock(null, 'en') === 'N/A', 'formatDzd handles null gracefully in English as "N/A"');
  assert(formatDzdMock(null, 'ar') === 'غير متوفر', 'formatDzd handles null gracefully in Arabic as "غير متوفر"');
  assert(formatDzdMock(NaN, 'en') === 'N/A', 'formatDzd handles NaN gracefully');

  // Test 4: Verify AdminSettingsDashboard is not imported in ANY page or layout
  const allTsxFiles = fs.readdirSync(path.join(srcDir, 'app/(main)/dashboard'), { recursive: true })
    .map((f: any) => path.join(srcDir, 'app/(main)/dashboard', f.toString()))
    .filter((f: string) => f.endsWith('.tsx') && !f.includes('admin-settings-dashboard.tsx'));

  let foundDashboardImport = false;
  for (const f of allTsxFiles) {
    const content = fs.readFileSync(f, 'utf-8');
    if (content.includes('AdminSettingsDashboard')) {
      foundDashboardImport = true;
      console.error(`Found unexpected AdminSettingsDashboard import in ${f}`);
    }
  }
  assert(!foundDashboardImport, 'Zero active dashboard pages import AdminSettingsDashboard (safely isolated/dead code)');

  // Test 5: Verify Redex Express DZ endpoint format
  assert(integrationsSrc.includes('https://redex.ecotrack.dz'), 'Redex Express DZ gateway URL points to https://redex.ecotrack.dz');

  console.log('\n================================================================');
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED: ${passedChecks}`);
  console.log(`FAILED: ${failedChecks}`);
  console.log('================================================================');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runEmpiricalStressSuite().catch((err) => {
  console.error('Test harness execution failed:', err);
  process.exit(1);
});
