/**
 * ORVA COD Storefront — Checkout Interface Contracts, Enums & Validation Pipeline
 * Aligned with PROJECT.md § Interface Contracts § 1 and Algerian COD Logistics Rules
 */

import { z } from "zod";

import { ALGERIA_69_WILAYAS as GEO_ALGERIA_69_WILAYAS, getMotherWilayaCode } from "@/lib/geo/algeria-69";

// ── 1. Storefront Checkout ↔ Orders Domain Contract ──────────────────────────

export interface CodOrderSubmission {
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  wilayaCode: number; // 1 to 69
  wilayaName: string;
  communeName: string;
  deliveryAddress?: string;
  deliveryType: "DOMICILE" | "STOP_DESK";
  /** Catalog id: product slug uppercased (PACK1..PACK3 for the original packs). */
  packId: string;
  productName: string;
  productPrice: number;
  shippingFee: number;
  totalPayable: number;
  honeypot?: string;
  idempotencyKey?: string;
  fbCampaignId?: string;
  fbAdsetId?: string;
  fbAdId?: string;
  fbclid?: string;
  utmCampaign?: string;
  attributionSource?: string;
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
  if (!raw) return "";
  let cleaned = raw.replace(/[\s\-()./]/g, "");
  if (cleaned.startsWith("+2130")) {
    cleaned = cleaned.slice(4);
  } else if (cleaned.startsWith("+213")) {
    cleaned = "0" + cleaned.slice(4);
  } else if (cleaned.startsWith("002130")) {
    cleaned = cleaned.slice(5);
  } else if (cleaned.startsWith("00213")) {
    cleaned = "0" + cleaned.slice(5);
  } else if (cleaned.startsWith("2130") && cleaned.length === 13) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("213") && cleaned.length === 12) {
    cleaned = "0" + cleaned.slice(3);
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
  motherWilayaCode?: number | null;
}

export const ALGERIA_69_WILAYAS: WilayaRecord[] = GEO_ALGERIA_69_WILAYAS.map((w) => ({
  code: w.code,
  nameFr: w.nameFr,
  nameAr: w.nameAr,
  zone: w.zone,
  motherWilayaCode: w.motherWilayaCode,
}));

export const ALGERIA_58_WILAYAS: WilayaRecord[] = ALGERIA_69_WILAYAS;

export function isStopDeskAllowed(wilayaCode: number): boolean {
  if (wilayaCode < 1 || wilayaCode > 69) return false;
  const wilaya = ALGERIA_69_WILAYAS.find((w) => w.code === wilayaCode);
  return wilayaCode <= 48 && wilaya?.zone !== 5;
}

/**
 * Storefront & Admin Checkout allow customers to freely choose EITHER Home Delivery
 * or Stop-Desk Pickup across all 69 Algerian wilayas and all communes (when a commune lacks
 * a local agency, parcels route smoothly via the wilaya's central pickup hub).
 */
export function isStorefrontStopDeskAllowed(wilayaCode: number): boolean {
  return Number.isInteger(wilayaCode) && wilayaCode >= 1 && wilayaCode <= 69;
}

export interface LiveTariff {
  domicile: number;
  stopdesk: number;
  retour?: number;
}

let liveTariffs: Record<number, LiveTariff> = {};

/** Installs live EcoTrack tariffs (wilaya code -> fees). Static matrix remains the fallback. */
export function setLiveTariffs(map: Record<number, LiveTariff>): void {
  liveTariffs = map && typeof map === "object" ? map : {};
}
export function calculateDeliveryTariff(wilayaCode: number, deliveryType: "DOMICILE" | "STOP_DESK"): number {
  if (wilayaCode < 1 || wilayaCode > 69) {
    throw new Error(`Invalid Wilaya code: ${wilayaCode}. Must be between 1 and 69.`);
  }

  const motherCode = getMotherWilayaCode(wilayaCode);
  const live = liveTariffs[wilayaCode] ?? (motherCode ? liveTariffs[motherCode] : undefined);
  if (live) {
    const liveFee = deliveryType === "STOP_DESK" ? live.stopdesk : live.domicile;
    if (Number.isFinite(liveFee) && liveFee > 0) return liveFee;
  }
  const wilaya = ALGERIA_69_WILAYAS.find((w) => w.code === wilayaCode);
  const zone = wilaya?.zone ?? 2;

  if (deliveryType === "STOP_DESK") {
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
        return 600; // Far South (nearest central/wilaya agency pickup)
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
      .string({ message: "Nom complet requis" })
      .trim()
      .min(2, "Nom complet invalide (au moins 2 caractères requis)")
      .max(100, "Le nom ne doit pas dépasser 100 caractères"),
    customerPhone: z
      .string({ message: "Numéro de téléphone requis" })
      .trim()
      .refine((val) => isValidAlgerianPhone(val), {
        message:
          "Numéro de téléphone mobile algérien invalide (doit commencer par 05, 06 ou 07 et contenir 10 chiffres)",
      }),
    customerPhone2: z
      .string()
      .optional()
      .refine((val) => !val || val.trim() === "" || isValidAlgerianPhone(val), {
        message: "Numéro de téléphone secondaire invalide",
      }),
    wilayaCode: z
      .number({ message: "Code Wilaya invalide" })
      .int()
      .min(1, "Code Wilaya invalide (doit être entre 1 et 69)")
      .max(69, "Code Wilaya invalide (doit être entre 1 et 69)"),
    wilayaName: z.string({ message: "Nom de la Wilaya requis" }).min(1, "Nom de la Wilaya requis"),
    communeName: z.string({ message: "Nom de la Commune requis" }).min(1, "Nom de la Commune requis"),
    deliveryType: z.enum(["DOMICILE", "STOP_DESK"]),
    deliveryAddress: z.string().optional(),
    packId: z
      .string()
      .trim()
      .min(1, "Produit requis")
      .max(80, "Identifiant produit invalide")
      .regex(/^[A-Za-z0-9_-]+$/, "Identifiant produit invalide"),
    productName: z.string({ message: "Nom du produit requis" }).min(1, "Nom du produit requis"),
    productPrice: z.number().positive("Prix du produit invalide"),
    shippingFee: z.number().nonnegative("Frais de livraison invalides"),
    totalPayable: z.number().positive("Montant total invalide"),
    honeypot: z.string().optional(),
    idempotencyKey: z
      .string({ message: "Clé d'idempotence requise" })
      .trim()
      .min(10, "Clé d'idempotence invalide (au moins 10 caractères)")
      .max(128, "Clé d'idempotence trop longue")
      .regex(/^[a-zA-Z0-9_-]+$/, "Caractères non autorisés dans la clé d'idempotence"),
    fbCampaignId: z.string().trim().max(255).optional(),
    fbAdsetId: z.string().trim().max(255).optional(),
    fbAdId: z.string().trim().max(255).optional(),
    fbclid: z.string().trim().max(255).optional(),
    utmCampaign: z.string().trim().max(255).optional(),
    attributionSource: z.string().trim().max(100).optional(),
  })
  .superRefine((data, ctx) => {
    // 1. Honeypot Bot Detection
    if (data.honeypot && data.honeypot.trim().length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bot submission detected via honeypot trap",
        path: ["honeypot"],
      });
    }

    // 2. Street Address for Domicile (Stop-Desk is enabled across all 69 wilayas & communes)
    if (data.deliveryType === "DOMICILE") {
      if (!data.deliveryAddress || data.deliveryAddress.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Adresse de livraison requise pour la livraison à domicile",
          path: ["deliveryAddress"],
        });
      }
    }

    // 3. Product price is verified against the live catalog in submitCodOrderAction (server).

    // 4. Net total arithmetic consistency
    if (data.totalPayable !== data.productPrice + data.shippingFee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Le montant total doit être égal au sous-total plus les frais de livraison",
        path: ["totalPayable"],
      });
    }

    // 5. Shipping tariff verification across all 69 wilayas for both DOMICILE and STOP_DESK
    try {
      const expectedShipping = calculateDeliveryTariff(data.wilayaCode, data.deliveryType);
      if (data.shippingFee !== expectedShipping) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Frais de livraison incorrects pour la wilaya ${data.wilayaCode}`,
          path: ["shippingFee"],
        });
      }
    } catch {
      // Invalid wilaya code already caught by field schema
    }
  });

export type CodOrderSubmissionSchemaType = z.infer<typeof codOrderSubmissionSchema>;
