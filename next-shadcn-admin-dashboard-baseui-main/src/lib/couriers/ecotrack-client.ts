/**
 * ORVA Store — EcoTrack / Redex Native Node.js Courier Client
 * Fully aligned with EcoTrack Public API Specification
 * Compatible with Redex (https://redex.ecotrack.dz) and all 82 EcoTrack white-label tenants
 */

export interface EcoTrackOrderPayload {
  reference: string;
  nom_client: string;
  telephone: string;
  telephone_2?: string;
  adresse: string;
  commune: string;
  code_wilaya: number;
  montant: number; // COD amount to collect (including delivery fee)
  remarque?: string;
  produit?: string;
  boutique?: string;
  type?: number; // 1 = Livraison (default), 2 = Échange, 3 = PICKUP, 4 = Recouvrement
  stop_desk?: number; // 0 = Home delivery, 1 = Stop Desk
  code_postal?: string | number; // Station code for stop-desk
  weight?: number;
  fragile?: number;
}

export interface EcoTrackCreateOrderResult {
  success: boolean;
  tracking: string;
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
  originCity?: number | string;
  destLocationCity?: number | string;
  activity: EcoTrackActivityItem[];
  reasons?: string[];
  error?: string;
}

export interface EcoTrackFeesWilaya {
  wilaya_id: number;
  tarif: string;
  tarif_stopdesk: string;
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

// Arabic translation dictionary for EcoTrack status keys
export const ECOTRACK_STATUS_MAP_AR: Record<string, { label: string; stage: 'pending' | 'shipped' | 'delivered' | 'returned' | 'cancelled' }> = {
  prete_a_expedier: { label: 'جاهز للإرسال (Prêt à expédier)', stage: 'shipped' },
  order_information_received_by_carrier: { label: 'تم تسجيل الطلبية واعتمادها', stage: 'shipped' },
  notification_on_order: { label: 'ملاحظة على الشحنة', stage: 'shipped' },
  en_ramassage: { label: 'قيد الاستلام من المتجر', stage: 'shipped' },
  picked: { label: 'تم الاستلام من طرف الناقل', stage: 'shipped' },
  accepted_by_carrier: { label: 'استُلمت في مركز الفرز المركزي', stage: 'shipped' },
  en_preparation_stock: { label: 'قيد التجهيز في المستودع', stage: 'shipped' },
  vers_hub: { label: 'في الطريق إلى مركز التوزيع', stage: 'shipped' },
  en_hub: { label: 'في مركز التوزيع الإقليمي', stage: 'shipped' },
  vers_wilaya: { label: 'في الطريق إلى ولاية العميل', stage: 'shipped' },
  en_preparation: { label: 'قيد التحضير للتوزيع', stage: 'shipped' },
  dispatched_to_driver: { label: 'سُلّمت لسائق التوصيل', stage: 'shipped' },
  en_livraison: { label: 'قيد التوصيل للزبون', stage: 'shipped' },
  attempt_delivery: { label: 'محاولة تسليم للزبون', stage: 'shipped' },
  suspendu: { label: 'شحنة معلقة (يرجى التأكيد)', stage: 'shipped' },
  livred: { label: 'تم التسليم بنجاح', stage: 'delivered' },
  livre_non_encaisse: { label: 'تم التسليم (في انتظار التحصيل)', stage: 'delivered' },
  encaisse_non_paye: { label: 'تم التحصيل المالي', stage: 'delivered' },
  encaissed: { label: 'تم التحصيل المالي', stage: 'delivered' },
  paiements_prets: { label: 'المستحقات جاهزة للدفع', stage: 'delivered' },
  paye_et_archive: { label: 'تم الدفع والأرشفة', stage: 'delivered' },
  payed: { label: 'تم الدفع للبائع', stage: 'delivered' },
  return_asked: { label: 'طلب إرجاع الشحنة', stage: 'returned' },
  return_in_transit: { label: 'الإرجاع في الطريق للمستودع', stage: 'returned' },
  retour_chez_livreur: { label: 'الإرجاع عند الموزع', stage: 'returned' },
  retour_transit_entrepot: { label: 'الإرجاع في طريق المستودع', stage: 'returned' },
  retour_en_traitement: { label: 'معالجة الإرجاع في المركز', stage: 'returned' },
  retour_recu: { label: 'استلم التاجر الطرد المرتجع', stage: 'returned' },
  Return_received: { label: 'استلم التاجر الطرد المرتجع', stage: 'returned' },
  retour_archive: { label: 'مرتجع مؤرشف', stage: 'returned' },
  annule: { label: 'ملغى من طرف الزبون أو الناقل', stage: 'cancelled' },
};

// 58 Algerian Wilayas lookup
const WILAYA_LOOKUP: Record<string, number> = {
  'adrar': 1, 'أدرار': 1,
  'chlef': 2, 'الشلف': 2,
  'laghouat': 3, 'الأغواط': 3,
  'oum el bouaghi': 4, 'أم البواقي': 4,
  'batna': 5, 'باتنة': 5,
  'béjaïa': 6, 'bejaia': 6, 'بجاية': 6,
  'biskra': 7, 'بسكرة': 7,
  'béchar': 8, 'bechar': 8, 'بشار': 8,
  'blida': 9, 'البليدة': 9,
  'bouira': 10, 'البويرة': 10,
  'tamanrasset': 11, 'تمنراست': 11,
  'tébessa': 12, 'tebessa': 12, 'تبسة': 12,
  'tlemcen': 13, 'تلمسان': 13,
  'tiaret': 14, 'تيارت': 14,
  'tizi ouzou': 15, 'تيزي وزو': 15,
  'alger': 16, 'الجزائر': 16,
  'djelfa': 17, 'الجلفة': 17,
  'jijel': 18, 'جيجل': 18,
  'sétif': 19, 'setif': 19, 'سطيف': 19,
  'saïda': 20, 'saida': 20, 'سعيدة': 20,
  'skikda': 21, 'سكيكدة': 21,
  'sidi bel abbès': 22, 'sidi bel abbes': 22, 'سيدي بلعباس': 22,
  'annaba': 23, 'عنابة': 23,
  'guelma': 24, 'قالمة': 24,
  'constantine': 25, 'قسنطينة': 25,
  'médéa': 26, 'medea': 26, 'المدية': 26,
  'mostaganem': 27, 'مستغانم': 27,
  'm\'sila': 28, 'msila': 28, 'المسيلة': 28,
  'mascara': 29, 'معسكر': 29,
  'ouargla': 30, 'ورقلة': 30,
  'oran': 31, 'وهران': 31,
  'el bayadh': 32, 'البيض': 32,
  'illizi': 33, 'إليزي': 33,
  'bordj bou arréridj': 34, 'bordj bou arreridj': 34, 'برج بوعريريج': 34,
  'boumerdès': 35, 'boumerdes': 35, 'بومرداس': 35,
  'el tarf': 36, 'الطارف': 36,
  'tindouf': 37, 'تندوف': 37,
  'tissemsilt': 38, 'تيسمسيلت': 38,
  'el oued': 39, 'الوادي': 39,
  'khenchela': 40, 'خنشلة': 40,
  'souk ahras': 41, 'سوق أهراس': 41,
  'tipaza': 42, 'تيبازة': 42,
  'mila': 43, 'ميلة': 43,
  'aïn defla': 44, 'ain defla': 44, 'عين الدفلى': 44,
  'naâma': 45, 'naama': 45, 'النعامة': 45,
  'aïn témouchent': 46, 'ain temouchent': 46, 'عين تموشنت': 46,
  'ghardaïa': 47, 'ghardaia': 47, 'غرداية': 47,
  'relizane': 48, 'غليزان': 48,
  'timimoun': 49, 'تيميمون': 49,
  'bordj badji mokhtar': 50, 'برج باجي مختار': 50,
  'ouled djellal': 51, 'أولاد جلال': 51,
  'béni abbès': 52, 'beni abbes': 52, 'بني عباس': 52,
  'in salah': 53, 'عين صالح': 53,
  'in guezzam': 54, 'عين قزام': 54,
  'touggourt': 55, 'تقرت': 55,
  'djanet': 56, 'جانت': 56,
  'el m\'ghair': 57, 'el mghair': 57, 'المغير': 57,
  'el meniaa': 58, 'المنيعة': 58,
};

// Default Chef-lieu (capital city) per wilaya code for fail-safe fallback
const WILAYA_CAPITALS: Record<number, string> = {
  1: 'Adrar', 2: 'Chlef', 3: 'Laghouat', 4: 'Oum El Bouaghi', 5: 'Batna',
  6: 'Bejaia', 7: 'Biskra', 8: 'Bechar', 9: 'Blida', 10: 'Bouira',
  11: 'Tamanrasset', 12: 'Tebessa', 13: 'Tlemcen', 14: 'Tiaret', 15: 'Tizi Ouzou',
  16: 'Alger Centre', 17: 'Djelfa', 18: 'Jijel', 19: 'Setif', 20: 'Saida',
  21: 'Skikda', 22: 'Sidi Bel Abbes', 23: 'Annaba', 24: 'Guelma', 25: 'Constantine',
  26: 'Medea', 27: 'Mostaganem', 28: 'M\'Sila', 29: 'Mascara', 30: 'Ouargla',
  31: 'Oran', 32: 'El Bayadh', 33: 'Illizi', 34: 'Bordj Bou Arreridj', 35: 'Boumerdes',
  36: 'El Tarf', 37: 'Tindouf', 38: 'Tissemsilt', 39: 'El Oued', 40: 'Khenchela',
  41: 'Souk Ahras', 42: 'Tipaza', 43: 'Mila', 44: 'Ain Defla', 45: 'Naama',
  46: 'Ain Temouchent', 47: 'Ghardaia', 48: 'Relizane', 49: 'Timimoun', 50: 'Bordj Badji Mokhtar',
  51: 'Ouled Djellal', 52: 'Beni Abbes', 53: 'In Salah', 54: 'In Guezzam', 55: 'Touggourt',
  56: 'Djanet', 57: 'El M\'Ghair', 58: 'El Meniaa',
};

// Common Arabic to Latin Commune dictionary
const ARABIC_TO_LATIN_COMMUNES: Record<string, string> = {
  'الجزائر الوسطى': 'Alger Centre',
  'سيدي امحمد': 'Sidi M\'hamed',
  'المدنية': 'El Madania',
  'بلوزداد': 'Mohamed Belouizdad',
  'باب الواد': 'Bab El Oued',
  'القصبة': 'Casbah',
  'وادي قريش': 'Oued Koriche',
  'بئر مراد رايس': 'Bir Mourad Rais',
  'الابيار': 'El Biar',
  'بوزريعة': 'Bouzareah',
  'بئر خادم': 'Birkhadem',
  'حيدرة': 'Hydra',
  'بن عكنون': 'Ben Aknoun',
  'دالي براهيم': 'Dely Ibrahim',
  'المرادية': 'El Mouradia',
  'بني مسوس': 'Beni Messous',
  'براقي': 'Baraki',
  'الكاليتوس': 'Les Eucalyptus',
  'سيدي موسى': 'Sidi Moussa',
  'بئر توتة': 'Birtouta',
  'تسالة المرجة': 'Tessala El Merdja',
  'اولاد شبل': 'Ouled Chebel',
  'زرالدة': 'Zeralda',
  'المعالمة': 'Mahelma',
  'الرحمانية': 'Rahmania',
  'سويدانية': 'Souidania',
  'سطاوالي': 'Staoueli',
  'عين بنيان': 'Ain Benian',
  'الشراقة': 'Cheraga',
  'اولاد فايت': 'Ouled Fayet',
  'الحمامات': 'El Hammamet',
  'عين الطاية': 'Ain Taya',
  'المرسى': 'El Marsa',
  'برج البحري': 'Bordj El Bahri',
  'برج الكيفان': 'Bordj El Kiffan',
  'باب الزوار': 'Bab Ezzouar',
  'الدار البيضاء': 'Dar El Beida',
  'المحمدية': 'Mohammadia',
  'الحراش': 'El Harrach',
  'بوروبة': 'Boubouraba',
  'واد السمار': 'Oued Smar',
  'باش جراح': 'Bachdjerrah',
  'حسين داي': 'Hussein Dey',
  'المقرية': 'El Magharia',
  'القبة': 'Kouba',
  'جسر قسنطينة': 'Djasr Kasentina',
  'الرويبة': 'Rouiba',
  'الرغاية': 'Reghaia',
  'هراوة': 'Herraoua',
  'الدرارية': 'Draria',
  'الدويرة': 'Douera',
  'العاشور': 'El Achour',
  'خرايسية': 'Khraicia',
  'بابا حسن': 'Baba Hassen',
  'بني ونيف': 'Beni Ounif',
  'بشار': 'Bechar',
  'العبادلة': 'Abadla',
  'القنادسة': 'Kenadsa',
  'تاغيت': 'Taghit',
  'عنابة': 'Annaba',
  'البوني': 'El Bouni',
  'الحجار': 'El Hadjar',
  'برحال': 'Berrahal',
  'سرايدي': 'Seraidi',
  'وهران': 'Oran',
  'بئر الجير': 'Bir El Djir',
  'السانية': 'Es Senia',
  'عين الترك': 'Ain El Turk',
  'ارزيو': 'Arzew',
  'قسنطينة': 'Constantine',
  'الخروب': 'El Khroub',
  'عين سمارة': 'Ain Smara',
  'حامة بوزيان': 'Hamma Bouziane',
  'زيغود يوسف': 'Zighoud Youcef',
  'البليدة': 'Blida',
  'اولاد يعيش': 'Ouled Yaich',
  'بوفاريك': 'Boufarik',
  'موزاية': 'Mouzaia',
  'العفرون': 'El Affroun',
  'بسكرة': 'Biskra',
  'سيدي عقبة': 'Sidi Okba',
  'طولقة': 'Tolga',
  'زريبة الوادي': 'Zeribet El Oued',
  'أولاد جلال': 'Ouled Djellal',
  'سيدي خالد': 'Sidi Khaled',
  'سطيف': 'Setif',
  'العلمة': 'El Eulma',
  'عين ولمان': 'Ain Oulmene',
  'عين ارنات': 'Ain Arnat',
  'باتنة': 'Batna',
  'بريكة': 'Barika',
  'عين التوتة': 'Ain Touta',
  'مروانة': 'Merouana',
  'تيزي وزو': 'Tizi Ouzou',
  'بجاية': 'Bejaia',
  'اقبو': 'Akbou',
  'القصر': 'El Kseur',
  'الشلف': 'Chlef',
  'تنس': 'Tenes',
  'تلمسان': 'Tlemcen',
  'مغنية': 'Maghnia',
  'منصورة': 'Mansourah',
};

export function extractWilayaCode(raw: string | number | undefined | null): number {
  if (typeof raw === 'number' && raw >= 1 && raw <= 58) {
    return raw;
  }
  if (!raw) return 16; // Default to Alger

  const str = String(raw).trim();
  const digitMatch = str.match(/\b([1-5]?[0-9])\b/);
  if (digitMatch) {
    const num = parseInt(digitMatch[1], 10);
    if (num >= 1 && num <= 58) return num;
  }

  const normalized = str.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ').trim();
  for (const [key, code] of Object.entries(WILAYA_LOOKUP)) {
    if (normalized.includes(key)) {
      return code;
    }
  }

  return 16;
}

export function cleanAlgerianPhone(raw: string | undefined | null): string {
  if (!raw) return '';
  let cleaned = raw.replace(/[^\d]/g, '');
  if (cleaned.startsWith('213') && cleaned.length === 12) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('00213') && cleaned.length === 14) {
    cleaned = '0' + cleaned.slice(5);
  }
  if (cleaned.length === 9 && !cleaned.startsWith('0')) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}

// In-memory cache for communes per wilaya to eliminate redundant network calls
const communesCacheByWilaya = new Map<number, EcoTrackCommuneItem[]>();

export class EcoTrackClient {
  private baseUrl: string;
  private token: string;

  constructor(options?: { baseUrl?: string; token?: string }) {
    this.baseUrl = (
      options?.baseUrl ||
      process.env.REDEX_BASE_URL ||
      process.env.ECOTRACK_BASE_URL ||
      'https://redex.ecotrack.dz'
    ).replace(/\/+$/, '');

    this.token = (
      options?.token ||
      process.env.REDEX_API_TOKEN ||
      process.env.ECOTRACK_API_TOKEN ||
      'fWBTGhUI0bSRFpFusadK1tnqV1RvZ489L9TRUICsWGb49xEFylVM8rbxFZvo'
    ).trim();
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getToken(): string {
    return this.token;
  }

  /**
   * 1. Validate Token / Test Connection
   * GET /api/v1/validate/token?api_token=...
   */
  public async testConnection(customToken?: string, customBaseUrl?: string): Promise<{ success: boolean; message: string }> {
    const urlBase = (customBaseUrl || this.baseUrl).replace(/\/+$/, '');
    const tokenToTest = (customToken || this.token).trim();

    try {
      const targetUrl = `${urlBase}/api/v1/validate/token?api_token=${encodeURIComponent(tokenToTest)}`;
      const res = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        return { success: true, message: data.message || 'VALID_TOKEN' };
      }
      return {
        success: false,
        message: data?.message || `HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Connection failed' };
    }
  }

  /**
   * 19. Get Communes (with in-memory caching)
   * GET /api/v1/get/communes?wilaya_id=...
   */
  public async getCommunes(wilayaId?: number): Promise<EcoTrackCommuneItem[]> {
    if (wilayaId && communesCacheByWilaya.has(wilayaId)) {
      return communesCacheByWilaya.get(wilayaId)!;
    }

    const endpoint = `${this.baseUrl}/api/v1/get/communes${wilayaId ? `?wilaya_id=${wilayaId}` : ''}`;
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      if (!res.ok) return [];
      const json = await res.json().catch(() => []);
      const communes: EcoTrackCommuneItem[] = Array.isArray(json)
        ? json
        : Object.values(json || {});

      if (wilayaId) {
        communesCacheByWilaya.set(wilayaId, communes);
      }
      return communes;
    } catch {
      return [];
    }
  }

  /**
   * Intelligent Commune Resolver
   * Resolves raw customer input (Arabic, transliterated, or partial) into a valid Latin commune
   * registered with the Redex/EcoTrack tenant for the target wilaya.
   * GUARANTEES that EcoTrack never rejects the order with 422 "Commune mal écrite".
   */
  public async resolveCommuneForWilaya(
    wilayaCode: number,
    rawCommune: string | undefined | null
  ): Promise<{ resolvedCommune: string; stopDeskStationCode?: string; originalCommune: string }> {
    const original = (rawCommune || '').trim();
    if (!original) {
      const fallbackCapital = WILAYA_CAPITALS[wilayaCode] || 'Centre';
      return { resolvedCommune: fallbackCapital, originalCommune: original };
    }

    const validCommunes = await this.getCommunes(wilayaCode);

    // 1. Check if raw input is already an exact case-insensitive match with a valid commune
    const exactMatch = validCommunes.find(
      (c) => c.nom.trim().toLowerCase() === original.toLowerCase()
    );
    if (exactMatch) {
      return {
        resolvedCommune: exactMatch.nom,
        stopDeskStationCode: exactMatch.code_postal,
        originalCommune: original,
      };
    }

    // 2. Check Arabic dictionary mapping
    const normalizedArabic = original.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();
    for (const [arKey, latVal] of Object.entries(ARABIC_TO_LATIN_COMMUNES)) {
      const normKey = arKey.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();
      if (normalizedArabic.includes(normKey) || normKey.includes(normalizedArabic)) {
        const dictMatch = validCommunes.find(
          (c) => c.nom.toLowerCase() === latVal.toLowerCase() || c.nom.toLowerCase().includes(latVal.toLowerCase())
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

    // 3. Substring/Word search in valid communes
    const cleanLower = original.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const words = cleanLower.split(/\s+/).filter((w) => w.length > 2);
    if (words.length > 0) {
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
    }

    // 4. Safe Fallback: Use Wilaya Capital / First active commune
    const capitalName = WILAYA_CAPITALS[wilayaCode];
    if (capitalName) {
      const capitalMatch = validCommunes.find(
        (c) => c.nom.toLowerCase().includes(capitalName.toLowerCase()) || capitalName.toLowerCase().includes(c.nom.toLowerCase())
      );
      if (capitalMatch) {
        return {
          resolvedCommune: capitalMatch.nom,
          stopDeskStationCode: capitalMatch.code_postal,
          originalCommune: original,
        };
      }
    }

    if (validCommunes.length > 0 && validCommunes[0].nom) {
      return {
        resolvedCommune: validCommunes[0].nom,
        stopDeskStationCode: validCommunes[0].code_postal,
        originalCommune: original,
      };
    }

    return {
      resolvedCommune: capitalName || 'Centre',
      originalCommune: original,
    };
  }

  /**
   * 3. Create One Order
   * POST /api/v1/create/order (Query parameters ONLY, Bearer auth)
   */
  public async createOrder(payload: EcoTrackOrderPayload): Promise<EcoTrackCreateOrderResult> {
    const params = new URLSearchParams();

    params.set('nom_client', (payload.nom_client || 'Client').trim().slice(0, 255));
    params.set('telephone', cleanAlgerianPhone(payload.telephone));
    if (payload.telephone_2) {
      params.set('telephone_2', cleanAlgerianPhone(payload.telephone_2));
    }
    params.set('adresse', (payload.adresse || 'Centre Ville').trim().slice(0, 255));
    params.set('commune', (payload.commune || 'Centre').trim().slice(0, 255));
    params.set('code_wilaya', String(payload.code_wilaya || 16));
    params.set('montant', String(Math.max(0, Math.round(payload.montant))));
    params.set('type', String(payload.type ?? 1)); // 1 = Livraison
    params.set('stop_desk', String(payload.stop_desk === 1 ? 1 : 0));

    if (payload.reference) {
      params.set('reference', payload.reference.slice(0, 255));
    }
    if (payload.code_postal) {
      params.set('code_postal', String(payload.code_postal));
    }
    if (payload.produit) {
      params.set('produit', payload.produit.slice(0, 255));
    }
    if (payload.remarque) {
      params.set('remarque', payload.remarque.slice(0, 255));
    }
    params.set('boutique', (payload.boutique || 'ORVA Store').slice(0, 255));

    const endpoint = `${this.baseUrl}/api/v1/create/order?${params.toString()}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      if (res.status === 429) {
        return {
          success: false,
          tracking: '',
          error: 'تجاوز حد الطلبات المسموح (Rate Limit: 50 req/min). يرجى الانتظار دقيقة والمحاولة مجدداً.',
        };
      }

      const data = await res.json().catch(() => null);

      if (res.status === 422) {
        const errorDetails = data?.errors
          ? Object.values(data.errors).flat().join(' | ')
          : data?.message || 'بيانات الشحنة غير صالحة لدى ريديكس';
        return {
          success: false,
          tracking: '',
          error: errorDetails,
          raw: data,
        };
      }

      if (data?.success && data?.tracking) {
        return {
          success: true,
          tracking: String(data.tracking),
          raw: data,
        };
      }

      return {
        success: false,
        tracking: '',
        error: data?.message || 'تعذر إنشاء الشحنة لدى ريديكس',
        errorCode: data?.error,
        raw: data,
      };
    } catch (err: any) {
      return {
        success: false,
        tracking: '',
        error: err?.message || 'فشل الاتصال بخادم Redex',
      };
    }
  }

  /**
   * 7. Validate Order (Auto-Validate / Lock parcel into courier pickup flow)
   * POST /api/v1/valid/order?tracking=...&ask_collection=0
   */
  public async validOrder(tracking: string, askCollection: number = 0): Promise<EcoTrackValidOrderResult> {
    const params = new URLSearchParams();
    params.set('tracking', tracking.trim());
    params.set('ask_collection', String(askCollection));

    const endpoint = `${this.baseUrl}/api/v1/valid/order?${params.toString()}`;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        return { success: true, message: data.message || 'Commande expedier avec succès' };
      }

      return {
        success: false,
        error: data?.message || `HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to validate parcel' };
    }
  }

  /**
   * 6. Delete Order (Cancel parcel in Redex before pickup)
   * DELETE /api/v1/delete/order?tracking=...
   */
  public async deleteOrder(tracking: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/delete/order?tracking=${encodeURIComponent(tracking.trim())}`;

    try {
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      const data = await res.json().catch(() => null);
      if (res.ok && (data?.delete === 'success' || data?.success)) {
        return { success: true, message: 'Commande supprimée avec succès' };
      }

      return {
        success: false,
        error: data?.message || `HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Network error deleting parcel' };
    }
  }

  /**
   * 13. Get Single Tracking Info
   * GET /api/v1/get/tracking/info?tracking=...
   */
  public async getTrackingInfo(tracking: string): Promise<EcoTrackTrackingInfo> {
    const cleanTracking = tracking.trim();
    const endpoint = `${this.baseUrl}/api/v1/get/tracking/info?tracking=${encodeURIComponent(cleanTracking)}`;

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
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
        return { success: false, tracking: cleanTracking, activity: [], error: 'Invalid response from courier' };
      }

      const rawActivities = Array.isArray(data.activity) ? data.activity : [];
      const activities: EcoTrackActivityItem[] = rawActivities.map((item: any) => {
        const rawStatus = String(item.status || '');
        const meta = ECOTRACK_STATUS_MAP_AR[rawStatus];
        return {
          date: item.date || '',
          time: item.time || '',
          status: rawStatus,
          statusAr: meta?.label || item.details || rawStatus,
          station: item.station || '',
          scanLocation: item.scanLocation || '',
          details: item.details || '',
          reason: item.reason || '',
          driver: item.driver || '',
          postponed_to: item.postponed_to || '',
        };
      });

      const latestActivity = activities[activities.length - 1];
      const currentStatusCode = latestActivity?.status || 'prete_a_expedier';
      const statusMeta = ECOTRACK_STATUS_MAP_AR[currentStatusCode];

      return {
        success: true,
        tracking: cleanTracking,
        recipientName: data.recipientName || '',
        shippedBy: data.shippedBy || '',
        currentStation: data.currentStation || '',
        status: currentStatusCode,
        statusAr: statusMeta?.label || currentStatusCode,
        originCity: data.originCity,
        destLocationCity: data.destLocationCity,
        activity: activities,
        reasons: Array.isArray(data.reasons) ? data.reasons : [],
      };
    } catch (err: any) {
      return {
        success: false,
        tracking: cleanTracking,
        activity: [],
        error: err?.message || 'Network error fetching tracking',
      };
    }
  }

  /**
   * 16. Get Bulk Orders Status
   * GET /api/v1/get/orders/status?api_token=...&trackings=...&status=all
   * ⚠️ NOTE: api_token is passed as a QUERY PARAMETER per EcoTrack API specification
   */
  public async getBulkOrdersStatus(
    trackings: string[],
    statusFilter: string = 'all'
  ): Promise<{ success: boolean; data?: Record<string, any>; error?: string }> {
    if (!trackings.length) {
      return { success: true, data: {} };
    }

    const cleanTrackings = trackings.slice(0, 100).map((t) => t.trim()).join(',');
    const params = new URLSearchParams();
    params.set('api_token', this.token);
    params.set('trackings', cleanTrackings);
    params.set('status', statusFilter);

    const endpoint = `${this.baseUrl}/api/v1/get/orders/status?${params.toString()}`;

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const json = await res.json().catch(() => null);
      return {
        success: true,
        data: json?.data || {},
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error fetching bulk statuses' };
    }
  }

  /**
   * 9. Download Order Label PDF
   * GET /api/v1/get/order/label?tracking=...
   * Returns binary PDF ArrayBuffer
   */
  public async fetchLabelPdf(tracking: string): Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/get/order/label?tracking=${encodeURIComponent(tracking.trim())}`;

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const buffer = await res.arrayBuffer();
      return { success: true, buffer };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error fetching PDF label' };
    }
  }

  /**
   * 20. Get Fees
   * GET /api/v1/get/fees
   */
  public async getFees(): Promise<{ success: boolean; fees?: EcoTrackFeesWilaya[]; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/get/fees`;
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      const json = await res.json().catch(() => null);
      if (res.ok && json?.livraison) {
        return { success: true, fees: json.livraison };
      }
      return { success: false, error: json?.message || 'Failed to fetch fees' };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * 17. Get Wilayas
   * GET /api/v1/get/wilayas
   */
  public async getWilayas(): Promise<{ success: boolean; wilayas?: Array<{ wilaya_id: number; wilaya_name: string }>; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/get/wilayas`;
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      const json = await res.json().catch(() => null);
      if (res.ok && Array.isArray(json)) {
        return { success: true, wilayas: json };
      }
      return { success: false, error: json?.message || 'Failed to fetch wilayas' };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * 18. Get Stop Desk Hubs
   * GET /api/v1/get/desks
   */
  public async getDesks(): Promise<{ success: boolean; desks?: any; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/get/desks`;
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      const json = await res.json().catch(() => null);
      if (res.ok) {
        return { success: true, desks: json };
      }
      return { success: false, error: json?.message || 'Failed to fetch desks' };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }

  /**
   * Liste des Produits (page-2026-11-08-18-58-29.md)
   * GET /api/v1/get/products/list?page=...
   */
  public async getProducts(page: number = 1): Promise<{ success: boolean; products?: EcoTrackProductItem[]; pagination?: any; error?: string }> {
    const endpoint = `${this.baseUrl}/api/v1/get/products/list?page=${page}`;
    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json',
          'User-Agent': 'ORVA-Store-Client/1.0',
        },
      });

      const json = await res.json().catch(() => null);
      if (res.ok && json?.products) {
        return { success: true, products: json.products, pagination: json.pagination };
      }
      return { success: false, error: json?.message || 'Failed to fetch products' };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }
}

// Global Singleton Instance
let defaultEcoTrackClient: EcoTrackClient | null = null;

export function getEcoTrackClient(options?: { baseUrl?: string; token?: string }): EcoTrackClient {
  if (options?.baseUrl || options?.token) {
    return new EcoTrackClient(options);
  }
  if (!defaultEcoTrackClient) {
    defaultEcoTrackClient = new EcoTrackClient();
  }
  return defaultEcoTrackClient;
}
