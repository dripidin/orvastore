/**
 * ORVA Store — Multi-Courier Excel / CSV / JSON Parser
 * Uses SheetJS (`xlsx`) to parse .xlsx, .xls, and .csv files with:
 * - File safety bounds (10 MB max, 25,000 rows max)
 * - SHA-256 checksum & min/max date bounds for old-vs-new file intelligence
 * - AR/FR/EN smart auto-column mapper (Redex, EcoTrack, Yalidine, ZR Express, NOEST, Maystro, custom)
 */

import * as XLSX from "xlsx";

import { mapCourierStatusRich, type StoreOrderLifecycleStatus } from "@/lib/delivery/courier-status-mapper";
import type { NormalizedCourierStatus } from "@/lib/delivery/delivery-tracking-types";
import { parseWilayaCode69 } from "@/lib/geo/algeria-69";

import crypto from "node:crypto";

export const MAX_RECONCILIATION_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_RECONCILIATION_ROWS = 25_000;

export type CanonicalExcelField =
  | "tracking"
  | "reference"
  | "boutique"
  | "client"
  | "phone"
  | "phone2"
  | "wilaya"
  | "commune"
  | "address"
  | "montant"
  | "productName"
  | "status"
  | "financialStatus"
  | "deliveryFee"
  | "returnFee"
  | "driverName"
  | "driverPhone"
  | "createdAt"
  | "updatedAt";

export type ColumnMapping = Partial<Record<CanonicalExcelField, string>>;

export interface ParsedCourierRow {
  rowIndex: number;
  courierId: string;
  courierName: string;
  sourceFileName: string;
  trackingCode: string;
  reference: string;
  boutique: string;
  customerName: string;
  customerPhone: string;
  customerPhoneTail9: string;
  customerPhone2: string;
  wilayaRaw: string;
  wilayaCode: number | null;
  commune: string;
  address: string;
  montantDzd: number;
  productName: string;
  rawStatus: string;
  normalizedStatus: NormalizedCourierStatus;
  mappedStoreStatus: StoreOrderLifecycleStatus;
  financialStatus: string;
  deliveryFeeDzd: number;
  returnFeeDzd: number | null;
  stopDesk?: boolean;
  remarksSummary?: string;
  driverName: string;
  driverPhone: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastUpdatedAt?: string | null;
  rawRow: Record<string, unknown>;
}

export interface ParsedCourierFileResult {
  fileName: string;
  fileHash: string;
  fileSizeBytes: number;
  sheetName: string;
  rowCount: number;
  headers: string[];
  mapping: ColumnMapping;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  rows: ParsedCourierRow[];
}

const FIELD_HEADER_PATTERNS: Record<CanonicalExcelField, RegExp[]> = {
  tracking: [
    /^tracking/i,
    /^code[\s_-]*suivi/i,
    /^n°?\s*suivi/i,
    /^code[\s_-]*barre/i,
    /رقم التتبع/,
    /^tracking[\s_-]*code/i,
    /^id$/i,
  ],
  reference: [
    /reference/i,
    /^ref$/i,
    /order[\s_-]*id/i,
    /order[\s_-]*number/i,
    /num[\s_-]*commande/i,
    /رقم الطلب/,
    /مرجع/,
  ],
  boutique: [/boutique/i, /magasin/i, /store/i, /vendeur/i, /المتجر/, /البائع/],
  client: [
    /nom[\s_-]*client/i,
    /^client/i,
    /destinataire/i,
    /customer/i,
    /full[\s_-]*name/i,
    /الزبون/,
    /العميل/,
    /الاسم/,
  ],
  phone: [/t[eé]l[eé]?phone(\s*1)?/i, /^tel(\s*1)?$/i, /^phone(\s*1)?$/i, /mobile/i, /الهاتف/, /رقم الهاتف/],
  phone2: [/t[eé]l[eé]?phone\s*2/i, /^tel\s*2/i, /^phone\s*2/i, /الهاتف\s*2/],
  wilaya: [/wilaya/i, /code[\s_-]*wilaya/i, /الولاية/],
  commune: [/commune/i, /ville/i, /البلدية/],
  address: [/adresse/i, /address/i, /العنوان/],
  montant: [/montant/i, /total[\s_-]*payable/i, /cod/i, /^price/i, /^total$/i, /المبلغ/, /السعر/],
  productName: [/produit/i, /product/i, /article/i, /désignation/i, /المنتج/],
  status: [/^statut/i, /^status/i, /etat/i, /الحالة/, /وضعية/],
  financialStatus: [/financier/i, /encaisse/i, /paiement/i, /payment/i, /التحصيل/, /الدفع/],
  deliveryFee: [
    /tarif[\s_-]*livraison/i,
    /frais[\s_-]*livraison/i,
    /shipping[\s_-]*fee/i,
    /delivery[\s_-]*fee/i,
    /سعر التوصيل/,
  ],
  returnFee: [/tarif[\s_-]*retour/i, /frais[\s_-]*retour/i, /return[\s_-]*fee/i, /تكلفة الإرجاع/, /رسوم الارتجاع/],
  driverName: [/livreur/i, /chauffeur/i, /driver/i, /رجل التوصيل/, /السائق/, /الموزع/],
  driverPhone: [/tel[\s_-]*livreur/i, /driver[\s_-]*phone/i, /هاتف السائق/, /رقم الموزع/],
  createdAt: [/date[\s_-]*cr[eé]ation/i, /created[\s_-]*at/i, /^date$/i, /تاريخ/],
  updatedAt: [/date[\s_-]*maj/i, /updated[\s_-]*at/i, /derni[eè]re/i, /آخر تحديث/],
};

function cleanHeaderKey(h: string): string {
  return String(h || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function detectColumnMapping(headers: string[], manualOverrides?: ColumnMapping): ColumnMapping {
  const mapping: ColumnMapping = {};

  for (const field of Object.keys(FIELD_HEADER_PATTERNS) as CanonicalExcelField[]) {
    if (manualOverrides?.[field] && headers.includes(manualOverrides[field]!)) {
      mapping[field] = manualOverrides[field];
      continue;
    }

    const patterns = FIELD_HEADER_PATTERNS[field];
    let matched: string | undefined;
    for (const pat of patterns) {
      matched = headers.find((h) => pat.test(cleanHeaderKey(h)) || pat.test(h));
      if (matched) break;
    }
    if (matched) mapping[field] = matched;
  }

  return mapping;
}

function normalizePhone(raw: unknown): { clean: string; tail9: string } {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return { clean: "", tail9: "" };
  let tail9 = digits.slice(-9);
  if (digits.startsWith("213") && digits.length >= 12) {
    tail9 = digits.slice(3, 12);
  }
  const clean = tail9.length === 9 ? `0${tail9}` : digits;
  return { clean, tail9 };
}

function parseDzdNumber(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  const str = String(raw ?? "")
    .replace(/DA|DZD|د\.ج|\s|\u00a0/gi, "")
    .replace(",", ".");
  const m = str.match(/-?\d+(?:\.\d+)?/);
  return m ? Math.max(0, Math.round(Number(m[0]))) : 0;
}

function parseOptionalDzd(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  return parseDzdNumber(raw);
}

function normalizeDateIso(raw: unknown): string | null {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }
  const text = String(raw).trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  // Try DD/MM/YYYY [HH:mm]
  const dmY = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (dmY) {
    const d = new Date(`${dmY[3]}-${dmY[2]}-${dmY[1]}T${dmY[4] ?? "00"}:${dmY[5] ?? "00"}:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function buildRowObject(
  rawRow: Record<string, unknown>,
  rowIndex: number,
  mapping: ColumnMapping,
  courierId: string,
  courierName: string,
  fileName: string,
): ParsedCourierRow {
  const get = (field: CanonicalExcelField): string => {
    const col = mapping[field];
    if (!col) return "";
    const v = rawRow[col];
    return v === undefined || v === null ? "" : String(v).trim();
  };

  const phone1 = normalizePhone(get("phone"));
  const phone2 = normalizePhone(get("phone2"));
  const wilayaRaw = get("wilaya");
  const wilayaCode = parseWilayaCode69(wilayaRaw);
  const rawStatus = get("status") || get("financialStatus") || "UNKNOWN";
  const statusRich = mapCourierStatusRich(rawStatus);

  const createdRaw = mapping.createdAt ? rawRow[mapping.createdAt] : undefined;
  const updatedRaw = mapping.updatedAt ? rawRow[mapping.updatedAt] : undefined;

  return {
    rowIndex,
    courierId,
    courierName,
    sourceFileName: fileName,
    trackingCode: get("tracking").toUpperCase(),
    reference: get("reference"),
    boutique: get("boutique"),
    customerName: get("client") || "زبون غير مسمى",
    customerPhone: phone1.clean,
    customerPhoneTail9: phone1.tail9,
    customerPhone2: phone2.clean,
    wilayaRaw,
    wilayaCode,
    commune: get("commune"),
    address: get("address"),
    montantDzd: parseDzdNumber(mapping.montant ? rawRow[mapping.montant] : 0),
    productName: get("productName"),
    rawStatus,
    normalizedStatus: statusRich.normalizedStatus,
    mappedStoreStatus: statusRich.orderStatus,
    financialStatus: get("financialStatus") || (statusRich.financialStage !== "none" ? rawStatus : ""),
    deliveryFeeDzd: parseDzdNumber(mapping.deliveryFee ? rawRow[mapping.deliveryFee] : rawRow.tarif_prestation ?? 0),
    returnFeeDzd: parseOptionalDzd(mapping.returnFee ? rawRow[mapping.returnFee] : rawRow.tarif_retour ?? null),
    stopDesk: Number(rawRow.stop_desk ?? 0) === 1,
    remarksSummary: Array.isArray(rawRow.status_reason)
      ? rawRow.status_reason
          .map((item: any) => {
            const rem = String(item?.remarque || item?.comment || "").trim();
            if (!rem) return "";
            return item?.livreur ? `${item.livreur}: ${rem}` : rem;
          })
          .filter(Boolean)
          .join(" | ")
      : undefined,
    driverName: get("driverName"),
    driverPhone: normalizePhone(get("driverPhone")).clean,
    createdAt: normalizeDateIso(createdRaw),
    updatedAt: normalizeDateIso(updatedRaw),
    lastUpdatedAt: normalizeDateIso(rawRow.last_updated_at ?? updatedRaw),
    rawRow,
  };
}

export function computeSha256Hex(buffer: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function parseCourierExcelBuffer(options: {
  buffer: Buffer;
  fileName: string;
  courierId: string;
  courierName: string;
  columnOverrides?: ColumnMapping;
}): ParsedCourierFileResult {
  if (options.buffer.byteLength > MAX_RECONCILIATION_FILE_BYTES) {
    throw new Error(`حجم الملف ${options.fileName} يتجاوز الحد الأقصى المسموح (10 MB).`);
  }

  const fileHash = computeSha256Hex(options.buffer);
  const workbook = XLSX.read(options.buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error(`الملف ${options.fileName} لا يحتوي على أي ورقة عمل صالحة.`);
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (rawJson.length > MAX_RECONCILIATION_ROWS) {
    throw new Error(`عدد الصفوف (${rawJson.length}) يتجاوز الحد الأقصى (${MAX_RECONCILIATION_ROWS} صف لكل ملف).`);
  }

  const headersSet = new Set<string>();
  for (const r of rawJson.slice(0, 20)) {
    for (const k of Object.keys(r)) headersSet.add(k);
  }
  const headers = Array.from(headersSet);
  const mapping = detectColumnMapping(headers, options.columnOverrides);

  const rows: ParsedCourierRow[] = [];
  let minTs = Number.POSITIVE_INFINITY;
  let maxTs = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < rawJson.length; i++) {
    const rawRow = rawJson[i];
    const parsed = buildRowObject(
      rawRow,
      i + 2, // 1-based header + row
      mapping,
      options.courierId,
      options.courierName,
      options.fileName,
    );

    // Skip completely blank footer rows
    if (!parsed.trackingCode && !parsed.reference && !parsed.customerPhoneTail9 && !parsed.montantDzd) {
      continue;
    }

    const tsStr = parsed.updatedAt || parsed.createdAt;
    if (tsStr) {
      const ms = Date.parse(tsStr);
      if (Number.isFinite(ms)) {
        if (ms < minTs) minTs = ms;
        if (ms > maxTs) maxTs = ms;
      }
    }
    rows.push(parsed);
  }

  return {
    fileName: options.fileName,
    fileHash,
    fileSizeBytes: options.buffer.byteLength,
    sheetName: firstSheetName,
    rowCount: rows.length,
    headers,
    mapping,
    dateRangeStart: Number.isFinite(minTs) ? new Date(minTs).toISOString() : null,
    dateRangeEnd: Number.isFinite(maxTs) ? new Date(maxTs).toISOString() : null,
    rows,
  };
}
