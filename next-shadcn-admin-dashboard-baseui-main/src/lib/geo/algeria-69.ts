import communesRaw from "@/data/geoalgeria/communes.json";
import wilayasMeta from "@/data/geoalgeria/wilayas-meta.json";

export type LogisticsZone = 1 | 2 | 3 | 4 | 5;

export interface Wilaya69Record {
  code: number;
  paddedCode: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  zone: LogisticsZone;
  createdYear: number;
  motherWilayaCode: number | null;
  capitalNameFr: string;
  capitalNameAr: string;
  stopDeskDefaultAllowed: boolean;
}

export interface Commune69Item {
  id: number;
  commune_name_fr: string;
  commune_name_ar: string;
  daira_name_fr: string;
  wilaya_code: number;
  wilaya_name_fr: string;
  wilaya_name_ar: string;
  postal_code: string;
}

const ZONE_BY_CODE: Record<number, LogisticsZone> = {
  1: 5,
  2: 2,
  3: 3,
  4: 2,
  5: 1,
  6: 2,
  7: 1,
  8: 4,
  9: 2,
  10: 2,
  11: 5,
  12: 2,
  13: 2,
  14: 3,
  15: 2,
  16: 2,
  17: 3,
  18: 2,
  19: 2,
  20: 3,
  21: 2,
  22: 2,
  23: 2,
  24: 2,
  25: 2,
  26: 2,
  27: 2,
  28: 3,
  29: 2,
  30: 4,
  31: 2,
  32: 4,
  33: 5,
  34: 2,
  35: 2,
  36: 2,
  37: 5,
  38: 3,
  39: 4,
  40: 2,
  41: 2,
  42: 2,
  43: 2,
  44: 2,
  45: 4,
  46: 2,
  47: 4,
  48: 2,
  49: 5,
  50: 5,
  51: 1,
  52: 5,
  53: 5,
  54: 5,
  55: 4,
  56: 5,
  57: 4,
  58: 5,
};

/** Law 26-06 (2026) 11 new wilayas -> mother wilaya codes */
export const MOTHER_WILAYA_MAP: Record<number, number> = {
  59: 3, // Aflou -> Laghouat
  60: 5, // Barika -> Batna
  61: 7, // El Kantara -> Biskra
  62: 12, // Bir El Ater -> Tebessa
  63: 13, // El Aricha -> Tlemcen
  64: 14, // Ksar Chellala -> Tiaret
  65: 17, // Ain Ouessara -> Djelfa
  66: 17, // Messaad -> Djelfa
  67: 26, // Ksar El Boukhari -> Medea
  68: 28, // Bou Saada -> M'Sila
  69: 32, // El Abiodh Sidi Cheikh -> El Bayadh
};

const RAW_WILAYAS = (
  wilayasMeta as {
    wilayas: Array<{
      code: number;
      name_ar: string;
      name_fr: string;
      name_en?: string;
      created?: number;
      mother_wilaya_code?: number;
      communes?: Array<{ name_ar: string; name_fr: string }>;
    }>;
  }
).wilayas;
const ALL_COMMUNES = communesRaw as Commune69Item[];

function normalizeSearchKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, "");
}

export const ALGERIA_69_WILAYAS: Wilaya69Record[] = RAW_WILAYAS.map((w) => {
  const code = Number(w.code);
  const motherCode = w.mother_wilaya_code ? Number(w.mother_wilaya_code) : (MOTHER_WILAYA_MAP[code] ?? null);
  const zone: LogisticsZone = ZONE_BY_CODE[code] ?? (motherCode ? (ZONE_BY_CODE[motherCode] ?? 3) : 3);
  const firstMetaCommune = w.communes?.[0];
  const communeMatch = ALL_COMMUNES.find((c) => Number(c.wilaya_code) === code);

  return {
    code,
    paddedCode: String(code).padStart(2, "0"),
    nameFr: w.name_fr,
    nameAr: w.name_ar,
    nameEn: w.name_en || w.name_fr,
    zone,
    createdYear: Number(w.created || 1984),
    motherWilayaCode: motherCode,
    capitalNameFr: firstMetaCommune?.name_fr || communeMatch?.commune_name_fr || w.name_fr,
    capitalNameAr: firstMetaCommune?.name_ar || communeMatch?.commune_name_ar || w.name_ar,
    stopDeskDefaultAllowed: code <= 48 && zone !== 5,
  };
}).sort((a, b) => a.code - b.code);

export const WILAYA_69_BY_CODE = new Map<number, Wilaya69Record>(ALGERIA_69_WILAYAS.map((w) => [w.code, w]));

const LOOKUP_NAME_TO_CODE = new Map<string, number>();
for (const w of ALGERIA_69_WILAYAS) {
  LOOKUP_NAME_TO_CODE.set(normalizeSearchKey(w.nameFr), w.code);
  LOOKUP_NAME_TO_CODE.set(normalizeSearchKey(w.nameAr), w.code);
  LOOKUP_NAME_TO_CODE.set(normalizeSearchKey(w.nameEn), w.code);
}
// Extra common transliterations / typos
const EXTRA_ALIASES: Record<string, number> = {
  algiers: 16,
  msila: 28,
  eloued: 39,
  soukahras: 41,
  tamanrasset: 11,
  elmeniaa: 58,
  elmghair: 57,
  bordjbouarreridj: 34,
  sidibelabbes: 22,
  oumelbouaghi: 4,
  aindefla: 44,
  aintemouchent: 46,
  bousaada: 68,
  boussaada: 68,
  ainouessara: 65,
  ainoussara: 65,
  birelater: 62,
  aflou: 59,
  barika: 60,
  elkantara: 61,
  elaricha: 63,
  ksarchellala: 64,
  messaad: 66,
  ksarelboukhari: 67,
  elabiodhsidicheikh: 69,
};
for (const [alias, code] of Object.entries(EXTRA_ALIASES)) {
  if (!LOOKUP_NAME_TO_CODE.has(alias)) {
    LOOKUP_NAME_TO_CODE.set(alias, code);
  }
}

export function isNewWilaya69(code: number): boolean {
  return code >= 59 && code <= 69;
}

export function getMotherWilayaCode(code: number): number | null {
  return WILAYA_69_BY_CODE.get(code)?.motherWilayaCode ?? MOTHER_WILAYA_MAP[code] ?? null;
}

export function getWilaya69ByCode(code: number | null | undefined): Wilaya69Record | null {
  if (!code || !Number.isFinite(code)) return null;
  return WILAYA_69_BY_CODE.get(Number(code)) ?? null;
}

export function getWilayaCapital69(code: number): string {
  return WILAYA_69_BY_CODE.get(code)?.capitalNameFr || "Alger Centre";
}

export function getWilayaNameAr69(code: number): string {
  return WILAYA_69_BY_CODE.get(code)?.nameAr || `الولاية ${code}`;
}

/**
 * Extracts valid Wilaya code (1..69) from string or number. Returns null if unparseable.
 */
export function parseWilayaCode69(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return raw >= 1 && raw <= 69 ? Math.trunc(raw) : null;
  }

  const str = String(raw)
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
  if (!str) return null;

  const leadingNum =
    str.match(/^\s*0?(\d{1,2})(?=\s*(?:[-–—,()/]|$))/) ?? str.match(/(?:ولاية|wilaya)\s*0?(\d{1,2})\b/i);
  if (leadingNum) {
    const code = parseInt(leadingNum[1], 10);
    if (code >= 1 && code <= 69) return code;
  }

  const norm = normalizeSearchKey(str);
  if (norm && LOOKUP_NAME_TO_CODE.has(norm)) {
    return LOOKUP_NAME_TO_CODE.get(norm)!;
  }

  // Substring match prioritizing longer keys (so "Ksar El Boukhari" matches before shorter fragments)
  const sortedEntries = Array.from(LOOKUP_NAME_TO_CODE.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const [key, code] of sortedEntries) {
    if (key.length >= 3 && norm.includes(key)) {
      return code;
    }
  }

  const trailingNum = str.match(/\b0?([1-6]?[0-9])\b/);
  if (trailingNum) {
    const code = parseInt(trailingNum[1], 10);
    if (code >= 1 && code <= 69) return code;
  }

  return null;
}

export function extractWilayaCode69(raw: string | number | null | undefined, fallback = 16): number {
  return parseWilayaCode69(raw) ?? fallback;
}

/**
 * Maps a wilaya 1..69 to what the external carrier supports.
 * If the carrier only supports 1..58 (or explicit `supportedCodes` omits `code`),
 * delegates wilayas 59..69 cleanly to their Law 26-06 mother wilaya for Home Delivery.
 */
export function resolveCarrierWilayaCode(
  code: number,
  supportedCodes?: number[] | Set<number> | null,
): { carrierWilayaCode: number; routedViaMotherWilaya: boolean; motherWilayaCode: number | null } {
  const supportSet = supportedCodes ? (supportedCodes instanceof Set ? supportedCodes : new Set(supportedCodes)) : null;

  const isDirectlySupported = supportSet ? supportSet.has(code) : code >= 1 && code <= 58;
  if (isDirectlySupported) {
    return { carrierWilayaCode: code, routedViaMotherWilaya: false, motherWilayaCode: getMotherWilayaCode(code) };
  }

  const mother = getMotherWilayaCode(code);
  if (mother && (!supportSet || supportSet.has(mother))) {
    return { carrierWilayaCode: mother, routedViaMotherWilaya: true, motherWilayaCode: mother };
  }

  return { carrierWilayaCode: code, routedViaMotherWilaya: false, motherWilayaCode: mother };
}

/**
 * Returns communes list for any wilaya 1..69.
 * Uses communes.json first (already 1,541 communes across 69 wilayas) with wilayas-meta fallback.
 */
export function getCommunesForWilaya69(wilayaCode: number): Array<{ ar: string; fr: string; postalCode?: string }> {
  const fromCommunes = ALL_COMMUNES.filter((c) => Number(c.wilaya_code) === wilayaCode).map((c) => ({
    ar: c.commune_name_ar,
    fr: c.commune_name_fr,
    postalCode: c.postal_code,
  }));

  if (fromCommunes.length > 0) return fromCommunes;

  const meta = RAW_WILAYAS.find((w) => Number(w.code) === wilayaCode);
  if (meta?.communes?.length) {
    return meta.communes.map((c) => ({ ar: c.name_ar, fr: c.name_fr }));
  }

  const mother = getMotherWilayaCode(wilayaCode);
  if (mother) {
    return ALL_COMMUNES.filter((c) => Number(c.wilaya_code) === mother).map((c) => ({
      ar: c.commune_name_ar,
      fr: c.commune_name_fr,
      postalCode: c.postal_code,
    }));
  }

  return [];
}
