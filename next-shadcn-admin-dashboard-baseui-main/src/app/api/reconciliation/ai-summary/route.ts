import { type NextRequest, NextResponse } from "next/server";

import {
  formatGeminiUserErrorMessage,
  type GeminiImageAttachment,
  runOrvaGeminiAgentQuery,
} from "@/lib/ai/store-ai-context";
import { computeCodAccountingReport } from "@/lib/analytics/accounting-report";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { adminListProducts } from "@/lib/catalog/server";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { getMemoryReconRuns, loadAllStoreOrdersForReconciliation } from "@/lib/reconciliation/reconciliation-engine";

export const dynamic = "force-dynamic";

interface RequestHistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface RequestRunContext {
  counts?: {
    matched_synced?: number;
    matched_unsynced?: number;
    store_only?: number;
    courier_only?: number;
    duplicate?: number;
    totalExternalRows?: number;
    totalStoreOrders?: number;
  };
  discrepancySamples?: Array<Record<string, unknown>>;
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    courierId?: string;
    message?: string;
    history?: RequestHistoryItem[];
    attachments?: Array<{ mimeType?: string; dataBase64?: string; name?: string }>;
    runContext?: RequestRunContext;
  };

  const courierScope = String(body.courierId || "all")
    .trim()
    .toLowerCase();
  const cleanAttachments: GeminiImageAttachment[] = Array.isArray(body.attachments)
    ? body.attachments
        .filter(
          (a): a is { mimeType: string; dataBase64: string; name?: string } =>
            Boolean(a) &&
            typeof a.mimeType === "string" &&
            a.mimeType.startsWith("image/") &&
            typeof a.dataBase64 === "string" &&
            a.dataBase64.length > 0 &&
            a.dataBase64.length <= 6_000_000,
        )
        .slice(0, 6)
        .map((a) => ({ mimeType: a.mimeType, dataBase64: a.dataBase64, name: a.name }))
    : [];

  const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
  const hasAttachments = cleanAttachments.length > 0;
  const effectiveChatMessage =
    rawMessage ||
    (hasAttachments
      ? "حلّل هذه الصورة / اللقطة المرفقة بدقة في سياق المطابقة المحاسبية وطلبيات ORVA Store مع شركات التوصيل واستخرج الأرقام أو الفوارق إن وجدت."
      : "");
  const isChat = effectiveChatMessage.length > 0;

  const cleanHistory: RequestHistoryItem[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (item): item is RequestHistoryItem =>
            Boolean(item) &&
            (item.role === "user" || item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim().length > 0,
        )
        .slice(-12)
        .map((item) => ({ role: item.role, content: item.content.trim() }))
    : [];

  const runs = getMemoryReconRuns();
  const latestRun = runs[0] ?? null;

  const [storeOrders, products, returnFeeMap] = await Promise.all([
    loadAllStoreOrdersForReconciliation(),
    adminListProducts().catch(() => []),
    getReturnFeesByWilayaMap(courierScope === "all" ? undefined : courierScope).catch(
      () => ({}) as Record<number, number>,
    ),
  ]);

  const scopedStoreOrders =
    courierScope === "all"
      ? storeOrders
      : storeOrders.filter((o) => (o.courierId || (o.inRedex ? "redex" : "")).toLowerCase() === courierScope);

  const serverReconRows = latestRun
    ? courierScope === "all"
      ? latestRun.rows
      : latestRun.rows.filter((r) => r.courierId === courierScope)
    : [];

  const fallbackSamples = Array.isArray(body.runContext?.discrepancySamples)
    ? body.runContext.discrepancySamples.filter((r) =>
        courierScope === "all" ? true : String(r.courierId || "").toLowerCase() === courierScope,
      )
    : [];

  const capturedReturns = serverReconRows
    .filter((r) => r.bucket === "courier_only" && r.isStoreOwnedReturn)
    .map((r) => ({
      trackingCode: r.trackingCode || r.id,
      courierId: r.courierId,
      courierName: r.courierName,
      wilayaCode: r.wilayaCode,
      returnFeeDzd: r.returnFeeDzd,
      montantDzd: r.montantDzd,
    }));

  const accounting = computeCodAccountingReport({
    orders: scopedStoreOrders,
    capturedReturns,
    returnFeesByWilaya: returnFeeMap,
    products,
  });

  const fallbackCounts = body.runContext?.counts;
  const useFallbackCounts = !latestRun && fallbackCounts && courierScope === "all";

  const bucketCounts = {
    matched_synced: useFallbackCounts
      ? Number(fallbackCounts?.matched_synced ?? 0)
      : serverReconRows.filter((r) => r.bucket === "matched_synced").length,
    matched_unsynced: useFallbackCounts
      ? Number(fallbackCounts?.matched_unsynced ?? 0)
      : serverReconRows.filter((r) => r.bucket === "matched_unsynced").length,
    store_only: useFallbackCounts
      ? Number(fallbackCounts?.store_only ?? 0)
      : serverReconRows.filter((r) => r.bucket === "store_only").length,
    courier_only: useFallbackCounts
      ? Number(fallbackCounts?.courier_only ?? 0)
      : serverReconRows.filter((r) => r.bucket === "courier_only").length,
    duplicate: useFallbackCounts
      ? Number(fallbackCounts?.duplicate ?? 0)
      : serverReconRows.filter((r) => r.bucket === "duplicate").length,
    storeOwnedReturns: capturedReturns.length,
  };

  const discrepancySamples =
    serverReconRows.length > 0
      ? serverReconRows
          .filter((r) => r.bucket !== "matched_synced")
          .slice(0, 40)
          .map((r) => ({
            bucket: r.bucket,
            courier: r.courierName,
            tracking: r.trackingCode,
            orderRef: r.reference || r.storeOrderId,
            customer: r.customerName,
            wilaya: r.wilayaName,
            montantDzd: r.montantDzd,
            returnFeeDzd: r.returnFeeDzd,
            store: r.storeOrderStatus,
            courierStatus: r.courierStatusAr,
            financialStage: r.financialStatus,
            reason: r.discrepancyReason,
          }))
      : fallbackSamples.slice(0, 40);

  const deterministicMemo = [
    `📋 **ملخص تدقيق المطابقة (${courierScope === "all" ? "كافة شركات التوصيل" : courierScope})**:`,
    `- طلبيات متطابقة ومتزامنة: **${bucketCounts.matched_synced}**`,
    `- طلبيات غير متزامنة (تحتاج مزامنة الحالة/المبلغ): **${bucketCounts.matched_unsynced}**`,
    `- مسجّلة في المتجر فقط (لم تُرسل أو غير ظاهرة في الملف): **${bucketCounts.store_only}**`,
    `- مسجّلة في شركة التوصيل فقط (قابلة للاستيراد للمتجر): **${bucketCounts.courier_only}** (منها **${bucketCounts.storeOwnedReturns}** مرتجع يحمل معرّف المتجر)`,
    `- حالات مكررة (داخل ملف أو عبر شركتين أو في المتجر): **${bucketCounts.duplicate}**`,
    ``,
    `💰 **الوضع المالي والمحاسبي (COD)**:`,
    `- إجمالي مبالغ الطلبيات المسلّمة: **${accounting.grossDeliveredCodDzd.toLocaleString("fr-DZ")} د.ج** (${accounting.deliveredCount} طلبية، نسبة التسليم ${accounting.deliveryRatePct}%)`,
    `- مستحقات عالقة/جاهزة عند التوصيل: **${accounting.courierCashStages.pendingReceivableDzd.toLocaleString("fr-DZ")} د.ج** | محصّل ومؤرشف: **${accounting.courierCashStages.settledPaidDzd.toLocaleString("fr-DZ")} د.ج**`,
    `- خسائر شحن المرتجعات الفعلية (tarif_retour): **${accounting.totalReturnLossDzd.toLocaleString("fr-DZ")} د.ج** (منها ${accounting.capturedExternalReturnLossDzd.toLocaleString("fr-DZ")} د.ج لمرتجعات لم تكن مسجّلة بالمتجر)`,
    `- صافي الربح التشغيلي المقدر: **${accounting.netRealizedProfitDzd.toLocaleString("fr-DZ")} د.ج**`,
  ].join("\n");

  const extraSystemContext = [
    `سياق تدقيق المطابقة والمحاسبة الحي (COD Accounting Reconciliation Scope):`,
    `- نطاق شركة التوصيل المحدد الآن: ${courierScope === "all" ? "جميع شركات التوصيل (الكل)" : courierScope}`,
    `- ملخص الفرز الحالي (Bucket Counts): ${JSON.stringify(bucketCounts)}`,
    `- التقرير المالي COD الكامل للنطاق: ${JSON.stringify(accounting)}`,
    discrepancySamples.length > 0
      ? `- عينة مفارقات وحالات تحتاج مراجعة (حتى ${discrepancySamples.length} حالة): ${JSON.stringify(discrepancySamples)}`
      : `- ملاحظة: لا توجد صفوف مفارقات مرفوعة حالياً خارج الطلبيات المتزامنة في هذا النطاق.`,
    `- تعليمات صارمة للإخراج: أجب باللغة العربية بشكل كامل ومنظم ومرتب بالنقاط والأرقام الدقيقة، وأكمل التقرير وجميع الجمل والفقرات حتى الخاتمة دون أن تنقطع في منتصف الكلام.`,
  ].join("\n");

  const defaultSummaryPrompt = [
    `قدّم تقرير مراجعة ومطابقة محاسبية احترافياً وشاملاً باللغة العربية لنطاق (${courierScope === "all" ? "كافة شركات التوصيل" : courierScope})، يتضمن:`,
    `1) ملخص الفوارق والطلبيات غير المتزامنة والمكررة والمرتجعات الخارجية.`,
    `2) تحليل الموقف المالي COD (المسلّم، العالق، الجاهز للدفع، المحصّل، وخسائر المرتجعات tarif_retour وصافي الربح).`,
    `3) خطوات وتوصيات عملية مرتبة بالأولوية ومعرّفات الطلبيات الموجودة في البيانات.`,
  ].join("\n");

  const aiRes = await runOrvaGeminiAgentQuery({
    userMessage: isChat ? effectiveChatMessage : defaultSummaryPrompt,
    history: cleanHistory,
    attachments: cleanAttachments.length > 0 ? cleanAttachments : undefined,
    extraSystemContext,
    maxOutputTokens: 6144,
  });

  if (aiRes.ok && aiRes.reply) {
    return NextResponse.json({
      success: true,
      mode: isChat ? "chat" : "summary",
      courierScope,
      bucketCounts,
      accounting,
      summaryText: aiRes.reply,
      reply: aiRes.reply,
      model: aiRes.model || null,
      finishReason: aiRes.finishReason || null,
      truncated: Boolean(aiRes.truncated),
      usedFallback: false,
    });
  }

  if (isChat) {
    return NextResponse.json(
      {
        success: false,
        mode: "chat",
        courierScope,
        bucketCounts,
        accounting,
        error: formatGeminiUserErrorMessage(aiRes.errorCode, aiRes.apiError),
      },
      { status: aiRes.errorCode === "MISSING_API_KEY" ? 424 : 503 },
    );
  }

  return NextResponse.json({
    success: true,
    mode: "summary",
    courierScope,
    bucketCounts,
    accounting,
    summaryText: deterministicMemo,
    reply: deterministicMemo,
    model: null,
    finishReason: null,
    truncated: false,
    usedFallback: true,
    aiWarning: formatGeminiUserErrorMessage(aiRes.errorCode, aiRes.apiError),
  });
}
