import {
  CourierProvider,
  CourierParcelRequest,
  CourierParcelResponse,
  CourierConnectionResult,
  CourierTrackingStatus,
} from './types';

export class MockCourierProvider implements CourierProvider {
  readonly id = 'mock';
  readonly name = 'Mock Express Adapter';
  readonly supportsStopDesk = true;

  async testConnection(_credentials?: Record<string, string>): Promise<CourierConnectionResult> {
    return {
      success: true,
      message: 'Mock provider online (simulation mode)',
      latencyMs: 15,
    };
  }

  async createParcel(
    request: CourierParcelRequest,
    _credentials?: Record<string, string>
  ): Promise<CourierParcelResponse> {
    const timestampSuffix = Date.now().toString().slice(-6);
    const tracking = `MCK-${request.wilayaCode}-${timestampSuffix}`;
    return {
      success: true,
      trackingCode: tracking,
      trackingUrl: `https://tracking.orva-store.com/mock/${request.orderNumber}`,
      labelUrl: `https://tracking.orva-store.com/mock/${tracking}/label.pdf`,
    };
  }

  async getTrackingStatus(_trackingCode: string): Promise<CourierTrackingStatus> {
    return {
      status: 'IN_TRANSIT',
      description: 'En cours d acheminement',
      updatedAt: new Date().toISOString(),
    };
  }
}
