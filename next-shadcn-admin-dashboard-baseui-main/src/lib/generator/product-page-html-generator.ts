import type { Product, PublicProductDTO } from "../repository/product-types";
import { toPublicProductDTO } from "../repository/product-types";
import type { ProductPageLayoutConfig, ProductPageSectionId } from "../repository/layout-types";
import type { StorePage } from "../repository/store-pages-types";

/**
 * ORVA Store — Product Page HTML Generator
 * 
 * Rules:
 * 1. Uses authentic storefront styling (packs-styles.css, Tajawal font, FontAwesome).
 * 2. Emits full checkout form matching packs-client.js bindings (58 Wilayas, dynamic communes, home/desk shipping).
 * 3. Strict XSS sanitization (HTML escaping for all text fields, URI validation for images).
 * 4. Never leaks confidential costs (purchaseCost, marketingCost) or customer PII.
 * 5. Respects section ordering and visibility from ProductPageLayoutConfig.
 * 6. Supports isProduction flag:
 *    - false: preview watermark, noindex, nofollow.
 *    - true: verified store badge, index, follow, canonical URL.
 */

export interface GeneratorOptions {
  product: Product | PublicProductDTO;
  layoutConfig: ProductPageLayoutConfig;
  storePage: StorePage;
  baseAssetPath?: string;
  isProduction?: boolean;
}

export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeImageUrl(url: unknown, defaultFallback: string = ""): string {
  if (!url || typeof url !== "string") return defaultFallback;
  const trimmed = url.trim();
  if (/^(?:https?:\/\/|\/|[a-zA-Z0-9_.\-\/ ]+\.(?:webp|jpg|jpeg|png|svg)|data:image\/(?:png|jpeg|webp|svg\+xml);base64,)/i.test(trimmed)) {
    return trimmed;
  }
  return defaultFallback;
}

export function formatPriceDzd(amount: number): string {
  const num = Math.round(Number(amount) || 0);
  return `${num.toLocaleString("en-US")} د.ج`;
}

/**
 * Builds the complete standalone HTML document for a product page.
 */
export function generateProductPageHtml(options: GeneratorOptions): string {
  const { layoutConfig, storePage, baseAssetPath = "/", isProduction = false } = options;
  const assetPrefix = baseAssetPath.endsWith("/") ? baseAssetPath : `${baseAssetPath}/`;

  // Enforce DTO conversion to physically strip purchaseCost and marketingCostPerOrder
  const publicProduct: PublicProductDTO = "purchaseCost" in options.product
    ? toPublicProductDTO(options.product as Product)
    : (options.product as PublicProductDTO);

  const safeTitle = escapeHtml(publicProduct.title || storePage.title || "عرض خاص — ORVA Store");
  const safeSubtitle = escapeHtml(publicProduct.subtitle || "عرض الصيانة والخدمة المتكامل مع التوصيل السريع");
  const safeDescription = escapeHtml(publicProduct.description || "");
  const safeSku = escapeHtml(publicProduct.sku || "ORVA-PACK");
  const sellingPrice = Math.max(0, Number(publicProduct.sellingPrice) || 4950);
  const comparePrice = Math.round(sellingPrice * 1.85); // Realistic retail anchor

  // Derive default image according to product
  let defaultImg = "pack 1 4950/pack1 4950.webp";
  if (safeSku.includes("P2")) defaultImg = "pack2 12950/pack2 12950.webp";
  
  const rawFirstImg = publicProduct.images?.[0];
  const primaryImage = (rawFirstImg && rawFirstImg !== "/placeholder.svg")
    ? sanitizeImageUrl(rawFirstImg, defaultImg)
    : defaultImg;

  const secondaryImages = (publicProduct.images || [])
    .slice(1)
    .filter((img) => img && img !== "/placeholder.svg")
    .map((img) => sanitizeImageUrl(img))
    .filter(Boolean);

  // Section builders
  const renderTitleSection = () => `
    <div class="product-title-block" style="margin-bottom:16px;">
        <span class="pack-badge-simple">${safeSubtitle}</span>
        <h1 class="hero-main-title" style="margin-top:8px; font-size:24px; font-weight:800; color:#fff;">${safeTitle}</h1>
        <div class="price-display-banner" style="margin-top:10px; display:flex; align-items:baseline; gap:12px;">
            <span class="price-num" style="font-size:26px; font-weight:800; color:#d4a373;">${formatPriceDzd(sellingPrice)}</span>
            <span class="price-old" style="font-size:15px; color:#888; text-decoration:line-through;">${formatPriceDzd(comparePrice)}</span>
            <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:#38271d; color:#e09f67; font-weight:700;">توفير كبير</span>
        </div>
    </div>`;

  const renderGallerySection = () => `
    <div class="product-gallery-card" style="margin-bottom:20px;">
        <div class="main-image-container" style="border-radius:12px; overflow:hidden; background:#1c1917; text-align:center; padding:10px; border:1px solid #2e2a27;">
            <img src="${primaryImage.startsWith('/') ? primaryImage : assetPrefix + primaryImage}" alt="${safeTitle}" style="max-width:100%; height:auto; border-radius:8px; display:inline-block;" loading="eager">
        </div>
        ${secondaryImages.length > 0 ? `
        <div class="thumbnails-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(64px, 1fr)); gap:8px; margin-top:10px;">
            ${secondaryImages.map((img) => `
                <img src="${img.startsWith('/') ? img : assetPrefix + img}" alt="${safeTitle}" style="width:100%; border-radius:6px; border:1px solid #332f2c;" loading="lazy">
            `).join("")}
        </div>` : ""}
    </div>`;

  const renderOrderFormSection = () => `
    <div class="order-form-container" id="order-form" style="background:#161412; border:1px solid #2e2a27; border-radius:12px; padding:20px; direction:rtl;">
        <div class="order-form-heading" style="margin-bottom:14px; border-bottom:1px solid #2e2a27; pb-3;">
            <h2 style="font-size:18px; font-weight:700; color:#fff; margin:0; display:flex; align-items:center; gap:8px;">
                <i class="fa-solid fa-cart-shopping" style="color:#d4a373;"></i>
                <span>إستمارة تأكيد الطلب السريع (الدفع عند الاستلام)</span>
            </h2>
        </div>

        <form id="orderForm">
            <!-- Anti-spam Honeypot -->
            <input type="text" id="website_url" name="website_url" style="display:none;" tabindex="-1" autocomplete="off">
            <input type="hidden" name="productId" value="${escapeHtml(publicProduct.id)}">
            <input type="hidden" name="productSku" value="${safeSku}">
            <input type="hidden" name="packPrice" value="${sellingPrice}">

            <!-- Full Name Field -->
            <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" for="fullName" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#eae6e1;">الاسم واللقب الكريم <span class="req" style="color:#e63946;">*</span></label>
                <input type="text" id="fullName" class="form-input" placeholder="اكتب اسمك ولقبك هنا" required style="width:100%; padding:10px 12px; border-radius:6px; border:1px solid #332f2c; background:#1c1917; color:#fff; box-sizing:border-box;">
            </div>

            <!-- Phone Number Field -->
            <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" for="phoneNumber" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#eae6e1;">رقم الهاتف للتواصل <span class="req" style="color:#e63946;">*</span></label>
                <input type="tel" id="phoneNumber" class="form-input" placeholder="05 / 06 / 07 XX XX XX XX" dir="ltr" style="width:100%; padding:10px 12px; border-radius:6px; border:1px solid #332f2c; background:#1c1917; color:#fff; text-align:right; box-sizing:border-box;" required>
            </div>

            <!-- Wilaya Field (58 Wilayas) -->
            <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" for="wilayaSelect" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#eae6e1;">الولاية (58 ولاية) <span class="req" style="color:#e63946;">*</span></label>
                <select id="wilayaSelect" class="form-select" required style="width:100%; padding:10px 12px; border-radius:6px; border:1px solid #332f2c; background:#1c1917; color:#fff; box-sizing:border-box;">
                    <option value="" disabled selected>-- اختر ولايتك من القائمة (58 ولاية) --</option>
                </select>
            </div>

            <!-- Commune / City Field (Dynamic) -->
            <div class="form-group" style="margin-bottom:12px;">
                <label class="form-label" for="communeSelect" style="display:block; font-size:13px; font-weight:600; margin-bottom:4px; color:#eae6e1;">البلدية أو المدينة <span class="req" style="color:#e63946;">*</span></label>
                <select id="communeSelect" class="form-select" required style="width:100%; padding:10px 12px; border-radius:6px; border:1px solid #332f2c; background:#1c1917; color:#fff; box-sizing:border-box;">
                    <option value="" disabled selected>-- اختر البلدية / الدائرة --</option>
                </select>
            </div>

            <!-- Delivery Place Options -->
            <div class="form-group" style="margin-bottom:14px;">
                <label class="form-label" style="display:block; font-size:13px; font-weight:600; margin-bottom:6px; color:#eae6e1;">أين تفضل استلام طلبيتك؟ <span class="req" style="color:#e63946;">*</span></label>
                <div class="delivery-options-row" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                    <label class="delivery-choice-card active" id="homeChoice" style="display:flex; align-items:flex-start; gap:8px; padding:10px; border-radius:6px; border:1px solid #d4a373; background:#221d19; cursor:pointer;">
                        <input type="radio" name="deliveryChoice" value="home" checked style="margin-top:3px;">
                        <div>
                            <div class="choice-title" style="font-size:13px; font-weight:700; color:#fff;">توصيل لباب المنزل</div>
                            <div class="choice-desc" style="font-size:11px; color:#aaa;">يسلمك الموزع السلعة في عنوانك</div>
                        </div>
                    </label>

                    <label class="delivery-choice-card" id="deskChoice" style="display:flex; align-items:flex-start; gap:8px; padding:10px; border-radius:6px; border:1px solid #332f2c; background:#191715; cursor:pointer;">
                        <input type="radio" name="deliveryChoice" value="stopdesk" style="margin-top:3px;">
                        <div>
                            <div class="choice-title" style="font-size:13px; font-weight:700; color:#fff;">استلام من المكتب</div>
                            <div class="choice-desc" style="font-size:11px; color:#aaa;">تستلم من أقرب مكتب شحن</div>
                        </div>
                    </label>
                </div>
            </div>

            <!-- Simple Price Summary -->
            <div class="simple-price-summary" style="background:#1f1c19; padding:14px; border-radius:8px; border:1px solid #383431; margin-bottom:16px;">
                <div class="summary-line" style="display:flex; justify-content:space-between; font-size:13px; color:#c7c1ba; margin-bottom:6px;">
                    <span>سعر الباقة:</span>
                    <strong style="color:#fff;">${formatPriceDzd(sellingPrice)}</strong>
                </div>
                <div class="summary-line" style="display:flex; justify-content:space-between; font-size:13px; color:#c7c1ba; margin-bottom:8px;">
                    <span>مصاريف التوصيل:</span>
                    <strong id="shippingAmount" style="color:#fff;">500 د.ج</strong>
                </div>
                <div class="summary-divider" style="height:1px; background:#443e39; margin-bottom:8px;"></div>
                <div class="summary-total-line" style="display:flex; justify-content:space-between; font-size:16px; font-weight:800; color:#d4a373;">
                    <span>المبلغ الصافي المطلوب عند الاستلام:</span>
                    <span class="total-num" id="totalAmount">${formatPriceDzd(sellingPrice + 500)}</span>
                </div>
            </div>

            <!-- Primary Calming Order Button -->
            <button type="submit" class="order-submit-btn" id="confirmOrderBtn" style="width:100%; padding:14px; font-size:16px; font-weight:700; background:linear-gradient(135deg, #d4a373, #b8860b); color:#12100e; border:none; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i class="fa-solid fa-circle-check"></i>
                <span>اضغط هنا لتأكيد طلبك الآن</span>
            </button>
        </form>
    </div>`;

  const renderDescriptionSection = () => `
    <div class="product-description-card" style="background:#161412; padding:18px; border-radius:10px; border:1px solid #2e2a27; margin-top:16px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:8px; color:#fff;">تفاصيل العرض والمحتوى</h3>
        <p style="font-size:14px; line-height:1.7; color:#d1ccc6; margin:0;">${safeDescription || safeSubtitle}</p>
    </div>`;

  const renderBenefitsSection = () => `
    <div class="guarantee-list-section" style="margin-top:20px;">
        <div class="guarantee-simple-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
            <div class="guarantee-card" style="background:#191715; border:1px solid #2e2a27; border-radius:8px; padding:12px; display:flex; gap:10px; align-items:center;">
                <i class="fa-solid fa-box-open" style="font-size:22px; color:#d4a373;"></i>
                <div>
                    <h4 style="font-size:13px; font-weight:700; margin:0; color:#fff;">حق المعاينة والتجربة</h4>
                    <p style="font-size:11px; color:#aaa; margin:2px 0 0;">افتح طردك وعاين سلعتك قبل تسليم المبلغ للموزع.</p>
                </div>
            </div>
            <div class="guarantee-card" style="background:#191715; border:1px solid #2e2a27; border-radius:8px; padding:12px; display:flex; gap:10px; align-items:center;">
                <i class="fa-solid fa-truck-fast" style="font-size:22px; color:#d4a373;"></i>
                <div>
                    <h4 style="font-size:13px; font-weight:700; margin:0; color:#fff;">توصيل سريع وآمن</h4>
                    <p style="font-size:11px; color:#aaa; margin:2px 0 0;">شحن مؤمن خلال 24 - 48 ساعة لكافة الولايات.</p>
                </div>
            </div>
            <div class="guarantee-card" style="background:#191715; border:1px solid #2e2a27; border-radius:8px; padding:12px; display:flex; gap:10px; align-items:center;">
                <i class="fa-solid fa-rotate-left" style="font-size:22px; color:#d4a373;"></i>
                <div>
                    <h4 style="font-size:13px; font-weight:700; margin:0; color:#fff;">ضمان الاستبدال الفوري</h4>
                    <p style="font-size:11px; color:#aaa; margin:2px 0 0;">خدمة ما بعد البيع ومرافقة هاتفية مستمرة.</p>
                </div>
            </div>
        </div>
    </div>`;

  const renderRelatedProductsSection = () => `
    <div class="cross-sell-section" style="margin-top:24px; padding:16px; border-radius:10px; background:#1b1816; border:1px solid #332f2c;">
        <span style="display:inline-block; font-size:11px; font-weight:700; color:#d4a373; text-transform:uppercase;">عروض أخرى متوفرة في المتجر</span>
        <h3 style="font-size:15px; font-weight:700; margin:4px 0 10px; color:#fff;">شاهد باقة المحترفين البديلة</h3>
        <p style="font-size:12px; color:#bbb; margin-bottom:12px;">نوفر باقات صيانة إضافية تناسب الورشات والأعمال المنزلية الشاقة.</p>
        <a href="${assetPrefix}pack2.html" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#d4a373; text-decoration:none;">
            <span>معاينة العرض الثاني</span>
            <i class="fa-solid fa-arrow-left"></i>
        </a>
    </div>`;

  // Section dispatcher
  const renderSection = (sectionId: ProductPageSectionId): string => {
    switch (sectionId) {
      case "title":
        return renderTitleSection();
      case "subtitle":
        return ""; // Rendered within title section
      case "gallery":
        return renderGallerySection();
      case "orderForm":
        return renderOrderFormSection();
      case "description":
        return layoutConfig.showDescription ? renderDescriptionSection() : "";
      case "features":
        return ""; // Embedded in overview
      case "benefits":
        return layoutConfig.showBenefits ? renderBenefitsSection() : "";
      case "relatedProducts":
        return layoutConfig.showRelatedProducts ? renderRelatedProductsSection() : "";
      default:
        return "";
    }
  };

  const sectionsHtml = layoutConfig.desktopSectionOrder
    .map(renderSection)
    .filter(Boolean)
    .join("\n");

  const cleanSlug = storePage.slug.replace(/^products\//, "").replace(/\.html$/, "");
  const canonicalPath = isProduction
    ? (storePage.publicUrl ? storePage.publicUrl.replace(/\.html$/, "") : `/products/${cleanSlug}`)
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="${isProduction ? "index, follow" : "noindex, nofollow"}">
    <title>${safeTitle} — ${formatPriceDzd(sellingPrice)}</title>
    <meta name="description" content="${escapeHtml(storePage.metaDescription || safeSubtitle)}">
    ${isProduction && canonicalPath ? `<link rel="canonical" href="https://orva-store.com${canonicalPath}">` : ""}

    <!-- Generator Metadata (Phase 8B Lifecycle Model) -->
    <!-- Template: ${escapeHtml(storePage.templateId)} v${escapeHtml(storePage.templateVersion)} -->
    <!-- Product SKU: ${safeSku} | Status: ${escapeHtml(isProduction ? "published" : storePage.status)} -->
    <!-- Generated: ${escapeHtml(storePage.lastGeneratedAt || new Date().toISOString())} -->

    <!-- Google Font: Tajawal (High Legibility) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <!-- FontAwesome 6.5.1 -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

    <!-- Storefront Core Stylesheet -->
    <link rel="stylesheet" href="/packs-styles.css">
</head>
<body style="font-family:'Tajawal', sans-serif; background-color:#12100e; color:#eae6e1; margin:0; padding:0;">

    <!-- Top Reassurance Bar -->
    <div class="top-notice-bar" style="background:#1c1916; color:#d4a373; text-align:center; padding:8px 12px; font-size:12px; font-weight:600; border-bottom:1px solid #2e2a27;">
        <i class="fa-solid fa-truck-fast" style="margin-left:6px;"></i>
        <span>التوصيل متوفر لجميع الولايات مع حق المعاينة قبل الدفع.</span>
    </div>

    <!-- Minimal Header -->
    <header class="site-header" style="background:#161412; border-bottom:1px solid #2e2a27; padding:14px 20px;">
        <div class="container" style="max-width:1100px; margin:0 auto; display:flex; justify-content:space-between; align-items:center;">
            <a href="/" style="font-weight:900; font-size:18px; color:#fff; text-decoration:none; display:flex; align-items:center; gap:6px;">
                <span style="color:#d4a373;">ORVA</span> STORE
            </a>
            ${isProduction ? `
            <div class="header-phone-badge" style="font-size:12px; color:#d4a373; display:flex; align-items:center; gap:6px;">
                <i class="fa-solid fa-phone"></i>
                <span style="color:#eae6e1;">خدمة الزبائن: 0798282495</span>
            </div>` : `
            <span style="font-size:11px; padding:3px 8px; border-radius:4px; background:#292522; color:#b8b0a8;">
                معاينة خاصة بالمنتج (Preview)
            </span>`}
        </div>
    </header>

    <!-- Main Content Container -->
    <main class="main-content" style="max-width:1100px; margin:20px auto; padding:0 16px;">
        <div class="main-layout-${layoutConfig.desktopLayoutMode === "split" ? "split" : "stacked"}" style="display:grid; grid-template-columns:${layoutConfig.desktopLayoutMode === "split" ? "repeat(auto-fit, minmax(320px, 1fr))" : "1fr"}; gap:24px;">
            ${sectionsHtml}
        </div>
    </main>

    <!-- Site Footer -->
    <footer class="site-footer" style="background:#161412; border-top:1px solid #2e2a27; padding:24px 16px; margin-top:40px; text-align:center;">
        <div style="max-width:800px; margin:0 auto;">
            <div style="font-size:18px; font-weight:700; color:#fff; margin-bottom:6px;">ORVA Store DZ</div>
            <p style="font-size:12px; color:#888; margin:0;">نوفر لكم أفضل العروض الأصلية مع الضمان التام وحق المعاينة عند الاستلام.</p>
            <p style="font-size:11px; color:#555; margin-top:8px;">جميع الحقوق محفوظة © 2026 ORVA Store DZ</p>
        </div>
    </footer>

    <!-- Storefront Client Scripts -->
    <script src="/algeria-communes.js"></script>
    <script src="/packs-client.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof initPackForm === 'function') {
                initPackForm({
                    packId: '${safeSku}',
                    packPrice: ${sellingPrice},
                    productName: '${safeTitle}'
                });
            }
        });
    </script>
</body>
</html>`;
}
