import type { StoreProduct } from "@/lib/catalog/types";

export const ORVA_CANONICAL_ORIGIN = "https://orva-store.com";
export const ORVA_CONTACT_PHONE = "+213798282495";
export const ORVA_CONTACT_PHONE_DISPLAY = "0798 28 24 95";
export const ORVA_CONTACT_EMAIL = "contact@orva-store.com";
export const ORVA_WHATSAPP_URL = "https://wa.me/213798282495";

const HOMEPAGE_FAQS = [
  {
    question: "هل يمكنني فتح الطرد وفحصه قبل أن أدفع؟",
    answer:
      "نعم، بكل تأكيد! نحن نعتمد سياسة المعاينة قبل الدفع. يحق لك فتح الطرد والتأكد من مطابقة جميع الأدوات المذكورة في العرض قبل تسليم أي سنتيم للموزع.",
  },
  {
    question: "كم يستغرق وصول الطرد إلى ولايتي؟",
    answer:
      "يصل الطرد عادةً خلال 24 إلى 48 ساعة لكافة ولايات الشمال والهضاب، ومن 48 إلى 72 ساعة كأقصى تقدير للولايات الجنوبية.",
  },
  {
    question: "كيف يتم تأكيد طلبيتي بعد التسجيل في الموقع؟",
    answer:
      "بمجرد إرسال الإستمارة، يتصل بك أحد مسؤولي خدمة العملاء عبر رقمك المسجل لتأكيد العنوان واختيار طريقة التوصيل (إلى المنزل أو مكتب التوصيل).",
  },
  {
    question: "هل المنتجات أصلية؟",
    answer:
      "نعم، جميع ماكينات وأدوات CROWN و STARCLE PRO المعروضة في المتجر أصلية ومطابقة للمواصفات الفنية المذكورة.",
  },
] as const;

/**
 * Builds rich multi-type Schema.org JSON-LD (@graph) describing ORVA Store Algeria:
 * Organization, LocalBusiness, Store, WebSite, WebPage, ItemList/Product/Offer, and FAQPage.
 */
export function buildStorefrontHomeJsonLd(products: StoreProduct[]) {
  const organizationId = `${ORVA_CANONICAL_ORIGIN}/#organization`;
  const websiteId = `${ORVA_CANONICAL_ORIGIN}/#website`;
  const webpageId = `${ORVA_CANONICAL_ORIGIN}/#webpage`;

  const productListItems = products.map((product, index) => {
    const productUrl = `${ORVA_CANONICAL_ORIGIN}${product.route}`;
    const imageUrl = product.landing.heroImage.startsWith("http")
      ? product.landing.heroImage
      : `${ORVA_CANONICAL_ORIGIN}${product.landing.heroImage}`;

    return {
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Product",
        "@id": `${productUrl}#product`,
        name: product.title,
        description: product.description || product.subtitle || product.landing.seo.description,
        sku: product.sku || product.packId,
        image: imageUrl,
        url: productUrl,
        brand: {
          "@type": "Brand",
          name: "CROWN & STARCLE PRO",
        },
        offers: {
          "@type": "Offer",
          priceCurrency: "DZD",
          price: String(product.priceDzd),
          availability:
            product.showOutOfStock || product.stockQuantity <= 0
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
          url: productUrl,
          seller: {
            "@id": organizationId,
          },
        },
      },
    };
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["Organization", "LocalBusiness", "Store"],
        "@id": organizationId,
        name: "ORVA Store Algeria | متجر أورفا",
        alternateName: "ORVA STORE DZ",
        url: `${ORVA_CANONICAL_ORIGIN}/`,
        logo: {
          "@type": "ImageObject",
          url: `${ORVA_CANONICAL_ORIGIN}/images/orva-logo.png`,
        },
        image: `${ORVA_CANONICAL_ORIGIN}/images/orva-logo.png`,
        description:
          "المتجر الجزائري المتخصص في عتاد وأدوات الورشة والصيانة الأصلية من CROWN و STARCLE PRO مع الدفع عند الاستلام، حق المعاينة قبل الدفع، والتوصيل إلى 58 ولاية.",
        telephone: ORVA_CONTACT_PHONE,
        email: ORVA_CONTACT_EMAIL,
        priceRange: "4950 DZD - 29900 DZD",
        currenciesAccepted: "DZD",
        paymentAccepted: "Cash on Delivery",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Biskra",
          addressRegion: "Biskra",
          addressCountry: "DZ",
        },
        areaServed: {
          "@type": "Country",
          name: "Algeria",
        },
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer service",
            telephone: ORVA_CONTACT_PHONE,
            email: ORVA_CONTACT_EMAIL,
            areaServed: "DZ",
            availableLanguage: ["ar", "fr", "en"],
          },
        ],
        sameAs: [ORVA_WHATSAPP_URL, "https://www.orva-store.com/"],
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: `${ORVA_CANONICAL_ORIGIN}/`,
        name: "ORVA Store Algeria",
        inLanguage: ["ar-DZ", "fr-DZ"],
        publisher: {
          "@id": organizationId,
        },
        potentialAction: {
          "@type": "SearchAction",
          target: `${ORVA_CANONICAL_ORIGIN}/shop/?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "WebPage",
        "@id": webpageId,
        url: `${ORVA_CANONICAL_ORIGIN}/`,
        name: "متجر أورفا | ORVA STORE DZ — عتاد ومعدات الصيانة والورشة الأصلية",
        isPartOf: {
          "@id": websiteId,
        },
        about: {
          "@id": organizationId,
        },
        primaryImageOfPage: `${ORVA_CANONICAL_ORIGIN}/images/orva-logo.png`,
      },
      {
        "@type": "ItemList",
        "@id": `${ORVA_CANONICAL_ORIGIN}/#catalog`,
        name: "باقات وعروض متجر أورفا",
        numberOfItems: productListItems.length,
        itemListElement: productListItems,
      },
      {
        "@type": "FAQPage",
        "@id": `${ORVA_CANONICAL_ORIGIN}/#faq`,
        mainEntity: HOMEPAGE_FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}
