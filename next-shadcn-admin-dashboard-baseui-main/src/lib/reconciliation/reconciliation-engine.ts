/**
 * ORVA Store — Multi-Courier Excel & API Reconciliation Engine + AI File Freshness Intelligence
 */

import type { CodAccountingReport } from "@/lib/analytics/accounting-report";
import { computeCodAccountingReport } from "@/lib/analytics/accounting-report";
import { autoRegisterExternalCourier, loadCourierConfig } from "@/lib/couriers/credentials-store";
import { classifyParcelLocationStage, mapCourierStatusRich } from "@/lib/delivery/courier-status-mapper";
import { extractWilayaCode69 } from "@/lib/geo/algeria-69";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { getStoredFallbackOrders } from "@/lib/orders-store";
import { normalizeOrvaOrder, type OrvaOrder } from "@/lib/orva-api";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

import type { ParsedCourierFileResult, ParsedCourierRow } from "./excel-parser";

export type ReconciliationBucket = "matched_synced" | "matched_unsynced" | "store_only" | "courier_only" | "duplicate";

export interface ReconciledRowItem {
  id: string;
  bucket: ReconciliationBucket;
  courierId: string;
  courierName: string;
  trackingCode: string | null;
  reference: string | null;
  storeOrderId: string | null;
  storeOrderStatus: string | null;
  courierStatusRaw: string | null;
  courierStatusAr: string | null;
  courierLocationStage: string | null;
  customerName: string;
  customerPhone: string;
  wilayaCode: number | null;
  wilayaName: string;
  commune: string;
  montantDzd: number;
  storeTotalDzd: number | null;
  returnFeeDzd: number;
  driverName: string | null;
  driverPhone: string | null;
  boutique: string | null;
  isStoreOwnedReturn: boolean;
  discrepancyReason: string | null;
  sourceFileName: string | null;
  financialStatus: string | null;
  rawCourierRow?: ParsedCourierRow;
  rawStoreOrder?: OrvaOrder;
}

export interface FileFreshnessReport {
  freshnessStatus: "fresh" | "updated" | "duplicate" | "stale_warning";
  previousFileId: string | null;
  previousFileName: string | null;
  overlapPct: number;
  newRowsCount: number;
  statusChangedCount: number;
  notificationMessage: string;
}

export interface StoredAiFileRecord {
  id: string;
  fileName: string;
  fileType: string;
  courierId: string | null;
  fileHash: string;
  fileSizeBytes: number;
  rowCount: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  freshnessStatus: "fresh" | "updated" | "duplicate" | "stale_warning";
  previousFileId: string | null;
  diffSummary: Record<string, unknown>;
  parsedSummary: Record<string, unknown>;
  parsedRowsPreview: Array<Record<string, unknown>>;
  createdAt: string;
}

export interface CourierBatchInput {
  courierId: string;
  courierName: string;
  sourceType: "excel" | "api";
  fileName?: string;
  fileHash?: string;
  fileSizeBytes?: number;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  rows: ParsedCourierRow[];
}

export interface ReconciliationRunSummary {
  runId: string;
  createdAt: string;
  couriersProcessed: Array<{
    courierId: string;
    courierName: string;
    autoRegistered: boolean;
    totalRows: number;
    freshness?: FileFreshnessReport;
  }>;
  counts: Record<ReconciliationBucket, number> & {
    totalExternalRows: number;
    totalStoreOrders: number;
    storeOwnedReturnsCount: number;
    totalReturnLossDzd: number;
  };
  rows: ReconciledRowItem[];
  accounting: CodAccountingReport;
}

const memoryAiFiles: StoredAiFileRecord[] =
  (globalThis as any).__orvaAiFilesMemory || ((globalThis as any).__orvaAiFilesMemory = []);
const memoryReconRuns: ReconciliationRunSummary[] =
  (globalThis as any).__orvaReconMemoryRuns || ((globalThis as any).__orvaReconMemoryRuns = []);

export function getMemoryReconRuns(): ReconciliationRunSummary[] {
  return memoryReconRuns;
}

export function getMemoryAiFiles(): StoredAiFileRecord[] {
  return memoryAiFiles;
}

function normalizePhoneTail(raw?: string | null): string {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (digits.startsWith("213") && digits.length >= 12) return digits.slice(3, 12);
  return digits.slice(-9);
}

function doesRowBelongToStore(
  row: Pick<ParsedCourierRow, "boutique" | "reference" | "trackingCode">,
  identifiers: string[],
): boolean {
  const hay = `${row.boutique || ""} ${row.reference || ""}`.toUpperCase();
  if (!hay.trim()) return false;
  return identifiers.some((id) => {
    const clean = id.trim().toUpperCase();
    return clean.length > 0 && hay.includes(clean);
  });
}

function statusesMatchInSync(storeStatusRaw: string, mappedStoreStatus: string): boolean {
  const s = (storeStatusRaw || "").toLowerCase();
  const m = mappedStoreStatus.toLowerCase();
  if (s === m) return true;
  if (m === "shipped" && ["shipped", "in_transit", "out_for_delivery", "pushed", "redex_station"].includes(s)) {
    return s === "shipped" || s === "in_transit" || s === "out_for_delivery";
  }
  if (m === "pushed" && (s === "pushed" || s === "confirmed")) return true;
  return false;
}

export async function loadAllStoreOrdersForReconciliation(): Promise<OrvaOrder[]> {
  const out: OrvaOrder[] = [];
  const seen = new Set<string>();

  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3000);
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          const norm = normalizeOrvaOrder(row);
          if (norm && !seen.has(norm.id)) {
            seen.add(norm.id);
            out.push(norm);
          }
        }
      }
    } catch {
      // Fallback below
    }
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

export async function listStoredAiFiles(): Promise<StoredAiFileRecord[]> {
  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data, error } = await supabase
        .from("ai_uploaded_files")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!error && Array.isArray(data)) {
        return data.map((r: any) => ({
          id: String(r.id),
          fileName: r.file_name,
          fileType: r.mime_type || "excel",
          courierId: r.courier_id ?? null,
          fileHash: r.file_hash,
          fileSizeBytes: Number(r.file_size_bytes ?? 0),
          rowCount: Number(r.row_count ?? 0),
          dateRangeStart: r.period_start ?? null,
          dateRangeEnd: r.period_end ?? null,
          freshnessStatus: r.status_alert || "fresh",
          previousFileId: r.diff_vs_previous?.previousFileId ?? null,
          diffSummary: r.diff_vs_previous ?? {},
          parsedSummary: r.parsed_summary ?? {},
          parsedRowsPreview: Array.isArray(r.raw_preview) ? r.raw_preview : [],
          createdAt: r.created_at,
        }));
      }
    } catch {
      // Fall back to in-memory store if migration pending
    }
  }
  return [...memoryAiFiles].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function compareFileWithStoredHistory(
  parsed: Pick<
    ParsedCourierFileResult,
    "fileName" | "fileHash" | "fileSizeBytes" | "rowCount" | "dateRangeStart" | "dateRangeEnd" | "rows"
  >,
  courierId: string | null,
): Promise<FileFreshnessReport> {
  const history = await listStoredAiFiles();
  const candidates = courierId ? history.filter((h) => h.courierId === courierId) : history;
  const previous = candidates[0] ?? history[0] ?? null;

  if (!previous) {
    return {
      freshnessStatus: "fresh",
      previousFileId: null,
      previousFileName: null,
      overlapPct: 0,
      newRowsCount: parsed.rowCount,
      statusChangedCount: 0,
      notificationMessage: `ملف جديد (${parsed.fileName}): ${parsed.rowCount} صف — أول نسخة مؤرشفة للتحليل والمقارنة.`,
    };
  }

  if (previous.fileHash === parsed.fileHash) {
    return {
      freshnessStatus: "duplicate",
      previousFileId: previous.id,
      previousFileName: previous.fileName,
      overlapPct: 100,
      newRowsCount: 0,
      statusChangedCount: 0,
      notificationMessage: `تنبيه تكرار: هذا الملف مطابق تماماً (SHA-256) للملف السابق "${previous.fileName}" المحفوظ بتاريخ ${new Date(previous.createdAt).toLocaleString("ar-DZ")}.`,
    };
  }

  // Check chronological regression
  if (
    parsed.dateRangeEnd &&
    previous.dateRangeEnd &&
    Date.parse(parsed.dateRangeEnd) < Date.parse(previous.dateRangeEnd) - 3600_000
  ) {
    return {
      freshnessStatus: "stale_warning",
      previousFileId: previous.id,
      previousFileName: previous.fileName,
      overlapPct: 0,
      newRowsCount: 0,
      statusChangedCount: 0,
      notificationMessage: `تحذير ملف قديم: أحدث تاريخ في الملف المرفوع (${new Date(parsed.dateRangeEnd).toLocaleDateString("ar-DZ")}) أقدم من آخر ملف مخزّن "${previous.fileName}" (${new Date(previous.dateRangeEnd).toLocaleDateString("ar-DZ")}).`,
    };
  }

  // Diff against previous preview rows
  const prevByKey = new Map<string, { status: string }>();
  for (const prevRow of previous.parsedRowsPreview) {
    const k = String(prevRow.trackingCode || prevRow.reference || "")
      .trim()
      .toUpperCase();
    if (k) prevByKey.set(k, { status: String(prevRow.rawStatus || "") });
  }

  let overlapCount = 0;
  let newRowsCount = 0;
  let statusChangedCount = 0;
  for (const r of parsed.rows) {
    const k = (r.trackingCode || r.reference || "").trim().toUpperCase();
    if (!k) continue;
    const match = prevByKey.get(k);
    if (!match) {
      newRowsCount += 1;
    } else {
      overlapCount += 1;
      if (match.status.toLowerCase() !== r.rawStatus.toLowerCase()) {
        statusChangedCount += 1;
      }
    }
  }

  const denom = Math.max(1, parsed.rows.length);
  const overlapPct = Math.round((overlapCount / denom) * 100);

  return {
    freshnessStatus: "updated",
    previousFileId: previous.id,
    previousFileName: previous.fileName,
    overlapPct,
    newRowsCount,
    statusChangedCount,
    notificationMessage: `ملف محدث مقارنة بـ "${previous.fileName}": يحتوي على ${newRowsCount} سجل جديد و${statusChangedCount} تغيّر في الحالات (تطابق ${overlapPct}%).`,
  };
}

export async function storeUploadedAiFile(params: {
  parsed: ParsedCourierFileResult;
  fileType: "excel" | "csv" | "json";
  courierId: string | null;
  freshness: FileFreshnessReport;
  parsedSummary?: Record<string, unknown>;
}): Promise<StoredAiFileRecord> {
  const id = `aifile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const previewRows = params.parsed.rows.slice(0, 500).map((r) => ({
    trackingCode: r.trackingCode,
    reference: r.reference,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    wilayaCode: r.wilayaCode,
    montantDzd: r.montantDzd,
    rawStatus: r.rawStatus,
    mappedStoreStatus: r.mappedStoreStatus,
    returnFeeDzd: r.returnFeeDzd,
  }));

  const record: StoredAiFileRecord = {
    id,
    fileName: params.parsed.fileName,
    fileType: params.fileType,
    courierId: params.courierId,
    fileHash: params.parsed.fileHash,
    fileSizeBytes: params.parsed.fileSizeBytes,
    rowCount: params.parsed.rowCount,
    dateRangeStart: params.parsed.dateRangeStart,
    dateRangeEnd: params.parsed.dateRangeEnd,
    freshnessStatus: params.freshness.freshnessStatus,
    previousFileId: params.freshness.previousFileId,
    diffSummary: {
      overlapPct: params.freshness.overlapPct,
      newRowsCount: params.freshness.newRowsCount,
      statusChangedCount: params.freshness.statusChangedCount,
      notificationMessage: params.freshness.notificationMessage,
    },
    parsedSummary: params.parsedSummary ?? {},
    parsedRowsPreview: previewRows,
    createdAt: nowIso,
  };

  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data, error } = await supabase
        .from("ai_uploaded_files")
        .insert({
          file_name: record.fileName,
          file_hash: record.fileHash,
          mime_type: record.fileType,
          file_size_bytes: record.fileSizeBytes,
          file_role: "orders_export",
          courier_id: record.courierId,
          period_start: record.dateRangeStart,
          period_end: record.dateRangeEnd,
          row_count: record.rowCount,
          order_keys: previewRows.map((p) => p.trackingCode || p.reference).filter(Boolean),
          parsed_summary: record.parsedSummary,
          diff_vs_previous: { ...record.diffSummary, previousFileId: record.previousFileId },
          status_alert: record.freshnessStatus,
          alert_message: String(record.diffSummary.notificationMessage || ""),
          raw_preview: previewRows,
        })
        .select("*")
        .maybeSingle();
      if (!error && data) {
        record.id = String(data.id);
        record.createdAt = data.created_at || nowIso;
      }
    } catch {
      // Fallback memory store handles it
    }
  }

  memoryAiFiles.unshift(record);
  if (memoryAiFiles.length > 50) memoryAiFiles.length = 50;
  return record;
}

export async function deleteStoredAiFile(fileId: string): Promise<boolean> {
  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      await supabase.from("ai_uploaded_files").delete().eq("id", fileId);
    } catch {
      // Ignore missing table
    }
  }
  const idx = memoryAiFiles.findIndex((f) => f.id === fileId);
  if (idx >= 0) memoryAiFiles.splice(idx, 1);
  return true;
}

export async function runMultiCourierReconciliation(params: {
  batches: CourierBatchInput[];
  includeStoreOnly?: boolean;
}): Promise<ReconciliationRunSummary> {
  const runId = `recon-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();
  const [storeOrders, returnFeeMap] = await Promise.all([
    loadAllStoreOrdersForReconciliation(),
    getReturnFeesByWilayaMap().catch(() => ({}) as Record<number, number>),
  ]);

  const couriersProcessed: ReconciliationRunSummary["couriersProcessed"] = [];
  const identifiersByCourier = new Map<string, string[]>();

  // 1. Auto-register any unregistered couriers + run freshness checks
  for (const batch of params.batches) {
    const cleanCid = (batch.courierId || "").trim().toLowerCase() || "external";
    const existingCfg = await loadCourierConfig(cleanCid);
    let autoRegistered = false;
    if (!existingCfg) {
      await autoRegisterExternalCourier({
        courierId: cleanCid,
        courierName: batch.courierName || cleanCid,
        family: batch.sourceType === "api" ? "ecotrack" : "excel_only",
      });
      autoRegistered = true;
    }

    const storeIdentifiers = existingCfg?.storeIdentifiers?.length
      ? existingCfg.storeIdentifiers
      : ["ORVA", "ORV-", "PACK1-", "PACK2-", "PACK3-", "REROUTE-", "ORD-"];
    identifiersByCourier.set(cleanCid, storeIdentifiers);

    let freshness: FileFreshnessReport | undefined;
    if (batch.sourceType === "excel" && batch.fileHash && batch.fileName) {
      freshness = await compareFileWithStoredHistory(
        {
          fileName: batch.fileName,
          fileHash: batch.fileHash,
          fileSizeBytes: batch.fileSizeBytes ?? 0,
          rowCount: batch.rows.length,
          dateRangeStart: batch.dateRangeStart ?? null,
          dateRangeEnd: batch.dateRangeEnd ?? null,
          rows: batch.rows,
        },
        cleanCid,
      );
      await storeUploadedAiFile({
        parsed: {
          fileName: batch.fileName,
          fileHash: batch.fileHash,
          fileSizeBytes: batch.fileSizeBytes ?? 0,
          sheetName: "Sheet1",
          rowCount: batch.rows.length,
          headers: [],
          mapping: {},
          dateRangeStart: batch.dateRangeStart ?? null,
          dateRangeEnd: batch.dateRangeEnd ?? null,
          rows: batch.rows,
        },
        fileType: batch.fileName.toLowerCase().endsWith(".csv") ? "csv" : "excel",
        courierId: cleanCid,
        freshness,
        parsedSummary: { reconciliationRunId: runId, source: "reconciliation" },
      });
    }

    couriersProcessed.push({
      courierId: cleanCid,
      courierName: batch.courierName || existingCfg?.nameAr || cleanCid,
      autoRegistered,
      totalRows: batch.rows.length,
      freshness,
    });
  }

  // 2. Index Store DB orders + detect DB duplicates
  const storeByTracking = new Map<string, OrvaOrder[]>();
  const storeByRef = new Map<string, OrvaOrder[]>();
  const storeByPhone9 = new Map<string, OrvaOrder[]>();
  const matchedStoreIds = new Set<string>();

  for (const ord of storeOrders) {
    const trk = (ord.redexTrackingCode || ord.redexTrackingId || "").trim().toUpperCase();
    if (trk) {
      const list = storeByTracking.get(trk) ?? [];
      list.push(ord);
      storeByTracking.set(trk, list);
    }
    const refKey = ord.id.trim().toUpperCase();
    if (refKey) {
      const list = storeByRef.get(refKey) ?? [];
      list.push(ord);
      storeByRef.set(refKey, list);
    }
    const p9 = normalizePhoneTail(ord.phone);
    if (p9) {
      const list = storeByPhone9.get(p9) ?? [];
      list.push(ord);
      storeByPhone9.set(p9, list);
    }
  }

  // 3. Cross-file collision tracking (same tracking OR same phone+amount across batches/rows)
  const seenExternalKeys = new Map<string, { courierId: string; courierName: string; trackingCode: string }>();

  const rows: ReconciledRowItem[] = [];
  const counts: ReconciliationRunSummary["counts"] = {
    matched_synced: 0,
    matched_unsynced: 0,
    store_only: 0,
    courier_only: 0,
    duplicate: 0,
    totalExternalRows: 0,
    totalStoreOrders: storeOrders.length,
    storeOwnedReturnsCount: 0,
    totalReturnLossDzd: 0,
  };

  const capturedReturnsForAccounting: Array<{
    trackingCode: string;
    courierId: string;
    courierName: string;
    wilayaCode?: number | null;
    returnFeeDzd?: number | null;
    montantDzd?: number;
  }> = [];

  for (const batch of params.batches) {
    const cleanCid = (batch.courierId || "").trim().toLowerCase() || "external";
    const identifiers = identifiersByCourier.get(cleanCid) ?? ["ORVA", "ORV-"];

    for (let idx = 0; idx < batch.rows.length; idx++) {
      const ext = batch.rows[idx];
      counts.totalExternalRows += 1;

      const rich = mapCourierStatusRich(ext.rawStatus);
      const locStage = classifyParcelLocationStage(ext.rawStatus);
      const trk = ext.trackingCode.trim().toUpperCase();
      const refUpper = ext.reference.trim().toUpperCase();
      const returnFee =
        ext.returnFeeDzd && ext.returnFeeDzd > 0
          ? ext.returnFeeDzd
          : ext.wilayaCode && returnFeeMap[ext.wilayaCode] > 0
            ? returnFeeMap[ext.wilayaCode]
            : 400;

      // Key signatures for duplicate check
      const collisionKey = trk
        ? `TRK:${trk}`
        : refUpper
          ? `REF:${refUpper}`
          : ext.customerPhoneTail9
            ? `PH:${ext.customerPhoneTail9}:${ext.wilayaCode ?? ""}:${ext.montantDzd}`
            : `ROW:${cleanCid}:${idx}`;

      const prevCollision = seenExternalKeys.get(collisionKey);
      if (prevCollision) {
        counts.duplicate += 1;
        rows.push({
          id: `${runId}-dup-${rows.length + 1}`,
          bucket: "duplicate",
          courierId: cleanCid,
          courierName: batch.courierName,
          trackingCode: trk || null,
          reference: ext.reference || null,
          storeOrderId: null,
          storeOrderStatus: null,
          courierStatusRaw: ext.rawStatus,
          courierStatusAr: rich.labelAr,
          courierLocationStage: locStage,
          customerName: ext.customerName,
          customerPhone: ext.customerPhone,
          wilayaCode: ext.wilayaCode,
          wilayaName: ext.wilayaRaw || (ext.wilayaCode ? `ولاية ${ext.wilayaCode}` : "—"),
          commune: ext.commune,
          montantDzd: ext.montantDzd,
          storeTotalDzd: null,
          returnFeeDzd: returnFee,
          driverName: ext.driverName || null,
          driverPhone: ext.driverPhone || null,
          boutique: ext.boutique || null,
          isStoreOwnedReturn: false,
          discrepancyReason:
            prevCollision.courierId === cleanCid
              ? `مكرّر داخل ملف ${batch.courierName}`
              : `مكرّر عبر شركتين (${prevCollision.courierName} و ${batch.courierName})`,
          sourceFileName: batch.fileName ?? null,
          financialStatus: ext.financialStatus || null,
          rawCourierRow: ext,
        });
        continue;
      }
      seenExternalKeys.set(collisionKey, {
        courierId: cleanCid,
        courierName: batch.courierName,
        trackingCode: trk,
      });

      // Attempt Store Match: tracking -> reference -> phone9 + (wilaya or amount)
      let storeMatches: OrvaOrder[] = [];
      if (trk && storeByTracking.has(trk)) {
        storeMatches = storeByTracking.get(trk)!;
      } else if (refUpper && storeByRef.has(refUpper)) {
        storeMatches = storeByRef.get(refUpper)!;
      } else if (ext.customerPhoneTail9 && storeByPhone9.has(ext.customerPhoneTail9)) {
        const candidates = storeByPhone9.get(ext.customerPhoneTail9)!;
        storeMatches = candidates.filter((c) => {
          const cw = extractWilayaCode69(c.wilaya);
          const wOk = !ext.wilayaCode || !cw || cw === ext.wilayaCode;
          const total = Number(c.grandTotalDzd ?? c.priceDzd ?? 0);
          const amtOk = !ext.montantDzd || !total || Math.abs(total - ext.montantDzd) <= 200;
          return wOk && amtOk;
        });
      }

      if (storeMatches.length > 1) {
        const primary = storeMatches[0];
        matchedStoreIds.add(primary.id);
        counts.duplicate += 1;
        rows.push({
          id: `${runId}-dbdup-${rows.length + 1}`,
          bucket: "duplicate",
          courierId: cleanCid,
          courierName: batch.courierName,
          trackingCode: trk || null,
          reference: ext.reference || primary.id,
          storeOrderId: primary.id,
          storeOrderStatus: primary.status,
          courierStatusRaw: ext.rawStatus,
          courierStatusAr: rich.labelAr,
          courierLocationStage: locStage,
          customerName: ext.customerName,
          customerPhone: ext.customerPhone || primary.phone || "",
          wilayaCode: ext.wilayaCode,
          wilayaName: ext.wilayaRaw || primary.wilaya || "—",
          commune: ext.commune || primary.commune || "",
          montantDzd: ext.montantDzd,
          storeTotalDzd: primary.grandTotalDzd ?? primary.priceDzd ?? null,
          returnFeeDzd: returnFee,
          driverName: ext.driverName || null,
          driverPhone: ext.driverPhone || null,
          boutique: ext.boutique || null,
          isStoreOwnedReturn: false,
          discrepancyReason: `تطابق مع ${storeMatches.length} طلبيات مكررة في قاعدة المتجر (${storeMatches.map((m) => m.id).join(", ")})`,
          sourceFileName: batch.fileName ?? null,
          financialStatus: ext.financialStatus || null,
          rawCourierRow: ext,
          rawStoreOrder: primary,
        });
        continue;
      }

      if (storeMatches.length === 1) {
        const ord = storeMatches[0];
        matchedStoreIds.add(ord.id);
        const storeTotal = Number(ord.grandTotalDzd ?? ord.priceDzd ?? 0);
        const inSync = statusesMatchInSync(ord.status, rich.orderStatus);
        const amountMismatch = ext.montantDzd > 0 && storeTotal > 0 && Math.abs(ext.montantDzd - storeTotal) > 100;

        if (inSync && !amountMismatch) {
          counts.matched_synced += 1;
          rows.push({
            id: `${runId}-sync-${rows.length + 1}`,
            bucket: "matched_synced",
            courierId: cleanCid,
            courierName: batch.courierName,
            trackingCode: trk || ord.redexTrackingCode || null,
            reference: ext.reference || ord.id,
            storeOrderId: ord.id,
            storeOrderStatus: ord.status,
            courierStatusRaw: ext.rawStatus,
            courierStatusAr: rich.labelAr,
            courierLocationStage: locStage,
            customerName: ext.customerName || ord.customer || "—",
            customerPhone: ext.customerPhone || ord.phone || "",
            wilayaCode: ext.wilayaCode ?? extractWilayaCode69(ord.wilaya),
            wilayaName: ext.wilayaRaw || ord.wilaya || "—",
            commune: ext.commune || ord.commune || "",
            montantDzd: ext.montantDzd || storeTotal,
            storeTotalDzd: storeTotal,
            returnFeeDzd: returnFee,
            driverName: ext.driverName || null,
            driverPhone: ext.driverPhone || null,
            boutique: ext.boutique || null,
            isStoreOwnedReturn: false,
            discrepancyReason: null,
            sourceFileName: batch.fileName ?? null,
            financialStatus: ext.financialStatus || null,
            rawCourierRow: ext,
            rawStoreOrder: ord,
          });
        } else {
          counts.matched_unsynced += 1;
          const reasons: string[] = [];
          if (!inSync) {
            reasons.push(`الحالة في المتجر (${ord.status}) ≠ شركة التوصيل (${rich.labelAr})`);
          }
          if (amountMismatch) {
            reasons.push(`المبلغ في المتجر (${storeTotal} د.ج) ≠ التوصيل (${ext.montantDzd} د.ج)`);
          }
          rows.push({
            id: `${runId}-unsync-${rows.length + 1}`,
            bucket: "matched_unsynced",
            courierId: cleanCid,
            courierName: batch.courierName,
            trackingCode: trk || ord.redexTrackingCode || null,
            reference: ext.reference || ord.id,
            storeOrderId: ord.id,
            storeOrderStatus: ord.status,
            courierStatusRaw: ext.rawStatus,
            courierStatusAr: rich.labelAr,
            courierLocationStage: locStage,
            customerName: ext.customerName || ord.customer || "—",
            customerPhone: ext.customerPhone || ord.phone || "",
            wilayaCode: ext.wilayaCode ?? extractWilayaCode69(ord.wilaya),
            wilayaName: ext.wilayaRaw || ord.wilaya || "—",
            commune: ext.commune || ord.commune || "",
            montantDzd: ext.montantDzd || storeTotal,
            storeTotalDzd: storeTotal,
            returnFeeDzd: returnFee,
            driverName: ext.driverName || null,
            driverPhone: ext.driverPhone || null,
            boutique: ext.boutique || null,
            isStoreOwnedReturn: false,
            discrepancyReason: reasons.join(" · "),
            sourceFileName: batch.fileName ?? null,
            financialStatus: ext.financialStatus || null,
            rawCourierRow: ext,
            rawStoreOrder: ord,
          });
        }
        continue;
      }

      // Not found in Store DB -> courier_only
      counts.courier_only += 1;
      const isStoreOwnedReturn =
        rich.orderStatus === "returned" && (doesRowBelongToStore(ext, identifiers) || !ext.boutique);

      if (isStoreOwnedReturn) {
        counts.storeOwnedReturnsCount += 1;
        counts.totalReturnLossDzd += returnFee;
        capturedReturnsForAccounting.push({
          trackingCode: trk,
          courierId: cleanCid,
          courierName: batch.courierName,
          wilayaCode: ext.wilayaCode,
          returnFeeDzd: returnFee,
          montantDzd: ext.montantDzd,
        });
      }

      rows.push({
        id: `${runId}-conly-${rows.length + 1}`,
        bucket: "courier_only",
        courierId: cleanCid,
        courierName: batch.courierName,
        trackingCode: trk || null,
        reference: ext.reference || null,
        storeOrderId: null,
        storeOrderStatus: null,
        courierStatusRaw: ext.rawStatus,
        courierStatusAr: rich.labelAr,
        courierLocationStage: locStage,
        customerName: ext.customerName,
        customerPhone: ext.customerPhone,
        wilayaCode: ext.wilayaCode,
        wilayaName: ext.wilayaRaw || (ext.wilayaCode ? `ولاية ${ext.wilayaCode}` : "—"),
        commune: ext.commune,
        montantDzd: ext.montantDzd,
        storeTotalDzd: null,
        returnFeeDzd: returnFee,
        driverName: ext.driverName || null,
        driverPhone: ext.driverPhone || null,
        boutique: ext.boutique || null,
        isStoreOwnedReturn,
        discrepancyReason: isStoreOwnedReturn
          ? `طرد مرتجع يحمل معرّف المتجر (${ext.boutique || ext.reference || trk}) غير مسجّل محلياً — تكلفة الإرجاع ${returnFee} د.ج`
          : "مسجلة لدى شركة التوصيل وغير موجودة في قاعدة بيانات المتجر",
        sourceFileName: batch.fileName ?? null,
        financialStatus: ext.financialStatus || null,
        rawCourierRow: ext,
      });
    }
  }

  // 4. Store-only orders (not present in any uploaded/synced courier batch)
  if (params.includeStoreOnly !== false) {
    for (const ord of storeOrders) {
      if (matchedStoreIds.has(ord.id)) continue;
      if ((ord.status || "").toLowerCase() === "deleted") continue;

      counts.store_only += 1;
      const wCode = extractWilayaCode69(ord.wilaya);
      rows.push({
        id: `${runId}-sonly-${rows.length + 1}`,
        bucket: "store_only",
        courierId: (ord.courierId || (ord.inRedex ? "redex" : "unassigned")).toLowerCase(),
        courierName: ord.courierName || (ord.inRedex ? "Redex Express" : "غير مدفوعة للشحن"),
        trackingCode: ord.redexTrackingCode || ord.redexTrackingId || null,
        reference: ord.id,
        storeOrderId: ord.id,
        storeOrderStatus: ord.status,
        courierStatusRaw: ord.courierStatus || null,
        courierStatusAr: ord.courierStatusAr || null,
        courierLocationStage: ord.courierLocationStage || null,
        customerName: ord.customer || "—",
        customerPhone: ord.phone || "",
        wilayaCode: wCode,
        wilayaName: ord.wilaya || "—",
        commune: ord.commune || "",
        montantDzd: Number(ord.grandTotalDzd ?? ord.priceDzd ?? 0),
        storeTotalDzd: Number(ord.grandTotalDzd ?? ord.priceDzd ?? 0),
        returnFeeDzd: wCode && returnFeeMap[wCode] > 0 ? returnFeeMap[wCode] : 400,
        driverName: ord.driverName ?? null,
        driverPhone: ord.driverPhone ?? null,
        boutique: "ORVA Store",
        isStoreOwnedReturn: false,
        discrepancyReason: ord.redexTrackingCode
          ? "تحمل رقم تتبع في المتجر لكنها لم تظهر في ملف/مزامنة شركة التوصيل الحالية"
          : "مسجّلة في المتجر ولم تُرسل لأي شركة توصيل بعد",
        sourceFileName: null,
        financialStatus: ord.financialStatus ?? null,
        rawStoreOrder: ord,
      });
    }
  }

  const accounting = computeCodAccountingReport({
    orders: storeOrders,
    capturedReturns: capturedReturnsForAccounting,
    returnFeesByWilaya: returnFeeMap,
  });

  const summary: ReconciliationRunSummary = {
    runId,
    createdAt: nowIso,
    couriersProcessed,
    counts,
    rows,
    accounting,
  };

  // Persist lightweight summary in DB best-effort
  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const firstBatch = params.batches[0];
      const sourceTypeDb =
        params.batches.length > 1 ? "multi_file" : firstBatch?.sourceType === "api" ? "api_sync" : "excel";
      const { data: imp } = await supabase
        .from("reconciliation_imports")
        .insert({
          courier_id: firstBatch?.courierId || "multi",
          courier_name: firstBatch?.courierName || "Multi-Courier",
          source_type: sourceTypeDb,
          file_name: firstBatch?.fileName || "API Sync",
          file_hash: firstBatch?.fileHash || runId,
          total_rows: counts.totalExternalRows,
          matched_synced: counts.matched_synced,
          matched_unsynced: counts.matched_unsynced,
          store_only: counts.store_only,
          courier_only: counts.courier_only,
          duplicates_count: counts.duplicate,
          store_owned_returns_count: counts.storeOwnedReturnsCount,
          accounting_snapshot: accounting,
        })
        .select("id")
        .maybeSingle();

      if (imp?.id && rows.length > 0) {
        const sampleRows = rows.slice(0, 300).map((r) => ({
          import_id: imp.id,
          courier_id: r.courierId,
          bucket: r.bucket,
          tracking_code: r.trackingCode,
          reference: r.reference,
          store_order_id: r.storeOrderId,
          customer_name: r.customerName,
          customer_phone: r.customerPhone,
          wilaya_code: r.wilayaCode,
          wilaya_name: r.wilayaName,
          commune: r.commune,
          cod_amount: r.montantDzd,
          return_fee: r.returnFeeDzd,
          financial_status: r.financialStatus,
          is_store_owned_return: r.isStoreOwnedReturn,
          courier_status: r.courierStatusRaw,
          store_status: r.storeOrderStatus,
          diff: r.discrepancyReason ? { reason: r.discrepancyReason } : {},
          raw_row: r.rawCourierRow?.rawRow ?? {},
        }));
        await supabase.from("reconciliation_rows").insert(sampleRows);
      }
    } catch {
      // Ignore when migration not yet run on live DB
    }
  }

  memoryReconRuns.unshift(summary);
  if (memoryReconRuns.length > 10) memoryReconRuns.length = 10;

  return summary;
}
