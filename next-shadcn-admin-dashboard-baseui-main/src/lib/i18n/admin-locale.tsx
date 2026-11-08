"use client";

import * as React from "react";

export type AdminLocale = "ar" | "fr" | "en";

const STORAGE_KEY = "orva_admin_locale";

const DICT = {
  ar: {
    overview: "نظرة عامة",
    orders: "الطلبات",
    risk: "المخاطر",
    delivery: "التوصيل والتعريفة",
    customers: "الزبائن والشحن",
    analytics: "التحليلات",
    traffic: "حركة المتجر",
    settings: "الإعدادات",
    products: "المنتجات والمخزون",
    classic: "النسخة الكلاسيكية",
    logout: "تسجيل الخروج",
    language: "اللغة",
    save: "حفظ",
    testConnection: "اختبار الاتصال",
    refresh: "تحديث",
  },
  fr: {
    overview: "Aperçu",
    orders: "Commandes",
    risk: "Risque & fraude",
    delivery: "Livraison & tarifs",
    customers: "Clients & transporteurs",
    analytics: "Analytique",
    traffic: "Trafic boutique",
    settings: "Paramètres",
    products: "Produits & stock",
    classic: "Version classique",
    logout: "Déconnexion",
    language: "Langue",
    save: "Enregistrer",
    testConnection: "Tester la connexion",
    refresh: "Actualiser",
  },
  en: {
    overview: "Overview",
    orders: "Orders",
    risk: "Risk & Fraud",
    delivery: "Delivery & Tariffs",
    customers: "Customers & Couriers",
    analytics: "Analytics",
    traffic: "Store Traffic",
    settings: "Settings",
    products: "Products & Stock",
    classic: "Classic Version",
    logout: "Log out",
    language: "Language",
    save: "Save",
    testConnection: "Test Connection",
    refresh: "Refresh",
  },
} as const;

type DictKey = keyof typeof DICT.ar;

interface LocaleContextValue {
  locale: AdminLocale;
  dir: "rtl" | "ltr";
  setLocale: (locale: AdminLocale) => void;
  t: (key: DictKey) => string;
  formatDzd: (n: number | null | undefined) => string;
  formatDate: (iso: string) => string;
}

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

function readInitialLocale(): AdminLocale {
  if (typeof window === "undefined") return "ar";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "fr" || stored === "en" ? stored : "ar";
}

export function AdminLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<AdminLocale>("ar");

  React.useEffect(() => {
    setLocaleState(readInitialLocale());
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const dir = "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = React.useMemo<LocaleContextValue>(() => {
    const dir = "ltr";
    return {
      locale,
      dir,
      setLocale: (next) => setLocaleState(next),
      t: (key) => DICT[locale][key] || DICT.ar[key] || key,
      formatDzd: (n) => {
        if (n === null || n === undefined || Number.isNaN(Number(n))) {
          return locale === "fr" ? "N/D" : locale === "en" ? "N/A" : "غير متوفر";
        }
        const localeTag = locale === "fr" ? "fr-DZ" : locale === "en" ? "en-DZ" : "ar-DZ";
        const suffix = locale === "en" ? " DZD" : " د.ج";
        return `${new Intl.NumberFormat(localeTag).format(Number(n))}${suffix}`;
      },
      formatDate: (iso) => {
        try {
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return iso;
          const localeTag = locale === "fr" ? "fr-DZ" : locale === "en" ? "en-DZ" : "ar-DZ";
          return new Intl.DateTimeFormat(localeTag, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(d);
        } catch {
          return iso;
        }
      },
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useAdminLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: "ar" as AdminLocale,
      dir: "ltr" as const,
      setLocale: () => undefined,
      t: (key: DictKey) => DICT.ar[key] || key,
      formatDzd: (n: number | null | undefined) =>
        n === null || n === undefined ? "غير متوفر" : `${n} د.ج`,
      formatDate: (iso: string) => iso,
    };
  }
  return ctx;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useAdminLocale();
  return (
    <div className={className} title={t("language")}>
      <select
        className="h-8 rounded-md border bg-background px-2 text-xs font-semibold"
        value={locale}
        onChange={(e) => {
          const val = e.target.value;
          if (val === "ar" || val === "fr" || val === "en") {
            setLocale(val);
          }
        }}
        aria-label={t("language")}
      >
        <option value="ar">العربية</option>
        <option value="fr">Français</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}
