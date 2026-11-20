/**
 * ORVA Store — TikTok Lead Normalization & Pending COD Order Creation Service (Phase A2)
 *
 * Mandatory Business & Security Rules:
 * - Supports RFC-4180 UTF-8 CSV and JSON webhook lead inputs with Arabic, French, and English labels.
 * - Normalizes & validates Algerian mobile numbers via @/lib/types/checkout (plus Arabic-Indic digits).
 * - Resolves 58 Algerian wilayas and communes; never invents customer names or street addresses.
 * - Decision 1 (OPT-IN Telegram): Disabled by default (TIKTOK_TELEGRAM_ALERTS_ENABLED=false);
 *   reuses existing verified Telegram credentials; strictly async & non-blocking (<= 2500ms timeout);
 *   never sent on duplicate or invalid leads; customer phone numbers masked in all logs.
 * - Decision 2 (Missing Address): Keeps delivery_address = "" when Instant Form omits street address,
 *   attaches bilingual Arabic/French confirmation note, keeps status = "pending" and in_redex = false.
 * - Decision 3 (Southern Wilaya Stop-Desk Fallback): Automatically converts unsupported STOP_DESK
 *   wilayas (49-58 / Zone 5) to DOMICILE, recalculates delivery tariff, and records metadata trace.
 * - Dedicated createPendingOrderFromTikTokLead():
 *   * Does NOT call submitCodOrderAction().
 *   * Does NOT dispatch to Redex (in_redex = false).
 *   * Does NOT trigger Meta CAPI Purchase.
 *   * Enforces status = "pending", attribution_source = "tiktok_ads",
 *     idempotency_key = "tiktok_lead_${externalLeadId}".
 *   * Uses real ORVA catalog (adminGetProduct) for availability & authoritative pricing.
 *   * Preserves public.order_items.pack_id CHECK ('PACK1','PACK2','PACK3' | null).
 *   * Preserves invalid and unmapped leads in public.tiktok_leads for review & recovery.
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import crypto from "node:crypto";
import { getAdminSettingsAction } from "@/app/actions/settings";
import { ALGERIA_COMMUNES_BY_WILAYA_ID } from "@/data/algeria-locations";
import { getCommunesByWilayaCode } from "@/data/geoalgeria/geo-helper";
import { adminGetProduct } from "@/lib/catalog/server";
import { packIdFromSlug } from "@/lib/catalog/types";
import { generateOrderNumber } from "@/lib/orders-store";
import { computeCanonicalPayloadHash } from "@/lib/payload-hash";
import type { Product } from "@/lib/repository/product-types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ALGERIA_58_WILAYAS,
  type LiveTariff,
  type WilayaRecord,
  calculateDeliveryTariff,
  isStopDeskAllowed,
  isValidAlgerianPhone,
  maskPhoneForPrivacy,
  normalizeAlgerianPhone,
  setLiveTariffs,
} from "@/lib/types/checkout";
import {
  DEFAULT_ORVA_STORE_ID,
  TikTokApiError,
  type TikTokDeliveryType,
  type TikTokFormProductMappingRow,
  type TikTokLeadRow,
  type TikTokLeadSyncStatus,
  redactSensitiveForLog,
} from "./types";

export const TIKTOK_TELEGRAM_TIMEOUT_MS = 2_500;
export const MISSING_ADDRESS_CONFIRMATION_NOTE =
  "طلب TikTok Instant Form — العنوان غير متوفر، يرجى تأكيد العنوان الكامل هاتفياً / Lead TikTok — Adresse manquante, à confirmer par téléphone.";

const VALID_LEGACY_ORDER_ITEM_PACKS = new Set(["PACK1", "PACK2", "PACK3"]);

function getDb(): any {
  try {
    return getSupabaseServerClient() as any;
  } catch (err) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: "Supabase service-role client unavailable for TikTok lead processing (fail-closed).",
      retryable: false,
      cause: err,
    });
  }
}

// ── 1. Input Contracts & Multilingual Field Normalization ────────────────────

export interface RawTikTokLeadInput {
  externalLeadId: string;
  formId: string;
  advertiserId: string;
  campaignId?: string | null;
  campaignName?: string | null;
  adgroupId?: string | null;
  adId?: string | null;
  leadCreatedAt?: string | null;
  fields: Record<string, string>;
}

export interface NormalizedLeadFields {
  customerName: string | null;
  customerPhoneRaw: string | null;
  customerPhoneNormalized: string | null;
  phoneValid: boolean;
  wilayaRaw: string | null;
  communeRaw: string | null;
  deliveryAddressRaw: string | null;
  requestedDeliveryType: TikTokDeliveryType | null;
}

export interface ResolvedWilayaResult {
  wilaya: WilayaRecord;
  wilayaFallbackApplied: boolean;
}

export interface ResolvedCommuneResult {
  communeName: string;
  communeFallbackApplied: boolean;
}

/**
 * Converts Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits to ASCII 0-9.
 */
export function toAsciiDigits(value: string): string {
  return String(value || "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}

/**
 * Normalizes a label or geographic name for case-, accent-, and Arabic-variant-insensitive matching.
 */
function normalizeLookupText(raw: string): string {
  return toAsciiDigits(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip Latin diacritics (é -> e, ï -> i)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "") // strip Arabic tashkeel & tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/['’`"_:/\\()\-.,?؟!]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Normalizes and validates an Algerian mobile phone number using ORVA's canonical
 * checkout utility (@/lib/types/checkout) after converting Arabic-Indic numerals.
 */
export function normalizeAndValidateLeadPhone(rawPhone: string | null | undefined): {
  raw: string | null;
  normalized: string | null;
  valid: boolean;
} {
  const trimmed = (rawPhone || "").trim();
  if (!trimmed) {
    return { raw: null, normalized: null, valid: false };
  }

  const ascii = toAsciiDigits(trimmed);
  const normalized = normalizeAlgerianPhone(ascii);
  const valid = isValidAlgerianPhone(ascii);

  return {
    raw: trimmed,
    normalized: normalized || null,
    valid,
  };
}

const NAME_KEYS = [
  "full name",
  "fullname",
  "customer name",
  "name",
  "nom complet",
  "nom et prenom",
  "nom prenom",
  "nom",
  "الاسم الكامل",
  "الاسم واللقب",
  "الاسم و اللقب",
  "اللقب والاسم",
  "اللقب و الاسم",
  "الاسم",
  "اسم الزبون",
  "اسم العميل",
];

const FIRST_NAME_KEYS = ["first name", "firstname", "prenom", "الاسم الاول"];
const LAST_NAME_KEYS = ["last name", "lastname", "family name", "nom de famille", "اللقب"];

const PHONE_KEYS = [
  "phone number",
  "phonenumber",
  "phone",
  "mobile number",
  "mobile",
  "telephone",
  "tel",
  "numero de telephone",
  "numero",
  "num tel",
  "رقم الهاتف",
  "الهاتف",
  "رقم الجوال",
  "رقم الموبايل",
  "رقم التليفون",
  "التليفون",
  "نيميرو",
  "نيميرو تيليفون",
  "هاتف",
];

const WILAYA_KEYS = [
  "wilaya",
  "state",
  "province",
  "region",
  "governorate",
  "الولايه",
  "ولايه",
  "اسم الولايه",
  "اختر الولايه",
];

const COMMUNE_KEYS = [
  "commune",
  "city",
  "municipality",
  "town",
  "daira",
  "البلديه",
  "بلديه",
  "المدينه",
  "مدينه",
  "الدائره",
  "دائره",
];

const ADDRESS_KEYS = [
  "delivery address",
  "street address",
  "address",
  "adresse de livraison",
  "adresse",
  "العنوان الكامل",
  "عنوان التوصيل",
  "العنوان",
  "عنوان",
];

const DELIVERY_TYPE_KEYS = [
  "delivery type",
  "delivery method",
  "shipping method",
  "mode de livraison",
  "type de livraison",
  "livraison",
  "نوع التوصيل",
  "طريقه التوصيل",
  "التوصيل",
];

function matchFieldValue(
  normalizedEntries: Array<{ normKey: string; value: string }>,
  exactAndContainsCandidates: string[],
): string | null {
  // Exact match first
  for (const candidate of exactAndContainsCandidates) {
    const found = normalizedEntries.find((e) => e.normKey === candidate && e.value.length > 0);
    if (found) return found.value;
  }
  // Substring match second (for custom TikTok questions such as "ما هو رقم الهاتف الخاص بك؟")
  for (const candidate of exactAndContainsCandidates) {
    if (candidate.length < 3) continue;
    const found = normalizedEntries.find((e) => e.normKey.includes(candidate) && e.value.length > 0);
    if (found) return found.value;
  }
  return null;
}

function parseDeliveryTypeHint(rawValue: string | null): TikTokDeliveryType | null {
  if (!rawValue) return null;
  const norm = normalizeLookupText(rawValue);
  if (!norm) return null;
  if (
    norm.includes("stop desk") ||
    norm.includes("stopdesk") ||
    norm.includes("bureau") ||
    norm.includes("point relais") ||
    norm.includes("مكتب") ||
    norm.includes("المكتب") ||
    norm.includes("ستوب ديسك")
  ) {
    return "STOP_DESK";
  }
  if (
    norm.includes("domicile") ||
    norm.includes("home") ||
    norm.includes("maison") ||
    norm.includes("منزل") ||
    norm.includes("المنزل") ||
    norm.includes("البيت")
  ) {
    return "DOMICILE";
  }
  return null;
}

/**
 * Normalizes raw TikTok Lead form question/answer pairs across Arabic, French, and English labels.
 */
export function normalizeLeadFields(rawFields: Record<string, string>): NormalizedLeadFields {
  const entries: Array<{ normKey: string; value: string }> = [];
  for (const [k, v] of Object.entries(rawFields || {})) {
    const val = typeof v === "string" ? v.trim() : String(v ?? "").trim();
    if (!val) continue;
    entries.push({ normKey: normalizeLookupText(k), value: val });
  }

  let customerName = matchFieldValue(entries, NAME_KEYS);
  if (!customerName) {
    const first = matchFieldValue(entries, FIRST_NAME_KEYS);
    const last = matchFieldValue(entries, LAST_NAME_KEYS);
    const combined = [first, last].filter(Boolean).join(" ").trim();
    customerName = combined || null;
  }

  const phoneRaw = matchFieldValue(entries, PHONE_KEYS);
  const phoneResult = normalizeAndValidateLeadPhone(phoneRaw);

  const wilayaRaw = matchFieldValue(entries, WILAYA_KEYS);
  const communeRaw = matchFieldValue(entries, COMMUNE_KEYS);
  const deliveryAddressRaw = matchFieldValue(entries, ADDRESS_KEYS);
  const deliveryTypeRaw = matchFieldValue(entries, DELIVERY_TYPE_KEYS);

  return {
    customerName: customerName ? customerName.replace(/\s+/g, " ").trim().slice(0, 100) : null,
    customerPhoneRaw: phoneResult.raw,
    customerPhoneNormalized: phoneResult.normalized,
    phoneValid: phoneResult.valid,
    wilayaRaw,
    communeRaw,
    deliveryAddressRaw: deliveryAddressRaw ? deliveryAddressRaw.trim() : null,
    requestedDeliveryType: parseDeliveryTypeHint(deliveryTypeRaw),
  };
}

// ── 2. 58-Wilaya & Commune Resolution ────────────────────────────────────────

const WILAYA_ALIASES: Record<string, number> = {
  algiers: 16,
  alger: 16,
  العاصمه: 16,
  "الجزائر العاصمه": 16,
  الجزائر: 16,
  oeb: 4,
  "oum el bouaghi": 4,
  bba: 34,
  "bordj bou arreridj": 34,
  "sidi bel abbes": 22,
  sba: 22,
  msila: 28,
  "m sila": 28,
  "el mghair": 57,
  "el m ghair": 57,
  "el menia": 58,
  "el meniaa": 58,
  "ain defla": 44,
  "ain temouchent": 46,
  "in salah": 53,
  "in guezzam": 54,
  "el oued": 39,
  "oued souf": 39,
  "souk ahras": 41,
  "tizi ouzou": 15,
  bejaia: 6,
  bgayet: 6,
  setif: 19,
  oran: 31,
  wahran: 31,
  constantine: 25,
  annaba: 23,
  biskra: 7,
  batna: 5,
  blida: 9,
  medea: 26,
  tebessa: 12,
  bechar: 8,
  boumerdes: 35,
  ghardaia: 47,
  naama: 45,
  saida: 20,
  "beni abbes": 52,
  "ouled djellal": 51,
  "bordj badji mokhtar": 50,
  illizi: 33,
  اليزي: 33,
  ايليزي: 33,
};

/**
 * Resolves a customer-provided wilaya string (numeric code, Arabic, or French name)
 * strictly against ORVA's canonical 58-wilaya registry (ALGERIA_58_WILAYAS).
 * Falls back to the form mapping's configured defaultWilayaCode when absent or unrecognized.
 */
export function resolveAlgerianWilaya(
  rawWilaya: string | null | undefined,
  fallbackWilayaCode = 16,
): ResolvedWilayaResult {
  const safeFallbackCode =
    Number.isInteger(fallbackWilayaCode) && fallbackWilayaCode >= 1 && fallbackWilayaCode <= 58
      ? fallbackWilayaCode
      : 16;
  const fallbackRecord =
    ALGERIA_58_WILAYAS.find((w) => w.code === safeFallbackCode) ?? ALGERIA_58_WILAYAS[15]; // 16 - Alger

  const trimmed = (rawWilaya || "").trim();
  if (!trimmed) {
    return { wilaya: fallbackRecord, wilayaFallbackApplied: true };
  }

  const ascii = toAsciiDigits(trimmed);

  // 1. Leading or trailing numeric code (e.g., "16", "07 - بسكرة", "Oran (31)")
  const codeMatch =
    ascii.match(/^\s*0?(\d{1,2})(?=\s*(?:[-–—,()/]|$))/) ??
    ascii.match(/(?:ولاية|ولايه|wilaya)\s*0?(\d{1,2})\s*$/i) ??
    ascii.match(/(?:^|[-–—(])\s*0?(\d{1,2})\s*\)?\s*$/);

  if (codeMatch) {
    const code = Number.parseInt(codeMatch[1], 10);
    if (code >= 1 && code <= 58) {
      const matchByCode = ALGERIA_58_WILAYAS.find((w) => w.code === code);
      if (matchByCode) {
        return { wilaya: matchByCode, wilayaFallbackApplied: false };
      }
    }
  }

  // 2. Normalized alias & official Arabic/French name lookup
  const norm = normalizeLookupText(trimmed)
    .replace(/^(wilaya de |wilaya d |wilaya |ولايه )/i, "")
    .trim();

  if (norm && WILAYA_ALIASES[norm]) {
    const aliased = ALGERIA_58_WILAYAS.find((w) => w.code === WILAYA_ALIASES[norm]);
    if (aliased) {
      return { wilaya: aliased, wilayaFallbackApplied: false };
    }
  }

  // Exact normalized match against ALGERIA_58_WILAYAS
  for (const w of ALGERIA_58_WILAYAS) {
    const normFr = normalizeLookupText(w.nameFr);
    const normAr = normalizeLookupText(w.nameAr);
    if (norm === normFr || norm === normAr) {
      return { wilaya: w, wilayaFallbackApplied: false };
    }
  }

  // Substring containment match (e.g., "16 - الجزائر (Alger)" or "مدينة وهران")
  for (const w of ALGERIA_58_WILAYAS) {
    const normFr = normalizeLookupText(w.nameFr);
    const normAr = normalizeLookupText(w.nameAr);
    if (
      (normFr.length >= 3 && norm.includes(normFr)) ||
      (normAr.length >= 3 && norm.includes(normAr))
    ) {
      return { wilaya: w, wilayaFallbackApplied: false };
    }
  }

  return { wilaya: fallbackRecord, wilayaFallbackApplied: true };
}

/**
 * Resolves a commune name for a resolved wilaya code using GeoAlgeria & ORVA's commune tables.
 * Preserves customer-entered commune names; falls back to the wilaya's seat commune only when omitted.
 */
export function resolveAlgerianCommune(
  rawCommune: string | null | undefined,
  wilayaCode: number,
): ResolvedCommuneResult {
  const trimmed = (rawCommune || "").trim();
  const wilayaRecord = ALGERIA_58_WILAYAS.find((w) => w.code === wilayaCode);

  if (trimmed) {
    const normInput = normalizeLookupText(trimmed);
    const geoCommunes = getCommunesByWilayaCode(wilayaCode);
    for (const c of geoCommunes) {
      if (
        normalizeLookupText(c.commune_name_ar) === normInput ||
        normalizeLookupText(c.commune_name_fr) === normInput
      ) {
        return {
          communeName: c.commune_name_ar || c.commune_name_fr || trimmed,
          communeFallbackApplied: false,
        };
      }
    }

    const arList = ALGERIA_COMMUNES_BY_WILAYA_ID[String(wilayaCode)] ?? [];
    for (const arName of arList) {
      if (normalizeLookupText(arName) === normInput) {
        return { communeName: arName, communeFallbackApplied: false };
      }
    }

    // Preserve customer-entered commune value without overwriting or inventing
    return { communeName: trimmed.slice(0, 100), communeFallbackApplied: false };
  }

  const defaultCommune =
    ALGERIA_COMMUNES_BY_WILAYA_ID[String(wilayaCode)]?.[0] ??
    wilayaRecord?.nameAr ??
    wilayaRecord?.nameFr ??
    "Centre";

  return { communeName: defaultCommune, communeFallbackApplied: true };
}

// ── 3. RFC-4180 UTF-8 CSV & Webhook JSON Extractors ──────────────────────────

function parseRfc4180Rows(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      if (clean[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

const CSV_META_HEADERS = new Set([
  "lead_id",
  "id",
  "external_lead_id",
  "created_time",
  "create_time",
  "created_at",
  "ad_id",
  "ad_name",
  "adgroup_id",
  "adgroup_name",
  "adset_id",
  "campaign_id",
  "campaign_name",
  "form_id",
  "form_name",
  "page_id",
  "page_name",
  "advertiser_id",
  "is_organic",
  "platform",
]);

function parseOptionalTimestamp(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d{10,13}$/.test(str)) {
    const num = Number(str);
    const ms = str.length <= 10 ? num * 1000 : num;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const parsed = Date.parse(str);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Parses TikTok async lead export CSV into RawTikTokLeadInput[].
 * Handles UTF-8 BOM, quoted Arabic/French fields, embedded commas, and newlines.
 */
export function parseTikTokLeadsCsv(
  csvText: string,
  defaults?: { formId?: string; advertiserId?: string },
): RawTikTokLeadInput[] {
  const rows = parseRfc4180Rows(csvText);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim());
  const normHeaders = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const results: RawTikTokLeadInput[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const meta: Record<string, string> = {};
    const fields: Record<string, string> = {};

    for (let c = 0; c < headers.length; c += 1) {
      const originalHeader = headers[c];
      const normHeader = normHeaders[c];
      const val = (cells[c] ?? "").trim();
      if (!originalHeader || !val) continue;

      if (CSV_META_HEADERS.has(normHeader)) {
        meta[normHeader] = val;
      } else {
        fields[originalHeader] = val;
      }
    }

    const externalLeadId = (meta.lead_id || meta.external_lead_id || meta.id || "").trim();
    const formId = (meta.form_id || meta.page_id || defaults?.formId || "").trim();
    const advertiserId = (meta.advertiser_id || defaults?.advertiserId || "").trim();

    if (!externalLeadId || !formId || !advertiserId) {
      continue;
    }

    results.push({
      externalLeadId,
      formId,
      advertiserId,
      campaignId: meta.campaign_id || null,
      campaignName: meta.campaign_name || null,
      adgroupId: meta.adgroup_id || meta.adset_id || null,
      adId: meta.ad_id || null,
      leadCreatedAt: parseOptionalTimestamp(meta.created_time || meta.create_time || meta.created_at),
      fields,
    });
  }

  return results;
}

function extractFieldMapFromArray(items: unknown[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const key = String(rec.field_name ?? rec.field ?? rec.name ?? rec.label ?? "").trim();
    const rawVal = rec.field_value ?? rec.value ?? rec.values ?? "";
    const val = Array.isArray(rawVal)
      ? rawVal.map((v) => String(v ?? "").trim()).filter(Boolean).join(", ")
      : String(rawVal ?? "").trim();
    if (key && val) {
      out[key] = val;
    }
  }
  return out;
}

function normalizeSingleJsonLead(
  obj: Record<string, unknown>,
  defaults?: { formId?: string; advertiserId?: string },
): RawTikTokLeadInput | null {
  const externalLeadId = String(obj.lead_id ?? obj.external_lead_id ?? obj.id ?? "").trim();
  const formId = String(obj.form_id ?? obj.page_id ?? defaults?.formId ?? "").trim();
  const advertiserId = String(obj.advertiser_id ?? defaults?.advertiserId ?? "").trim();

  if (!externalLeadId || !formId || !advertiserId) return null;

  let fields: Record<string, string> = {};
  if (Array.isArray(obj.lead_info)) {
    fields = extractFieldMapFromArray(obj.lead_info);
  } else if (Array.isArray(obj.field_data)) {
    fields = extractFieldMapFromArray(obj.field_data);
  } else if (Array.isArray(obj.changes)) {
    fields = extractFieldMapFromArray(obj.changes);
  } else if (obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields)) {
    for (const [k, v] of Object.entries(obj.fields as Record<string, unknown>)) {
      const str = String(v ?? "").trim();
      if (str) fields[k] = str;
    }
  } else {
    for (const [k, v] of Object.entries(obj)) {
      if (CSV_META_HEADERS.has(k.toLowerCase())) continue;
      if (typeof v === "string" || typeof v === "number") {
        const str = String(v).trim();
        if (str) fields[k] = str;
      }
    }
  }

  return {
    externalLeadId,
    formId,
    advertiserId,
    campaignId: obj.campaign_id ? String(obj.campaign_id) : null,
    campaignName: obj.campaign_name ? String(obj.campaign_name) : null,
    adgroupId: obj.adgroup_id ? String(obj.adgroup_id) : obj.adset_id ? String(obj.adset_id) : null,
    adId: obj.ad_id ? String(obj.ad_id) : null,
    leadCreatedAt: parseOptionalTimestamp(obj.create_time ?? obj.created_time ?? obj.timestamp),
    fields,
  };
}

/**
 * Extracts RawTikTokLeadInput[] from official TikTok webhook JSON payloads or JSON API arrays.
 * Supports:
 * 1. `{ event: "LEAD", advertiser_id, data: { lead_id, form_id/page_id, lead_info: [...] } }`
 * 2. `{ entry: [{ id, advertiser_id, changes: [{ field, value }] }] }`
 * 3. Direct JSON lead object or `{ list: [...] }` / array.
 */
export function extractLeadsFromWebhookPayload(
  payload: unknown,
  defaults?: { formId?: string; advertiserId?: string },
): RawTikTokLeadInput[] {
  if (!payload || typeof payload !== "object") return [];

  if (Array.isArray(payload)) {
    return payload
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => normalizeSingleJsonLead(item, defaults))
      .filter((item): item is RawTikTokLeadInput => item !== null);
  }

  const root = payload as Record<string, unknown>;
  const rootAdvertiserId = root.advertiser_id ? String(root.advertiser_id) : defaults?.advertiserId;
  const rootFormId = root.form_id
    ? String(root.form_id)
    : root.page_id
      ? String(root.page_id)
      : defaults?.formId;

  // Shape A: `{ entry: [...] }`
  if (Array.isArray(root.entry)) {
    const extracted: RawTikTokLeadInput[] = [];
    for (const rawEntry of root.entry) {
      if (!rawEntry || typeof rawEntry !== "object") continue;
      const entry = rawEntry as Record<string, unknown>;
      const entryAdvId = entry.advertiser_id ? String(entry.advertiser_id) : rootAdvertiserId;
      const entryFormId = entry.page_id
        ? String(entry.page_id)
        : entry.form_id
          ? String(entry.form_id)
          : rootFormId;

      // Case A1: Entry itself carries lead_id + changes as field/value answers
      if (entry.lead_id && Array.isArray(entry.changes)) {
        const lead = normalizeSingleJsonLead(
          {
            ...entry,
            advertiser_id: entryAdvId,
            form_id: entryFormId,
            create_time: entry.create_time ?? entry.time ?? root.timestamp,
          },
          { formId: entryFormId, advertiserId: entryAdvId },
        );
        if (lead) extracted.push(lead);
        continue;
      }

      // Case A2: Graph-style `entry[].changes[].value` holding nested lead payload
      if (Array.isArray(entry.changes)) {
        for (const ch of entry.changes) {
          if (!ch || typeof ch !== "object") continue;
          const chRec = ch as Record<string, unknown>;
          if (chRec.value && typeof chRec.value === "object") {
            const valObj = chRec.value as Record<string, unknown>;
            const lead = normalizeSingleJsonLead(
              {
                ...valObj,
                advertiser_id: valObj.advertiser_id ?? entryAdvId ?? entry.id,
                form_id: valObj.form_id ?? valObj.page_id ?? entryFormId,
                create_time: valObj.created_time ?? valObj.create_time ?? entry.time ?? root.timestamp,
              },
              { formId: entryFormId, advertiserId: entryAdvId },
            );
            if (lead) extracted.push(lead);
          }
        }
      }
    }
    if (extracted.length > 0) return extracted;
  }

  // Shape B: `{ event: "LEAD", data: { ... } }` or `{ data: [...] }`
  if (root.data && typeof root.data === "object") {
    if (Array.isArray(root.data)) {
      return extractLeadsFromWebhookPayload(root.data, {
        formId: rootFormId,
        advertiserId: rootAdvertiserId,
      });
    }
    const dataObj = root.data as Record<string, unknown>;
    if (Array.isArray(dataObj.list)) {
      return extractLeadsFromWebhookPayload(dataObj.list, {
        formId: rootFormId,
        advertiserId: rootAdvertiserId,
      });
    }
    const single = normalizeSingleJsonLead(
      {
        ...dataObj,
        advertiser_id: dataObj.advertiser_id ?? rootAdvertiserId,
        form_id: dataObj.form_id ?? dataObj.page_id ?? rootFormId,
        create_time: dataObj.create_time ?? dataObj.created_time ?? root.timestamp,
      },
      { formId: rootFormId, advertiserId: rootAdvertiserId },
    );
    if (single) return [single];
  }

  // Shape C: `{ list: [...] }`
  if (Array.isArray(root.list)) {
    return extractLeadsFromWebhookPayload(root.list, {
      formId: rootFormId,
      advertiserId: rootAdvertiserId,
    });
  }

  // Shape D: Direct lead object
  const direct = normalizeSingleJsonLead(root, {
    formId: rootFormId,
    advertiserId: rootAdvertiserId,
  });
  return direct ? [direct] : [];
}

// ── 4. Decision 1 — Opt-In Non-Blocking Telegram Notification ────────────────

export interface TikTokTelegramNotifyResult {
  sent: boolean;
  skippedReason?: string;
  error?: string;
}

export interface TikTokTelegramNotifyOptions {
  /** Explicit server-side opt-in override (used in tests; never defaults to true). */
  optInEnabled?: boolean;
  /** Injectable fetch implementation for hermetic testing. */
  fetchImpl?: typeof fetch;
  /** Maximum request timeout in ms (clamped strictly to <= 2500ms). */
  timeoutMs?: number;
  /** Optional credentials loader override (defaults to existing env + getAdminSettingsAction). */
  loadTelegramCredentials?: () => Promise<{ botToken: string; chatId: string; enabled: boolean }>;
  logger?: { warn: (msg: string, ctx?: Record<string, unknown>) => void };
}

/**
 * Evaluates the independent OPT-IN configuration flag for TikTok Lead Telegram alerts.
 * Strictly defaults to `false` (disabled) unless explicitly enabled server-side via:
 * 1. Explicit runtime override `optInEnabled` (for tests / explicit server calls), OR
 * 2. Environment variable `TIKTOK_TELEGRAM_ALERTS_ENABLED=true` (or `"1"`), OR
 * 3. Server-side `site_settings.integrations.tiktok.telegram_alerts_enabled === true`
 *    (future Phase C admin toggle — completely independent of checkout's `telegram_alerts_enabled`).
 */
export async function isTikTokTelegramAlertsEnabled(options?: {
  optInEnabled?: boolean;
}): Promise<boolean> {
  if (options?.optInEnabled !== undefined) {
    return Boolean(options.optInEnabled);
  }

  const envVal = (process.env.TIKTOK_TELEGRAM_ALERTS_ENABLED || "").trim().toLowerCase();
  if (envVal === "true" || envVal === "1") {
    return true;
  }
  if (envVal === "false" || envVal === "0") {
    return false;
  }

  // Optional future Phase C persisted server flag inside site_settings.integrations.tiktok
  try {
    const db = getSupabaseServerClient() as any;
    const { data } = await db
      .from("site_settings")
      .select("integrations")
      .eq("id", 1)
      .maybeSingle();

    return data?.integrations?.tiktok?.telegram_alerts_enabled === true;
  } catch {
    return false; // Fail closed: remain opt-in disabled
  }
}

async function defaultLoadExistingTelegramCredentials(): Promise<{
  botToken: string;
  chatId: string;
  enabled: boolean;
}> {
  let botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  let chatId = (process.env.TELEGRAM_CHAT_ID || "").trim();
  let enabled = true;

  if (!botToken || !chatId) {
    try {
      const settings = await getAdminSettingsAction();
      if (settings?.telegram) {
        botToken = botToken || (settings.telegram.botToken || "").trim();
        chatId = chatId || (settings.telegram.chatId || "").trim();
        enabled = settings.telegram.enabled !== false;
      }
    } catch {
      // Fail safely without impacting lead processing
    }
  }

  return { botToken, chatId, enabled };
}

function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Sends a strictly opt-in, non-blocking Telegram notification for a newly created
 * pending TikTok Lead order reusing existing ORVA Telegram credentials.
 * - Maximum timeout clamped to 2500ms.
 * - Masks phone numbers in all diagnostic logs.
 * - Never throws.
 */
export async function sendOptionalTikTokLeadTelegramAlert(
  params: {
    orderNumber: string;
    externalLeadId: string;
    customerName: string;
    customerPhone: string;
    wilayaDisplay: string;
    communeName: string;
    deliveryType: TikTokDeliveryType;
    addressMissing: boolean;
    productName: string;
    productPrice: number;
    shippingFee: number;
    totalPayable: number;
    campaignName?: string | null;
  },
  options?: TikTokTelegramNotifyOptions,
): Promise<TikTokTelegramNotifyResult> {
  const logger = options?.logger ?? {
    warn: (msg, ctx) => console.warn(msg, ctx ? redactSensitiveForLog(ctx) : ""),
  };

  try {
    const enabledOptIn = await isTikTokTelegramAlertsEnabled({
      optInEnabled: options?.optInEnabled,
    });
    if (!enabledOptIn) {
      return { sent: false, skippedReason: "opt_in_disabled" };
    }

    const credsLoader = options?.loadTelegramCredentials ?? defaultLoadExistingTelegramCredentials;
    const creds = await credsLoader();
    if (!creds.enabled || !creds.botToken || !creds.chatId) {
      return { sent: false, skippedReason: "telegram_not_configured" };
    }

    let chatId = creds.chatId.trim();
    if (/^\d{10,14}$/.test(chatId)) {
      chatId = `-100${chatId}`;
    }

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://orva-store.com"
    ).replace(/\/$/, "");
    const dashboardOrderUrl = `${appUrl}/dashboard/ecommerce/?orderId=${encodeURIComponent(params.orderNumber)}#orders`;

    const deliveryLabel =
      params.deliveryType === "DOMICILE" ? "توصيل للمنزل" : "توصيل للمكتب (Stop Desk)";

    const lines = [
      `🎵 <b>طلب جديد من TikTok Lead Gen</b>`,
      `━━━━━━━━━━━━━━━━━━`,
      `🆔 <b>رقم الطلب:</b> <code>${escapeHtml(params.orderNumber)}</code>`,
      `👤 <b>الاسم الكامل:</b> ${escapeHtml(params.customerName)}`,
      `📱 <b>رقم الهاتف:</b> <code>${escapeHtml(params.customerPhone)}</code>`,
      `📍 <b>الولاية والبلدية:</b> ${escapeHtml(params.wilayaDisplay)} — ${escapeHtml(params.communeName)}`,
      `🚚 <b>نوع التوصيل:</b> ${escapeHtml(deliveryLabel)}`,
      ...(params.addressMissing
        ? [`⚠️ <b>ملاحظة العنوان:</b> العنوان غير متوفر — يرجى تأكيده هاتفياً.`]
        : []),
      `📦 <b>المنتج:</b> ${escapeHtml(params.productName)}`,
      `💵 <b>سعر المنتج:</b> ${params.productPrice} د.ج | 🚚 <b>التوصيل:</b> ${params.shippingFee} د.ج`,
      `💰 <b>المجموع الكلي (COD):</b> <b>${params.totalPayable} د.ج</b>`,
      ...(params.campaignName ? [`📣 <b>الحملة:</b> <code>${escapeHtml(params.campaignName)}</code>`] : []),
      `📌 <i>حالة الطلب: قيد الانتظار (Pending) — لم يُرسل لـ Redex بعد.</i>`,
      `👉 <a href="${dashboardOrderUrl}">[فتح الطلبية في لوحة التحكم]</a>`,
    ];

    const fetchImpl = options?.fetchImpl ?? globalThis.fetch.bind(globalThis);
    const boundedTimeoutMs = Math.min(
      Math.max(100, options?.timeoutMs ?? TIKTOK_TELEGRAM_TIMEOUT_MS),
      TIKTOK_TELEGRAM_TIMEOUT_MS,
    );

    const res = await fetchImpl(`https://api.telegram.org/bot${creds.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(boundedTimeoutMs),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      const reason = data?.description || `HTTP ${res.status}`;
      logger.warn("[TikTok Telegram Alert Warning]", {
        orderNumber: params.orderNumber,
        externalLeadId: params.externalLeadId,
        maskedPhone: maskPhoneForPrivacy(params.customerPhone),
        reason,
      });
      return { sent: false, error: reason };
    }

    return { sent: true };
  } catch (err) {
    const safeError = err instanceof Error ? err.message : "Telegram alert failed";
    logger.warn("[TikTok Telegram Alert Exception]", {
      orderNumber: params.orderNumber,
      externalLeadId: params.externalLeadId,
      maskedPhone: maskPhoneForPrivacy(params.customerPhone),
      error: safeError,
    });
    return { sent: false, error: safeError };
  }
}

// ── 5. Dedicated Pending Order Creator: createPendingOrderFromTikTokLead() ───

export interface CreatePendingOrderFromTikTokLeadParams {
  storeId?: string;
  lead: RawTikTokLeadInput;
  normalized: NormalizedLeadFields;
  mapping: TikTokFormProductMappingRow;
  /** Optional catalog loader override (defaults to real adminGetProduct from @/lib/catalog/server). */
  catalogGetProduct?: (id: string) => Promise<Product | null>;
  /** Optional live delivery fee loader override (defaults to getDeliveryFees(false)). */
  loadLiveDeliveryFees?: () => Promise<Record<number, LiveTariff> | null>;
  /** Optional Telegram opt-in & test injection controls. */
  telegramOptions?: TikTokTelegramNotifyOptions;
  nowMs?: () => number;
}

export interface CreatePendingOrderFromTikTokLeadResult {
  created: boolean;
  duplicate: boolean;
  orderId: string | null;
  productId: string;
  productName: string;
  packId: string;
  productPrice: number;
  shippingFee: number;
  totalPayable: number;
  wilayaCode: number;
  wilayaName: string;
  communeName: string;
  effectiveDeliveryType: TikTokDeliveryType;
  deliveryTypeFallbackApplied: boolean;
  addressMissing: boolean;
  wilayaFallbackApplied: boolean;
  /** Non-blocking async promise handle (already detached with .catch); only present when newly created. */
  telegramNotificationPromise?: Promise<TikTokTelegramNotifyResult>;
}

function isUniqueConstraintError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === "23505" ||
    Boolean(err.message && /duplicate key|unique constraint|orders_idempotency_key_key/i.test(err.message))
  );
}

/**
 * Dedicated server-side function that creates an idempotent `pending` COD order in
 * `public.orders` and `public.order_items` from a validated TikTok Lead.
 *
 * Strictly enforces:
 * - status = 'pending' (never auto-confirmed)
 * - in_redex = false (never dispatched to Redex)
 * - attribution_source = mapping.lead_source_label || 'tiktok_ads'
 * - idempotency_key = `tiktok_lead_${externalLeadId}`
 * - Real ORVA product catalog availability & authoritative price validation
 * - Decision 1 (opt-in async non-blocking Telegram <= 2500ms, never on duplicates)
 * - Decision 2 (empty delivery_address + bilingual Arabic/French confirmation note)
 * - Decision 3 (automatic STOP_DESK -> DOMICILE fallback for unsupported wilayas 49-58/Zone 5)
 * - Zero calls to submitCodOrderAction(), Redex API, or Meta CAPI Purchase.
 */
export async function createPendingOrderFromTikTokLead(
  params: CreatePendingOrderFromTikTokLeadParams,
): Promise<CreatePendingOrderFromTikTokLeadResult> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const externalLeadId = params.lead.externalLeadId.trim();
  if (!externalLeadId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "externalLeadId is required to create a pending order.",
    });
  }

  // 1. Validate customer name & Algerian phone (never invent missing customer data)
  const customerName = (params.normalized.customerName || "").trim();
  if (customerName.length < 2) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "Customer name is missing or shorter than 2 characters in TikTok lead.",
    });
  }

  const normalizedPhone = params.normalized.customerPhoneNormalized || "";
  if (!params.normalized.phoneValid || !isValidAlgerianPhone(normalizedPhone)) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "Invalid Algerian mobile phone number in TikTok lead.",
    });
  }

  // 2. Validate mapped product against the REAL ORVA catalog (availability & authoritative price)
  const getProduct = params.catalogGetProduct ?? adminGetProduct;
  const catalogProduct = await getProduct(params.mapping.product_id);
  if (!catalogProduct) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Mapped ORVA catalog product '${params.mapping.product_id}' no longer exists.`,
    });
  }
  if (catalogProduct.status !== "active") {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Mapped product '${catalogProduct.title}' is not active (status: ${catalogProduct.status}).`,
    });
  }
  if (catalogProduct.showOutOfStock) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Mapped product '${catalogProduct.title}' is marked out of stock.`,
    });
  }
  if (!Number.isFinite(catalogProduct.sellingPrice) || catalogProduct.sellingPrice <= 0) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: `Mapped product '${catalogProduct.title}' has an invalid catalog price.`,
    });
  }

  const authoritativePrice = catalogProduct.sellingPrice;
  const authoritativeName = catalogProduct.title;
  const authoritativePackId = packIdFromSlug((catalogProduct.slug || catalogProduct.sku || catalogProduct.id).trim());
  const cleanPackUpper = authoritativePackId.toUpperCase().trim();

  // 3. Resolve Wilaya, Commune, Delivery Method (Decision 3), and Delivery Address (Decision 2)
  const { wilaya, wilayaFallbackApplied } = resolveAlgerianWilaya(
    params.normalized.wilayaRaw,
    params.mapping.default_wilaya_code,
  );
  const { communeName, communeFallbackApplied } = resolveAlgerianCommune(
    params.normalized.communeRaw,
    wilaya.code,
  );

  const requestedDeliveryType: TikTokDeliveryType =
    params.normalized.requestedDeliveryType ?? params.mapping.default_delivery_type ?? "DOMICILE";

  let effectiveDeliveryType: TikTokDeliveryType = requestedDeliveryType;
  let deliveryTypeFallbackApplied = false;

  // Decision 3: Southern Wilaya / Zone 5 Stop-Desk Fallback -> DOMICILE
  if (effectiveDeliveryType === "STOP_DESK" && !isStopDeskAllowed(wilaya.code)) {
    effectiveDeliveryType = "DOMICILE";
    deliveryTypeFallbackApplied = true;
  }

  // Read cached delivery_fees directly from Supabase ONLY (never make outbound HTTP calls to Redex/EcoTrack
  // during TikTok webhook or batch lead ingestion; falls back cleanly to ORVA's built-in 58-Wilaya matrix).
  try {
    if (params.loadLiveDeliveryFees) {
      const customFees = await params.loadLiveDeliveryFees();
      setLiveTariffs(customFees ?? {});
    } else {
      const dbForFees = getDb();
      const { data: feeRows } = await dbForFees
        .from("delivery_fees")
        .select("wilaya_id, tarif_domicile, tarif_stopdesk")
        .eq("service_type", "ecotrack");
      if (Array.isArray(feeRows) && feeRows.length > 0) {
        const cachedTariffs: Record<number, LiveTariff> = {};
        for (const row of feeRows) {
          const wId = Number(row.wilaya_id);
          if (Number.isFinite(wId) && wId >= 1 && wId <= 58) {
            cachedTariffs[wId] = {
              domicile: Number(row.tarif_domicile) || 0,
              stopdesk: Number(row.tarif_stopdesk) || 0,
            };
          }
        }
        setLiveTariffs(cachedTariffs);
      }
    }
  } catch {
    // Static 58-wilaya matrix in calculateDeliveryTariff remains active
  }

  const shippingFee = calculateDeliveryTariff(wilaya.code, effectiveDeliveryType);
  const totalPayable = authoritativePrice + shippingFee;

  // Decision 2: Never fabricate street address when omitted by Instant Form
  const rawAddress = (params.normalized.deliveryAddressRaw || "").trim();
  const addressMissing = effectiveDeliveryType === "DOMICILE" && rawAddress.length === 0;
  const deliveryAddress =
    effectiveDeliveryType === "STOP_DESK" ? "Bureau Stop-Desk" : rawAddress;
  const orderNotes = addressMissing
    ? MISSING_ADDRESS_CONFIRMATION_NOTE
    : deliveryAddress || "TikTok Instant Form Lead";

  // 4. Authoritative Idempotency Check on public.orders
  const idempotencyKey = `tiktok_lead_${externalLeadId}`;
  const db = getDb();

  const { data: existingOrder, error: existingErr } = await db
    .from("orders")
    .select("id, order_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed idempotency lookup on public.orders: ${existingErr.message}`,
      cause: existingErr,
    });
  }

  if (existingOrder?.order_id) {
    // Duplicate order — strictly return existing order without creating a duplicate or sending Telegram
    return {
      created: false,
      duplicate: true,
      orderId: String(existingOrder.order_id),
      productId: catalogProduct.id,
      productName: authoritativeName,
      packId: authoritativePackId,
      productPrice: authoritativePrice,
      shippingFee,
      totalPayable,
      wilayaCode: wilaya.code,
      wilayaName: wilaya.nameAr,
      communeName,
      effectiveDeliveryType,
      deliveryTypeFallbackApplied,
      addressMissing,
      wilayaFallbackApplied,
    };
  }

  // 5. Build ORVA dual-column public.orders row matching checkout.ts conventions
  const random6 = crypto.randomInt(100_000, 1_000_000).toString();
  const orderNumber = cleanPackUpper ? `${cleanPackUpper}-${random6}` : generateOrderNumber();
  const deliveryLabel =
    effectiveDeliveryType === "DOMICILE" ? "توصيل للمنزل" : "توصيل للمكتب (Stop Desk)";
  const wilayaFull = `${wilaya.code} - ${wilaya.nameAr} — ${communeName}`;
  const attributionSource = (params.mapping.lead_source_label || "tiktok_ads").trim() || "tiktok_ads";
  const utmCampaign = (params.lead.campaignName || params.lead.campaignId || "").trim() || null;

  const payloadHash = computeCanonicalPayloadHash({
    customerPhone: normalizedPhone,
    wilayaCode: wilaya.code,
    communeName,
    packId: authoritativePackId,
    totalPayable,
    deliveryType: effectiveDeliveryType,
  });

  const metadata: Record<string, unknown> = {
    source: "tiktok_lead_generation",
    externalLeadId,
    formId: params.lead.formId,
    advertiserId: params.lead.advertiserId,
    campaignId: params.lead.campaignId ?? null,
    campaignName: params.lead.campaignName ?? null,
    adgroupId: params.lead.adgroupId ?? null,
    adId: params.lead.adId ?? null,
    packId: authoritativePackId,
    productId: catalogProduct.id,
    productName: authoritativeName,
    addressMissing,
    wilayaFallbackApplied,
    communeFallbackApplied,
    deliveryTypeFallback: deliveryTypeFallbackApplied
      ? {
          applied: true,
          requested: "STOP_DESK",
          effective: "DOMICILE",
          reason: "STOP_DESK_UNSUPPORTED_IN_WILAYA",
          wilayaCode: wilaya.code,
        }
      : { applied: false },
    attribution: {
      attribution_source: attributionSource,
      utm_campaign: utmCampaign,
      redex_tracking_id: null,
    },
  };

  const orderRow = {
    order_id: orderNumber,
    order_number: orderNumber,
    idempotency_key: idempotencyKey,
    payload_hash: payloadHash,
    store_id: storeId,
    full_name: customerName,
    customer_name: customerName,
    phone: normalizedPhone,
    customer_phone: normalizedPhone,
    wilaya: wilayaFull,
    delivery_wilaya: wilayaFull,
    wilaya_code: wilaya.code,
    wilaya_name: wilaya.nameAr,
    commune: communeName,
    commune_name: communeName,
    delivery_commune: communeName,
    delivery_address: deliveryAddress,
    delivery_type: deliveryLabel,
    delivery_method: effectiveDeliveryType,
    delivery_time: "24 - 48 H",
    quantity: 1,
    product_name: authoritativeName,
    product_title: authoritativeName,
    pack_id: authoritativePackId,
    subtotal: authoritativePrice,
    delivery_fee: shippingFee,
    total: totalPayable,
    total_payable: totalPayable,
    product_total: `${authoritativePrice.toLocaleString()} د.ج`,
    shipping_fee: `${shippingFee.toLocaleString()} د.ج`,
    price_num: totalPayable,
    grand_total: `${totalPayable.toLocaleString()} د.ج`,
    status: "pending", // STRICT: never auto-confirm
    in_redex: false, // STRICT: never auto-dispatch to Redex
    notes: orderNotes,
    operator_notes: addressMissing ? MISSING_ADDRESS_CONFIRMATION_NOTE : null,
    risk_score: 0,
    risk_level: "LOW",
    risk_decision: "ALLOW",
    courier: "REDEX",
    attribution_source: attributionSource,
    utm_campaign: utmCampaign,
    redex_tracking_id: null,
    metadata,
  };

  const { data: insertedOrder, error: insertErr } = await db
    .from("orders")
    .insert(orderRow)
    .select("id, order_id")
    .single();

  if (insertErr) {
    // Concurrent race recovery on UNIQUE(idempotency_key)
    if (isUniqueConstraintError(insertErr)) {
      const { data: raced } = await db
        .from("orders")
        .select("id, order_id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (raced?.order_id) {
        return {
          created: false,
          duplicate: true,
          orderId: String(raced.order_id),
          productId: catalogProduct.id,
          productName: authoritativeName,
          packId: authoritativePackId,
          productPrice: authoritativePrice,
          shippingFee,
          totalPayable,
          wilayaCode: wilaya.code,
          wilayaName: wilaya.nameAr,
          communeName,
          effectiveDeliveryType,
          deliveryTypeFallbackApplied,
          addressMissing,
          wilayaFallbackApplied,
        };
      }
    }

    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to insert pending order from TikTok lead: ${insertErr.message}`,
      cause: insertErr,
    });
  }

  const finalOrderId = String(insertedOrder?.order_id || orderNumber);

  // 6. Persist public.order_items snapshot preserving pack_id CHECK ('PACK1'|'PACK2'|'PACK3'|null)
  const safeOrderItemPackId = VALID_LEGACY_ORDER_ITEM_PACKS.has(cleanPackUpper)
    ? (cleanPackUpper as "PACK1" | "PACK2" | "PACK3")
    : null;

  const { error: itemErr } = await db.from("order_items").insert({
    order_id: finalOrderId,
    product_id: catalogProduct.id,
    variant_id: null,
    pack_id: safeOrderItemPackId,
    product_name: authoritativeName,
    product_name_snapshot: authoritativeName,
    variant_label_snapshot: authoritativePackId,
    unit_price: authoritativePrice,
    quantity: 1,
    line_total: authoritativePrice,
  });

  if (itemErr) {
    // Log safely without raw PII; order itself was already persisted
    console.warn("[TikTok Order Item Insert Warning]", {
      orderId: finalOrderId,
      externalLeadId,
      message: itemErr.message,
    });
  }

  // 7. Decision 1: Fire strictly OPT-IN, asynchronous, non-blocking Telegram notification (<= 2500ms)
  // Detached from the critical path so Telegram latency or outage NEVER delays or fails order creation.
  const telegramNotificationPromise = sendOptionalTikTokLeadTelegramAlert(
    {
      orderNumber: finalOrderId,
      externalLeadId,
      customerName,
      customerPhone: normalizedPhone,
      wilayaDisplay: `${wilaya.code} - ${wilaya.nameAr}`,
      communeName,
      deliveryType: effectiveDeliveryType,
      addressMissing,
      productName: authoritativeName,
      productPrice: authoritativePrice,
      shippingFee,
      totalPayable,
      campaignName: params.lead.campaignName ?? null,
    },
    params.telegramOptions,
  ).catch((err) => ({
    sent: false,
    error: err instanceof Error ? err.message : "Telegram alert failed",
  }));

  return {
    created: true,
    duplicate: false,
    orderId: finalOrderId,
    productId: catalogProduct.id,
    productName: authoritativeName,
    packId: authoritativePackId,
    productPrice: authoritativePrice,
    shippingFee,
    totalPayable,
    wilayaCode: wilaya.code,
    wilayaName: wilaya.nameAr,
    communeName,
    effectiveDeliveryType,
    deliveryTypeFallbackApplied,
    addressMissing,
    wilayaFallbackApplied,
    telegramNotificationPromise,
  };
}

// ── 6. End-to-End Lead Ingestion & Disposition Persistence ───────────────────

export interface ProcessTikTokLeadParams {
  storeId?: string;
  lead: RawTikTokLeadInput;
  allowRetryExisting?: boolean;
  catalogGetProduct?: (id: string) => Promise<Product | null>;
  loadLiveDeliveryFees?: () => Promise<Record<number, LiveTariff> | null>;
  telegramOptions?: TikTokTelegramNotifyOptions;
  nowMs?: () => number;
}

export interface ProcessTikTokLeadResult {
  externalLeadId: string;
  syncStatus: TikTokLeadSyncStatus;
  orderId: string | null;
  duplicate: boolean;
  errorMessage: string | null;
  telegramNotificationPromise?: Promise<TikTokTelegramNotifyResult>;
}

async function incrementFormImportedCounter(
  db: any,
  storeId: string,
  formId: string,
  nowIso: string,
): Promise<void> {
  try {
    const { data: formRow } = await db
      .from("tiktok_forms")
      .select("total_leads_imported")
      .eq("store_id", storeId)
      .eq("form_id", formId)
      .maybeSingle();

    if (formRow) {
      await db
        .from("tiktok_forms")
        .update({
          total_leads_imported: Number(formRow.total_leads_imported ?? 0) + 1,
          updated_at: nowIso,
        })
        .eq("store_id", storeId)
        .eq("form_id", formId);
    }
  } catch {
    // Non-fatal counter update
  }
}

/**
 * Full per-lead processing pipeline:
 * 1. Deduplicates against public.tiktok_leads (UNIQUE external_lead_id).
 * 2. Normalizes multilingual fields, phone, wilaya, and commune.
 * 3. Resolves product mapping from public.tiktok_form_product_mappings.
 * 4. Preserves invalid / unmapped / lead-only / failed leads cleanly (never silently discarded).
 * 5. Calls createPendingOrderFromTikTokLead() for valid mapped leads with auto_create_order=true.
 */
export async function processNormalizedTikTokLead(
  params: ProcessTikTokLeadParams,
): Promise<ProcessTikTokLeadResult> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const externalLeadId = (params.lead.externalLeadId || "").trim();
  const formId = (params.lead.formId || "").trim();
  const advertiserId = (params.lead.advertiserId || "").trim();

  if (!externalLeadId || !formId || !advertiserId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "externalLeadId, formId, and advertiserId are required to process a TikTok lead.",
    });
  }

  const db = getDb();
  const nowIso = new Date((params.nowMs ?? Date.now)()).toISOString();

  // 1. Check existing lead ledger for idempotency
  const { data: existingLead, error: leadLookupErr } = await db
    .from("tiktok_leads")
    .select("*")
    .eq("external_lead_id", externalLeadId)
    .maybeSingle();

  if (leadLookupErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to query tiktok_leads for '${externalLeadId}': ${leadLookupErr.message}`,
      cause: leadLookupErr,
    });
  }

  const typedExisting = existingLead as TikTokLeadRow | null;
  if (typedExisting) {
    const alreadyTerminal =
      typedExisting.sync_status === "order_created" ||
      typedExisting.sync_status === "lead_saved_no_order" ||
      Boolean(typedExisting.order_id);

    if (alreadyTerminal || !params.allowRetryExisting) {
      return {
        externalLeadId,
        syncStatus: "duplicate_skipped",
        orderId: typedExisting.order_id ?? null,
        duplicate: true,
        errorMessage: null,
      };
    }
  }

  // 2. Normalize incoming lead fields
  const normalized = normalizeLeadFields(params.lead.fields);

  // 3. Lookup form-to-product mapping
  const { data: mappingRow, error: mapErr } = await db
    .from("tiktok_form_product_mappings")
    .select("*")
    .eq("store_id", storeId)
    .eq("form_id", formId)
    .maybeSingle();

  if (mapErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to lookup product mapping for form '${formId}': ${mapErr.message}`,
      cause: mapErr,
    });
  }

  const mapping = mappingRow as TikTokFormProductMappingRow | null;
  const resolvedWilaya = resolveAlgerianWilaya(
    normalized.wilayaRaw,
    mapping?.default_wilaya_code ?? 16,
  );
  const resolvedCommune = resolveAlgerianCommune(normalized.communeRaw, resolvedWilaya.wilaya.code);

  const baseLeadRecord = {
    store_id: storeId,
    external_lead_id: externalLeadId,
    form_id: formId,
    advertiser_id: advertiserId,
    campaign_id: params.lead.campaignId ?? null,
    campaign_name: params.lead.campaignName ?? null,
    adgroup_id: params.lead.adgroupId ?? null,
    ad_id: params.lead.adId ?? null,
    customer_name: normalized.customerName,
    customer_phone_raw: normalized.customerPhoneRaw,
    customer_phone_normalized: normalized.customerPhoneNormalized,
    phone_valid: normalized.phoneValid,
    wilaya_code: resolvedWilaya.wilaya.code,
    wilaya_name: resolvedWilaya.wilaya.nameAr,
    commune_name: resolvedCommune.communeName,
    delivery_address: normalized.deliveryAddressRaw ?? "",
    mapped_product_id: mapping?.product_id ?? null,
    mapped_product_name: mapping?.product_name ?? null,
    raw_field_data: params.lead.fields ?? {},
    lead_created_at: params.lead.leadCreatedAt ?? null,
    updated_at: nowIso,
  };

  const persistLeadState = async (
    syncStatus: TikTokLeadSyncStatus,
    extra: {
      orderId?: string | null;
      mappedProductId?: string | null;
      mappedProductName?: string | null;
      retryCount?: number;
      errorMessage?: string | null;
    } = {},
  ): Promise<void> => {
    const payload = {
      ...baseLeadRecord,
      order_id: extra.orderId !== undefined ? extra.orderId : typedExisting?.order_id ?? null,
      mapped_product_id:
        extra.mappedProductId !== undefined ? extra.mappedProductId : baseLeadRecord.mapped_product_id,
      mapped_product_name:
        extra.mappedProductName !== undefined
          ? extra.mappedProductName
          : baseLeadRecord.mapped_product_name,
      sync_status: syncStatus,
      retry_count: extra.retryCount ?? typedExisting?.retry_count ?? 0,
      error_message: extra.errorMessage ?? null,
    };

    const { error: upsertErr } = await db
      .from("tiktok_leads")
      .upsert(payload, { onConflict: "external_lead_id" });

    if (upsertErr) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to persist tiktok_leads row for '${externalLeadId}': ${upsertErr.message}`,
        cause: upsertErr,
      });
    }
  };

  // 4. Unmapped form -> preserve lead for later mapping & recovery
  if (!mapping) {
    const msg = `TikTok form '${formId}' is not mapped to an ORVA catalog product.`;
    await persistLeadState("unmapped_form", {
      retryCount: typedExisting ? typedExisting.retry_count + 1 : 0,
      errorMessage: msg,
    });
    return {
      externalLeadId,
      syncStatus: "unmapped_form",
      orderId: null,
      duplicate: false,
      errorMessage: msg,
    };
  }

  // 5. Invalid Algerian mobile phone -> preserve lead for manual review, NEVER create order or notify
  if (!normalized.phoneValid || !normalized.customerPhoneNormalized) {
    const msg = "Invalid or missing Algerian mobile phone number (expected 10 digits starting with 05, 06, or 07).";
    await persistLeadState("invalid_phone", {
      retryCount: typedExisting ? typedExisting.retry_count + 1 : 0,
      errorMessage: msg,
    });
    return {
      externalLeadId,
      syncStatus: "invalid_phone",
      orderId: null,
      duplicate: false,
      errorMessage: msg,
    };
  }

  // 6. Lead archival only (auto_create_order === false)
  if (!mapping.auto_create_order) {
    await persistLeadState("lead_saved_no_order", { errorMessage: null });
    if (!typedExisting) {
      await incrementFormImportedCounter(db, storeId, formId, nowIso);
    }
    return {
      externalLeadId,
      syncStatus: "lead_saved_no_order",
      orderId: null,
      duplicate: false,
      errorMessage: null,
    };
  }

  // 7. Create pending COD order via dedicated createPendingOrderFromTikTokLead()
  try {
    const orderResult = await createPendingOrderFromTikTokLead({
      storeId,
      lead: params.lead,
      normalized,
      mapping,
      catalogGetProduct: params.catalogGetProduct,
      loadLiveDeliveryFees: params.loadLiveDeliveryFees,
      telegramOptions: params.telegramOptions,
      nowMs: params.nowMs,
    });

    await persistLeadState("order_created", {
      orderId: orderResult.orderId,
      mappedProductId: orderResult.productId,
      mappedProductName: orderResult.productName,
      errorMessage: null,
    });

    if (orderResult.created) {
      await incrementFormImportedCounter(db, storeId, formId, nowIso);
    }

    return {
      externalLeadId,
      syncStatus: orderResult.duplicate ? "duplicate_skipped" : "order_created",
      orderId: orderResult.orderId,
      duplicate: orderResult.duplicate,
      errorMessage: null,
      telegramNotificationPromise: orderResult.telegramNotificationPromise,
    };
  } catch (orderErr) {
    const safeMsg =
      orderErr instanceof Error ? orderErr.message : "Failed to create pending order from TikTok lead.";
    await persistLeadState("order_creation_failed", {
      retryCount: (typedExisting?.retry_count ?? 0) + 1,
      errorMessage: safeMsg,
    });
    return {
      externalLeadId,
      syncStatus: "order_creation_failed",
      orderId: null,
      duplicate: false,
      errorMessage: safeMsg,
    };
  }
}
