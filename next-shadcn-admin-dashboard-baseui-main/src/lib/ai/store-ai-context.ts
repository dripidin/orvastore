import { getAdminSettingsAction } from "@/app/actions/settings";
import { adminListProducts } from "@/lib/catalog/server";
import { getStoredFallbackOrders } from "@/lib/orders-store";
import { DEFAULT_MOCK_ORDERS } from "@/lib/repository/mock-orders-dataset";
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
  try {
    const products = await adminListProducts();
    catalogSummary = products.slice(0, 20).map((p) => {
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
    },
  };
}

export function searchOrdersByQuery(orders: NormalizedAiOrder[], query: string): NormalizedAiOrder[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  const digitsOnly = clean.replace(/\D/g, "");
  const tokens = clean
    .split(/[\s,#،-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

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
        if (idLower.includes(token)) return true;
        if (trackingLower?.includes(token)) return true;
        if (customerLower.includes(token) && token.length >= 4) return true;
      }
      return false;
    })
    .slice(0, 8);
}

export function formatLocalStoreReportText(snapshot: StoreReportSnapshot): string {
  const recentLines = snapshot.recentOrders
    .slice(0, 5)
    .map(
      (o) =>
        `• #${o.id} | ${o.customer} (${o.phone || "بدون هاتف"}) | ${o.wilaya} | ${o.productName} | ${o.totalDzd.toLocaleString("fr-DZ")} د.ج | الحالة: ${o.status}${o.redexTrackingId ? ` | Redex: ${o.redexTrackingId}` : ""}`,
    )
    .join("\n");

  const topProdLines = snapshot.topProducts
    .slice(0, 4)
    .map((p) => `• ${p.product}: ${p.count} طلبية (${p.revenueDzd.toLocaleString("fr-DZ")} د.ج محصّلة)`)
    .join("\n");

  return [
    `📊 **التقرير العام للمتجر والتقارير الأخيرة للطلبيات (ORVA Store):**`,
    `- **إجمالي الطلبيات:** ${snapshot.totalOrders} طلبية`,
    `- **تفصيل الحالات:** قيد الانتظار (${snapshot.statusCounts.pending}) | مؤكدة (${snapshot.statusCounts.confirmed}) | مشحونة (${snapshot.statusCounts.shipped}) | مسلّمة (${snapshot.statusCounts.delivered}) | مرتجعة (${snapshot.statusCounts.returned}) | ملغاة (${snapshot.statusCounts.cancelled})`,
    `- **المبيعات المحصّلة (Delivered):** ${snapshot.deliveredRevenueDzd.toLocaleString("fr-DZ")} د.ج`,
    `- **إجمالي قيمة الطلبيات النشطة:** ${snapshot.totalPipelineDzd.toLocaleString("fr-DZ")} د.ج`,
    `- **الطلبيات المربوطة بـ Redex:** ${snapshot.redexTrackedCount} شحنة`,
    snapshot.recentOrders.length > 0 ? `\n🕒 **آخر الطلبيات المسجلة:**\n${recentLines}` : "",
    snapshot.topProducts.length > 0 ? `\n📦 **أداء المنتجات والمخزون:**\n${topProdLines}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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
  agentName: string;
  projectName: string;
  projectNumber: string;
  latencyMs: number;
  usedFallbackReport?: boolean;
  apiError?: string;
}> {
  const startTime = Date.now();
  const settings = await getAdminSettingsAction();
  const gemini = settings.geminiAi;

  const apiKey = (options.overrideApiKey?.trim() || gemini.apiKey || "").trim();
  const model = (options.overrideModel?.trim() || gemini.model || "gemini-flash-latest").trim();
  const agentName = gemini.name || "Orva Agent AI";
  const projectName = gemini.projectName || "projects/347934146406";
  const projectNumber = gemini.projectNumber || "347934146406";

  const { snapshot, allOrders } = await buildStoreReportSnapshot();
  const matchedOrders = searchOrdersByQuery(allOrders, options.userMessage);

  const systemContext = [
    `أنت "${agentName}"، المساعد الذكي الرسمي للوحة تحكم متجر ORVA Store في الجزائر (المشروع: ${projectName} / رقم: ${projectNumber}).`,
    `أجب دائماً باللغة العربية الواضحة والمهنية وبالأرقام الحقيقية من بيانات المتجر المرفقة أدناه.`,
    `بيانات التقارير العامة للمتجر والتقارير الأخيرة لعدد الطلبيات الآن:`,
    `- إجمالي الطلبيات: ${snapshot.totalOrders}`,
    `- قيد الانتظار (Pending): ${snapshot.statusCounts.pending}`,
    `- مؤكدة (Confirmed): ${snapshot.statusCounts.confirmed}`,
    `- مشحونة (Shipped): ${snapshot.statusCounts.shipped}`,
    `- مسلّمة (Delivered): ${snapshot.statusCounts.delivered}`,
    `- مرتجعة (Returned): ${snapshot.statusCounts.returned}`,
    `- ملغاة (Cancelled): ${snapshot.statusCounts.cancelled}`,
    `- إجمالي المبيعات المحصّلة للطلبات المسلّمة: ${snapshot.deliveredRevenueDzd} د.ج`,
    `- إجمالي قيمة الطلبيات النشطة: ${snapshot.totalPipelineDzd} د.ج`,
    `- عدد الشحنات المربوطة بـ Redex: ${snapshot.redexTrackedCount}`,
    `- أعلى الولايات طلباً: ${JSON.stringify(snapshot.topWilayas)}`,
    `- أداء المنتجات: ${JSON.stringify(snapshot.topProducts)}`,
    `- كتالوج المنتجات والمخزون: ${JSON.stringify(snapshot.catalogSummary)}`,
    `- آخر 8 طلبيات مسجلة: ${JSON.stringify(snapshot.recentOrders)}`,
    matchedOrders.length > 0
      ? `- نتائج البحث المطابقة لرسالة الأدمن (برقم الطلبية أو رقم الهاتف أو الاسم): ${JSON.stringify(matchedOrders)}`
      : `- لم يتم العثور على طلبية محددة مطابقة لرقم/هاتف في نص السؤال إذا كان السؤال بحثاً خاصاً.`,
  ].join("\n");

  const contents = [
    ...(options.history ?? []).slice(-6).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    {
      role: "user",
      parts: [
        {
          text: `${systemContext}\n\nسؤال الأدمن الآن:\n${options.userMessage}`,
        },
      ],
    },
  ];

  if (!apiKey) {
    return {
      ok: false,
      reply: `مفتاح Gemini API غير مضبوط. إليك التقرير الفوري المباشر من قاعدة بيانات المتجر:\n\n${formatLocalStoreReportText(snapshot)}`,
      matchedOrders,
      snapshot,
      model,
      agentName,
      projectName,
      projectNumber,
      latencyMs: Date.now() - startTime,
      usedFallbackReport: true,
      apiError: "Missing Gemini API Key",
    };
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    const json = (await response.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string; status?: string };
    } | null;

    const candidateText = json?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("\n")
      .trim();

    if (response.ok && candidateText) {
      return {
        ok: true,
        reply: candidateText,
        matchedOrders,
        snapshot,
        model,
        agentName,
        projectName,
        projectNumber,
        latencyMs: Date.now() - startTime,
      };
    }

    const errMsg = json?.error?.message ?? `HTTP ${response.status}`;
    const matchedSection =
      matchedOrders.length > 0
        ? `\n\n🔍 **نتائج البحث المطابقة:**\n${matchedOrders
            .map(
              (o) =>
                `• #${o.id} — ${o.customer} (${o.phone}) | ${o.wilaya} - ${o.commune} | ${o.productName} | ${o.totalDzd.toLocaleString("fr-DZ")} د.ج | الحالة: ${o.status}${o.redexTrackingId ? ` | Redex: ${o.redexTrackingId}` : ""}`,
            )
            .join("\n")}`
        : "";

    return {
      ok: true,
      reply: `${formatLocalStoreReportText(snapshot)}${matchedSection}`,
      matchedOrders,
      snapshot,
      model,
      agentName,
      projectName,
      projectNumber,
      latencyMs: Date.now() - startTime,
      usedFallbackReport: true,
      apiError: errMsg,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Network error";
    const matchedSection =
      matchedOrders.length > 0
        ? `\n\n🔍 **نتائج البحث المطابقة:**\n${matchedOrders
            .map(
              (o) =>
                `• #${o.id} — ${o.customer} (${o.phone}) | ${o.wilaya} - ${o.commune} | ${o.productName} | ${o.totalDzd.toLocaleString("fr-DZ")} د.ج | الحالة: ${o.status}${o.redexTrackingId ? ` | Redex: ${o.redexTrackingId}` : ""}`,
            )
            .join("\n")}`
        : "";

    return {
      ok: true,
      reply: `${formatLocalStoreReportText(snapshot)}${matchedSection}`,
      matchedOrders,
      snapshot,
      model,
      agentName,
      projectName,
      projectNumber,
      latencyMs: Date.now() - startTime,
      usedFallbackReport: true,
      apiError: errMsg,
    };
  }
}
