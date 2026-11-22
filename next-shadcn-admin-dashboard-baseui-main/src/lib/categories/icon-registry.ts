export type CategoryIconGroup =
  | "all"
  | "tools"
  | "auto"
  | "power"
  | "store"
  | "electronics"
  | "home";

export interface CuratedCategoryIconMeta {
  name: string;
  labelAr: string;
  keywords: string[];
  group: Exclude<CategoryIconGroup, "all">;
}

export const DEFAULT_CATEGORY_ICON = "folder-tree";

export const CATEGORY_ICON_GROUPS: Array<{ id: CategoryIconGroup; labelAr: string }> = [
  { id: "tools", labelAr: "الورشة والأدوات" },
  { id: "power", labelAr: "الطاقة واللحام" },
  { id: "auto", labelAr: "السيارات والمنافيخ" },
  { id: "store", labelAr: "الباقات والمتجر" },
  { id: "electronics", labelAr: "الإلكترونيات والأجهزة" },
  { id: "home", labelAr: "المنزل والحديقة" },
  { id: "all", labelAr: "كل الأيقونات (2,300+)" },
];

export const CURATED_CATEGORY_ICONS: CuratedCategoryIconMeta[] = [
  { name: "folder-tree", labelAr: "شجرة تصنيف", keywords: ["تصنيف", "شجرة", "مجلد", "category", "tree"], group: "store" },
  { name: "wrench", labelAr: "مفتاح صيانة", keywords: ["مفاتيح", "مفتاح", "ورشة", "صيانة", "wrench", "spanner"], group: "tools" },
  { name: "hammer", labelAr: "مطرقة وأشغال", keywords: ["مطرقة", "أدوات", "شاكوش", "hammer", "tools"], group: "tools" },
  { name: "drill", labelAr: "مثقاب / فيسوز", keywords: ["مثقاب", "فيسوز", "ثقب", "drill", "visseuse", "crown"], group: "tools" },
  { name: "cog", labelAr: "تروس وميكانيك", keywords: ["ميكانيك", "قطع", "غيار", "cog", "gear"], group: "tools" },
  { name: "settings", labelAr: "معدات وضبط", keywords: ["معدات", "ضبط", "صيانة", "settings"], group: "tools" },
  { name: "axe", labelAr: "فأس وقطع", keywords: ["قطع", "أشغال", "axe"], group: "tools" },
  { name: "pickaxe", labelAr: "أشغال شاقة", keywords: ["حفر", "أشغال", "شاقة", "pickaxe"], group: "tools" },
  { name: "shovel", labelAr: "أدوات حديقة وحفر", keywords: ["حفر", "حديقة", "shovel"], group: "tools" },
  { name: "scissors", labelAr: "قص وتقليم", keywords: ["قص", "مقص", "scissors"], group: "tools" },
  { name: "paintbrush", labelAr: "دهان وتشطيب", keywords: ["دهان", "طلاء", "ورشة", "paintbrush"], group: "tools" },
  { name: "ruler", labelAr: "قياس ودقة", keywords: ["قياس", "مسطرة", "دقة", "ruler"], group: "tools" },
  { name: "compass", labelAr: "تخطيط وقياس", keywords: ["قياس", "بوصلة", "compass"], group: "tools" },
  { name: "hard-hat", labelAr: "سلامة وحماية", keywords: ["حماية", "خوذة", "أمان", "سلامة", "safety", "helmet"], group: "tools" },
  { name: "construction", labelAr: "بناء ومشاريع", keywords: ["بناء", "أشغال", "ورشة", "construction"], group: "tools" },
  { name: "nut", labelAr: "براغي وبولون", keywords: ["براغي", "صامولة", "nut", "bolt"], group: "tools" },
  { name: "bolt", labelAr: "مسامير وبولونات", keywords: ["برغي", "مسمار", "bolt"], group: "tools" },

  { name: "flame", labelAr: "لحام / سودير", keywords: ["لحام", "سودير", "نار", "حرارة", "soudure", "welding", "flame"], group: "power" },
  { name: "zap", labelAr: "كهرباء وطاقة", keywords: ["كهرباء", "طاقة", "لاسلكي", "قوة", "zap", "power"], group: "power" },
  { name: "battery-charging", labelAr: "بطاريات وشحن 20V", keywords: ["بطارية", "شحن", "20v", "ليثيوم", "battery"], group: "power" },
  { name: "plug", labelAr: "أسلاك وكوابل", keywords: ["كابل", "كهربائي", "قابس", "plug"], group: "power" },
  { name: "lightbulb", labelAr: "إنارة وكشافات", keywords: ["إنارة", "مصباح", "led", "lightbulb"], group: "power" },
  { name: "flashlight", labelAr: "مصباح ورشة", keywords: ["كشاف", "تورش", "ضوء", "flashlight"], group: "power" },
  { name: "fan", labelAr: "تهوية وتبريد", keywords: ["تهوية", "تبريد", "مروحة", "fan"], group: "power" },
  { name: "wind", labelAr: "هواء وضغط", keywords: ["هواء", "منفاخ", "ضغط", "wind", "blower"], group: "power" },

  { name: "car", labelAr: "السيارة والطوارئ", keywords: ["سيارة", "طوارئ", "مركبة", "car", "auto"], group: "auto" },
  { name: "truck", labelAr: "شاحنات ونقل", keywords: ["شاحنة", "توصيل", "نقل", "truck"], group: "auto" },
  { name: "gauge", labelAr: "مقياس ضغط ومنفاخ", keywords: ["منفاخ", "كومبريسار", "ضغط", "إطارات", "gauge", "compressor"], group: "auto" },
  { name: "bike", labelAr: "دراجات وتنقل", keywords: ["دراجة", "موتو", "bike"], group: "auto" },
  { name: "key-round", labelAr: "أقفال ومفاتيح", keywords: ["مفتاح", "قفل", "سيارة", "key"], group: "auto" },
  { name: "lock", labelAr: "أمان وحماية", keywords: ["قفل", "حماية", "أمان", "lock"], group: "auto" },

  { name: "package", labelAr: "باقة كاملة", keywords: ["باقة", "باك", "صندوق", "عرض", "pack", "package"], group: "store" },
  { name: "boxes", labelAr: "تشكيلة ومخزون", keywords: ["تشكيلة", "مجموعة", "مخزون", "boxes"], group: "store" },
  { name: "layers", labelAr: "مجموعات متعددة", keywords: ["طبقات", "متعدد", "ملحقات", "layers"], group: "store" },
  { name: "shopping-bag", labelAr: "الأكثر مبيعاً", keywords: ["تسوق", "حقيبة", "مبيعات", "bag"], group: "store" },
  { name: "store", labelAr: "واجهة المتجر", keywords: ["متجر", "قسم", "store", "shop"], group: "store" },
  { name: "tag", labelAr: "وسم وعروض", keywords: ["وسم", "تخفيض", "سعر", "tag"], group: "store" },
  { name: "tags", labelAr: "تصنيفات متنوعة", keywords: ["وسوم", "تصنيفات", "tags"], group: "store" },
  { name: "crown", labelAr: "إصدار CROWN الأصلي", keywords: ["تاج", "كراون", "أصلي", "crown", "elite"], group: "store" },
  { name: "shield-check", labelAr: "ضمان وأصلية", keywords: ["ضمان", "أصلي", "حماية", "قفازات", "shield"], group: "store" },
  { name: "badge-check", labelAr: "معتمد وموثوق", keywords: ["معتمد", "جودة", "badge"], group: "store" },
  { name: "award", labelAr: "احترافي PRO", keywords: ["جائزة", "احترافي", "أفضل", "award"], group: "store" },
  { name: "star", labelAr: "مميز ومفضلة", keywords: ["نجمة", "مميز", "تقييم", "star"], group: "store" },
  { name: "sparkles", labelAr: "مختارات جديدة", keywords: ["جديد", "ذكي", "لمعة", "sparkles"], group: "store" },
  { name: "gift", labelAr: "هدايا وعروض", keywords: ["هدية", "باقة", "gift"], group: "store" },
  { name: "percent", labelAr: "تخفيضات وتوفير", keywords: ["خصم", "تخفيض", "percent", "promo"], group: "store" },
  { name: "layout-grid", labelAr: "كل الأقسام", keywords: ["شبكة", "أقسام", "grid"], group: "store" },
  { name: "briefcase", labelAr: "حقيبة عدة", keywords: ["حقيبة", "عدة", "أدوات", "briefcase"], group: "store" },
  { name: "backpack", labelAr: "حقائب وتنقل", keywords: ["حقيبة", "ظهر", "تخزين", "backpack"], group: "store" },

  { name: "cpu", labelAr: "أجهزة رقمية", keywords: ["رقاقة", "ذكي", "تقنية", "cpu", "igbt"], group: "electronics" },
  { name: "smartphone", labelAr: "هواتف وملحقاتها", keywords: ["هاتف", "شاشة", "موبايل", "smartphone"], group: "electronics" },
  { name: "headphones", labelAr: "سماعات وصوت", keywords: ["سماعة", "صوت", "headphones"], group: "electronics" },
  { name: "camera", labelAr: "كاميرات ومراقبة", keywords: ["كاميرا", "تصوير", "camera"], group: "electronics" },
  { name: "tv", labelAr: "شاشات وتلفاز", keywords: ["شاشة", "تلفاز", "tv"], group: "electronics" },
  { name: "laptop", labelAr: "حواسيب ولابتوب", keywords: ["حاسوب", "لابتوب", "laptop"], group: "electronics" },
  { name: "monitor", labelAr: "معدات العرض", keywords: ["شاشة", "عرض", "monitor"], group: "electronics" },
  { name: "watch", labelAr: "ساعات وإكسسوارات", keywords: ["ساعة", "ذكية", "watch"], group: "electronics" },
  { name: "radio", labelAr: "اتصالات ولاسلكي", keywords: ["راديو", "إشارة", "radio"], group: "electronics" },
  { name: "speaker", labelAr: "مكبرات صوت", keywords: ["صوت", "سبيكر", "speaker"], group: "electronics" },

  { name: "home", labelAr: "أدوات المنزل", keywords: ["منزل", "بيت", "صيانة منزلية", "home"], group: "home" },
  { name: "droplets", labelAr: "غسيل وضغط عالي", keywords: ["غسيل", "ماء", "كراشر", "ضغط", "droplets", "washer"], group: "home" },
  { name: "leaf", labelAr: "بستنة وحدائق", keywords: ["حديقة", "بستنة", "نبات", "leaf"], group: "home" },
  { name: "sprout", labelAr: "زراعة وتشجير", keywords: ["زراعة", "شتلة", "حديقة", "sprout"], group: "home" },
  { name: "sun", labelAr: "طاقة شمسية وخارجي", keywords: ["شمسي", "خارجي", "sun"], group: "home" },
  { name: "thermometer", labelAr: "حرارة وتدفئة", keywords: ["حرارة", "سخونة", "thermometer"], group: "home" },
  { name: "sofa", labelAr: "أثاث ومفروشات", keywords: ["أثاث", "منزل", "sofa"], group: "home" },
  { name: "utensils", labelAr: "مطبخ ولوازم", keywords: ["مطبخ", "أواني", "utensils"], group: "home" },
  { name: "dumbbell", labelAr: "رياضة ولياقة", keywords: ["رياضة", "لياقة", "dumbbell"], group: "home" },
  { name: "shirt", labelAr: "ملابس عمل", keywords: ["ملابس", "تيشيرت", "shirt"], group: "home" },
  { name: "footprints", labelAr: "أحذية سلامة ورياضة", keywords: ["حذاء", "أحذية", "footprints"], group: "home" },
];

const CURATED_BY_NAME = new Map<string, CuratedCategoryIconMeta>(
  CURATED_CATEGORY_ICONS.map((item) => [item.name, item])
);

const SAFE_ICON_KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeCategoryIconName(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_CATEGORY_ICON;
  const trimmed = raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
  if (!trimmed || trimmed.length > 64) return DEFAULT_CATEGORY_ICON;
  if (CURATED_BY_NAME.has(trimmed) || SAFE_ICON_KEBAB_RE.test(trimmed)) return trimmed;
  return DEFAULT_CATEGORY_ICON;
}

export function getCuratedIconMeta(name: string): CuratedCategoryIconMeta | undefined {
  return CURATED_BY_NAME.get(normalizeCategoryIconName(name));
}

export function searchCategoryIcons(
  query: string,
  group: CategoryIconGroup = "all",
  limit = 160,
  extraIconNames: string[] = []
): Array<{ name: string; labelAr: string; isCurated: boolean }> {
  const q = query.trim().toLowerCase();

  if (group !== "all") {
    const inGroup = CURATED_CATEGORY_ICONS.filter((item) => item.group === group);
    const filtered = q
      ? inGroup.filter(
          (item) =>
            item.name.includes(q) ||
            item.labelAr.toLowerCase().includes(q) ||
            item.keywords.some((kw) => kw.toLowerCase().includes(q))
        )
      : inGroup;
    return filtered.slice(0, limit).map((i) => ({ name: i.name, labelAr: i.labelAr, isCurated: true }));
  }

  // Prioritize curated Arabic matches first, then match across extra dynamic Lucide icon names
  const curatedMatches = (
    q
      ? CURATED_CATEGORY_ICONS.filter(
          (item) =>
            item.name.includes(q) ||
            item.labelAr.toLowerCase().includes(q) ||
            item.keywords.some((kw) => kw.toLowerCase().includes(q))
        )
      : CURATED_CATEGORY_ICONS
  ).map((i) => ({ name: i.name, labelAr: i.labelAr, isCurated: true }));

  const seen = new Set(curatedMatches.map((m) => m.name));
  const extraMatches: Array<{ name: string; labelAr: string; isCurated: boolean }> = [];

  for (const name of extraIconNames) {
    if (seen.has(name)) continue;
    if (!q || name.includes(q)) {
      extraMatches.push({
        name,
        labelAr: name.replace(/-/g, " "),
        isCurated: false,
      });
      if (curatedMatches.length + extraMatches.length >= limit) break;
    }
  }

  return [...curatedMatches, ...extraMatches].slice(0, limit);
}
