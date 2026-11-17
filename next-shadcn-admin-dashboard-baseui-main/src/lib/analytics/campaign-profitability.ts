import type { OrvaOrder } from "@/lib/orva-api";

export interface CampaignCostInput {
  adSpendDzd: number;
  unitCogsDzd: number;
  returnShippingLossDzd: number;
}

export interface CampaignProfitabilityRow {
  campaignKey: string;
  campaignName: string;
  attributionSource: string;
  fbCampaignId: string | null;
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
  totalCogsDzd: number;
  totalReturnLossDzd: number;
  netProfitDzd: number;
  roas: number | null;
  costPerOrderDzd: number | null;
  costPerDeliveredDzd: number | null;
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
      attributionSource,
      fbCampaignId,
      utmCampaign,
    };
  }

  if (utmCampaign) {
    return {
      campaignKey: `utm:${utmCampaign}`,
      campaignName: utmCampaign,
      attributionSource,
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

export function computeCampaignProfitability(
  orders: OrvaOrder[],
  costConfigs: Record<string, Partial<CampaignCostInput>> = {},
  defaultCosts: Partial<CampaignCostInput> = {},
): CampaignProfitabilityRow[] {
  const defaultUnitCogs = Math.max(0, Number(defaultCosts.unitCogsDzd ?? 0));
  const defaultReturnLoss = Math.max(0, Number(defaultCosts.returnShippingLossDzd ?? 450));

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
    const adSpendDzd = Math.max(0, Number(cfg.adSpendDzd ?? 0));
    const unitCogsDzd = Math.max(0, Number(cfg.unitCogsDzd ?? defaultUnitCogs));
    const returnShippingLossDzd = Math.max(0, Number(cfg.returnShippingLossDzd ?? defaultReturnLoss));

    const outcomes = bucket.deliveredOrders + bucket.returnedOrders;
    const deliveryRatePct = outcomes > 0 ? Math.round((bucket.deliveredOrders / outcomes) * 100) : 0;

    const totalCogsDzd = bucket.deliveredOrders * unitCogsDzd;
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
      totalCogsDzd,
      totalReturnLossDzd,
      netProfitDzd,
      roas,
      costPerOrderDzd,
      costPerDeliveredDzd,
    });
  }

  return rows.sort(
    (a, b) =>
      b.deliveredOrders - a.deliveredOrders ||
      b.totalOrders - a.totalOrders ||
      a.campaignName.localeCompare(b.campaignName),
  );
}
