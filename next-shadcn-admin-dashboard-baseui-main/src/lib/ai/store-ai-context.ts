import { getAdminSettingsAction } from "@/app/actions/settings";
import { computeCampaignProfitability, type CampaignProfitabilityRow } from "@/lib/analytics/campaign-profitability";
import { adminListProducts } from "@/lib/catalog/server";
import { normalizeOrvaOrder } from "@/lib/orva-api";
import { getStoredFallbackOrders } from "@/lib/orders-store";
import { DEFAULT_MOCK_ORDERS } from "@/lib/repository/mock-orders-dataset";
import { computeEstimatedOrderProfit, computeUnitMargin, type Product } from "@/lib/repository/product-types";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface NormalizedAiOrder {
  id: string;
  customer: string;
  phone: string;
  wilaya: string;
  commune: string;
  deliveryType: string;
  productName: string;
  totalDzd: number;
  status: string;
  redexTrackingId: string;
  campaign: string;
  source: string;
  createdAt: string;
}

export interface ProductEconomicsSummary {
  id: string;
  sku: string;
  title: string;
  sellingPriceDzd: number;
  purchaseCostDzd: number;
  unitMarginDzd: number;
  marketingCostPerOrderDzd: number;
  estimatedProfitPerOrderDzd: number;
  breakEvenCpaDzd: number;
  linkedMetaCampaign: string | null;
  stockQuantity: number;
  stockStatus: string;
}

export interface WilayaMarketingEfficiency {
  wilaya: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  deliveryRatePct: number;
  recommendation: "SCALE" | "HOLD" | "OPTIMIZE_CONFIRMATION";
}

export interface StoreReportSnapshot {
  totalOrders: number;
  statusCounts: {
    pending: number;
    confirmed: number;
    shipped: number;
    delivered: number;
    returned: number;
    cancelled: number;
  };
  deliveredRevenueDzd: number;
  totalPipelineDzd: number;
  redexTrackedCount: number;
  recentOrders: NormalizedAiOrder[];
  topWilayas: Array<{ wilaya: string; count: number }>;
  topProducts: Array<{ product: string; count: number; revenueDzd: number }>;
  catalogSummary: Array<{ id: string; title: string; priceDzd: number; status: string; stockStatus: string }>;
  marketingAnalytics?: {
    totalAdSpendDzd: number;
    totalCogsDzd: number;
    totalReturnLossDzd: number;
    estimatedNetProfitDzd: number;
    overallRoas: number | null;
    overallCpaDzd: number | null;
    overallCpdDzd: number | null;
    overallDeliveryRatePct: number;
    campaigns: CampaignProfitabilityRow[];
    productEconomics: ProductEconomicsSummary[];
    wilayaEfficiency: WilayaMarketingEfficiency[];
  };
}

function normalizeStatus(raw: unknown): string {
  const s = String(raw ?? "pending")
    .trim()
    .toLowerCase();
  if (s === "confirmed") return "confirmed";
  if (s === "shipped" || s === "in_transit" || s === "out_for_delivery") return "shipped";
  if (s === "delivered") return "delivered";
  if (s === "returned") return "returned";
  if (s === "cancelled" || s === "deleted") return "cancelled";
  return "pending";
}

function parseAmountDzd(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^\d.]/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function mapRawOrder(row: Record<string, unknown>): NormalizedAiOrder {
  const id = String(row.order_number ?? row.orderNumber ?? row.orderId ?? row.order_id ?? row.id ?? "—");
  const customer = String(
    row.customer_name ?? row.customerName ?? row.fullName ?? row.full_name ?? row.customer ?? "زبون",
  );
  const phone = String(row.customer_phone ?? row.customerPhone ?? row.phone ?? "");
  const wilaya = String(row.wilaya_name ?? row.wilayaName ?? row.wilaya ?? "—");
  const commune = String(row.commune_name ?? row.communeName ?? row.commune ?? "—");
  const deliveryType = String(row.delivery_type ?? row.deliveryType ?? "DOMICILE");
  const productName = String(row.product_name ?? row.productName ?? row.items ?? "منتج ORVA");
  const totalDzd =
    parseAmountDzd(row.total_payable) ||
    parseAmountDzd(row.totalPayable) ||
    parseAmountDzd(row.grand_total_dzd) ||
    parseAmountDzd(row.grandTotal) ||
    parseAmountDzd(row.total) ||
    parseAmountDzd(row.priceNum);
  const status = normalizeStatus(row.status);
  const redexTrackingId = String(
    row.redex_tracking_id ?? row.redexTrackingId ?? row.redex_tracking_code ?? row.tracking_code ?? "",
  );
  const campaign = String(row.utm_campaign ?? row.utmCampaign ?? row.fb_campaign_id ?? row.fbCampaignId ?? "");
  const source = String(row.attribution_source ?? row.attributionSource ?? "direct");
  const createdAt = String(row.created_at ?? row.createdAt ?? row.date ?? "");

  return {
    id,
    customer,
    phone,
    wilaya,
    commune,
    deliveryType,
    productName,
    totalDzd,
    status,
    redexTrackingId,
    campaign,
    source,
    createdAt,
  };
}

export async function loadLiveOrdersForAi(): Promise<NormalizedAiOrder[]> {
  try {
    const supabase = getSupabaseServerClient() as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          order: (
            col: string,
            opts: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
          };
        };
      };
    } | null;

    if (supabase) {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(mapRawOrder);
      }
    }
  } catch {
    // Fall back to local/mock orders store
  }

  const stored = getStoredFallbackOrders();
  if (stored.length > 0) {
    return stored.map((item) => mapRawOrder(item as unknown as Record<string, unknown>));
  }

  return DEFAULT_MOCK_ORDERS.map((item) => mapRawOrder(item as unknown as Record<string, unknown>));
}

export async function buildStoreReportSnapshot(): Promise<{
  snapshot: StoreReportSnapshot;
  allOrders: NormalizedAiOrder[];
}> {
  const allOrders = await loadLiveOrdersForAi();

  const statusCounts = {
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    returned: 0,
    cancelled: 0,
  };

  let deliveredRevenueDzd = 0;
  let totalPipelineDzd = 0;
  let redexTrackedCount = 0;

  const wilayaMap = new Map<string, number>();
  const productMap = new Map<string, { count: number; revenueDzd: number }>();

  for (const order of allOrders) {
    const st = order.status as keyof typeof statusCounts;
    if (st in statusCounts) {
      statusCounts[st] += 1;
    } else {
      statusCounts.pending += 1;
    }

    if (order.status !== "cancelled") {
      totalPipelineDzd += order.totalDzd;
    }
    if (order.status === "delivered") {
      deliveredRevenueDzd += order.totalDzd;
    }
    if (order.redexTrackingId) {
      redexTrackedCount += 1;
    }

    if (order.wilaya && order.wilaya !== "—") {
      wilayaMap.set(order.wilaya, (wilayaMap.get(order.wilaya) ?? 0) + 1);
    }

    const prodKey = order.productName || "منتج ORVA";
    const prevProd = productMap.get(prodKey) ?? { count: 0, revenueDzd: 0 };
    prevProd.count += 1;
    if (order.status === "delivered") {
      prevProd.revenueDzd += order.totalDzd;
    }
    productMap.set(prodKey, prevProd);
  }

  const topWilayas = Array.from(wilayaMap.entries())
    .map(([wilaya, count]) => ({ wilaya, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topProducts = Array.from(productMap.entries())
    .map(([product, stats]) => ({ product, count: stats.count, revenueDzd: stats.revenueDzd }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  let catalogSummary: StoreReportSnapshot["catalogSummary"] = [];
  let loadedProducts: Product[] = [];
  try {
    loadedProducts = await adminListProducts();
    catalogSummary = loadedProducts.slice(0, 20).map((p) => {
      let stockStatus = "in_stock";
      if (p.showOutOfStock || p.stockQuantity <= 0) {
        stockStatus = "out_of_stock";
      } else if (p.stockQuantity <= p.lowStockThreshold) {
        stockStatus = "low_stock";
      }
      return {
        id: p.id,
        title: p.title,
        priceDzd: p.sellingPrice,
        status: p.status,
        stockStatus,
      };
    });
  } catch {
    catalogSummary = [];
  }

  // Build Marketing & Campaign Profitability Analytics (Meta Ads Expert Engine)
  const orvaOrdersForProfitability = allOrders
    .map((o) =>
      normalizeOrvaOrder({
        orderId: o.id,
        fullName: o.customer,
        phone: o.phone,
        wilaya: o.wilaya,
        commune: o.commune,
        deliveryType: o.deliveryType,
        productName: o.productName,
        grandTotal: o.totalDzd,
        priceNum: o.totalDzd,
        status: o.status,
        in_redex: Boolean(o.redexTrackingId),
        redex_tracking_id: o.redexTrackingId || null,
        utm_campaign: o.campaign || null,
        attribution_source: o.source || "direct",
        created_at: o.createdAt,
      }),
    )
    .filter((o): o is NonNullable<typeof o> => o !== null);

  const campaigns = computeCampaignProfitability(orvaOrdersForProfitability, {}, {}, loadedProducts);

  let totalAdSpendDzd = 0;
  let totalCogsDzd = 0;
  let totalReturnLossDzd = 0;
  let estimatedNetProfitDzd = 0;

  for (const c of campaigns) {
    totalAdSpendDzd += c.adSpendDzd;
    totalCogsDzd += c.totalCogsDzd;
    totalReturnLossDzd += c.totalReturnLossDzd;
    estimatedNetProfitDzd += c.netProfitDzd;
  }

  const outcomesTotal = statusCounts.delivered + statusCounts.returned;
  const overallDeliveryRatePct =
    outcomesTotal > 0 ? Math.round((statusCounts.delivered / outcomesTotal) * 100) : 0;
  const overallRoas =
    totalAdSpendDzd > 0 ? Number((deliveredRevenueDzd / totalAdSpendDzd).toFixed(2)) : null;
  const overallCpaDzd =
    totalAdSpendDzd > 0 && allOrders.length > 0 ? Math.round(totalAdSpendDzd / allOrders.length) : null;
  const overallCpdDzd =
    totalAdSpendDzd > 0 && statusCounts.delivered > 0
      ? Math.round(totalAdSpendDzd / statusCounts.delivered)
      : null;

  const productEconomics: ProductEconomicsSummary[] = loadedProducts.slice(0, 15).map((p) => {
    const unitMarginDzd = computeUnitMargin(p.sellingPrice, p.purchaseCost);
    const marketingCostPerOrderDzd =
      p.metaAdsLink?.enabled && Number(p.metaAdsLink.computedCpaDzd) > 0
        ? Math.round(Number(p.metaAdsLink.computedCpaDzd))
        : p.marketingCostPerOrder || 850;
    const estimatedProfitPerOrderDzd = computeEstimatedOrderProfit(
      p.sellingPrice,
      p.purchaseCost,
      marketingCostPerOrderDzd,
      1,
    );
    const breakEvenCpaDzd = Math.max(0, unitMarginDzd - 200);
    let stockStatus = "in_stock";
    if (p.showOutOfStock || p.stockQuantity <= 0) stockStatus = "out_of_stock";
    else if (p.stockQuantity <= p.lowStockThreshold) stockStatus = "low_stock";

    return {
      id: p.id,
      sku: p.sku,
      title: p.title,
      sellingPriceDzd: p.sellingPrice,
      purchaseCostDzd: p.purchaseCost,
      unitMarginDzd,
      marketingCostPerOrderDzd,
      estimatedProfitPerOrderDzd,
      breakEvenCpaDzd,
      linkedMetaCampaign: p.metaAdsLink?.enabled
        ? p.metaAdsLink.campaignName || p.metaAdsLink.adName || p.metaAdsLink.campaignId || "Meta Ads Linked"
        : null,
      stockQuantity: p.stockQuantity,
      stockStatus,
    };
  });

  const wilayaBreakdownMap = new Map<
    string,
    { total: number; delivered: number; returned: number; cancelled: number }
  >();
  for (const order of allOrders) {
    if (!order.wilaya || order.wilaya === "—") continue;
    const entry = wilayaBreakdownMap.get(order.wilaya) ?? {
      total: 0,
      delivered: 0,
      returned: 0,
      cancelled: 0,
    };
    entry.total += 1;
    if (order.status === "delivered") entry.delivered += 1;
    else if (order.status === "returned") entry.returned += 1;
    else if (order.status === "cancelled") entry.cancelled += 1;
    wilayaBreakdownMap.set(order.wilaya, entry);
  }

  const wilayaEfficiency: WilayaMarketingEfficiency[] = Array.from(wilayaBreakdownMap.entries())
    .map(([wilaya, st]) => {
      const finished = st.delivered + st.returned;
      const rate = finished > 0 ? Math.round((st.delivered / finished) * 100) : 70;
      const recommendation: WilayaMarketingEfficiency["recommendation"] =
        rate >= 70 ? "SCALE" : rate >= 50 ? "HOLD" : "OPTIMIZE_CONFIRMATION";
      return {
        wilaya,
        totalOrders: st.total,
        deliveredOrders: st.delivered,
        returnedOrders: st.returned,
        cancelledOrders: st.cancelled,
        deliveryRatePct: rate,
        recommendation,
      };
    })
    .sort((a, b) => b.totalOrders - a.totalOrders)
    .slice(0, 10);

  return {
    allOrders,
    snapshot: {
      totalOrders: allOrders.length,
      statusCounts,
      deliveredRevenueDzd,
      totalPipelineDzd,
      redexTrackedCount,
      recentOrders: allOrders.slice(0, 8),
      topWilayas,
      topProducts,
      catalogSummary,
      marketingAnalytics: {
        totalAdSpendDzd,
        totalCogsDzd,
        totalReturnLossDzd,
        estimatedNetProfitDzd,
        overallRoas,
        overallCpaDzd,
        overallCpdDzd,
        overallDeliveryRatePct,
        campaigns,
        productEconomics,
        wilayaEfficiency,
      },
    },
  };
}

const SEARCH_STOP_WORDS = new Set([
  "hello",
  "salam",
  "bonjour",
  "salut",
  "report",
  "reports",
  "order",
  "orders",
  "store",
  "status",
  "redex",
  "stock",
  "product",
  "products",
  "مرحبا",
  "السلام",
  "عليكم",
  "اهلا",
  "أهلا",
  "تقرير",
  "تقارير",
  "التقرير",
  "التقارير",
  "الاخيرة",
  "الأخيرة",
  "الاخير",
  "الأخير",
  "طلبية",
  "طلبيات",
  "الطلبيات",
  "المتجر",
  "المبيعات",
  "المخزون",
  "المنتجات",
  "العامة",
  "الشحن",
  "شحنات",
  "ريدكس",
  "pack",
  "pack1",
  "pack2",
  "pack3",
  "pack4",
  "orva",
]);

export function searchOrdersByQuery(orders: NormalizedAiOrder[], query: string): NormalizedAiOrder[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const digitsOnly = clean.replace(/\D/g, "");
  const tokens = clean
    .split(/[\s,#،؟?!.:;"'()[\]]+/)
    .map((t) => t.replace(/^-+|-+$/g, "").trim())
    .filter((t) => t.length >= 3 && !SEARCH_STOP_WORDS.has(t));

  if (digitsOnly.length < 4 && tokens.length === 0) {
    return [];
  }

  return orders
    .filter((order) => {
      const idLower = order.id.toLowerCase();
      const phoneDigits = order.phone.replace(/\D/g, "");
      const customerLower = order.customer.toLowerCase();
      const trackingLower = order.redexTrackingId.toLowerCase();

      if (idLower && clean.includes(idLower)) return true;
      if (digitsOnly.length >= 4 && (phoneDigits.includes(digitsOnly) || idLower.includes(digitsOnly))) {
        return true;
      }

      for (const token of tokens) {
        if (idLower === token || (token.includes("-") && idLower.includes(token))) return true;
        if (/^\d{4,}$/.test(token) && idLower.includes(token)) return true;
        if (trackingLower.includes(token) && token.length >= 6) return true;
        if (customerLower.includes(token) && token.length >= 4) return true;
      }
      return false;
    })
    .slice(0, 8);
}

export const AUTO_GEMINI_MODEL_PRIORITY = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
] as const;

export type GeminiErrorCode = "MISSING_API_KEY" | "GEMINI_AUTH_ERROR" | "GEMINI_UNAVAILABLE";

interface ModelHealthState {
  lastHealthyAt?: number;
  lastLatencyMs?: number;
  unhealthyUntil?: number;
  lastError?: string;
}

const modelHealthCache = new Map<string, ModelHealthState>();
const discoveredModelsCache = new Map<string, { expiresAt: number; models: string[] }>();

const FOUR_OH_FOUR_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const TRANSIENT_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const DISCOVERY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOTAL_ROUTING_BUDGET_MS = 25_000;
const PER_ATTEMPT_MAX_TIMEOUT_MS = 12_000;
const MAX_MODEL_ATTEMPTS_PER_REQUEST = 4;

const EXCLUDED_MODEL_SUBSTRINGS = [
  "-tts",
  "-image",
  "nano-banana",
  "lyria",
  "transcribe",
  "robotics",
  "computer-use",
  "deep-research",
  "embedding",
  "imagen",
  "veo",
];

function isChatCapableGeminiModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (!lower.startsWith("gemini-") && !lower.startsWith("gemma-")) {
    return false;
  }
  return !EXCLUDED_MODEL_SUBSTRINGS.some((sub) => lower.includes(sub));
}

/**
 * Discovers chat-capable generateContent models registered to the active Gemini API key.
 */
async function discoverAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const cacheKey = apiKey.slice(0, 12);
  const now = Date.now();
  const cached = discoveredModelsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.models;
  }

  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "X-goog-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];

    const json = (await res.json().catch(() => null)) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    } | null;

    const list = (json?.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m) =>
        String(m.name ?? "")
          .replace(/^models\//, "")
          .trim(),
      )
      .filter((id) => id.length > 0 && isChatCapableGeminiModel(id));

    discoveredModelsCache.set(cacheKey, { expiresAt: now + DISCOVERY_TTL_MS, models: list });
    return list;
  } catch {
    return [];
  }
}

/**
 * Builds an ordered list of working candidate Gemini models based on live health cache and latency.
 */
async function buildCandidateModels(
  configuredModel: string,
  apiKey: string,
  forceDiscovery = false,
): Promise<string[]> {
  const now = Date.now();
  const normalizedConfigured = configuredModel.trim();
  const isAuto = !normalizedConfigured || normalizedConfigured.toLowerCase() === "auto";

  const pool = new Set<string>();

  if (!isAuto) {
    const explicitHealth = modelHealthCache.get(normalizedConfigured);
    if (!explicitHealth?.unhealthyUntil || explicitHealth.unhealthyUntil <= now) {
      pool.add(normalizedConfigured);
    }
  }

  const healthyPriority: string[] = [];
  const unknownPriority: string[] = [];
  const coolingPriority: string[] = [];

  for (const m of AUTO_GEMINI_MODEL_PRIORITY) {
    const h = modelHealthCache.get(m);
    if (h?.unhealthyUntil && h.unhealthyUntil > now) {
      coolingPriority.push(m);
    } else if (h?.lastHealthyAt) {
      healthyPriority.push(m);
    } else {
      unknownPriority.push(m);
    }
  }

  healthyPriority.sort((a, b) => {
    const latA = modelHealthCache.get(a)?.lastLatencyMs ?? Number.MAX_SAFE_INTEGER;
    const latB = modelHealthCache.get(b)?.lastLatencyMs ?? Number.MAX_SAFE_INTEGER;
    return latA - latB;
  });

  for (const m of [...healthyPriority, ...unknownPriority]) {
    pool.add(m);
  }

  if (forceDiscovery || pool.size === 0) {
    const discovered = await discoverAvailableGeminiModels(apiKey);
    for (const m of discovered) {
      const h = modelHealthCache.get(m);
      if (!h?.unhealthyUntil || h.unhealthyUntil <= now) {
        pool.add(m);
      }
    }
  }

  // Only include previously cooled-down models at the very tail if almost no healthy candidates exist
  if (pool.size < 2) {
    for (const m of coolingPriority) {
      pool.add(m);
    }
  }

  return Array.from(pool).slice(0, MAX_MODEL_ATTEMPTS_PER_REQUEST);
}

interface SingleCallResult {
  ok: boolean;
  text: string;
  latencyMs: number;
  statusCode?: number;
  errorMessage?: string;
  isAuthError?: boolean;
}

async function callSingleGeminiModel(options: {
  model: string;
  apiKey: string;
  systemPrompt: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  timeoutMs: number;
  maxOutputTokens?: number;
}): Promise<SingleCallResult> {
  const attemptStart = Date.now();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;

  const contents = [
    ...(options.history ?? []).slice(-6).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [{ text: options.userMessage }],
    },
  ];

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": options.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          role: "system",
          parts: [{ text: options.systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: options.maxOutputTokens ?? 1024,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    const latencyMs = Date.now() - attemptStart;
    const json = (await response.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { code?: number; message?: string; status?: string };
    } | null;

    const candidateText = json?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("\n")
      .trim();

    if (response.ok && candidateText) {
      modelHealthCache.set(options.model, {
        lastHealthyAt: Date.now(),
        lastLatencyMs: latencyMs,
        unhealthyUntil: undefined,
        lastError: undefined,
      });
      return { ok: true, text: candidateText, latencyMs, statusCode: response.status };
    }

    const errMsg = json?.error?.message ?? `HTTP ${response.status}`;
    const errStatus = String(json?.error?.status ?? "").toUpperCase();
    const isAuthError =
      response.status === 401 ||
      response.status === 403 ||
      errStatus === "PERMISSION_DENIED" ||
      errStatus === "UNAUTHENTICATED" ||
      errMsg.toLowerCase().includes("api key not valid");

    if (!isAuthError) {
      const cooldownMs = response.status === 404 ? FOUR_OH_FOUR_COOLDOWN_MS : TRANSIENT_COOLDOWN_MS;
      modelHealthCache.set(options.model, {
        lastHealthyAt: modelHealthCache.get(options.model)?.lastHealthyAt,
        lastLatencyMs: modelHealthCache.get(options.model)?.lastLatencyMs,
        unhealthyUntil: Date.now() + cooldownMs,
        lastError: `${response.status}: ${errMsg}`,
      });
    }

    return {
      ok: false,
      text: "",
      latencyMs,
      statusCode: response.status,
      errorMessage: errMsg,
      isAuthError,
    };
  } catch (err) {
    const latencyMs = Date.now() - attemptStart;
    const errMsg = err instanceof Error ? err.message : "Network error";
    modelHealthCache.set(options.model, {
      lastHealthyAt: modelHealthCache.get(options.model)?.lastHealthyAt,
      lastLatencyMs: modelHealthCache.get(options.model)?.lastLatencyMs,
      unhealthyUntil: Date.now() + TRANSIENT_COOLDOWN_MS,
      lastError: errMsg,
    });
    return {
      ok: false,
      text: "",
      latencyMs,
      errorMessage: errMsg,
    };
  }
}

/**
 * Lightweight live health probe used by chat reconnect and GET ?mode=status.
 */
export async function probeOrvaGeminiConnection(options?: {
  overrideApiKey?: string;
  overrideModel?: string;
  forceLiveCheck?: boolean;
}): Promise<{
  connected: boolean;
  configured: boolean;
  enabled: boolean;
  agentName: string;
  projectName: string;
  projectNumber: string;
  configuredModel: string;
  activeModel: string | null;
  latencyMs?: number;
  errorCode?: GeminiErrorCode;
  apiError?: string;
}> {
  const settings = await getAdminSettingsAction();
  const gemini = settings.geminiAi;

  const apiKey = (options?.overrideApiKey?.trim() || gemini.apiKey || "").trim();
  const configuredModel = (options?.overrideModel?.trim() || gemini.model || "auto").trim() || "auto";
  const agentName = gemini.name || "Orva Agent AI";
  const projectName = gemini.projectName || "projects/347934146406";
  const projectNumber = gemini.projectNumber || "347934146406";

  if (!apiKey) {
    return {
      connected: false,
      configured: false,
      enabled: gemini.enabled,
      agentName,
      projectName,
      projectNumber,
      configuredModel,
      activeModel: null,
      errorCode: "MISSING_API_KEY",
      apiError: "Missing Gemini API Key",
    };
  }

  if (!options?.forceLiveCheck) {
    const now = Date.now();
    for (const m of AUTO_GEMINI_MODEL_PRIORITY) {
      const h = modelHealthCache.get(m);
      if (h?.lastHealthyAt && now - h.lastHealthyAt < 5 * 60 * 1000 && (!h.unhealthyUntil || h.unhealthyUntil <= now)) {
        return {
          connected: true,
          configured: true,
          enabled: gemini.enabled,
          agentName,
          projectName,
          projectNumber,
          configuredModel,
          activeModel: m,
          latencyMs: h.lastLatencyMs,
        };
      }
    }
  }

  const start = Date.now();
  const candidates = await buildCandidateModels(configuredModel, apiKey);
  let lastErr = "All Gemini models failed";

  for (const model of candidates) {
    const res = await callSingleGeminiModel({
      model,
      apiKey,
      systemPrompt: `You are ${agentName}. Reply concisely with OK.`,
      userMessage: "OK",
      timeoutMs: 8000,
      maxOutputTokens: 16,
    });
    if (res.ok) {
      return {
        connected: true,
        configured: true,
        enabled: gemini.enabled,
        agentName,
        projectName,
        projectNumber,
        configuredModel,
        activeModel: model,
        latencyMs: Date.now() - start,
      };
    }
    lastErr = res.errorMessage ?? lastErr;
    if (res.isAuthError) {
      return {
        connected: false,
        configured: true,
        enabled: gemini.enabled,
        agentName,
        projectName,
        projectNumber,
        configuredModel,
        activeModel: null,
        latencyMs: Date.now() - start,
        errorCode: "GEMINI_AUTH_ERROR",
        apiError: lastErr,
      };
    }
  }

  return {
    connected: false,
    configured: true,
    enabled: gemini.enabled,
    agentName,
    projectName,
    projectNumber,
    configuredModel,
    activeModel: null,
    latencyMs: Date.now() - start,
    errorCode: "GEMINI_UNAVAILABLE",
    apiError: lastErr,
  };
}

/**
 * Executes an admin chat or report query through the adaptive Gemini health router.
 * Strictly fail-closed when Gemini cannot be reached (never dumps unrequested local reports).
 */
export async function runOrvaGeminiAgentQuery(options: {
  userMessage: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  overrideApiKey?: string;
  overrideModel?: string;
}): Promise<{
  ok: boolean;
  reply: string;
  matchedOrders: NormalizedAiOrder[];
  snapshot: StoreReportSnapshot;
  model: string;
  requestedModel: string;
  agentName: string;
  projectName: string;
  projectNumber: string;
  latencyMs: number;
  attemptedModels: Array<{ model: string; status?: number; error?: string; latencyMs: number }>;
  errorCode?: GeminiErrorCode;
  apiError?: string;
}> {
  const startTime = Date.now();
  const settings = await getAdminSettingsAction();
  const gemini = settings.geminiAi;

  const apiKey = (options.overrideApiKey?.trim() || gemini.apiKey || "").trim();
  const configuredModel = (options.overrideModel?.trim() || gemini.model || "auto").trim() || "auto";
  const agentName = gemini.name || "Orva Agent AI";
  const projectName = gemini.projectName || "projects/347934146406";
  const projectNumber = gemini.projectNumber || "347934146406";

  const { snapshot, allOrders } = await buildStoreReportSnapshot();
  const matchedOrders = searchOrdersByQuery(allOrders, options.userMessage);

  if (!apiKey) {
    return {
      ok: false,
      reply: "",
      matchedOrders: [],
      snapshot,
      model: "",
      requestedModel: configuredModel,
      agentName,
      projectName,
      projectNumber,
      latencyMs: Date.now() - startTime,
      attemptedModels: [],
      errorCode: "MISSING_API_KEY",
      apiError: "Missing Gemini API Key",
    };
  }

  const mkt = snapshot.marketingAnalytics;
  const systemPrompt = [
    `أنت "${agentName}"، المساعد الذكي والمستشار التسويقي الخبير (Expert Media Buyer & E-Commerce Strategist) للوحة تحكم متجر ORVA Store في الجزائر (المشروع: ${projectName} / رقم: ${projectNumber}).`,
    `قواعد المحادثة والاستشارة التسويقية (Meta Ads Expert Skill):`,
    `1. أجب دائماً بنفس لغة رسالة المستخدم (العربية، الإنجليزية، أو الفرنسية) وبأسلوب مهني ومنظم وواضح.`,
    `2. إذا أرسل المستخدم تحية عامة أو دردشة قصيرة (مثل: hi، hello، مرحبا، السلام عليكم)، رد بتحية ودودة ومختصرة وعرّف بإمكانياتك (تحليل ربحية حملات Meta Ads، حساب ROAS وCPA وBreak-Even CPA، استشارات زيادة الميزانية أو إيقاف الإعلانات الخاسرة، ترشيح أفضل الولايات للاستهداف، ومتابعة الطلبيات وشحنات Redex).`,
    `3. عندما يطلب المستخدم استشارة تسويقية أو تحليل الحملات أو ربحية المنتجات:`,
    `   - اعتمد حصراً على الأرقام الحقيقية أدناه (صافي الربح، الإنفاق الإعلاني التقديري/الفعلي، CPA تكلفة الطلب، CPD تكلفة الطلب المسلّم، ROAS، نسبة التسليم الفعلي، وخسائر المرتجعات).`,
    `   - طبّق منهجية (Meta Ads Expert Skill):`,
    `     أ) الملخص التنفيذي للمؤشرات المالية (الإيراد المحصل، تكلفة الإعلانات، تكلفة البضاعة COGS، خسائر المرتجعات، وصافي الربح).`,
    `     ب) قرارات الميزانية للحملات والمنتجات (أي حملة/منتج يجب توسيع ميزانيته Scale لأن ROAS مرتفع وصافي الربح إيجابي، وأي حملة تحتاج مراجعة الكرييتف أو التوقف بسبب ارتفاع CPA أو المرتجعات).`,
    `     ج) استراتيجية استهداف الولايات في الجزائر (التركيز على الولايات ذات نسبة التسليم العالية ≥70%، وتشديد التأكيد الهاتفي في الولايات ذات المرتجعات المرتفعة).`,
    `     د) حدود الأمان المالية لكل منتج (Break-Even CPA: أقصى تكلفة إعلان للطلب الواحد قبل الدخول في خسارة).`,
    ``,
    `البيانات الحية الحالية لمتجر ORVA Store:`,
    `- إجمالي الطلبيات: ${snapshot.totalOrders}`,
    `- تفصيل الحالات: قيد الانتظار=${snapshot.statusCounts.pending}، مؤكدة=${snapshot.statusCounts.confirmed}، مشحونة=${snapshot.statusCounts.shipped}، مسلّمة=${snapshot.statusCounts.delivered}، مرتجعة=${snapshot.statusCounts.returned}، ملغاة=${snapshot.statusCounts.cancelled}`,
    `- إجمالي المبيعات المحصّلة (Delivered): ${snapshot.deliveredRevenueDzd} د.ج`,
    `- إجمالي قيمة الطلبيات النشطة: ${snapshot.totalPipelineDzd} د.ج`,
    `- الطلبيات المربوطة بـ Redex: ${snapshot.redexTrackedCount}`,
    `- المؤشرات التسويقية والربحية الشاملة (Meta Ads & Profitability Engine):`,
    `  * إجمالي تكلفة الإعلانات (Meta Ads Spend): ${mkt?.totalAdSpendDzd ?? 0} د.ج`,
    `  * إجمالي تكلفة البضاعة المسلّمة (COGS): ${mkt?.totalCogsDzd ?? 0} د.ج`,
    `  * إجمالي خسائر شحن المرتجعات: ${mkt?.totalReturnLossDzd ?? 0} د.ج`,
    `  * صافي الربح النهائي بعد الإعلانات والمرتجعات: ${mkt?.estimatedNetProfitDzd ?? 0} د.ج`,
    `  * العائد على الإنفاق الإعلاني (ROAS): ${mkt?.overallRoas !== null && mkt?.overallRoas !== undefined ? `${mkt.overallRoas}x` : "غير محدد"}`,
    `  * متوسط تكلفة الطلب الإعلانية (CPA): ${mkt?.overallCpaDzd ?? 0} د.ج | تكلفة الطلب المسلّم (CPD): ${mkt?.overallCpdDzd ?? 0} د.ج`,
    `  * نسبة التسليم الفعلي الإجمالية: ${mkt?.overallDeliveryRatePct ?? 0}%`,
    `- تفصيل ربحية الحملات الإعلانية (Campaigns Breakdown): ${JSON.stringify(mkt?.campaigns ?? [])}`,
    `- اقتصاديات المنتجات والباقات وربط الإعلانات (Product Unit Economics & Break-Even CPA): ${JSON.stringify(mkt?.productEconomics ?? [])}`,
    `- كفاءة الولايات التسويقية ونسب التسليم (Wilaya Targeting Efficiency): ${JSON.stringify(mkt?.wilayaEfficiency ?? [])}`,
    `- أعلى الولايات طلباً: ${JSON.stringify(snapshot.topWilayas)}`,
    `- أداء المنتجات: ${JSON.stringify(snapshot.topProducts)}`,
    `- كتالوج المنتجات والمخزون: ${JSON.stringify(snapshot.catalogSummary)}`,
    `- آخر 8 طلبيات مسجلة: ${JSON.stringify(snapshot.recentOrders)}`,
    matchedOrders.length > 0
      ? `- نتائج البحث المطابقة لرسالة الأدمن (برقم الطلبية أو الهاتف أو الاسم): ${JSON.stringify(matchedOrders)}`
      : `- ملاحظة: لم يتضمن سؤال الأدمن رقم طلبية أو هاتف محدد للبحث المباشر.`,
  ].join("\n");

  const deadline = startTime + TOTAL_ROUTING_BUDGET_MS;
  const initialCandidates = await buildCandidateModels(configuredModel, apiKey, false);
  const attemptedSet = new Set<string>();
  const attemptedModels: Array<{ model: string; status?: number; error?: string; latencyMs: number }> = [];
  let lastError = "Failed to reach Google Gemini API";

  const tryQueue = async (queue: string[]) => {
    for (const model of queue) {
      if (attemptedSet.has(model)) continue;
      const remainingMs = deadline - Date.now();
      if (remainingMs < 1500) {
        lastError = "Total Gemini routing timeout budget exceeded";
        return { authFailed: false, succeeded: null as { model: string; text: string } | null };
      }

      attemptedSet.add(model);
      const timeoutMs = Math.min(PER_ATTEMPT_MAX_TIMEOUT_MS, remainingMs);
      const result = await callSingleGeminiModel({
        model,
        apiKey,
        systemPrompt,
        history: options.history,
        userMessage: options.userMessage,
        timeoutMs,
      });

      if (result.ok) {
        attemptedModels.push({ model, status: result.statusCode, latencyMs: result.latencyMs });
        return { authFailed: false, succeeded: { model, text: result.text } };
      }

      lastError = result.errorMessage ?? lastError;
      attemptedModels.push({
        model,
        status: result.statusCode,
        error: result.errorMessage,
        latencyMs: result.latencyMs,
      });

      if (result.isAuthError) {
        return { authFailed: true, succeeded: null };
      }
    }
    return { authFailed: false, succeeded: null };
  };

  let passResult = await tryQueue(initialCandidates);
  if (!passResult.succeeded && !passResult.authFailed && deadline - Date.now() >= 4000) {
    const discoveredCandidates = await buildCandidateModels(configuredModel, apiKey, true);
    passResult = await tryQueue(discoveredCandidates);
  }

  if (passResult.succeeded) {
    return {
      ok: true,
      reply: passResult.succeeded.text,
      matchedOrders,
      snapshot,
      model: passResult.succeeded.model,
      requestedModel: configuredModel,
      agentName,
      projectName,
      projectNumber,
      latencyMs: Date.now() - startTime,
      attemptedModels,
    };
  }

  return {
    ok: false,
    reply: "",
    matchedOrders: [],
    snapshot,
    model: "",
    requestedModel: configuredModel,
    agentName,
    projectName,
    projectNumber,
    latencyMs: Date.now() - startTime,
    attemptedModels,
    errorCode: passResult.authFailed ? "GEMINI_AUTH_ERROR" : "GEMINI_UNAVAILABLE",
    apiError: lastError,
  };
}

/**
 * Formats a clean, transparent Arabic disconnect message without leaking fake/local order data.
 */
export function formatGeminiUserErrorMessage(errorCode?: GeminiErrorCode, apiError?: string): string {
  if (errorCode === "MISSING_API_KEY") {
    return "تم إيقاف الدردشة مؤقتاً: مفتاح Gemini API غير مضبوط في إعدادات المتجر.";
  }
  if (errorCode === "GEMINI_AUTH_ERROR") {
    return `تم إيقاف الدردشة مؤقتاً: مفتاح Gemini API غير صالح أو مرفوض من Google (${apiError ?? "401/403"}).`;
  }
  return `تم إيقاف الدردشة مؤقتاً: تعذّر الاتصال بجميع نماذج Google Gemini العاملة حالياً (${apiError ?? "503 / Timeout"}).`;
}

/**
 * Shared test helper for Settings ("اختبار التقارير الأخيرة لعدد الطلبيات والتقارير العامة للمتجر").
 */
export async function runGeminiSettingsTestReport(input: {
  name?: string;
  projectName?: string;
  projectNumber?: string;
  apiKey?: string;
  model?: string;
}) {
  const settings = await getAdminSettingsAction();
  const apiKey = (input.apiKey?.trim() || settings.geminiAi.apiKey || "").trim();
  const model = (input.model?.trim() || settings.geminiAi.model || "auto").trim() || "auto";
  const configured = Boolean(apiKey.length >= 10);

  if (!configured) {
    return {
      configured: false,
      authenticated: false,
      agentName: input.name?.trim() || settings.geminiAi.name || "Orva Agent AI",
      projectName: input.projectName?.trim() || settings.geminiAi.projectName || "projects/347934146406",
      projectNumber: input.projectNumber?.trim() || settings.geminiAi.projectNumber || "347934146406",
      model: "",
      latencyMs: 0,
      reportText: "",
      apiError: "Missing Gemini API Key",
      message: "يرجى إدخال مفتاح Gemini API صالح لإجراء الاختبار.",
    };
  }

  const aiReport = await runOrvaGeminiAgentQuery({
    userMessage:
      "قدّم تقريراً شاملاً ومختصراً عن التقارير الأخيرة لعدد الطلبيات وتوزيع حالاتها (قيد الانتظار، المؤكدة، المشحونة، المسلّمة، المرتجعة، الملغاة) وعن التقارير العامة لأداء المتجر والمبيعات المحصّلة وأهم المنتجات.",
    overrideApiKey: apiKey,
    overrideModel: model,
  });

  if (!aiReport.ok) {
    return {
      configured: true,
      authenticated: false,
      agentName: input.name?.trim() || aiReport.agentName,
      projectName: input.projectName?.trim() || aiReport.projectName,
      projectNumber: input.projectNumber?.trim() || aiReport.projectNumber,
      model: "",
      latencyMs: aiReport.latencyMs,
      reportText: "",
      snapshot: aiReport.snapshot,
      apiError: aiReport.apiError,
      attemptedModels: aiReport.attemptedModels,
      message: formatGeminiUserErrorMessage(aiReport.errorCode, aiReport.apiError),
    };
  }

  return {
    configured: true,
    authenticated: true,
    agentName: input.name?.trim() || aiReport.agentName,
    projectName: input.projectName?.trim() || aiReport.projectName,
    projectNumber: input.projectNumber?.trim() || aiReport.projectNumber,
    model: aiReport.model,
    latencyMs: aiReport.latencyMs,
    reportText: aiReport.reply,
    snapshot: aiReport.snapshot,
    attemptedModels: aiReport.attemptedModels,
    message: `تم إجراء اختبار Orva Agent AI (${aiReport.projectName}) عبر النموذج العامل ${aiReport.model} (${aiReport.latencyMs}ms) وتوليد التقرير الأخير لعدد الطلبيات والتقرير العام للمتجر بنجاح (${aiReport.snapshot.totalOrders} طلبية).`,
  };
}
