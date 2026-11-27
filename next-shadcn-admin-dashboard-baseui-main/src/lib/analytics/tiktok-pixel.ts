/**
 * ORVA Store — TikTok Pixel Configuration, Sanitizers & Client Event Helpers
 *
 * Dual client/server safe module (zero server-only imports).
 * Default Pixel ID: DC4QJAJC77U6QF2N05JG
 */

export const DEFAULT_TIKTOK_PIXEL_ID = "DC4QJAJC77U6QF2N05JG";
export const TIKTOK_PIXEL_ID_REGEX = /^[A-Za-z0-9_-]{8,40}$/;

export type TikTokPixelScope = "all" | "selected";

export interface TikTokPixelConfig {
  pixelId: string;
  enabled: boolean;
  scope: TikTokPixelScope;
  pages: string[];
}

export interface TikTokEventPayload {
  content_id?: string;
  content_type?: string;
  content_name?: string;
  quantity?: number;
  price?: number;
  value?: number;
  currency?: string;
  query?: string;
  order_id?: string;
}

export interface TikTokPixelQueue {
  (method: string, ...args: unknown[]): void;
  methods?: string[];
  setAndDefer?: (target: unknown, method: string) => void;
  instance?: (id: string) => unknown;
  load?: (pixelId: string, config?: Record<string, unknown>) => void;
  page?: (properties?: Record<string, unknown>) => void;
  track?: (eventName: string, properties?: TikTokEventPayload, options?: Record<string, unknown>) => void;
  identify?: (traits: Record<string, unknown>) => void;
  _i?: Record<string, unknown>;
  _t?: Record<string, number>;
  _o?: Record<string, unknown>;
}

declare global {
  interface Window {
    TiktokAnalyticsObject?: string;
    ttq?: TikTokPixelQueue & unknown[];
    _tiktokPixelId?: string;
    __orvaTikTokLoadedIds?: Record<string, boolean>;
  }
}

/**
 * Strictly validates a TikTok Pixel SDK ID (alphanumeric/dash/underscore, 8-40 chars)
 * to guarantee XSS-safe script interpolation.
 */
export function sanitizeTikTokPixelId(raw?: string | null): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return TIKTOK_PIXEL_ID_REGEX.test(trimmed) ? trimmed : "";
}

/** Normalizes a storefront pathname by collapsing slashes and removing trailing slash (except root `/`). */
export function normalizePixelPathname(pathname?: string | null): string {
  const raw = (pathname || "/").split("?")[0].split("#")[0].trim();
  if (!raw || raw === "/") return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.replace(/\/+$/, "") || "/";
}

/** Returns true for admin/auth routes that must never fire storefront ad pixels. */
export function isExcludedAdminPixelPath(pathname?: string | null): boolean {
  const norm = normalizePixelPathname(pathname);
  return /^\/(dashboard|auth)(\/|$)/i.test(norm);
}

/** Determines whether TikTok Pixel should fire for a given pathname and configuration. */
export function isTikTokPixelAllowedForPath(
  pathname: string | null | undefined,
  config: Pick<TikTokPixelConfig, "enabled" | "scope" | "pages">,
): boolean {
  if (!config.enabled) return false;
  if (isExcludedAdminPixelPath(pathname)) return false;
  if (config.scope !== "selected") return true;

  const normPath = normalizePixelPathname(pathname);
  const allowed = Array.isArray(config.pages) ? config.pages : [];
  return allowed.some((page) => {
    const normAllowed = normalizePixelPathname(page);
    if (normAllowed === "/") return normPath === "/";
    return normPath === normAllowed || normPath.startsWith(`${normAllowed}/`);
  });
}

/**
 * Generates the official TikTok Pixel `<head>` initialization script with corrected
 * `||` fallbacks (`w[t]=w[t]||[]`, `ttq._i[t]||[]`), admin path exclusion, and scope enforcement.
 */
export function buildTikTokPixelHeadScript(config: TikTokPixelConfig): string {
  const cleanId = sanitizeTikTokPixelId(config.pixelId);
  if (!config.enabled || !cleanId) return "";

  const scopeJson = JSON.stringify(config.scope === "selected" ? "selected" : "all");
  const pagesJson = JSON.stringify(
    (Array.isArray(config.pages) ? config.pages : []).map((p) => normalizePixelPathname(p)),
  );
  const cleanIdJson = JSON.stringify(cleanId);

  return `
(function () {
  try {
    var path = (window.location && window.location.pathname) || "/";
    var normPath = path === "/" ? "/" : path.replace(/\\/+$/, "") || "/";
    if (/^\\/(dashboard|auth)(\\/|$)/i.test(normPath)) return;
    var scope = ${scopeJson};
    var allowedPages = ${pagesJson};
    if (scope === "selected") {
      var matched = allowedPages.some(function (p) {
        return p === "/" ? normPath === "/" : (normPath === p || normPath.indexOf(p + "/") === 0);
      });
      if (!matched) return;
    }
    var pixelId = ${cleanIdJson};
    window._tiktokPixelId = pixelId;
    window.__orvaTikTokLoadedIds = window.__orvaTikTokLoadedIds || {};
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
      if (!w.__orvaTikTokLoadedIds[pixelId]) {
        w.__orvaTikTokLoadedIds[pixelId] = true;
        ttq.load(pixelId);
      }
      ttq.page();
    }(window, document, "ttq");
  } catch (e) {}
})();
`.trim();
}

/** Ensures `window.ttq` is initialized if the visitor navigated client-side onto a scoped page. */
export function ensureTikTokPixelLoadedClient(pixelId: string): boolean {
  if (typeof window === "undefined") return false;
  const cleanId = sanitizeTikTokPixelId(pixelId);
  if (!cleanId) return false;
  if (isExcludedAdminPixelPath(window.location?.pathname)) return false;

  if (window.ttq && window.__orvaTikTokLoadedIds?.[cleanId]) {
    window._tiktokPixelId = cleanId;
    return true;
  }

  const bootScript = buildTikTokPixelHeadScript({
    pixelId: cleanId,
    enabled: true,
    scope: "all",
    pages: [],
  });
  if (!bootScript) return false;

  try {
    // Execute standard queue bootstrap directly without duplicating external script tags
    const w = window as unknown as Record<string, any>;
    const d = document;
    const t = "ttq";
    w.TiktokAnalyticsObject = t;
    const ttq: any = w[t] || (w[t] = []);
    if (!ttq.methods) {
      ttq.methods = [
        "page",
        "track",
        "identify",
        "instances",
        "debug",
        "on",
        "off",
        "once",
        "ready",
        "alias",
        "group",
        "enableCookie",
        "disableCookie",
        "holdConsent",
        "revokeConsent",
        "grantConsent",
      ];
      ttq.setAndDefer = function (target: any, method: string) {
        target[method] = function (...args: unknown[]) {
          target.push([method, ...args]);
        };
      };
      for (let i = 0; i < ttq.methods.length; i += 1) {
        ttq.setAndDefer(ttq, ttq.methods[i]);
      }
      ttq.instance = function (id: string) {
        const inst = ttq._i?.[id] || [];
        for (let n = 0; n < ttq.methods.length; n += 1) {
          ttq.setAndDefer(inst, ttq.methods[n]);
        }
        return inst;
      };
      ttq.load = function (e: string, n?: Record<string, unknown>) {
        const r = "https://analytics.tiktok.com/i18n/pixel/events.js";
        ttq._i = ttq._i || {};
        ttq._i[e] = [];
        ttq._i[e]._u = r;
        ttq._t = ttq._t || {};
        ttq._t[e] = +new Date();
        ttq._o = ttq._o || {};
        ttq._o[e] = n || {};
        const script = d.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.src = `${r}?sdkid=${encodeURIComponent(e)}&lib=${t}`;
        const firstScript = d.getElementsByTagName("script")[0];
        firstScript?.parentNode?.insertBefore(script, firstScript);
      };
    }

    w.__orvaTikTokLoadedIds = w.__orvaTikTokLoadedIds || {};
    if (!w.__orvaTikTokLoadedIds[cleanId]) {
      w.__orvaTikTokLoadedIds[cleanId] = true;
      ttq.load(cleanId);
    }
    w._tiktokPixelId = cleanId;
    return true;
  } catch {
    return false;
  }
}

function canEmitClientEvent(): boolean {
  if (typeof window === "undefined" || !window.ttq) return false;
  if (isExcludedAdminPixelPath(window.location?.pathname)) return false;
  return true;
}

export function trackTikTokPageView(): void {
  if (!canEmitClientEvent()) return;
  try {
    window.ttq?.page?.();
  } catch {
    // Non-blocking analytics
  }
}

export function trackTikTokEvent(
  eventName: string,
  payload?: TikTokEventPayload,
  eventId?: string,
): void {
  if (!canEmitClientEvent()) return;
  try {
    if (eventId) {
      window.ttq?.track?.(eventName, payload, { event_id: eventId });
    } else {
      window.ttq?.track?.(eventName, payload);
    }
  } catch {
    // Non-blocking analytics
  }
}

export function trackTikTokViewContent(params: {
  contentId: string;
  contentName: string;
  priceDzd: number;
}): void {
  trackTikTokEvent("ViewContent", {
    content_id: params.contentId,
    content_type: "product",
    content_name: params.contentName,
    quantity: 1,
    price: params.priceDzd,
    value: params.priceDzd,
    currency: "DZD",
  });
}

export function trackTikTokInitiateCheckout(params: {
  contentId: string;
  contentName: string;
  valueDzd: number;
  quantity?: number;
}): void {
  trackTikTokEvent("InitiateCheckout", {
    content_id: params.contentId,
    content_type: "product",
    content_name: params.contentName,
    quantity: params.quantity ?? 1,
    value: params.valueDzd,
    currency: "DZD",
  });
}

export function trackTikTokCompletePayment(params: {
  orderNumber: string;
  contentId: string;
  contentName: string;
  valueDzd: number;
  quantity?: number;
}): void {
  trackTikTokEvent(
    "CompletePayment",
    {
      content_id: params.contentId,
      content_type: "product",
      content_name: params.contentName,
      quantity: params.quantity ?? 1,
      value: params.valueDzd,
      currency: "DZD",
      order_id: params.orderNumber,
    },
    params.orderNumber,
  );
}
