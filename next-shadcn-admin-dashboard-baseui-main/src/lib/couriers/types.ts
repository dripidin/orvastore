/**
 * ORVA COD Store — Multi-Courier Provider Interface Contracts & Extended Types
 */

import type { RateLimitSnapshot } from "./ecotrack-rate-limiter";

export interface CourierParcelRequest {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  wilayaCode: number;
  wilayaName: string;
  communeName: string;
  address: string;
  deliveryType: "DOMICILE" | "STOP_DESK";
  stopDeskId?: string;
  amountToCollect: number; // COD amount in DZD
  productDescription: string;
  productSku?: string;
  quantity?: number;
  isStockOrder?: boolean;
  exchangeProduct?: string;
  orderType?: 1 | 2 | 3 | 4; // 1=Livraison, 2=Echange, 3=Pickup, 4=Recouvrement
  weightKg?: number;
  fragile?: boolean;
  remark?: string;
  boutique?: string;
}

export interface CourierParcelResponse {
  success: boolean;
  trackingCode: string;
  trackingUrl?: string;
  labelUrl?: string;
  routedViaMotherWilaya?: boolean;
  effectiveWilayaCode?: number;
  rawResponse?: unknown;
  error?: string;
  errorCode?: number;
}

export interface CourierConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  servedWilayaIds?: number[];
  rateLimit?: RateLimitSnapshot;
}

export interface CourierTrackingStatus {
  status: string;
  description: string;
  updatedAt?: string;
}

export interface CourierValidationResult {
  success: boolean;
  message?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface CourierRemarkItem {
  remarque: string;
  station?: string;
  livreur?: string;
  createdAt?: string;
  authorRole: "driver" | "station" | "seller";
}

export interface CourierDeskInfo {
  deskPhone?: string;
  deskCommune?: string;
  deskAddress?: string;
  deskMapLink?: string;
}

export type ParcelLocationStage =
  | "ready"
  | "at_hub_station"
  | "in_transit"
  | "out_for_delivery_driver"
  | "suspended_switchable"
  | "delivered"
  | "returned"
  | "cancelled";

export interface CourierActivityCheckpoint {
  date: string;
  time: string;
  status: string;
  statusAr?: string;
  station?: string;
  scanLocation?: string;
  details?: string;
  reason?: string;
  driver?: string;
  postponedTo?: string;
}

export interface CourierDetailedTracking {
  success: boolean;
  courierId: string;
  tracking: string;
  status: string;
  statusAr: string;
  normalizedStatus: string;
  locationStage: ParcelLocationStage;
  isSwitchable: boolean;
  financialStatus?: string;
  recipientName?: string;
  currentStation?: string;
  driverName?: string;
  driverPhone?: string;
  deskInfo?: CourierDeskInfo;
  activity: CourierActivityCheckpoint[];
  remarks: CourierRemarkItem[];
  reasons?: string[];
  error?: string;
}

export interface CourierExternalOrder {
  tracking: string;
  reference: string;
  boutique?: string;
  client: string;
  phone: string;
  phone2?: string;
  address?: string;
  commune?: string;
  wilayaId?: number;
  wilayaName?: string;
  montant: number;
  status: string;
  financialStatus?: string;
  deliveryFee?: number;
  returnFee?: number;
  stopDesk?: boolean;
  driverName?: string;
  driverPhone?: string;
  currentStation?: string;
  deskInfo?: CourierDeskInfo;
  activity?: CourierActivityCheckpoint[];
  remarks?: CourierRemarkItem[];
  remarksSummary?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUpdatedAt?: string;
  raw?: unknown;
}

export interface CourierFeeMatrixRow {
  wilayaCode: number;
  tarifDomicile: number;
  tarifStopdesk: number;
  tarifRetour: number;
  tarifPickup: number;
  tarifEchange: number;
}

export interface CourierDeskRow {
  stationCode: string;
  name: string;
  wilayaCode: number;
  commune?: string;
  address?: string;
  phones: string[];
  mapUrl?: string;
}

export interface CourierSyncConfigResult {
  success: boolean;
  servedWilayaIds: number[];
  fees: CourierFeeMatrixRow[];
  desks: CourierDeskRow[];
  error?: string;
}

export interface CourierProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsStopDesk: boolean;

  testConnection(credentials?: Record<string, string>): Promise<CourierConnectionResult>;
  createParcel(request: CourierParcelRequest, credentials?: Record<string, string>): Promise<CourierParcelResponse>;
  getTrackingStatus(trackingCode: string, credentials?: Record<string, string>): Promise<CourierTrackingStatus>;
  validateParcel?(
    trackingCode: string,
    askCollection?: number,
    credentials?: Record<string, string>,
  ): Promise<CourierValidationResult>;

  // Extended unified operations
  updateParcel?(
    trackingCode: string,
    patch: Partial<{
      customerName: string;
      customerPhone: string;
      customerPhone2: string;
      address: string;
      communeName: string;
      wilayaCode: number;
      amountToCollect: number;
      remark: string;
      productDescription: string;
      deliveryType: "DOMICILE" | "STOP_DESK";
      stopDeskId: string;
    }>,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; message?: string; error?: string; errorCode?: number }>;

  deleteParcel?(
    trackingCode: string,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; message?: string; error?: string }>;

  askReturn?(
    trackingCode: string,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; message?: string; error?: string; errorCode?: number }>;

  validateReturn?(
    trackingCode: string,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; message?: string; error?: string }>;

  addRemark?(
    trackingCode: string,
    content: string,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; message?: string; error?: string }>;

  getRemarks?(
    trackingCode: string,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; remarks: CourierRemarkItem[]; error?: string }>;

  getDetailedTracking?(trackingCode: string, credentials?: Record<string, string>): Promise<CourierDetailedTracking>;

  getOrders?(
    params?: { page?: number; startDate?: string; endDate?: string; tracking?: string },
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; orders: CourierExternalOrder[]; lastPage?: number; total?: number; error?: string }>;

  getLabelPdf?(
    trackingCode: string,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;

  syncConfiguration?(credentials?: Record<string, string>): Promise<CourierSyncConfigResult>;
}

export type ICourierProvider = CourierProvider;

export interface CourierSettingsConfig {
  activeProvider: "mock" | "yalidine" | "zr_express" | string;
  yalidine: {
    apiId: string;
    apiToken: string;
    defaultDeliveryType?: "DOMICILE" | "STOP_DESK";
  };
  zrExpress: {
    apiKey: string;
    apiSecret: string;
  };
}
