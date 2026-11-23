export const STOREFRONT_LINK_HEADER = [
  '</llms.txt>; rel="llms-txt"; type="text/plain"',
  '</>; rel="alternate"; type="text/markdown"',
  '</.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"',
].join(", ");

function normalizeStorePath(pathname: string): string {
  const clean = pathname.replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

export function isMarkdownNegotiablePath(pathname: string): boolean {
  const normalized = normalizeStorePath(pathname);
  if (
    normalized === "/" ||
    normalized === "/shop" ||
    normalized === "/about" ||
    normalized === "/contact" ||
    normalized === "/terms" ||
    normalized === "/pack1" ||
    normalized === "/pack2" ||
    normalized === "/pack3" ||
    normalized.startsWith("/p/")
  ) {
    return true;
  }
  return false;
}

export function renderStorefrontMarkdown(pathname: string): string {
  const normalized = normalizeStorePath(pathname);

  if (normalized === "/shop") {
    return `# كل المنتجات — ORVA Store Algeria

> كتالوج متجر أورفا الرسمي لعتاد الورشة والصيانة من CROWN و STARCLE PRO. الدفع عند الاستلام مع حق المعاينة قبل الدفع والتوصيل إلى 69 ولاية جزائرية.

Canonical URL: https://orva-store.com/shop/

## الباقات المتوفرة

- [باك كومبريسار والمفاتيح 4 في 1 (Pack 1)](https://orva-store.com/pack1/) — 4,950 د.ج
- [باك ماكينة كراون CROWN 20V الأصلية (Pack 2)](https://orva-store.com/pack2/) — عتاد لاسلكي للورشة والمحترفين
- [باك الأشغال الشاقة CROWN و Starcle Pro (Pack 3)](https://orva-store.com/pack3/) — ماكينة تلحيم ومعدات الورشة الثقيلة

## التواصل والسياسات

- من نحن: https://orva-store.com/about/
- اتصل بنا: https://orva-store.com/contact/
- الشروط والأحكام: https://orva-store.com/terms/
- الهاتف: tel:+213798282495
- البريد الإلكتروني: mailto:contact@orva-store.com
`;
  }

  if (normalized === "/about") {
    return `# من نحن — ORVA Store Algeria (متجر أورفا)

Canonical URL: https://orva-store.com/about/

متجر أورفا DZ هو متجر إلكتروني جزائري متخصص في تجهيزات الورشة وأدوات الصيانة الأصلية من شركتي **CROWN** و **STARCLE PRO**.

## التزاماتنا الأساسية

- منتجات أصلية مباشرة بدون وسطاء.
- **الدفع عند الاستلام (Cash on Delivery)** عبر كافة 69 ولاية جزائرية.
- **حق المعاينة قبل الدفع:** يفتح الزبون الطرد ويتحقق من الأدوات قبل الدفع للموزع.
- توصيل سريع خلال 24 إلى 48 ساعة لولايات الشمال والهضاب، ومن 48 إلى 72 ساعة للجنوب.
- ضمان الاستبدال الفوري في حالة وجود أي خلل مصنعي عند الاستلام.

## الروابط والتواصل

- الرئيسية: https://orva-store.com/
- كل المنتجات: https://orva-store.com/shop/
- اتصل بنا: https://orva-store.com/contact/
- الشروط والأحكام: https://orva-store.com/terms/
- الهاتف: tel:+213798282495
- البريد الإلكتروني: mailto:contact@orva-store.com
`;
  }

  if (normalized === "/contact") {
    return `# اتصل بنا — خدمة زبائن ORVA Store Algeria

Canonical URL: https://orva-store.com/contact/

- **الهاتف المباشر:** [0798 28 24 95](tel:+213798282495)
- **البريد الإلكتروني:** [contact@orva-store.com](mailto:contact@orva-store.com)
- **واتساب الأعمال:** https://wa.me/213798282495
- **المنطقة والتغطية:** بسكرة — التوصيل والتأكيد الهاتفي متاحان لجميع 69 ولاية في الجزائر.

## ساعات الخدمة
- السبت إلى الخميس: 08:30 صباحاً — 20:00 مساءً (توقيت الجزائر Africa/Algiers UTC+1).
`;
  }

  if (normalized === "/terms") {
    return `# الشروط والأحكام وسياسة الاستبدال والخصوصية — ORVA Store Algeria

Canonical URL: https://orva-store.com/terms/

1. **الطلب والدفع عند الاستلام:** جميع الأسعار بالدينار الجزائري (DZD) ويتم الدفع نقداً للموزع بعد معاينة الطرد.
2. **حق المعاينة قبل الدفع:** يحق للزبون فتح الطرد والتحقق من سلامة العتاد ومطابقته للمحتوى المعلن قبل الدفع.
3. **سياسة الاستبدال:** في حال وجود أي عيب مصنعي أو نقص عند الاستلام، يتم استبدال المنتج دون تكاليف إضافية.
4. **الخصوصية وحماية البيانات:** تُستخدم معلومات الزبون (الاسم، الهاتف، الولاية، البلدية) حصراً لتأكيد الطلبية وشحنها ولا تُباع لأي جهة خارجية.

- البريد القانوني: mailto:contact@orva-store.com
- هاتف خدمة الزبائن: tel:+213798282495
`;
  }

  return `# متجر أورفا | ORVA Store Algeria — عتاد ومعدات الصيانة والورشة الأصلية

> المتجر الجزائري المتخصص في باقات العتاد وأدوات الصيانة الأصلية من **CROWN** و **STARCLE PRO**. الدفع عند الاستلام مع حق المعاينة والتوصيل إلى 69 ولاية.

- **Canonical:** https://orva-store.com/
- **llms.txt:** https://orva-store.com/llms.txt
- **MCP Server Card:** https://orva-store.com/.well-known/mcp/server-card.json
- **Sitemap XML:** https://orva-store.com/sitemap.xml

## الباقات والمنتجات الرئيسية

- [كل المنتجات (Shop Catalog)](https://orva-store.com/shop/)
- [باك 1: كومبريسار والمفاتيح 4 في 1](https://orva-store.com/pack1/)
- [باك 2: ماكينة كراون CROWN 20V الأصلية](https://orva-store.com/pack2/)
- [باك 3: باك الأشغال الشاقة والتلحيم](https://orva-store.com/pack3/)

## ضمانات الشراء من أورفا

1. **حق المعاينة قبل الدفع:** افحص العتاد يداً بيد قبل دفع أي مبلغ للموزع.
2. **توصيل لـ 69 ولاية:** للمنزل أو لمكتب التوصيل (Stop Desk) خلال 24–48 ساعة للشمال والهضاب، و48–72 ساعة للجنوب.
3. **حق الاستبدال:** استبدال فوري في حال أي نقص أو خلل مصنعي عند الاستلام.
4. **شراكة مباشرة مع CROWN:** عتاد أصلي مباشرة من المزود دون وسطاء.

## الأسئلة الشائعة (FAQ)

- **هل يمكنني فتح الطرد وفحصه قبل أن أدفع؟** نعم، نعتمد سياسة المعاينة قبل الدفع في جميع الولايات.
- **كم يستغرق وصول الطرد؟** 24–48 ساعة للشمال والهضاب، و48–72 ساعة للجنوب.
- **كيف يتم تأكيد الطلبية؟** عبر مكالمة هاتفية مباشرة من فريق خدمة العملاء فور تسجيل الطلب.
- **هل المنتجات أصلية؟** نعم، جميع أدوات CROWN و STARCLE PRO أصلية ومطابقة للمواصفات.

## الصفحات التعريفية والقانونية ووسائل الاتصال

- [من نحن (About Us)](https://orva-store.com/about/)
- [اتصل بنا (Contact Us)](https://orva-store.com/contact/)
- [الشروط والأحكام وسياسة الخصوصية (Terms & Conditions)](https://orva-store.com/terms/)
- الهاتف: [0798 28 24 95](tel:+213798282495)
- البريد الإلكتروني: [contact@orva-store.com](mailto:contact@orva-store.com)
- واتساب: https://wa.me/213798282495
`;
}
