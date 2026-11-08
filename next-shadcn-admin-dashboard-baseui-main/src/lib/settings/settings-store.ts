/**
 * ORVA Store — Settings Types and In-Memory Fallback Store
 * Kept separate from Server Actions to satisfy Next.js 'use server' export restrictions.
 */

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
  updatedAt: string;
}

export const fallbackSettingsStore: AdminSettingsRecord = {
  metaPixel: {
    pixelId: process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || '1773144400655201',
    capiToken:
      process.env.META_CAPI_TOKEN ||
      'EAAaEnUkTxCkBS3B575vAs6MXwHT0AGewimZBmMO953e8UolR2RWw6ZAiGAlAhGmMJHiwUBZBCrYhkaZAOwyZB4BLe2PCDsbyjDy1BVQcUEqHBEaDjCeBpiUZAjYgJAS0QAGFlQRWdIMFwaohQHENsSKt8WK0ZAK0SwxrgBr6DuPkw0QwL3BBlaLea5QfOS0yAZDZD',
    testEventCode: process.env.META_TEST_EVENT_CODE || '',
    enabled: true,
    capiEnabled: true,
    scope: 'all',
    pages: ['/checkout', '/pack1', '/pack2', '/pack3'],
    sha256DeduplicationActive: true,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '9206411152:AAH78sg1jD1EkkFgfu-3s0zLFQKndcd1KHA',
    chatId: process.env.TELEGRAM_CHAT_ID || '-1003965560132',
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
    logoUrl: '/images/orva-logo.svg',
    brandName: 'ORVA Store',
    customerPhone: '0798282495',
  },
  updatedAt: new Date().toISOString(),
};
