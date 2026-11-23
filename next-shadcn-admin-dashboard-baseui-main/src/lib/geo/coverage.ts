import { ALGERIA_69_WILAYAS, getMotherWilayaCode, type Wilaya69Record } from "@/lib/geo/algeria-69";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";
import { calculateDeliveryTariff, isStopDeskAllowed } from "@/lib/types/checkout";

export interface CourierWilayaEntry {
  courierId: string;
  courierName: string;
  courierNameAr: string;
  isDefault: boolean;
  homeEnabled: boolean;
  stopDeskEnabled: boolean;
  tarifDomicile: number;
  tarifStopdesk: number;
  tarifRetour: number;
  tarifPickup: number;
  tarifEchange: number;
  routedViaMotherWilaya: boolean;
  mappedCarrierWilayaCode: number | null;
}

export interface WilayaCoverageSummary {
  wilayaCode: number;
  paddedCode: string;
  nameAr: string;
  nameFr: string;
  zone: number;
  motherWilayaCode: number | null;
  isNewWilaya: boolean;
  isActive: boolean;
  homeEnabled: boolean;
  stopDeskEnabled: boolean;
  stopDeskStatusMessage: string | null;
  tarifDomicile: number;
  tarifStopdesk: number;
  tarifRetour: number;
  primaryCourier: {
    id: string;
    name: string;
    nameAr: string;
    routedViaMotherWilaya: boolean;
  } | null;
  availableCouriers: CourierWilayaEntry[];
}

export interface StorefrontCoveragePayload {
  totalWilayas: 69;
  activeWilayasCount: number;
  activeCouriers: Array<{
    id: string;
    name: string;
    nameAr: string;
    family: string;
    isDefault: boolean;
    supportsStopDesk: boolean;
  }>;
  wilayas: WilayaCoverageSummary[];
  syncedAt: string;
}

const DEFAULT_FALLBACK_RETURN_FEE = 400;

function staticDomicileFallback(w: Wilaya69Record): number {
  try {
    return calculateDeliveryTariff(w.code, "DOMICILE");
  } catch {
    return 750;
  }
}

function staticStopDeskFallback(w: Wilaya69Record): number {
  if (!isStopDeskAllowed(w.code)) return 0;
  try {
    return calculateDeliveryTariff(w.code, "STOP_DESK");
  } catch {
    return 0;
  }
}

/**
 * Computes full 69-wilaya delivery coverage + active courier branding + tariffs (including tarif_retour).
 * Gracefully combines courier_wilaya_coverage, delivery_fees, and Law 26-06 mother-wilaya routing.
 */
export async function getStorefrontDeliveryCoverage(options?: {
  courierId?: string;
}): Promise<StorefrontCoveragePayload> {
  const defaultCouriers = [
    {
      id: "redex",
      name: "Redex Delivery DZ",
      nameAr: "ريديكس للتوصيل (Redex)",
      family: "ecotrack",
      isDefault: true,
      supportsStopDesk: true,
    },
  ];

  let activeCouriers = defaultCouriers;
  const coverageRowsByCourier = new Map<string, Map<number, any>>();
  const deliveryFeesByWilaya = new Map<
    number,
    { domicile: number; stopdesk: number; retour: number; pickup: number; echange: number }
  >();

  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;

      const { data: courierRows } = await supabase
        .from("courier_configurations")
        .select("id, name, name_ar, family, is_active, is_default, supports_stop_desk, is_external_excel_only")
        .eq("is_active", true);

      if (Array.isArray(courierRows) && courierRows.length > 0) {
        const filtered = courierRows.filter((c: any) => !c.is_external_excel_only);
        if (filtered.length > 0) {
          activeCouriers = filtered
            .map((c: any) => ({
              id: String(c.id),
              name: String(c.name || c.id),
              nameAr: String(c.name_ar || c.name || c.id),
              family: String(c.family || "ecotrack"),
              isDefault: Boolean(c.is_default),
              supportsStopDesk: Boolean(c.supports_stop_desk ?? true),
            }))
            .sort((a: any, b: any) => Number(b.isDefault) - Number(a.isDefault));
        }
      }

      if (options?.courierId) {
        const match = activeCouriers.filter((c) => c.id === options.courierId);
        if (match.length > 0) activeCouriers = match;
      }

      const { data: covRows } = await supabase.from("courier_wilaya_coverage").select("*");

      for (const row of covRows ?? []) {
        const cId = String(row.courier_id);
        const wCode = Number(row.wilaya_code);
        if (!coverageRowsByCourier.has(cId)) {
          coverageRowsByCourier.set(cId, new Map());
        }
        coverageRowsByCourier.get(cId)!.set(wCode, row);
      }

      const { data: feeRows } = await supabase.from("delivery_fees").select("*");

      for (const row of feeRows ?? []) {
        const wCode = Number(row.wilaya_id);
        deliveryFeesByWilaya.set(wCode, {
          domicile: Number(row.tarif_domicile) || 0,
          stopdesk: Number(row.tarif_stopdesk) || 0,
          retour: Number(row.tarif_retour) || 0,
          pickup: Number(row.tarif_pickup) || 0,
          echange: Number(row.tarif_echange) || 0,
        });
      }
    } catch {
      // Schema pending or offline fallback: use static Biskra-origin defaults safely
    }
  }

  const wilayas: WilayaCoverageSummary[] = ALGERIA_69_WILAYAS.map((w) => {
    const motherCode = getMotherWilayaCode(w.code);
    const availableCouriers: CourierWilayaEntry[] = [];

    for (const c of activeCouriers) {
      const cMap = coverageRowsByCourier.get(c.id);
      const directRow = cMap?.get(w.code);
      const motherRow = !directRow && motherCode ? cMap?.get(motherCode) : undefined;
      const feeRow =
        deliveryFeesByWilaya.get(w.code) ?? (motherCode ? deliveryFeesByWilaya.get(motherCode) : undefined);

      if (directRow) {
        if (!directRow.is_active) continue;
        const dom = Number(directRow.tarif_domicile) || feeRow?.domicile || staticDomicileFallback(w);
        const desk = Number(directRow.tarif_stopdesk) || feeRow?.stopdesk || staticStopDeskFallback(w);
        const ret = Number(directRow.tarif_retour) || feeRow?.retour || DEFAULT_FALLBACK_RETURN_FEE;
        availableCouriers.push({
          courierId: c.id,
          courierName: c.name,
          courierNameAr: c.nameAr,
          isDefault: c.isDefault,
          homeEnabled: Boolean(directRow.home_enabled ?? true),
          stopDeskEnabled: Boolean(c.supportsStopDesk && directRow.stop_desk_enabled),
          tarifDomicile: dom,
          tarifStopdesk: desk,
          tarifRetour: ret,
          tarifPickup: Number(directRow.tarif_pickup) || feeRow?.pickup || 0,
          tarifEchange: Number(directRow.tarif_echange) || feeRow?.echange || 0,
          routedViaMotherWilaya: Boolean(
            directRow.mapped_carrier_wilaya_code && directRow.mapped_carrier_wilaya_code !== w.code,
          ),
          mappedCarrierWilayaCode: directRow.mapped_carrier_wilaya_code
            ? Number(directRow.mapped_carrier_wilaya_code)
            : null,
        });
        continue;
      }

      if (motherRow && motherRow.is_active === false) {
        continue;
      }

      // Default active routing: 59..69 inherit home delivery via mother wilaya while marking stop-desk unavailable unless added
      const routedViaMother = w.code >= 59;
      const dom = (motherRow ? Number(motherRow.tarif_domicile) : 0) || feeRow?.domicile || staticDomicileFallback(w);
      const stopAllowed = !routedViaMother && c.supportsStopDesk && isStopDeskAllowed(w.code);
      const desk = stopAllowed
        ? (motherRow ? Number(motherRow.tarif_stopdesk) : 0) || feeRow?.stopdesk || staticStopDeskFallback(w)
        : 0;
      const ret = (motherRow ? Number(motherRow.tarif_retour) : 0) || feeRow?.retour || DEFAULT_FALLBACK_RETURN_FEE;

      availableCouriers.push({
        courierId: c.id,
        courierName: c.name,
        courierNameAr: c.nameAr,
        isDefault: c.isDefault,
        homeEnabled: true,
        stopDeskEnabled: stopAllowed,
        tarifDomicile: dom,
        tarifStopdesk: desk,
        tarifRetour: ret,
        tarifPickup: (motherRow ? Number(motherRow.tarif_pickup) : 0) || feeRow?.pickup || 0,
        tarifEchange: (motherRow ? Number(motherRow.tarif_echange) : 0) || feeRow?.echange || 0,
        routedViaMotherWilaya: routedViaMother,
        mappedCarrierWilayaCode: routedViaMother ? motherCode : null,
      });
    }

    const primary = availableCouriers[0] ?? null;
    const stopDeskEnabled = availableCouriers.some((c) => c.stopDeskEnabled);
    const homeEnabled = availableCouriers.some((c) => c.homeEnabled);

    return {
      wilayaCode: w.code,
      paddedCode: w.paddedCode,
      nameAr: w.nameAr,
      nameFr: w.nameFr,
      zone: w.zone,
      motherWilayaCode: motherCode,
      isNewWilaya: w.code >= 59,
      isActive: availableCouriers.length > 0 && (homeEnabled || stopDeskEnabled),
      homeEnabled,
      stopDeskEnabled,
      stopDeskStatusMessage: stopDeskEnabled
        ? null
        : "مكتب التوصيل غير متوفر حالياً — التوصيل للمنزل متاح عبر رجل التوصيل",
      tarifDomicile: primary?.tarifDomicile ?? staticDomicileFallback(w),
      tarifStopdesk: stopDeskEnabled ? (primary?.tarifStopdesk ?? staticStopDeskFallback(w)) : 0,
      tarifRetour: primary?.tarifRetour ?? DEFAULT_FALLBACK_RETURN_FEE,
      primaryCourier: primary
        ? {
            id: primary.courierId,
            name: primary.courierName,
            nameAr: primary.courierNameAr,
            routedViaMotherWilaya: primary.routedViaMotherWilaya,
          }
        : null,
      availableCouriers,
    };
  });

  return {
    totalWilayas: 69,
    activeWilayasCount: wilayas.filter((w) => w.isActive).length,
    activeCouriers,
    wilayas,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Returns return-fee lookup map (`wilayaCode -> tarif_retour DZD`) from DB coverage + delivery_fees.
 */
export async function getReturnFeesByWilayaMap(courierId?: string): Promise<Record<number, number>> {
  const result: Record<number, number> = {};
  if (!isServiceRoleConfigured()) return result;

  try {
    const supabase = getSupabaseServerClient() as any;

    const { data: feeRows } = await supabase.from("delivery_fees").select("wilaya_id, tarif_retour");

    for (const row of feeRows ?? []) {
      const code = Number(row.wilaya_id);
      const fee = Number(row.tarif_retour) || 0;
      if (code >= 1 && code <= 69 && fee > 0) {
        result[code] = fee;
      }
    }

    let covQuery = supabase
      .from("courier_wilaya_coverage")
      .select("courier_id, wilaya_code, tarif_retour")
      .eq("is_active", true);

    if (courierId) {
      covQuery = covQuery.eq("courier_id", courierId);
    }

    const { data: covRows } = await covQuery;
    for (const row of covRows ?? []) {
      const code = Number(row.wilaya_code);
      const fee = Number(row.tarif_retour) || 0;
      if (code >= 1 && code <= 69 && fee > 0) {
        result[code] = fee;
      }
    }

    // Inherit return fee for wilayas 59..69 from their mother wilaya if omitted
    for (const w of ALGERIA_69_WILAYAS) {
      if (!result[w.code] && w.motherWilayaCode && result[w.motherWilayaCode]) {
        result[w.code] = result[w.motherWilayaCode];
      }
    }
  } catch {
    // Graceful when migration hasn't run yet
  }

  return result;
}
