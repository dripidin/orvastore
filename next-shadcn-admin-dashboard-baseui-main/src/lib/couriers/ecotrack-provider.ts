import {
  classifyParcelLocationStage,
  isSwitchableAtCourier,
  mapCourierStatusRich,
} from "@/lib/delivery/courier-status-mapper";
import { parseWilayaCode69 } from "@/lib/geo/algeria-69";

import { ECOTRACK_STATUS_MAP_AR, type EcoTrackClient, extractWilayaCode, getEcoTrackClient } from "./ecotrack-client";
import type {
  CourierConnectionResult,
  CourierDeskRow,
  CourierDetailedTracking,
  CourierExternalOrder,
  CourierFeeMatrixRow,
  CourierParcelRequest,
  CourierParcelResponse,
  CourierProvider,
  CourierRemarkItem,
  CourierSyncConfigResult,
  CourierTrackingStatus,
  CourierValidationResult,
} from "./types";

export class EcoTrackCourierProvider implements CourierProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly supportsStopDesk = true;
  protected readonly defaultBaseUrl: string;

  constructor(options?: { id?: string; name?: string; baseUrl?: string }) {
    this.id = (options?.id || "redex").trim().toLowerCase();
    this.name = options?.name || "Redex Express (EcoTrack)";
    this.defaultBaseUrl = (options?.baseUrl || "https://redex.ecotrack.dz").replace(/\/+$/, "");
  }

  protected getClient(credentials?: Record<string, string>): EcoTrackClient {
    const token =
      credentials?.token ||
      credentials?.apiToken ||
      (this.id === "redex" ? process.env.REDEX_API_TOKEN || process.env.ECOTRACK_API_TOKEN : undefined);
    const baseUrl =
      credentials?.baseUrl ||
      (this.id === "redex" ? process.env.REDEX_BASE_URL || process.env.ECOTRACK_BASE_URL : undefined) ||
      this.defaultBaseUrl;

    return getEcoTrackClient({ courierId: this.id, baseUrl, token });
  }

  async testConnection(credentials?: Record<string, string>): Promise<CourierConnectionResult> {
    const client = this.getClient(credentials);
    const result = await client.testConnection();
    return {
      success: result.success,
      message: result.message,
      latencyMs: result.latencyMs,
      servedWilayaIds: result.servedWilayaIds,
      rateLimit: result.rateLimit,
    };
  }

  async createParcel(
    request: CourierParcelRequest,
    credentials?: Record<string, string>,
  ): Promise<CourierParcelResponse> {
    const client = this.getClient(credentials);
    const wilayaCode = request.wilayaCode || extractWilayaCode(request.wilayaName);
    const stopDeskFlag = request.deliveryType === "STOP_DESK" ? 1 : 0;

    const resolved = await client.resolveCommuneForWilaya(wilayaCode, request.communeName);
    const finalCommune = resolved.resolvedCommune;
    const finalStopDeskCode = request.stopDeskId || resolved.stopDeskStationCode || undefined;
    const finalAddress =
      request.communeName && request.communeName !== finalCommune
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
      produit: request.productSku || request.productDescription,
      produit_a_recuperer: request.exchangeProduct,
      type: request.orderType ?? 1,
      stock: request.isStockOrder ? 1 : undefined,
      quantite: request.quantity,
      weight: request.weightKg,
      fragile: request.fragile ? 1 : undefined,
      remarque: request.remark,
      boutique: request.boutique || "ORVA Store",
    });

    if (!createResult.success || !createResult.tracking) {
      return {
        success: false,
        trackingCode: "",
        error: createResult.error || `فشل إنشاء الطلب لدى شركة التوصيل ${this.name}`,
        errorCode: createResult.errorCode,
        rawResponse: createResult.raw,
      };
    }

    const tracking = createResult.tracking;
    const base = client.getBaseUrl();

    // Requirement B invariant: never auto-call validOrder() on createParcel.
    return {
      success: true,
      trackingCode: tracking,
      trackingUrl: `${base}/tracking?tracking=${encodeURIComponent(tracking)}`,
      labelUrl:
        this.id === "redex"
          ? `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(tracking)}`
          : `/api/delivery?action=label_pdf&tracking=${encodeURIComponent(tracking)}&courier=${encodeURIComponent(this.id)}`,
      routedViaMotherWilaya: createResult.routedViaMotherWilaya,
      effectiveWilayaCode: createResult.effectiveWilayaCode,
      rawResponse: createResult.raw,
    };
  }

  async validateParcel(
    trackingCode: string,
    askCollection = 0,
    credentials?: Record<string, string>,
  ): Promise<CourierValidationResult> {
    if (askCollection !== 0 && askCollection !== 1) {
      return {
        success: false,
        error: "Invalid askCollection: must be 0 (vers_station) or 1 (en_ramassage)",
      };
    }

    const client = this.getClient(credentials);
    const result = await client.validOrder(trackingCode, askCollection);
    return {
      success: result.success,
      message: result.message,
      error: result.error,
      rawResponse: result,
    };
  }

  async updateParcel(
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
  ) {
    const client = this.getClient(credentials);
    return client.updateOrder(trackingCode, {
      client: patch.customerName,
      tel: patch.customerPhone,
      tel2: patch.customerPhone2,
      adresse: patch.address,
      commune: patch.communeName,
      wilaya: patch.wilayaCode,
      montant: patch.amountToCollect,
      remarque: patch.remark,
      product: patch.productDescription,
      stop_desk: patch.deliveryType !== undefined ? (patch.deliveryType === "STOP_DESK" ? 1 : 0) : undefined,
      code_postal: patch.stopDeskId,
    });
  }

  async deleteParcel(trackingCode: string, credentials?: Record<string, string>) {
    return this.getClient(credentials).deleteOrder(trackingCode);
  }

  async askReturn(trackingCode: string, credentials?: Record<string, string>) {
    return this.getClient(credentials).askOrderReturn(trackingCode);
  }

  async validateReturn(trackingCode: string, credentials?: Record<string, string>) {
    return this.getClient(credentials).validReturns(trackingCode);
  }

  async addRemark(trackingCode: string, content: string, credentials?: Record<string, string>) {
    return this.getClient(credentials).addRemark(trackingCode, content);
  }

  async getRemarks(
    trackingCode: string,
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; remarks: CourierRemarkItem[]; error?: string }> {
    return this.getClient(credentials).getRemarks(trackingCode);
  }

  async getTrackingStatus(trackingCode: string, credentials?: Record<string, string>): Promise<CourierTrackingStatus> {
    const info = await this.getClient(credentials).getTrackingInfo(trackingCode, false);
    if (!info.success) {
      return {
        status: "UNKNOWN",
        description: info.error || "تعذر جلب حالة التتبع",
        updatedAt: new Date().toISOString(),
      };
    }

    const latest = info.activity[info.activity.length - 1];
    return {
      status: info.status || "SHIPPED",
      description: info.statusAr || info.status || "في مسار التوصيل",
      updatedAt: latest ? `${latest.date} ${latest.time}` : new Date().toISOString(),
    };
  }

  async getDetailedTracking(
    trackingCode: string,
    credentials?: Record<string, string>,
  ): Promise<CourierDetailedTracking> {
    const info = await this.getClient(credentials).getTrackingInfo(trackingCode, true);
    const rawStatus = info.status || "UNKNOWN";
    const mapped = mapCourierStatusRich(rawStatus);
    return {
      success: info.success,
      courierId: this.id,
      tracking: info.tracking,
      status: rawStatus,
      statusAr: ECOTRACK_STATUS_MAP_AR[rawStatus]?.label || info.statusAr || mapped.labelAr,
      normalizedStatus: mapped.normalizedStatus,
      locationStage: classifyParcelLocationStage(rawStatus, info.activity),
      isSwitchable: isSwitchableAtCourier(rawStatus),
      financialStatus: info.financialStatus,
      recipientName: info.recipientName,
      currentStation: info.currentStation,
      driverName: info.driverName,
      driverPhone: info.driverPhone,
      deskInfo: info.deskInfo,
      activity: (info.activity || []).map((a) => ({
        date: a.date,
        time: a.time,
        status: a.status,
        statusAr: a.statusAr,
        station: a.station,
        scanLocation: a.scanLocation,
        details: a.details,
        reason: a.reason,
        driver: a.driver,
        postponedTo: a.postponed_to,
      })),
      remarks: info.remarks || [],
      reasons: info.reasons,
      error: info.error,
    };
  }

  async getOrders(
    params?: { page?: number; startDate?: string; endDate?: string; tracking?: string },
    credentials?: Record<string, string>,
  ): Promise<{ success: boolean; orders: CourierExternalOrder[]; lastPage?: number; total?: number; error?: string }> {
    return this.getClient(credentials).getOrders(params);
  }

  async getLabelPdf(trackingCode: string, credentials?: Record<string, string>) {
    return this.getClient(credentials).fetchLabelPdf(trackingCode);
  }

  async syncConfiguration(credentials?: Record<string, string>): Promise<CourierSyncConfigResult> {
    const client = this.getClient(credentials);
    const [wilayasRes, feesRes, desksRes] = await Promise.all([
      client.getWilayas(true),
      client.getFees(true),
      client.getDesks(true),
    ]);

    if (!wilayasRes.success && !feesRes.success) {
      return {
        success: false,
        servedWilayaIds: [],
        fees: [],
        desks: [],
        error: wilayasRes.error || feesRes.error || "تعذر مزامنة إعدادات شركة التوصيل",
      };
    }

    const servedWilayaIds = (wilayasRes.wilayas || [])
      .map((w) => Number(w.wilaya_id))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 69);

    const fees: CourierFeeMatrixRow[] = (feesRes.fees || []).map((f) => ({
      wilayaCode: Number(f.wilaya_id),
      tarifDomicile: Number(f.tarif) || 0,
      tarifStopdesk: Number(f.tarif_stopdesk) || 0,
      tarifRetour: Number(f.tarif_retour || feesRes.returnFeesByWilaya?.[Number(f.wilaya_id)] || 0),
      tarifPickup: Number(f.tarif_pickup || 0),
      tarifEchange: Number(f.tarif_echange || 0),
    }));

    const desks: CourierDeskRow[] = [];
    const rawDesks = desksRes.desks;
    const deskArray: any[] = Array.isArray(rawDesks)
      ? rawDesks
      : rawDesks && typeof rawDesks === "object"
        ? Object.values(rawDesks).flatMap((v) => (Array.isArray(v) ? v : [v]))
        : [];

    for (const d of deskArray) {
      if (!d || typeof d !== "object") continue;
      const wCode = parseWilayaCode69(d.wilaya_id ?? d.code_wilaya ?? d.wilaya) ?? 16;
      const stationCode = String(d.code_postal || d.code || d.id || `${wCode}-${d.commune || d.name || desks.length}`);
      const phones = [d.telephone, d.phone, d.tel, ...(Array.isArray(d.phones) ? d.phones : [])]
        .filter(Boolean)
        .map(String);
      desks.push({
        stationCode,
        name: String(d.name || d.nom || d.commune || stationCode),
        wilayaCode: wCode,
        commune: d.commune ? String(d.commune) : undefined,
        address: d.adresse || d.address ? String(d.adresse || d.address) : undefined,
        phones,
        mapUrl: d.map || d.map_url || d.gps_link ? String(d.map || d.map_url || d.gps_link) : undefined,
      });
    }

    return {
      success: true,
      servedWilayaIds,
      fees,
      desks,
    };
  }
}

export class RedexCourierProvider extends EcoTrackCourierProvider {
  constructor() {
    super({
      id: "redex",
      name: "Redex Express (EcoTrack)",
      baseUrl: process.env.REDEX_BASE_URL || process.env.ECOTRACK_BASE_URL || "https://redex.ecotrack.dz",
    });
  }
}
