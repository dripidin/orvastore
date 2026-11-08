// =============================================================================
// CourierDZ Catalog & Pre-Template Integration for ORVA Store Dashboard
// Integrated from CourierDZ (src/Enum/ShippingProvider.php & ProviderIntegrations)
// =============================================================================

export type CourierIntegrationFamily = "ecotrack" | "yalidine" | "procolis" | "maystro";

export interface CourierDefinition {
  id: string;
  name: string;
  nameAr: string;
  family: CourierIntegrationFamily;
  baseUrl: string;
  badge: string;
  supportsStopDesk: boolean;
  trackingPrefix: string;
  requiredFields: ("token" | "apiId" | "key" | "baseUrl")[];
  descriptionAr: string;
}

export const COURIER_DZ_PROVIDERS: CourierDefinition[] = [
  {
    id: "redex",
    name: "Redex Delivery DZ",
    nameAr: "ريديكس للتوصيل (Redex)",
    family: "ecotrack",
    baseUrl: "https://redex.ecotrack.dz",
    badge: "الرئيسي",
    supportsStopDesk: true,
    trackingPrefix: "RDX-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "الناقل المعتمد لشبكة مستودعات بسكرة والولايات المجاورة",
  },
  {
    id: "yalidine",
    name: "Yalidine Express",
    nameAr: "ياليدين إكسبريس (Yalidine)",
    family: "yalidine",
    baseUrl: "https://api.yalidine.app",
    badge: "شائع",
    supportsStopDesk: true,
    trackingPrefix: "YAL-DZ-",
    requiredFields: ["apiId", "token"],
    descriptionAr: "أكبر شبكة مراكز استلام (Stop Desk) وتوصيل منزلي عبر 58 ولاية",
  },
  {
    id: "zrexpress",
    name: "ZR Express (Procolis)",
    nameAr: "زد آر إكسبريس (ZR Express)",
    family: "procolis",
    baseUrl: "https://procolis.com/api",
    badge: "بروكوليس",
    supportsStopDesk: true,
    trackingPrefix: "ZR-DZ-",
    requiredFields: ["key", "token"],
    descriptionAr: "منصة بروكوليس للتوصيل السريع والمؤسساتي",
  },
  {
    id: "dhd",
    name: "DHD Express",
    nameAr: "دي إتش دي إكسبريس (DHD)",
    family: "ecotrack",
    baseUrl: "https://platform.dhd-dz.com",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "DHD-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شحن سريع وتغطية واسعة مدعومة بنظام إيكوتراك",
  },
  {
    id: "conexlog",
    name: "Conexlog DZ",
    nameAr: "كونيكس لوغ (Conexlog)",
    family: "ecotrack",
    baseUrl: "https://app.conexlog-dz.com",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "CNX-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "لوجستيات وشحن البضائع والتجارة الإلكترونية",
  },
  {
    id: "maystro",
    name: "Maystro Delivery",
    nameAr: "مايسترو دليفري (Maystro)",
    family: "maystro",
    baseUrl: "https://api.maystro-delivery.com",
    badge: "مايسترو",
    supportsStopDesk: false,
    trackingPrefix: "MYS-DZ-",
    requiredFields: ["token"],
    descriptionAr: "حلول التوصيل للتجارة الإلكترونية والتسليم في اليوم التالي",
  },
  {
    id: "msmgo",
    name: "MSM Go Express",
    nameAr: "إم إس إم غو (MSM Go)",
    family: "ecotrack",
    baseUrl: "https://app.msmgo.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "MSM-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "توصيل سريع وتتبع فوري عبر نظام إيكوتراك",
  },
  {
    id: "anderson",
    name: "Anderson Delivery",
    nameAr: "أندرسون اللوجستية (Anderson)",
    family: "ecotrack",
    baseUrl: "https://app.anderson-logistics.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "AND-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شحن متخصص وخدمة الدفع عند الاستلام",
  },
];

export interface CourierCredentialData {
  configured: boolean;
  token?: string;
  apiId?: string;
  key?: string;
  baseUrl?: string;
}

export interface CourierPreTemplateSettings {
  defaultCourierId: string;
  defaultDeliveryType: "home" | "desk";
  freeShipping: boolean;
  autoPrintLabel: boolean;
  defaultNotes: string;
  credentials: Record<string, CourierCredentialData>;
}

const PRE_TEMPLATE_STORAGE_KEY = "orva_courier_pre_template_v1";

export const DEFAULT_PRE_TEMPLATE: CourierPreTemplateSettings = {
  defaultCourierId: "redex",
  defaultDeliveryType: "home",
  freeShipping: false,
  autoPrintLabel: false,
  defaultNotes: "يرجى الاتصال بالزبون قبل محاولة التسليم",
  credentials: {
    redex: { configured: true, baseUrl: "https://redex.ecotrack.dz" },
    yalidine: { configured: false, baseUrl: "https://api.yalidine.app" },
    zrexpress: { configured: false, baseUrl: "https://procolis.com/api" },
    dhd: { configured: false, baseUrl: "https://platform.dhd-dz.com" },
    conexlog: { configured: false, baseUrl: "https://app.conexlog-dz.com" },
    maystro: { configured: false, baseUrl: "https://api.maystro-delivery.com" },
    msmgo: { configured: false, baseUrl: "https://app.msmgo.ecotrack.dz" },
    anderson: { configured: false, baseUrl: "https://app.anderson-logistics.dz" },
  },
};

export function loadCourierPreTemplate(): CourierPreTemplateSettings {
  if (typeof window === "undefined") return DEFAULT_PRE_TEMPLATE;
  try {
    const raw = localStorage.getItem(PRE_TEMPLATE_STORAGE_KEY);
    if (!raw) return DEFAULT_PRE_TEMPLATE;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PRE_TEMPLATE,
      ...parsed,
      credentials: {
        ...DEFAULT_PRE_TEMPLATE.credentials,
        ...(parsed.credentials || {}),
      },
    };
  } catch {
    return DEFAULT_PRE_TEMPLATE;
  }
}

export function saveCourierPreTemplate(settings: Partial<CourierPreTemplateSettings>): CourierPreTemplateSettings {
  const current = loadCourierPreTemplate();
  const next: CourierPreTemplateSettings = {
    ...current,
    ...settings,
    credentials: {
      ...current.credentials,
      ...(settings.credentials || {}),
    },
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(PRE_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("[CourierDZ] Failed to save pre-template in localStorage:", e);
    }
  }
  return next;
}

export function generateSyntheticTrackingCode(courierId: string): string {
  const courier = COURIER_DZ_PROVIDERS.find((c) => c.id === courierId) || COURIER_DZ_PROVIDERS[0];
  const randNum = Math.floor(100000 + Math.random() * 900000);
  return `${courier.trackingPrefix}${randNum}`;
}
