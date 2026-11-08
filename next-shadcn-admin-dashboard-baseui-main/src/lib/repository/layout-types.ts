/**
 * ORVA Store — Phase 7C Product Page Layout Contracts & Types
 * 
 * Defines the schema for storefront product-page visual configurations,
 * section ordering for Desktop vs Mobile, visibility toggles, and mock layout persistence.
 */

export type ProductPageSectionId =
  | "title"
  | "subtitle"
  | "gallery"
  | "orderForm"
  | "description"
  | "features"
  | "benefits"
  | "relatedProducts";

export interface SectionDescriptor {
  id: ProductPageSectionId;
  labelAr: string;
  descriptionAr: string;
  isEssential: boolean; // Essential sections (like orderForm) can NEVER be hidden
  defaultVisible: boolean;
}

export const ALL_LAYOUT_SECTIONS: readonly SectionDescriptor[] = [
  {
    id: "title",
    labelAr: "عنوان المنتج الرئيسي",
    descriptionAr: "الاسم الرسمي للباقة أو المنتج وسعر البيع البارز",
    isEssential: false,
    defaultVisible: true,
  },
  {
    id: "subtitle",
    labelAr: "الشارة والوصف الفرعي",
    descriptionAr: "شارة الباقة والتعريف الموجز لمحتوى العرض",
    isEssential: false,
    defaultVisible: true,
  },
  {
    id: "gallery",
    labelAr: "معرض الصور وصورة الغلاف",
    descriptionAr: "الصورة الرئيسية ومعرض الصور التوضيحية للسلعة",
    isEssential: false,
    defaultVisible: true,
  },
  {
    id: "orderForm",
    labelAr: "نموذج الطلب السريع (Checkout)",
    descriptionAr: "إستمارة تأكيد الطلب السريع مع اختيار الولاية والبلدية وخيارات الاستلام",
    isEssential: true, // Cannot be disabled or hidden
    defaultVisible: true,
  },
  {
    id: "description",
    labelAr: "الوصف التفصيلي للمنتج",
    descriptionAr: "شرح كامل لمحتويات الباقة وطريقة الاستخدام",
    isEssential: false,
    defaultVisible: true,
  },
  {
    id: "features",
    labelAr: "قائمة المميزات والقطع المرفقة",
    descriptionAr: "تفصيل الأدوات أو الملحقات برؤوس نقاط وأيقونات توضيحية",
    isEssential: false,
    defaultVisible: true,
  },
  {
    id: "benefits",
    labelAr: "بطاقات الضمان ومزايا الشراء",
    descriptionAr: "حق المعاينة قبل الدفع، التوصيل السريع والدفع عند الاستلام",
    isEssential: false,
    defaultVisible: true,
  },
  {
    id: "relatedProducts",
    labelAr: "المنتجات المقترحة (Cross-sell)",
    descriptionAr: "عرض الباقات البديلة أو الملحقات الإضافية في نهاية الصفحة",
    isEssential: false,
    defaultVisible: true,
  },
];

export type DesktopLayoutMode = "stacked" | "split";

export interface ProductPageLayoutConfig {
  layoutVersion: number;
  productId: string; // Specific product ID or "global_default"
  desktopLayoutMode: DesktopLayoutMode; // "split" = gallery and form side-by-side on desktop
  desktopSectionOrder: ProductPageSectionId[];
  mobileSectionOrder: ProductPageSectionId[];
  showRelatedProducts: boolean;
  showDescription: boolean;
  showFeatures: boolean;
  showBenefits: boolean;
  updatedAt: string;
}

export const DEFAULT_DESKTOP_SECTION_ORDER: ProductPageSectionId[] = [
  "gallery",
  "orderForm",
  "title",
  "subtitle",
  "description",
  "features",
  "benefits",
  "relatedProducts",
];

export const DEFAULT_MOBILE_SECTION_ORDER: ProductPageSectionId[] = [
  "title",
  "subtitle",
  "gallery",
  "orderForm",
  "features",
  "description",
  "benefits",
  "relatedProducts",
];

export function createDefaultLayoutConfig(productId: string = "global_default"): ProductPageLayoutConfig {
  return {
    layoutVersion: 1,
    productId,
    desktopLayoutMode: "split",
    desktopSectionOrder: [...DEFAULT_DESKTOP_SECTION_ORDER],
    mobileSectionOrder: [...DEFAULT_MOBILE_SECTION_ORDER],
    showRelatedProducts: true,
    showDescription: true,
    showFeatures: true,
    showBenefits: true,
    updatedAt: new Date().toISOString(),
  };
}

export interface ILayoutRepository {
  getLayoutConfig(productId?: string): Promise<ProductPageLayoutConfig>;
  saveLayoutConfig(config: ProductPageLayoutConfig): Promise<ProductPageLayoutConfig>;
  resetLayoutConfig(productId?: string): Promise<ProductPageLayoutConfig>;
  restoreDefaultLayout(productId?: string): Promise<ProductPageLayoutConfig>;
}
