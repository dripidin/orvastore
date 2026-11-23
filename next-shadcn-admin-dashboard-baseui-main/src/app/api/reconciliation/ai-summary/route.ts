import { type NextRequest, NextResponse } from "next/server";

import { runOrvaGeminiAgentQuery } from "@/lib/ai/store-ai-context";
import { computeCodAccountingReport } from "@/lib/analytics/accounting-report";
import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { getMemoryReconRuns, loadAllStoreOrdersForReconciliation } from "@/lib/reconciliation/reconciliation-engine";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const courierScope = String(body.courierId || "all")
    .trim()
    .toLowerCase();
  const runs = getMemoryReconRuns();
  const latestRun = runs[0] ?? null;

  const storeOrders = await loadAllStoreOrdersForReconciliation();
  const scopedStoreOrders =
    courierScope === "all"
      ? storeOrders
      : storeOrders.filter((o) => (o.courierId || (o.inRedex ? "redex" : "")).toLowerCase() === courierScope);

  const scopedReconRows = latestRun
    ? courierScope === "all"
      ? latestRun.rows
      : latestRun.rows.filter((r) => r.courierId === courierScope)
    : [];

  const returnFeeMap = await getReturnFeesByWilayaMap(courierScope === "all" ? undefined : courierScope).catch(
    () => ({}) as Record<number, number>,
  );

  const capturedReturns = scopedReconRows
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
  });

  const bucketCounts = {
    matched_synced: scopedReconRows.filter((r) => r.bucket === "matched_synced").length,
    matched_unsynced: scopedReconRows.filter((r) => r.bucket === "matched_unsynced").length,
    store_only: scopedReconRows.filter((r) => r.bucket === "store_only").length,
    courier_only: scopedReconRows.filter((r) => r.bucket === "courier_only").length,
    duplicate: scopedReconRows.filter((r) => r.bucket === "duplicate").length,
    storeOwnedReturns: capturedReturns.length,
  };

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
  ].join("\n");

  let aiMemo = deterministicMemo;
  try {
    const prompt = [
      `أعد صياغة تقرير مراجعة ومطابقة محاسبية احترافي باللغة العربية بناءً على البيانات التالية فقط لنطاق (${courierScope}):`,
      `ملخص الفرز: ${JSON.stringify(bucketCounts)}`,
      `أمثلة فوارق تحتاج تدخل: ${JSON.stringify(
        scopedReconRows
          .filter((r) => r.bucket !== "matched_synced")
          .slice(0, 12)
          .map((r) => ({
            bucket: r.bucket,
            courier: r.courierName,
            tracking: r.trackingCode,
            customer: r.customerName,
            store: r.storeOrderStatus,
            courierStatus: r.courierStatusAr,
            reason: r.discrepancyReason,
          })),
      )}`,
      `التقرير المالي COD: ${JSON.stringify(accounting)}`,
      `قدّم توصيات عملية مرتبة بالأرقام.`,
    ].join("\n");

    const aiRes = await runOrvaGeminiAgentQuery({ userMessage: prompt });
    if (aiRes.ok && aiRes.reply) {
      aiMemo = aiRes.reply;
    }
  } catch {
    // Fallback deterministic memo already computed
  }

  return NextResponse.json({
    success: true,
    courierScope,
    bucketCounts,
    accounting,
    summaryText: aiMemo,
  });
}
