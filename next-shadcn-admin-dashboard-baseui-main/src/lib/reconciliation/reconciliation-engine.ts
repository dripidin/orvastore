/**
 * ORVA Store — Multi-Courier Excel & API Reconciliation Engine + AI File Freshness Intelligence
 */

import type { CodAccountingReport } from "@/lib/analytics/accounting-report";
import { computeCodAccountingReport } from "@/lib/analytics/accounting-report";
import { autoRegisterExternalCourier, loadCourierConfig } from "@/lib/couriers/credentials-store";
import {
  classifyParcelLocationStage,
  mapCourierStatusRich,
  type RichCourierStatusMapping,
  type StoreOrderLifecycleStatus,
} from "@/lib/delivery/courier-status-mapper";
import { computeCourierStatusBridgeUpdate } from "@/lib/delivery/status-bridge";
import { parseWilayaCode69, resolveCarrierWilayaCode } from "@/lib/geo/algeria-69";
import { getReturnFeesByWilayaMap } from "@/lib/geo/coverage";
import { getStoredFallbackOrders, saveAllFallbackOrders } from "@/lib/orders-store";
import { normalizeOrvaOrder, type OrvaOrder } from "@/lib/orva-api";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

import type { ParsedCourierFileResult, ParsedCourierRow } from "./excel-parser";

export type ReconciliationBucket = "matched_synced" | "matched_unsynced" | "store_only" | "courier_only" | "duplicate";

export type ReconciliationMatchMethod =
  | "exact_tracking"
  | "exact_or_stripped_reference"
  | "phone_match"
  | "fuzzy_phone_typo"
  | "fuzzy_name_wilaya"
  | "unmatched";

export type DiscrepancyCategory =
  | "none"
  | "quantity_upsell"
  | "stop_desk_tariff_shift"
  | "commercial_rounding_discount"
  | "price_mismatch"
  | "status_lag"
  | "terminal_store_override_conflict"
  | "price_and_status"
  | "orphan_with_tracking"
  | "unpushed_store_order"
  | "unregistered_courier_order"
  | "store_owned_return"
  | "duplicate";

export interface AutoHealOrderPatch {
  totalPayableDzd?: number;
  subtotalDzd?: number;
  quantity?: number;
  deliveryFeeDzd?: number;
  deliveryType?: "DOMICILE" | "STOP_DESK";
  courierStatusRaw?: string;
  courierStatusAr?: string;
  normalizedCourierStatus?: string;
  courierLocationStage?: string;
  storeStatus?: StoreOrderLifecycleStatus;
  financialStatus?: string;
  returnFeeDzd?: number;
  driverName?: string;
  driverPhone?: string;
  remarksSummary?: string;
  adjustmentReasonAr?: string;
}

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
  codDiffDzd?: number;
  returnFeeDzd: number;
  driverName: string | null;
  driverPhone: string | null;
  boutique: string | null;
  remarksSummary?: string | null;
  isStoreOwnedReturn: boolean;
  discrepancyReason: string | null;
  discrepancyCategory?: DiscrepancyCategory;
  suggestedFixAr?: string | null;
  matchMethod?: ReconciliationMatchMethod;
  matchConfidence?: number;
  autoHealPatch?: AutoHealOrderPatch;
  autoHealed?: boolean;
  autoHealAppliedAt?: string;
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

function phoneHammingDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 99;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) diff += 1;
  }
  return diff;
}

function normalizePersonName(name?: string | null): string {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function nameSimilarityScore(a?: string | null, b?: string | null): number {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  const ta = new Set(na.split(" ").filter((w) => w.length >= 2));
  const tb = new Set(nb.split(" ").filter((w) => w.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;

  let overlap = 0;
  for (const word of ta) {
    if (tb.has(word)) overlap += 1;
  }
  return (2 * overlap) / (ta.size + tb.size);
}

function wilayasCompatible(w1: number | null, w2: number | null): boolean {
  if (!w1 || !w2) return true;
  if (w1 === w2) return true;
  return resolveCarrierWilayaCode(w1) === resolveCarrierWilayaCode(w2);
}

function extractRefSuffix(ref: string): string {
  const clean = ref.trim().toUpperCase();
  if (!clean) return "";
  const parts = clean.split(/[-_\s]+/).filter(Boolean);
  const tail = parts[parts.length - 1] || clean;
  return tail.length >= 5 ? tail : "";
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
  if (m === "pushed" && (s === "pushed" || s === "confirmed")) return true;
  return false;
}

export interface DiscrepancyDiagnosisResult {
  category: DiscrepancyCategory;
  codDiffDzd: number;
  inSync: boolean;
  amountMismatch: boolean;
  reasons: string[];
  suggestedFixAr: string | null;
  autoHealPatch: AutoHealOrderPatch;
}

export function diagnoseOrderDiscrepancy(params: {
  ord: OrvaOrder;
  ext: ParsedCourierRow;
  rich: RichCourierStatusMapping;
  returnFeeDzd: number;
}): DiscrepancyDiagnosisResult {
  const { ord, ext, rich, returnFeeDzd } = params;
  const storeTotal = Math.max(0, Number(ord.grandTotalDzd ?? ord.priceDzd ?? 0) || 0);
  const storeShipping = Math.max(0, Number(ord.shippingDzd ?? 0) || 0);
  const storeQty = Math.max(1, Number(ord.quantity ?? 1) || 1);
  const storeSubtotal = Math.max(0, Number(ord.priceDzd ?? Math.max(0, storeTotal - storeShipping)) || 0);
  const unitPrice = storeQty > 0 ? Math.round(storeSubtotal / storeQty) : storeSubtotal;

  const courierCod = Math.max(0, Number(ext.montantDzd || 0));
  const courierShipping = Math.max(0, Number(ext.deliveryFeeDzd || 0));
  const codDiffDzd = courierCod > 0 && storeTotal > 0 ? courierCod - storeTotal : 0;

  const bridge = computeCourierStatusBridgeUpdate({
    currentStoreStatus: ord.status,
    manualStatusOverride: Boolean(ord.manualStatusOverride),
    authoritativeCourierStatus: true,
    courierStatusRaw: ext.rawStatus,
    courierStatusAr: rich.labelAr,
    driverName: ext.driverName || undefined,
    driverPhone: ext.driverPhone || undefined,
    returnFeeDzd,
    financialStatus: ext.financialStatus || undefined,
    statusSource: ext.sourceFileName?.startsWith("API:") ? "courier_api" : "courier_excel",
  });

  const inSync = statusesMatchInSync(ord.status, rich.orderStatus);
  const amountMismatch = courierCod > 0 && storeTotal > 0 && Math.abs(codDiffDzd) > 0;
  const reasons: string[] = [];

  const isTerminalStore = ["delivered", "returned", "cancelled"].includes((ord.status || "").toLowerCase());
  const isNonTerminalCourier = !["delivered", "returned", "cancelled"].includes(rich.orderStatus);

  let priceCategory: DiscrepancyCategory = "none";
  let deliveryType: "DOMICILE" | "STOP_DESK" | undefined;
  let newDeliveryFee: number | undefined;
  let newQuantity: number | undefined;
  let newSubtotal: number | undefined;
  let adjustmentReasonAr: string | undefined;

  if (amountMismatch) {
    // 1. Check quantity upsell (e.g., 13,390 * 2 + 700 = 27,480 DZD)
    if (codDiffDzd > 0 && unitPrice > 0) {
      for (let n = storeQty + 1; n <= 10; n += 1) {
        const expectedWithCourierShip = unitPrice * n + (courierShipping > 0 ? courierShipping : storeShipping);
        const expectedWithStoreShip = unitPrice * n + storeShipping;
        if (Math.abs(courierCod - expectedWithCourierShip) <= 50 || Math.abs(courierCod - expectedWithStoreShip) <= 50) {
          const effFee = Math.abs(courierCod - expectedWithCourierShip) <= 50 && courierShipping > 0 ? courierShipping : storeShipping;
          priceCategory = "quantity_upsell";
          newQuantity = n;
          newDeliveryFee = effFee;
          newSubtotal = Math.max(0, courierCod - effFee);
          adjustmentReasonAr = `مضاعفة الكمية (Upsell ×${n}: ${storeTotal.toLocaleString()} ← ${courierCod.toLocaleString()} د.ج)`;
          break;
        }
      }
    }

    // 2. Check Domicile <-> Stop Desk tariff shift (e.g., stop_desk=1 & 1,300 -> 800 = -500 DZD)
    if (priceCategory === "none") {
      const feeDelta = courierShipping > 0 && storeShipping > 0 ? courierShipping - storeShipping : null;
      const matchesFeeDelta = feeDelta !== null && Math.abs(codDiffDzd - feeDelta) <= 50;
      const remarkIndicatesStopDesk = /bureau|stop[\s_-]*desk|المكتب|مكتب/i.test(ext.remarksSummary || "");
      if (ext.stopDesk || matchesFeeDelta || remarkIndicatesStopDesk) {
        priceCategory = "stop_desk_tariff_shift";
        const resolvedFee = courierShipping > 0 ? courierShipping : Math.max(0, storeShipping + codDiffDzd);
        deliveryType = ext.stopDesk || resolvedFee < storeShipping || remarkIndicatesStopDesk ? "STOP_DESK" : "DOMICILE";
        newDeliveryFee = resolvedFee;
        newSubtotal = Math.max(0, courierCod - resolvedFee);
        adjustmentReasonAr = `تحويل التوصيل إلى المكتب Stop Desk (${codDiffDzd >= 0 ? `+${codDiffDzd}` : codDiffDzd} د.ج)`;
      }
    }

    // 3. Check commercial rounding / discount (e.g., 14,140 -> 14,000 = -140 DZD)
    if (priceCategory === "none" && codDiffDzd < 0 && Math.abs(codDiffDzd) <= 300) {
      priceCategory = "commercial_rounding_discount";
      newDeliveryFee = courierShipping > 0 ? courierShipping : storeShipping;
      newSubtotal = Math.max(0, courierCod - newDeliveryFee);
      adjustmentReasonAr = `تقريب / تخفيض تجاري (${codDiffDzd} د.ج)`;
    }

    // 4. General COD adjustment
    if (priceCategory === "none") {
      priceCategory = "price_mismatch";
      newDeliveryFee = courierShipping > 0 ? courierShipping : storeShipping;
      newSubtotal = Math.max(0, courierCod - newDeliveryFee);
      adjustmentReasonAr = `تعديل مبلغ COD (${storeTotal.toLocaleString()} ← ${courierCod.toLocaleString()} د.ج)`;
    }

    reasons.push(`المبلغ في المتجر (${storeTotal} د.ج) ≠ التوصيل (${courierCod} د.ج) — ${adjustmentReasonAr}`);
  }

  let statusCategory: DiscrepancyCategory = "none";
  if (!inSync) {
    statusCategory = isTerminalStore && isNonTerminalCourier ? "terminal_store_override_conflict" : "status_lag";
    reasons.push(`الحالة في المتجر (${ord.status}) ≠ شركة التوصيل (${rich.labelAr})`);
  }

  let category: DiscrepancyCategory = "none";
  if (priceCategory !== "none" && statusCategory !== "none") {
    category = priceCategory === "price_mismatch" ? "price_and_status" : priceCategory;
  } else if (priceCategory !== "none") {
    category = priceCategory;
  } else if (statusCategory !== "none") {
    category = statusCategory;
  }

  const fixParts: string[] = [];
  if (adjustmentReasonAr) fixParts.push(adjustmentReasonAr);
  if (!inSync) fixParts.push(`اعتماد حالة الناقل (${rich.orderStatus})`);

  const autoHealPatch: AutoHealOrderPatch = {
    courierStatusRaw: bridge.courier_status,
    courierStatusAr: bridge.courier_status_ar,
    normalizedCourierStatus: bridge.normalized_courier_status,
    courierLocationStage: bridge.courier_location_stage,
    storeStatus: rich.orderStatus,
    financialStatus: bridge.financial_status || ext.financialStatus || undefined,
    returnFeeDzd,
    driverName: ext.driverName || undefined,
    driverPhone: ext.driverPhone || undefined,
    remarksSummary: ext.remarksSummary || undefined,
    adjustmentReasonAr,
  };

  if (amountMismatch) {
    autoHealPatch.totalPayableDzd = courierCod;
    autoHealPatch.subtotalDzd = newSubtotal;
    autoHealPatch.quantity = newQuantity ?? storeQty;
    autoHealPatch.deliveryFeeDzd = newDeliveryFee;
    if (deliveryType) autoHealPatch.deliveryType = deliveryType;
  }

  return {
    category,
    codDiffDzd,
    inSync,
    amountMismatch,
    reasons,
    suggestedFixAr: fixParts.length > 0 ? fixParts.join(" · ") : null,
    autoHealPatch,
  };
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

  // 2. Index Store DB orders (Tracking, Exact/Stripped Reference, Primary & Secondary Phones)
  const storeByTracking = new Map<string, OrvaOrder[]>();
  const storeByRef = new Map<string, OrvaOrder[]>();
  const storeByRefSuffix = new Map<string, OrvaOrder[]>();
  const storeByPhone9 = new Map<string, OrvaOrder[]>();
  const matchedStoreIds = new Set<string>();
  const syncedCourierIds = new Set(
    params.batches.map((b) => (b.courierId || "").trim().toLowerCase() || "external"),
  );

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
      const suffix = extractRefSuffix(refKey);
      if (suffix) {
        const sList = storeByRefSuffix.get(suffix) ?? [];
        sList.push(ord);
        storeByRefSuffix.set(suffix, sList);
      }
    }
    const rawAny = (ord.raw ?? {}) as Record<string, unknown>;
    const phones = [ord.phone, String(rawAny.phone2 ?? rawAny.phone_2 ?? rawAny.telephone_2 ?? rawAny.customer_phone_2 ?? "")];
    for (const phRaw of phones) {
      const p9 = normalizePhoneTail(phRaw);
      if (p9) {
        const list = storeByPhone9.get(p9) ?? [];
        if (!list.some((existing) => existing.id === ord.id)) {
          list.push(ord);
          storeByPhone9.set(p9, list);
        }
      }
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

      // 5-Tier Intelligent Matching:
      // Tier 1: exact tracking | Tier 2: exact or stripped reference | Tier 3: phone_match
      // Tier 4: fuzzy_phone_typo (Hamming = 1 + same wilaya) | Tier 5: fuzzy_name_wilaya (>= 72%)
      let storeMatches: OrvaOrder[] = [];
      let matchMethod: ReconciliationMatchMethod = "unmatched";
      let matchConfidence = 0;

      if (trk && storeByTracking.has(trk)) {
        storeMatches = storeByTracking.get(trk)!;
        matchMethod = "exact_tracking";
        matchConfidence = 100;
      } else if (refUpper && storeByRef.has(refUpper)) {
        storeMatches = storeByRef.get(refUpper)!;
        matchMethod = "exact_or_stripped_reference";
        matchConfidence = 98;
      } else if (refUpper) {
        const refTail = extractRefSuffix(refUpper) || (refUpper.length >= 5 ? refUpper : "");
        if (refTail && storeByRefSuffix.has(refTail)) {
          const suffixCandidates = storeByRefSuffix.get(refTail)!;
          if (suffixCandidates.length === 1) {
            storeMatches = suffixCandidates;
          } else {
            const narrowed = suffixCandidates.filter((c) => {
              const pOk = Boolean(ext.customerPhoneTail9 && normalizePhoneTail(c.phone) === ext.customerPhoneTail9);
              const wOk = wilayasCompatible(ext.wilayaCode, parseWilayaCode69(c.wilaya));
              return pOk || wOk;
            });
            storeMatches = narrowed.length > 0 ? narrowed : suffixCandidates;
          }
          matchMethod = "exact_or_stripped_reference";
          matchConfidence = 95;
        }
      }

      if (storeMatches.length === 0) {
        const p2Tail = normalizePhoneTail(ext.customerPhone2);
        const phoneCandidates = [
          ...(ext.customerPhoneTail9 ? (storeByPhone9.get(ext.customerPhoneTail9) ?? []) : []),
          ...(p2Tail && p2Tail !== ext.customerPhoneTail9 ? (storeByPhone9.get(p2Tail) ?? []) : []),
        ];
        if (phoneCandidates.length > 0) {
          const deduped = phoneCandidates.filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
          const wilayaMatched = deduped.filter((c) =>
            wilayasCompatible(ext.wilayaCode, parseWilayaCode69(c.wilaya)),
          );
          const pool = wilayaMatched.length > 0 ? wilayaMatched : deduped;
          if (pool.length === 1) {
            storeMatches = pool;
          } else {
            const closeAmt = pool.filter((c) => {
              const total = Number(c.grandTotalDzd ?? c.priceDzd ?? 0);
              return !ext.montantDzd || !total || Math.abs(total - ext.montantDzd) <= 600;
            });
            storeMatches = closeAmt.length > 0 ? closeAmt : pool;
          }
          matchMethod = "phone_match";
          matchConfidence = 92;
        }
      }

      // Tier 4: 1-digit phone typo + same/mother wilaya + (amount <= 600 OR name >= 65%)
      if (storeMatches.length === 0 && ext.customerPhoneTail9.length === 9) {
        const fuzzyPhoneHits = storeOrders.filter((c) => {
          if (matchedStoreIds.has(c.id)) return false;
          const p9 = normalizePhoneTail(c.phone);
          if (phoneHammingDistance(p9, ext.customerPhoneTail9) !== 1) return false;
          if (!wilayasCompatible(ext.wilayaCode, parseWilayaCode69(c.wilaya))) return false;
          const total = Number(c.grandTotalDzd ?? c.priceDzd ?? 0);
          const closeAmt = !ext.montantDzd || !total || Math.abs(total - ext.montantDzd) <= 600;
          const sim = nameSimilarityScore(ext.customerName, c.customer);
          return closeAmt || sim >= 0.65;
        });
        if (fuzzyPhoneHits.length > 0) {
          storeMatches = fuzzyPhoneHits;
          matchMethod = "fuzzy_phone_typo";
          matchConfidence = 84;
        }
      }

      // Tier 5: Normalized name similarity >= 72% + compatible wilaya + amount <= 600
      if (storeMatches.length === 0 && ext.wilayaCode) {
        const fuzzyNameHits = storeOrders.filter((c) => {
          if (matchedStoreIds.has(c.id)) return false;
          if (!wilayasCompatible(ext.wilayaCode, parseWilayaCode69(c.wilaya))) return false;
          const sim = nameSimilarityScore(ext.customerName, c.customer);
          if (sim < 0.72) return false;
          const total = Number(c.grandTotalDzd ?? c.priceDzd ?? 0);
          return !ext.montantDzd || !total || Math.abs(total - ext.montantDzd) <= 600;
        });
        if (fuzzyNameHits.length === 1) {
          storeMatches = fuzzyNameHits;
          matchMethod = "fuzzy_name_wilaya";
          matchConfidence = 76;
        }
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
          codDiffDzd: 0,
          returnFeeDzd: returnFee,
          driverName: ext.driverName || null,
          driverPhone: ext.driverPhone || null,
          boutique: ext.boutique || null,
          remarksSummary: ext.remarksSummary ?? null,
          isStoreOwnedReturn: false,
          discrepancyReason: `تطابق مع ${storeMatches.length} طلبيات مكررة في قاعدة المتجر (${storeMatches.map((m) => m.id).join(", ")})`,
          discrepancyCategory: "duplicate",
          matchMethod,
          matchConfidence,
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
        const diagnosis = diagnoseOrderDiscrepancy({
          ord,
          ext,
          rich,
          returnFeeDzd: returnFee,
        });

        if (diagnosis.inSync && !diagnosis.amountMismatch) {
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
            wilayaCode: ext.wilayaCode ?? parseWilayaCode69(ord.wilaya),
            wilayaName: ext.wilayaRaw || ord.wilaya || "—",
            commune: ext.commune || ord.commune || "",
            montantDzd: ext.montantDzd || storeTotal,
            storeTotalDzd: storeTotal,
            codDiffDzd: 0,
            returnFeeDzd: returnFee,
            driverName: ext.driverName || null,
            driverPhone: ext.driverPhone || null,
            boutique: ext.boutique || null,
            remarksSummary: ext.remarksSummary ?? null,
            isStoreOwnedReturn: false,
            discrepancyReason: null,
            discrepancyCategory: "none",
            matchMethod,
            matchConfidence,
            autoHealPatch: diagnosis.autoHealPatch,
            sourceFileName: batch.fileName ?? null,
            financialStatus: ext.financialStatus || null,
            rawCourierRow: ext,
            rawStoreOrder: ord,
          });
        } else {
          counts.matched_unsynced += 1;
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
            wilayaCode: ext.wilayaCode ?? parseWilayaCode69(ord.wilaya),
            wilayaName: ext.wilayaRaw || ord.wilaya || "—",
            commune: ext.commune || ord.commune || "",
            montantDzd: ext.montantDzd || storeTotal,
            storeTotalDzd: storeTotal,
            codDiffDzd: diagnosis.codDiffDzd,
            returnFeeDzd: returnFee,
            driverName: ext.driverName || null,
            driverPhone: ext.driverPhone || null,
            boutique: ext.boutique || null,
            remarksSummary: ext.remarksSummary ?? null,
            isStoreOwnedReturn: false,
            discrepancyReason: diagnosis.reasons.join(" · "),
            discrepancyCategory: diagnosis.category,
            suggestedFixAr: diagnosis.suggestedFixAr,
            matchMethod,
            matchConfidence,
            autoHealPatch: diagnosis.autoHealPatch,
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

  // 4. Store-only orders — STRICTLY SCOPED to synced courier(s) so syncing yalidine/zrexpress never flags Redex parcels!
  if (params.includeStoreOnly !== false) {
    const includesPrimaryOrRedex = syncedCourierIds.has("redex") || syncedCourierIds.size === 0;
    for (const ord of storeOrders) {
      if (matchedStoreIds.has(ord.id)) continue;
      if ((ord.status || "").toLowerCase() === "deleted") continue;

      const ordCourier = (ord.courierId || (ord.inRedex || ord.redexTrackingCode ? "redex" : "")).toLowerCase();
      const hasExplicitOtherCourier = Boolean(ordCourier && !syncedCourierIds.has(ordCourier));
      if (hasExplicitOtherCourier) continue;
      if (!ordCourier && !includesPrimaryOrRedex) continue;

      counts.store_only += 1;
      const wCode = parseWilayaCode69(ord.wilaya);
      rows.push({
        id: `${runId}-sonly-${rows.length + 1}`,
        bucket: "store_only",
        courierId: ordCourier || "unassigned",
        courierName: ord.courierName || (ordCourier === "redex" ? "Redex Express" : "غير مدفوعة للشحن"),
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
        discrepancyCategory: ord.redexTrackingCode ? "orphan_with_tracking" : "unpushed_store_order",
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

/**
 * Shared DB & fallback persistence helper for applying authoritative courier updates
 * (status, COD total, quantity upsell, Stop Desk tariff shift, driver info, return fee).
 */
export async function persistAuthoritativeOrderPatch(params: {
  orderId: string;
  courierId?: string;
  trackingCode?: string | null;
  patch: AutoHealOrderPatch;
}): Promise<boolean> {
  const { orderId, courierId, trackingCode, patch } = params;
  if (!orderId) return false;

  const nowIso = new Date().toISOString();
  const coreUpdate: Record<string, unknown> = { updated_at: nowIso };
  const extraUpdate: Record<string, unknown> = {
    courier_last_synced_at: nowIso,
    status_source: "courier_api",
    manual_status_override: false,
  };

  if (patch.storeStatus) {
    coreUpdate.status = patch.storeStatus.toUpperCase();
  }
  if (trackingCode) {
    coreUpdate.in_redex = true;
    coreUpdate.tracking_code = trackingCode;
    coreUpdate.redex_tracking_code = trackingCode;
    extraUpdate.redex_tracking_id = trackingCode;
  }
  if (courierId) {
    coreUpdate.courier = courierId.toUpperCase();
    extraUpdate.courier_id = courierId;
  }
  if (patch.totalPayableDzd !== undefined && patch.totalPayableDzd > 0) {
    coreUpdate.total_payable = patch.totalPayableDzd;
    coreUpdate.total = patch.totalPayableDzd;
    coreUpdate.price_num = patch.totalPayableDzd;
    coreUpdate.grand_total = `${patch.totalPayableDzd.toLocaleString("fr-DZ")} د.ج`;
  }
  if (patch.subtotalDzd !== undefined && patch.subtotalDzd >= 0) {
    coreUpdate.subtotal = patch.subtotalDzd;
    coreUpdate.product_total = `${patch.subtotalDzd.toLocaleString("fr-DZ")} د.ج`;
  }
  if (patch.deliveryFeeDzd !== undefined && patch.deliveryFeeDzd >= 0) {
    coreUpdate.delivery_fee = patch.deliveryFeeDzd;
    coreUpdate.shipping_fee = `${patch.deliveryFeeDzd.toLocaleString("fr-DZ")} د.ج`;
  }
  if (patch.quantity !== undefined && patch.quantity >= 1) {
    coreUpdate.quantity = patch.quantity;
  }
  if (patch.deliveryType) {
    coreUpdate.delivery_method = patch.deliveryType;
    coreUpdate.delivery_type = patch.deliveryType === "STOP_DESK" ? "توصيل للمكتب (Stop Desk)" : "توصيل للمنزل";
  }

  if (patch.courierStatusRaw) extraUpdate.courier_status = patch.courierStatusRaw;
  if (patch.courierStatusAr) extraUpdate.courier_status_ar = patch.courierStatusAr;
  if (patch.normalizedCourierStatus) extraUpdate.normalized_courier_status = patch.normalizedCourierStatus;
  if (patch.courierLocationStage) extraUpdate.courier_location_stage = patch.courierLocationStage;
  if (patch.financialStatus) extraUpdate.financial_status = patch.financialStatus;
  if (patch.returnFeeDzd !== undefined && patch.returnFeeDzd >= 0) extraUpdate.return_fee_dzd = patch.returnFeeDzd;
  if (patch.driverName) extraUpdate.driver_name = patch.driverName;
  if (patch.driverPhone) extraUpdate.driver_phone = patch.driverPhone;

  let persisted = false;
  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const safeKey = orderId.replace(/[,()]/g, "");
      await supabase
        .from("orders")
        .update(coreUpdate)
        .or(`order_id.eq.${safeKey},order_number.eq.${safeKey}`);
      try {
        await supabase
          .from("orders")
          .update(extraUpdate)
          .or(`order_id.eq.${safeKey},order_number.eq.${safeKey}`);
      } catch {
        // Optional post-migration columns
      }
      persisted = true;
    } catch {
      // Fallback store below
    }
  }

  const fbAll = getStoredFallbackOrders();
  let fbChanged = false;
  for (const fb of fbAll) {
    if (fb.id === orderId || fb.orderNumber === orderId) {
      if (patch.storeStatus) fb.status = patch.storeStatus.toUpperCase() as any;
      if (patch.totalPayableDzd !== undefined && patch.totalPayableDzd > 0) fb.totalPayable = patch.totalPayableDzd;
      if (patch.subtotalDzd !== undefined && patch.subtotalDzd >= 0) fb.productPrice = patch.subtotalDzd;
      if (patch.deliveryFeeDzd !== undefined && patch.deliveryFeeDzd >= 0) fb.shippingFee = patch.deliveryFeeDzd;
      if (patch.deliveryType) fb.deliveryType = patch.deliveryType;
      if (patch.quantity !== undefined && patch.quantity >= 1) (fb as any).quantity = patch.quantity;
      if (trackingCode) {
        (fb as any).in_redex = true;
        (fb as any).redex_tracking_code = trackingCode;
        fb.redexTrackingId = trackingCode;
      }
      if (patch.courierStatusRaw) (fb as any).courier_status = patch.courierStatusRaw;
      if (patch.courierStatusAr) (fb as any).courier_status_ar = patch.courierStatusAr;
      if (patch.financialStatus) (fb as any).financial_status = patch.financialStatus;
      if (patch.returnFeeDzd !== undefined) (fb as any).return_fee_dzd = patch.returnFeeDzd;
      fbChanged = true;
      persisted = true;
    }
  }
  if (fbChanged) saveAllFallbackOrders(fbAll);
  return persisted;
}

/**
 * Approved /grill-me Policy:
 * Authoritatively heals Store orders (COD total, quantity upsells, Stop Desk fees, detailed status)
 * using Courier truth as the final reference, and promotes healed rows into `matched_synced`.
 */
export async function applyAuthoritativeCourierAutoHeal(
  summary: ReconciliationRunSummary,
): Promise<{
  summary: ReconciliationRunSummary;
  healedCount: number;
  priceHealedCount: number;
  statusHealedCount: number;
}> {
  const nowIso = new Date().toISOString();
  let healedCount = 0;
  let priceHealedCount = 0;
  let statusHealedCount = 0;

  for (const row of summary.rows) {
    if (row.bucket !== "matched_unsynced" && row.bucket !== "matched_synced") continue;
    if (!row.storeOrderId || !row.autoHealPatch) continue;

    const patch = row.autoHealPatch;
    const isUnsynced = row.bucket === "matched_unsynced";
    if (!isUnsynced && !row.trackingCode) continue;

    await persistAuthoritativeOrderPatch({
      orderId: row.storeOrderId,
      courierId: row.courierId,
      trackingCode: row.trackingCode,
      patch,
    });

    if (isUnsynced) {
      healedCount += 1;
      if (patch.totalPayableDzd !== undefined) priceHealedCount += 1;
      if (patch.storeStatus && patch.storeStatus !== (row.storeOrderStatus || "").toLowerCase()) {
        statusHealedCount += 1;
      }

      row.bucket = "matched_synced";
      row.storeOrderStatus = patch.storeStatus || row.storeOrderStatus;
      if (patch.totalPayableDzd !== undefined) row.storeTotalDzd = patch.totalPayableDzd;
      row.codDiffDzd = 0;
      row.autoHealed = true;
      row.autoHealAppliedAt = nowIso;
      row.discrepancyReason = patch.adjustmentReasonAr
        ? `مزامنة تلقائية 100%: ${patch.adjustmentReasonAr}`
        : `مزامنة تلقائية 100%: اعتماد حالة الناقل (${row.courierStatusAr || row.courierStatusRaw})`;
    }
  }

  if (healedCount > 0) {
    summary.counts.matched_unsynced = summary.rows.filter((r) => r.bucket === "matched_unsynced").length;
    summary.counts.matched_synced = summary.rows.filter((r) => r.bucket === "matched_synced").length;
    const [freshOrders, returnFeeMap] = await Promise.all([
      loadAllStoreOrdersForReconciliation(),
      getReturnFeesByWilayaMap().catch(() => ({}) as Record<number, number>),
    ]);
    const capturedReturns = summary.rows
      .filter((r) => r.bucket === "courier_only" && r.isStoreOwnedReturn)
      .map((r) => ({
        trackingCode: r.trackingCode || r.id,
        courierId: r.courierId,
        courierName: r.courierName,
        wilayaCode: r.wilayaCode,
        returnFeeDzd: r.returnFeeDzd,
        montantDzd: r.montantDzd,
      }));
    summary.accounting = computeCodAccountingReport({
      orders: freshOrders,
      capturedReturns,
      returnFeesByWilaya: returnFeeMap,
    });
  }

  return { summary, healedCount, priceHealedCount, statusHealedCount };
}
