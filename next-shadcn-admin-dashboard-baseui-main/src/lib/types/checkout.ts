/**
 * ORVA COD Storefront — Checkout Interface Contracts, Enums & Validation Pipeline
 * Aligned with PROJECT.md § Interface Contracts § 1 and Algerian COD Logistics Rules
 */

import { z } from 'zod';

// ── 1. Storefront Checkout ↔ Orders Domain Contract ──────────────────────────

export interface CodOrderSubmission {
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  wilayaCode: number; // 1 to 58
  wilayaName: string;
  communeName: string;
  deliveryAddress?: string;
  deliveryType: 'DOMICILE' | 'STOP_DESK';
  /** Catalog id: product slug uppercased (PACK1..PACK3 for the original packs). */
  packId: string;
  productName: string;
  productPrice: number;
  shippingFee: number;
  totalPayable: number;
  honeypot?: string;
  idempotencyKey?: string;
}

export interface CodOrderResult {
  success: boolean;
  orderNumber?: string;
  error?: string;
  validationErrors?: Record<string, string>;
  redirectUrl?: string;
}

// ── 2. Algerian Mobile Phone Utilities ──────────────────────────────────────

export function normalizeAlgerianPhone(raw: string): string {
  if (!raw) return '';
  let cleaned = raw.replace(/[\s\-\(\)\.\/]/g, '');
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

// ── 3. Logistics & Geographic Structures ────────────────────────────────────

export interface WilayaRecord {
  code: number;
  nameFr: string;
  nameAr: string;
  zone: 1 | 2 | 3 | 4 | 5;
}

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
  { code: 58, nameFr: 'El Meniaa', nameAr: 'المنيعة', zone: 5 },
];

export function isStopDeskAllowed(wilayaCode: number): boolean {
  if (wilayaCode < 1 || wilayaCode > 58) return false;
  const wilaya = ALGERIA_58_WILAYAS.find((w) => w.code === wilayaCode);
  return wilayaCode <= 48 && wilaya?.zone !== 5;
}

export interface LiveTariff {
  domicile: number;
  stopdesk: number;
}

let liveTariffs: Record<number, LiveTariff> = {};

/** Installs live EcoTrack tariffs (wilaya code -> fees). Static matrix remains the fallback. */
export function setLiveTariffs(map: Record<number, LiveTariff>): void {
  liveTariffs = map && typeof map === 'object' ? map : {};
}
export function calculateDeliveryTariff(
  wilayaCode: number,
  deliveryType: 'DOMICILE' | 'STOP_DESK'
): number {
  if (wilayaCode < 1 || wilayaCode > 58) {
    throw new Error(`Invalid Wilaya code: ${wilayaCode}. Must be between 1 and 58.`);
  }

  if (deliveryType === 'STOP_DESK' && !isStopDeskAllowed(wilayaCode)) {
    throw new Error(
      `Stop-Desk delivery is not available for Wilaya ${wilayaCode}. Only Home Delivery is supported.`
    );
  }

  const live = liveTariffs[wilayaCode];
  if (live) {
    const liveFee = deliveryType === 'STOP_DESK' ? live.stopdesk : live.domicile;
    if (Number.isFinite(liveFee) && liveFee > 0) return liveFee;
  }
  const wilaya = ALGERIA_58_WILAYAS.find((w) => w.code === wilayaCode);
  const zone = wilaya?.zone ?? 2;

  if (deliveryType === 'STOP_DESK') {
    switch (zone) {
      case 1:
        return 350; // Central / Origin (Biskra, Batna, Ouled Djellal)
      case 2:
        return 400; // Northern & Coastal (Alger, Oran, Constantine)
      case 3:
        return 450; // High Plateaus
      case 4:
        return 500; // Near Sahara
      case 5:
        throw new Error(`Stop-Desk prohibited in Zone 5`);
    }
  }

  // DOMICILE
  switch (zone) {
    case 1:
      return 450; // Central
    case 2:
      return 500; // Northern (Alger, Oran)
    case 3:
      return 650; // High Plateaus
    case 4:
      return 800; // Near Sahara
    case 5:
      return 1000; // Far South (In Guezzam, Tamanrasset, etc.)
  }
}

// ── 4. Zod Validation Schema ────────────────────────────────────────────────

export const codOrderSubmissionSchema = z
  .object({
    customerName: z
      .string({ message: 'Nom complet requis' })
      .trim()
      .min(2, 'Nom complet invalide (au moins 2 caractères requis)')
      .max(100, 'Le nom ne doit pas dépasser 100 caractères'),
    customerPhone: z
      .string({ message: 'Numéro de téléphone requis' })
      .trim()
      .refine((val) => isValidAlgerianPhone(val), {
        message:
          'Numéro de téléphone mobile algérien invalide (doit commencer par 05, 06 ou 07 et contenir 10 chiffres)',
      }),
    customerPhone2: z
      .string()
      .optional()
      .refine((val) => !val || val.trim() === '' || isValidAlgerianPhone(val), {
        message: 'Numéro de téléphone secondaire invalide',
      }),
    wilayaCode: z
      .number({ message: 'Code Wilaya invalide' })
      .int()
      .min(1, 'Code Wilaya invalide (doit être entre 1 et 58)')
      .max(58, 'Code Wilaya invalide (doit être entre 1 et 58)'),
    wilayaName: z.string({ message: 'Nom de la Wilaya requis' }).min(1, 'Nom de la Wilaya requis'),
    communeName: z.string({ message: 'Nom de la Commune requis' }).min(1, 'Nom de la Commune requis'),
    deliveryType: z.enum(['DOMICILE', 'STOP_DESK']),
    deliveryAddress: z.string().optional(),
    packId: z
      .string()
      .trim()
      .min(1, 'Produit requis')
      .max(80, 'Identifiant produit invalide')
      .regex(/^[A-Za-z0-9_-]+$/, 'Identifiant produit invalide'),
    productName: z.string({ message: 'Nom du produit requis' }).min(1, 'Nom du produit requis'),
    productPrice: z.number().positive('Prix du produit invalide'),
    shippingFee: z.number().nonnegative('Frais de livraison invalides'),
    totalPayable: z.number().positive('Montant total invalide'),
    honeypot: z.string().optional(),
    idempotencyKey: z
      .string({ message: 'Clé d\'idempotence requise' })
      .trim()
      .min(10, 'Clé d\'idempotence invalide (au moins 10 caractères)')
      .max(128, 'Clé d\'idempotence trop longue')
      .regex(/^[a-zA-Z0-9_\-]+$/, 'Caractères non autorisés dans la clé d\'idempotence'),
  })
  .superRefine((data, ctx) => {
    // 1. Honeypot Bot Detection
    if (data.honeypot && data.honeypot.trim().length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bot submission detected via honeypot trap',
        path: ['honeypot'],
      });
    }

    // 2. Stop-Desk Barrier for Wilayas 49 to 58
    if (data.deliveryType === 'STOP_DESK' && !isStopDeskAllowed(data.wilayaCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La livraison en point relais (Stop-Desk) n'est pas disponible pour la Wilaya ${data.wilayaCode}. Veuillez choisir la livraison à domicile.`,
        path: ['deliveryType'],
      });
    }

    // 3. Street Address for Domicile
    if (data.deliveryType === 'DOMICILE') {
      if (!data.deliveryAddress || data.deliveryAddress.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Adresse de livraison requise pour la livraison à domicile',
          path: ['deliveryAddress'],
        });
      }
    }

    // 4. Product price is verified against the live catalog in submitCodOrderAction (server).

    // 5. Net total arithmetic consistency
    if (data.totalPayable !== data.productPrice + data.shippingFee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le montant total doit être égal au sous-total plus les frais de livraison',
        path: ['totalPayable'],
      });
    }

    // 6. Shipping tariff verification against Biskra matrix
    if (data.deliveryType === 'DOMICILE' || isStopDeskAllowed(data.wilayaCode)) {
      try {
        const expectedShipping = calculateDeliveryTariff(data.wilayaCode, data.deliveryType);
        if (data.shippingFee !== expectedShipping) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Frais de livraison incorrects pour la wilaya ${data.wilayaCode}`,
            path: ['shippingFee'],
          });
        }
      } catch {
        // calculateDeliveryTariff throws on invalid combo, caught by other validation rules
      }
    }
  });

export type CodOrderSubmissionSchemaType = z.infer<typeof codOrderSubmissionSchema>;
