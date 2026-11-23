/**
 * ORVA Store — Centralized Multi-Courier Status Mapper & Location Stage Classifier
 * Supports EcoTrack/Redex, Yalidine (34 statuses), ZR Express (accent-stripped), NOEST, Maystro, & Arabic/French Excel sheets.
 * Preserves original raw courier status while mapping cleanly to NormalizedCourierStatus, Store Order Status & Location Stage.
 */

import type { ParcelLocationStage } from "@/lib/couriers/types";

import type { CustomerReceiptClassification, NormalizedCourierStatus } from "./delivery-tracking-types";

export interface StatusMappingInfo {
  normalizedStatus: NormalizedCourierStatus;
  receiptClassification: CustomerReceiptClassification;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
  badgeClass: string;
}

export type StoreOrderLifecycleStatus =
  | "pending"
  | "confirmed"
  | "pushed"
  | "shipped"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled";

export type CourierFinancialStage = "none" | "uncollected" | "collected_unpaid" | "ready_to_pay" | "paid_archived";

export interface RichCourierStatusMapping {
  rawStatus: string;
  normalizedStatus: NormalizedCourierStatus;
  orderStatus: StoreOrderLifecycleStatus;
  labelAr: string;
  locationStage: ParcelLocationStage;
  locationLabelAr: string;
  financialStage: CourierFinancialStage;
  isSwitchable: boolean;
}

function normalizeLookup(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-/]+/g, "_");
}

const RAW_CODE_TO_NORMALIZED: Record<string, NormalizedCourierStatus> = {
  // EcoTrack + Standard Delivered
  LIVRE_CLIENT: "DELIVERED_TO_CUSTOMER",
  LIVRE: "DELIVERED_TO_CUSTOMER",
  LIVRED: "DELIVERED_TO_CUSTOMER",
  LIVRE_NON_ENCAISSE: "DELIVERED_TO_CUSTOMER",
  ENCAISSE_NON_PAYE: "DELIVERED_TO_CUSTOMER",
  ENCAISSED: "DELIVERED_TO_CUSTOMER",
  PAIEMENTS_PRETS: "DELIVERED_TO_CUSTOMER",
  PAYE_ET_ARCHIVE: "DELIVERED_TO_CUSTOMER",
  PAYED: "DELIVERED_TO_CUSTOMER",
  LIVRE_ET_PAYE: "DELIVERED_TO_CUSTOMER",
  DELIVERED: "DELIVERED_TO_CUSTOMER",
  DELIVERED_TO_CUSTOMER: "DELIVERED_TO_CUSTOMER",
  RECUPERE_PAR_CLIENT: "DELIVERED_TO_CUSTOMER",
  COLIS_LIVRE: "DELIVERED_TO_CUSTOMER",
  ENCAISSE: "DELIVERED_TO_CUSTOMER",
  LIVRAISON_REUSSIE: "DELIVERED_TO_CUSTOMER",

  // Out For Delivery
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  EN_COURS_LIVRAISON: "OUT_FOR_DELIVERY",
  EN_DISTRIBUTION: "OUT_FOR_DELIVERY",
  SORTI_POUR_LIVRAISON: "OUT_FOR_DELIVERY",
  SORTI_EN_LIVRAISON: "OUT_FOR_DELIVERY",
  DISPATCHE_LIVREUR: "OUT_FOR_DELIVERY",
  DISPATCHED_TO_DRIVER: "OUT_FOR_DELIVERY",
  EN_LIVRAISON: "OUT_FOR_DELIVERY",
  EN_PREPARATION: "OUT_FOR_DELIVERY",
  AVEC_LIVREUR: "OUT_FOR_DELIVERY",

  // In Transit / Hub / Station
  IN_TRANSIT: "IN_TRANSIT",
  EN_PROCESS: "IN_TRANSIT",
  EN_TRANSIT: "IN_TRANSIT",
  EXPEDIE: "IN_TRANSIT",
  EN_ACHEMINEMENT: "IN_TRANSIT",
  TRANSFERT_HUB: "IN_TRANSIT",
  VERS_HUB: "IN_TRANSIT",
  EN_HUB: "IN_TRANSIT",
  EN_STATION: "IN_TRANSIT",
  CENTRE: "IN_TRANSIT",
  CENTRE_WILAYA: "IN_TRANSIT",
  VERS_WILAYA: "IN_TRANSIT",
  VERS_STATION: "IN_TRANSIT",
  EN_VOYAGE: "IN_TRANSIT",
  DEPART_CENTRE: "IN_TRANSIT",

  // Picked Up / Carrier Received
  PICKED_UP: "PICKED_UP",
  PICKED: "PICKED_UP",
  EN_RAMASSAGE: "PICKED_UP",
  RAMASSE: "PICKED_UP",
  RECU_AU_CENTRE: "PICKED_UP",
  ACCEPTED_BY_CARRIER: "PICKED_UP",
  ORDER_INFORMATION_RECEIVED_BY_CARRIER: "PICKED_UP",
  EN_PREPARATION_STOCK: "PICKED_UP",
  COLIS_RECU: "PICKED_UP",
  DEPOSE_HUB: "PICKED_UP",
  ENTREPOT_ORIGINE: "PICKED_UP",

  // Ready / Pending Pickup
  PENDING: "PENDING",
  PRETE_A_EXPEDIER: "PENDING",
  PRET_A_EXPEDIER: "PENDING",
  EN_ATTENTE: "PENDING",
  COMMANDE_CREEE: "PENDING",
  ENREGISTRE: "PENDING",
  ATTENTE_RAMASSAGE: "PENDING",
  EN_PREPARATION_CHEZ_EXPEDITEUR: "PENDING",

  // Delivery Failed / Suspended (Switchable!)
  DELIVERY_FAILED: "DELIVERY_FAILED",
  SUSPENDU: "DELIVERY_FAILED",
  ATTEMPT_DELIVERY: "DELIVERY_FAILED",
  ECHEC_LIVRAISON: "DELIVERY_FAILED",
  TENTATIVE_DE_LIVRAISON_ECHOUEE: "DELIVERY_FAILED",
  NON_LIVRE: "DELIVERY_FAILED",
  ABSENT: "DELIVERY_FAILED",
  CLIENT_ABSENT: "DELIVERY_FAILED",
  CLIENT_INJOIGNABLE: "DELIVERY_FAILED",
  ADRESSE_INCOMPLETE: "DELIVERY_FAILED",
  REPORTE: "DELIVERY_FAILED",
  TENTATIVE_ECHOUEE: "DELIVERY_FAILED",

  // Customer Refused / Cancelled
  CUSTOMER_REFUSED: "CUSTOMER_REFUSED",
  ANNULE: "CUSTOMER_REFUSED",
  ANNULEE: "CUSTOMER_REFUSED",
  CANCELLED: "CUSTOMER_REFUSED",
  REFUSE: "CUSTOMER_REFUSED",
  CLIENT_REFUSE: "CUSTOMER_REFUSED",
  REFUS_CLIENT: "CUSTOMER_REFUSED",
  ANNULE_PAR_CLIENT: "CUSTOMER_REFUSED",
  REFUS_PAIEMENT: "CUSTOMER_REFUSED",

  // Return In Progress
  RETURN_IN_PROGRESS: "RETURN_IN_PROGRESS",
  RETURN_ASKED: "RETURN_IN_PROGRESS",
  RETURN_IN_TRANSIT: "RETURN_IN_PROGRESS",
  RETOUR_CHEZ_LIVREUR: "RETURN_IN_PROGRESS",
  RETOUR_TRANSIT_ENTREPOT: "RETURN_IN_PROGRESS",
  RETOUR_EN_TRAITEMENT: "RETURN_IN_PROGRESS",
  RETOUR_VERS_HUB: "RETURN_IN_PROGRESS",
  RETOUR_EN_COURS: "RETURN_IN_PROGRESS",
  RETOUR_AU_CENTRE: "RETURN_IN_PROGRESS",
  EN_COURS_DE_RETOUR: "RETURN_IN_PROGRESS",

  // Returned To Sender
  RETURNED_TO_SENDER: "RETURNED_TO_SENDER",
  RETOURNE: "RETURNED_TO_SENDER",
  RETURNED: "RETURNED_TO_SENDER",
  RETOUR_RECU: "RETURNED_TO_SENDER",
  RETURN_RECEIVED: "RETURNED_TO_SENDER",
  RETOUR_ARCHIVE: "RETURNED_TO_SENDER",
  RETOURNE_AU_VENDEUR: "RETURNED_TO_SENDER",
  RETOUR_EXPEDITEUR: "RETURNED_TO_SENDER",
  RETOUR_CONFIRME: "RETURNED_TO_SENDER",
  CLOTURE_RETOUR: "RETURNED_TO_SENDER",
};

const ARABIC_KEYWORDS_MAP: Array<{ match: string[]; normalized: NormalizedCourierStatus }> = [
  { match: ["مسلمة", "تم التسليم", "مستلمة", "وصلت", "livré", "livred"], normalized: "DELIVERED_TO_CUSTOMER" },
  { match: ["مرتجع", "مسترجع", "ارجاع", "عائد", "retour"], normalized: "RETURNED_TO_SENDER" },
  { match: ["ملغى", "ملغاة", "الغاء", "رفض", "annule"], normalized: "CUSTOMER_REFUSED" },
  { match: ["معلقة", "معلق", "فشل", "محاولة", "لم يرد", "لا يرد", "مؤجل", "suspendu"], normalized: "DELIVERY_FAILED" },
  { match: ["قيد التوصيل", "عند السائق", "مع الموزع", "خارج للتوصيل"], normalized: "OUT_FOR_DELIVERY" },
  { match: ["في الطريق", "في المركز", "شحن", "مغادرة"], normalized: "IN_TRANSIT" },
  { match: ["تم الاستلام من المتجر", "رامساج"], normalized: "PICKED_UP" },
  { match: ["جاهز", "قيد الانتظار", "جديد", "مؤكد"], normalized: "PENDING" },
];

export function normalizeCourierStatus(rawCode: string | null | undefined): NormalizedCourierStatus {
  if (!rawCode || typeof rawCode !== "string") return "UNKNOWN";

  const cleanUpper = rawCode
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (RAW_CODE_TO_NORMALIZED[cleanUpper]) {
    return RAW_CODE_TO_NORMALIZED[cleanUpper];
  }

  const lower = rawCode.trim().toLowerCase();
  for (const rule of ARABIC_KEYWORDS_MAP) {
    if (rule.match.some((kw) => lower.includes(kw))) {
      return rule.normalized;
    }
  }

  return "UNKNOWN";
}

export function classifyParcelLocationStage(
  rawStatus: string | null | undefined,
  activity?: Array<{ status?: string; station?: string; driver?: string }>,
): ParcelLocationStage {
  const key = normalizeLookup(rawStatus || "");
  if (
    ["suspendu", "attempt_delivery", "echec_livraison", "client_absent", "client_injoignable", "reporte"].some((k) =>
      key.includes(k),
    )
  ) {
    return "suspended_switchable";
  }
  if (
    [
      "livred",
      "livre_non_encaisse",
      "encaisse_non_paye",
      "encaissed",
      "paiements_prets",
      "paye_et_archive",
      "payed",
    ].some((k) => key === k) ||
    key.startsWith("livre")
  ) {
    return "delivered";
  }
  if (key.includes("return") || key.includes("retour") || key.includes("مرتجع")) {
    return "returned";
  }
  if (key.includes("annule") || key.includes("cancel") || key.includes("ملغ")) {
    return "cancelled";
  }
  if (["dispatched_to_driver", "en_livraison", "en_preparation", "sorti_en_livraison"].some((k) => key.includes(k))) {
    return "out_for_delivery_driver";
  }
  if (
    [
      "en_hub",
      "en_station",
      "accepted_by_carrier",
      "en_ramassage",
      "vers_station",
      "picked",
      "en_preparation_stock",
      "centre",
    ].some((k) => key.includes(k))
  ) {
    return "at_hub_station";
  }
  if (["vers_wilaya", "vers_hub", "en_transit", "in_transit", "expedie"].some((k) => key.includes(k))) {
    return "in_transit";
  }
  if (
    ["prete_a_expedier", "pret_a_expedier", "order_information_received_by_carrier", "pending"].some((k) =>
      key.includes(k),
    )
  ) {
    return "ready";
  }

  const last = activity?.[activity.length - 1];
  if (last?.driver) return "out_for_delivery_driver";
  if (last?.station) return "at_hub_station";
  return "in_transit";
}

export function isSwitchableAtCourier(rawStatus: string | null | undefined): boolean {
  const key = normalizeLookup(rawStatus || "");
  if (!key) return true;
  if (
    key.includes("return") ||
    key.includes("retour") ||
    key.includes("livred") ||
    key.startsWith("livre") ||
    key.includes("payed") ||
    key.includes("paye_") ||
    key.includes("encaisse") ||
    key.includes("delivered") ||
    key.includes("annule") ||
    key.includes("cancel") ||
    key.includes("مسلم") ||
    key.includes("مرتجع") ||
    key.includes("ملغ")
  ) {
    return false;
  }
  return true;
}

export function classifyCourierFinancialStage(rawStatus: string | null | undefined): CourierFinancialStage {
  const key = normalizeLookup(rawStatus || "");
  if (key === "livre_non_encaisse") return "uncollected";
  if (key === "encaisse_non_paye" || key === "encaissed") return "collected_unpaid";
  if (key === "paiements_prets") return "ready_to_pay";
  if (key === "paye_et_archive" || key === "payed") return "paid_archived";
  return "none";
}

export function getLocationStageLabelAr(stage: ParcelLocationStage): string {
  switch (stage) {
    case "ready":
      return "جاهزة لدى المتجر بانتظار الاستلام";
    case "at_hub_station":
      return "متواجدة في مركز الطرود / المكتب";
    case "in_transit":
      return "في الطريق إلى ولاية العميل";
    case "out_for_delivery_driver":
      return "في التوصيلات الجارية عند رجل التوصيل";
    case "suspended_switchable":
      return "معلّقة عند المكتب/السائق — جاهزة للتحويل (Switch)";
    case "delivered":
      return "تم التسليم للزبون";
    case "returned":
      return "في مسار الإرجاع أو مسترجعة";
    case "cancelled":
      return "ملغاة";
  }
}

export function mapCourierStatusRich(rawCode: string | null | undefined): RichCourierStatusMapping {
  const rawStatus = (rawCode || "").trim();
  const normalizedStatus = normalizeCourierStatus(rawStatus);
  const locationStage = classifyParcelLocationStage(rawStatus);
  const financialStage = classifyCourierFinancialStage(rawStatus);
  const isSwitchable = isSwitchableAtCourier(rawStatus);

  let orderStatus: StoreOrderLifecycleStatus = "shipped";
  switch (normalizedStatus) {
    case "DELIVERED_TO_CUSTOMER":
      orderStatus = "delivered";
      break;
    case "RETURN_IN_PROGRESS":
    case "RETURNED_TO_SENDER":
      orderStatus = "returned";
      break;
    case "CUSTOMER_REFUSED":
      orderStatus = "cancelled";
      break;
    case "PENDING":
      orderStatus = "pushed";
      break;
    case "OUT_FOR_DELIVERY":
      orderStatus = "out_for_delivery";
      break;
    case "PICKED_UP":
    case "IN_TRANSIT":
    case "DELIVERY_FAILED":
      orderStatus = "shipped";
      break;
    default:
      orderStatus = "shipped";
  }

  return {
    rawStatus,
    normalizedStatus,
    orderStatus,
    labelAr: STATUS_METADATA[normalizedStatus].labelAr,
    locationStage,
    locationLabelAr: getLocationStageLabelAr(locationStage),
    financialStage,
    isSwitchable,
  };
}

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

const STATUS_METADATA: Record<
  NormalizedCourierStatus,
  Omit<StatusMappingInfo, "normalizedStatus" | "receiptClassification">
> = {
  DELIVERED_TO_CUSTOMER: {
    labelAr: "تم التسليم للزبون",
    labelEn: "Delivered to Customer",
    descriptionAr: "تم تسليم الشحنة وتحصيل المبلغ بنجاح",
    badgeVariant: "success",
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  },
  OUT_FOR_DELIVERY: {
    labelAr: "خرج للتسليم مع رجل التوصيل",
    labelEn: "Out for Delivery",
    descriptionAr: "الشحنة مع رجل التوصيل في طريقها إلى عنوان الزبون",
    badgeVariant: "secondary",
    badgeClass: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  },
  IN_TRANSIT: {
    labelAr: "في الطريق (In Transit)",
    labelEn: "In Transit",
    descriptionAr: "الشحنة في طريقها بين مراكز التوزيع الولائية",
    badgeVariant: "secondary",
    badgeClass: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  },
  PICKED_UP: {
    labelAr: "تم استلام الناقل",
    labelEn: "Picked Up",
    descriptionAr: "استلم الناقل الشحنة من مركز بسكرة المركزي",
    badgeVariant: "secondary",
    badgeClass: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  },
  PENDING: {
    labelAr: "جاهز للإرسال",
    labelEn: "Pending Pickup",
    descriptionAr: "تم تسجيل الشحنة بانتظار استلام شركة التوصيل",
    badgeVariant: "outline",
    badgeClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30",
  },
  DELIVERY_FAILED: {
    labelAr: "معلّقة / محاولة تسليم",
    labelEn: "Delivery Failed / Suspended",
    descriptionAr: "تعذر التسليم أو معلقة عند المكتب — يمكن تحويلها لزبون آخر قبل الإرجاع",
    badgeVariant: "destructive",
    badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  },
  CUSTOMER_REFUSED: {
    labelAr: "ملغاة / مرفوضة",
    labelEn: "Customer Refused",
    descriptionAr: "رفض الزبون الاستلام أو تم إلغاء الشحنة",
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
    descriptionAr: "تم استلام الطرد المرتجع في المستودع",
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
        labelAr: "لم يستلم / معلّقة (Failed/Suspended)",
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
