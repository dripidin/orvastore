/**
 * ORVA COD Store — Courier Provider Interface Contracts & Types
 * Defined according to PROJECT.md § Interface Contracts § 3
 */

export interface CourierParcelRequest {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  wilayaCode: number;
  wilayaName: string;
  communeName: string;
  address: string;
  deliveryType: 'DOMICILE' | 'STOP_DESK';
  stopDeskId?: string;
  amountToCollect: number; // COD amount in DZD
  productDescription: string;
}

export interface CourierParcelResponse {
  success: boolean;
  trackingCode: string;
  trackingUrl?: string;
  labelUrl?: string;
  rawResponse?: unknown;
  error?: string;
}

export interface CourierConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

export interface CourierTrackingStatus {
  status: string;
  description: string;
  updatedAt?: string;
}

export interface CourierProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsStopDesk: boolean;

  testConnection(credentials?: Record<string, string>): Promise<CourierConnectionResult>;
  createParcel(request: CourierParcelRequest, credentials?: Record<string, string>): Promise<CourierParcelResponse>;
  getTrackingStatus(trackingCode: string, credentials?: Record<string, string>): Promise<CourierTrackingStatus>;
}

// Backwards-compatible alias for test harness & interfaces
export type ICourierProvider = CourierProvider;

export interface CourierSettingsConfig {
  activeProvider: 'mock' | 'yalidine' | 'zr_express' | string;
  yalidine: {
    apiId: string;
    apiToken: string;
    defaultDeliveryType?: 'DOMICILE' | 'STOP_DESK';
  };
  zrExpress: {
    apiKey: string;
    apiSecret: string;
  };
}
