import type {
  Product,
  VisitorAnalyticsEvent,
  InventoryRecord,
  DeliveryTrackingRecord,
} from "./product-types";

/**
 * ORVA Store — Phase 7A Realistic Synthetic Product & Analytics Dataset
 * 
 * Strict alignment:
 * - Products correspond to active catalog in historical orders.
 * - Confidential pricing: purchaseCost & marketingCostPerOrder are defined here for dashboard calculations only.
 * - Visitor analytics: 100% first-party, pseudonymous session IDs, zero third-party pixels.
 */

// ── 1. Default Products Catalog ────────────────────────────────────────────────

export const DEFAULT_MOCK_PRODUCTS: Product[] = [
  {
    id: "prod_pack_1_pro",
    sku: "ORVA-P1-PRO",
    title: "باك منفاخ تويوتا وطقم المفاتيح",
    subtitle: "باك الخدمة والصيانة 4 في 1 للسيارة والمنزل (منفاخ TOYOTA وطقم مفاتيح)",
    description: "منفاخ عجلات قوي بتقنية توربينية، طقم مفاتيح متكامل 46 قطعة، مفك مرن 11 قطعة، وطقم 6 مفكات دقيقة لجميع الاستخدامات المنزلية والميكانيكية.",
    images: [
      "/placeholder.svg",
      "/placeholder.svg",
    ],
    sellingPrice: 4950,
    purchaseCost: 2400,
    marketingCostPerOrder: 850,
    stockQuantity: 45,
    lowStockThreshold: 10,
    status: "active",
    createdAt: "2026-10-01T08:00:00.000Z",
    updatedAt: "2026-10-25T11:00:00.000Z",
  },
  {
    id: "prod_pack_2_elite",
    sku: "ORVA-P2-ELITE",
    title: "باك ماكينة كراون CROWN 20V الأصلية",
    subtitle: "باك النخبة المتكامل 5 في 1 للورشة والصيانة (ماكينة CROWN 20V ببطاريتين)",
    description: "حقيبة احترافية تضم مضخة ضغط عالي رقمية، بنك طاقة جامب ستارتر، مجموعة مفاتيح هيدروليكية، كشاف طوارئ مغناطيسي، ومعدات إسعاف أولية ميكانيكية.",
    images: [
      "/placeholder.svg",
      "/placeholder.svg",
    ],
    sellingPrice: 12950,
    purchaseCost: 6800,
    marketingCostPerOrder: 1500,
    stockQuantity: 22,
    lowStockThreshold: 5,
    status: "active",
    createdAt: "2026-10-05T09:30:00.000Z",
    updatedAt: "2026-10-26T14:20:00.000Z",
  },
  {
    id: "prod_pack_3_ultra",
    sku: "ORVA-P3-ULTRA",
    title: "باك الأشغال الشاقة CROWN و Starcle Pro",
    subtitle: "المعدات الاحترافية الشاملة للورش واللحام والأشغال الشاقة",
    description: "طقم المعدات الثقيلة المتكامل بأعلى مواصفات المتانة للرحلات الصحراوية والمناطق الوعرة مع ضمان الجودة والاستبدال.",
    images: [
      "/placeholder.svg",
    ],
    sellingPrice: 15950,
    purchaseCost: 8200,
    marketingCostPerOrder: 1800,
    stockQuantity: 14,
    lowStockThreshold: 5,
    status: "active",
    createdAt: "2026-10-10T12:00:00.000Z",
    updatedAt: "2026-10-28T16:00:00.000Z",
  },
  {
    id: "prod_sac_yamaha",
    sku: "ORVA-SAC-YAM",
    title: "Sac Banane Moto Yamaha",
    subtitle: "حقيبة خصر وساق مقاومة للماء للدراجات النارية والرحلات اليومية",
    description: "تصميم مريح مع جيوب متعددة وسحاب عازل للماء مع أحزمة قابلة للتعديل تناسب جميع الأحجام والمقاسات.",
    images: [
      "/placeholder.svg",
    ],
    sellingPrice: 4400,
    purchaseCost: 1900,
    marketingCostPerOrder: 700,
    stockQuantity: 30,
    lowStockThreshold: 8,
    status: "active",
    createdAt: "2026-10-02T10:00:00.000Z",
    updatedAt: "2026-10-24T18:00:00.000Z",
  },
];

// ── 2. Initial Inventory Records ──────────────────────────────────────────────

export const DEFAULT_MOCK_INVENTORY: InventoryRecord[] = DEFAULT_MOCK_PRODUCTS.map((prod) => {
  return {
    productId: prod.id,
    sku: prod.sku,
    productTitle: prod.title,
    availableQuantity: prod.stockQuantity,
    reservedQuantity: 4, // Allocated to recent active orders
    totalPhysicalQuantity: prod.stockQuantity + 4,
    lowStockThreshold: prod.lowStockThreshold,
    isLowStock: prod.stockQuantity <= prod.lowStockThreshold,
    stockAdjustments: [
      {
        id: `adj_${prod.sku}_init`,
        productId: prod.id,
        change: prod.stockQuantity + 4,
        quantityBefore: 0,
        quantityAfter: prod.stockQuantity + 4,
        reason: "الرصيد الافتتاحي لمخزن بسكرة المركزي",
        timestamp: prod.createdAt,
        operator: "نظام المخزون الآلي",
      },
    ],
    lastAdjustmentTimestamp: prod.createdAt,
    lastAdjustmentReason: "الرصيد الافتتاحي لمخزن بسكرة المركزي",
  };
});

// ── 3. First-Party Visitor & Conversion Analytics Events ───────────────────────

export const DEFAULT_MOCK_VISITOR_EVENTS: VisitorAnalyticsEvent[] = [
  // Session 1: Converted (under 1 min)
  {
    id: "evt_101",
    pseudonymousSessionId: "sess_a8f9b2c1",
    eventType: "product_view",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T09:14:10.000Z",
    sessionDurationSeconds: 15,
  },
  {
    id: "evt_102",
    pseudonymousSessionId: "sess_a8f9b2c1",
    eventType: "checkout_started",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T09:14:35.000Z",
    sessionDurationSeconds: 40,
  },
  {
    id: "evt_103",
    pseudonymousSessionId: "sess_a8f9b2c1",
    eventType: "order_created",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T09:14:52.000Z",
    sessionDurationSeconds: 52,
    selectedWilaya: "16 - الجزائر (Alger)",
    orderId: "ORVA-10960",
  },

  // Session 2: Converted (between 1 - 5 mins)
  {
    id: "evt_104",
    pseudonymousSessionId: "sess_d3e4f5a6",
    eventType: "product_view",
    productId: "prod_pack_2_elite",
    timestamp: "2026-10-28T10:20:00.000Z",
    sessionDurationSeconds: 45,
  },
  {
    id: "evt_105",
    pseudonymousSessionId: "sess_d3e4f5a6",
    eventType: "checkout_started",
    productId: "prod_pack_2_elite",
    timestamp: "2026-10-28T10:21:40.000Z",
    sessionDurationSeconds: 145,
  },
  {
    id: "evt_106",
    pseudonymousSessionId: "sess_d3e4f5a6",
    eventType: "order_created",
    productId: "prod_pack_2_elite",
    timestamp: "2026-10-28T10:22:30.000Z",
    sessionDurationSeconds: 195,
    selectedWilaya: "31 - وهران (Oran)",
    orderId: "ORVA-10959",
  },

  // Session 3: Exited after 1 min without purchase (Active Non-Buying)
  {
    id: "evt_107",
    pseudonymousSessionId: "sess_b7c8d9e0",
    eventType: "product_view",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T11:05:00.000Z",
    sessionDurationSeconds: 10,
  },
  {
    id: "evt_108",
    pseudonymousSessionId: "sess_b7c8d9e0",
    eventType: "session_activity",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T11:06:15.000Z",
    sessionDurationSeconds: 75,
  },
  {
    id: "evt_109",
    pseudonymousSessionId: "sess_b7c8d9e0",
    eventType: "session_ended",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T11:06:40.000Z",
    sessionDurationSeconds: 100, // >= 60s without buying
  },

  // Session 4: Converted (between 5 - 15 mins)
  {
    id: "evt_110",
    pseudonymousSessionId: "sess_f1a2b3c4",
    eventType: "product_view",
    productId: "prod_sac_yamaha",
    timestamp: "2026-10-28T13:10:00.000Z",
    sessionDurationSeconds: 60,
  },
  {
    id: "evt_111",
    pseudonymousSessionId: "sess_f1a2b3c4",
    eventType: "checkout_started",
    productId: "prod_sac_yamaha",
    timestamp: "2026-10-28T13:14:20.000Z",
    sessionDurationSeconds: 320,
  },
  {
    id: "evt_112",
    pseudonymousSessionId: "sess_f1a2b3c4",
    eventType: "order_created",
    productId: "prod_sac_yamaha",
    timestamp: "2026-10-28T13:17:45.000Z",
    sessionDurationSeconds: 525,
    selectedWilaya: "07 - بسكرة (Biskra)",
    orderId: "ORVA-10958",
  },

  // Session 5: Exited after 1 minute without purchase
  {
    id: "evt_113",
    pseudonymousSessionId: "sess_9a8b7c6d",
    eventType: "product_view",
    productId: "prod_pack_3_ultra",
    timestamp: "2026-10-28T14:00:00.000Z",
    sessionDurationSeconds: 20,
  },
  {
    id: "evt_114",
    pseudonymousSessionId: "sess_9a8b7c6d",
    eventType: "session_activity",
    productId: "prod_pack_3_ultra",
    timestamp: "2026-10-28T14:01:25.000Z",
    sessionDurationSeconds: 85,
  },
  {
    id: "evt_115",
    pseudonymousSessionId: "sess_9a8b7c6d",
    eventType: "session_ended",
    productId: "prod_pack_3_ultra",
    timestamp: "2026-10-28T14:01:50.000Z",
    sessionDurationSeconds: 110,
  },

  // Session 6: Fast bounce under 60 seconds without purchase
  {
    id: "evt_116",
    pseudonymousSessionId: "sess_3f2e1d0c",
    eventType: "product_view",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T15:30:00.000Z",
    sessionDurationSeconds: 18,
  },
  {
    id: "evt_117",
    pseudonymousSessionId: "sess_3f2e1d0c",
    eventType: "session_ended",
    productId: "prod_pack_1_pro",
    timestamp: "2026-10-28T15:30:25.000Z",
    sessionDurationSeconds: 25,
  },
];

// ── 4. Delivery & Courier Tracking Mock Data ──────────────────────────────────

export const DEFAULT_MOCK_COURIER_TRACKING: DeliveryTrackingRecord[] = [
  {
    orderId: "ORVA-10957",
    courierName: "Redex",
    trackingCode: "RDX-DZ-99104",
    internalOrderStatus: "shipped",
    externalCourierStatus: "EN_COURS_LIVRAISON",
    lastSyncedAt: "2026-10-28T14:10:00.000Z",
    syncResult: "success",
  },
  {
    orderId: "ORVA-10955",
    courierName: "Redex",
    trackingCode: "RDX-DZ-99102",
    internalOrderStatus: "delivered",
    externalCourierStatus: "LIVRE_CLIENT",
    lastSyncedAt: "2026-10-28T16:30:00.000Z",
    syncResult: "success",
  },
  {
    orderId: "ORVA-10953",
    courierName: "Redex",
    trackingCode: "RDX-DZ-99100",
    internalOrderStatus: "returned",
    externalCourierStatus: "RETOUR_AU_CENTRE",
    lastSyncedAt: "2026-10-28T12:00:00.000Z",
    syncResult: "success",
  },
];
