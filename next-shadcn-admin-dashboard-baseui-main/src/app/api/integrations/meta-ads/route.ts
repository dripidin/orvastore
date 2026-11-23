import { type NextRequest, NextResponse } from "next/server";

import { getAdminSettingsAction } from "@/app/actions/settings";
import { computeCampaignProfitability } from "@/lib/analytics/campaign-profitability";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { adminGetProduct, adminListProducts, adminUpdateProduct } from "@/lib/catalog/server";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { getStoredFallbackOrders } from "@/lib/orders-store";
import { normalizeOrvaOrder, type OrvaOrder } from "@/lib/orva-api";
import { computeWeightedProductCpa, type ProductMetaAdLink } from "@/lib/repository/product-types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface MetaAdCampaignSummary {
  campaignKey: string;
  campaignId: string;
  campaignName: string;
  adsetId: string | null;
  adId: string | null;
  source: "meta_graph_api" | "store_attribution" | "product_linked";
  status: "ACTIVE" | "PAUSED" | "TRACKED";
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  deliveryRatePct: number;
  spendUsd: number | null;
  spendDzd: number;
  estimatedCpaDzd: number;
  costPerDeliveredDzd: number | null;
  roas: number | null;
  netProfitDzd: number;
  linkedProductIds: string[];
  linkedProductTitles: string[];
}

async function loadOrdersForMetaAnalytics(): Promise<OrvaOrder[]> {
  const out: OrvaOrder[] = [];
  const seen = new Set<string>();

  try {
    const supabase = getSupabaseServerClient() as any;
    if (supabase) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const norm = normalizeOrvaOrder(row);
          if (norm && !seen.has(norm.id)) {
            seen.add(norm.id);
            out.push(norm);
          }
        }
      }
    }
  } catch {
    // fallback below
  }

  for (const fb of getStoredFallbackOrders()) {
    const norm = normalizeOrvaOrder(fb);
    if (norm && !seen.has(norm.id)) {
      seen.add(norm.id);
      out.push(norm);
    }
  }

  return out;
}

/**
 * Queries Meta Graph API v21.0 (mirroring Varnan-Tech/Meta-Ads-MCP insights.py & campaigns.py)
 * when META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID are configured.
 */
async function fetchLiveMetaGraphCampaigns(options: {
  accessToken: string;
  adAccountId: string;
  timeRange: string;
  exchangeRateDzd: number;
}): Promise<
  Array<{
    campaignId: string;
    campaignName: string;
    status: "ACTIVE" | "PAUSED";
    spendUsd: number;
    spendDzd: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpcUsd: number;
  }>
> {
  const cleanAccount = options.adAccountId.startsWith("act_") ? options.adAccountId : `act_${options.adAccountId}`;
  const preset = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "lifetime"].includes(
    options.timeRange,
  )
    ? options.timeRange
    : "last_30d";

  const fields = encodeURIComponent(
    `id,name,status,objective,daily_budget,lifetime_budget,insights.date_preset(${preset}){spend,impressions,reach,clicks,ctr,cpc,cpm}`,
  );
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(cleanAccount)}/campaigns?fields=${fields}&limit=25&access_token=${encodeURIComponent(options.accessToken)}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as {
      data?: Array<{
        id?: string;
        name?: string;
        status?: string;
        insights?: {
          data?: Array<{
            spend?: string;
            impressions?: string;
            clicks?: string;
            ctr?: string;
            cpc?: string;
          }>;
        };
      }>;
    } | null;

    return (json?.data ?? []).map((item) => {
      const insight = item.insights?.data?.[0] ?? {};
      const spendUsd = Number(insight.spend ?? 0) || 0;
      const spendDzd = Math.round(spendUsd * options.exchangeRateDzd);
      return {
        campaignId: String(item.id ?? ""),
        campaignName: String(item.name ?? `Campaign ${item.id}`),
        status: String(item.status ?? "ACTIVE").toUpperCase() === "PAUSED" ? "PAUSED" : "ACTIVE",
        spendUsd,
        spendDzd,
        impressions: Number(insight.impressions ?? 0) || 0,
        clicks: Number(insight.clicks ?? 0) || 0,
        ctr: Number(insight.ctr ?? 0) || 0,
        cpcUsd: Number(insight.cpc ?? 0) || 0,
      };
    });
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const timeRange = request.nextUrl.searchParams.get("timeRange") || "last_7d";
    const limitParam = Math.max(1, Math.min(100, Number(request.nextUrl.searchParams.get("limit") || 10) || 10));
    const exchangeRateDzd = Math.max(
      1,
      Number(request.nextUrl.searchParams.get("exchangeRateDzd") || process.env.META_USD_TO_DZD_RATE || 245) || 245,
    );

    const [settings, products, orders, returnFeesByWilaya] = await Promise.all([
      getAdminSettingsAction(),
      adminListProducts().catch(() => []),
      loadOrdersForMetaAnalytics(),
      getReturnFeesByWilayaMap().catch(() => ({}) as Record<number, number>),
    ]);

    const accessToken = (
      process.env.META_ADS_ACCESS_TOKEN ||
      process.env.META_ACCESS_TOKEN ||
      settings.metaPixel?.capiToken ||
      ""
    ).trim();
    const adAccountId = (process.env.META_AD_ACCOUNT_ID || process.env.FB_AD_ACCOUNT_ID || "").trim();

    const liveGraphCampaigns =
      accessToken && adAccountId
        ? await fetchLiveMetaGraphCampaigns({
            accessToken,
            adAccountId,
            timeRange,
            exchangeRateDzd,
          })
        : [];

    const costConfigs: Record<string, { metaApiSpendDzd?: number }> = {};
    for (const live of liveGraphCampaigns) {
      if (live.campaignId && live.spendDzd > 0) {
        costConfigs[`fb:${live.campaignId}`] = { metaApiSpendDzd: live.spendDzd };
      }
      if (live.campaignName && live.spendDzd > 0) {
        costConfigs[`utm:${live.campaignName}`] = { metaApiSpendDzd: live.spendDzd };
      }
    }

    const profitabilityRows = computeCampaignProfitability(orders, costConfigs, {}, products, returnFeesByWilaya);

    const campaigns: MetaAdCampaignSummary[] = profitabilityRows.map((row) => {
      const liveMatch = liveGraphCampaigns.find(
        (c) => c.campaignId === row.fbCampaignId || c.campaignName === row.utmCampaign,
      );
      const cpa = row.costPerOrderDzd ?? (row.linkedProducts[0]?.marketingCostPerOrderDzd || 850);

      return {
        campaignKey: row.campaignKey,
        campaignId: row.fbCampaignId || row.utmCampaign || row.campaignKey,
        campaignName: liveMatch?.campaignName || row.campaignName,
        adsetId: row.fbAdsetIds[0] ?? null,
        adId: row.fbAdIds[0] ?? null,
        source: liveMatch
          ? "meta_graph_api"
          : row.adSpendSource === "product_link"
            ? "product_linked"
            : "store_attribution",
        status: liveMatch?.status ?? "TRACKED",
        totalOrders: row.totalOrders,
        deliveredOrders: row.deliveredOrders,
        returnedOrders: row.returnedOrders,
        deliveryRatePct: row.deliveryRatePct,
        spendUsd: liveMatch ? liveMatch.spendUsd : Number((row.adSpendDzd / exchangeRateDzd).toFixed(2)),
        spendDzd: row.adSpendDzd,
        estimatedCpaDzd: cpa,
        costPerDeliveredDzd: row.costPerDeliveredDzd,
        roas: row.roas,
        netProfitDzd: row.netProfitDzd,
        linkedProductIds: row.linkedProducts.map((p) => p.productId),
        linkedProductTitles: row.linkedProducts.map((p) => p.title),
      };
    });

    // Include product-linked campaigns across Many-to-Many metaAdsLinks that have no orders yet
    for (const prod of products) {
      const links =
        prod.metaAdsLinks && prod.metaAdsLinks.length > 0
          ? prod.metaAdsLinks
          : prod.metaAdsLink
            ? [prod.metaAdsLink]
            : [];
      for (const link of links) {
        if (!link?.enabled) continue;
        const cid = link.campaignId || link.adId || link.campaignName || `prod-ad-${prod.id}`;
        const existing = campaigns.find((c) => c.campaignId === cid || c.campaignName === link.campaignName);
        if (existing) {
          if (!existing.linkedProductIds.includes(prod.id)) {
            existing.linkedProductIds.push(prod.id);
            existing.linkedProductTitles.push(prod.title);
          }
          continue;
        }
        const spendDzd = Number(link.campaignSpendDzd) || prod.marketingCostPerOrder;
        campaigns.push({
          campaignKey: `link:${cid}`,
          campaignId: cid,
          campaignName: link.campaignName || link.adName || `حملة ${prod.title}`,
          adsetId: link.adsetId ?? null,
          adId: link.adId ?? null,
          source: "product_linked",
          status: "ACTIVE",
          totalOrders: Number(link.attributedOrdersCount) || 0,
          deliveredOrders: 0,
          returnedOrders: 0,
          deliveryRatePct: 0,
          spendUsd: Number(link.campaignSpendUsd) || Number((spendDzd / exchangeRateDzd).toFixed(2)),
          spendDzd,
          estimatedCpaDzd: link.computedCpaDzd || prod.marketingCostPerOrder,
          costPerDeliveredDzd: null,
          roas: null,
          netProfitDzd: 0,
          linkedProductIds: [prod.id],
          linkedProductTitles: [prod.title],
        });
      }
    }

    const totalCampaignsCount = campaigns.length;
    const pagedCampaigns = campaigns.slice(0, limitParam);

    return NextResponse.json({
      success: true,
      metaMcpCompatible: true,
      pixelId: settings.metaPixel?.pixelId || null,
      liveGraphConnected: liveGraphCampaigns.length > 0,
      exchangeRateDzd,
      timeRange,
      limit: limitParam,
      totalCampaignsCount,
      hasMore: totalCampaignsCount > pagedCampaigns.length,
      returnFeesByWilaya,
      returnFeeWilayasSynced: Object.keys(returnFeesByWilaya).length,
      campaigns: pagedCampaigns,
      allCampaignsCount: totalCampaignsCount,
      products: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        title: p.title,
        sellingPrice: p.sellingPrice,
        purchaseCost: p.purchaseCost,
        marketingCostPerOrder: p.marketingCostPerOrder,
        metaAdsLink: p.metaAdsLink ?? null,
        metaAdsLinks: p.metaAdsLinks ?? (p.metaAdsLink ? [p.metaAdsLink] : []),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "تعذر تحميل بيانات Meta Ads.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      productId?: string;
      metaAdsLink?: Partial<ProductMetaAdLink> | null;
      metaAdsLinks?: Array<Partial<ProductMetaAdLink>>;
      linkId?: string;
      unlink?: boolean;
    };

    const productId = (body.productId ?? "").trim();
    if (!productId) {
      return NextResponse.json({ success: false, error: "معرف المنتج مطلوب." }, { status: 400 });
    }

    const existingProduct = await adminGetProduct(productId);
    if (!existingProduct) {
      return NextResponse.json({ success: false, error: "المنتج غير موجود." }, { status: 404 });
    }

    const normalizeSingleLink = (linkInput: Partial<ProductMetaAdLink>, idx: number): ProductMetaAdLink => {
      const costMode = linkInput.costMode ?? "campaign_budget_cpa";
      const exchangeRateDzd = Math.max(1, Number(linkInput.exchangeRateDzd ?? 245) || 245);
      const campaignSpendUsd = Math.max(0, Number(linkInput.campaignSpendUsd ?? 0) || 0);
      const rawSpendDzd = Math.max(0, Number(linkInput.campaignSpendDzd ?? 0) || 0);
      const campaignSpendDzd =
        rawSpendDzd > 0 ? Math.round(rawSpendDzd) : Math.round(campaignSpendUsd * exchangeRateDzd);
      const attributedOrdersCount = Math.max(1, Math.round(Number(linkInput.attributedOrdersCount ?? 1) || 1));

      let computedCpaDzd = Math.max(0, Math.round(Number(linkInput.computedCpaDzd ?? 0) || 0));
      if (costMode === "campaign_budget_cpa" && campaignSpendDzd > 0) {
        computedCpaDzd = Math.max(1, Math.round(campaignSpendDzd / attributedOrdersCount));
      } else if (computedCpaDzd <= 0 && campaignSpendDzd > 0) {
        computedCpaDzd = Math.max(1, Math.round(campaignSpendDzd / attributedOrdersCount));
      } else if (computedCpaDzd <= 0) {
        computedCpaDzd = existingProduct.marketingCostPerOrder || 850;
      }

      return {
        id: linkInput.id || `lnk-${Date.now()}-${idx}`,
        enabled: linkInput.enabled !== false,
        campaignId: linkInput.campaignId?.trim() || null,
        campaignName: linkInput.campaignName?.trim() || null,
        adsetId: linkInput.adsetId?.trim() || null,
        adsetName: linkInput.adsetName?.trim() || null,
        adId: linkInput.adId?.trim() || null,
        adName: linkInput.adName?.trim() || null,
        costMode,
        campaignSpendUsd:
          campaignSpendUsd > 0 ? campaignSpendUsd : Number((campaignSpendDzd / exchangeRateDzd).toFixed(2)),
        campaignSpendDzd,
        exchangeRateDzd,
        attributedOrdersCount,
        allocationWeight: Math.max(0.01, Number(linkInput.allocationWeight ?? 1) || 1),
        isPrimary: linkInput.isPrimary ?? idx === 0,
        computedCpaDzd,
        lastSyncedAt: new Date().toISOString(),
      };
    };

    if (body.unlink || (body.metaAdsLink === null && !Array.isArray(body.metaAdsLinks))) {
      const updated = await adminUpdateProduct(productId, {
        metaAdsLink: null,
        metaAdsLinks: [],
      });
      return NextResponse.json({
        success: true,
        product: updated,
        message: "تم فك ربط الإعلانات عن المنتج.",
      });
    }

    if (Array.isArray(body.metaAdsLinks)) {
      const normalizedList = body.metaAdsLinks.map((l, i) => normalizeSingleLink(l, i));
      const primary =
        normalizedList.find((l) => l.isPrimary && l.enabled) ?? normalizedList.find((l) => l.enabled) ?? null;
      const weightedCpa = computeWeightedProductCpa(normalizedList, existingProduct.marketingCostPerOrder);
      const updated = await adminUpdateProduct(productId, {
        marketingCostPerOrder: weightedCpa,
        metaAdsLink: primary,
        metaAdsLinks: normalizedList,
      });
      return NextResponse.json({
        success: true,
        product: updated,
        computedCpaDzd: weightedCpa,
        metaAdsLink: primary,
        metaAdsLinks: normalizedList,
        message: `تم ربط المنتج بـ ${normalizedList.length} حملات وحساب متوسط CPA المرجّح بـ ${weightedCpa} د.ج.`,
      });
    }

    const singleLink = normalizeSingleLink(body.metaAdsLink ?? {}, 0);
    const updated = await adminUpdateProduct(productId, {
      marketingCostPerOrder: singleLink.computedCpaDzd,
      metaAdsLink: singleLink,
      metaAdsLinks: [singleLink],
    });

    return NextResponse.json({
      success: true,
      product: updated,
      computedCpaDzd: singleLink.computedCpaDzd,
      metaAdsLink: singleLink,
      metaAdsLinks: [singleLink],
      message: `تم ربط المنتج بالحملة الإعلانية وتحديد تكلفة التسويق تلقائياً بـ ${singleLink.computedCpaDzd} د.ج لكل طلب.`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "تعذر حفظ ربط الإعلان بالمنتج.",
      },
      { status: 500 },
    );
  }
}
