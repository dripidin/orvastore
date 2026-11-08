/**
 * Central Store Configuration Blueprint
 * 
 * Copy and rename this file to `src/config/store.config.ts` in your target store
 * to customize brand parameters, currency, regional shipping, and courier integration.
 */

export interface StoreConfig {
  brand: {
    name: string;
    nameAr: string;
    tagline: string;
    taglineAr: string;
    logoUrl: string;
    faviconUrl: string;
  };
  contact: {
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
  };
  social: {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
  };
  currency: {
    code: "DZD" | "TND" | "MAD" | "SAR" | "AED" | "USD" | "EUR";
    symbol: string;
    decimals: number;
    position: "before" | "after";
  };
  commerce: {
    defaultPaymentMethod: "COD";
    requirePhoneConfirmation: boolean;
    freeShippingThreshold?: number; // In currency units (optional)
  };
  logistics: {
    country: "DZ";
    defaultDeliveryMethod: "DOMICILE" | "STOP_DESK";
    defaultDomicileFee: number;
    defaultStopDeskFee: number;
    activeCourierProvider: "MOCK" | "YALIDINE" | "ZR_EXPRESS" | "ECOTRACK" | "MAYSTRO" | "NOEST";
  };
  notifications: {
    telegram: {
      enabled: boolean;
      notifyOnNewOrder: boolean;
      notifyOnShipmentCreated: boolean;
      notifyOnDelivered: boolean;
    };
  };
}

export const defaultStoreConfig: StoreConfig = {
  brand: {
    name: "Maison Elegance",
    nameAr: "دار الأناقة",
    tagline: "High-end luxury jewelry & accessories crafted for discerning tastes.",
    taglineAr: "مجوهرات وإكسسوارات راقية مصممة لأصحاب الذوق الرفيع.",
    logoUrl: "/images/logo.svg",
    faviconUrl: "/favicon.ico",
  },
  contact: {
    phone: "+213 550 12 34 56",
    whatsapp: "+213550123456",
    email: "contact@maisonelegance.dz",
    address: "Alger Centre, 16000 Alger, Algérie",
  },
  social: {
    instagram: "https://instagram.com/maisonelegance",
    facebook: "https://facebook.com/maisonelegance",
    tiktok: "https://tiktok.com/@maisonelegance",
  },
  currency: {
    code: "DZD",
    symbol: "DA",
    decimals: 0,
    position: "after",
  },
  commerce: {
    defaultPaymentMethod: "COD",
    requirePhoneConfirmation: true,
    freeShippingThreshold: 20000, // e.g. Free shipping above 20,000 DZD
  },
  logistics: {
    country: "DZ",
    defaultDeliveryMethod: "DOMICILE",
    defaultDomicileFee: 800,
    defaultStopDeskFee: 450,
    activeCourierProvider: "YALIDINE",
  },
  notifications: {
    telegram: {
      enabled: true,
      notifyOnNewOrder: true,
      notifyOnShipmentCreated: true,
      notifyOnDelivered: true,
    },
  },
};

