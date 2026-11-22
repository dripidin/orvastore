import type { OrvaOrder } from "@/lib/orva-api";
import { matchOrderToProduct, type Product } from "@/lib/repository/product-types";

export type AdSpendSourceType = "meta_api" | "product_link" | "meta_estimate" | "manual";

export interface CampaignCostInput {
  adSpendDzd: number;
  isManualOverride?: boolean;
  metaApiSpendDzd?: number;
  unitCogsDzd: number;
  returnShippingLossDzd: number;
  estimatedMetaCpaDzd?: number;
}

export interface LinkedCampaignProductSummary {
  productId: string;
  title: string;
  sku: string;
  ordersCount: number;
  deliveredCount: number;
  purchaseCostDzd: number;
  marketingCostPerOrderDzd: number;
  linkedAdName?: string | null;
}

export interface CampaignProfitabilityRow {
  campaignKey: string;
  campaignName: string;
  attributionSource: string;
  fbCampaignId: string | null;
  fbAdsetIds: string[];
  fbAdIds: string[];
  utmCampaign: string | null;
  adsetCount: number;
  adCount: number;
  totalOrders: number;
  confirmedOrders: number;
  redexMatchedOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  deliveryRatePct: number;
  deliveredCodTotalDzd: number;
  deliveredProductRevenueDzd: number;
  adSpendDzd: number;
  estimatedMetaSpendDzd: number;
  adSpendSource: AdSpendSourceType;
  totalCogsDzd: number;
  totalReturnLossDzd: number;
  netProfitDzd: number;
  roas: number | null;
  costPerOrderDzd: number | null;
  costPerDeliveredDzd: number | null;
  linkedProducts: LinkedCampaignProductSummary[];
}

const SOURCE_LABELS_AR: Record<string, string> = {
  facebook_ads: "إعلانات فيسبوك (Meta)",
  facebook_organic: "فيسبوك (مجاني)",
  instagram_ads: "إعلانات إنستغرام",
  instagram_organic: "إنستغرام (مجاني)",
  tiktok_ads: "إعلانات تيك توك",
  tiktok_organic: "تيك توك (مجاني)",
  google_ads: "إعلانات جوجل",
  google_organic: "بحث جوجل",
  whatsapp: "واتساب (WhatsApp)",
  phone_call: "مكالمة هاتفية",
  manual_admin: "إدخال يدوي (Admin)",
  direct: "زيارة مباشرة (Direct)",
};

const DEFAULT_PRODUCT_COSTS_FALLBACK: Record<string, { title: string; sku: string; purchaseCost: number; marketingCost: number }> = {
  prod_pack_1_pro: {
    title: "باك كومبريسار و المفاتيح 4 في 1",
    sku: "ORVA-P1-4950",
    purchaseCost: 2400,
    marketingCost: 850,
  },
  prod_pack_2_elite: {
    title: "باك الفيسوز كراون CROWN 20V",
    sku: "ORVA-P2-12950",
    purchaseCost: 7200,
    marketingCost: 1400,
  },
  prod_pack_3_ultra: {
    title: "باك سودير كراون MMA-200 MINI",
    sku: "ORVA-P3-15950",
    purchaseCost: 9200,
    marketingCost: 1650,
  },
  prod_sac_yamaha: {
    title: "Sac Banane Moto Yamaha",
    sku: "ORVA-SAC-YAM",
    purchaseCost: 1900,
    marketingCost: 700,
  },
};

export function formatAttributionSourceLabel(source?: string | null): string {
  const clean = (source ?? "direct").trim().toLowerCase();
  return SOURCE_LABELS_AR[clean] || source || "زيارة مباشرة (Direct)";
}

export function getOrderCampaignGroup(order: OrvaOrder): {
  campaignKey: string;
  campaignName: string;
  attributionSource: string;
  fbCampaignId: string | null;
  utmCampaign: string | null;
} {
  const attributionSource = (order.attributionSource ?? "direct").trim().toLowerCase() || "direct";
  const fbCampaignId = order.fbCampaignId?.trim() || null;
  const utmCampaign = order.utmCampaign?.trim() || null;

  if (fbCampaignId) {
    return {
      campaignKey: `fb:${fbCampaignId}`,
      campaignName: utmCampaign || `Meta Campaign #${fbCampaignId}`,
      attributionSource: attributionSource === "direct" ? "facebook_ads" : attributionSource,
      fbCampaignId,
      utmCampaign,
    };
  }

  if (utmCampaign) {
    return {
      campaignKey: `utm:${utmCampaign}`,
      campaignName: utmCampaign,
      attributionSource: attributionSource === "direct" ? "facebook_ads" : attributionSource,
      fbCampaignId: null,
      utmCampaign,
    };
  }

  return {
    campaignKey: `src:${attributionSource}`,
    campaignName: formatAttributionSourceLabel(attributionSource),
    attributionSource,
    fbCampaignId: null,
    utmCampaign: null,
  };
}

function resolveProductForOrder(
  order: OrvaOrder,
  products: Product[],
): {
  productId: string;
  title: string;
  sku: string;
  purchaseCostDzd: number;
  marketingCostPerOrderDzd: number;
  linkedAdName: string | null;
  hasExplicitAdLink: boolean;
  campaignBudgetSpendDzd: number | null;
} | null {
  const rawName = (order.productName ?? "").trim();
  const lowerName = rawName.toLowerCase();
  const matched = matchOrderToProduct(rawName);

  // 1. Check live catalog products by metaAdsLink, ID, SKU, slug, or title match
  for (const prod of products) {
    const link = prod.metaAdsLink;
    const linkMatchesOrder =
      Boolean(link?.enabled) &&
      Boolean(
        (link?.campaignId && order.fbCampaignId && link.campaignId.trim() === order.fbCampaignId.trim()) ||
          (link?.adId && order.fbAdId && link.adId.trim() === order.fbAdId.trim()) ||
          (link?.adsetId && order.fbAdsetId && link.adsetId.trim() === order.fbAdsetId.trim()) ||
          (link?.campaignName &&
            order.utmCampaign &&
            link.campaignName.trim().toLowerCase() === order.utmCampaign.trim().toLowerCase()),
      );

    const nameMatchesProd =
      (matched.matchedProductId && prod.id === matched.matchedProductId) ||
      (matched.matchedSku && prod.sku && prod.sku.toLowerCase() === matched.matchedSku.toLowerCase()) ||
      (prod.title && lowerName && (lowerName.includes(prod.title.toLowerCase()) || prod.title.toLowerCase().includes(lowerName))) ||
      (prod.slug && lowerName.includes(prod.slug.toLowerCase())) ||
      (prod.sku && lowerName.includes(prod.sku.toLowerCase())) ||
      (matched.matchedProductId === "prod_pack_1_pro" && (prod.slug === "pack1" || prod.sku?.includes("P1"))) ||
      (matched.matchedProductId === "prod_pack_2_elite" && (prod.slug === "pack2" || prod.sku?.includes("P2"))) ||
      (matched.matchedProductId === "prod_pack_3_ultra" && (prod.slug === "pack3" || prod.sku?.includes("P3")));

    if (linkMatchesOrder || nameMatchesProd) {
      const fallbackDefaults = matched.matchedProductId ? DEFAULT_PRODUCT_COSTS_FALLBACK[matched.matchedProductId] : undefined;
      const cpaFromLink =
        link?.enabled && Number(link.computedCpaDzd) > 0 ? Math.round(Number(link.computedCpaDzd)) : 0;
      const marketingCost =
        cpaFromLink > 0
          ? cpaFromLink
          : prod.marketingCostPerOrder > 0
            ? prod.marketingCostPerOrder
            : fallbackDefaults?.marketingCost ?? 850;
      const purchaseCost =
        prod.purchaseCost > 0 ? prod.purchaseCost : fallbackDefaults?.purchaseCost ?? 0;

      return {
        productId: prod.id,
        title: prod.title,
        sku: prod.sku || fallbackDefaults?.sku || "ORVA-PROD",
        purchaseCostDzd: purchaseCost,
        marketingCostPerOrderDzd: marketingCost,
        linkedAdName: link?.enabled ? link.adName || link.campaignName || link.campaignId || "Meta Ad" : null,
        hasExplicitAdLink: Boolean(link?.enabled),
        campaignBudgetSpendDzd:
          linkMatchesOrder && link?.costMode === "campaign_budget_cpa" && Number(link.campaignSpendDzd) > 0
            ? Math.round(Number(link.campaignSpendDzd))
            : null,
      };
    }
  }

  // 2. Fallback to known pack mappings if catalog products aren't loaded yet
  if (matched.matchedProductId && DEFAULT_PRODUCT_COSTS_FALLBACK[matched.matchedProductId]) {
    const fb = DEFAULT_PRODUCT_COSTS_FALLBACK[matched.matchedProductId];
    return {
      productId: matched.matchedProductId,
      title: fb.title,
      sku: fb.sku,
      purchaseCostDzd: fb.purchaseCost,
      marketingCostPerOrderDzd: fb.marketingCost,
      linkedAdName: null,
      hasExplicitAdLink: false,
      campaignBudgetSpendDzd: null,
    };
  }

  return null;
}

export function computeCampaignProfitability(
  orders: OrvaOrder[],
  costConfigs: Record<string, Partial<CampaignCostInput>> = {},
  defaultCosts: Partial<CampaignCostInput> = {},
  products: Product[] = [],
): CampaignProfitabilityRow[] {
  const defaultUnitCogs = Math.max(0, Number(defaultCosts.unitCogsDzd ?? 0));
  const defaultReturnLoss = Math.max(0, Number(defaultCosts.returnShippingLossDzd ?? 450));
  const defaultEstimatedMetaCpa = Math.max(0, Number(defaultCosts.estimatedMetaCpaDzd ?? 850));

  interface Bucket {
    meta: ReturnType<typeof getOrderCampaignGroup>;
    adsets: Set<string>;
    ads: Set<string>;
    totalOrders: number;
    confirmedOrders: number;
    redexMatchedOrders: number;
    deliveredOrders: number;
    returnedOrders: number;
    cancelledOrders: number;
    deliveredCodTotalDzd: number;
    deliveredProductRevenueDzd: number;
    estimatedOrderMarketingSpendDzd: number;
    productCalculatedCogsDzd: number;
    hasExplicitProductAdLink: boolean;
    explicitCampaignBudgetSpendDzd: number | null;
    productStats: Map<string, LinkedCampaignProductSummary>;
  }

  const buckets = new Map<string, Bucket>();

  for (const order of orders) {
    const group = getOrderCampaignGroup(order);
    let bucket = buckets.get(group.campaignKey);
    if (!bucket) {
      bucket = {
        meta: group,
        adsets: new Set<string>(),
        ads: new Set<string>(),
        totalOrders: 0,
        confirmedOrders: 0,
        redexMatchedOrders: 0,
        deliveredOrders: 0,
        returnedOrders: 0,
        cancelledOrders: 0,
        deliveredCodTotalDzd: 0,
        deliveredProductRevenueDzd: 0,
        estimatedOrderMarketingSpendDzd: 0,
        productCalculatedCogsDzd: 0,
        hasExplicitProductAdLink: false,
        explicitCampaignBudgetSpendDzd: null,
        productStats: new Map<string, LinkedCampaignProductSummary>(),
      };
      buckets.set(group.campaignKey, bucket);
    }

    if (order.fbAdsetId) bucket.adsets.add(order.fbAdsetId);
    if (order.fbAdId) bucket.ads.add(order.fbAdId);

    bucket.totalOrders += 1;

    const status = (order.status || "").toLowerCase();
    const tracking = order.redexTrackingId ?? order.redexTrackingCode;
    if (order.inRedex || tracking) {
      bucket.redexMatchedOrders += 1;
    }

    const matchedProd = resolveProductForOrder(order, products);
    const qty = Math.max(1, Number(order.quantity ?? 1) || 1);
    const orderCpaDzd = matchedProd
      ? matchedProd.marketingCostPerOrderDzd
      : defaultEstimatedMetaCpa;

    bucket.estimatedOrderMarketingSpendDzd += orderCpaDzd;

    if (matchedProd) {
      if (matchedProd.hasExplicitAdLink) {
        bucket.hasExplicitProductAdLink = true;
      }
      if (matchedProd.campaignBudgetSpendDzd && matchedProd.campaignBudgetSpendDzd > 0) {
        bucket.explicitCampaignBudgetSpendDzd = matchedProd.campaignBudgetSpendDzd;
      }
      const existingProdStat = bucket.productStats.get(matchedProd.productId) ?? {
        productId: matchedProd.productId,
        title: matchedProd.title,
        sku: matchedProd.sku,
        ordersCount: 0,
        deliveredCount: 0,
        purchaseCostDzd: matchedProd.purchaseCostDzd,
        marketingCostPerOrderDzd: matchedProd.marketingCostPerOrderDzd,
        linkedAdName: matchedProd.linkedAdName,
      };
      existingProdStat.ordersCount += 1;
      if (status === "delivered") {
        existingProdStat.deliveredCount += 1;
      }
      bucket.productStats.set(matchedProd.productId, existingProdStat);
    }

    if (status === "confirmed" || status === "pushed" || status === "shipped" || status === "redex_station") {
      bucket.confirmedOrders += 1;
    } else if (status === "delivered") {
      bucket.confirmedOrders += 1;
      bucket.deliveredOrders += 1;
      const codTotal = order.grandTotalDzd ?? order.priceDzd ?? 0;
      const shipping = order.shippingDzd ?? 0;
      const productRev = order.priceDzd ?? Math.max(0, codTotal - shipping);
      bucket.deliveredCodTotalDzd += codTotal;
      bucket.deliveredProductRevenueDzd += productRev;

      const unitPurchaseCost =
        defaultUnitCogs > 0
          ? defaultUnitCogs
          : matchedProd && matchedProd.purchaseCostDzd > 0
            ? matchedProd.purchaseCostDzd
            : 0;
      bucket.productCalculatedCogsDzd += unitPurchaseCost * qty;
    } else if (status === "returned") {
      bucket.confirmedOrders += 1;
      bucket.returnedOrders += 1;
    } else if (status === "cancelled" || status === "canceled" || status === "deleted") {
      bucket.cancelledOrders += 1;
    }
  }

  const rows: CampaignProfitabilityRow[] = [];

  for (const bucket of buckets.values()) {
    const cfg = costConfigs[bucket.meta.campaignKey] ?? {};

    // Automatic Meta Ads Spend Estimation
    const estimatedMetaSpendDzd =
      bucket.explicitCampaignBudgetSpendDzd && bucket.explicitCampaignBudgetSpendDzd > 0
        ? bucket.explicitCampaignBudgetSpendDzd
        : Math.round(bucket.estimatedOrderMarketingSpendDzd);

    let adSpendDzd = 0;
    let adSpendSource: AdSpendSourceType = "meta_estimate";

    const hasManualOverride =
      cfg.isManualOverride === true ||
      (cfg.isManualOverride === undefined && typeof cfg.adSpendDzd === "number" && cfg.adSpendDzd > 0);

    if (hasManualOverride && typeof cfg.adSpendDzd === "number" && cfg.adSpendDzd >= 0) {
      adSpendDzd = Math.round(cfg.adSpendDzd);
      adSpendSource = "manual";
    } else if (typeof cfg.metaApiSpendDzd === "number" && cfg.metaApiSpendDzd > 0) {
      adSpendDzd = Math.round(cfg.metaApiSpendDzd);
      adSpendSource = "meta_api";
    } else if (bucket.hasExplicitProductAdLink) {
      adSpendDzd = estimatedMetaSpendDzd;
      adSpendSource = "product_link";
    } else {
      adSpendDzd = estimatedMetaSpendDzd;
      adSpendSource = "meta_estimate";
    }

    const customUnitCogs = cfg.unitCogsDzd !== undefined ? Math.max(0, Number(cfg.unitCogsDzd)) : null;
    const returnShippingLossDzd = Math.max(0, Number(cfg.returnShippingLossDzd ?? defaultReturnLoss));

    const outcomes = bucket.deliveredOrders + bucket.returnedOrders;
    const deliveryRatePct = outcomes > 0 ? Math.round((bucket.deliveredOrders / outcomes) * 100) : 0;

    const totalCogsDzd =
      customUnitCogs !== null && customUnitCogs > 0
        ? bucket.deliveredOrders * customUnitCogs
        : defaultUnitCogs > 0
          ? bucket.deliveredOrders * defaultUnitCogs
          : Math.round(bucket.productCalculatedCogsDzd);

    const totalReturnLossDzd = bucket.returnedOrders * returnShippingLossDzd;
    const netProfitDzd = bucket.deliveredProductRevenueDzd - totalCogsDzd - totalReturnLossDzd - adSpendDzd;

    const roas = adSpendDzd > 0 ? Number((bucket.deliveredProductRevenueDzd / adSpendDzd).toFixed(2)) : null;
    const costPerOrderDzd =
      adSpendDzd > 0 && bucket.totalOrders > 0 ? Math.round(adSpendDzd / bucket.totalOrders) : null;
    const costPerDeliveredDzd =
      adSpendDzd > 0 && bucket.deliveredOrders > 0 ? Math.round(adSpendDzd / bucket.deliveredOrders) : null;

    rows.push({
      campaignKey: bucket.meta.campaignKey,
      campaignName: bucket.meta.campaignName,
      attributionSource: bucket.meta.attributionSource,
      fbCampaignId: bucket.meta.fbCampaignId,
      fbAdsetIds: Array.from(bucket.adsets),
      fbAdIds: Array.from(bucket.ads),
      utmCampaign: bucket.meta.utmCampaign,
      adsetCount: bucket.adsets.size,
      adCount: bucket.ads.size,
      totalOrders: bucket.totalOrders,
      confirmedOrders: bucket.confirmedOrders,
      redexMatchedOrders: bucket.redexMatchedOrders,
      deliveredOrders: bucket.deliveredOrders,
      returnedOrders: bucket.returnedOrders,
      cancelledOrders: bucket.cancelledOrders,
      deliveryRatePct,
      deliveredCodTotalDzd: bucket.deliveredCodTotalDzd,
      deliveredProductRevenueDzd: bucket.deliveredProductRevenueDzd,
      adSpendDzd,
      estimatedMetaSpendDzd,
      adSpendSource,
      totalCogsDzd,
      totalReturnLossDzd,
      netProfitDzd,
      roas,
      costPerOrderDzd,
      costPerDeliveredDzd,
      linkedProducts: Array.from(bucket.productStats.values()),
    });
  }

  return rows.sort(
    (a, b) =>
      b.deliveredOrders - a.deliveredOrders ||
      b.totalOrders - a.totalOrders ||
      a.campaignName.localeCompare(b.campaignName),
  );
}
