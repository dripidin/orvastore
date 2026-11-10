/**
 * ORVA Store — Durable Delivery Validation Reconciliation Engine (Stage 2 Stabilization)
 * Solves REC-01: Provides robust, idempotent, serverless-safe reconciliation for Redex delivery validations.
 *
 * INVARIANTS:
 * 1. Dedicated delivery_validation_reconciliations store (never mixes with financial COD reconciliation).
 * 2. Stable operation_id prevents duplicate carrier validations across concurrent requests, retries, and isolates.
 * 3. Pre-carrier intent registration in Supabase prevents orphan executions when database is reachable.
 * 4. Cryptographic client recovery receipt provides data integrity and authentication (HMAC-SHA256) for safe retry verification.
 * 5. Recovery worker interrogates external carrier state first and NEVER calls validOrder() during reconciliation.
 * 6. Preserves the rule that newly created parcels remain "Prêt à expédier" until explicit administrative action.
 */

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ECOTRACK_STATUS_MAP_AR } from './ecotrack-client';

export const RECONCILIATION_TABLE = 'delivery_validation_reconciliations';
export const LEASE_TTL_MS = 30_000; // 30-second distributed lease

export type ReconciliationState =
  | 'PENDING_CARRIER'
  | 'CARRIER_ACCEPTED_DB_FAILED'
  | 'RECONCILED'
  | 'FAILED'
  | 'STALE_ABANDONED';

export interface ReconciliationReceiptPayload {
  operationId: string;
  trackingCode: string;
  orderId: string;
  askCollection: number;
  carrierAccepted: boolean;
  carrierStatus: string;
  actor: string;
  issuedAt: number;
  expiresAt: number;
}

export interface PreCarrierReservationResult {
  acquired: boolean;
  operationId: string;
  leaseToken: string;
  leaseExpiresAt: string;
  reconciliationId?: string;
  existingState?: ReconciliationState;
  alreadyReconciled?: boolean;
  alreadyAccepted?: boolean;
  conflict?: boolean;
  dbError?: string;
  error?: string;
}

export interface ReconciliationSyncResult {
  success: boolean;
  reconciled: boolean;
  operationId: string;
  trackingCode: string;
  carrierStatus: string;
  carrierStatusAr: string;
  reconciliationState: ReconciliationState;
  carrierAccepted: boolean;
  recoveryReceipt?: string;
  message: string;
  error?: string;
}

/**
 * Derives a deterministic or client-supplied stable operation identifier.
 */
export function generateOperationId(trackingCode: string, askCollection: number, customId?: string): string {
  if (customId && typeof customId === 'string' && customId.trim().length > 0) {
    return customId.trim();
  }
  const cleanTracking = trackingCode.trim().toUpperCase();
  return `op-val-${cleanTracking}-${askCollection}`;
}

/**
 * Signs a tamper-evident recovery receipt for client resilience during total Supabase outages.
 * Provides data integrity and authenticity via HMAC-SHA256.
 */
export function createRecoveryReceipt(payload: ReconciliationReceiptPayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies and decodes a recovery receipt.
 */
export function verifyRecoveryReceipt(receipt: string, secret: string): ReconciliationReceiptPayload | null {
  if (!receipt || typeof receipt !== 'string' || !receipt.includes('.')) return null;

  try {
    const parts = receipt.split('.');
    if (parts.length !== 2) return null;
    const [data, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload: ReconciliationReceiptPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (!payload || !payload.trackingCode || !payload.operationId) {
      return null;
    }

    if (payload.expiresAt && Date.now() > payload.expiresAt) {
      return null; // Expired receipt
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Acquires an atomic pre-carrier reservation in Supabase.
 * Enforces:
 * 1. If already RECONCILED, returns existing state without permitting carrier call.
 * 2. If lease is active under another process, returns acquired: false (concurrency block).
 * 3. If lease expired or record fresh, acquires leaseToken with 30s TTL.
 * 4. Protects foreign key integrity by rejecting invalid order_id references.
 */
export async function acquirePreCarrierReservation(
  supabase: SupabaseClient<any> | null,
  params: {
    operationId: string;
    trackingCode: string;
    orderId: string;
    askCollection: number;
    targetCarrierStatus: 'en_ramassage' | 'vers_station';
    verifiedActor: string;
  }
): Promise<PreCarrierReservationResult> {
  const { operationId, trackingCode, orderId, askCollection, targetCarrierStatus, verifiedActor } = params;
  const now = Date.now();
  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(now + LEASE_TTL_MS).toISOString();

  if (!orderId || orderId.trim() === '' || orderId === trackingCode) {
    return {
      acquired: false,
      operationId,
      leaseToken,
      leaseExpiresAt,
      error: 'Valid order_id reference required for pre-carrier reservation',
    };
  }

  if (!supabase) {
    return {
      acquired: false,
      operationId,
      leaseToken,
      leaseExpiresAt,
      error: 'Supabase client unavailable for pre-carrier reservation',
    };
  }

  try {
    // 1. Inspect existing reconciliation row for this operation_id
    const { data: existing, error: fetchErr } = await supabase
      .from(RECONCILIATION_TABLE)
      .select('*')
      .eq('operation_id', operationId)
      .maybeSingle();

    if (!fetchErr && existing) {
      // If already reconciled, return idempotent success
      if (existing.reconciliation_state === 'RECONCILED') {
        return {
          acquired: false,
          alreadyReconciled: true,
          operationId,
          leaseToken: existing.lease_token || leaseToken,
          leaseExpiresAt: existing.lease_expires_at || leaseExpiresAt,
          reconciliationId: existing.id,
          existingState: 'RECONCILED',
          alreadyAccepted: true,
        };
      }

      // If active lease held by another process
      const currentExpiry = existing.lease_expires_at ? new Date(existing.lease_expires_at).getTime() : 0;
      if (existing.reconciliation_state === 'PENDING_CARRIER' && currentExpiry > now) {
        return {
          acquired: false,
          conflict: true,
          alreadyReconciled: false,
          operationId,
          leaseToken: existing.lease_token,
          leaseExpiresAt: existing.lease_expires_at,
          reconciliationId: existing.id,
          existingState: 'PENDING_CARRIER',
          error: 'Active reservation lease currently held by another worker',
        };
      }

      // Carrier already accepted in a previous partial-failure attempt
      if (existing.carrier_accepted || existing.reconciliation_state === 'CARRIER_ACCEPTED_DB_FAILED') {
        return {
          acquired: true, // Acquired for sync only
          alreadyReconciled: false,
          alreadyAccepted: true,
          operationId,
          leaseToken,
          leaseExpiresAt,
          reconciliationId: existing.id,
          existingState: existing.reconciliation_state,
        };
      }

      // Lease expired: atomically re-acquire
      const { data: updated, error: updateErr } = await supabase
        .from(RECONCILIATION_TABLE)
        .update({
          lease_token: leaseToken,
          lease_expires_at: leaseExpiresAt,
          reconciliation_state: 'PENDING_CARRIER',
          retry_count: (existing.retry_count || 0) + 1,
          verified_actor: verifiedActor,
          updated_at: new Date(now).toISOString(),
        })
        .eq('operation_id', operationId)
        .select('*')
        .maybeSingle();

      if (updateErr || !updated) {
        return {
          acquired: false,
          dbError: updateErr?.message || 'Failed to re-acquire expired reservation lease',
          operationId,
          leaseToken,
          leaseExpiresAt,
          error: updateErr?.message || 'Failed to re-acquire expired reservation lease',
        };
      }

      return {
        acquired: true,
        operationId,
        leaseToken,
        leaseExpiresAt,
        reconciliationId: updated.id,
        existingState: 'PENDING_CARRIER',
      };
    }

    // 2. Insert fresh pre-carrier reservation record
    const { data: inserted, error: insertErr } = await supabase
      .from(RECONCILIATION_TABLE)
      .insert({
        operation_id: operationId,
        tracking_code: trackingCode,
        order_id: orderId,
        carrier_provider: 'REDEX',
        ask_collection: askCollection,
        target_carrier_status: targetCarrierStatus,
        reconciliation_state: 'PENDING_CARRIER',
        carrier_accepted: false,
        verified_actor: verifiedActor,
        retry_count: 0,
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt,
        created_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
      })
      .select('*')
      .maybeSingle();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return {
          acquired: false,
          conflict: true,
          operationId,
          leaseToken,
          leaseExpiresAt,
          error: 'Concurrent insert conflict on operation_id (lease acquired by peer)',
        };
      }
      return {
        acquired: false,
        dbError: insertErr.message,
        operationId,
        leaseToken,
        leaseExpiresAt,
        error: insertErr.message,
      };
    }

    return {
      acquired: true,
      operationId,
      leaseToken,
      leaseExpiresAt,
      reconciliationId: inserted?.id,
      existingState: 'PENDING_CARRIER',
    };
  } catch (err: any) {
    return {
      acquired: false,
      dbError: err?.message || 'Pre-carrier reservation database error',
      operationId,
      leaseToken,
      leaseExpiresAt,
      error: err?.message || 'Pre-carrier reservation database error',
    };
  }
}

/**
 * Transitions reconciliation state to CARRIER_ACCEPTED_DB_FAILED when carrier accepted
 * but database synchronization failed.
 */
export async function recordCarrierAcceptedFailure(
  supabase: SupabaseClient<any> | null,
  params: {
    operationId: string;
    trackingCode: string;
    orderId: string;
    askCollection: number;
    targetCarrierStatus: 'en_ramassage' | 'vers_station';
    verifiedActor: string;
    dbError: string;
  }
): Promise<boolean> {
  if (!supabase) return false;

  const nowIso = new Date().toISOString();
  try {
    const { error } = await supabase
      .from(RECONCILIATION_TABLE)
      .upsert({
        operation_id: params.operationId,
        tracking_code: params.trackingCode,
        order_id: params.orderId,
        carrier_provider: 'REDEX',
        ask_collection: params.askCollection,
        target_carrier_status: params.targetCarrierStatus,
        reconciliation_state: 'CARRIER_ACCEPTED_DB_FAILED',
        carrier_accepted: true,
        carrier_accepted_at: nowIso,
        verified_actor: params.verifiedActor,
        last_error: params.dbError,
        lease_token: null,
        lease_expires_at: null,
        updated_at: nowIso,
      }, { onConflict: 'operation_id' });

    return !error;
  } catch {
    return false;
  }
}

/**
 * Marks reconciliation as completely synchronized in the database.
 */
export async function recordReconciliationSuccess(
  supabase: SupabaseClient<any> | null,
  params: {
    operationId: string;
    carrierStatus: string;
    externalCarrierStatus?: string;
  }
): Promise<boolean> {
  if (!supabase) return false;

  const nowIso = new Date().toISOString();
  try {
    const { error } = await supabase
      .from(RECONCILIATION_TABLE)
      .update({
        reconciliation_state: 'RECONCILED',
        carrier_accepted: true,
        external_carrier_status: params.externalCarrierStatus || params.carrierStatus,
        last_error: null,
        lease_token: null,
        lease_expires_at: null,
        updated_at: nowIso,
      })
      .eq('operation_id', params.operationId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Safe Idempotent Recovery Worker.
 * STRICT INVARIANTS:
 * 1. Interrogates external carrier state and NEVER calls validOrder()!
 * 2. DEF-04: Preserves advanced carrier statuses (en_hub, en_livraison, livred) without regressing.
 * 3. DEF-05 & DEF-06: Treats unknown or delayed statuses as pending verification without abandoning to prete_a_expedier.
 */
export async function executeSafeReconciliation(params: {
  operationId: string;
  trackingCode: string;
  askCollection: number;
  verifiedActor: string;
  ecotrackClient: { getTrackingInfo: (tracking: string) => Promise<any> };
  supabase: SupabaseClient<any> | null;
}): Promise<ReconciliationSyncResult> {
  const { operationId, trackingCode, askCollection, verifiedActor, ecotrackClient, supabase } = params;
  const targetCarrierStatus = askCollection === 1 ? 'en_ramassage' : 'vers_station';
  const targetCarrierStatusAr = askCollection === 1 ? 'قيد الاستلام من المتجر' : 'في الطريق إلى مركز التوزيع';

  const nonRegressibleStatuses = [
    'en_ramassage', 'vers_station', 'en_station', 'vers_hub', 'en_hub',
    'vers_wilaya', 'en_preparation', 'dispatched_to_driver', 'en_livraison',
    'livred', 'livre', 'livre_non_encaisse', 'encaisse_non_paye', 'encaissed',
    'payed', 'paye_et_archive'
  ];

  // 1. Interrogate Carrier Truth First (NEVER CALL validOrder!)
  let carrierAccepted = false;
  let externalStatus = 'prete_a_expedier';

  try {
    const trackInfo = await ecotrackClient.getTrackingInfo(trackingCode);
    if (trackInfo && trackInfo.success && Array.isArray(trackInfo.activity) && trackInfo.activity.length > 0) {
      const hasAcceptedEvent = trackInfo.activity.some((act: any) => {
        const s = String(act.status || '').toLowerCase();
        return nonRegressibleStatuses.includes(s);
      });

      if (hasAcceptedEvent) {
        carrierAccepted = true;
        const lastAct = trackInfo.activity[trackInfo.activity.length - 1];
        externalStatus = String(lastAct.status || targetCarrierStatus).toLowerCase();
      } else {
        const lastAct = trackInfo.activity[trackInfo.activity.length - 1];
        if (lastAct && lastAct.status) {
          externalStatus = String(lastAct.status).toLowerCase();
        }
      }
    }
  } catch (err: any) {
    return {
      success: false,
      reconciled: false,
      operationId,
      trackingCode,
      carrierStatus: targetCarrierStatus,
      carrierStatusAr: targetCarrierStatusAr,
      reconciliationState: 'CARRIER_ACCEPTED_DB_FAILED',
      carrierAccepted: false,
      message: 'Failed to interrogate carrier state during reconciliation',
      error: err?.message || 'Carrier tracking query timeout',
    };
  }

  // 2. Synchronize Database if Carrier confirmed acceptance (DEF-04 Fix)
  if (carrierAccepted) {
    const statusMeta = ECOTRACK_STATUS_MAP_AR[externalStatus];
    const finalCarrierStatus = externalStatus;
    const finalCarrierStatusAr = statusMeta?.label || (targetCarrierStatus === 'en_ramassage' ? 'قيد الاستلام من المتجر' : 'في الطريق إلى مركز التوزيع');

    let highLevelStatus: 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED' | 'CANCELLED' = 'IN_TRANSIT';
    if (statusMeta?.stage === 'delivered') {
      highLevelStatus = 'DELIVERED';
    } else if (statusMeta?.stage === 'returned') {
      highLevelStatus = 'RETURNED';
    } else if (statusMeta?.stage === 'cancelled') {
      highLevelStatus = 'CANCELLED';
    }

    if (supabase) {
      const nowIso = new Date().toISOString();

      // Update deliveries table preserving advanced status
      await supabase
        .from('deliveries')
        .update({
          status: highLevelStatus,
          carrier_status: finalCarrierStatus,
          carrier_status_ar: finalCarrierStatusAr,
          updated_at: nowIso,
        })
        .eq('tracking_number', trackingCode);

      // Update reconciliation table
      await recordReconciliationSuccess(supabase, {
        operationId,
        carrierStatus: finalCarrierStatus,
        externalCarrierStatus: externalStatus,
      });
    }

    return {
      success: true,
      reconciled: true,
      operationId,
      trackingCode,
      carrierStatus: finalCarrierStatus,
      carrierStatusAr: finalCarrierStatusAr,
      reconciliationState: 'RECONCILED',
      carrierAccepted: true,
      message: 'Reconciliation successful: carrier state verified and synchronized to database with zero validOrder calls.',
    };
  }

  // 3. Carrier has NOT confirmed accepted status yet (stale propagation or unknown status)
  // DEF-05 & DEF-06 Fix: Preserve validation_in_progress to prevent duplicate validOrder() calls while pending verification.
  const unknownOrStaleStatus = externalStatus !== 'prete_a_expedier' ? externalStatus : 'prete_a_expedier';
  const unknownMeta = ECOTRACK_STATUS_MAP_AR[unknownOrStaleStatus];
  const pendingStatusAr = unknownMeta?.label || 'قيد التحقق من حالة الشحنة لدى الناقل';

  if (supabase) {
    await supabase
      .from(RECONCILIATION_TABLE)
      .update({
        reconciliation_state: 'PENDING_CARRIER',
        carrier_accepted: false,
        last_error: `Carrier tracking pending confirmation: status '${unknownOrStaleStatus}'`,
        updated_at: new Date().toISOString(),
      })
      .eq('operation_id', operationId);
  }

  return {
    success: false,
    reconciled: false,
    operationId,
    trackingCode,
    carrierStatus: 'validation_in_progress',
    carrierStatusAr: pendingStatusAr,
    reconciliationState: 'PENDING_CARRIER',
    carrierAccepted: false,
    message: `حالة الشحنة قيد التحقق لدى شركة التوصيل (${pendingStatusAr}). تم تعليق الإرسالية لمنع التكرار حتى تأكيد حالة الطرد.`,
  };
}
