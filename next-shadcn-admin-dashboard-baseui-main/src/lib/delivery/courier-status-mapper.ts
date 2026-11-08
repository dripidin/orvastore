/**
 * ORVA Store — Phase 7G Centralized Courier Status Mapper
 * 
 * Provides explicit, deterministic mapping between raw external courier status codes
 * (Redex, Ecotrack, Yalidine, standard Algerian courier codes) and ORVA Normalized Statuses.
 * 
 * Rules:
 * 1. Conversions are explicit.
 * 2. Original externalStatusCode is strictly preserved.
 * 3. Any unmapped/unknown code is safely classified as UNKNOWN without guessing.
 * 4. Never mutates or replaces internal ORVA order status.
 */

import type {
  NormalizedCourierStatus,
  CustomerReceiptClassification,
} from "./delivery-tracking-types";

export interface StatusMappingInfo {
  normalizedStatus: NormalizedCourierStatus;
  receiptClassification: CustomerReceiptClassification;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  badgeClass: string;
}

const RAW_CODE_TO_NORMALIZED: Record<string, NormalizedCourierStatus> = {
  // ── Delivered Codes ────────────────────────────────────────────────────────
  LIVRE_CLIENT: "DELIVERED_TO_CUSTOMER",
  LIVRE: "DELIVERED_TO_CUSTOMER",
  LIVRÉ: "DELIVERED_TO_CUSTOMER",
  DELIVERED: "DELIVERED_TO_CUSTOMER",
  DELIVERED_TO_CUSTOMER: "DELIVERED_TO_CUSTOMER",
  RECUPERE_PAR_CLIENT: "DELIVERED_TO_CUSTOMER",
  COLIS_LIVRE: "DELIVERED_TO_CUSTOMER",
  ENCAISSE: "DELIVERED_TO_CUSTOMER",
  LIVRAISON_REUSSIE: "DELIVERED_TO_CUSTOMER",

  // ── Out For Delivery ───────────────────────────────────────────────────────
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  EN_COURS_LIVRAISON: "OUT_FOR_DELIVERY",
  EN_DISTRIBUTION: "OUT_FOR_DELIVERY",
  SORTI_POUR_LIVRAISON: "OUT_FOR_DELIVERY",
  DISPATCHE_LIVREUR: "OUT_FOR_DELIVERY",
  AVEC_LIVREUR: "OUT_FOR_DELIVERY",

  // ── In Transit ─────────────────────────────────────────────────────────────
  IN_TRANSIT: "IN_TRANSIT",
  EN_TRANSIT: "IN_TRANSIT",
  EXPEDIE: "IN_TRANSIT",
  EXPÉDIÉ: "IN_TRANSIT",
  EN_ACHEMINEMENT: "IN_TRANSIT",
  TRANSFERT_HUB: "IN_TRANSIT",
  VERS_WILAYA: "IN_TRANSIT",
  EN_VOYAGE: "IN_TRANSIT",
  DEPART_CENTRE: "IN_TRANSIT",

  // ── Picked Up ──────────────────────────────────────────────────────────────
  PICKED_UP: "PICKED_UP",
  RAMASSE: "PICKED_UP",
  RAMASSÉ: "PICKED_UP",
  RECU_AU_CENTRE: "PICKED_UP",
  COLIS_RECU: "PICKED_UP",
  DEPOSE_HUB: "PICKED_UP",
  ENTREPOT_ORIGINE: "PICKED_UP",

  // ── Pending ────────────────────────────────────────────────────────────────
  PENDING: "PENDING",
  EN_ATTENTE: "PENDING",
  PRET_A_EXPEDIER: "PENDING",
  PRÊT_À_EXPÉDIER: "PENDING",
  COMMANDE_CREEE: "PENDING",
  ENREGISTRE: "PENDING",
  ATTENTE_RAMASSAGE: "PENDING",

  // ── Delivery Failed ────────────────────────────────────────────────────────
  DELIVERY_FAILED: "DELIVERY_FAILED",
  ECHEC_LIVRAISON: "DELIVERY_FAILED",
  ÉCHEC_LIVRAISON: "DELIVERY_FAILED",
  NON_LIVRE: "DELIVERY_FAILED",
  ABSENT: "DELIVERY_FAILED",
  CLIENT_INJOIGNABLE: "DELIVERY_FAILED",
  ADRESSE_INCOMPLETE: "DELIVERY_FAILED",
  REPORTE: "DELIVERY_FAILED",
  TENTATIVE_ECHOUEE: "DELIVERY_FAILED",

  // ── Customer Refused ───────────────────────────────────────────────────────
  CUSTOMER_REFUSED: "CUSTOMER_REFUSED",
  REFUSE: "CUSTOMER_REFUSED",
  REFUSÉ: "CUSTOMER_REFUSED",
  CLIENT_REFUSE: "CUSTOMER_REFUSED",
  REFUS_CLIENT: "CUSTOMER_REFUSED",
  ANNULE_PAR_CLIENT: "CUSTOMER_REFUSED",
  REFUS_PAIEMENT: "CUSTOMER_REFUSED",

  // ── Return In Progress ─────────────────────────────────────────────────────
  RETURN_IN_PROGRESS: "RETURN_IN_PROGRESS",
  RETOUR_EN_COURS: "RETURN_IN_PROGRESS",
  RETOUR_AU_CENTRE: "RETURN_IN_PROGRESS",
  EN_COURS_DE_RETOUR: "RETURN_IN_PROGRESS",
  RETOUR_HUB_BISKRA: "RETURN_IN_PROGRESS",

  // ── Returned To Sender ─────────────────────────────────────────────────────
  RETURNED_TO_SENDER: "RETURNED_TO_SENDER",
  RETOURNE: "RETURNED_TO_SENDER",
  RETOURNÉ: "RETURNED_TO_SENDER",
  RETOUR_EXPEDITEUR: "RETURNED_TO_SENDER",
  RETOUR_CONFIRME: "RETURNED_TO_SENDER",
  CLOTURE_RETOUR: "RETURNED_TO_SENDER",
};

/**
 * Normalizes any external raw courier status code to NormalizedCourierStatus.
 * If rawCode is unknown, returns "UNKNOWN" without speculative guessing.
 */
export function normalizeCourierStatus(rawCode: string | null | undefined): NormalizedCourierStatus {
  if (!rawCode || typeof rawCode !== "string") {
    return "UNKNOWN";
  }

  const clean = rawCode.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (RAW_CODE_TO_NORMALIZED[clean]) {
    return RAW_CODE_TO_NORMALIZED[clean];
  }

  return "UNKNOWN";
}

/**
 * Classifies customer receipt state based on normalized courier status.
 * 
 * Rules:
 * - Received: only on DELIVERED_TO_CUSTOMER.
 * - Not Yet Received: active shipment (PENDING, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY).
 * - Not Received / Failed: documented delivery failure or refusal (DELIVERY_FAILED, CUSTOMER_REFUSED).
 * - Returned: return in transit or completed (RETURN_IN_PROGRESS, RETURNED_TO_SENDER).
 * - Unknown: insufficient information (UNKNOWN).
 */
export function classifyCustomerReceipt(status: NormalizedCourierStatus): CustomerReceiptClassification {
  switch (status) {
    case "DELIVERED_TO_CUSTOMER":
      return "Received";

    case "PENDING":
    case "PICKED_UP":
    case "IN_TRANSIT":
    case "OUT_FOR_DELIVERY":
      return "Not Yet Received";

    case "DELIVERY_FAILED":
    case "CUSTOMER_REFUSED":
      return "Not Received / Failed";

    case "RETURN_IN_PROGRESS":
      return "Returning";

    case "RETURNED_TO_SENDER":
      return "Returned";

    case "UNKNOWN":
    default:
      return "Unknown";
  }
}

const STATUS_METADATA: Record<NormalizedCourierStatus, Omit<StatusMappingInfo, "normalizedStatus" | "receiptClassification">> = {
  DELIVERED_TO_CUSTOMER: {
    labelAr: "تم التسليم للزبون",
    labelEn: "Delivered to Customer",
    descriptionAr: "تم تسليم الشحنة وتحصيل المبلغ بنجاح",
    badgeVariant: "success",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  OUT_FOR_DELIVERY: {
    labelAr: "خرج للتسليم",
    labelEn: "Out for Delivery",
    descriptionAr: "الشحنة مع الموزع في طريقها إلى عنوان الزبون",
    badgeVariant: "secondary",
    badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  IN_TRANSIT: {
    labelAr: "قيد النقل (In Transit)",
    labelEn: "In Transit",
    descriptionAr: "الشحنة في طريقها بين مراكز التوزيع الولائية",
    badgeVariant: "secondary",
    badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  },
  PICKED_UP: {
    labelAr: "تم استلام الناقل",
    labelEn: "Picked Up",
    descriptionAr: "استلم الناقل الشحنة من مستودع بسكرة المركزي",
    badgeVariant: "secondary",
    badgeClass: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  },
  PENDING: {
    labelAr: "بانتظار الناقل",
    labelEn: "Pending Pickup",
    descriptionAr: "تم تجهيز الشحنة بانتظار استلام مندوب الناقل",
    badgeVariant: "outline",
    badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  },
  DELIVERY_FAILED: {
    labelAr: "تعذر التسليم",
    labelEn: "Delivery Failed",
    descriptionAr: "تعذر التسليم لعدم الرد أو غياب الزبون",
    badgeVariant: "destructive",
    badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  },
  CUSTOMER_REFUSED: {
    labelAr: "رفض الزبون الاستلام",
    labelEn: "Customer Refused",
    descriptionAr: "رفض الزبون استلام الطرد أو إلغاء الطلب عند الوصول",
    badgeVariant: "destructive",
    badgeClass: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  },
  RETURN_IN_PROGRESS: {
    labelAr: "مرتجع في الطريق",
    labelEn: "Return in Progress",
    descriptionAr: "الشحنة في طريق العودة إلى مركز بسكرة",
    badgeVariant: "warning",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  RETURNED_TO_SENDER: {
    labelAr: "أعيدت إلى المرسل",
    labelEn: "Returned to Sender",
    descriptionAr: "تم استلام الطرد المرتجع وتأكيد إغلاقه في المستودع",
    badgeVariant: "warning",
    badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  },
  UNKNOWN: {
    labelAr: "حالة غير معروفة",
    labelEn: "Unknown Status",
    descriptionAr: "لا تتوفر معلومات كافية من نظام التتبع الخارجي",
    badgeVariant: "outline",
    badgeClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  },
};

/**
 * Returns comprehensive mapping info for any raw external courier code.
 */
export function mapExternalCourierStatus(rawCode: string | null | undefined): StatusMappingInfo {
  const normalizedStatus = normalizeCourierStatus(rawCode);
  const receiptClassification = classifyCustomerReceipt(normalizedStatus);
  const meta = STATUS_METADATA[normalizedStatus];

  return {
    normalizedStatus,
    receiptClassification,
    ...meta,
  };
}

/**
 * Receipt classification visual styling helper.
 */
export function getReceiptClassificationBadge(classification: CustomerReceiptClassification): {
  labelAr: string;
  badgeClass: string;
} {
  switch (classification) {
    case "Received":
      return {
        labelAr: "تم الاستلام (Received)",
        badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      };
    case "Not Yet Received":
      return {
        labelAr: "قيد التوصيل (Not Yet Received)",
        badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
      };
    case "Not Received / Failed":
      return {
        labelAr: "لم يستلم / فشل (Failed/Refused)",
        badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
      };
    case "Returning":
      return {
        labelAr: "مرتجع في الطريق (Returning)",
        badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
      };
    case "Returned":
      return {
        labelAr: "مرتجع مؤكد (Returned)",
        badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
      };
    case "Unknown":
    default:
      return {
        labelAr: "غير معروف (Unknown)",
        badgeClass: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
      };
  }
}
