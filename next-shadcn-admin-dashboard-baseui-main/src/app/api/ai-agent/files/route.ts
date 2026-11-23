import { type NextRequest, NextResponse } from "next/server";

import { verifyAdminSession } from "@/lib/auth/admin-auth";
import { mapCourierStatusRich } from "@/lib/delivery/courier-status-mapper";
import { extractWilayaCode69 } from "@/lib/geo/algeria-69";
import { computeSha256Hex, type ParsedCourierRow, parseCourierExcelBuffer } from "@/lib/reconciliation/excel-parser";
import {
  compareFileWithStoredHistory,
  deleteStoredAiFile,
  listStoredAiFiles,
  storeUploadedAiFile,
} from "@/lib/reconciliation/reconciliation-engine";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const files = await listStoredAiFiles();
  return NextResponse.json({ success: true, files });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "يرجى تحديد ملف للرفع" }, { status: 400 });
    }

    const courierId =
      String(formData.get("courierId") || "")
        .trim()
        .toLowerCase() || null;
    const courierName = String(formData.get("courierName") || courierId || "ملف محاسبي");
    const lowerName = file.name.toLowerCase();
    const arrayBuf = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    let parsed: ReturnType<typeof parseCourierExcelBuffer>;
    let fileType: "excel" | "csv" | "json" = "excel";

    if (lowerName.endsWith(".json")) {
      fileType = "json";
      const rawText = buffer.toString("utf8");
      const jsonObj = JSON.parse(rawText);
      const list: Array<Record<string, any>> = Array.isArray(jsonObj)
        ? jsonObj
        : Array.isArray(jsonObj?.data)
          ? jsonObj.data
          : [];
      const rows: ParsedCourierRow[] = list.slice(0, 25000).map((r, idx) => {
        const rawSt = String(r.status || r.statut || "UNKNOWN");
        const rich = mapCourierStatusRich(rawSt);
        const phone = String(r.phone || r.telephone || "");
        return {
          rowIndex: idx + 1,
          courierId: courierId || "json",
          courierName,
          sourceFileName: file.name,
          trackingCode: String(r.tracking || r.trackingCode || "").toUpperCase(),
          reference: String(r.reference || r.order_id || ""),
          boutique: String(r.boutique || ""),
          customerName: String(r.client || r.customerName || "زبون"),
          customerPhone: phone,
          customerPhoneTail9: phone.replace(/[^\d]/g, "").slice(-9),
          customerPhone2: "",
          wilayaRaw: String(r.wilaya || ""),
          wilayaCode: extractWilayaCode69(r.wilaya || r.wilaya_code),
          commune: String(r.commune || ""),
          address: String(r.address || ""),
          montantDzd: Number(r.montant || r.total || 0) || 0,
          productName: String(r.produit || r.productName || ""),
          rawStatus: rawSt,
          normalizedStatus: rich.normalizedStatus,
          mappedStoreStatus: rich.orderStatus,
          financialStatus: String(r.financialStatus || ""),
          deliveryFeeDzd: Number(r.deliveryFee || 0) || 0,
          returnFeeDzd: r.returnFee !== undefined ? Number(r.returnFee) : null,
          driverName: String(r.driver || r.livreur || ""),
          driverPhone: String(r.driverPhone || ""),
          createdAt: r.created_at || r.createdAt || null,
          updatedAt: r.updated_at || r.updatedAt || null,
          rawRow: r,
        };
      });
      parsed = {
        fileName: file.name,
        fileHash: computeSha256Hex(buffer),
        fileSizeBytes: buffer.byteLength,
        sheetName: "JSON",
        rowCount: rows.length,
        headers: [],
        mapping: {},
        dateRangeStart: null,
        dateRangeEnd: null,
        rows,
      };
    } else {
      fileType = lowerName.endsWith(".csv") ? "csv" : "excel";
      parsed = parseCourierExcelBuffer({
        buffer,
        fileName: file.name,
        courierId: courierId || "excel",
        courierName,
      });
    }

    const delivered = parsed.rows.filter((r) => r.mappedStoreStatus === "delivered");
    const returned = parsed.rows.filter((r) => r.mappedStoreStatus === "returned");
    const totalMontantDzd = delivered.reduce((s, r) => s + r.montantDzd, 0);
    const totalReturnLossDzd = returned.reduce((s, r) => s + (r.returnFeeDzd ?? 400), 0);

    const freshness = await compareFileWithStoredHistory(parsed, courierId);
    const stored = await storeUploadedAiFile({
      parsed,
      fileType,
      courierId,
      freshness,
      parsedSummary: {
        deliveredCount: delivered.length,
        returnedCount: returned.length,
        totalDeliveredMontantDzd: totalMontantDzd,
        estimatedReturnLossDzd: totalReturnLossDzd,
      },
    });

    return NextResponse.json({
      success: true,
      file: stored,
      freshness,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || "تعذرت قراءة وحفظ الملف" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ success: false, error: "id required" }, { status: 400 });
  }
  await deleteStoredAiFile(id);
  return NextResponse.json({ success: true });
}
