/**
 * ORVA COD E-Commerce Platform — Interface Contracts
 * Exact representations of interface contracts defined in PROJECT.md
 */

// 1. Storefront Checkout ↔ Orders Domain
export interface CodOrderSubmission {
  customerName: string;
  customerPhone: string;
  customerPhone2?: string;
  wilayaCode: number;         // 1 to 58
  wilayaName: string;
  communeName: string;
  deliveryAddress?: string;
  deliveryType: 'DOMICILE' | 'STOP_DESK';
  packId: 'PACK1' | 'PACK2' | 'PACK3';
  productName: string;
  productPrice: number;
  shippingFee: number;
  totalPayable: number;
  honeypot?: string;
}

export interface CodOrderResult {
  success: boolean;
  orderNumber?: string;
  error?: string;
  validationErrors?: Record<string, string>;
}

// 2. Order Re-routing Contract
export interface OrderReRoutingPayload {
  orderId: string;
  sourceOrderId?: string;
  newCustomerName: string;
  newCustomerPhone: string;
  newWilayaCode: number;
  newWilayaName: string;
  newCommuneName: string;
  newDeliveryType: 'DOMICILE' | 'STOP_DESK';
  newDeliveryAddress?: string;
  reason: string;
  operator: string;
  shippedOverrideConfirmed: boolean;
}

export interface OrderReRoutingResult {
  success: boolean;
  orderId: string;
  sequence: number;
  formattedCourierNote: string;
  updatedShippingFee: number;
  updatedTotal: number;
  timestampUtc: string;
  error?: string;
}

// 3. Courier Logistics Provider Contract
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

export interface ICourierProvider {
  readonly id: string;
  readonly name: string;
  readonly supportsStopDesk: boolean;

  testConnection(credentials: Record<string, string>): Promise<{ success: boolean; message: string }>;
  createParcel(request: CourierParcelRequest, credentials: Record<string, string>): Promise<CourierParcelResponse>;
  getTrackingStatus(trackingCode: string, credentials: Record<string, string>): Promise<{ status: string; description: string }>;
}

// 4. External Integrations Contract
export interface MetaCapiEvent {
  eventName: 'PageView' | 'ViewContent' | 'InitiateCheckout' | 'Purchase';
  eventId: string;
  eventSourceUrl: string;
  userData: {
    phone?: string; // Hashed SHA-256
    name?: string;  // Hashed SHA-256
    clientIpAddress?: string;
    clientUserAgent?: string;
  };
  customData?: {
    currency: 'DZD';
    value: number;
    contentName?: string;
    contentIds?: string[];
  };
}

export interface TelegramOrderAlert {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  wilaya: string;
  commune: string;
  deliveryType: string;
  productName: string;
  total: number;
}
