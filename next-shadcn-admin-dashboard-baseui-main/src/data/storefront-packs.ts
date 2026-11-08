/**
 * ORVA Storefront Packs Data Model
 * Authoritative typed metadata for Pack 1, Pack 2, and Pack 3
 */

export interface PackBoxItem {
  id: number;
  name: string;
  tag: string;
  desc: string;
  iconName:
    | "Gauge"
    | "Wrench"
    | "RotateCcw"
    | "Hammer"
    | "Zap"
    | "ShieldCheck"
    | "Flame"
    | "Sliders"
    | "ShieldAlert"
    | "HardHat";
  features?: string[];
}

export interface StorefrontPack {
  id: "PACK1" | "PACK2" | "PACK3";
  slug: "pack1" | "pack2" | "pack3";
  route: string;
  nameAr: string;
  nameFr: string;
  subtitleAr: string;
  badgeAr: string;
  badgeColor: string;
  priceDzd: number;
  alternatePriceDzd?: number;
  originalPriceDzd: number;
  savingsDzd: number;
  rating: number;
  reviewsCount: number;
  heroImage: string;
  allProductsImage: string;
  heroImageAlt: string;
  descriptionAr: string;
  highlightsAr: string[];
  boxItems: PackBoxItem[];
  crossSellTargetId: "PACK1" | "PACK2" | "PACK3";
  crossSellHeading: string;
  crossSellSubtitle: string;
  crossSellCtaText: string;
  seo: {
    title: string;
    description: string;
    keywords: string[];
  };
}

export const STOREFRONT_PACKS: Record<"PACK1" | "PACK2" | "PACK3", StorefrontPack> = {
  PACK1: {
    id: "PACK1",
    slug: "pack1",
    route: "/pack1",
    nameAr: "باك منفاخ تويوتا وطقم المفاتيح",
    nameFr: "Pack Compresseur & Clés 4-en-1",
    subtitleAr: "4 أدوات أساسية للسيارة، المنزل والصيانة المتكاملة",
    badgeAr: "باقة 4 في 1",
    badgeColor: "bg-emerald-600",
    priceDzd: 4950,
    originalPriceDzd: 9750,
    savingsDzd: 4800,
    rating: 4.9,
    reviewsCount: 184,
    heroImage: "/images/packs/pack-1/hero.webp",
    allProductsImage: "/images/packs/pack-1/all-products.jpg",
    heroImageAlt: "باك الخدمة والصيانة 4 في 1 — منفاخ TOYOTA وطقم مفاتيح ومفكات",
    descriptionAr:
      "باك الخدمة والصيانة 4 في 1 للسيارة والمنزل: منفاخ عجلات TOYOTA، طقم مفاتيح 46 قطعة STARCLE PRO، مفك مرن 11 قطعة، وطقم 6 مفكات بـ 4,950 د.ج مع التوصيل والدفع عند الاستلام.",
    highlightsAr: [
      "منفاخ إطارات TOYOTA بمقياس ضغط دقيق لمقبس ولاعة السيارة 12V",
      "علبة مفاتيح ورؤوس صيانة 46 قطعة STARCLE PRO كليكي CR-V أصلية",
      "مفك مرن 11 قطعة STARCLE PRO للوصول للزوايا والأماكن المحصورة",
      "طقم 6 مفكات بمقابض مريحة مانعة للانزلاق ورؤوس ممغنطة",
    ],
    boxItems: [
      {
        id: 1,
        name: "منفاخ عجلات TOYOTA مع عداد ضغط مدمج",
        tag: "طوارئ السيارة والرحلات",
        desc: "منفاخ مدمج قوي يعمل على مقبس ولاعة السيارة 12V، مزود بعداد ضغط هواء لمراقبة وضبط ضغط الإطارات بدقة، مع رؤوس لنفخ العجلات والكرات.",
        iconName: "Gauge",
        features: ["مقياس Bar & PSI مدمج", "كابل 12V طويل يصل لجميع العجلات", "صمامات متعددة الاستعمال"],
      },
      {
        id: 2,
        name: "علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO",
        tag: "فولاذ كروم فاناديوم CR-V",
        desc: "طقم متكامل مع ذراع كليكي سريع 1/4 بوصة، 13 حبة من 4 إلى 14 ملم، 21 رأس مفك (Torx, Hex, PH, Flat)، ووصلات تمديد في حقيبة صلبة.",
        iconName: "Wrench",
        features: ["كليكي باتجاهين 72 سن", "13 حبة مقاس 4-14mm", "حقيبة صلبة مقاومة للصدمات"],
      },
      {
        id: 3,
        name: "مفك مرن 11 قطعة STARLCE PRO",
        tag: "للزوايا والأماكن الضيقة",
        desc: "خرطوم مرن عالي التحمل يلتوي للوصول لأصعب البراغي في المحرك والزوايا المحصورة مع مقبض مريح وطقم رؤوس صيانة.",
        iconName: "RotateCcw",
        features: ["مرونة دوران حتى 90 درجة", "مقبض مريح مانع للانزلاق", "رؤوس فك متنوعة"],
      },
      {
        id: 4,
        name: "طقم مفكات 6 قطع",
        tag: "الصيانة المنزلية والميكانيكية",
        desc: "3 مفكات صليبية و3 مفكات مسطحة بأطوال مختلفة، برؤوس ممغنطة تثبت البراغي ومقابض مطاطية مريحة مانعة للانزلاق.",
        iconName: "Hammer",
        features: ["رؤوس ممغنطة قوية", "فولاذ معالج حرارياً", "مقابض مريحة تمتص الصدمات"],
      },
    ],
    crossSellTargetId: "PACK2",
    crossSellHeading: "شوف باك المحترفين والورشة (Pack Pro 2)",
    crossSellSubtitle: "باقة متكاملة للورشة والأشغال الشاقة — ماكينة CROWN 20V ببطاريتين وقفازات GILAN",
    crossSellCtaText: "اضغط هنا لمعاينة باقة المحترفين 2",
    seo: {
      title: "باك منفاخ تويوتا وطقم المفاتيح — 4,950 د.ج | متجر أورفا ORVA Store",
      description:
        "باك الخدمة والصيانة 4 في 1 للسيارة والمنزل: منفاخ عجلات TOYOTA، طقم مفاتيح 46 قطعة، مفك مرن 11 قطعة، وطقم 6 مفكات بـ 4950 د.ج مع التوصيل والدفع عند الاستلام.",
      keywords: ["منفاخ عجلات تويوتا", "طقم مفاتيح 46 قطعة", "starcle pro", "مفكات", "الجزائر", "الدفع عند الاستلام"],
    },
  },

  PACK2: {
    id: "PACK2",
    slug: "pack2",
    route: "/pack2",
    nameAr: "باك ماكينة كراون CROWN 20V الأصلية",
    nameFr: "Pack Visseuse Crown Elite 5-en-1",
    subtitleAr: "5 أدوات احترافية للورشة، المنزل والصيانة",
    badgeAr: "باقة 5 في 1",
    badgeColor: "bg-amber-600",
    priceDzd: 12950,
    alternatePriceDzd: 12950,
    originalPriceDzd: 21250,
    savingsDzd: 8300,
    rating: 4.9,
    reviewsCount: 142,
    heroImage: "/images/packs/pack-2/hero.webp",
    allProductsImage: "/images/packs/pack-2/all-products.jpg",
    heroImageAlt: "باك المحترفين والورشة 5 في 1 — ماكينة CROWN 20V وطقم مفكات وطقم مفاتيح",
    descriptionAr:
      "باك المحترفين 5 في 1 للورشة والصيانة: ماكينة CROWN 20V ببطاريتين و29 قطعة، طقم مفكات 6 قطع، علبة مفاتيح 46 قطعة، مفك مرن 11 قطعة، وقفازات GILAN بـ 13390 د.ج.",
    highlightsAr: [
      "ماكينة ثقب CROWN 20V الأصلية مع 2 بطاريات 20V قوية وحقيبة تضم 29 قطعة وملحق",
      "علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO كليكي CR-V متكاملة",
      "مفك مرن 11 قطعة STARLCE PRO للأماكن والزوايا الضيقة",
      "طقم مفكات 6 قطع + قفازات حماية احترافية GILAN الأصلية",
    ],
    boxItems: [
      {
        id: 1,
        name: "ماكينة ثقب CROWN 20V الأصلية (مع 2 بطاريات 20V وحقيبة 29 قطعة)",
        tag: "ضمان CROWN الرسمي",
        desc: "ماكينة قوية بجهد 20V للأعمال المكثفة، تأتي مع 2 بطاريات ليثيوم سريعة الشحن، شاحن أصلي، وحقيبة صلبة تضم 29 قطعة ملحقة تشمل رؤوس ثقب وفك.",
        iconName: "Zap",
        features: ["2 بطاريات 20V ليثيوم قوية", "حقيبة ملحقات متكاملة 29 قطعة", "إضاءة LED مدمجة للرؤية"],
      },
      {
        id: 2,
        name: "طقم مفكات 6 قطع",
        tag: "رؤوس ممغنطة ومقابض مريحة",
        desc: "6 مفكات مسطحة وصليبية بمقابض مريحة لمختلف أعمال الفك والتركيب اليومية في الورشة والمنزل.",
        iconName: "Hammer",
        features: ["3 مفكات صليبية + 3 مسطحة", "رؤوس ممغنطة لتثبيت البراغي", "مقابض مانعة للانزلاق"],
      },
      {
        id: 3,
        name: "علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO",
        tag: "جودة صناعية CR-V",
        desc: "مع ذراع كليكي (Ratchet) ورؤوس صيانة متكاملة مع حبات ومفصل مرن عالي التحمل لجميع أعمال الفك السريع.",
        iconName: "Wrench",
        features: ["ذراع كليكي 1/4 بوصة سريع", "13 حبة من 4 إلى 14 ملم", "حقيبة تخزين مدمجة"],
      },
      {
        id: 4,
        name: "مفك مرن 11 قطعة STARLCE PRO",
        tag: "خرطوم مرن للأماكن الضيقة",
        desc: "خرطوم مرن للوصول للأماكن والزوايا الضيقة التي يصعب الوصول إليها بالمفكات العادية.",
        iconName: "RotateCcw",
        features: ["انحناء مرن للزوايا المستحيلة", "حامل رؤوس ممغنط", "10 رؤوس متنوعة"],
      },
      {
        id: 5,
        name: "قفازات حماية احترافية GILAN",
        tag: "حماية مضادة للانزلاق",
        desc: "لحماية اليدين ومقاومة الانزلاق أثناء الخدمة، مع قبضة محكمة ومقاومة عالية للتآكل والتمزق.",
        iconName: "ShieldCheck",
        features: ["مقاومة عالية للتمزق والجروح", "راحة يد مانعة للانزلاق", "قماش مريح وقابل للتهوية"],
      },
    ],
    crossSellTargetId: "PACK3",
    crossSellHeading: "شوف باك اللحام والورشة (Pack Soudure 3)",
    crossSellSubtitle: "باك اللحام والورشة — ماكينة CROWN CT33102 MMA-200 MINI وقفازات GILAN وملحقات اللحام",
    crossSellCtaText: "اضغط هنا لمعاينة باك اللحام 3",
    seo: {
      title: "باك ماكينة كراون CROWN 20V الأصلية — 12,950 د.ج | متجر أورفا ORVA Store",
      description:
        "باك المحترفين 5 في 1 للورشة والصيانة: ماكينة CROWN 20V ببطاريتين و29 قطعة، طقم مفكات 6 قطع، علبة مفاتيح 46 قطعة، مفك مرن 11 قطعة، وقفازات GILAN بـ 13390 د.ج.",
      keywords: ["ماكينة ثقب crown 20v", "فيسوز كراون", "قفازات gilan", "طقم مفاتيح 46 قطعة", "الجزائر"],
    },
  },

  PACK3: {
    id: "PACK3",
    slug: "pack3",
    route: "/pack3",
    nameAr: "باك الأشغال الشاقة CROWN و Starcle Pro",
    nameFr: "Pack Soudeur Crown MMA-200 Mini",
    subtitleAr: "ماكينة لحام CROWN MMA-200 MINI مع قفازات حماية GILAN وملحقات اللحام",
    badgeAr: "باقة 6 في 1",
    badgeColor: "bg-purple-700",
    priceDzd: 15950,
    originalPriceDzd: 24500,
    savingsDzd: 8550,
    rating: 4.9,
    reviewsCount: 96,
    heroImage: "/images/packs/pack-3/hero.webp",
    allProductsImage: "/images/packs/pack-3/all-products.jpg",
    heroImageAlt: "باك اللحام والورشة — ماكينة لحام CROWN MMA-200 MINI مع قفازات حماية GILAN وملحقات",
    descriptionAr:
      "باك اللحام والورشة: ماكينة لحام CROWN CT33102 MMA-200 MINI مع قفازات حماية GILAN Anti-Cut، قناع لحام، فرشاة سلك، طقم مفكات 6 قطع، وكوابل لحام بـ 15,950 د.ج.",
    highlightsAr: [
      "ماكينة لحام CROWN CT33102 MMA-200 MINI بتقنية IGBT العاكسة الحديثة",
      "تحكم دقيق في قوة اللحام (Current Control) لتفادي ثقب الحديد الرقيق",
      "نظام أمان VRD مدمج يخفض التوتر الكهربائي في وضع الاستعداد للحماية القصوى",
      "قفازات حماية GILAN Anti-Cut + قناع لحام + فرشاة سلك وكوابل لحام نحاسية",
    ],
    boxItems: [
      {
        id: 1,
        name: "ماكينة لحام CROWN CT33102 MMA-200 MINI",
        tag: "تقنية IGBT المتطورة",
        desc: "تلحملك الحديد بالباڨيتة المناسبة، مع إمكانية ضبط الأمبير حسب نوع وسماكة الحديد، باش تتحصل على لحام مليح وتقلّل من الأخطاء والثقوب في الحديد الرقيق.",
        iconName: "Flame",
        features: ["تيار لحام قوي 200A", "شاشة رقمية دقيقة", "وزن مدمج خفيف وسهل النقل"],
      },
      {
        id: 2,
        name: "تحكم في قوة اللحام (Current Control)",
        tag: "ضبط دقيق للأمبير",
        desc: "تتحكم في قوة اللحام حسب الخدمة لي راك تديرها وقطر الباڨيتة المستعملة من 1.6 ملم إلى 4.0 ملم.",
        iconName: "Sliders",
        features: ["مقبض تحكم سلس ومضبوط", "ثبات القوس الكهربائي", "حماية من التصاق القطب"],
      },
      {
        id: 3,
        name: "نظام أمان VRD مدمج",
        tag: "أمان كهربائي متقدم",
        desc: "تنقص التوتر الكهربائي في وضع الاستعداد، للمساعدة على زيادة الأمان أثناء الاستعمال وتفادي الصدمات.",
        iconName: "ShieldAlert",
        features: ["تخفيض الجهد في وضع الاستعداد", "حماية ضد الصعق في الرطوبة", "معايير أمان معتمدة"],
      },
      {
        id: 4,
        name: "قفازات الحماية GILAN Anti-Cut",
        tag: "حماية اليدين من الجروح والحرارة",
        desc: "تساعد على حماية اليدين من الجروح والخدوش، وتوفّر قبضة ثابتة أثناء التعامل مع الحديد والأدوات والحرارة.",
        iconName: "ShieldCheck",
        features: ["مقاومة فائقة للقطع والجروح", "مقاومة الشرر والحرارة", "حماية ممتدة للمعصم"],
      },
      {
        id: 5,
        name: "طقم مفكات 6 قطع KKKR",
        tag: "فولاذ عالي الصلابة",
        desc: "مفكات بمقابض مريحة لمختلف أعمال الفك والتركيب والصيانة اليومية للأبواب وهياكل الحديد.",
        iconName: "Hammer",
        features: ["3 صليبية و3 مسطحة", "رؤوس ممغنطة عالية القوة", "مقابض مقاومة للانزلاق"],
      },
      {
        id: 6,
        name: "قناع لحام + فرشاة سلك + كوابل لحام",
        tag: "ملحقات اللحام الأساسية",
        desc: "ملحقات أساسية للحام: قناع حماية الوجه والعينين، فرشاة تنظيف الخبث مع مطرقة، وكوابل نحاسية مع ملقط اللحام وملقط الكتلة.",
        iconName: "HardHat",
        features: ["قناع حماية مع زجاج داكن", "فرشاة سلك ومطرقة تنظيف الخبث", "كوابل نحاسية أصلية مع كماشات"],
      },
    ],
    crossSellTargetId: "PACK2",
    crossSellHeading: "شوف باك المحترفين والورشة (Pack Pro 2)",
    crossSellSubtitle: "باقة متكاملة للورشة والأشغال — ماكينة CROWN 20V ببطاريتين وقفازات GILAN",
    crossSellCtaText: "اضغط هنا لمعاينة باقة المحترفين 2",
    seo: {
      title: "باك الأشغال الشاقة CROWN و Starcle Pro — 15,950 د.ج | متجر أورفا ORVA Store",
      description:
        "باك اللحام والورشة: ماكينة لحام CROWN CT33102 MMA-200 MINI مع قفازات حماية GILAN Anti-Cut، قناع لحام، فرشاة سلك، طقم مفكات 6 قطع، وكوابل لحام بـ 15,950 د.ج.",
      keywords: ["ماكينة لحام كراون", "crown ct33102", "mma 200 mini", "قفازات gilan", "لحام كهربائي", "الجزائر"],
    },
  },
};
