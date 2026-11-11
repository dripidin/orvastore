import { getEcoTrackClient } from '@/lib/couriers/ecotrack-client';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { LiveTariff } from '@/lib/types/checkout';

const SERVICE = 'ecotrack';
const TTL_MS = 24 * 60 * 60 * 1000;

export interface DeliveryFeesResult {
  success: boolean;
  fees: Record<number, LiveTariff>;
  syncedAt: string | null;
  source: 'cache' | 'ecotrack' | 'none';
  error?: string;
}

async function readCache(): Promise<{ fees: Record<number, LiveTariff>; syncedAt: string | null }> {
  const fees: Record<number, LiveTariff> = {};
  let syncedAt: string | null = null;
  try {
    const supabase = getSupabaseServerClient() as any;
    const { data } = await supabase.from('delivery_fees').select('*').eq('service_type', SERVICE);
    for (const row of data ?? []) {
      fees[Number(row.wilaya_id)] = { domicile: Number(row.tarif_domicile), stopdesk: Number(row.tarif_stopdesk) };
      if (!syncedAt || row.synced_at > syncedAt) syncedAt = row.synced_at;
    }
  } catch {
    // table missing or DB offline: treated as empty cache
  }
  return { fees, syncedAt };
}

export async function getDeliveryFees(force = false): Promise<DeliveryFeesResult> {
  const cached = await readCache();
  const fresh = cached.syncedAt && Date.now() - new Date(cached.syncedAt).getTime() < TTL_MS;
  if (!force && fresh && Object.keys(cached.fees).length > 0) {
    return { success: true, ...cached, source: 'cache' };
  }

  try {
    const result = await getEcoTrackClient().getFees();
    if (!result.success || !result.fees?.length) throw new Error(result.error || 'No fees returned');

    const now = new Date().toISOString();
    const fees: Record<number, LiveTariff> = {};
    const rows = result.fees.map((f) => {
      const domicile = Number(f.tarif) || 0;
      const stopdesk = Number(f.tarif_stopdesk) || 0;
      fees[Number(f.wilaya_id)] = { domicile, stopdesk };
      return { wilaya_id: Number(f.wilaya_id), service_type: SERVICE, tarif_domicile: domicile, tarif_stopdesk: stopdesk, synced_at: now };
    });

    try {
      const supabase = getSupabaseServerClient() as any;
      await supabase.from('delivery_fees').upsert(rows, { onConflict: 'wilaya_id,service_type' });
    } catch (e) {
      console.warn('[delivery-fees] cache write failed:', e);
    }
    return { success: true, fees, syncedAt: now, source: 'ecotrack' };
  } catch (err: any) {
    if (Object.keys(cached.fees).length > 0) {
      return { success: true, ...cached, source: 'cache', error: err?.message };
    }
    return { success: false, fees: {}, syncedAt: null, source: 'none', error: err?.message || 'Sync failed' };
  }
}

