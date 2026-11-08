import wilayaBoundariesRaw from "./wilaya-boundaries.json";
import wilayasPointsData from "./wilayas-points.json";
import communesData from "./communes.json";

/**
 * Rewind GeoJSON polygon coordinates to ensure counter-clockwise outer rings.
 * In d3-geo spherical geometry, clockwise polygons represent the exterior of the globe
 * (area > 2*PI), causing them to cover the entire canvas in solid black.
 */
function rewindFeatureCoordinates(feature: any): any {
  if (!feature || !feature.geometry) return feature;
  const geom = feature.geometry;

  if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
    const coordinates = geom.coordinates.map((ring: any[]) =>
      Array.isArray(ring) ? [...ring].reverse() : ring
    );
    return { ...feature, geometry: { ...geom, coordinates } };
  }

  if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
    const coordinates = geom.coordinates.map((poly: any[][]) =>
      Array.isArray(poly)
        ? poly.map((ring: any[]) => (Array.isArray(ring) ? [...ring].reverse() : ring))
        : poly
    );
    return { ...feature, geometry: { ...geom, coordinates } };
  }

  return feature;
}

export const wilayaBoundariesData = {
  ...wilayaBoundariesRaw,
  features: (wilayaBoundariesRaw.features as any[]).map(rewindFeatureCoordinates),
};


export interface WilayaFeatureProperties {
  code: number;
  name_fr?: string;
  name_ar?: string;
  phone_code?: string;
  postal_code?: string;
}

export interface WilayaPoint {
  code: number;
  name_fr: string;
  name_ar: string;
  phone_code: string;
  postal_code: string;
  coordinates: [number, number]; // [lng, lat]
}

export interface CommuneItem {
  id: number;
  commune_name_fr: string;
  commune_name_ar: string;
  daira_name_fr: string;
  wilaya_code: number;
  wilaya_name_fr: string;
  wilaya_name_ar: string;
  postal_code: string;
}

// Fixed Shipping Origin Hub: Biskra (07)
export const BISKRA_ORIGIN_HUB = {
  code: 7,
  name_ar: "بسكرة",
  name_fr: "Biskra",
  label: "بسكرة (07 - Biskra Hub)",
  coordinates: [5.729074, 34.850882] as [number, number],
};

// Map of Wilaya Points by Code
export const WILAYA_POINTS_MAP = new Map<number, WilayaPoint>();

(wilayasPointsData.features as any[]).forEach((f) => {
  const p = f.properties;
  const geom = f.geometry;
  if (p && p.code && geom && geom.coordinates) {
    WILAYA_POINTS_MAP.set(p.code, {
      code: p.code,
      name_fr: p.name_fr || "",
      name_ar: p.name_ar || "",
      phone_code: p.phone_code || "",
      postal_code: p.postal_code || "",
      coordinates: geom.coordinates as [number, number],
    });
  }
});

/**
 * Extract numeric wilaya code (1..69) from an order's wilaya string
 */
export function extractWilayaCode(wilayaStr: string | number | null | undefined): number | null {
  if (wilayaStr === null || wilayaStr === undefined) return null;
  if (typeof wilayaStr === "number") {
    return wilayaStr >= 1 && wilayaStr <= 69 ? wilayaStr : null;
  }

  const str = String(wilayaStr)
    .trim()
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
  const numMatch =
    str.match(/^\s*0?(\d{1,2})(?=\s*(?:[-–—,()/]|$))/) ??
    str.match(/(?:ولاية|wilaya)\s*0?(\d{1,2})\s*$/i);
  if (numMatch) {
    const code = parseInt(numMatch[1], 10);
    if (code >= 1 && code <= 69) return code;
  }

  // Fallback to name search in GeoAlgeria
  const clean = str.toLowerCase();
  for (const [code, wp] of WILAYA_POINTS_MAP.entries()) {
    const arabicName = wp.name_ar.toLowerCase();
    const frenchName = wp.name_fr.toLowerCase();
    if ((arabicName && clean.includes(arabicName)) || (frenchName && clean.includes(frenchName))) {
      return code;
    }
  }

  // Also accept common display formats such as "Oran - 31" or "Oran (31)".
  const trailingCode = str.match(/(?:^|[-–—(])\s*0?(\d{1,2})\s*\)?\s*$/);
  if (trailingCode) {
    const code = parseInt(trailingCode[1], 10);
    if (code >= 1 && code <= 69) return code;
  }

  return null;
}

/**
 * Calculate Great-Circle (Haversine) Direct Distance in Kilometers
 * Labeled: مسافة جغرافية تقديرية (مسافة مباشرة)
 */
export function calculateGeodesicDistance(
  [lng1, lat1]: [number, number],
  [lng2, lat2]: [number, number]
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Get communes list for a specific wilaya code from GeoAlgeria
 */
export function getCommunesByWilayaCode(wilayaCode: number): CommuneItem[] {
  return (communesData as CommuneItem[]).filter((c) => c.wilaya_code === wilayaCode);
}

export interface SwitchedPointDestination {
  wilayaCode: number | null;
  wilayaName: string;
  communeName?: string;
  recipientName?: string;
  phone?: string;
  coordinates: [number, number] | null;
  isApproximateCentroid: boolean;
}

export interface SwitchedOrderRouteInfo {
  isSwitched: boolean;
  conversionSequence?: number;
  conversionId?: string;
  reason?: string;
  operator?: string;
  timestampUtc?: string;
  originHub: {
    code: number;
    name_ar: string;
    name_fr: string;
    coordinates: [number, number];
    label: string;
  };
  previousDestination: SwitchedPointDestination | null;
  currentDestination: SwitchedPointDestination;
  distanceHubToPrevKm: number;
  distanceHubToNewKm: number;
  distancePrevToNewKm: number;
  allConversions: Array<{
    sequence: number;
    conversionId?: string;
    timestampUtc?: string;
    reason?: string;
    operator?: string;
    fromWilaya?: string;
    toWilaya?: string;
    fromCommune?: string;
    toCommune?: string;
    fromRecipient?: string;
    toRecipient?: string;
  }>;
}

/**
 * Safely parse remarks to extract structured switched-order details & 3 geographic points
 */
export function extractSwitchedOrderDetails(
  order: any,
  targetSequence?: number
): SwitchedOrderRouteInfo | null {
  if (!order) return null;

  // 1. Gather all remark entries
  let remarksList: any[] = [];
  if (Array.isArray(order.remarks)) {
    remarksList = order.remarks;
  } else if (typeof order.remarks === "string" && order.remarks.trim()) {
    try {
      const parsed = JSON.parse(order.remarks);
      remarksList = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      remarksList = [order.remarks];
    }
  } else if (order.remarks && typeof order.remarks === "object") {
    remarksList = [order.remarks];
  }

  // 2. Filter structured conversion events
  const conversions: any[] = [];
  for (const r of remarksList) {
    if (typeof r === "object" && r !== null) {
      if (r.event === "ORDER_CONVERSION" || r.switch_status === "switched") {
        conversions.push(r);
      }
    }
  }

  // If no structured conversion object, check if marked as switched
  const isMarkedSwitched = order.isSwitched || conversions.length > 0;
  if (!isMarkedSwitched && conversions.length === 0) {
    return null;
  }

  // Sort conversions by sequence (latest first)
  conversions.sort((a, b) => {
    const seqA = a.conversion_sequence || 0;
    const seqB = b.conversion_sequence || 0;
    return seqA - seqB;
  });

  // Pick target conversion: if targetSequence specified use it, otherwise find the latest conversion containing geographic diff
  const activeConversion = targetSequence
    ? conversions.find((c) => c.conversion_sequence === targetSequence) || conversions[conversions.length - 1]
    : conversions.slice().reverse().find((c) => c.diff && (c.diff.wilaya || c.diff.commune || c.diff.full_name)) || conversions[conversions.length - 1];

  const diff = activeConversion?.diff || {};

  // Point 1: Fixed Origin Hub
  const originHub = BISKRA_ORIGIN_HUB;

  // Point 3: Current / New Destination
  const curWilayaStr = typeof order.wilaya === "string" ? order.wilaya : (diff.wilaya?.to || "");
  const curWilayaCode = extractWilayaCode(curWilayaStr);
  const curWilayaPoint = curWilayaCode ? WILAYA_POINTS_MAP.get(curWilayaCode) : null;
  const currentDestination: SwitchedPointDestination = {
    wilayaCode: curWilayaCode,
    wilayaName: curWilayaPoint ? curWilayaPoint.name_ar : (curWilayaStr || "الوجهة الجديدة"),
    communeName: order.commune || diff.commune?.to || "",
    recipientName: order.customer || order.fullName || diff.full_name?.to || "",
    phone: order.phone || diff.phone?.to || "",
    coordinates: curWilayaPoint ? curWilayaPoint.coordinates : null,
    isApproximateCentroid: true,
  };

  // Point 2: Previous Destination
  let previousDestination: SwitchedPointDestination | null = null;
  const prevWilayaStr = typeof diff.wilaya?.from === "string" ? diff.wilaya.from : null;
  if (prevWilayaStr) {
    const prevWilayaCode = extractWilayaCode(prevWilayaStr);
    const prevWilayaPoint = prevWilayaCode ? WILAYA_POINTS_MAP.get(prevWilayaCode) : null;
    previousDestination = {
      wilayaCode: prevWilayaCode,
      wilayaName: prevWilayaPoint ? prevWilayaPoint.name_ar : prevWilayaStr,
      communeName: diff.commune?.from || "",
      recipientName: diff.full_name?.from || "",
      phone: diff.phone?.from || "",
      coordinates: prevWilayaPoint ? prevWilayaPoint.coordinates : null,
      isApproximateCentroid: true,
    };
  }

  // Geodesic distances
  const distanceHubToNewKm = currentDestination.coordinates
    ? calculateGeodesicDistance(originHub.coordinates, currentDestination.coordinates)
    : 0;

  const distanceHubToPrevKm = previousDestination?.coordinates
    ? calculateGeodesicDistance(originHub.coordinates, previousDestination.coordinates)
    : 0;

  const distancePrevToNewKm =
    previousDestination?.coordinates && currentDestination.coordinates
      ? calculateGeodesicDistance(previousDestination.coordinates, currentDestination.coordinates)
      : 0;

  // Multi-conversion audit trail
  const allConversions = conversions.map((c) => ({
    sequence: c.conversion_sequence || 1,
    conversionId: c.conversion_id,
    timestampUtc: c.timestamp_utc,
    reason: c.reason,
    operator: c.operator,
    fromWilaya: c.diff?.wilaya?.from,
    toWilaya: c.diff?.wilaya?.to,
    fromCommune: c.diff?.commune?.from,
    toCommune: c.diff?.commune?.to,
    fromRecipient: c.diff?.full_name?.from,
    toRecipient: c.diff?.full_name?.to,
  }));

  return {
    isSwitched: true,
    conversionSequence: activeConversion?.conversion_sequence || 1,
    conversionId: activeConversion?.conversion_id,
    reason: activeConversion?.reason || "تم تحويل الطلبية لمستلم آخر",
    operator: activeConversion?.operator || "إدارة المتجر",
    timestampUtc: activeConversion?.timestamp_utc,
    originHub,
    previousDestination,
    currentDestination,
    distanceHubToPrevKm,
    distanceHubToNewKm,
    distancePrevToNewKm,
    allConversions,
  };
}

/**
 * Compute optimal { x, y, k } to fit given screen points with padding
 */
export function computeBoundingBoxForPoints(
  points: Array<[number, number]>,
  containerWidth: number,
  containerHeight: number,
  padding = 60
): { x: number; y: number; k: number } {
  if (!points || points.length === 0) {
    return { x: 0, y: 0, k: 1 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const dx = Math.max(80, maxX - minX);
  const dy = Math.max(80, maxY - minY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const availWidth = Math.max(100, containerWidth - padding * 2);
  const availHeight = Math.max(100, containerHeight - padding * 2);

  const scaleX = availWidth / dx;
  const scaleY = availHeight / dy;
  const targetK = Math.min(3.5, Math.max(1.0, Math.min(scaleX, scaleY)));

  // Center on midX, midY
  const targetX = containerWidth / 2 - midX * targetK;
  const targetY = containerHeight / 2 - midY * targetK;

  return { x: targetX, y: targetY, k: targetK };
}

export { wilayasPointsData, communesData };

