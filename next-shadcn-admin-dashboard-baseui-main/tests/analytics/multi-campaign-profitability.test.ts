import { computeCampaignProfitability } from "../../src/lib/analytics/campaign-profitability";
import type { OrvaOrder } from "../../src/lib/orva-api";
import { computeWeightedProductCpa, type Product } from "../../src/lib/repository/product-types";
import assert from "node:assert/strict";

async function runTests() {
  console.log("── Stage 5 Verification: Many-to-Many Product <-> Meta Ads & Synced Return Fees ──");
  let passed = 0;
  function verify(cond: boolean, label: string) {
    assert.ok(cond, label);
    passed += 1;
    console.log(`  [PASS] ${String(passed).padStart(2, "0")}: ${label}`);
  }

  const productA: Product = {
    id: "prod_a",
    sku: "ORVA-P1-4950",
    title: "Pack 1 ORVA",
    subtitle: "",
    description: "",
    images: [],
    sellingPrice: 4950,
    purchaseCost: 2400,
    marketingCostPerOrder: 900,
    stockQuantity: 10,
    lowStockThreshold: 2,
    status: "active",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    metaAdsLinks: [
      {
        id: "lnk-1",
        enabled: true,
        campaignId: "CAMP_1",
        campaignName: "Ramadan Cold",
        costMode: "campaign_budget_cpa",
        campaignSpendDzd: 6000,
        attributedOrdersCount: 10,
        allocationWeight: 2,
        isPrimary: true,
        computedCpaDzd: 600,
      },
      {
        id: "lnk-2",
        enabled: true,
        campaignId: "CAMP_2",
        campaignName: "Retargeting Warm",
        costMode: "fixed_cpa",
        allocationWeight: 1,
        computedCpaDzd: 1200,
      },
    ],
  };

  // Weighted CPA = (600*2 + 1200*1) / 3 = 800
  const weightedCpa = computeWeightedProductCpa(productA.metaAdsLinks);
  verify(
    weightedCpa === 800,
    `Computes weighted CPA across multiple linked campaigns (expected 800, got ${weightedCpa})`,
  );

  const productB: Product = {
    ...productA,
    id: "prod_b",
    sku: "ORVA-P2-12950",
    title: "Pack 2 CROWN",
    sellingPrice: 12950,
    purchaseCost: 7200,
    metaAdsLinks: [
      {
        id: "lnk-shared",
        enabled: true,
        campaignId: "CAMP_1",
        campaignName: "Ramadan Cold",
        costMode: "campaign_budget_cpa",
        campaignSpendDzd: 6000,
        attributedOrdersCount: 10,
        allocationWeight: 1,
        isPrimary: true,
        computedCpaDzd: 600,
      },
    ],
  };

  const orders: OrvaOrder[] = [
    {
      id: "ORD-M1",
      createdAt: "2026-11-22T10:00:00Z",
      customer: "Ali",
      phone: "0550111111",
      productName: "Pack 1 ORVA",
      status: "delivered",
      wilaya: "16 - Alger",
      commune: "Alger",
      deliveryType: "DOMICILE",
      priceDzd: 4500,
      shippingDzd: 450,
      grandTotalDzd: 4950,
      quantity: 1,
      inRedex: true,
      redexTrackingCode: "TRK-M1",
      fbCampaignId: "CAMP_1",
      utmCampaign: "Ramadan Cold",
      attributionSource: "facebook_ads",
      remarks: [],
      raw: {},
    },
    {
      id: "ORD-M2",
      createdAt: "2026-11-22T11:00:00Z",
      customer: "Sara",
      phone: "0661222222",
      productName: "Pack 2 CROWN",
      status: "returned",
      wilaya: "31 - Oran",
      commune: "Oran",
      deliveryType: "DOMICILE",
      priceDzd: 12450,
      shippingDzd: 500,
      grandTotalDzd: 12950,
      quantity: 1,
      inRedex: true,
      redexTrackingCode: "TRK-M2",
      fbCampaignId: "CAMP_1",
      utmCampaign: "Ramadan Cold",
      attributionSource: "facebook_ads",
      remarks: [],
      raw: {},
    },
    {
      id: "ORD-M3",
      createdAt: "2026-11-22T12:00:00Z",
      customer: "Omar",
      phone: "0770333333",
      productName: "Pack 1 ORVA",
      status: "delivered",
      wilaya: "16 - Alger",
      commune: "Alger",
      deliveryType: "DOMICILE",
      priceDzd: 4500,
      shippingDzd: 450,
      grandTotalDzd: 4950,
      quantity: 1,
      inRedex: true,
      redexTrackingCode: "TRK-M3",
      fbCampaignId: "CAMP_2",
      utmCampaign: "Retargeting Warm",
      attributionSource: "facebook_ads",
      remarks: [],
      raw: {},
    },
  ];

  // Synced tarif_retour from courier for Wilaya 31 (Oran) = 320 DZD
  const rows = computeCampaignProfitability(orders, {}, {}, [productA, productB], { 31: 320 });
  const camp1 = rows.find((r) => r.fbCampaignId === "CAMP_1");
  const camp2 = rows.find((r) => r.fbCampaignId === "CAMP_2");

  verify(
    Boolean(camp1 && camp1.adSpendDzd === 6000),
    `Shared campaign budget counted ONCE without double-counting across products (got ${camp1?.adSpendDzd})`,
  );
  verify(Boolean(camp1 && camp1.linkedProducts.length === 2), "Both Pack 1 and Pack 2 linked under shared CAMP_1");
  verify(
    Boolean(camp1 && camp1.totalReturnLossDzd === 320 && camp1.returnLossSource === "courier_synced"),
    `Uses synced tarif_retour (320 DZD) instead of hardcoded default (got ${camp1?.totalReturnLossDzd})`,
  );
  verify(
    Boolean(camp2 && camp2.adSpendDzd === 1200),
    `Secondary linked campaign CAMP_2 attributes its own fixed CPA spend (got ${camp2?.adSpendDzd})`,
  );

  console.log(`\nALL ${passed} TESTS PASSED!`);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
