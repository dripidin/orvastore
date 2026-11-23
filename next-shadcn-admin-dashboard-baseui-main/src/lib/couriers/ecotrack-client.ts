/**
 * ORVA Store — EcoTrack / Redex Native Node.js Courier Client
 * Implements all 6 sections & 21 official EcoTrack API endpoints:
 *  1. Authorisation (validate/token)
 *  2. Taux limite (50/min, 1500/hr, 15000/day, GET /api/v1/, Retry-After, backoff)
 *  3. Commandes (create/order, create/orders, update/order, delete/order, valid/order,
 *     ask/for/order/return, valid/returns, add/maj, get/maj)
 *  4. Suivi des commandes (get/orders, get/orders/status, get/tracking/info,
 *     get/trackings/info, get/order/label)
 *  5. Configuration (get/wilayas, get/communes, get/desks, get/fees incl. retour)
 *  6. Produits (get/products/list)
 */

import {
  extractWilayaCode69,
  getMotherWilayaCode,
  getWilayaCapital69,
  resolveCarrierWilayaCode,
} from "@/lib/geo/algeria-69";

import {
  getCachedCourierData,
  getRateLimitSnapshot,
  invalidateCourierCache,
  type RateLimitSnapshot,
  setCachedCourierData,
  throttledCourierFetch,
} from "./ecotrack-rate-limiter";
import type { CourierDeskInfo, CourierExternalOrder, CourierRemarkItem } from "./types";

export interface EcoTrackOrderPayload {
  reference?: string;
  nom_client: string;
  telephone: string;
  telephone_2?: string;
  adresse: string;
  commune: string;
  code_wilaya: number;
  montant: number;
  remarque?: string;
  produit?: string;
  produit_a_recuperer?: string;
  boutique?: string;
  type?: number; // 1 = Livraison (default), 2 = Echange, 3 = PICKUP, 4 = Recouvrement
  stop_desk?: number; // 0 = Domicile, 1 = Stop Desk
  code_postal?: string | number;
  stock?: number; // 0 or 1
  quantite?: number;
  weight?: number;
  fragile?: number;
  gps_link?: string;
}

export interface EcoTrackUpdateOrderPayload {
  client?: string;
  tel?: string;
  tel2?: string;
  adresse?: string;
  commune?: string;
  wilaya?: number;
  montant?: number;
  remarque?: string;
  product?: string;
  type?: number;
  stop_desk?: number;
  code_postal?: string | number;
  weight?: number;
  fragile?: number;
  gps_link?: string;
}

export interface EcoTrackCreateOrderResult {
  success: boolean;
  tracking: string;
  routedViaMotherWilaya?: boolean;
  effectiveWilayaCode?: number;
  raw?: unknown;
  error?: string;
  errorCode?: number;
}

export interface EcoTrackValidOrderResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface EcoTrackActivityItem {
  date: string;
  time: string;
  status: string;
  statusAr?: string;
  station?: string;
  scanLocation?: string;
  details?: string;
  reason?: string;
  driver?: string;
  postponed_to?: string;
}

export interface EcoTrackTrackingInfo {
  success: boolean;
  tracking: string;
  recipientName?: string;
  shippedBy?: string;
  currentStation?: string;
  status?: string;
  statusAr?: string;
  financialStatus?: string;
  originCity?: number | string;
  destLocationCity?: number | string;
  driverName?: string;
  driverPhone?: string;
  deskInfo?: CourierDeskInfo;
  remarks?: CourierRemarkItem[];
  activity: EcoTrackActivityItem[];
  reasons?: string[];
  error?: string;
}

export interface EcoTrackFeesWilaya {
  wilaya_id: number;
  tarif: string;
  tarif_stopdesk: string;
  tarif_retour?: string;
  tarif_pickup?: string;
  tarif_echange?: string;
}

export interface EcoTrackFeesFullResult {
  success: boolean;
  fees?: EcoTrackFeesWilaya[];
  livraison?: EcoTrackFeesWilaya[];
  retour?: Array<{ wilaya_id: number; tarif: string | number }>;
  pickup?: Array<{ wilaya_id: number; tarif: string | number }>;
  echange?: Array<{ wilaya_id: number; tarif: string | number }>;
  recouvrement?: Array<{ wilaya_id: number; tarif: string | number }>;
  returnFeesByWilaya?: Record<number, number>;
  error?: string;
}

export interface EcoTrackCommuneItem {
  nom: string;
  wilaya_id: number;
  code_postal?: string;
  has_stop_desk: number;
  is_active: number;
}

export interface EcoTrackProductItem {
  reference: string;
  barcode: string | null;
  title: string;
  is_active: number;
  image: string | null;
  stock_disponible: number;
  stock_reserve: number;
  stock_phisique: number;
}

export const ECOTRACK_STATUS_MAP_AR: Record<
  string,
  { label: string; stage: "pending" | "shipped" | "delivered" | "returned" | "cancelled" }
> = {
  prete_a_expedier: { label: "جاهز للإرسال (Prêt à expédier)", stage: "shipped" },
  order_information_received_by_carrier: { label: "تم تسجيل الطلبية واعتمادها", stage: "shipped" },
  notification_on_order: { label: "ملاحظة على الشحنة", stage: "shipped" },
  en_ramassage: { label: "قيد الاستلام من المتجر", stage: "shipped" },
  vers_station: { label: "في الطريق إلى مركز التجميع", stage: "shipped" },
  picked: { label: "تم الاستلام من طرف الناقل", stage: "shipped" },
  accepted_by_carrier: { label: "استُلمت في مركز الفرز المركزي", stage: "shipped" },
  en_preparation_stock: { label: "قيد التجهيز في المستودع", stage: "shipped" },
  vers_hub: { label: "في الطريق إلى مركز التوزيع", stage: "shipped" },
  en_hub: { label: "في مركز التوزيع الإقليمي", stage: "shipped" },
  en_station: { label: "متوقفة في مركز التوزيع", stage: "shipped" },
  vers_wilaya: { label: "في الطريق إلى ولاية العميل", stage: "shipped" },
  en_preparation: { label: "قيد التحضير للتوزيع", stage: "shipped" },
  en_process: { label: "قيد المعالجة لدى شركة التوصيل", stage: "shipped" },
  dispatched_to_driver: { label: "سُلّمت لرجل التوصيل", stage: "shipped" },
  en_livraison: { label: "قيد التوصيل للزبون", stage: "shipped" },
  attempt_delivery: { label: "محاولة تسليم للزبون", stage: "shipped" },
  suspendu: { label: "شحنة معلّقة في المركز (قابلة للتحويل)", stage: "shipped" },
  livred: { label: "تم التسليم بنجاح", stage: "delivered" },
  livre_non_encaisse: { label: "تم التسليم (في انتظار التحصيل)", stage: "delivered" },
  encaisse_non_paye: { label: "تم التحصيل المالي (لم يُدفع بعد)", stage: "delivered" },
  encaissed: { label: "تم التحصيل المالي", stage: "delivered" },
  paiements_prets: { label: "المستحقات جاهزة للدفع", stage: "delivered" },
  paye_et_archive: { label: "تم الدفع والأرشفة", stage: "delivered" },
  payed: { label: "تم الدفع للبائع", stage: "delivered" },
  return_asked: { label: "طلب إرجاع الشحنة", stage: "returned" },
  return_in_transit: { label: "الإرجاع في الطريق للمستودع", stage: "returned" },
  retour_chez_livreur: { label: "الإرجاع عند رجل التوصيل", stage: "returned" },
  retour_transit_entrepot: { label: "الإرجاع في طريق المستودع", stage: "returned" },
  retour_en_traitement: { label: "معالجة الإرجاع في المركز", stage: "returned" },
  retour_recu: { label: "استلم التاجر الطرد المرتجع", stage: "returned" },
  Return_received: { label: "استلم التاجر الطرد المرتجع", stage: "returned" },
  retour_archive: { label: "مرتجع مؤرشف", stage: "returned" },
  annule: { label: "ملغى من طرف الزبون أو الناقل", stage: "cancelled" },
};

const ARABIC_TO_LATIN_COMMUNES: Record<string, string> = {
  "الجزائر الوسطى": "Alger Centre",
  "سيدي امحمد": "Sidi M'hamed",
  المدنية: "El Madania",
  بلوزداد: "Mohamed Belouizdad",
  "باب الواد": "Bab El Oued",
  القصبة: "Casbah",
  "وادي قريش": "Oued Koriche",
  "بئر مراد رايس": "Bir Mourad Rais",
  الابيار: "El Biar",
  بوزريعة: "Bouzareah",
  "بئر خادم": "Birkhadem",
  حيدرة: "Hydra",
  "بن عكنون": "Ben Aknoun",
  "دالي براهيم": "Dely Ibrahim",
  المرادية: "El Mouradia",
  "بني مسوس": "Beni Messous",
  براقي: "Baraki",
  الكاليتوس: "Les Eucalyptus",
  "سيدي موسى": "Sidi Moussa",
  "بئر توتة": "Birtouta",
  زرالدة: "Zeralda",
  سطاوالي: "Staoueli",
  "عين بنيان": "Ain Benian",
  الشراقة: "Cheraga",
  "اولاد فايت": "Ouled Fayet",
  "باب الزوار": "Bab Ezzouar",
  "الدار البيضاء": "Dar El Beida",
  الحراش: "El Harrach",
  "حسين داي": "Hussein Dey",
  القبة: "Kouba",
  الرويبة: "Rouiba",
  الرغاية: "Reghaia",
  بشار: "Bechar",
  عنابة: "Annaba",
  وهران: "Oran",
  "بئر الجير": "Bir El Djir",
  السانية: "Es Senia",
  قسنطينة: "Constantine",
  الخروب: "El Khroub",
  البليدة: "Blida",
  بوفاريك: "Boufarik",
  بسكرة: "Biskra",
  طولقة: "Tolga",
  القنطرة: "El Kantara",
  "أولاد جلال": "Ouled Djellal",
  سطيف: "Setif",
  العلمة: "El Eulma",
  باتنة: "Batna",
  بريكة: "Barika",
  "تيزي وزو": "Tizi Ouzou",
  بجاية: "Bejaia",
  اقبو: "Akbou",
  الشلف: "Chlef",
  تلمسان: "Tlemcen",
  بوسعادة: "Bou Saada",
  "عين وسارة": "Ain Oussera",
  مسعد: "Messaad",
  أفلو: "Aflou",
  "بئر العاتر": "Bir El Ater",
  "قصر البخاري": "Ksar El Boukhari",
  "قصر الشلالة": "Ksar Chellala",
};

export function extractWilayaCode(raw: string | number | undefined | null): number {
  return extractWilayaCode69(raw, 16);
}

export function cleanAlgerianPhone(raw: string | undefined | null): string {
  if (!raw) return "";
  let cleaned = raw.replace(/[^\d]/g, "");
  if (cleaned.startsWith("213") && cleaned.length === 12) {
    cleaned = "0" + cleaned.slice(3);
  } else if (cleaned.startsWith("00213") && cleaned.length === 14) {
    cleaned = "0" + cleaned.slice(5);
  }
  if (cleaned.length === 9 && !cleaned.startsWith("0")) {
    cleaned = "0" + cleaned;
  }
  return cleaned;
}

const CONFIG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class EcoTrackClient {
  private readonly courierId: string;
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options?: { courierId?: string; baseUrl?: string; token?: string }) {
    this.courierId = (options?.courierId || "redex").trim().toLowerCase();
    this.baseUrl = (
      options?.baseUrl ||
      process.env.REDEX_BASE_URL ||
      process.env.ECOTRACK_BASE_URL ||
      "https://redex.ecotrack.dz"
    ).replace(/\/+$/, "");

    this.token = (options?.token || process.env.REDEX_API_TOKEN || process.env.ECOTRACK_API_TOKEN || "").trim();
  }

  public getCourierId(): string {
    return this.courierId;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getToken(): string {
    return this.token;
  }

  private authHeaders(contentTypeJson = false): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
      "User-Agent": "ORVA-Store-Client/2.0",
    };
    if (contentTypeJson) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  // ── 1. AUTHORISATION ───────────────────────────────────────────────────────

  /**
   * GET /api/v1/validate/token?api_token=... (query parameter per EcoTrack spec)
   */
  public async validateToken(
    customToken?: string,
    customBaseUrl?: string,
  ): Promise<{ success: boolean; message: string; latencyMs: number; raw?: unknown }> {
    const urlBase = (customBaseUrl || this.baseUrl).replace(/\/+$/, "");
    const tokenToTest = (customToken || this.token).trim();
    const start = Date.now();

    if (!tokenToTest) {
      return { success: false, message: "رمز API غير مضبوط لهذه الشركة", latencyMs: 0 };
    }

    try {
      const targetUrl = `${urlBase}/api/v1/validate/token?api_token=${encodeURIComponent(tokenToTest)}`;
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: targetUrl,
        endpointLabel: "GET /api/v1/validate/token",
        init: {
          method: "GET",
          headers: { Accept: "application/json", "User-Agent": "ORVA-Store-Client/2.0" },
        },
      });
      const latencyMs = Date.now() - start;
      const data = await res.json().catch(() => null);
      if (res.ok && (data?.success || data?.valid === true)) {
        return { success: true, message: data.message || "VALID_TOKEN", latencyMs, raw: data };
      }
      return {
        success: false,
        message: data?.message || `HTTP ${res.status}: ${res.statusText}`,
        latencyMs,
        raw: data,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err?.message || "فشل الاتصال بخادم شركة التوصيل",
        latencyMs: Date.now() - start,
      };
    }
  }

  public async testConnection(
    customToken?: string,
    customBaseUrl?: string,
  ): Promise<{
    success: boolean;
    message: string;
    latencyMs?: number;
    servedWilayaIds?: number[];
    rateLimit?: RateLimitSnapshot;
  }> {
    const val = await this.validateToken(customToken, customBaseUrl);
    if (!val.success) {
      return {
        success: false,
        message: val.message,
        latencyMs: val.latencyMs,
        rateLimit: getRateLimitSnapshot(this.courierId),
      };
    }

    let servedWilayaIds: number[] | undefined;
    try {
      const clientForWilayas =
        customToken || customBaseUrl
          ? new EcoTrackClient({
              courierId: this.courierId,
              baseUrl: customBaseUrl || this.baseUrl,
              token: customToken || this.token,
            })
          : this;
      const wRes = await clientForWilayas.getWilayas();
      if (wRes.success && wRes.wilayas) {
        servedWilayaIds = wRes.wilayas.map((w) => Number(w.wilaya_id)).filter((n) => Number.isFinite(n));
      }
    } catch {
      // Non-fatal if wilayas probe fails while token is valid
    }

    return {
      success: true,
      message: val.message,
      latencyMs: val.latencyMs,
      servedWilayaIds,
      rateLimit: getRateLimitSnapshot(this.courierId),
    };
  }

  // ── 2. TAUX LIMITE ─────────────────────────────────────────────────────────

  /**
   * GET /api/v1/ — Checks server rate-limit headers & returns live quota telemetry.
   */
  public async checkRateLimitStatus(): Promise<{ success: boolean; snapshot: RateLimitSnapshot; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/ (rate_limit)",
        init: { method: "GET", headers: this.authHeaders() },
      });
      return {
        success: res.ok || res.status === 404 || res.status === 200,
        snapshot: getRateLimitSnapshot(this.courierId),
      };
    } catch (err: any) {
      return {
        success: false,
        snapshot: getRateLimitSnapshot(this.courierId),
        error: err?.message || "Rate limit check failed",
      };
    }
  }

  public getCachedRateLimitSnapshot(): RateLimitSnapshot {
    return getRateLimitSnapshot(this.courierId);
  }

  // ── 5. CONFIGURATION ───────────────────────────────────────────────────────

  /**
   * GET /api/v1/get/wilayas
   */
  public async getWilayas(
    forceRefresh = false,
  ): Promise<{ success: boolean; wilayas?: Array<{ wilaya_id: number; wilaya_name: string }>; error?: string }> {
    const cacheKey = `${this.courierId}:wilayas:${this.baseUrl}`;
    if (!forceRefresh) {
      const cached = getCachedCourierData<Array<{ wilaya_id: number; wilaya_name: string }>>(cacheKey);
      if (cached) return { success: true, wilayas: cached };
    }

    const endpoint = `${this.baseUrl}/api/v1/get/wilayas`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/wilayas",
        init: { method: "GET", headers: this.authHeaders() },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && Array.isArray(json)) {
        setCachedCourierData(cacheKey, json, CONFIG_CACHE_TTL_MS);
        return { success: true, wilayas: json };
      }
      return { success: false, error: json?.message || `HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * GET /api/v1/get/communes?wilaya_id=...
   * For new wilayas 59..69 not yet returned directly by a 58-wilaya carrier, transparently queries mother wilaya.
   */
  public async getCommunes(wilayaId?: number, forceRefresh = false): Promise<EcoTrackCommuneItem[]> {
    const queryWilaya = wilayaId && wilayaId >= 59 ? (getMotherWilayaCode(wilayaId) ?? wilayaId) : wilayaId;
    const cacheKey = `${this.courierId}:communes:${this.baseUrl}:${queryWilaya ?? "all"}`;

    if (!forceRefresh) {
      const cached = getCachedCourierData<EcoTrackCommuneItem[]>(cacheKey);
      if (cached) return cached;
    }

    const endpoint = `${this.baseUrl}/api/v1/get/communes${queryWilaya ? `?wilaya_id=${queryWilaya}` : ""}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/communes",
        init: { method: "GET", headers: this.authHeaders() },
      });
      if (!res.ok) return [];
      const json = await res.json().catch(() => []);
      const communes: EcoTrackCommuneItem[] = Array.isArray(json) ? json : Object.values(json || {});
      setCachedCourierData(cacheKey, communes, CONFIG_CACHE_TTL_MS);
      return communes;
    } catch {
      return [];
    }
  }

  /**
   * GET /api/v1/get/desks
   */
  public async getDesks(forceRefresh = false): Promise<{ success: boolean; desks?: any; error?: string }> {
    const cacheKey = `${this.courierId}:desks:${this.baseUrl}`;
    if (!forceRefresh) {
      const cached = getCachedCourierData<any>(cacheKey);
      if (cached) return { success: true, desks: cached };
    }

    const endpoint = `${this.baseUrl}/api/v1/get/desks`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/desks",
        init: { method: "GET", headers: this.authHeaders() },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        setCachedCourierData(cacheKey, json, CONFIG_CACHE_TTL_MS);
        return { success: true, desks: json };
      }
      return { success: false, error: json?.message || "Failed to fetch desks" };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * GET /api/v1/get/fees
   * Extracts ALL tariff tables: livraison, retour, pickup, echange, recouvrement.
   */
  public async getFees(forceRefresh = false): Promise<EcoTrackFeesFullResult> {
    const cacheKey = `${this.courierId}:fees:${this.baseUrl}`;
    if (!forceRefresh) {
      const cached = getCachedCourierData<EcoTrackFeesFullResult>(cacheKey);
      if (cached) return cached;
    }

    const endpoint = `${this.baseUrl}/api/v1/get/fees`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/fees",
        init: { method: "GET", headers: this.authHeaders() },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json && (Array.isArray(json.livraison) || Array.isArray(json.retour))) {
        const returnMap: Record<number, number> = {};
        const retourArr = Array.isArray(json.retour) ? json.retour : [];
        for (const r of retourArr) {
          const id = Number(r.wilaya_id);
          const tarif = Number(r.tarif);
          if (id >= 1 && id <= 69 && Number.isFinite(tarif)) returnMap[id] = tarif;
        }

        const pickupMap: Record<number, number> = {};
        for (const r of Array.isArray(json.pickup) ? json.pickup : []) {
          pickupMap[Number(r.wilaya_id)] = Number(r.tarif) || 0;
        }
        const echangeMap: Record<number, number> = {};
        for (const r of Array.isArray(json.echange) ? json.echange : []) {
          echangeMap[Number(r.wilaya_id)] = Number(r.tarif) || 0;
        }

        const enrichedFees: EcoTrackFeesWilaya[] = (Array.isArray(json.livraison) ? json.livraison : []).map(
          (f: any) => {
            const wId = Number(f.wilaya_id);
            return {
              wilaya_id: wId,
              tarif: String(f.tarif ?? "0"),
              tarif_stopdesk: String(f.tarif_stopdesk ?? "0"),
              tarif_retour: returnMap[wId] !== undefined ? String(returnMap[wId]) : String(f.tarif_retour ?? "0"),
              tarif_pickup: pickupMap[wId] !== undefined ? String(pickupMap[wId]) : "0",
              tarif_echange: echangeMap[wId] !== undefined ? String(echangeMap[wId]) : "0",
            };
          },
        );

        const payload: EcoTrackFeesFullResult = {
          success: true,
          fees: enrichedFees,
          livraison: enrichedFees,
          retour: retourArr,
          pickup: Array.isArray(json.pickup) ? json.pickup : [],
          echange: Array.isArray(json.echange) ? json.echange : [],
          recouvrement: Array.isArray(json.recouvrement) ? json.recouvrement : [],
          returnFeesByWilaya: returnMap,
        };
        setCachedCourierData(cacheKey, payload, CONFIG_CACHE_TTL_MS);
        return payload;
      }
      return { success: false, error: json?.message || "Failed to fetch fees" };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  public async resolveCommuneForWilaya(
    wilayaCode: number,
    rawCommune: string | undefined | null,
  ): Promise<{ resolvedCommune: string; stopDeskStationCode?: string; originalCommune: string }> {
    const original = (rawCommune || "").trim();
    if (!original) {
      return { resolvedCommune: getWilayaCapital69(wilayaCode), originalCommune: original };
    }

    const validCommunes = await this.getCommunes(wilayaCode);

    const exactMatch = validCommunes.find((c) => c.nom.trim().toLowerCase() === original.toLowerCase());
    if (exactMatch) {
      return {
        resolvedCommune: exactMatch.nom,
        stopDeskStationCode: exactMatch.code_postal,
        originalCommune: original,
      };
    }

    const normalizedArabic = original.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
    for (const [arKey, latVal] of Object.entries(ARABIC_TO_LATIN_COMMUNES)) {
      const normKey = arKey.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
      if (normalizedArabic.includes(normKey) || normKey.includes(normalizedArabic)) {
        const dictMatch = validCommunes.find(
          (c) => c.nom.toLowerCase() === latVal.toLowerCase() || c.nom.toLowerCase().includes(latVal.toLowerCase()),
        );
        if (dictMatch) {
          return {
            resolvedCommune: dictMatch.nom,
            stopDeskStationCode: dictMatch.code_postal,
            originalCommune: original,
          };
        }
      }
    }

    const cleanLower = original
      .toLowerCase()
      .replace(/[^a-z0-9]/g, " ")
      .trim();
    const words = cleanLower.split(/\s+/).filter((w) => w.length > 2);
    for (const word of words) {
      const wordMatch = validCommunes.find((c) => c.nom.toLowerCase().includes(word));
      if (wordMatch) {
        return {
          resolvedCommune: wordMatch.nom,
          stopDeskStationCode: wordMatch.code_postal,
          originalCommune: original,
        };
      }
    }

    const capitalName = getWilayaCapital69(wilayaCode);
    const capitalMatch = validCommunes.find(
      (c) =>
        c.nom.toLowerCase().includes(capitalName.toLowerCase()) ||
        capitalName.toLowerCase().includes(c.nom.toLowerCase()),
    );
    if (capitalMatch) {
      return {
        resolvedCommune: capitalMatch.nom,
        stopDeskStationCode: capitalMatch.code_postal,
        originalCommune: original,
      };
    }

    if (validCommunes.length > 0 && validCommunes[0].nom) {
      return {
        resolvedCommune: validCommunes[0].nom,
        stopDeskStationCode: validCommunes[0].code_postal,
        originalCommune: original,
      };
    }

    return { resolvedCommune: capitalName, originalCommune: original };
  }

  // ── 3. COMMANDES ───────────────────────────────────────────────────────────

  private buildOrderQueryParams(
    payload: EcoTrackOrderPayload,
    servedWilayaIds?: number[],
  ): {
    params: URLSearchParams;
    routedViaMotherWilaya: boolean;
    effectiveWilayaCode: number;
  } {
    const resolved = resolveCarrierWilayaCode(payload.code_wilaya || 16, servedWilayaIds);
    const effectiveWilaya = resolved.carrierWilayaCode;
    const params = new URLSearchParams();

    params.set("nom_client", (payload.nom_client || "Client").trim().slice(0, 255));
    params.set("telephone", cleanAlgerianPhone(payload.telephone));
    if (payload.telephone_2) {
      params.set("telephone_2", cleanAlgerianPhone(payload.telephone_2));
    }

    const addressPrefix = resolved.routedViaMotherWilaya ? `[ولاية ${payload.code_wilaya}] ` : "";
    params.set("adresse", `${addressPrefix}${payload.adresse || "Centre Ville"}`.trim().slice(0, 255));
    params.set("commune", (payload.commune || "Centre").trim().slice(0, 255));
    params.set("code_wilaya", String(effectiveWilaya));
    params.set("montant", String(Math.max(0, Math.round(payload.montant))));
    params.set("type", String(payload.type ?? 1));
    params.set("stop_desk", String(resolved.routedViaMotherWilaya ? 0 : payload.stop_desk === 1 ? 1 : 0));

    if (payload.reference) params.set("reference", payload.reference.slice(0, 255));
    if (payload.code_postal && !resolved.routedViaMotherWilaya) params.set("code_postal", String(payload.code_postal));
    if (payload.produit) params.set("produit", payload.produit.slice(0, 255));
    if (payload.produit_a_recuperer) params.set("produit_a_recuperer", payload.produit_a_recuperer.slice(0, 255));
    if (payload.remarque) params.set("remarque", payload.remarque.slice(0, 255));
    if (payload.stock !== undefined) params.set("stock", String(payload.stock ? 1 : 0));
    if (payload.quantite !== undefined) params.set("quantite", String(Math.max(1, Math.round(payload.quantite))));
    if (payload.weight !== undefined) params.set("weight", String(payload.weight));
    if (payload.fragile !== undefined) params.set("fragile", String(payload.fragile ? 1 : 0));
    if (payload.gps_link) params.set("gps_link", payload.gps_link.slice(0, 255));
    params.set("boutique", (payload.boutique || "ORVA Store").slice(0, 255));

    return {
      params,
      routedViaMotherWilaya: resolved.routedViaMotherWilaya,
      effectiveWilayaCode: effectiveWilaya,
    };
  }

  /**
   * POST /api/v1/create/order
   * Invariant (Requirement B): Never auto-calls validOrder().
   */
  public async createOrder(
    payload: EcoTrackOrderPayload,
    servedWilayaIds?: number[],
  ): Promise<EcoTrackCreateOrderResult> {
    const { params, routedViaMotherWilaya, effectiveWilayaCode } = this.buildOrderQueryParams(payload, servedWilayaIds);
    const endpoint = `${this.baseUrl}/api/v1/create/order?${params.toString()}`;

    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "POST /api/v1/create/order",
        init: { method: "POST", headers: this.authHeaders() },
      });

      if (res.status === 429) {
        return {
          success: false,
          tracking: "",
          error: "تجاوز حد الطلبات المسموح (Rate Limit: 50 req/min). يرجى الانتظار دقيقة والمحاولة مجدداً.",
        };
      }

      const data = await res.json().catch(() => null);
      if (res.status === 422) {
        const errorDetails = data?.errors
          ? Object.values(data.errors).flat().join(" | ")
          : data?.message || "بيانات الشحنة غير صالحة لدى شركة التوصيل";
        return {
          success: false,
          tracking: "",
          error: errorDetails,
          errorCode: data?.error,
          raw: data,
        };
      }

      if (data?.success && data?.tracking) {
        return {
          success: true,
          tracking: String(data.tracking),
          routedViaMotherWilaya,
          effectiveWilayaCode,
          raw: data,
        };
      }

      return {
        success: false,
        tracking: "",
        error: data?.message || "تعذر إنشاء الشحنة لدى شركة التوصيل",
        errorCode: data?.error,
        raw: data,
      };
    } catch (err: any) {
      return {
        success: false,
        tracking: "",
        error: err?.message || "فشل الاتصال بخادم شركة التوصيل",
      };
    }
  }

  /**
   * POST /api/v1/create/orders
   * Expects `{ orders: { "0": {...}, "1": {...} } }` (index-keyed object, max 100/chunk).
   * Falls back sequentially to createOrder() if bulk endpoint returns HTTP 500 or malformed body.
   */
  public async createOrdersBulk(
    payloads: EcoTrackOrderPayload[],
    servedWilayaIds?: number[],
  ): Promise<{
    success: boolean;
    results: Array<{ index: number; reference?: string; success: boolean; tracking?: string; error?: string }>;
  }> {
    const allResults: Array<{
      index: number;
      reference?: string;
      success: boolean;
      tracking?: string;
      error?: string;
    }> = [];

    for (let offset = 0; offset < payloads.length; offset += 100) {
      const chunk = payloads.slice(offset, offset + 100);
      const indexedBody: Record<string, Record<string, string | number>> = {};

      chunk.forEach((p, idx) => {
        const { params } = this.buildOrderQueryParams(p, servedWilayaIds);
        const obj: Record<string, string | number> = {};
        params.forEach((v, k) => {
          if (
            k === "code_wilaya" ||
            k === "montant" ||
            k === "type" ||
            k === "stop_desk" ||
            k === "stock" ||
            k === "quantite"
          ) {
            obj[k] = Number(v);
          } else {
            obj[k] = v;
          }
        });
        indexedBody[String(idx)] = obj;
      });

      let usedSequentialFallback = false;
      try {
        const res = await throttledCourierFetch({
          courierId: this.courierId,
          url: `${this.baseUrl}/api/v1/create/orders`,
          endpointLabel: "POST /api/v1/create/orders",
          init: {
            method: "POST",
            headers: this.authHeaders(true),
            body: JSON.stringify({ orders: indexedBody }),
          },
        });

        const json = await res.json().catch(() => null);
        if (res.status >= 500 || !json || (!json.results && !json.success && !Array.isArray(json))) {
          usedSequentialFallback = true;
        } else {
          const mapResults = json.results || json.orders || json.data || json;
          chunk.forEach((item, idx) => {
            const entry =
              mapResults?.[String(idx)] ??
              (Array.isArray(mapResults) ? mapResults[idx] : undefined) ??
              (!mapResults?.["0"] ? mapResults?.[String(idx + 1)] : undefined);
            if (entry?.success && entry?.tracking) {
              allResults.push({
                index: offset + idx,
                reference: item.reference,
                success: true,
                tracking: String(entry.tracking),
              });
            } else {
              allResults.push({
                index: offset + idx,
                reference: item.reference,
                success: false,
                error: entry?.message || entry?.error || json?.message || "Bulk creation failed for item",
              });
            }
          });
        }
      } catch {
        usedSequentialFallback = true;
      }

      if (usedSequentialFallback) {
        for (let idx = 0; idx < chunk.length; idx += 1) {
          const single = await this.createOrder(chunk[idx], servedWilayaIds);
          allResults.push({
            index: offset + idx,
            reference: chunk[idx].reference,
            success: single.success,
            tracking: single.tracking || undefined,
            error: single.error,
          });
        }
      }
    }

    return {
      success: allResults.some((r) => r.success),
      results: allResults,
    };
  }

  /**
   * POST /api/v1/update/order
   * Pre-validation only. Uses EcoTrack's exact update parameter names (`client`, `tel`, `tel2`, `wilaya`, `product`).
   */
  public async updateOrder(
    tracking: string,
    patch: EcoTrackUpdateOrderPayload,
  ): Promise<{ success: boolean; message?: string; error?: string; errorCode?: number }> {
    const params = new URLSearchParams();
    params.set("tracking", tracking.trim());
    if (patch.client !== undefined) params.set("client", patch.client.trim().slice(0, 255));
    if (patch.tel !== undefined) params.set("tel", cleanAlgerianPhone(patch.tel));
    if (patch.tel2 !== undefined) params.set("tel2", cleanAlgerianPhone(patch.tel2));
    if (patch.adresse !== undefined) params.set("adresse", patch.adresse.trim().slice(0, 255));
    if (patch.commune !== undefined) params.set("commune", patch.commune.trim().slice(0, 255));
    if (patch.wilaya !== undefined) {
      const resolved = resolveCarrierWilayaCode(patch.wilaya);
      params.set("wilaya", String(resolved.carrierWilayaCode));
    }
    if (patch.montant !== undefined) params.set("montant", String(Math.max(0, Math.round(patch.montant))));
    if (patch.remarque !== undefined) params.set("remarque", patch.remarque.slice(0, 255));
    if (patch.product !== undefined) params.set("product", patch.product.slice(0, 255));
    if (patch.type !== undefined) params.set("type", String(patch.type));
    if (patch.stop_desk !== undefined) params.set("stop_desk", String(patch.stop_desk ? 1 : 0));
    if (patch.code_postal !== undefined) params.set("code_postal", String(patch.code_postal));
    if (patch.weight !== undefined) params.set("weight", String(patch.weight));
    if (patch.fragile !== undefined) params.set("fragile", String(patch.fragile ? 1 : 0));
    if (patch.gps_link !== undefined) params.set("gps_link", patch.gps_link.slice(0, 255));

    const endpoint = `${this.baseUrl}/api/v1/update/order?${params.toString()}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "POST /api/v1/update/order",
        init: { method: "POST", headers: this.authHeaders() },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        return { success: true, message: data.message || "Order updated" };
      }
      const code = Number(data?.error || 0) || undefined;
      const errMsg =
        code === 10001
          ? "لا يمكن تعديل الطلبية بعد اعتمادها/تأكيدها لدى الناقل (كود 10001) — استخدم إرسال ملاحظة MAJ بدلاً من ذلك."
          : data?.message || `HTTP ${res.status}: ${res.statusText}`;
      return { success: false, error: errMsg, errorCode: code };
    } catch (err: any) {
      return { success: false, error: err?.message || "Network error updating parcel" };
    }
  }

  /**
   * POST /api/v1/valid/order?tracking=...&ask_collection=0|1
   */
  public async validOrder(tracking: string, askCollection = 0): Promise<EcoTrackValidOrderResult> {
    const params = new URLSearchParams();
    params.set("tracking", tracking.trim());
    params.set("ask_collection", String(askCollection));

    const endpoint = `${this.baseUrl}/api/v1/valid/order?${params.toString()}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "POST /api/v1/valid/order",
        init: { method: "POST", headers: this.authHeaders() },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        return { success: true, message: data.message || "Commande validée avec succès" };
      }
      return { success: false, error: data?.message || `HTTP ${res.status}: ${res.statusText}` };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to validate parcel" };
    }
  }

  /**
   * DELETE /api/v1/delete/order?tracking=...
   */
  public async deleteOrder(tracking: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/delete/order?tracking=${encodeURIComponent(tracking.trim())}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "DELETE /api/v1/delete/order",
        init: { method: "DELETE", headers: this.authHeaders() },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && (data?.delete === "success" || data?.success)) {
        return { success: true, message: "Commande supprimée avec succès" };
      }
      const failMsg =
        data?.delete === "fail"
          ? "الطرد معتمد أو قيد المعالجة لدى شركة التوصيل ولا يمكن حذفه مباشرة"
          : data?.message || `HTTP ${res.status}: ${res.statusText}`;
      return { success: false, error: failMsg };
    } catch (err: any) {
      return { success: false, error: err?.message || "Network error deleting parcel" };
    }
  }

  /**
   * POST /api/v1/ask/for/order/return?tracking=...
   */
  public async askOrderReturn(
    tracking: string,
  ): Promise<{ success: boolean; message?: string; error?: string; errorCode?: number }> {
    const endpoint = `${this.baseUrl}/api/v1/ask/for/order/return?tracking=${encodeURIComponent(tracking.trim())}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "POST /api/v1/ask/for/order/return",
        init: { method: "POST", headers: this.authHeaders() },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        return { success: true, message: data.message || "Return requested" };
      }
      const code = Number(data?.error || 0) || undefined;
      return {
        success: false,
        error:
          code === 10003
            ? "لا يسمح نظام شركة التوصيل بطلب إرجاع لهذه الشحنة في مرحلتها الحالية (كود 10003)"
            : data?.message || `HTTP ${res.status}`,
        errorCode: code,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to request return" };
    }
  }

  /**
   * POST /api/v1/valid/returns?tracking=...
   */
  public async validReturns(tracking: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/valid/returns?tracking=${encodeURIComponent(tracking.trim())}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "POST /api/v1/valid/returns",
        init: { method: "POST", headers: this.authHeaders() },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        return { success: true, message: data.message || "Return validated" };
      }
      return { success: false, error: data?.message || `HTTP ${res.status}` };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to confirm return receipt" };
    }
  }

  /**
   * POST /api/v1/add/maj?tracking=...&content=...
   * Adds an immediate update/switch remark (≤255 chars) visible to courier staff & drivers.
   */
  public async addRemark(
    tracking: string,
    content: string,
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanTracking = tracking.trim();
    const cleanContent = content.trim().slice(0, 240);
    if (!cleanTracking || !cleanContent) {
      return { success: false, error: "رقم التتبع ونص الملاحظة مطلوبان" };
    }

    const params = new URLSearchParams();
    params.set("tracking", cleanTracking);
    params.set("content", cleanContent);

    const endpoint = `${this.baseUrl}/api/v1/add/maj?${params.toString()}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "POST /api/v1/add/maj",
        init: { method: "POST", headers: this.authHeaders() },
      });
      const data = await res.json().catch(() => null);
      if (res.ok && (data?.success || res.status === 200)) {
        invalidateCourierCache(`${this.courierId}:remarks:${cleanTracking}`);
        return { success: true, message: data?.message || "تم إرسال الملاحظة إلى شركة التوصيل بنجاح" };
      }
      return { success: false, error: data?.message || `HTTP ${res.status}: ${res.statusText}` };
    } catch (err: any) {
      return { success: false, error: err?.message || "فشل إرسال الملاحظة لشركة التوصيل" };
    }
  }

  /**
   * GET /api/v1/get/maj?tracking=...
   * Returns driver, station, and seller remarks chronology.
   */
  public async getRemarks(
    tracking: string,
  ): Promise<{ success: boolean; remarks: CourierRemarkItem[]; error?: string }> {
    const cleanTracking = tracking.trim();
    const endpoint = `${this.baseUrl}/api/v1/get/maj?tracking=${encodeURIComponent(cleanTracking)}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/maj",
        init: { method: "GET", headers: this.authHeaders() },
      });
      if (!res.ok) {
        return { success: false, remarks: [], error: `HTTP ${res.status}` };
      }
      const json = await res.json().catch(() => []);
      const arr: any[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.remarks)
            ? json.remarks
            : [];

      const remarks: CourierRemarkItem[] = arr
        .map((r) => {
          const driver = r.livreur || r.driver || undefined;
          const station = r.station || undefined;
          const authorRole: CourierRemarkItem["authorRole"] = driver ? "driver" : station ? "station" : "seller";
          return {
            remarque: String(r.remarque || r.content || r.comment || ""),
            station,
            livreur: driver,
            createdAt: r.created_at || r.date || undefined,
            authorRole,
          };
        })
        .filter((r) => r.remarque.trim().length > 0);

      return { success: true, remarks };
    } catch (err: any) {
      return { success: false, remarks: [], error: err?.message || "Failed to fetch remarks" };
    }
  }

  // ── 4. SUIVI DES COMMANDES ─────────────────────────────────────────────────

  /**
   * GET /api/v1/get/orders?page=&start_date=&end_date=&tracking=
   */
  public async getOrders(params?: { page?: number; startDate?: string; endDate?: string; tracking?: string }): Promise<{
    success: boolean;
    orders: CourierExternalOrder[];
    currentPage: number;
    lastPage: number;
    total: number;
    error?: string;
  }> {
    const qs = new URLSearchParams();
    qs.set("page", String(params?.page ?? 1));
    if (params?.startDate) qs.set("start_date", params.startDate);
    if (params?.endDate) qs.set("end_date", params.endDate);
    if (params?.tracking) qs.set("tracking", params.tracking.trim());

    const endpoint = `${this.baseUrl}/api/v1/get/orders?${qs.toString()}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/orders",
        init: { method: "GET", headers: this.authHeaders() },
      });
      if (!res.ok) {
        return { success: false, orders: [], currentPage: 1, lastPage: 1, total: 0, error: `HTTP ${res.status}` };
      }
      const json = await res.json().catch(() => null);
      const rawRows: any[] = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];

      const orders: CourierExternalOrder[] = rawRows.map((r) => {
        const rawRemarks = Array.isArray(r.status_reason) ? r.status_reason : [];
        const remarks: CourierRemarkItem[] = rawRemarks
          .map((item: any) => {
            const text = String(item?.remarque || item?.comment || item?.details || "").trim();
            const driver = item?.livreur ? String(item.livreur) : undefined;
            const station = item?.station ? String(item.station) : undefined;
            return {
              remarque: text,
              livreur: driver,
              station,
              createdAt: item?.created_at || undefined,
              authorRole: (driver ? "driver" : station ? "station" : "seller") as CourierRemarkItem["authorRole"],
            };
          })
          .filter((item: CourierRemarkItem) => item.remarque.length > 0);
        const remarksSummary = remarks
          .map((m) => (m.livreur ? `${m.livreur}: ${m.remarque}` : m.remarque))
          .join(" | ");

        return {
          tracking: String(r.tracking || r.code_tracking || ""),
          reference: String(r.reference || ""),
          boutique: r.boutique ? String(r.boutique) : undefined,
          client: String(r.client || r.nom_client || ""),
          phone: String(r.phone || r.telephone || ""),
          phone2: r.phone_2 || r.telephone_2 ? String(r.phone_2 || r.telephone_2) : undefined,
          address: r.adresse ? String(r.adresse) : undefined,
          commune: r.commune ? String(r.commune) : undefined,
          wilayaId: r.wilaya_id ? Number(r.wilaya_id) : undefined,
          montant: Number(r.montant || 0),
          status: String(r.status || r.global_status || ""),
          financialStatus: r.payment_status ? String(r.payment_status) : undefined,
          deliveryFee: r.tarif_prestation !== undefined ? Number(r.tarif_prestation) : undefined,
          returnFee: r.tarif_retour !== undefined ? Number(r.tarif_retour) : undefined,
          stopDesk: Number(r.stop_desk ?? 0) === 1,
          driverName: r.livreur || r.driver ? String(r.livreur || r.driver) : undefined,
          driverPhone: r.driver_phone ? String(r.driver_phone) : undefined,
          remarks: remarks.length > 0 ? remarks : undefined,
          remarksSummary: remarksSummary || undefined,
          createdAt: r.created_at ? String(r.created_at) : undefined,
          updatedAt: r.updated_at ? String(r.updated_at) : undefined,
          lastUpdatedAt: r.last_updated_at ? String(r.last_updated_at) : r.updated_at ? String(r.updated_at) : undefined,
          raw: r,
        };
      });

      return {
        success: true,
        orders,
        currentPage: Number(json?.current_page ?? params?.page ?? 1),
        lastPage: Number(json?.last_page ?? 1),
        total: Number(json?.total ?? orders.length),
      };
    } catch (err: any) {
      return {
        success: false,
        orders: [],
        currentPage: 1,
        lastPage: 1,
        total: 0,
        error: err?.message || "Error fetching courier orders",
      };
    }
  }

  public async getAllOrdersPaginated(params?: {
    startDate?: string;
    endDate?: string;
    maxPages?: number;
    enrichStatuses?: boolean;
  }): Promise<{ success: boolean; orders: CourierExternalOrder[]; error?: string }> {
    const maxPages = Math.min(50, Math.max(1, params?.maxPages ?? 15));
    const all: CourierExternalOrder[] = [];

    for (let page = 1; page <= maxPages; page += 1) {
      const res = await this.getOrders({
        page,
        startDate: params?.startDate,
        endDate: params?.endDate,
      });
      if (!res.success) {
        if (all.length > 0) break;
        return { success: false, orders: [], error: res.error };
      }
      all.push(...res.orders);
      if (page >= res.lastPage || res.orders.length === 0) break;
    }

    if (params?.enrichStatuses !== false && all.length > 0) {
      const trackings = all.map((o) => o.tracking).filter(Boolean);
      if (trackings.length > 0) {
        const bulkRes = await this.getBulkOrdersStatus(trackings, "all");
        if (bulkRes.success && bulkRes.data) {
          for (const order of all) {
            const detail = bulkRes.data[order.tracking];
            if (!detail || typeof detail !== "object") continue;

            const rawActs = Array.isArray(detail.activity) ? detail.activity : [];
            const lastAct = rawActs[rawActs.length - 1];
            const detailedStatus = String(
              lastAct?.status || detail.last_status || detail.status || "",
            ).trim();
            if (detailedStatus && detailedStatus.toLowerCase() !== "en_process") {
              order.status = detailedStatus;
            }
            if (detail.driver_phone && !order.driverPhone) {
              order.driverPhone = String(detail.driver_phone);
            }
            const foundDriver = [...rawActs].reverse().find((a: any) => a?.driver)?.driver;
            if (foundDriver && !order.driverName) {
              order.driverName = String(foundDriver);
            }
            if (lastAct?.station && !order.currentStation) {
              order.currentStation = String(lastAct.station);
            }
            if (rawActs.length > 0) {
              order.activity = rawActs.map((a: any) => ({
                date: String(a.date || ""),
                time: String(a.time || ""),
                status: String(a.status || ""),
                statusAr: ECOTRACK_STATUS_MAP_AR[String(a.status || "")]?.label || a.details || a.status,
                station: a.station ? String(a.station) : undefined,
                driver: a.driver ? String(a.driver) : undefined,
                details: a.details ? String(a.details) : undefined,
                reason: a.reason ? String(a.reason) : undefined,
              }));
            }
            if (detail.desk_phone || detail.desk_address || detail.desk_commune || detail.desk_map_link) {
              order.deskInfo = {
                deskPhone: detail.desk_phone ? String(detail.desk_phone) : undefined,
                deskCommune: detail.desk_commune ? String(detail.desk_commune) : undefined,
                deskAddress: detail.desk_address ? String(detail.desk_address) : undefined,
                deskMapLink: detail.desk_map_link ? String(detail.desk_map_link) : undefined,
              };
            }
          }
        }
      }
    }

    return { success: true, orders: all };
  }

  /**
   * GET /api/v1/get/orders/status?api_token=...&trackings=...&status=all
   * Returns driver_phone, desk_phone, desk_commune, desk_address, desk_map_link & activity[].
   */
  public async getBulkOrdersStatus(
    trackings: string[],
    statusFilter = "all",
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    if (!trackings.length) return { success: true, data: {} };

    const merged: Record<string, any> = {};
    for (let offset = 0; offset < trackings.length; offset += 100) {
      const chunk = trackings
        .slice(offset, offset + 100)
        .map((t) => t.trim())
        .filter(Boolean);
      if (!chunk.length) continue;

      const params = new URLSearchParams();
      params.set("api_token", this.token);
      params.set("trackings", chunk.join(","));
      params.set("status", statusFilter);

      const endpoint = `${this.baseUrl}/api/v1/get/orders/status?${params.toString()}`;
      try {
        const res = await throttledCourierFetch({
          courierId: this.courierId,
          url: endpoint,
          endpointLabel: "GET /api/v1/get/orders/status",
          init: {
            method: "GET",
            headers: { Accept: "application/json", "User-Agent": "ORVA-Store-Client/2.0" },
          },
        });
        if (!res.ok) {
          if (Object.keys(merged).length === 0) {
            return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
          }
          continue;
        }
        const json = await res.json().catch(() => null);
        if (json?.data && typeof json.data === "object") {
          Object.assign(merged, json.data);
        }
      } catch (err: any) {
        if (Object.keys(merged).length === 0) {
          return { success: false, error: err?.message || "Error fetching bulk statuses" };
        }
      }
    }

    return { success: true, data: merged };
  }

  /**
   * GET /api/v1/get/trackings/info?trackings=...
   * Keyed strictly by tracking identifier to avoid out-of-order pitfalls.
   */
  public async getTrackingsBulk(
    trackings: string[],
  ): Promise<{ success: boolean; itemsByTracking: Record<string, any>; error?: string }> {
    if (!trackings.length) return { success: true, itemsByTracking: {} };
    const itemsByTracking: Record<string, any> = {};

    for (let offset = 0; offset < trackings.length; offset += 100) {
      const chunk = trackings
        .slice(offset, offset + 100)
        .map((t) => t.trim())
        .filter(Boolean);
      const endpoint = `${this.baseUrl}/api/v1/get/trackings/info?trackings=${encodeURIComponent(chunk.join(","))}`;
      try {
        const res = await throttledCourierFetch({
          courierId: this.courierId,
          url: endpoint,
          endpointLabel: "GET /api/v1/get/trackings/info",
          init: { method: "GET", headers: this.authHeaders() },
        });
        if (!res.ok) continue;
        const json = await res.json().catch(() => null);
        if (Array.isArray(json)) {
          for (const item of json) {
            const key = String(item?.tracking || "");
            if (key) itemsByTracking[key] = item;
          }
        } else if (json && typeof json === "object") {
          for (const [k, v] of Object.entries(json)) {
            const entry = v as any;
            const key = String(entry?.tracking || k);
            if (key) itemsByTracking[key] = entry;
          }
        }
      } catch {
        // Continue remaining chunks
      }
    }

    return { success: true, itemsByTracking };
  }

  /**
   * GET /api/v1/get/tracking/info?tracking=...
   * Enriches with driver phone, desk info (phone/address/map), and MAJ remarks when enabled.
   */
  public async getTrackingInfo(tracking: string, includeEnrichment = false): Promise<EcoTrackTrackingInfo> {
    const cleanTracking = tracking.trim();
    const endpoint = `${this.baseUrl}/api/v1/get/tracking/info?tracking=${encodeURIComponent(cleanTracking)}`;

    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/tracking/info",
        init: { method: "GET", headers: this.authHeaders() },
      });

      if (!res.ok) {
        return {
          success: false,
          tracking: cleanTracking,
          activity: [],
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const data = await res.json().catch(() => null);
      if (!data) {
        return { success: false, tracking: cleanTracking, activity: [], error: "Invalid response from courier" };
      }

      const rawActivities = Array.isArray(data.activity) ? data.activity : [];
      const activities: EcoTrackActivityItem[] = rawActivities.map((item: any) => {
        const rawStatus = String(item.status || "");
        const meta = ECOTRACK_STATUS_MAP_AR[rawStatus];
        return {
          date: item.date || "",
          time: item.time || "",
          status: rawStatus,
          statusAr: meta?.label || item.details || rawStatus,
          station: item.station || "",
          scanLocation: item.scanLocation || "",
          details: item.details || "",
          reason: item.reason || "",
          driver: item.driver || "",
          postponed_to: item.postponed_to || "",
        };
      });

      const latestActivity = activities[activities.length - 1];
      let currentStatusCode = latestActivity?.status || (data.status ? String(data.status) : "prete_a_expedier");
      let driverName =
        [...activities].reverse().find((a) => a.driver)?.driver ||
        (data.driver_name ? String(data.driver_name) : undefined);
      let driverPhone: string | undefined = data.driver_phone ? String(data.driver_phone) : undefined;
      const rawDesk = data.desk_info && typeof data.desk_info === "object" ? data.desk_info : data;
      let deskInfo: CourierDeskInfo | undefined =
        rawDesk?.phone ||
        rawDesk?.desk_phone ||
        rawDesk?.address ||
        rawDesk?.desk_address ||
        rawDesk?.map_link ||
        rawDesk?.desk_map_link ||
        rawDesk?.commune ||
        rawDesk?.desk_commune
          ? {
              deskPhone: rawDesk.desk_phone || rawDesk.phone ? String(rawDesk.desk_phone || rawDesk.phone) : undefined,
              deskCommune:
                rawDesk.desk_commune || rawDesk.commune ? String(rawDesk.desk_commune || rawDesk.commune) : undefined,
              deskAddress:
                rawDesk.desk_address || rawDesk.address ? String(rawDesk.desk_address || rawDesk.address) : undefined,
              deskMapLink:
                rawDesk.desk_map_link || rawDesk.map_link
                  ? String(rawDesk.desk_map_link || rawDesk.map_link)
                  : undefined,
            }
          : undefined;
      let remarks: CourierRemarkItem[] | undefined;

      if (includeEnrichment) {
        const [bulkStatusRes, remarksRes] = await Promise.all([
          this.getBulkOrdersStatus([cleanTracking]),
          this.getRemarks(cleanTracking),
        ]);

        const statusEntry = bulkStatusRes.data?.[cleanTracking];
        if (statusEntry) {
          if (statusEntry.status) currentStatusCode = String(statusEntry.status);
          if (statusEntry.driver_phone) driverPhone = String(statusEntry.driver_phone);
          if (!driverName && Array.isArray(statusEntry.activity)) {
            const foundDriver = [...statusEntry.activity].reverse().find((a: any) => a?.driver)?.driver;
            if (foundDriver) driverName = String(foundDriver);
          }
          if (
            statusEntry.desk_phone ||
            statusEntry.desk_address ||
            statusEntry.desk_map_link ||
            statusEntry.desk_commune
          ) {
            deskInfo = {
              deskPhone: statusEntry.desk_phone ? String(statusEntry.desk_phone) : deskInfo?.deskPhone,
              deskCommune: statusEntry.desk_commune ? String(statusEntry.desk_commune) : deskInfo?.deskCommune,
              deskAddress: statusEntry.desk_address ? String(statusEntry.desk_address) : deskInfo?.deskAddress,
              deskMapLink: statusEntry.desk_map_link ? String(statusEntry.desk_map_link) : deskInfo?.deskMapLink,
            };
          }
        }

        if (remarksRes.success) {
          remarks = remarksRes.remarks;
        }
      }

      const statusMeta = ECOTRACK_STATUS_MAP_AR[currentStatusCode];
      return {
        success: true,
        tracking: cleanTracking,
        recipientName: data.recipientName || "",
        shippedBy: data.shippedBy || "",
        currentStation: data.currentStation || latestActivity?.station || "",
        status: currentStatusCode,
        statusAr: statusMeta?.label || currentStatusCode,
        financialStatus:
          ECOTRACK_STATUS_MAP_AR[currentStatusCode]?.stage === "delivered" ? currentStatusCode : undefined,
        originCity: data.originCity,
        destLocationCity: data.destLocationCity,
        driverName,
        driverPhone,
        deskInfo,
        remarks,
        activity: activities,
        reasons: Array.isArray(data.reasons) ? data.reasons : [],
      };
    } catch (err: any) {
      return {
        success: false,
        tracking: cleanTracking,
        activity: [],
        error: err?.message || "Network error fetching tracking",
      };
    }
  }

  /**
   * GET /api/v1/get/order/label?tracking=...
   */
  public async fetchLabelPdf(tracking: string): Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/get/order/label?tracking=${encodeURIComponent(tracking.trim())}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/order/label",
        init: {
          method: "GET",
          headers: { Authorization: `Bearer ${this.token}`, "User-Agent": "ORVA-Store-Client/2.0" },
        },
      });
      if (!res.ok) return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      const buffer = await res.arrayBuffer();
      return { success: true, buffer };
    } catch (err: any) {
      return { success: false, error: err?.message || "Error fetching PDF label" };
    }
  }

  // ── 6. PRODUITS ────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/get/products/list?page=...
   */
  public async getProducts(
    page = 1,
    forceRefresh = false,
  ): Promise<{ success: boolean; products?: EcoTrackProductItem[]; pagination?: any; error?: string }> {
    const cacheKey = `${this.courierId}:products:${this.baseUrl}:p${page}`;
    if (!forceRefresh) {
      const cached = getCachedCourierData<{ products: EcoTrackProductItem[]; pagination?: any }>(cacheKey);
      if (cached) return { success: true, ...cached };
    }

    const endpoint = `${this.baseUrl}/api/v1/get/products/list?page=${page}`;
    try {
      const res = await throttledCourierFetch({
        courierId: this.courierId,
        url: endpoint,
        endpointLabel: "GET /api/v1/get/products/list",
        init: { method: "GET", headers: this.authHeaders() },
      });
      const json = await res.json().catch(() => null);
      const rawProducts = Array.isArray(json?.products) ? json.products : Array.isArray(json?.data) ? json.data : null;
      if (res.ok && rawProducts) {
        const pagination = json.pagination ?? {
          current_page: json.current_page,
          last_page: json.last_page,
          total: json.total,
        };
        setCachedCourierData(cacheKey, { products: rawProducts, pagination }, 15 * 60 * 1000);
        return { success: true, products: rawProducts, pagination };
      }
      return { success: false, error: json?.message || "Failed to fetch products" };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  public async getAllProducts(
    forceRefresh = false,
  ): Promise<{ success: boolean; products: EcoTrackProductItem[]; error?: string }> {
    const all: EcoTrackProductItem[] = [];
    for (let page = 1; page <= 20; page += 1) {
      const res = await this.getProducts(page, forceRefresh);
      if (!res.success) {
        if (all.length > 0) return { success: true, products: all };
        return { success: false, products: [], error: res.error };
      }
      const list = res.products || [];
      all.push(...list);
      const lastPage = Number(res.pagination?.last_page ?? res.pagination?.total_pages ?? 1);
      if (page >= lastPage || list.length === 0) break;
    }
    return { success: true, products: all };
  }
}

let defaultEcoTrackClient: EcoTrackClient | null = null;

export function getEcoTrackClient(options?: { courierId?: string; baseUrl?: string; token?: string }): EcoTrackClient {
  if (options?.courierId || options?.baseUrl || options?.token) {
    return new EcoTrackClient(options);
  }
  if (!defaultEcoTrackClient) {
    defaultEcoTrackClient = new EcoTrackClient();
  }
  return defaultEcoTrackClient;
}
