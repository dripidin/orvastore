/**
 * ORVA Storefront Attribution Tracker
 * Captures Meta/TikTok/Google campaign parameters and click IDs on landing,
 * persists them across navigation in localStorage (30-day window), and attaches
 * them cleanly to COD checkout submissions.
 */

export const ATTRIBUTION_STORAGE_KEY = "orva_attribution_v1";
export const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const META_ADS_URL_PARAMS_TEMPLATE =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&fb_campaign_id={{campaign.id}}&fb_adset_id={{adset.id}}&fb_ad_id={{ad.id}}";

export interface OrderAttribution {
  fbCampaignId?: string;
  fbAdsetId?: string;
  fbAdId?: string;
  fbclid?: string;
  utmCampaign?: string;
  utmSource?: string;
  utmMedium?: string;
  attributionSource: string;
  landingPath?: string;
  capturedAt: string;
  expiresAt: number;
}

function readCleanParam(params: URLSearchParams, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = params.get(key)?.trim();
    if (val && !val.startsWith("{{")) {
      return val.slice(0, 255);
    }
  }
  return undefined;
}

/** Extracts fbclid from browser `_fbc` cookie if present (format: fb.1.<ts>.<fbclid>). */
export function readFbclidFromCookie(cookieString?: string): string | undefined {
  const source = cookieString ?? (typeof document !== "undefined" ? document.cookie : "");
  if (!source) return undefined;
  const match = source.match(/(?:^|;\s*)_fbc=([^;]+)/);
  if (!match) return undefined;
  const parts = decodeURIComponent(match[1]).split(".");
  return parts.length >= 4 && parts[3] ? parts[3].trim() : undefined;
}

/** Converts a raw fbclid into Meta CAPI `fbc` format (`fb.1.<unix_ms>.<fbclid>`). */
export function buildFbcFromFbclid(fbclid?: string | null, timestampMs = Date.now()): string | undefined {
  const clean = fbclid?.trim();
  if (!clean) return undefined;
  if (clean.startsWith("fb.")) return clean;
  return `fb.1.${timestampMs}.${clean}`;
}

/** Infers normalized attribution_source from URL parameters, click IDs, and referrer. */
export function resolveAttributionSource(input: {
  explicitSource?: string;
  utmSource?: string;
  utmMedium?: string;
  fbclid?: string;
  fbCampaignId?: string;
  ttclid?: string;
  gclid?: string;
  referrer?: string;
}): string {
  const explicit = input.explicitSource?.trim().toLowerCase();
  if (explicit) return explicit;

  const utm = input.utmSource?.trim().toLowerCase() || "";
  const medium = input.utmMedium?.trim().toLowerCase() || "";

  if (utm.includes("facebook") || utm === "fb" || utm === "meta") {
    return medium.includes("organic") ? "facebook_organic" : "facebook_ads";
  }
  if (utm.includes("instagram") || utm === "ig") {
    return medium.includes("organic") ? "instagram_organic" : "instagram_ads";
  }
  if (utm.includes("tiktok") || utm === "tt" || input.ttclid) {
    return "tiktok_ads";
  }
  if (utm.includes("whatsapp") || utm === "wa") {
    return "whatsapp";
  }
  if (utm.includes("google") || input.gclid) {
    return input.gclid || medium.includes("cpc") || medium.includes("paid") ? "google_ads" : "google_organic";
  }
  if (input.fbclid || input.fbCampaignId) {
    return "facebook_ads";
  }
  if (utm) {
    return utm.replace(/[^a-z0-9_-]/g, "_").slice(0, 64) || "direct";
  }

  const ref = input.referrer?.trim().toLowerCase() || "";
  if (ref.includes("facebook.com") || ref.includes("fb.com")) return "facebook_organic";
  if (ref.includes("instagram.com")) return "instagram_organic";
  if (ref.includes("tiktok.com")) return "tiktok_organic";
  if (ref.includes("google.")) return "google_organic";
  if (ref.includes("wa.me") || ref.includes("whatsapp.com")) return "whatsapp";

  return "direct";
}

export function parseAttributionFromUrl(
  search: string,
  options?: { referrer?: string; cookieString?: string; landingPath?: string; nowMs?: number },
): OrderAttribution | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);

  const fbCampaignId = readCleanParam(params, "fb_campaign_id", "campaign_id", "utm_id");
  const fbAdsetId = readCleanParam(params, "fb_adset_id", "adset_id");
  const fbAdId = readCleanParam(params, "fb_ad_id", "ad_id");
  const fbclid = readCleanParam(params, "fbclid") ?? readFbclidFromCookie(options?.cookieString);
  const ttclid = readCleanParam(params, "ttclid");
  const gclid = readCleanParam(params, "gclid");
  const utmCampaign = readCleanParam(params, "utm_campaign");
  const utmSource = readCleanParam(params, "utm_source");
  const utmMedium = readCleanParam(params, "utm_medium");
  const explicitSource = readCleanParam(params, "attribution_source");

  const hasExplicitSignals = [
    fbCampaignId,
    fbAdsetId,
    fbAdId,
    fbclid,
    ttclid,
    gclid,
    utmCampaign,
    utmSource,
    explicitSource,
  ].some(Boolean);

  const inferredSource = resolveAttributionSource({
    explicitSource,
    utmSource,
    utmMedium,
    fbclid,
    fbCampaignId,
    ttclid,
    gclid,
    referrer: options?.referrer,
  });

  if (!hasExplicitSignals && inferredSource === "direct") {
    return null;
  }

  const nowMs = options?.nowMs ?? Date.now();
  return {
    fbCampaignId,
    fbAdsetId,
    fbAdId,
    fbclid,
    utmCampaign,
    utmSource,
    utmMedium,
    attributionSource: inferredSource,
    landingPath: options?.landingPath,
    capturedAt: new Date(nowMs).toISOString(),
    expiresAt: nowMs + ATTRIBUTION_TTL_MS,
  };
}

export function getStoredAttribution(nowMs = Date.now()): OrderAttribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderAttribution;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.expiresAt && nowMs > parsed.expiresAt) {
      window.localStorage.removeItem(ATTRIBUTION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function captureAttributionFromUrl(
  searchOverride?: string,
  landingPathOverride?: string,
): OrderAttribution | null {
  if (typeof window === "undefined") return null;

  const existing = getStoredAttribution();
  const parsed = parseAttributionFromUrl(searchOverride ?? window.location.search, {
    referrer: typeof document !== "undefined" ? document.referrer : "",
    cookieString: typeof document !== "undefined" ? document.cookie : "",
    landingPath: landingPathOverride ?? window.location.pathname,
  });

  if (!parsed) {
    // Keep any previous non-expired ad click attribution; otherwise initialize direct attribution.
    if (existing) return existing;
    const direct: OrderAttribution = {
      attributionSource: "direct",
      landingPath: landingPathOverride ?? window.location.pathname,
      capturedAt: new Date().toISOString(),
      expiresAt: Date.now() + ATTRIBUTION_TTL_MS,
    };
    try {
      window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(direct));
    } catch {
      // Ignore storage quota errors
    }
    return direct;
  }

  const sameSource = existing && existing.attributionSource === parsed.attributionSource;
  const merged: OrderAttribution = {
    fbCampaignId: parsed.fbCampaignId ?? (sameSource ? existing?.fbCampaignId : undefined),
    fbAdsetId: parsed.fbAdsetId ?? (sameSource ? existing?.fbAdsetId : undefined),
    fbAdId: parsed.fbAdId ?? (sameSource ? existing?.fbAdId : undefined),
    fbclid: parsed.fbclid ?? (sameSource ? existing?.fbclid : undefined),
    utmCampaign: parsed.utmCampaign ?? (sameSource ? existing?.utmCampaign : undefined),
    utmSource: parsed.utmSource ?? (sameSource ? existing?.utmSource : undefined),
    utmMedium: parsed.utmMedium ?? (sameSource ? existing?.utmMedium : undefined),
    attributionSource: parsed.attributionSource || (existing?.attributionSource ?? "direct"),
    landingPath: parsed.landingPath ?? existing?.landingPath,
    capturedAt: parsed.capturedAt,
    expiresAt: parsed.expiresAt,
  };

  try {
    window.localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors
  }

  return merged;
}
