import { getEcoTrackClient } from "@/lib/couriers/ecotrack-client";
import communesRawData from "@/data/geoalgeria/communes.json";

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
  /** Communes of this wilaya that have an EcoTrack stop-desk (agency). */
  offices: DeliveryOfficeCommune[];
  error?: string;
}

const communes = communesRawData as RawCommune[];
const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<number, { at: number; result: DeliveryOfficesResult }>();

/** Lowercase, strip accents and separators so "Aïn-Témouchent" and "AIN TEMOUCHENT" compare equal. */
export function normalizeCommuneKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function getDeliveryOffices(wilayaId: number): Promise<DeliveryOfficesResult> {
  const hit = cache.get(wilayaId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  const ecoCommunes = await getEcoTrackClient().getCommunes(wilayaId);
  if (!ecoCommunes.length) {
    return { success: false, wilayaId, offices: [], error: "EcoTrack communes unavailable" };
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

  // EcoTrack reports agencies but none could be matched to our commune list: report "unknown"
  // so the UI falls back to the wilaya-level rule instead of wrongly disabling every office.
  if (withDesk.length > 0 && offices.length === 0) {
    return { success: false, wilayaId, offices: [], error: "Could not match EcoTrack agencies to communes" };
  }

  const result: DeliveryOfficesResult = { success: true, wilayaId, offices };
  cache.set(wilayaId, { at: Date.now(), result });
  return result;
}
