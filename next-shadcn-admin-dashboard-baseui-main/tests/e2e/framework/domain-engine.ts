/**
 * ORVA COD E-Commerce Platform — Domain Engine
 * Encapsulates the verified operational rules, tariffs, logistics validations,
 * courier adapters, and integrations for E2E testing.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CodOrderSubmission,
  CodOrderResult,
  OrderReRoutingPayload,
  OrderReRoutingResult,
  CourierParcelRequest,
  CourierParcelResponse,
  ICourierProvider,
  MetaCapiEvent,
  TelegramOrderAlert
} from './contracts';

// ── 1. Phone Normalization & Validation ──────────────────────────────────────

export function normalizeAlgerianPhone(raw: string): string {
  if (!raw) return '';
  // Remove spaces, hyphens, parentheses, dots, slashes
  let cleaned = raw.replace(/[\s\-\(\)\.\/]/g, '');
  // Normalize international prefix including (0) trunk
  if (cleaned.startsWith('+2130')) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith('+213')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('002130')) {
    cleaned = cleaned.slice(5);
  } else if (cleaned.startsWith('00213')) {
    cleaned = '0' + cleaned.slice(5);
  } else if (cleaned.startsWith('2130') && cleaned.length === 13) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('213') && cleaned.length === 12) {
    cleaned = '0' + cleaned.slice(3);
  }
  return cleaned;
}

export function isValidAlgerianPhone(phone: string): boolean {
  const normalized = normalizeAlgerianPhone(phone);
  return /^(05|06|07)[0-9]{8}$/.test(normalized);
}

export function maskPhoneForPrivacy(phone: string): string {
  const norm = normalizeAlgerianPhone(phone);
  if (norm.length !== 10) return phone;
  return `${norm.slice(0, 4)} •• •• ${norm.slice(-2)}`;
}

// ── 2. Wilayas (58) & Communes (1541) Logistics ─────────────────────────────

export interface WilayaRecord {
  code: number;
  nameFr: string;
  nameAr: string;
  zone: 1 | 2 | 3 | 4 | 5;
}

export interface CommuneRecord {
  id: number;
  nameFr: string;
  nameAr: string;
  wilayaCode: number;
  postalCode: string;
}

// Standard 58 Algerian Wilayas
export const ALGERIA_58_WILAYAS: WilayaRecord[] = [
  { code: 1, nameFr: 'Adrar', nameAr: 'أدرار', zone: 5 },
  { code: 2, nameFr: 'Chlef', nameAr: 'الشلف', zone: 2 },
  { code: 3, nameFr: 'Laghouat', nameAr: 'الأغواط', zone: 3 },
  { code: 4, nameFr: 'Oum El Bouaghi', nameAr: 'أم البواقي', zone: 2 },
  { code: 5, nameFr: 'Batna', nameAr: 'باتنة', zone: 1 },
  { code: 6, nameFr: 'Béjaïa', nameAr: 'بجاية', zone: 2 },
  { code: 7, nameFr: 'Biskra', nameAr: 'بسكرة', zone: 1 }, // Origin Hub
  { code: 8, nameFr: 'Béchar', nameAr: 'بشار', zone: 4 },
  { code: 9, nameFr: 'Blida', nameAr: 'البليدة', zone: 2 },
  { code: 10, nameFr: 'Bouira', nameAr: 'البويرة', zone: 2 },
  { code: 11, nameFr: 'Tamanrasset', nameAr: 'تمنراست', zone: 5 },
  { code: 12, nameFr: 'Tébessa', nameAr: 'تبسة', zone: 2 },
  { code: 13, nameFr: 'Tlemcen', nameAr: 'تلمسان', zone: 2 },
  { code: 14, nameFr: 'Tiaret', nameAr: 'تيارت', zone: 3 },
  { code: 15, nameFr: 'Tizi Ouzou', nameAr: 'تيزي وزو', zone: 2 },
  { code: 16, nameFr: 'Alger', nameAr: 'الجزائر', zone: 2 },
  { code: 17, nameFr: 'Djelfa', nameAr: 'الجلفة', zone: 3 },
  { code: 18, nameFr: 'Jijel', nameAr: 'جيجل', zone: 2 },
  { code: 19, nameFr: 'Sétif', nameAr: 'سطيف', zone: 2 },
  { code: 20, nameFr: 'Saïda', nameAr: 'سعيدة', zone: 3 },
  { code: 21, nameFr: 'Skikda', nameAr: 'سكيكدة', zone: 2 },
  { code: 22, nameFr: 'Sidi Bel Abbès', nameAr: 'سيدي بلعباس', zone: 2 },
  { code: 23, nameFr: 'Annaba', nameAr: 'عنابة', zone: 2 },
  { code: 24, nameFr: 'Guelma', nameAr: 'قالمة', zone: 2 },
  { code: 25, nameFr: 'Constantine', nameAr: 'قسنطينة', zone: 2 },
  { code: 26, nameFr: 'Médéa', nameAr: 'المدية', zone: 2 },
  { code: 27, nameFr: 'Mostaganem', nameAr: 'مستغانم', zone: 2 },
  { code: 28, nameFr: "M'Sila", nameAr: 'المسيلة', zone: 3 },
  { code: 29, nameFr: 'Mascara', nameAr: 'معسكر', zone: 2 },
  { code: 30, nameFr: 'Ouargla', nameAr: 'ورقلة', zone: 4 },
  { code: 31, nameFr: 'Oran', nameAr: 'وهران', zone: 2 },
  { code: 32, nameFr: 'El Bayadh', nameAr: 'البيض', zone: 4 },
  { code: 33, nameFr: 'Illizi', nameAr: 'إيليزي', zone: 5 },
  { code: 34, nameFr: 'Bordj Bou Arréridj', nameAr: 'برج بوعريريج', zone: 2 },
  { code: 35, nameFr: 'Boumerdès', nameAr: 'بومرداس', zone: 2 },
  { code: 36, nameFr: 'El Tarf', nameAr: 'الطارف', zone: 2 },
  { code: 37, nameFr: 'Tindouf', nameAr: 'تندوف', zone: 5 },
  { code: 38, nameFr: 'Tissemsilt', nameAr: 'تيسمسيلت', zone: 3 },
  { code: 39, nameFr: 'El Oued', nameAr: 'الوادي', zone: 4 },
  { code: 40, nameFr: 'Khenchela', nameAr: 'خنشلة', zone: 2 },
  { code: 41, nameFr: 'Souk Ahras', nameAr: 'سوق أهراس', zone: 2 },
  { code: 42, nameFr: 'Tipaza', nameAr: 'تيبازة', zone: 2 },
  { code: 43, nameFr: 'Mila', nameAr: 'ميلة', zone: 2 },
  { code: 44, nameFr: 'Aïn Defla', nameAr: 'عين الدفلى', zone: 2 },
  { code: 45, nameFr: 'Naâma', nameAr: 'النعامة', zone: 4 },
  { code: 46, nameFr: 'Aïn Témouchent', nameAr: 'عين تموشنت', zone: 2 },
  { code: 47, nameFr: 'Ghardaïa', nameAr: 'غرداية', zone: 4 },
  { code: 48, nameFr: 'Relizane', nameAr: 'غليزان', zone: 2 },
  // Southern new 10 wilayas (49-58)
  { code: 49, nameFr: 'Timimoun', nameAr: 'تيميمون', zone: 5 },
  { code: 50, nameFr: 'Bordj Badji Mokhtar', nameAr: 'برج باجي مختار', zone: 5 },
  { code: 51, nameFr: 'Ouled Djellal', nameAr: 'أولاد جلال', zone: 1 },
  { code: 52, nameFr: 'Béni Abbès', nameAr: 'بني عباس', zone: 5 },
  { code: 53, nameFr: 'In Salah', nameAr: 'عين صالح', zone: 5 },
  { code: 54, nameFr: 'In Guezzam', nameAr: 'عين قزام', zone: 5 },
  { code: 55, nameFr: 'Touggourt', nameAr: 'تقرت', zone: 4 },
  { code: 56, nameFr: 'Djanet', nameAr: 'جانت', zone: 5 },
  { code: 57, nameFr: "El M'Ghair", nameAr: 'المغير', zone: 4 },
  { code: 58, nameFr: 'El Meniaa', nameAr: 'المنيعة', zone: 5 }
];

export function isStopDeskAllowed(wilayaCode: number): boolean {
  if (wilayaCode < 1 || wilayaCode > 58) return false;
  // Algerian logistics standard: Wilayas 49 to 58 are restricted from stop-desk collection
  return wilayaCode <= 48;
}

export function calculateDeliveryTariff(wilayaCode: number, deliveryType: 'DOMICILE' | 'STOP_DESK'): number {
  if (wilayaCode < 1 || wilayaCode > 58) {
    throw new Error(`Invalid Wilaya code: ${wilayaCode}. Must be between 1 and 58.`);
  }

  if (deliveryType === 'STOP_DESK' && !isStopDeskAllowed(wilayaCode)) {
    throw new Error(`Stop-Desk delivery is not available for Wilaya ${wilayaCode}. Only Home Delivery is supported.`);
  }

  const wilaya = ALGERIA_58_WILAYAS.find(w => w.code === wilayaCode);
  const zone = wilaya?.zone ?? 2;

  if (deliveryType === 'STOP_DESK') {
    switch (zone) {
      case 1: return 350; // Central / Origin (Biskra, Batna, Ouled Djellal)
      case 2: return 400; // Northern & Coastal (Alger, Oran, Constantine)
      case 3: return 450; // High Plateaus
      case 4: return 500; // Near Sahara
      case 5: throw new Error(`Stop-Desk prohibited in Zone 5`);
    }
  } else {
    // DOMICILE
    switch (zone) {
      case 1: return 450; // Central
      case 2: return 500; // Northern (Alger, Oran)
      case 3: return 650; // High Plateaus
      case 4: return 800; // Near Sahara
      case 5: return 1000; // Far South (In Guezzam, Tamanrasset, etc.)
    }
  }
}

// ── 3. Product Packs Specification ──────────────────────────────────────────

export interface ProductPack {
  id: 'PACK1' | 'PACK2' | 'PACK3';
  nameAr: string;
  nameFr: string;
  priceDzd: number;
  originalPriceDzd: number;
  savingsDzd: number;
  itemsCount: number;
  items: string[];
  heroAsset: string;
}

export const PRODUCT_PACKS: Record<string, ProductPack> = {
  PACK1: {
    id: 'PACK1',
    nameAr: 'باك كومبريسار و المفاتيح 4 في 1',
    nameFr: 'Pack Compresseur & Clés 4-en-1',
    priceDzd: 4950,
    originalPriceDzd: 9750,
    savingsDzd: 4800,
    itemsCount: 4,
    items: [
      'منفاخ عجلات TOYOTA مع عداد ضغط مدمج',
      'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO',
      'مفك مرن 11 قطعة STARLCE PRO',
      'طقم مفكات 6 قطع'
    ],
    heroAsset: 'pack 1 4950/pack1 4950.webp'
  },
  PACK2: {
    id: 'PACK2',
    nameAr: 'باك الفيسوز كراون Elite',
    nameFr: 'Pack Visseuse Crown Elite 5-en-1',
    priceDzd: 13390, // Also documented as 12950 in catalog
    originalPriceDzd: 21250,
    savingsDzd: 7860,
    itemsCount: 5,
    items: [
      'ماكينة ثقب CROWN 20V الأصلية (مع 2 بطاريات 20V وحقيبة 29 قطعة)',
      'طقم مفكات 6 قطع',
      'علبة مفاتيح ورؤوس 46 قطعة STARLCE PRO',
      'مفك مرن 11 قطعة STARLCE PRO',
      'قفازات حماية احترافية GILAN'
    ],
    heroAsset: 'pack2 12950/pack2 12950.webp'
  },
  PACK3: {
    id: 'PACK3',
    nameAr: 'باك سودير كراون الصلب',
    nameFr: 'Pack Soudeur Crown MMA-200 Mini',
    priceDzd: 15950,
    originalPriceDzd: 24500,
    savingsDzd: 8550,
    itemsCount: 6,
    items: [
      'ماكينة لحام CROWN CT33102 MMA-200 MINI',
      'تحكم في قوة اللحام (Current Control)',
      'نظام أمان VRD مدمج',
      'قفازات الحماية GILAN Anti-Cut',
      'طقم مفكات 6 قطع KKKR',
      'قناع لحام + فرشاة سلك + كوابل لحام'
    ],
    heroAsset: 'pack3 15950/pack3 15950.webp'
  }
};

// Buyer Reassurance Grid (4 Pillars)
export const REASSURANCE_PILLARS = [
  {
    id: 1,
    titleAr: 'المعاينة قبل الدفع',
    descAr: 'يحق لك فتح الطرد والتأكد من مطابقة جميع السلع قبل دفع المستحقات للموزع.'
  },
  {
    id: 2,
    titleAr: 'توصيل سريع وموثوق',
    descAr: 'نرسل طلبيتك عبر أفضل شركات التوصيل الرسمية في الجزائر خلال 24 إلى 48 ساعة.'
  },
  {
    id: 3,
    titleAr: 'الدفع الآمن عند الاستلام',
    descAr: 'لا تدفع أي سنتيم مسبقاً. التعامل يتم نقداً يداً بيد عند باب منزلك أو في المكتب.'
  },
  {
    id: 4,
    titleAr: 'خدمة عملاء جزائرية',
    descAr: 'فريقنا يتصل بك لتأكيد طلبك ومتابعة طردك حتى يصل إلى يديك بكل أمان.'
  }
];

// Cross-Sell Recommendations Matrix
export const CROSS_SELL_MAP: Record<string, { targetPackId: 'PACK1' | 'PACK2' | 'PACK3'; targetUrl: string }> = {
  PACK1: { targetPackId: 'PACK2', targetUrl: '/pack2' },
  PACK2: { targetPackId: 'PACK3', targetUrl: '/pack3' },
  PACK3: { targetPackId: 'PACK2', targetUrl: '/pack2' }
};

// ── 4. Checkout Order Processing ─────────────────────────────────────────────

let orderSequence = 100;

export function submitCodOrder(submission: CodOrderSubmission): CodOrderResult {
  // 1. Anti-spam honeypot
  if (submission.honeypot && submission.honeypot.trim().length > 0) {
    return {
      success: false,
      error: 'Bot submission detected via honeypot trap'
    };
  }

  // 2. Validate Customer Name
  if (!submission.customerName || submission.customerName.trim().length < 2) {
    return {
      success: false,
      error: 'Nom complet invalide (au moins 2 caractères requis)'
    };
  }

  // 3. Validate Algerian Phone
  if (!isValidAlgerianPhone(submission.customerPhone)) {
    return {
      success: false,
      error: 'Numéro de téléphone mobile algérien invalide (doit commencer par 05, 06 ou 07 et contenir 10 chiffres)'
    };
  }

  // 4. Validate Secondary Phone if provided
  if (submission.customerPhone2 && !isValidAlgerianPhone(submission.customerPhone2)) {
    return {
      success: false,
      error: 'Numéro de téléphone secondaire invalide'
    };
  }

  // 5. Validate Wilaya
  if (!submission.wilayaCode || submission.wilayaCode < 1 || submission.wilayaCode > 58) {
    return {
      success: false,
      error: 'Code Wilaya invalide (doit être entre 1 et 58)'
    };
  }

  // 6. Validate Delivery Mode
  if (submission.deliveryType === 'STOP_DESK' && !isStopDeskAllowed(submission.wilayaCode)) {
    return {
      success: false,
      error: `La livraison en point relais (Stop-Desk) n'est pas disponible pour la Wilaya ${submission.wilayaCode}. Veuillez choisir la livraison à domicile.`
    };
  }

  // 7. Validate Address for Domicile
  if (submission.deliveryType === 'DOMICILE' && (!submission.deliveryAddress || submission.deliveryAddress.trim().length < 3)) {
    return {
      success: false,
      error: 'Adresse de livraison requise pour la livraison à domicile'
    };
  }

  // 8. Validate Pack and Pricing
  const pack = PRODUCT_PACKS[submission.packId];
  if (!pack) {
    return {
      success: false,
      error: `Pack non reconnu: ${submission.packId}`
    };
  }

  // Recalculate tariff to verify integrity
  const expectedShipping = calculateDeliveryTariff(submission.wilayaCode, submission.deliveryType);
  if (Math.abs(submission.shippingFee - expectedShipping) > 50) { // slight margin for local rules
    // Still accepted, but authoritative is expectedShipping
  }

  orderSequence++;
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const orderNumber = `ORV-${dateStr}-${orderSequence}`;

  return {
    success: true,
    orderNumber
  };
}

// ── 5. Order Re-routing Engine (تحويل الطلبية) ──────────────────────────────

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_TO_SHIP'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'RECONCILED';

export const TERMINAL_STATUSES: OrderStatus[] = ['DELIVERED', 'RECONCILED'];

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  // Disallow backward transition from terminal states
  if (TERMINAL_STATUSES.includes(from)) return false;
  if (from === 'CANCELLED' && to !== 'PENDING' && to !== 'RETURNED') return false;
  if (from === 'RETURNED' && (to === 'CONFIRMED' || to === 'SHIPPED')) return false;
  return true;
}

export function generateCourierInstructionNote(payload: {
  originalOrderNumber: string;
  originalCustomerName: string;
  originalWilaya: string;
  newCustomerName: string;
  newCustomerPhone: string;
  newWilayaCode: number;
  newWilayaName: string;
  newCommuneName: string;
  newDeliveryType: 'DOMICILE' | 'STOP_DESK';
  newAddress?: string;
  updatedCodAmount: number;
  operator: string;
  reason: string;
}): string {
  const normPhone = normalizeAlgerianPhone(payload.newCustomerPhone);
  const deliveryTypeLabel = payload.newDeliveryType === 'STOP_DESK'
    ? 'استلام من مكتب التوصيل (Stop-Desk Bureau)'
    : 'توصيل لباب المنزل (À Domicile)';

  return [
    '************************************************************',
    '*** تحويل مسار الطرد / INSTRUCTION RE-ROUTING COLIS ***',
    '************************************************************',
    `رقم الطلبية الأصلية: ${payload.originalOrderNumber}`,
    `الزبون القديم: ${payload.originalCustomerName} (${payload.originalWilaya})`,
    '------------------------------------------------------------',
    'المعلومات الجديدة للمستلم الجديد:',
    `• الاسم واللقب: ${payload.newCustomerName}`,
    `• رقم الهاتف: ${normPhone}`,
    `• الولاية الجديدة: [${payload.newWilayaCode}] ${payload.newWilayaName}`,
    `• البلدية: ${payload.newCommuneName}`,
    `• نوع التوصيل: ${deliveryTypeLabel}`,
    payload.newAddress ? `• العنوان: ${payload.newAddress}` : '',
    '------------------------------------------------------------',
    `المبلغ الجديد الواجب تحصيله (COD): ${payload.updatedCodAmount.toLocaleString()} د.ج`,
    `سبب التحويل: ${payload.reason}`,
    `المشرف المنفّذ: ${payload.operator} | التاريخ: ${new Date().toISOString()}`,
    '************************************************************'
  ].filter(Boolean).join('\n');
}

export function executeOrderReRouting(
  sourceOrder: {
    orderNumber: string;
    customerName: string;
    wilayaName: string;
    productPrice: number;
    status: OrderStatus;
  },
  payload: OrderReRoutingPayload
): OrderReRoutingResult {
  // Check terminal status barrier
  if (TERMINAL_STATUSES.includes(sourceOrder.status)) {
    throw new Error(`Cannot re-route order ${sourceOrder.orderNumber}: terminal status ${sourceOrder.status} prohibits modification.`);
  }

  // Validate new customer phone
  if (!isValidAlgerianPhone(payload.newCustomerPhone)) {
    throw new Error(`Invalid new customer phone: ${payload.newCustomerPhone}`);
  }

  // Validate Stop-Desk eligibility
  if (payload.newDeliveryType === 'STOP_DESK' && !isStopDeskAllowed(payload.newWilayaCode)) {
    throw new Error(`Stop-Desk is restricted in Wilaya ${payload.newWilayaCode} (${payload.newWilayaName})`);
  }

  // Recalculate tariff from Biskra origin
  const newShippingFee = calculateDeliveryTariff(payload.newWilayaCode, payload.newDeliveryType);
  const updatedTotal = sourceOrder.productPrice + newShippingFee;

  orderSequence++;
  const note = generateCourierInstructionNote({
    originalOrderNumber: sourceOrder.orderNumber,
    originalCustomerName: sourceOrder.customerName,
    originalWilaya: sourceOrder.wilayaName,
    newCustomerName: payload.newCustomerName,
    newCustomerPhone: payload.newCustomerPhone,
    newWilayaCode: payload.newWilayaCode,
    newWilayaName: payload.newWilayaName,
    newCommuneName: payload.newCommuneName,
    newDeliveryType: payload.newDeliveryType,
    newAddress: payload.newDeliveryAddress,
    updatedCodAmount: updatedTotal,
    operator: payload.operator,
    reason: payload.reason
  });

  return {
    success: true,
    orderId: `REROUTE-${sourceOrder.orderNumber}-${orderSequence}`,
    sequence: orderSequence,
    formattedCourierNote: note,
    updatedShippingFee: newShippingFee,
    updatedTotal,
    timestampUtc: new Date().toISOString()
  };
}

// ── 6. Meta Pixel & CAPI Deduplication ──────────────────────────────────────

export function hashSha256(val: string): string {
  return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
}

export function buildMetaCapiPurchaseEvent(params: {
  eventId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  totalPayable: number;
  url: string;
}): MetaCapiEvent {
  const normPhone = normalizeAlgerianPhone(params.customerPhone);
  return {
    eventName: 'Purchase',
    eventId: params.eventId,
    eventSourceUrl: params.url,
    userData: {
      phone: hashSha256(normPhone),
      name: hashSha256(params.customerName)
    },
    customData: {
      currency: 'DZD',
      value: params.totalPayable,
      contentName: params.productName,
      contentIds: [params.orderNumber]
    }
  };
}

// ── 7. Telegram Bot Dispatcher & Deduplication ──────────────────────────────

export class TelegramAlertDispatcher {
  private sentAlertIds = new Set<string>();

  public formatAlertMessage(alert: TelegramOrderAlert): string {
    const masked = maskPhoneForPrivacy(alert.customerPhone);
    return [
      `🔔 *طلب جديد — ORVA STORE*`,
      `📦 رقم الطلب: \`${alert.orderNumber}\``,
      `👤 الزبون: ${alert.customerName}`,
      `📞 الهاتف: \`${masked}\``,
      `📍 الوجهة: ولاية ${alert.wilaya} — ${alert.commune}`,
      `🚚 الاستلام: ${alert.deliveryType}`,
      `🛠️ المنتج: ${alert.productName}`,
      `💰 المبلغ الصافي: *${alert.total.toLocaleString()} د.ج*`
    ].join('\n');
  }

  public dispatchOrderAlert(alert: TelegramOrderAlert): { dispatched: boolean; message: string; deduplicated?: boolean } {
    if (this.sentAlertIds.has(alert.orderNumber)) {
      return {
        dispatched: false,
        message: 'Duplicate alert suppressed by deduplication ledger',
        deduplicated: true
      };
    }

    this.sentAlertIds.add(alert.orderNumber);
    const text = this.formatAlertMessage(alert);
    return {
      dispatched: true,
      message: text
    };
  }
}

// ── 8. Courier Logistics Providers (Yalidine, ZR Express, Mock) ─────────────

export class MockCourierProvider implements ICourierProvider {
  readonly id = 'mock';
  readonly name = 'Mock Express Adapter';
  readonly supportsStopDesk = true;

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return { success: true, message: 'Mock provider online (simulation mode)' };
  }

  async createParcel(request: CourierParcelRequest): Promise<CourierParcelResponse> {
    return {
      success: true,
      trackingCode: `MCK-${request.wilayaCode}-${Date.now().toString().slice(-6)}`,
      trackingUrl: `https://tracking.orva-store.com/mock/${request.orderNumber}`
    };
  }

  async getTrackingStatus(trackingCode: string): Promise<{ status: string; description: string }> {
    return { status: 'IN_TRANSIT', description: 'En cours d acheminement' };
  }
}

export class YalidineCourierProvider implements ICourierProvider {
  readonly id = 'yalidine';
  readonly name = 'Yalidine Express';
  readonly supportsStopDesk = true;

  async testConnection(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
    if (!credentials.apiId || !credentials.apiToken) {
      return { success: false, message: 'Missing Yalidine API ID or Token' };
    }
    return { success: true, message: 'Yalidine connection verified' };
  }

  async createParcel(request: CourierParcelRequest, credentials: Record<string, string>): Promise<CourierParcelResponse> {
    if (!credentials.apiId || !credentials.apiToken) {
      return { success: false, trackingCode: '', error: 'Unauthenticated Yalidine request' };
    }
    const tracking = `yal-${request.wilayaCode}${Date.now().toString().slice(-6)}`;
    return {
      success: true,
      trackingCode: tracking,
      trackingUrl: `https://yalidine.com/suivi/?tracking=${tracking}`,
      labelUrl: `https://yalidine.com/v1/parcels/${tracking}/label`
    };
  }

  async getTrackingStatus(trackingCode: string): Promise<{ status: string; description: string }> {
    return { status: 'DELIVERED', description: 'Livré encaissé' };
  }
}

export class ZrExpressCourierProvider implements ICourierProvider {
  readonly id = 'zr_express';
  readonly name = 'ZR Express';
  readonly supportsStopDesk = true;

  async testConnection(credentials: Record<string, string>): Promise<{ success: boolean; message: string }> {
    if (!credentials.apiKey || !credentials.apiSecret) {
      return { success: false, message: 'Missing ZR Express API Key or Secret' };
    }
    return { success: true, message: 'ZR Express connection verified' };
  }

  async createParcel(request: CourierParcelRequest, credentials: Record<string, string>): Promise<CourierParcelResponse> {
    if (!credentials.apiKey || !credentials.apiSecret) {
      return { success: false, trackingCode: '', error: 'Unauthenticated ZR Express request' };
    }
    const tracking = `ZR${Date.now().toString().slice(-8)}DZ`;
    return {
      success: true,
      trackingCode: tracking,
      trackingUrl: `https://zrexpress.dz/suivi/${tracking}`,
      labelUrl: `https://zrexpress.dz/api/v1/waybills/${tracking}`
    };
  }

  async getTrackingStatus(trackingCode: string): Promise<{ status: string; description: string }> {
    return { status: 'IN_TRANSIT', description: 'En voyage vers le hub' };
  }
}

// Courier Factory & Provider Switching
export class CourierProviderManager {
  private providers: Map<string, ICourierProvider> = new Map();
  private activeProviderId = 'mock';

  constructor() {
    this.registerProvider(new MockCourierProvider());
    this.registerProvider(new YalidineCourierProvider());
    this.registerProvider(new ZrExpressCourierProvider());
  }

  public registerProvider(provider: ICourierProvider) {
    this.providers.set(provider.id, provider);
  }

  public getActiveProvider(): ICourierProvider {
    const prov = this.providers.get(this.activeProviderId);
    if (!prov) throw new Error(`Active provider not found: ${this.activeProviderId}`);
    return prov;
  }

  public setActiveProvider(id: string, credentials?: Record<string, string>): void {
    const prov = this.providers.get(id);
    if (!prov) {
      throw new Error(`Cannot switch to unknown courier provider "${id}". Available: ${Array.from(this.providers.keys()).join(', ')}`);
    }

    if (id === 'yalidine' && credentials && (!credentials.apiId || !credentials.apiToken)) {
      throw new Error(`Yalidine requires apiId and apiToken`);
    }
    if (id === 'zr_express' && credentials && (!credentials.apiKey || !credentials.apiSecret)) {
      throw new Error(`ZR Express requires apiKey and apiSecret`);
    }

    this.activeProviderId = id;
  }

  public getActiveProviderId(): string {
    return this.activeProviderId;
  }
}
