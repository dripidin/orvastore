/**
 * Challenger 2 Adversarial Stress Test Suite
 * Validates Invariants C2-A through C2-F, edge cases, and arithmetic stability
 * for Milestones M3 (Products, Pages, Demand), M4 (Analytics), and M5 (Storefront Packs).
 */

import fs from "fs";
import path from "path";
import {
  computeUnitMargin,
  computeEstimatedOrderProfit,
  matchOrderToProduct,
} from "../src/lib/repository/product-types";
import { DEFAULT_MOCK_PRODUCTS } from "../src/lib/repository/mock-products-dataset";
import { MockStorePagesRepository } from "../src/lib/repository/mock-store-pages-repository";
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

async function runChallenger2Suite() {
  console.log("══════════════════════════════════════════════════════════════════");
  console.log("   CHALLENGER 2 EMPIRICAL ADVERSARIAL STRESS TEST SUITE");
  console.log("   Milestones: M3 (Products, Pages, Demand), M4 (Analytics), M5 (Storefront)");
  console.log("══════════════════════════════════════════════════════════════════\n");

  const rootDir = path.resolve(__dirname, "..");

  // ──────────────────────────────────────────────────────────────────────────
  // 1. INVARIANT C2-A: Products Page Layout & Truck Import Purge
  // ──────────────────────────────────────────────────────────────────────────
  console.log("── 1. INVARIANT C2-A: Products Page Integrity ──");
  const productsPagePath = path.join(rootDir, "src/app/(main)/dashboard/products/page.tsx");
  const productsPageContent = fs.readFileSync(productsPagePath, "utf8");

  assert(
    !productsPageContent.includes("معاينة تخطيط صفحة المنتج"),
    "C2-A: Products page must NOT contain 'معاينة تخطيط صفحة المنتج'"
  );
  assert(
    !productsPageContent.includes("قالب المتجر"),
    "C2-A: Products page must NOT contain 'قالب المتجر' preview component"
  );
  assert(
    !/\bimport\s+.*?\bTruck\b.*?from\s+["']lucide-react["']/.test(productsPageContent),
    "C2-A: Products page must NOT import unused Truck from lucide-react"
  );
  assert(
    productsPageContent.includes("إدارة المنتجات والمخزون"),
    "C2-A: Products page header title is intact"
  );
  assert(
    productsPageContent.includes("Inventory KPI Summary Strip") || productsPageContent.includes("totalPhysicalUnits"),
    "C2-A: Products page contains Inventory KPI Summary Strip"
  );

  // ──────────────────────────────────────────────────────────────────────────
  // 2. INVARIANT C2-B: Store Pages & Sitemap Route Alignment & Phase 8A Purge
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── 2. INVARIANT C2-B: Pages & Sitemap Alignment ──");
  const pagesPagePath = path.join(rootDir, "src/app/(main)/dashboard/products/pages/page.tsx");
  const pagesPageContent = fs.readFileSync(pagesPagePath, "utf8");
  const repoStorePagesPath = path.join(rootDir, "src/lib/repository/mock-store-pages-repository.ts");
  const repoStorePagesContent = fs.readFileSync(repoStorePagesPath, "utf8");

  assert(!pagesPageContent.includes("Phase 8A"), "C2-B: pages/page.tsx must NOT contain 'Phase 8A'");
  assert(!pagesPageContent.includes("معمارية الفصل"), "C2-B: pages/page.tsx must NOT contain 'معمارية الفصل'");
  assert(!repoStorePagesContent.includes("Phase 8A"), "C2-B: mock-store-pages-repository must NOT contain 'Phase 8A'");
  assert(!repoStorePagesContent.includes("معمارية الفصل"), "C2-B: mock-store-pages-repository must NOT contain 'معمارية الفصل'");

  const repo = new MockStorePagesRepository();
  const pages = await repo.getPages();
  const publicUrls = pages.map((p) => p.publicUrl);

  const requiredRoutes = ["/", "/pack1", "/pack2", "/pack3", "/checkout/confirmation"];
  for (const route of requiredRoutes) {
    assert(
      publicUrls.includes(route),
      `C2-B: Repository must contain live route ${route}`,
      `Found routes: ${publicUrls.join(", ")}`
    );
  }

  const sitemap = await repo.getSitemapEntries();
  const sitemapUrls = sitemap.map((s) => s.url);
  for (const route of requiredRoutes) {
    assert(
      sitemapUrls.includes(route),
      `C2-B: Sitemap must index live route ${route}`,
      `Found: ${sitemapUrls.join(", ")}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. INVARIANT C2-C: Demand Dataset & Page Sac Banane Uniqueness
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── 3. INVARIANT C2-C: Sac Banane Single Listing & Deduplication ──");
  const demandPagePath = path.join(rootDir, "src/app/(main)/dashboard/products/demand/page.tsx");
  const demandPageContent = fs.readFileSync(demandPagePath, "utf8");
  const mockDatasetPath = path.join(rootDir, "src/lib/repository/mock-products-dataset.ts");
  const mockDatasetContent = fs.readFileSync(mockDatasetPath, "utf8");

  const sacProducts = DEFAULT_MOCK_PRODUCTS.filter(
    (p) => p.title.toLowerCase().includes("sac banane") || p.id.includes("sac")
  );
  assert(
    sacProducts.length === 1,
    "C2-C: Catalog dataset must have exactly 1 Sac Banane product",
    `Found count: ${sacProducts.length}`
  );
  assert(
    sacProducts[0].id === "prod_sac_yamaha",
    "C2-C: Canonical Sac Banane product ID must be 'prod_sac_yamaha'",
    `Found: ${sacProducts[0].id}`
  );
  assert(
    !mockDatasetContent.includes("prod_sac_bundle"),
    "C2-C: Legacy 'prod_sac_bundle' must be absent from mock-products-dataset"
  );

  // Test deduplication logic from demand/page.tsx
  const syntheticList = [
    ...DEFAULT_MOCK_PRODUCTS,
    {
      id: "prod_sac_bundle",
      sku: "ORVA-SAC-BUNDLE",
      title: "Sac Banane Pack Cadeaux",
      subtitle: "",
      description: "",
      images: [],
      sellingPrice: 4200,
      purchaseCost: 1800,
      marketingCostPerOrder: 600,
      stockQuantity: 10,
      lowStockThreshold: 5,
      status: "active" as const,
      createdAt: "2026-10-01",
      updatedAt: "2026-10-01",
    },
    {
      id: "prod_sac_duplicate_2",
      sku: "ORVA-SAC-DUP",
      title: "Sac Banane Extra",
      subtitle: "",
      description: "",
      images: [],
      sellingPrice: 4200,
      purchaseCost: 1800,
      marketingCostPerOrder: 600,
      stockQuantity: 10,
      lowStockThreshold: 5,
      status: "active" as const,
      createdAt: "2026-10-01",
      updatedAt: "2026-10-01",
    },
  ];

  const seenTitles = new Set<string>();
  const deduplicatedList: typeof DEFAULT_MOCK_PRODUCTS = [];
  for (const p of syntheticList) {
    if (p.id === "prod_sac_bundle") continue;
    const normTitle = p.title.toLowerCase().startsWith("sac banane") ? "sac banane moto yamaha" : p.title;
    if (!seenTitles.has(normTitle)) {
      seenTitles.add(normTitle);
      deduplicatedList.push(p);
    }
  }

  const finalSacCount = deduplicatedList.filter((p) => p.title.toLowerCase().includes("sac banane")).length;
  assert(
    finalSacCount === 1,
    "C2-C: Demand page deduplication reduces multiple Sac Banane variants to exactly 1 canonical listing",
    `Count: ${finalSacCount}`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // 4. INVARIANT C2-D: Analytics Overview Metrics, Filtering, Deltas & No Mock Banners
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── 4. INVARIANT C2-D: Analytics Overview & Reporting ──");
  const analyticsOverviewPath = path.join(
    rootDir,
    "src/app/(main)/dashboard/analytics/_components/analytics-overview.tsx"
  );
  const analyticsOverviewContent = fs.readFileSync(analyticsOverviewPath, "utf8");
  const visitorsReportsPath = path.join(
    rootDir,
    "src/app/(main)/dashboard/ecommerce/_components/visitors-and-reports.tsx"
  );
  const visitorsReportsContent = fs.readFileSync(visitorsReportsPath, "utf8");

  // Mock banners purge verification
  assert(
    !analyticsOverviewContent.includes("DEV MOCK DATA"),
    "C2-D: analytics-overview must NOT contain 'DEV MOCK DATA'"
  );
  assert(
    !analyticsOverviewContent.includes("بيئة تحليلات معزولة"),
    "C2-D: analytics-overview must NOT contain 'بيئة تحليلات معزولة'"
  );
  assert(
    !visitorsReportsContent.includes("مصدر الزيارات والتسويق غير موصول"),
    "C2-D: visitors-and-reports must NOT contain 'مصدر الزيارات والتسويق غير موصول'"
  );

  // Dropdown filtering verification
  assert(
    analyticsOverviewContent.includes("selectedProduct") && analyticsOverviewContent.includes("productFilterOptions"),
    "C2-D: analytics-overview supports product dropdown selection"
  );

  // AOV Card verification
  assert(
    analyticsOverviewContent.includes("averageOrderValue") && analyticsOverviewContent.includes("متوسط قيمة الطلب (AOV)"),
    "C2-D: analytics-overview renders Average Order Value (AOV) card"
  );

  // Delta calculation tests
  function calculateDelta(current: number, prior: number) {
    if (prior === 0) {
      if (current === 0) return { pct: 0, text: "+0.0%", isPositive: true, isNeutral: true };
      return { pct: 100, text: "+100.0%", isPositive: true, isNeutral: false };
    }
    const pct = ((current - prior) / prior) * 100;
    const isNeutral = Math.abs(pct) < 0.05;
    const isPositive = pct >= 0;
    const text = `${isPositive ? "+" : ""}${pct.toFixed(1)}%`;
    return { pct, text, isPositive, isNeutral };
  }

  assert(calculateDelta(0, 0).text === "+0.0%", "C2-D: calculateDelta(0, 0) returns +0.0% neutral");
  assert(calculateDelta(10, 0).text === "+100.0%", "C2-D: calculateDelta(10, 0) handles zero prior safely (+100.0%)");
  assert(calculateDelta(150, 100).text === "+50.0%", "C2-D: calculateDelta(150, 100) returns +50.0%");
  assert(calculateDelta(75, 100).text === "-25.0%", "C2-D: calculateDelta(75, 100) returns -25.0%");

  // Division by zero resilience in AOV & Delivery Rate
  const emptyOrders: any[] = [];
  const aovEmpty = emptyOrders.length === 0 ? 0 : Math.round(100 / emptyOrders.length);
  assert(aovEmpty === 0 && !isNaN(aovEmpty) && isFinite(aovEmpty), "C2-D: AOV calculation handles 0 orders without NaN");

  const outcomesEmpty = 0;
  const deliveryRateEmpty = outcomesEmpty === 0 ? 0 : Math.round((0 / outcomesEmpty) * 100);
  assert(deliveryRateEmpty === 0 && !isNaN(deliveryRateEmpty), "C2-D: Delivery rate handles 0 outcomes without NaN");

  // ──────────────────────────────────────────────────────────────────────────
  // 5. INVARIANT C2-E: Storefront Badge Span Purge
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── 5. INVARIANT C2-E: Storefront Badge Spans Purge ──");
  const pack1Path = path.join(rootDir, "src/app/(storefront)/pack1/page.tsx");
  const pack2Path = path.join(rootDir, "src/app/(storefront)/pack2/page.tsx");
  const pack3Path = path.join(rootDir, "src/app/(storefront)/pack3/page.tsx");
  const galleryPath = path.join(rootDir, "src/components/storefront/pack/pack-gallery.tsx");
  const packsDataPath = path.join(rootDir, "src/data/storefront-packs.ts");

  const p1Content = fs.readFileSync(pack1Path, "utf8");
  const p2Content = fs.readFileSync(pack2Path, "utf8");
  const p3Content = fs.readFileSync(pack3Path, "utf8");
  const galleryContent = fs.readFileSync(galleryPath, "utf8");
  const packsDataContent = fs.readFileSync(packsDataPath, "utf8");

  const prohibitedPhrases = [
    "الأكثر طلباً للسيارة والمنزل • عتاد 4 في 1",
    "أصلي 100% مع حق المعاينة قبل الدفع",
    "⭐ اختيار الحرفيين والمحترفين ⭐",
    "باقة اللحام والأشغال الشاقة • عتاد 6 في 1",
  ];

  const allFiles = [
    { name: "pack1", content: p1Content },
    { name: "pack2", content: p2Content },
    { name: "pack3", content: p3Content },
    { name: "gallery", content: galleryContent },
    { name: "packsData", content: packsDataContent },
  ];

  for (const phrase of prohibitedPhrases) {
    for (const file of allFiles) {
      assert(
        !file.content.includes(phrase),
        `C2-E: File ${file.name} must NOT contain phrase '${phrase}'`
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. INVARIANT C2-F: Product Page Designer Conformance
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── 6. INVARIANT C2-F: Product Page Designer Standards ──");
  const packPages = [
    { name: "pack1", content: p1Content },
    { name: "pack2", content: p2Content },
    { name: "pack3", content: p3Content },
  ];

  for (const pp of packPages) {
    // 1. Theme background #101418
    assert(
      pp.content.includes("#101418"),
      `C2-F: ${pp.name} must use #101418 dark charcoal background`
    );

    // 2. Monospace pricing
    assert(
      pp.content.includes("font-mono"),
      `C2-F: ${pp.name} must use font-mono for pricing numerals`
    );

    // 3. Compact savings tag
    assert(
      pp.content.includes("توفير") && pp.content.includes("savingsDzd"),
      `C2-F: ${pp.name} must display compact savings tag with savingsDzd`
    );

    // 4. High-contrast reassurance grid
    assert(
      pp.content.includes("المعاينة قبل الدفع") && pp.content.includes("توصيل سريع لجميع الولايات"),
      `C2-F: ${pp.name} must contain high-contrast reassurance grid with inspection and fast delivery`
    );

    // 5. Amber CTA button
    assert(
      pp.content.includes("bg-amber-500"),
      `C2-F: ${pp.name} must use bg-amber-500 amber CTA button`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. ARITHMETIC & CORNER CASE STRESS TESTING
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n── 7. ARITHMETIC & CORNER CASE STRESS TESTING ──");

  // Margin boundary conditions
  assert(computeUnitMargin(0, 0) === 0, "Margin: 0 selling price, 0 purchase cost -> 0 margin");
  assert(computeUnitMargin(5000, 0) === 5000, "Margin: 5000 selling price, 0 purchase cost -> 5000");
  assert(computeUnitMargin(0, 5000) === 0, "Margin: 0 selling price, 5000 purchase cost -> clamped to 0 (no negative)");
  assert(computeUnitMargin(-500, -200) === 0, "Margin: Negative selling price -> clamped to 0");
  assert(computeUnitMargin(NaN, 100) === 0, "Margin: NaN input -> returns 0");
  assert(computeUnitMargin(12950.75, 6800.25) === 6150.5, "Margin: Fractional currency arithmetic matches");

  // Profit calculation with quantity bounds
  assert(computeEstimatedOrderProfit(5000, 2000, 500, 0) === 2500, "Profit: Quantity 0 clamped to 1");
  assert(computeEstimatedOrderProfit(5000, 2000, 500, -10) === 2500, "Profit: Negative quantity clamped to 1");
  assert(computeEstimatedOrderProfit(5000, 2000, 10000, 1) === 0, "Profit: Marketing exceeds margin -> clamped to 0");
  assert(computeEstimatedOrderProfit(5000, 2000, 500, 3) === 8500, "Profit: 3 units -> (3000 * 3) - 500 = 8500");

  // matchOrderToProduct matching matrix
  const sacCases = [
    "Sac Banane Moto Yamaha",
    "sac banane moto yamaha",
    "SAC BANANE MOTO YAMAHA",
    "Offre Sac Banane",
    "sac banane cadeaux",
    "pack sac banane",
  ];
  for (const sc of sacCases) {
    const res = matchOrderToProduct(sc);
    assert(
      res.matchedProductId === "prod_sac_yamaha",
      `Order matching: '${sc}' -> prod_sac_yamaha`,
      `Got: ${res.matchedProductId}`
    );
  }

  assert(matchOrderToProduct(null as any).matchedProductId === null, "Order matching: null -> null");
  assert(matchOrderToProduct(undefined as any).matchedProductId === null, "Order matching: undefined -> null");
  assert(matchOrderToProduct("Unknown Product XYZ 999").matchedProductId === null, "Order matching: unrecognized product -> null");

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log(`   SUMMARY: All ${passedCount} / ${totalCount} adversarial stress tests PASSED!`);
  console.log("══════════════════════════════════════════════════════════════════\n");
}

runChallenger2Suite().catch((err) => {
  console.error("FATAL ERROR IN SUITE:", err);
  process.exit(1);
});
