/**
 * ORVA Store — Phase 7G Delivery Tracking Contracts & Types
 * 
 * Establishes a unified technical foundation for:
 * 1. Normalized Courier Statuses across Algerian couriers (Redex, Ecotrack, Yalidine, etc.).
 * 2. Customer Receipt Classification (Received, Not Yet Received, Failed, Returned, Unknown).
 * 3. ICourierAdapter interface for asynchronous tracking sync.
 * 4. Timeline Event representation with strict category attribution.
 */

import type { OrderStatus, DeliveryType } from "../repository/types";

export type NormalizedCourierStatus =
  | "UNKNOWN"
  | "PENDING"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED_TO_CUSTOMER"
  | "DELIVERY_FAILED"
  | "CUSTOMER_REFUSED"
  | "RETURN_IN_PROGRESS"
  | "RETURNED_TO_SENDER";

export type CustomerReceiptClassification =
  | "Received"               // Confirmed DELIVERED_TO_CUSTOMER
  | "Not Yet Received"       // In transit, out for delivery, picked up, or pending
  | "Not Received / Failed"  // Documented failure or customer refusal
  | "Returning"              // Return in progress to sender (not yet arrived at warehouse)
  | "Returned"               // Confirmed returned to sender at warehouse
  | "Unknown";               // Insufficient tracking data

export type SyncResultStatus = "success" | "failed" | "not_found";

export interface DeliveryTimelineEvent {
  id: string;
  stepKey: string;
  titleAr: string;
  titleEn: string;
  descriptionAr?: string;
  timestamp: string | null; // Strict rule: null if not genuinely available. NEVER invent fake dates!
  category: "orva_internal" | "courier_external" | "mock_simulated";
  status: "completed" | "in_progress" | "pending" | "failed";
}

export interface CourierTrackingResult {
  orderId: string;
  courierName: string;                     // e.g. "Redex (ريديكس)", "Ecotrack", "Yalidine"
  courierId: string;                       // e.g. "redex", "ecotrack", "yalidine"
  trackingCode: string;                    // e.g. "RDX-10951", "ECO-10934"
  externalStatusCode: string;              // Raw code e.g. "LIVRE_CLIENT", "EN_COURS_LIVRAISON"
  normalizedStatus: NormalizedCourierStatus;
  receiptClassification: CustomerReceiptClassification;
  lastSyncedAt: string;                    // ISO timestamp of last synchronization
  syncResult: SyncResultStatus;
  safeMessage: string;
  timelineEvents: DeliveryTimelineEvent[];
}

export interface ICourierAdapter {
  getTrackingStatus(trackingCode: string, orderId?: string): Promise<CourierTrackingResult>;
  getBulkTrackingStatus(trackingCodes: string[]): Promise<CourierTrackingResult[]>;
}

export interface DeliveryKPIMetrics {
  totalOrders: number;
  deliveredOrders: number;
  inTransitOrders: number;
  deliveryFailedOrders: number;
  returnedOrders: number;
  pendingTrackingOrders: number;
  unknownStatusOrders: number;
  returningOrders: number;
}

export interface DeliveryFilterOptions {
  searchTerm: string;                      // Name, phone, orderId, trackingCode
  wilayaCode: string;                      // e.g. "all", "09", "16", "31"
  courierId: string;                       // e.g. "all", "redex", "ecotrack", "yalidine", "none"
  orvaStatus: string;                      // e.g. "all", OrderStatus
  courierStatus: string;                   // e.g. "all", NormalizedCourierStatus
  receiptStatus: string;                   // e.g. "all", CustomerReceiptClassification
  dateRange: "today" | "last_7_days" | "last_30_days" | "all";
}

export interface CustomerOrderSummary {
  customerKey: string;                     // Normalized customer phone or name
  fullName: string;
  phone: string;
  maskedPhone: string;
  wilaya: string;
  commune: string;
  totalOrdersCount: number;
  totalDeliveredCount: number;
  orderIds: string[];
}
