/**
 * ORVA Store — Dual-Track Status Bridge
 * - Preserves manual store actions (مستلمة / مرتجعة / ملغاة / مؤكدة / قيد الانتظار)
 * - Syncs forward-only courier progress without regressing terminal orders
 * - Enriches orders with live driver name/phone, desk info, location stage, remarks & return fee
 */

import type { CourierActivityCheckpoint, CourierDeskInfo, CourierRemarkItem } from "@/lib/couriers/types";

import {
  classifyParcelLocationStage,
  mapCourierStatusRich,
  type StoreOrderLifecycleStatus,
} from "./courier-status-mapper";

export const ORDER_STATUS_RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  pushed: 2,
  redex_station: 2,
  shipped: 3,
  in_transit: 3,
  delivered: 5,
  returned: 5,
  cancelled: 5,
};

export interface CourierStatusBridgeInput {
  currentStoreStatus?: string | null;
  manualStatusOverride?: boolean | null;
  courierStatusRaw: string;
  courierStatusAr?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  currentStation?: string | null;
  deskInfo?: CourierDeskInfo | null;
  checkpoints?: CourierActivityCheckpoint[] | null;
  remarks?: CourierRemarkItem[] | null;
  returnFeeDzd?: number | null;
  financialStatus?: string | null;
  statusSource?: "courier_api" | "courier_excel";
}

export interface CourierStatusBridgeUpdate {
  status?: StoreOrderLifecycleStatus;
  courier_status: string;
  courier_status_ar: string;
  normalized_courier_status: string;
  courier_location_stage: string;
  courier_last_synced_at: string;
  status_source?: "courier_api" | "courier_excel" | "manual_override";
  financial_status?: string;
  driver_name?: string;
  driver_phone?: string;
  current_station?: string;
  desk_info?: CourierDeskInfo;
  tracking_checkpoints?: CourierActivityCheckpoint[];
  courier_remarks?: CourierRemarkItem[];
  return_fee_dzd?: number;
  storeStatusChanged: boolean;
  previousStoreStatus: string;
  nextStoreStatus: string;
}

export function shouldAdvanceStoreStatus(params: {
  currentStoreStatus: string;
  candidateCourierStoreStatus: StoreOrderLifecycleStatus;
  manualStatusOverride: boolean;
}): boolean {
  const current = (params.currentStoreStatus || "pending").toLowerCase();
  const next = params.candidateCourierStoreStatus.toLowerCase();
  if (current === next) return false;

  const isTerminalFromCourier = next === "delivered" || next === "returned" || next === "cancelled";

  if (params.manualStatusOverride && !isTerminalFromCourier) {
    return false;
  }

  const currentRank = ORDER_STATUS_RANK[current] ?? 0;
  const nextRank = ORDER_STATUS_RANK[next] ?? 0;

  // Never regress a terminal order
  if (currentRank >= 5 && next !== current) {
    return false;
  }

  return nextRank > currentRank || isTerminalFromCourier;
}

export function computeCourierStatusBridgeUpdate(input: CourierStatusBridgeInput): CourierStatusBridgeUpdate {
  const rich = mapCourierStatusRich(input.courierStatusRaw);
  const locationStage = classifyParcelLocationStage(input.courierStatusRaw, input.checkpoints ?? undefined);
  const nowIso = new Date().toISOString();
  const prevStore = (input.currentStoreStatus || "pending").toLowerCase();

  const advance = shouldAdvanceStoreStatus({
    currentStoreStatus: prevStore,
    candidateCourierStoreStatus: rich.orderStatus,
    manualStatusOverride: Boolean(input.manualStatusOverride),
  });

  const nextStore = advance ? rich.orderStatus : (prevStore as StoreOrderLifecycleStatus);

  const patch: CourierStatusBridgeUpdate = {
    courier_status: input.courierStatusRaw,
    courier_status_ar: input.courierStatusAr || rich.labelAr,
    normalized_courier_status: rich.normalizedStatus,
    courier_location_stage: locationStage,
    courier_last_synced_at: nowIso,
    storeStatusChanged: advance,
    previousStoreStatus: prevStore,
    nextStoreStatus: nextStore,
  };

  if (advance) {
    patch.status = rich.orderStatus;
    patch.status_source = input.statusSource || "courier_api";
  }
  if (input.financialStatus || rich.financialStage !== "none") {
    patch.financial_status = input.financialStatus || input.courierStatusRaw;
  }
  if (input.driverName) patch.driver_name = input.driverName;
  if (input.driverPhone) patch.driver_phone = input.driverPhone;
  if (input.currentStation) patch.current_station = input.currentStation;
  if (input.deskInfo && Object.keys(input.deskInfo).length > 0) patch.desk_info = input.deskInfo;
  if (input.checkpoints && input.checkpoints.length > 0) patch.tracking_checkpoints = input.checkpoints;
  if (input.remarks && input.remarks.length > 0) patch.courier_remarks = input.remarks;
  if (input.returnFeeDzd !== undefined && input.returnFeeDzd !== null && Number(input.returnFeeDzd) >= 0) {
    patch.return_fee_dzd = Number(input.returnFeeDzd);
  }

  return patch;
}
