import communesRawData from "@/data/geoalgeria/communes.json";
import { getEcoTrackClient } from "@/lib/couriers/ecotrack-client";
import { getMotherWilayaCode, isNewWilaya69 } from "@/lib/geo/algeria-69";
import { getSupabaseServerClient, isServiceRoleConfigured } from "@/lib/supabase/server";

interface RawCommune {
  commune_name_fr: string;
  commune_name_ar: string;
  wilaya_code: number;
  postal_code?: string;
}

export interface DeliveryOfficeCommune {
  ar: string;
  fr: string;
}

export interface DeliveryOfficesResult {
  success: boolean;
  wilayaId: number;
  /** Communes of this wilaya that have a delivery office (stop-desk). */
  offices: DeliveryOfficeCommune[];
  stopDeskAvailable?: boolean;
  routedViaMotherWilaya?: number | null;
  stopDeskUnavailableReason?: string | null;
  error?: string;
}

const communes = communesRawData as RawCommune[];
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<number, { at: number; result: DeliveryOfficesResult }>();

/** Lowercase, strip accents and separators so "Aïn-Témouchent" and "AIN TEMOUCHENT" compare equal. */
export function normalizeCommuneKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function getDeliveryOffices(wilayaId: number): Promise<DeliveryOfficesResult> {
  const hit = cache.get(wilayaId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  // 1. Check synced DB stop desks first (allows admin overrides for all 69 wilayas)
  if (isServiceRoleConfigured()) {
    try {
      const supabase = getSupabaseServerClient() as any;
      const { data: desks } = await supabase
        .from("courier_stop_desks")
        .select("commune, name")
        .eq("wilaya_code", wilayaId)
        .eq("is_active", true);

      if (Array.isArray(desks) && desks.length > 0) {
        const deskNames = new Set(desks.map((d: any) => normalizeCommuneKey(String(d.commune || d.name || ""))));
        const matched = communes
          .filter((c) => c.wilaya_code === wilayaId && deskNames.has(normalizeCommuneKey(c.commune_name_fr)))
          .map((c) => ({ ar: c.commune_name_ar, fr: c.commune_name_fr }));
        const finalOffices =
          matched.length > 0
            ? matched
            : desks.map((d: any) => ({ ar: String(d.commune || d.name), fr: String(d.commune || d.name) }));
        const result: DeliveryOfficesResult = {
          success: true,
          wilayaId,
          offices: finalOffices,
          stopDeskAvailable: true,
        };
        cache.set(wilayaId, { at: Date.now(), result });
        return result;
      }
    } catch {
      // Fall through cleanly if schema hasn't added courier_stop_desks yet
    }
  }

  // 2. For Law 26-06 new wilayas (59..69) without dedicated synced desks,
  // keep both home and Stop-Desk options selectable (routing Stop-Desk via the central hub).
  if (isNewWilaya69(wilayaId)) {
    const motherWilayaCode = getMotherWilayaCode(wilayaId);
    const result: DeliveryOfficesResult = {
      success: true,
      wilayaId,
      offices: [],
      stopDeskAvailable: true,
      routedViaMotherWilaya: motherWilayaCode,
      stopDeskUnavailableReason:
        "لا يتواجد مكتب استلام محلي في هذه البلدية — يمكنك اختيار التوصيل للمنزل أو الاستلام من المكتب الرئيسي للولاية",
    };
    cache.set(wilayaId, { at: Date.now(), result });
    return result;
  }

  // 3. Query EcoTrack live communes for wilayas 1..58
  const ecoCommunes = await getEcoTrackClient().getCommunes(wilayaId);
  if (!ecoCommunes.length) {
    return {
      success: false,
      wilayaId,
      offices: [],
      error: "EcoTrack communes unavailable",
    };
  }

  const withDesk = ecoCommunes.filter((c) => Number(c.has_stop_desk) === 1 && Number(c.is_active ?? 1) !== 0);
  const deskNames = new Set(withDesk.map((c) => normalizeCommuneKey(String(c.nom || ""))));
  const deskPostal = new Set(withDesk.map((c) => String(c.code_postal || "").trim()).filter(Boolean));

  const offices = communes
    .filter((c) => c.wilaya_code === wilayaId)
    .filter(
      (c) =>
        deskNames.has(normalizeCommuneKey(c.commune_name_fr)) ||
        (c.postal_code ? deskPostal.has(String(c.postal_code).trim()) : false),
    )
    .map((c) => ({ ar: c.commune_name_ar, fr: c.commune_name_fr }));

  if (withDesk.length > 0 && offices.length === 0) {
    return { success: false, wilayaId, offices: [], error: "Could not match EcoTrack agencies to communes" };
  }

  const result: DeliveryOfficesResult = {
    success: true,
    wilayaId,
    offices,
    stopDeskAvailable: offices.length > 0,
    stopDeskUnavailableReason:
      offices.length > 0 ? null : "مكتب التوصيل غير متوفر حالياً — التوصيل للمنزل متاح عبر رجل التوصيل",
  };
  cache.set(wilayaId, { at: Date.now(), result });
  return result;
}
