/**
 * ORVA Store — Settings Types and In-Memory Fallback Store
 * Kept separate from Server Actions to satisfy Next.js 'use server' export restrictions.
 */

/** Official ORVA DZ store emblem & branding default URL. */
export const OFFICIAL_STORE_LOGO_URL = '/images/orva-logo.png';

/** Upgrades legacy/empty store logo paths to the official ORVA DZ emblem. */
export function normalizeStoreLogoUrl(url?: string | null): string {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed || trimmed === '/images/orva-logo.svg') {
    return OFFICIAL_STORE_LOGO_URL;
  }
  return trimmed;
}

export const MEDIA_MIN_UPLOAD_MB = 4;
export const MEDIA_MAX_UPLOAD_MB = 100;
export const MEDIA_DEFAULT_UPLOAD_MB = 10;

export function clampMaxUploadSizeMb(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return MEDIA_DEFAULT_UPLOAD_MB;
  return Math.min(MEDIA_MAX_UPLOAD_MB, Math.max(MEDIA_MIN_UPLOAD_MB, Math.round(num)));
}

export function clampWebpQuality(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0.85;
  return Math.min(0.95, Math.max(0.5, Math.round(num * 100) / 100));
}

export interface MediaSettingsRecord {
  maxUploadSizeMb: number;
  webpCompressionEnabled: boolean;
  webpQuality: number;
}

export interface AdminSettingsPayload {
  metaPixel?: {
    pixelId?: string;
    capiToken?: string;
    testEventCode?: string;
    enabled?: boolean;
    capiEnabled?: boolean;
    scope?: 'all' | 'selected';
    pages?: string[];
  };
  telegram?: {
    botToken?: string;
    chatId?: string;
    enabled?: boolean;
    templates?: Record<string, unknown>;
  };
  couriers?: {
    activeProvider?: 'mock' | 'yalidine' | 'zr_express' | string;
    yalidine?: {
      apiId?: string;
      apiToken?: string;
      defaultDeliveryType?: 'DOMICILE' | 'STOP_DESK';
    };
    zrExpress?: {
      apiKey?: string;
      apiSecret?: string;
    };
  };
  store?: {
    logoUrl?: string;
    brandName?: string;
    customerPhone?: string;
  };
  geminiAi?: {
    enabled?: boolean;
    name?: string;
    projectName?: string;
    projectNumber?: string;
    model?: string;
    apiKey?: string;
  };
  vercelAnalytics?: {
    enabled?: boolean;
    token?: string;
    projectId?: string;
    teamId?: string;
  };
  media?: {
    maxUploadSizeMb?: number;
    webpCompressionEnabled?: boolean;
    webpQuality?: number;
    bridgeSecret?: string;
  };
}

export interface AdminSettingsRecord {
  metaPixel: {
    pixelId: string;
    capiToken: string;
    testEventCode: string;
    enabled: boolean;
    capiEnabled: boolean;
    scope: 'all' | 'selected';
    pages: string[];
    sha256DeduplicationActive: boolean;
  };
  telegram: {
    botToken: string;
    chatId: string;
    enabled: boolean;
    templates: Record<string, unknown>;
  };
  couriers: {
    activeProvider: string;
    yalidine: {
      apiId: string;
      apiToken: string;
      defaultDeliveryType: 'DOMICILE' | 'STOP_DESK';
    };
    zrExpress: {
      apiKey: string;
      apiSecret: string;
    };
  };
  store: {
    logoUrl: string;
    brandName: string;
    customerPhone: string;
  };
  geminiAi: {
    enabled: boolean;
    name: string;
    projectName: string;
    projectNumber: string;
    model: string;
    apiKey: string;
  };
  vercelAnalytics: {
    enabled: boolean;
    token: string;
    projectId: string;
    teamId: string;
  };
  media: MediaSettingsRecord;
  updatedAt: string;
}

export const fallbackSettingsStore: AdminSettingsRecord = {
  metaPixel: {
    pixelId: process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '1773144400655201',
    capiToken: process.env.META_CAPI_TOKEN || '',
    testEventCode: process.env.META_TEST_EVENT_CODE || '',
    enabled: true,
    capiEnabled: true,
    scope: 'all',
    pages: ['/checkout', '/pack1', '/pack2', '/pack3'],
    sha256DeduplicationActive: true,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: true,
    templates: {},
  },
  couriers: {
    activeProvider: 'mock',
    yalidine: {
      apiId: process.env.YALIDINE_API_ID || '',
      apiToken: process.env.YALIDINE_API_TOKEN || '',
      defaultDeliveryType: 'DOMICILE',
    },
    zrExpress: {
      apiKey: process.env.ZR_EXPRESS_API_KEY || '',
      apiSecret: process.env.ZR_EXPRESS_API_SECRET || '',
    },
  },
  store: {
    logoUrl: '/images/orva-logo.png',
    brandName: 'ORVA Store',
    customerPhone: '0798282495',
  },
  geminiAi: {
    enabled: true,
    name: process.env.GEMINI_AGENT_NAME || 'Orva Agent AI',
    projectName: process.env.GEMINI_PROJECT_NAME || 'projects/347934146406',
    projectNumber: process.env.GEMINI_PROJECT_NUMBER || '347934146406',
    model: process.env.GEMINI_MODEL || 'auto',
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  vercelAnalytics: {
    enabled: true,
    token: (process.env.VERCEL_TOKEN || process.env.VERCEL_ACCESS_TOKEN || '').trim(),
    projectId: process.env.VERCEL_PROJECT_ID || 'prj_Zm7DPG2CymNdDKu0KxupUZdGp0rx',
    teamId: process.env.VERCEL_TEAM_ID || 'team_cYT8gZkkTTbR60uqUXL6aRPH',
  },
  media: {
    maxUploadSizeMb: MEDIA_DEFAULT_UPLOAD_MB,
    webpCompressionEnabled: true,
    webpQuality: 0.85,
  },
  updatedAt: new Date().toISOString(),
};
