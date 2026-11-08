import {
  CourierProvider,
  CourierParcelRequest,
  CourierParcelResponse,
  CourierConnectionResult,
  CourierTrackingStatus,
} from './types';
import { getEcoTrackClient, extractWilayaCode } from './ecotrack-client';

export class RedexCourierProvider implements CourierProvider {
  readonly id = 'redex';
  readonly name = 'Redex Express (EcoTrack)';
  readonly supportsStopDesk = true;

  async testConnection(credentials?: Record<string, string>): Promise<CourierConnectionResult> {
    const token = credentials?.token || process.env.ECOTRACK_API_TOKEN;
    const baseUrl = credentials?.baseUrl || process.env.ECOTRACK_BASE_URL;

    const client = getEcoTrackClient({ baseUrl, token });
    const start = Date.now();
    const result = await client.testConnection();
    const latencyMs = Date.now() - start;

    return {
      success: result.success,
      message: result.message,
      latencyMs,
    };
  }

  async createParcel(
    request: CourierParcelRequest,
    credentials?: Record<string, string>
  ): Promise<CourierParcelResponse> {
    const token = credentials?.token || process.env.ECOTRACK_API_TOKEN;
    const baseUrl = credentials?.baseUrl || process.env.ECOTRACK_BASE_URL;
    const client = getEcoTrackClient({ baseUrl, token });

    const wilayaCode = request.wilayaCode || extractWilayaCode(request.wilayaName);
    const stopDeskFlag = request.deliveryType === 'STOP_DESK' ? 1 : 0;

    // Intelligent Commune Resolver
    const resolved = await client.resolveCommuneForWilaya(wilayaCode, request.communeName);
    const finalCommune = resolved.resolvedCommune;
    const finalStopDeskCode = request.stopDeskId || resolved.stopDeskStationCode || undefined;
    const finalAddress = request.communeName && request.communeName !== finalCommune
      ? `${request.communeName} — ${request.address}`
      : request.address;

    const createResult = await client.createOrder({
      reference: request.orderNumber,
      nom_client: request.customerName,
      telephone: request.customerPhone,
      telephone_2: request.customerPhone2,
      adresse: finalAddress,
      commune: finalCommune,
      code_wilaya: wilayaCode,
      montant: request.amountToCollect,
      stop_desk: stopDeskFlag,
      code_postal: finalStopDeskCode,
      produit: request.productDescription,
      type: 1,
      boutique: 'ORVA Store',
    });

    if (!createResult.success || !createResult.tracking) {
      return {
        success: false,
        trackingCode: '',
        error: createResult.error || 'فشل إنشاء الطلب لدى شركة التوصيل Redex',
        rawResponse: createResult.raw,
      };
    }

    const tracking = createResult.tracking;

    // Auto-validate immediately as per approved workflow
    await client.validOrder(tracking, 0);

    return {
      success: true,
      trackingCode: tracking,
      trackingUrl: `https://redex.ecotrack.dz/tracking?tracking=${encodeURIComponent(tracking)}`,
      labelUrl: `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(tracking)}`,
      rawResponse: createResult.raw,
    };
  }

  async getTrackingStatus(
    trackingCode: string,
    credentials?: Record<string, string>
  ): Promise<CourierTrackingStatus> {
    const token = credentials?.token || process.env.ECOTRACK_API_TOKEN;
    const baseUrl = credentials?.baseUrl || process.env.ECOTRACK_BASE_URL;
    const client = getEcoTrackClient({ baseUrl, token });

    const info = await client.getTrackingInfo(trackingCode);
    if (!info.success) {
      return {
        status: 'UNKNOWN',
        description: info.error || 'تعذر جلب حالة التتبع',
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      status: info.status || 'SHIPPED',
      description: info.statusAr || info.status || 'في مسار التوصيل',
      updatedAt: info.activity[info.activity.length - 1]
        ? `${info.activity[info.activity.length - 1].date} ${info.activity[info.activity.length - 1].time}`
        : new Date().toISOString(),
    };
  }
}

