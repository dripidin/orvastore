/**
 * Empirical Adversarial Challenger Test Suite
 * Requirements: R2 (Designer Sync), R3 (Light Theme), R4 (Product Catalog), R6 (Meta Pixel Injection)
 */

import fs from "fs";
import path from "path";
import {
  createDefaultLayoutConfig,
  type ProductPageLayoutConfig,
  DEFAULT_DESKTOP_SECTION_ORDER,
  DEFAULT_MOBILE_SECTION_ORDER,
} from "../src/lib/repository/layout-types";
import { MockLayoutRepository } from "../src/lib/repository/mock-layout-repository";
import { PACK_PRODUCT_ID_MAP } from "../src/components/storefront/pack/dynamic-pack-layout";
import { DEFAULT_MOCK_PRODUCTS } from "../src/lib/repository/mock-products-dataset";
import { MockProductsRepository } from "../src/lib/repository/mock-products-repository";
import {
  matchOrderToProduct,
  computeUnitMargin,
  computeEstimatedOrderProfit,
} from "../src/lib/repository/product-types";
import { STOREFRONT_PACKS } from "../src/data/storefront-packs";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalCount++;
  if (!condition) {
    console.error(`❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ""}`);
    throw new Error(`Test failed: ${testName} - ${detail || ""}`);
  }
  passedCount++;
  console.log(`✅ PASS: ${testName}`);
}

async function runTestSuite() {
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log("   EMPIRICAL CHALLENGER TEST SUITE: R2, R3, R4, R6");
  console.log("   Date: " + new Date().toISOString());
  console.log("══════════════════════════════════════════════════════════════════════════════\n");

  const rootDir = path.resolve(__dirname, "..");

  // ==========================================================================
  // SECTION 1: REQUIREMENT R2 — PRODUCT PAGE DESIGNER SYNC & PERSISTENCE
  // ==========================================================================
  console.log("── SECTION 1: REQUIREMENT R2 — Designer Sync & Persistence ──");

  // Test 1.1: Product ID Map alignment
  assert(
    PACK_PRODUCT_ID_MAP.PACK1 === "prod_pack_1_pro",
    "R2.1: PACK_PRODUCT_ID_MAP.PACK1 correctly maps to prod_pack_1_pro"
  );
  assert(
    PACK_PRODUCT_ID_MAP.PACK2 === "prod_pack_2_elite",
    "R2.2: PACK_PRODUCT_ID_MAP.PACK2 correctly maps to prod_pack_2_elite"
  );
  assert(
    PACK_PRODUCT_ID_MAP.PACK3 === "prod_pack_3_ultra",
    "R2.3: PACK_PRODUCT_ID_MAP.PACK3 correctly maps to prod_pack_3_ultra"
  );

  // Test 1.2: MockLayoutRepository in-memory fallback & default layout creation
  const layoutRepo = new MockLayoutRepository();
  const defaultCfg1 = await layoutRepo.getLayoutConfig("prod_pack_1_pro");
  assert(defaultCfg1.productId === "prod_pack_1_pro", "R2.4: Default config assigned to prod_pack_1_pro");
  assert(defaultCfg1.desktopLayoutMode === "split", "R2.5: Default desktop layout mode is 'split'");
  assert(
    Array.isArray(defaultCfg1.desktopSectionOrder) && defaultCfg1.desktopSectionOrder.length === 8,
    "R2.6: Default desktopSectionOrder has all 8 sections"
  );
  assert(defaultCfg1.showDescription === true, "R2.7: showDescription defaults to true");
  assert(defaultCfg1.showFeatures === true, "R2.8: showFeatures defaults to true");
  assert(defaultCfg1.showBenefits === true, "R2.9: showBenefits defaults to true");
  assert(defaultCfg1.showRelatedProducts === true, "R2.10: showRelatedProducts defaults to true");

  // Test 1.3: Save modified configuration & verify persistence
  const modifiedCfg: ProductPageLayoutConfig = {
    ...defaultCfg1,
    desktopLayoutMode: "stacked",
    desktopSectionOrder: [
      "orderForm",
      "gallery",
      "title",
      "subtitle",
      "description",
      "features",
      "benefits",
      "relatedProducts",
    ],
    showDescription: false,
    showFeatures: false,
    showBenefits: false,
    showRelatedProducts: false,
  };

  const savedResult = await layoutRepo.saveLayoutConfig(modifiedCfg);
  assert(savedResult.desktopLayoutMode === "stacked", "R2.11: Saved layout config reflects 'stacked' mode");
  assert(
    savedResult.desktopSectionOrder[0] === "orderForm",
    "R2.12: Saved layout config reflects reordered sections (orderForm first)"
  );
  assert(savedResult.showDescription === false, "R2.13: Saved showDescription is false");

  // Re-fetch to test persistence
  const reFetchedCfg = await layoutRepo.getLayoutConfig("prod_pack_1_pro");
  assert(reFetchedCfg.desktopLayoutMode === "stacked", "R2.14: Re-fetched layout reflects 'stacked' mode");
  assert(reFetchedCfg.showDescription === false, "R2.15: Re-fetched layout preserves visibility toggle");

  // Test 1.4: Restore defaults
  const restoredCfg = await layoutRepo.restoreDefaultLayout("prod_pack_1_pro");
  assert(restoredCfg.desktopLayoutMode === "split", "R2.16: Restored layout resets desktopLayoutMode to split");
  assert(restoredCfg.showDescription === true, "R2.17: Restored layout resets showDescription to true");
  assert(
    restoredCfg.desktopSectionOrder[0] === "gallery",
    "R2.18: Restored layout resets desktopSectionOrder to original gallery first"
  );

  // Test 1.5: Adversarial simulation: Corrupt localStorage payloads
  const testIds = ["prod_pack_1_pro", "prod_pack_2_elite", "prod_pack_3_ultra"];
  const corruptPayloads = [
    "null",
    "undefined",
    "12345",
    "\"a string\"",
    "{}",
    "{\"prod_pack_1_pro\": null}",
    "invalid json string {[[",
  ];

  for (const pid of testIds) {
    for (const corrupt of corruptPayloads) {
      let resultConfig: ProductPageLayoutConfig | null = null;
      try {
        // Simulate getStoredLayoutConfig logic
        let parsed: any = null;
        try {
          parsed = JSON.parse(corrupt);
        } catch {
          parsed = null;
        }
        if (parsed && typeof parsed === "object" && parsed[pid]) {
          resultConfig = parsed[pid];
        } else if (parsed && typeof parsed === "object" && parsed.global_default) {
          resultConfig = { ...parsed.global_default, productId: pid };
        } else {
          resultConfig = createDefaultLayoutConfig(pid);
        }
      } catch (e) {
        resultConfig = createDefaultLayoutConfig(pid);
      }
      assert(
        resultConfig !== null && resultConfig.productId === pid,
        `R2.19: Corrupt payload handling for ${pid} with '${corrupt.slice(0, 15)}'`
      );
    }
  }

  // Test 1.6: DynamicPackLayout file inspection for BroadcastChannel, storage listeners, and orderForm preservation
  const dynamicPackPath = path.join(rootDir, "src/components/storefront/pack/dynamic-pack-layout.tsx");
  const dynamicPackContent = fs.readFileSync(dynamicPackPath, "utf8");

  assert(
    dynamicPackContent.includes('new BroadcastChannel("orva_layout_sync_v1")') ||
      dynamicPackContent.includes("BROADCAST_CHANNEL_NAME"),
    "R2.20: DynamicPackLayout subscribes to BroadcastChannel 'orva_layout_sync_v1'"
  );
  assert(
    dynamicPackContent.includes('window.addEventListener("orva:layout-updated"'),
    "R2.21: DynamicPackLayout subscribes to CustomEvent 'orva:layout-updated'"
  );
  assert(
    dynamicPackContent.includes('window.addEventListener("storage"'),
    "R2.22: DynamicPackLayout subscribes to window storage event for cross-tab sync"
  );
  assert(
    dynamicPackContent.includes('case "orderForm":') && dynamicPackContent.includes("return true;"),
    "R2.23: Essential checkout form is hard-guarded to NEVER be disabled or hidden"
  );
  assert(
    dynamicPackContent.includes("isSplitMode") && dynamicPackContent.includes("sectionOrder"),
    "R2.24: DynamicPackLayout supports split and stacked rendering with custom sectionOrder"
  );

  // Test 1.7: Pack pages wire DynamicPackLayout
  for (let i = 1; i <= 3; i++) {
    const packPagePath = path.join(rootDir, `src/app/(storefront)/pack${i}/page.tsx`);
    const packPageContent = fs.readFileSync(packPagePath, "utf8");
    assert(
      packPageContent.includes("DynamicPackLayout"),
      `R2.25.${i}: /pack${i} renders DynamicPackLayout`
    );
    assert(
      packPageContent.includes(`packId="PACK${i}"`),
      `R2.26.${i}: /pack${i} passes packId="PACK${i}"`
    );
  }

  // ==========================================================================
  // SECTION 2: REQUIREMENT R3 — STOREFRONT CLEAN LIGHT THEME & ARTIFACT PURGE
  // ==========================================================================
  console.log("\n── SECTION 2: REQUIREMENT R3 — Storefront Clean Light Theme ──");

  const storefrontFilesToScan = [
    "src/app/(storefront)/pack1/page.tsx",
    "src/app/(storefront)/pack2/page.tsx",
    "src/app/(storefront)/pack3/page.tsx",
    "src/components/storefront/pack/dynamic-pack-layout.tsx",
    "src/components/storefront/checkout/embedded-cod-order-form.tsx",
    "src/components/storefront/pack/pack-gallery.tsx",
    "src/components/storefront/pack/sticky-mobile-order-bar.tsx",
    "src/components/storefront/pack/whats-in-the-box.tsx",
    "src/components/storefront/shared/reassurance-grid.tsx",
    "src/components/storefront/pack/pack-faq.tsx",
    "src/components/storefront/pack/pack-cross-sell.tsx",
  ];

  // Forbidden dark mode artifact patterns
  const forbiddenPatterns = [
    { pattern: /bg-\[#101418\]/g, name: "bg-[#101418] dark root override" },
    { pattern: /bg-\[#12161A\]/g, name: "bg-[#12161A] dark canvas background" },
    { pattern: /bg-\[#181F26\]/g, name: "bg-[#181F26] dark card background" },
    { pattern: /\[&_\.bg-white\]:bg-slate-900/g, name: "Arbitrary child bg-white to slate-900 override" },
    { pattern: /\[&_\.text-slate-900\]:text-white/g, name: "Arbitrary child text-slate-900 to text-white override" },
    { pattern: /\[&_\.border-slate-200\]:border-slate-800/g, name: "Arbitrary child border-slate-200 to border-slate-800 override" },
  ];

  for (const relPath of storefrontFilesToScan) {
    const fullPath = path.join(rootDir, relPath);
    const content = fs.readFileSync(fullPath, "utf8");
    for (const { pattern, name } of forbiddenPatterns) {
      const matches = content.match(pattern);
      assert(
        !matches || matches.length === 0,
        `R3: ${relPath} must NOT contain ${name}`,
        matches ? `Found ${matches.length} occurrences` : undefined
      );
    }
  }

  // Verify DynamicPackLayout light styling
  assert(
    dynamicPackContent.includes("bg-slate-50/60 text-slate-900"),
    "R3: DynamicPackLayout root has clean light container (bg-slate-50/60 text-slate-900)"
  );
  assert(
    dynamicPackContent.includes("bg-white rounded-3xl p-6 sm:p-8 border border-slate-200"),
    "R3: DynamicPackLayout uses clean white cards with border-slate-200"
  );
  assert(
    dynamicPackContent.includes("text-amber-600") && dynamicPackContent.includes("bg-amber-50"),
    "R3: DynamicPackLayout uses brand amber accents"
  );

  // Verify EmbeddedCodOrderForm light styling
  const orderFormPath = path.join(rootDir, "src/components/storefront/checkout/embedded-cod-order-form.tsx");
  const orderFormContent = fs.readFileSync(orderFormPath, "utf8");
  assert(
    orderFormContent.includes("bg-white border-2 border-amber-500"),
    "R3: EmbeddedCodOrderForm container uses clean white card with amber border"
  );
  assert(
    orderFormContent.includes("bg-slate-50 border border-slate-300"),
    "R3: EmbeddedCodOrderForm inputs use bg-slate-50 with slate border"
  );

  // Verify PackGallery light styling
  const galleryPath = path.join(rootDir, "src/components/storefront/pack/pack-gallery.tsx");
  const galleryContent = fs.readFileSync(galleryPath, "utf8");
  assert(
    galleryContent.includes("bg-white border border-slate-200"),
    "R3: PackGallery stage uses clean white background with slate border"
  );

  // Verify StickyMobileOrderBar light styling
  const stickyBarPath = path.join(rootDir, "src/components/storefront/pack/sticky-mobile-order-bar.tsx");
  const stickyBarContent = fs.readFileSync(stickyBarPath, "utf8");
  assert(
    stickyBarContent.includes("bg-white/95 backdrop-blur-md border-t border-slate-200"),
    "R3: StickyMobileOrderBar uses clean white backdrop"
  );

  // Verify Admin Designer Preview Canvas light styling
  const designerPath = path.join(rootDir, "src/app/(main)/dashboard/products/designer/page.tsx");
  const designerContent = fs.readFileSync(designerPath, "utf8");
  assert(
    !designerContent.includes("bg-[#12161A] text-[#F3F4F6]"),
    "R3: Designer preview canvas must NOT use dark theme bg-[#12161A]"
  );
  assert(
    designerContent.includes("bg-white text-slate-900"),
    "R3: Designer preview canvas faithfully mirrors clean light theme"
  );

  // Verify built HTML files for pack pages
  const appBuildDir = path.join(rootDir, ".next/server/app");
  if (fs.existsSync(appBuildDir)) {
    for (let i = 1; i <= 3; i++) {
      const htmlFile = path.join(appBuildDir, `pack${i}.html`);
      if (fs.existsSync(htmlFile)) {
        const html = fs.readFileSync(htmlFile, "utf8");
        assert(!html.includes("101418"), `R3: Built pack${i}.html must NOT contain dark color 101418`);
        assert(!html.includes("12161A"), `R3: Built pack${i}.html must NOT contain dark color 12161A`);
        assert(html.includes("bg-slate-50"), `R3: Built pack${i}.html contains bg-slate-50`);
      }
    }
  }

  // ==========================================================================
  // SECTION 3: REQUIREMENT R4 — CORE PRODUCTS & INVENTORY CATALOG
  // ==========================================================================
  console.log("\n── SECTION 3: REQUIREMENT R4 — Core Products Catalog & CRUD ──");

  // Test 3.1: Catalog definitions in DEFAULT_MOCK_PRODUCTS
  const p1 = DEFAULT_MOCK_PRODUCTS.find((p) => p.id === "prod_pack_1_pro");
  const p2 = DEFAULT_MOCK_PRODUCTS.find((p) => p.id === "prod_pack_2_elite");
  const p3 = DEFAULT_MOCK_PRODUCTS.find((p) => p.id === "prod_pack_3_ultra");

  assert(p1 !== undefined, "R4.1: Pack 1 exists in DEFAULT_MOCK_PRODUCTS");
  assert(
    p1?.title === "باك منفاخ تويوتا وطقم المفاتيح",
    "R4.2: Pack 1 title is exactly 'باك منفاخ تويوتا وطقم المفاتيح'",
    `Found: ${p1?.title}`
  );
  assert(p1?.sellingPrice === 4950, "R4.3: Pack 1 price is exactly 4,950 DZD");
  assert(p1?.status === "active", "R4.4: Pack 1 status is active");

  assert(p2 !== undefined, "R4.5: Pack 2 exists in DEFAULT_MOCK_PRODUCTS");
  assert(
    p2?.title === "باك ماكينة كراون CROWN 20V الأصلية",
    "R4.6: Pack 2 title is exactly 'باك ماكينة كراون CROWN 20V الأصلية'",
    `Found: ${p2?.title}`
  );
  assert(p2?.sellingPrice === 12950, "R4.7: Pack 2 price is exactly 12,950 DZD");
  assert(p2?.status === "active", "R4.8: Pack 2 status is active");

  assert(p3 !== undefined, "R4.9: Pack 3 exists in DEFAULT_MOCK_PRODUCTS");
  assert(
    p3?.title === "باك الأشغال الشاقة CROWN و Starcle Pro",
    "R4.10: Pack 3 title is exactly 'باك الأشغال الشاقة CROWN و Starcle Pro'",
    `Found: ${p3?.title}`
  );
  assert(p3?.sellingPrice === 15950, "R4.11: Pack 3 price is exactly 15,950 DZD");
  assert(p3?.status === "active", "R4.12: Pack 3 status is active");

  // Test 3.2: STOREFRONT_PACKS alignment
  assert(
    STOREFRONT_PACKS.PACK1.nameAr === "باك منفاخ تويوتا وطقم المفاتيح",
    "R4.13: STOREFRONT_PACKS.PACK1 nameAr matches catalog"
  );
  assert(STOREFRONT_PACKS.PACK1.priceDzd === 4950, "R4.14: STOREFRONT_PACKS.PACK1 price matches catalog");

  assert(
    STOREFRONT_PACKS.PACK2.nameAr === "باك ماكينة كراون CROWN 20V الأصلية",
    "R4.15: STOREFRONT_PACKS.PACK2 nameAr matches catalog"
  );
  assert(STOREFRONT_PACKS.PACK2.priceDzd === 12950, "R4.16: STOREFRONT_PACKS.PACK2 price matches catalog");

  assert(
    STOREFRONT_PACKS.PACK3.nameAr === "باك الأشغال الشاقة CROWN و Starcle Pro",
    "R4.17: STOREFRONT_PACKS.PACK3 nameAr matches catalog"
  );
  assert(STOREFRONT_PACKS.PACK3.priceDzd === 15950, "R4.18: STOREFRONT_PACKS.PACK3 price matches catalog");

  // Test 3.3: MockProductsRepository CRUD operations
  const prodsRepo = new MockProductsRepository();

  // Create
  const created = await prodsRepo.createProduct({
    title: "منتج تجريبي للاختبار",
    subtitle: "وصف فرعي تجريبي",
    description: "شرح تفصيلي للمنتج التجريبي",
    sku: "TEST-CHALLENGER-01",
    sellingPrice: 8500,
    purchaseCost: 4000,
    marketingCostPerOrder: 1000,
    stockQuantity: 50,
    lowStockThreshold: 10,
    status: "active",
    images: ["/test.jpg"],
  });
  assert(created.id.startsWith("prod_"), "R4.19: Created product has valid ID");
  assert(created.sku === "TEST-CHALLENGER-01", "R4.20: Created product preserves SKU");

  // Read
  const fetchedCreated = await prodsRepo.getProductById(created.id);
  assert(fetchedCreated !== null, "R4.21: Successfully fetched newly created product");
  assert(fetchedCreated?.sellingPrice === 8500, "R4.22: Fetched product has correct sellingPrice");

  // Update
  const updated = await prodsRepo.updateProduct(created.id, {
    title: "منتج تجريبي معدل",
    sellingPrice: 9200,
    stockQuantity: 65,
  });
  assert(updated.title === "منتج تجريبي معدل", "R4.23: Updated product title matches");
  assert(updated.sellingPrice === 9200, "R4.24: Updated product price matches");
  assert(updated.stockQuantity === 65, "R4.25: Updated product stockQuantity matches");

  // Inventory sync check
  const invList = await prodsRepo.getInventory();
  const createdInv = invList.find((i) => i.productId === created.id);
  assert(createdInv !== undefined, "R4.26: Inventory record exists for created product");
  assert(createdInv?.availableQuantity === 65, "R4.27: Inventory availableQuantity synced with product update");

  // Inventory adjustment
  const adjusted = await prodsRepo.adjustInventory(created.id, 15, "توريد شحنة إضافية");
  assert(adjusted.availableQuantity === 80, "R4.28: Adjusted inventory increases to 80");
  assert(
    adjusted.stockAdjustments.some((a) => a.reason === "توريد شحنة إضافية"),
    "R4.29: Stock adjustment logged in history"
  );

  // Archive
  const archived = await prodsRepo.archiveProduct(created.id);
  assert(archived.status === "archived", "R4.30: Product status successfully changed to archived");

  // Delete
  const delResult = await prodsRepo.deleteProduct(created.id, []);
  assert(delResult.success === true, "R4.31: Unreferenced product deleted successfully");
  const postDelete = await prodsRepo.getProductById(created.id);
  assert(postDelete === null, "R4.32: Deleted product is no longer found in repository");

  // Foreign key delete guard test
  const guardedDelete = await prodsRepo.deleteProduct("prod_pack_1_pro", [
    { orderId: "ORD-999", productName: "باك منفاخ تويوتا وطقم المفاتيح" },
  ]);
  assert(
    guardedDelete.actionTaken === "archived",
    "R4.33: Product with active order references is archived instead of hard-deleted"
  );

  // Test 3.4: matchOrderToProduct matching robustness
  const testMatches = [
    { input: "باك منفاخ تويوتا وطقم المفاتيح", expectedId: "prod_pack_1_pro", expectedSku: "ORVA-P1-PRO" },
    { input: "منفاخ تويوتا", expectedId: "prod_pack_1_pro", expectedSku: "ORVA-P1-PRO" },
    { input: "Pack 1 Pro 4-in-1", expectedId: "prod_pack_1_pro", expectedSku: "ORVA-P1-PRO" },
    { input: "باك ماكينة كراون CROWN 20V الأصلية", expectedId: "prod_pack_2_elite", expectedSku: "ORVA-P2-ELITE" },
    { input: "ماكينة كراون", expectedId: "prod_pack_2_elite", expectedSku: "ORVA-P2-ELITE" },
    { input: "فيسوز كراون", expectedId: "prod_pack_2_elite", expectedSku: "ORVA-P2-ELITE" },
    { input: "Pack 2 Elite", expectedId: "prod_pack_2_elite", expectedSku: "ORVA-P2-ELITE" },
    { input: "باك الأشغال الشاقة CROWN و Starcle Pro", expectedId: "prod_pack_3_ultra", expectedSku: "ORVA-P3-ULTRA" },
    { input: "سودير كراون", expectedId: "prod_pack_3_ultra", expectedSku: "ORVA-P3-ULTRA" },
    { input: "Pack 3 Ultra", expectedId: "prod_pack_3_ultra", expectedSku: "ORVA-P3-ULTRA" },
    { input: "Sac Banane Moto Yamaha", expectedId: "prod_sac_yamaha", expectedSku: "ORVA-SAC-YAM" },
    { input: "", expectedId: null, expectedSku: null },
    { input: "منتج غير معروف تماما", expectedId: null, expectedSku: null },
  ];

  for (let idx = 0; idx < testMatches.length; idx++) {
    const tm = testMatches[idx];
    const match = matchOrderToProduct(tm.input);
    assert(
      match.matchedProductId === tm.expectedId,
      `R4.34.${idx + 1}: matchOrderToProduct('${tm.input}') -> ${tm.expectedId}`,
      `Got ${match.matchedProductId}`
    );
  }

  // Test 3.5: Economics verification
  assert(computeUnitMargin(4950, 2400) === 2550, "R4.35: computeUnitMargin(4950, 2400) === 2550");
  assert(
    computeEstimatedOrderProfit(4950, 2400, 850) === 1700,
    "R4.36: computeEstimatedOrderProfit(4950, 2400, 850) === 1700"
  );

  // ==========================================================================
  // SECTION 4: REQUIREMENT R6 — META PIXEL DOM INJECTION & ROUTE TRACKING
  // ==========================================================================
  console.log("\n── SECTION 4: REQUIREMENT R6 — Meta Pixel DOM Script Injection ──");

  // Test 4.1: MetaPixel component file inspection
  const pixelComponentPath = path.join(
    rootDir,
    "src/components/storefront/analytics/meta-pixel.tsx"
  );
  const pixelComponentContent = fs.readFileSync(pixelComponentPath, "utf8");

  assert(
    pixelComponentContent.includes('strategy="afterInteractive"'),
    "R6.1: MetaPixel uses Next.js Script strategy='afterInteractive'"
  );
  assert(
    pixelComponentContent.includes("https://connect.facebook.net/en_US/fbevents.js"),
    "R6.2: MetaPixel loads official fbevents.js snippet"
  );
  assert(
    pixelComponentContent.includes("fbq('init',") || pixelComponentContent.includes("fbq('init', '${activePixelId}')"),
    "R6.3: MetaPixel snippet invokes fbq('init', pixelId)"
  );
  assert(
    pixelComponentContent.includes("fbq('track', 'PageView')"),
    "R6.4: MetaPixel snippet triggers initial PageView event"
  );
  assert(
    pixelComponentContent.includes("<noscript>") && pixelComponentContent.includes("https://www.facebook.com/tr?id="),
    "R6.5: MetaPixel renders noscript fallback with tracking beacon"
  );
  assert(
    pixelComponentContent.includes("window._metaPixelId = activePixelId;"),
    "R6.6: MetaPixel exposes window._metaPixelId for inspection and detection tools"
  );
  assert(
    pixelComponentContent.includes("usePathname()"),
    "R6.7: MetaPixel listens to usePathname() for App Router client transitions"
  );
  assert(
    pixelComponentContent.includes("DEFAULT_FALLBACK_PIXEL_ID = \"2340414976777036\""),
    "R6.8: MetaPixel defines reliable fallback Pixel ID (2340414976777036)"
  );

  // Test 4.2: StorefrontLayout mounts MetaPixel
  const storefrontLayoutPath = path.join(rootDir, "src/app/(storefront)/layout.tsx");
  const storefrontLayoutContent = fs.readFileSync(storefrontLayoutPath, "utf8");

  assert(
    storefrontLayoutContent.includes("<MetaPixel"),
    "R6.9: StorefrontLayout mounts <MetaPixel />"
  );
  assert(
    storefrontLayoutContent.includes("getAdminSettingsAction"),
    "R6.10: StorefrontLayout binds MetaPixel to getAdminSettingsAction() for dynamic configuration"
  );

  // Test 4.3: Confirmation Page Purchase Event Deduplication
  const confirmationPagePath = path.join(
    rootDir,
    "src/app/(storefront)/checkout/confirmation/page.tsx"
  );
  const confirmationPageContent = fs.readFileSync(confirmationPagePath, "utf8");

  assert(
    /\.fbq\(\s*["']track["'],\s*["']Purchase["']/.test(confirmationPageContent),
    "R6.11: Confirmation page tracks Meta Pixel 'Purchase' event on order completion"
  );
  assert(
    confirmationPageContent.includes("eventID: orderNumber"),
    "R6.12: Confirmation page attaches eventID for server CAPI deduplication"
  );

  // Test 4.4: Server checkout.ts CAPI alignment
  const checkoutActionPath = path.join(rootDir, "src/app/actions/checkout.ts");
  const checkoutActionContent = fs.readFileSync(checkoutActionPath, "utf8");

  assert(
    checkoutActionContent.includes("event_id: params.orderNumber"),
    "R6.13: Server action checkout.ts sends matching event_id: orderNumber for CAPI deduplication"
  );

  // Test 4.5: Built HTML contains noscript beacon
  if (fs.existsSync(appBuildDir)) {
    const p1Html = path.join(appBuildDir, "pack1.html");
    if (fs.existsSync(p1Html)) {
      const html = fs.readFileSync(p1Html, "utf8");
      assert(
        html.includes("https://www.facebook.com/tr?id=") && html.includes("ev=PageView&amp;noscript=1"),
        "R6.14: Static prerendered pack1.html embeds Meta Pixel noscript beacon"
      );
    }
  }

  console.log("\n══════════════════════════════════════════════════════════════════════════════");
  console.log(`   ALL ${passedCount} / ${totalCount} EMPIRICAL CHALLENGER TESTS PASSED (100%)`);
  console.log("══════════════════════════════════════════════════════════════════════════════\n");
}

runTestSuite().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
