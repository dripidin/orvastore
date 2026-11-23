/**
 * Algerian Multi-Courier Catalog & Presets (Redex + 22 EcoTrack Tenants + Yalidine + Procolis/ZR Express + NOEST + Maystro + Excel-Only)
 */

export type CourierIntegrationFamily =
  | "ecotrack"
  | "yalidine"
  | "procolis"
  | "zrexpress"
  | "noest"
  | "maystro"
  | "excel_only"
  | "custom";

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
    descriptionAr: "الناقل المعتمد لشبكة مستودعات بسكرة وجميع الولايات (69 ولاية)",
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
    descriptionAr: "أكبر شبكة مراكز استلام (Stop Desk) وتوصيل منزلي عبر 69 ولاية",
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
    id: "noest",
    name: "NOEST Express",
    nameAr: "نويست إكسبريس (NOEST)",
    family: "noest",
    baseUrl: "https://app.noest-dz.com",
    badge: "نويست",
    supportsStopDesk: true,
    trackingPrefix: "NST-DZ-",
    requiredFields: ["token", "apiId"],
    descriptionAr: "توصيل سريع عبر شبكة مكاتب نويست والتتبع الحي",
  },
  {
    id: "maystro",
    name: "Maystro Delivery",
    nameAr: "مايسترو دليفري (Maystro)",
    family: "maystro",
    baseUrl: "https://api.maystro-delivery.com",
    badge: "مايسترو",
    supportsStopDesk: true,
    trackingPrefix: "MYS-DZ-",
    requiredFields: ["token"],
    descriptionAr: "حلول التوصيل للتجارة الإلكترونية والتسليم السريع",
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
    id: "anderson",
    name: "Anderson Delivery",
    nameAr: "أندرسون اللوجستية (Anderson)",
    family: "ecotrack",
    baseUrl: "https://anderson-ecommerce.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "AND-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شحن متخصص وخدمة الدفع عند الاستلام عبر إيكوتراك",
  },
  {
    id: "conexlog",
    name: "Conexlog DZ (UPS)",
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
    id: "maystro_ecotrack",
    name: "Areex / EcoTrack",
    nameAr: "أريكس للتوصيل (Areex)",
    family: "ecotrack",
    baseUrl: "https://areex.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "ARX-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شركة شحن جزائرية على منصة إيكوتراك",
  },
  {
    id: "packers",
    name: "Packers Delivery",
    nameAr: "باكرز للتوصيل (Packers)",
    family: "ecotrack",
    baseUrl: "https://packers.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "PCK-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شحن COD سريع على منصة إيكوتراك",
  },
  {
    id: "rb_livraison",
    name: "RB Livraison",
    nameAr: "آر بي للتوصيل (RB Livraison)",
    family: "ecotrack",
    baseUrl: "https://rblivraison.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "RBL-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "تغطية وطنية وتوزيع للمنزل والمكاتب",
  },
  {
    id: "rex_speed",
    name: "Rex Speed",
    nameAr: "ريكس سبيد (Rex Speed)",
    family: "ecotrack",
    baseUrl: "https://rexspeed.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "REX-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شبكة توصيل سريعة على نظام إيكوتراك",
  },
  {
    id: "salva",
    name: "Salva Delivery",
    nameAr: "سلفا للتوصيل (Salva)",
    family: "ecotrack",
    baseUrl: "https://salvadelivery.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "SLV-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "توصيل سريع عبر ولايات الوطن",
  },
  {
    id: "worldexpress",
    name: "World Express",
    nameAr: "وورلد إكسبريس (World Express)",
    family: "ecotrack",
    baseUrl: "https://worldexpress.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "WEX-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شركة توصيل للتجارة الإلكترونية على إيكوتراك",
  },
  {
    id: "elogistia",
    name: "Elogistia",
    nameAr: "إيلوجيستيا (Elogistia)",
    family: "ecotrack",
    baseUrl: "https://elogistia.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "ELG-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "خدمات التوصيل والفرز عبر إيكوتراك",
  },
  {
    id: "48hr",
    name: "48Hr Delivery",
    nameAr: "48 ساعة للتوصيل (48Hr)",
    family: "ecotrack",
    baseUrl: "https://48hr.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "48H-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "توصيل خلال 48 ساعة على نظام إيكوتراك",
  },
  {
    id: "golivri",
    name: "Go Livri",
    nameAr: "غو ليفري (Go Livri)",
    family: "ecotrack",
    baseUrl: "https://golivri.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "GLV-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "توصيل COD للطرود والطلبات",
  },
  {
    id: "fretdirect",
    name: "FretDirect",
    nameAr: "فريت دايركت (FretDirect)",
    family: "ecotrack",
    baseUrl: "https://fretdirect.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "FRT-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "لوجستيات التوزيع عبر نظام إيكوتراك",
  },
  {
    id: "distazero",
    name: "DistaZero",
    nameAr: "ديستا زيرو (DistaZero)",
    family: "ecotrack",
    baseUrl: "https://distazero.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "DTZ-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "توصيل إلكتروني متكامل على إيكوتراك",
  },
  {
    id: "swift_express",
    name: "Swift Express",
    nameAr: "سويفت إكسبريس (Swift)",
    family: "ecotrack",
    baseUrl: "https://swiftexpress.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "SWF-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "توزيع سريع مدعوم بنظام إيكوتراك",
  },
  {
    id: "turbo_delivery",
    name: "Turbo Delivery",
    nameAr: "توربو للتوصيل (Turbo)",
    family: "ecotrack",
    baseUrl: "https://turbodelivery.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "TRB-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "خدمة توصيل طرود عبر نظام إيكوتراك",
  },
  {
    id: "packup",
    name: "PackUp Express",
    nameAr: "باك أب إكسبريس (PackUp)",
    family: "ecotrack",
    baseUrl: "https://packup.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "PKU-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "خدمات تجميع وتوصيل الطلبيات",
  },
  {
    id: "ymag",
    name: "Ymag Delivery",
    nameAr: "يماغ للتوصيل (Ymag)",
    family: "ecotrack",
    baseUrl: "https://ymagdelivery.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "YMG-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "شركة شحن جزائرية عبر إيكوتراك",
  },
  {
    id: "guepex",
    name: "Guepex (Yalidine Group)",
    nameAr: "غوبكس للتوصيل (Guepex)",
    family: "yalidine",
    baseUrl: "https://api.guepex.app",
    badge: "ياليدين",
    supportsStopDesk: true,
    trackingPrefix: "GUP-DZ-",
    requiredFields: ["apiId", "token"],
    descriptionAr: "شبكة غوبكس التابعة لمجموعة ياليدين للتوصيل السريع",
  },
  {
    id: "yalitec",
    name: "Yalitec Express",
    nameAr: "ياليتك إكسبريس (Yalitec)",
    family: "ecotrack",
    baseUrl: "https://yalitec.ecotrack.dz",
    badge: "إيكوتراك",
    supportsStopDesk: true,
    trackingPrefix: "YLT-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "منصة ياليتك للتوصيل والدفع عند الاستلام",
  },
  {
    id: "custom_ecotrack",
    name: "Custom EcoTrack Tenant",
    nameAr: "شركة إيكوتراك مخصصة",
    family: "ecotrack",
    baseUrl: "https://your-company.ecotrack.dz",
    badge: "مخصص",
    supportsStopDesk: true,
    trackingPrefix: "ECO-DZ-",
    requiredFields: ["token", "baseUrl"],
    descriptionAr: "اربط أي شركة توصيل تشتغل بنظام EcoTrack بإدخال رابطها ورمز API Token",
  },
  {
    id: "external_excel",
    name: "External Excel-Only Courier",
    nameAr: "شركة توصيل عبر ملفات Excel فقط",
    family: "excel_only",
    baseUrl: "https://excel-import.local",
    badge: "ملف Excel",
    supportsStopDesk: true,
    trackingPrefix: "EXT-",
    requiredFields: [],
    descriptionAr: "شركة توصيل تتم مطابقتها ومزامنتها عبر ملفات Excel في مركز المطابقة",
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
  credentials: Object.fromEntries(
    COURIER_DZ_PROVIDERS.map((p) => [p.id, { configured: p.id === "redex", baseUrl: p.baseUrl }]),
  ),
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
      ...(settings.credentials ?? {}),
    },
  };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(PRE_TEMPLATE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write errors in restricted browsing contexts
    }
  }
  return next;
}

export function generateSyntheticTrackingCode(courierId: string): string {
  const courier = COURIER_DZ_PROVIDERS.find((c) => c.id === courierId) || COURIER_DZ_PROVIDERS[0];
  const randNum = Math.floor(100000 + Math.random() * 900000);
  return `${courier.trackingPrefix}${randNum}`;
}
