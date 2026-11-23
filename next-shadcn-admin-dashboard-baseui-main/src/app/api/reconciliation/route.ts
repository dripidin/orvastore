import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import {
  COURIER_DZ_PROVIDERS,
  EcoTrackClient,
  getCourierProviderManager,
  listCourierConfigsPublic,
  loadCourierConfig,
} from "@/lib/couriers";
import { mapCourierStatusRich } from "@/lib/delivery/courier-status-mapper";
import { extractWilayaCode69 } from "@/lib/geo/algeria-69";
import { type ParsedCourierRow, parseCourierExcelBuffer } from "@/lib/reconciliation/excel-parser";
import {
  type CourierBatchInput,
  getMemoryReconRuns,
  runMultiCourierReconciliation,
} from "@/lib/reconciliation/reconciliation-engine";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const couriers = await listCourierConfigsPublic();
  let dbHistory: any[] = [];
  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data, error } = await supabase
        .from("reconciliation_imports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (!error && Array.isArray(data)) dbHistory = data;
    } catch {
      dbHistory = [];
    }
  }

  return NextResponse.json({
    success: true,
    couriers,
    catalog: COURIER_DZ_PROVIDERS,
    history: dbHistory,
    recentRuns: getMemoryReconRuns().map((r) => ({
      runId: r.runId,
      createdAt: r.createdAt,
      couriersProcessed: r.couriersProcessed,
      counts: r.counts,
    })),
    latestRun: getMemoryReconRuns()[0] ?? null,
  });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    // Mode 1: Multi-File Excel / CSV Upload (multipart/form-data)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const files = formData.getAll("files").filter((f): f is File => f instanceof File);
      if (files.length === 0) {
        return NextResponse.json(
          { success: false, error: "يرجى إرفاق ملف Excel أو CSV واحد على الأقل" },
          { status: 400 },
        );
      }

      const metaRaw = String(formData.get("metadata") || "[]");
      let metaList: Array<{
        courierId?: string;
        courierName?: string;
        columnOverrides?: Record<string, string>;
      }> = [];
      try {
        const parsed = JSON.parse(metaRaw);
        if (Array.isArray(parsed)) metaList = parsed;
      } catch {
        metaList = [];
      }

      const includeStoreOnly = String(formData.get("includeStoreOnly") || "true") !== "false";
      const batches: CourierBatchInput[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const meta = metaList[i] || {};
        const courierName = String(
          meta.courierName || formData.get(`courierName_${i}`) || meta.courierId || `External Courier ${i + 1}`,
        ).trim();
        const courierId =
          String(meta.courierId || formData.get(`courierId_${i}`) || courierName)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || `ext_${i + 1}`;

        const arrayBuf = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const parsedFile = parseCourierExcelBuffer({
          buffer,
          fileName: file.name,
          courierId,
          courierName,
          columnOverrides: meta.columnOverrides,
        });

        batches.push({
          courierId,
          courierName,
          sourceType: "excel",
          fileName: parsedFile.fileName,
          fileHash: parsedFile.fileHash,
          fileSizeBytes: parsedFile.fileSizeBytes,
          dateRangeStart: parsedFile.dateRangeStart,
          dateRangeEnd: parsedFile.dateRangeEnd,
          rows: parsedFile.rows,
        });
      }

      const result = await runMultiCourierReconciliation({ batches, includeStoreOnly });
      return NextResponse.json({ success: true, result });
    }

    // Mode 2: Live API Token Pull (`{ mode: "api_sync", courierIds: [...], startDate, endDate }`)
    const body = await request.json().catch(() => ({}));
    const courierIds: string[] = Array.isArray(body.courierIds)
      ? body.courierIds.map((c: unknown) => String(c).trim().toLowerCase()).filter(Boolean)
      : body.courierId
        ? [String(body.courierId).trim().toLowerCase()]
        : ["redex"];

    const startDate = typeof body.startDate === "string" ? body.startDate : undefined;
    const endDate = typeof body.endDate === "string" ? body.endDate : undefined;
    const includeStoreOnly = body.includeStoreOnly !== false;
    const batches: CourierBatchInput[] = [];
    const manager = getCourierProviderManager();

    for (const cid of courierIds) {
      const cfg = await loadCourierConfig(cid);
      const { provider, credentials } = await manager.resolveConfiguredProvider(cid);
      let extRows: ParsedCourierRow[] = [];

      if (cfg?.family === "ecotrack" || cid === "redex") {
        const client = new EcoTrackClient({
          courierId: cfg?.id || cid,
          baseUrl: cfg?.baseUrl,
          token: cfg?.apiToken,
        });
        const res = await client.getAllOrdersPaginated({
          startDate,
          endDate,
          maxPages: Number(body.maxPages ?? 8),
        });
        if (!res.success) {
          return NextResponse.json(
            { success: false, error: res.error || `تعذر سحب الطلبيات من ${cfg?.nameAr || cid}` },
            { status: 502 },
          );
        }
        extRows = res.orders.map((o, idx) => {
          const rich = mapCourierStatusRich(o.status);
          const phoneDigits = String(o.phone || "").replace(/[^\d]/g, "");
          return {
            rowIndex: idx + 1,
            courierId: cid,
            courierName: cfg?.nameAr || cfg?.name || cid,
            sourceFileName: `API:${cid}`,
            trackingCode: o.tracking.toUpperCase(),
            reference: o.reference || "",
            boutique: o.boutique || "",
            customerName: o.client || "زبون",
            customerPhone: o.phone || "",
            customerPhoneTail9: phoneDigits.slice(-9),
            customerPhone2: o.phone2 || "",
            wilayaRaw: o.wilayaName || (o.wilayaId ? String(o.wilayaId) : ""),
            wilayaCode: o.wilayaId || extractWilayaCode69(o.wilayaName),
            commune: o.commune || "",
            address: o.address || "",
            montantDzd: Number(o.montant || 0),
            productName: "",
            rawStatus: o.status,
            normalizedStatus: rich.normalizedStatus,
            mappedStoreStatus: rich.orderStatus,
            financialStatus: o.financialStatus || "",
            deliveryFeeDzd: Number(o.deliveryFee || 0),
            returnFeeDzd: o.returnFee ?? null,
            driverName: o.driverName || "",
            driverPhone: o.driverPhone || "",
            createdAt: o.createdAt || null,
            updatedAt: o.updatedAt || null,
            rawRow: (o.raw as Record<string, unknown>) ?? {},
          };
        });
      } else if (provider.getOrders) {
        const res = await provider.getOrders({ page: 1, startDate, endDate }, credentials);
        if (res.success) {
          extRows = res.orders.map((o, idx) => {
            const rich = mapCourierStatusRich(o.status);
            const phoneDigits = String(o.phone || "").replace(/[^\d]/g, "");
            return {
              rowIndex: idx + 1,
              courierId: cid,
              courierName: cfg?.nameAr || provider.name,
              sourceFileName: `API:${cid}`,
              trackingCode: o.tracking.toUpperCase(),
              reference: o.reference || "",
              boutique: o.boutique || "",
              customerName: o.client || "زبون",
              customerPhone: o.phone || "",
              customerPhoneTail9: phoneDigits.slice(-9),
              customerPhone2: o.phone2 || "",
              wilayaRaw: o.wilayaName || "",
              wilayaCode: o.wilayaId || extractWilayaCode69(o.wilayaName),
              commune: o.commune || "",
              address: o.address || "",
              montantDzd: Number(o.montant || 0),
              productName: "",
              rawStatus: o.status,
              normalizedStatus: rich.normalizedStatus,
              mappedStoreStatus: rich.orderStatus,
              financialStatus: o.financialStatus || "",
              deliveryFeeDzd: Number(o.deliveryFee || 0),
              returnFeeDzd: o.returnFee ?? null,
              driverName: o.driverName || "",
              driverPhone: o.driverPhone || "",
              createdAt: o.createdAt || null,
              updatedAt: o.updatedAt || null,
              rawRow: (o.raw as Record<string, unknown>) ?? {},
            };
          });
        }
      }

      batches.push({
        courierId: cid,
        courierName: cfg?.nameAr || cfg?.name || provider.name,
        sourceType: "api",
        rows: extRows,
      });
    }

    const result = await runMultiCourierReconciliation({ batches, includeStoreOnly });
    return NextResponse.json({ success: true, result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "حدث خطأ أثناء معالجة المطابقة" },
      { status: 500 },
    );
  }
}
