"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  Bell,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  Info,
  Key,
  Loader2,
  Megaphone,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Truck,
  Upload,
  Zap,
} from "lucide-react";

import {
  getDashboardSettingsFallbackAction,
  mutateDashboardSettingsFallbackAction,
} from "@/app/actions/ai-agent";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { IntegrationStatus } from "@/lib/settings/integrations-registry";
import { getAppRepositoryMode } from "@/lib/orva-api";
import { TikTokLeadsIntegrationCard } from "./tiktok-leads-integration-card";
import {
  TIKTOK_API_ENDPOINTS,
  type TikTokConnectionBadgeSummary,
  deriveTikTokConnectionUiState,
} from "./tiktok-leads-types";

interface PublicSettingsPayload {
  redex?: {
    enabled: boolean;
    baseUrl: string;
    isConfigured: boolean;
    tokenSource: string;
    updatedAt: string | null;
    status: string;
  };
  ecotrack?: {
    enabled: boolean;
    baseUrl: string;
    isConfigured: boolean;
    tokenSource: string;
    updatedAt: string | null;
    status: string;
  };
  telegram?: {
    enabled: boolean;
    chatId: string;
    isConfigured: boolean;
    tokenSource: string;
    updatedAt: string | null;
    status: string;
    templates?: Record<string, unknown>;
  };
  metaPixel?: {
    enabled: boolean;
    pixelId: string;
    isConfigured: boolean;
    hasCapiToken: boolean;
    capiEnabled?: boolean;
    tokenSource: string;
    scope: string;
    pages: string[];
    updatedAt: string | null;
    status: string;
  };
  store?: {
    logoUrl?: string;
    name?: string;
    updatedAt?: string | null;
  };
  geminiAi?: {
    enabled: boolean;
    name: string;
    projectName: string;
    projectNumber: string;
    model: string;
    apiKey: string;
    isConfigured: boolean;
    tokenSource: string;
    updatedAt: string | null;
    status: string;
  };
}

interface ActionFeedback {
  type: "success" | "error" | "info";
  message: string;
}

function StatusBadge({ status, label }: { status: IntegrationStatus | string; label: string }) {
  switch (status) {
    case "connected":
    case "operational":
    case "authenticated":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 text-[11px]">
          <CheckCircle2 className="size-3" />
          {label}
        </Badge>
      );
    case "configured":
    case "reachable":
      return (
        <Badge variant="outline" className="border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 font-bold gap-1 text-[11px]">
          <ShieldCheck className="size-3" />
          {label}
        </Badge>
      );
    case "demo_only":
      return (
        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 font-bold gap-1 text-[11px]">
          <Sparkles className="size-3" />
          {label}
        </Badge>
      );
    case "not_connected":
    case "not_configured":
      return (
        <Badge variant="outline" className="border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-900 dark:text-slate-400 font-bold text-[11px]">
          {label}
        </Badge>
      );
    case "unavailable":
    case "error":
    default:
      return (
        <Badge variant="destructive" className="font-bold text-[11px]">
          {label}
        </Badge>
      );
  }
}

export function SettingsIntegrations() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams?.get("tab");
  const ALLOWED_TABS = ["general", "gemini", "analytics", "tiktok", "delivery", "notifications"];
  const [activeTab, setActiveTab] = React.useState<string>(
    requestedTab && ALLOWED_TABS.includes(requestedTab)
      ? requestedTab
      : "general",
  );
  const [tiktokStatusSummary, setTiktokStatusSummary] =
    React.useState<TikTokConnectionBadgeSummary>({
      state: "not_connected",
      badgeStatus: "not_connected",
      labelAr: "غير متصل",
      descriptionAr: "",
      requiresReconnect: false,
    });
  const repoMode = typeof window !== "undefined" ? getAppRepositoryMode() : "mock";

  React.useEffect(() => {
    if (requestedTab && ["general", "gemini", "analytics", "tiktok", "delivery", "notifications"].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  // Dynamic Settings State loaded from server
  const [loading, setLoading] = React.useState<boolean>(false);
  const [serverSettings, setServerSettings] = React.useState<PublicSettingsPayload | null>(null);

  // RedEx Form State (Sole active shipping configuration)
  const [redexEnabled, setRedexEnabled] = React.useState<boolean>(true);
  const [redexBaseUrl, setRedexBaseUrl] = React.useState<string>("https://redex.ecotrack.dz");
  const [redexToken, setRedexToken] = React.useState<string>("");
  const [redexSaving, setRedexSaving] = React.useState<boolean>(false);
  const [redexTesting, setRedexTesting] = React.useState<boolean>(false);
  const [redexFeedback, setRedexFeedback] = React.useState<ActionFeedback | null>(null);

  // Telegram Form State (Telegram Bot Order Alerts as sole alert)
  const [tgEnabled, setTgEnabled] = React.useState<boolean>(true);
  const [tgChatId, setTgChatId] = React.useState<string>("");
  const [tgBotToken, setTgBotToken] = React.useState<string>("");
  const [tgSaving, setTgSaving] = React.useState<boolean>(false);
  const [tgTesting, setTgTesting] = React.useState<boolean>(false);
  const [tgFeedback, setTgFeedback] = React.useState<ActionFeedback | null>(null);

  // Meta Pixel & Conversions API Form State
  const STOREFRONT_PAGE_OPTIONS: { path: string; label: string }[] = [
    { path: "/", label: "الصفحة الرئيسية (/)" },
    { path: "/pack1", label: "Pack 1 Pro 4-in-1 (/pack1)" },
    { path: "/pack2", label: "Pack 2 Crown Elite (/pack2)" },
    { path: "/pack3", label: "Pack 3 Soudure Pro (/pack3)" },
    { path: "/checkout/confirmation", label: "تأكيد الطلب (/checkout/confirmation)" },
  ];
  const [metaEnabled, setMetaEnabled] = React.useState<boolean>(true);
  const [metaCapiEnabled, setMetaCapiEnabled] = React.useState<boolean>(true);
  const [metaPixelId, setMetaPixelId] = React.useState<string>("");
  const [metaCapiToken, setMetaCapiToken] = React.useState<string>("");
  const [showMetaToken, setShowMetaToken] = React.useState<boolean>(false);
  const [metaScope, setMetaScope] = React.useState<"all" | "selected">("all");
  const [metaPages, setMetaPages] = React.useState<string[]>(STOREFRONT_PAGE_OPTIONS.map((p) => p.path));
  const [metaSaving, setMetaSaving] = React.useState<boolean>(false);
  const [metaTesting, setMetaTesting] = React.useState<boolean>(false);
  const [metaFeedback, setMetaFeedback] = React.useState<ActionFeedback | null>(null);

  // Store Logo State
  const [storeLogoUrl, setStoreLogoUrl] = React.useState<string>("/images/orva-logo.png");
  const [storeLogoSaving, setStoreLogoSaving] = React.useState<boolean>(false);
  const [logoFeedback, setLogoFeedback] = React.useState<ActionFeedback | null>(null);
  const logoFileInputRef = React.useRef<HTMLInputElement>(null);

  // Orva Agent AI (Google Gemini) State
  const [geminiEnabled, setGeminiEnabled] = React.useState<boolean>(true);
  const [geminiName, setGeminiName] = React.useState<string>("Orva Agent AI");
  const [geminiProjectName, setGeminiProjectName] = React.useState<string>("projects/347934146406");
  const [geminiProjectNumber, setGeminiProjectNumber] = React.useState<string>("347934146406");
  const [geminiModel, setGeminiModel] = React.useState<string>("auto");
  const [geminiResolvedModel, setGeminiResolvedModel] = React.useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = React.useState<string>("");
  const [showGeminiKey, setShowGeminiKey] = React.useState<boolean>(false);
  const [geminiSaving, setGeminiSaving] = React.useState<boolean>(false);
  const [geminiTesting, setGeminiTesting] = React.useState<boolean>(false);
  const [geminiFeedback, setGeminiFeedback] = React.useState<ActionFeedback | null>(null);
  const [geminiTestReport, setGeminiTestReport] = React.useState<string | null>(null);
  const [geminiTestSnapshot, setGeminiTestSnapshot] = React.useState<{
    totalOrders: number;
    statusCounts: {
      pending: number;
      confirmed: number;
      shipped: number;
      delivered: number;
      returned: number;
      cancelled: number;
    };
    deliveredRevenueDzd: number;
    totalPipelineDzd: number;
    redexTrackedCount: number;
    latencyMs?: number;
  } | null>(null);
  const [copiedReport, setCopiedReport] = React.useState<boolean>(false);

  const applyServerSettings = React.useCallback((settings: PublicSettingsPayload) => {
    setServerSettings(settings);
    if (settings.redex) {
      setRedexEnabled(Boolean(settings.redex.enabled));
      setRedexBaseUrl(settings.redex.baseUrl || "https://redex.ecotrack.dz");
    }
    if (settings.telegram) {
      setTgEnabled(Boolean(settings.telegram.enabled));
      setTgChatId(settings.telegram.chatId || "");
    }
    if (settings.metaPixel) {
      setMetaEnabled(Boolean(settings.metaPixel.enabled));
      setMetaCapiEnabled(settings.metaPixel.capiEnabled !== false);
      setMetaPixelId(settings.metaPixel.pixelId || "");
      setMetaScope(settings.metaPixel.scope === "selected" ? "selected" : "all");
      if (Array.isArray(settings.metaPixel.pages) && settings.metaPixel.pages.length) {
        setMetaPages(settings.metaPixel.pages);
      }
    }
    if (settings.store?.logoUrl) {
      setStoreLogoUrl(settings.store.logoUrl);
    }
    if (settings.geminiAi) {
      setGeminiEnabled(Boolean(settings.geminiAi.enabled));
      setGeminiName(settings.geminiAi.name || "Orva Agent AI");
      setGeminiProjectName(settings.geminiAi.projectName || "projects/347934146406");
      setGeminiProjectNumber(settings.geminiAi.projectNumber || "347934146406");
      setGeminiModel(settings.geminiAi.model || "auto");
      if (settings.geminiAi.apiKey) {
        setGeminiApiKey(settings.geminiAi.apiKey);
      }
    }
  }, []);

  // Fetch settings from server (with seamless Server Action fallback for demo/local sessions)
  const fetchSettings = React.useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      };
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("orva_admin_token");
        if (token) headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/admin-settings", {
        method: "GET",
        headers,
        credentials: "same-origin",
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.success && data.settings) {
          applyServerSettings(data.settings as PublicSettingsPayload);
          return;
        }
      }

      const fallbackData = await getDashboardSettingsFallbackAction();
      if (fallbackData?.success && fallbackData.settings) {
        applyServerSettings(fallbackData.settings as PublicSettingsPayload);
      }
    } catch {
      try {
        const fallbackData = await getDashboardSettingsFallbackAction();
        if (fallbackData?.success && fallbackData.settings) {
          applyServerSettings(fallbackData.settings as PublicSettingsPayload);
        }
      } catch {
        // Graceful fallback
      }
    } finally {
      setLoading(false);
    }
  }, [applyServerSettings]);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Fetch local TikTok Ads connection summary for the Quick-Jump Strip (zero external TikTok API calls)
  React.useEffect(() => {
    let cancelled = false;
    const loadTikTokQuickStatus = async () => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        };
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("orva_admin_token");
          if (token) headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch(TIKTOK_API_ENDPOINTS.connect, {
          method: "GET",
          headers,
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.success) {
          setTiktokStatusSummary(
            deriveTikTokConnectionUiState(data.readiness ?? null, data.connection ?? null),
          );
        }
      } catch {
        // Keep honest default status without throwing
      }
    };
    void loadTikTokQuickStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Generic API caller with Server Action fallback
  const callSettingsApi = async (body: Record<string, unknown>) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("orva_admin_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch("/api/admin-settings", {
      method: "POST",
      headers,
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    if (res.status === 401 || res.status === 403) {
      return await mutateDashboardSettingsFallbackAction(body);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg = data?.message || data?.error || `Request failed with HTTP ${res.status}`;
      throw new Error(errMsg);
    }
    return data;
  };

  // ── Store Logo Handlers ───────────────────────────────────────────────────
  const handleSaveLogo = async (newUrl?: string) => {
    setStoreLogoSaving(true);
    setLogoFeedback(null);
    try {
      const urlToSave = (newUrl || storeLogoUrl).trim();
      await callSettingsApi({ action: "save", store: { logoUrl: urlToSave } });
      setLogoFeedback({ type: "success", message: "تم حفظ وتحديث شعار المتجر بنجاح." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل حفظ الشعار.";
      setLogoFeedback({ type: "error", message: msg });
    } finally {
      setStoreLogoSaving(false);
    }
  };

  const handleUploadLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setStoreLogoSaving(true);
      setLogoFeedback(null);
      try {
        const res = await fetch("/api/admin-settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: JSON.stringify({ action: "upload_logo", dataUrl }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || data?.error || "فشل رفع الشعار.");
        }
        if (data?.logoUrl) {
          setStoreLogoUrl(data.logoUrl);
        }
        setLogoFeedback({ type: "success", message: "تم رفع وتطبيق شعار المتجر الجديد بنجاح." });
        await fetchSettings();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "فشل رفع الشعار.";
        setLogoFeedback({ type: "error", message: msg });
      } finally {
        setStoreLogoSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // ── RedEx Handlers ──────────────────────────────────────────────────────────
  const handleSaveRedex = async () => {
    setRedexSaving(true);
    setRedexFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: redexEnabled,
        baseUrl: redexBaseUrl.trim() || "https://redex.ecotrack.dz",
      };
      if (redexToken.trim()) {
        payload.apiToken = redexToken.trim();
      }

      await callSettingsApi({ action: "save", redex: payload });
      setRedexToken(""); // Clear cleartext from client memory
      setRedexFeedback({ type: "success", message: "تم حفظ إعدادات RedEx بنجاح وتشفيرها في خادم المتجر." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر حفظ إعدادات RedEx.";
      setRedexFeedback({ type: "error", message: msg });
    } finally {
      setRedexSaving(false);
    }
  };

  const handleTestRedex = async () => {
    setRedexTesting(true);
    setRedexFeedback(null);
    try {
      const res = await callSettingsApi({ action: "test", integration: "redex" });
      const test = res.testResult;
      const statusText = test.status === "operational" ? "نشط وجاهز للعمل (Operational)"
        : test.status === "authenticated" ? "تم التحقق من الحساب (Authenticated)"
        : test.status === "reachable" ? "الخادم متاح ولكن يحتاج رمز صالح (Reachable)"
        : "غير مهيأ (Not Configured)";

      setRedexFeedback({
        type: test.reachable ? "success" : "error",
        message: `نتيجة الفحص الآمن: ${statusText} — HTTP ${test.httpStatus || 200}. (لم يتم إرسال أي شحنة تجريبية).`,
      });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل فحص اتصال RedEx.";
      setRedexFeedback({ type: "error", message: msg });
    } finally {
      setRedexTesting(false);
    }
  };

  const handleClearRedex = async () => {
    if (!confirm("هل أنت متأكد من رغبتك في مسح رمز RedEx API Token من الخادم نهائياً؟")) return;
    setRedexSaving(true);
    try {
      await callSettingsApi({ action: "delete", integration: "redex", field: "apiToken" });
      setRedexToken("");
      setRedexFeedback({ type: "info", message: "تم مسح رمز RedEx API Token بنجاح." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر مسح الرمز.";
      setRedexFeedback({ type: "error", message: msg });
    } finally {
      setRedexSaving(false);
    }
  };

  // ── Telegram Handlers ───────────────────────────────────────────────────────
  const handleSaveTelegram = async () => {
    setTgSaving(true);
    setTgFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: tgEnabled,
        chatId: tgChatId.trim(),
      };
      if (tgBotToken.trim()) {
        payload.botToken = tgBotToken.trim();
      }

      await callSettingsApi({ action: "save", telegram: payload });
      setTgBotToken("");
      setTgFeedback({ type: "success", message: "تم حفظ إعدادات تيليجرام بنجاح وتحديث معرّف القناة." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر حفظ إعدادات تيليجرام.";
      setTgFeedback({ type: "error", message: msg });
    } finally {
      setTgSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setTgTesting(true);
    setTgFeedback(null);
    try {
      const res = await callSettingsApi({ action: "test", integration: "telegram" });
      const test = res.testResult;
      if (test.authenticated) {
        setTgFeedback({
          type: "success",
          message: `تم التحقق بنجاح من البوت @${test.botUsername || "ORVA Bot"} (${test.botName || "Bot"}). لم يتم إرسال أي رسالة في القناة.`,
        });
      } else {
        setTgFeedback({
          type: "error",
          message: test.message || "فشلت المصادقة مع Telegram Bot API. تأكد من صحة الرمز.",
        });
      }
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل فحص اتصال Telegram.";
      setTgFeedback({ type: "error", message: msg });
    } finally {
      setTgTesting(false);
    }
  };

  const handleClearTelegram = async () => {
    if (!confirm("هل أنت متأكد من رغبتك في مسح رمز Telegram Bot Token من الخادم نهائياً؟")) return;
    setTgSaving(true);
    try {
      await callSettingsApi({ action: "delete", integration: "telegram", field: "botToken" });
      setTgBotToken("");
      setTgFeedback({ type: "info", message: "تم مسح رمز Telegram Bot Token بنجاح." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر مسح الرمز.";
      setTgFeedback({ type: "error", message: msg });
    } finally {
      setTgSaving(false);
    }
  };

  // ── Meta Pixel Handlers ─────────────────────────────────────────────────────
  const handleSaveMeta = async () => {
    setMetaSaving(true);
    setMetaFeedback(null);
    try {
      if (metaPixelId.trim() && !/^\d{12,20}$/.test(metaPixelId.trim())) {
        throw new Error("معرف Pixel ID يجب أن يتكون من 12 إلى 20 رقماً فقط.");
      }

      if (metaScope === "selected" && metaPages.length === 0) {
        throw new Error("اختر صفحة واحدة على الأقل عند تفعيل النطاق المحدّد.");
      }

      const payload: Record<string, unknown> = {
        enabled: metaEnabled,
        capiEnabled: metaCapiEnabled,
        pixelId: metaPixelId.trim(),
        scope: metaScope,
        pages: metaScope === "all" ? STOREFRONT_PAGE_OPTIONS.map((p) => p.path) : metaPages,
      };
      if (metaCapiToken.trim()) {
        payload.capiToken = metaCapiToken.trim();
      }

      await callSettingsApi({ action: "save", metaPixel: payload });
      setMetaCapiToken("");
      setMetaFeedback({ type: "success", message: "تم حفظ إعدادات Meta Pixel & CAPI وتحديث النطاق بنجاح." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر حفظ إعدادات Meta Pixel.";
      setMetaFeedback({ type: "error", message: msg });
    } finally {
      setMetaSaving(false);
    }
  };

  const handleClearMetaPixelId = async () => {
    if (!confirm("هل أنت متأكد من إزالة معرّف Meta Pixel من الخادم؟ سيتوقف التتبع في المتصفح.")) return;
    setMetaSaving(true);
    try {
      await callSettingsApi({ action: "delete", integration: "metaPixel", field: "pixelId" });
      setMetaPixelId("");
      setMetaFeedback({ type: "info", message: "تم إزالة معرّف Meta Pixel بنجاح." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر إزالة معرّف البكسل.";
      setMetaFeedback({ type: "error", message: msg });
    } finally {
      setMetaSaving(false);
    }
  };

  const handleTestMeta = async () => {
    setMetaTesting(true);
    setMetaFeedback(null);
    try {
      const res = await callSettingsApi({ action: "test", integration: "metaPixel" });
      const test = res.testResult;
      if (test.configured) {
        setMetaFeedback({
          type: "success",
          message: `تكوين Meta Pixel سليم (معرّف ${test.pixelId || metaPixelId}). CAPI Token: ${test.capiConfigured ? "مهيأ بنجاح" : "غير مدخل (اختياري)"}. (لم يتم إطلاق أي حدث تجريبي).`,
        });
      } else {
        setMetaFeedback({
          type: "error",
          message: test.message || "تكوين Meta Pixel غير مكتمل. يرجى إدخال معرّف بكسل صالح.",
        });
      }
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل فحص تكوين Meta Pixel.";
      setMetaFeedback({ type: "error", message: msg });
    } finally {
      setMetaTesting(false);
    }
  };

  const handleClearMetaToken = async () => {
    if (!confirm("هل أنت متأكد من مسح رمز Meta Conversions API Token من الخادم؟")) return;
    setMetaSaving(true);
    try {
      await callSettingsApi({ action: "delete", integration: "metaPixel", field: "capiToken" });
      setMetaCapiToken("");
      setMetaFeedback({ type: "info", message: "تم مسح رمز Meta CAPI Token بنجاح." });
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر مسح الرمز.";
      setMetaFeedback({ type: "error", message: msg });
    } finally {
      setMetaSaving(false);
    }
  };

  // ── Orva Agent AI (Gemini) Handlers ─────────────────────────────────────────
  const handleSaveGeminiAi = async () => {
    setGeminiSaving(true);
    setGeminiFeedback(null);
    try {
      const payload: Record<string, unknown> = {
        enabled: geminiEnabled,
        name: geminiName.trim() || "Orva Agent AI",
        projectName: geminiProjectName.trim() || "projects/347934146406",
        projectNumber: geminiProjectNumber.trim() || "347934146406",
        model: geminiModel.trim() || "auto",
      };
      if (geminiApiKey.trim()) {
        payload.apiKey = geminiApiKey.trim();
      }

      await callSettingsApi({
        action: "save",
        geminiAi: payload,
      });
      setGeminiFeedback({
        type: "success",
        message: "تم حفظ إعدادات Orva Agent AI (Google Gemini API) وتحديث النظام بنجاح.",
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orva:gemini-settings-updated"));
      }
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر حفظ إعدادات Orva Agent AI.";
      setGeminiFeedback({ type: "error", message: msg });
    } finally {
      setGeminiSaving(false);
    }
  };

  const handleTestGeminiAiReport = async () => {
    setGeminiTesting(true);
    setGeminiFeedback(null);
    setGeminiTestReport(null);
    setGeminiTestSnapshot(null);
    setGeminiResolvedModel(null);
    try {
      const res = await callSettingsApi({
        action: "test",
        integration: "geminiAi",
        name: geminiName,
        projectName: geminiProjectName,
        projectNumber: geminiProjectNumber,
        apiKey: geminiApiKey.trim(),
        model: geminiModel || "auto",
      });
      const test = res.testResult;
      if (test?.configured && test?.authenticated) {
        if (test.model) {
          setGeminiResolvedModel(test.model);
        }
        setGeminiFeedback({
          type: "success",
          message: test.message,
        });
        if (test.reportText) {
          setGeminiTestReport(test.reportText);
        }
        if (test.snapshot) {
          setGeminiTestSnapshot({
            ...test.snapshot,
            latencyMs: test.latencyMs,
          });
        }
      } else {
        setGeminiFeedback({
          type: "error",
          message: test?.message || "تعذّر الاتصال بمحرك Google Gemini أو المفتاح غير صالح.",
        });
      }
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر إجراء اختبار التقارير عبر Gemini.";
      setGeminiFeedback({ type: "error", message: msg });
    } finally {
      setGeminiTesting(false);
    }
  };

  const handleClearGeminiKey = async () => {
    if (!confirm("هل أنت متأكد من رغبتك في مسح مفتاح Gemini API Key من الخادم؟")) return;
    setGeminiSaving(true);
    setGeminiFeedback(null);
    setGeminiTestReport(null);
    setGeminiTestSnapshot(null);
    setGeminiResolvedModel(null);
    try {
      await callSettingsApi({ action: "delete", integration: "geminiAi", field: "apiKey" });
      setGeminiApiKey("");
      setGeminiFeedback({ type: "info", message: "تم مسح مفتاح Gemini API Key بنجاح." });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("orva:gemini-settings-updated"));
      }
      await fetchSettings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر مسح مفتاح API.";
      setGeminiFeedback({ type: "error", message: msg });
    } finally {
      setGeminiSaving(false);
    }
  };

  const effectivePreviewModel =
    geminiModel && geminiModel !== "auto" ? geminiModel : geminiResolvedModel || "gemini-flash-lite-latest";

  const handleCopyReport = () => {
    if (!geminiTestReport) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(geminiTestReport);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  };

  const isRedexConfigured = Boolean(serverSettings?.redex?.isConfigured);
  const isTgConfigured = Boolean(serverSettings?.telegram?.isConfigured);
  const isMetaConfigured = Boolean(serverSettings?.metaPixel?.isConfigured);
  const hasMetaCapi = Boolean(serverSettings?.metaPixel?.hasCapiToken);
  const isGeminiConfigured = Boolean(serverSettings?.geminiAi?.isConfigured || geminiApiKey.trim());

  return (
    <div className="space-y-6" dir="ltr">
      {/* Blueprint Header Notice */}
      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 dark:bg-blue-950/20 dark:border-blue-900 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Info className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-bold text-blue-950 dark:text-blue-200">
              إدارة الإعدادات والذكاء الاصطناعي والتكاملات المركزية
            </div>
            <p className="text-blue-800 dark:text-blue-300 leading-relaxed">
              يمكنك إدارة وتحديث إعدادات مساعد الذكاء الاصطناعي <strong>{geminiName || "Orva Agent AI"}</strong>، ورموز الربط لشركات الشحن، وبوت تيليجرام، وبيكسل فيسبوك مباشرة من هذه اللوحة.
              يتم حفظ الإعدادات بأمان على الخادم وفي قاعدة البيانات.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSettings}
          disabled={loading}
          className="shrink-0 text-xs gap-1.5 h-8"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>تحديث الحالة</span>
        </Button>
      </div>

      {/* Active Integrations Status & Quick-Jump Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" dir="rtl">
        <div
          onClick={() => setActiveTab("gemini")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-md ${
            activeTab === "gemini"
              ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30"
              : "border-emerald-500/30 bg-card hover:border-emerald-500/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-xs text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                <Bot className="size-4" />
              </div>
              <span>{geminiName || "Orva Agent AI"}</span>
            </div>
            <StatusBadge
              status={isGeminiConfigured ? (geminiEnabled ? "operational" : "not_connected") : "not_configured"}
              label={isGeminiConfigured ? (geminiEnabled ? "متصل ونشط" : "متوقف") : "غير مهيأ"}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>التوجيه التلقائي الذكي</span>
            <span>{geminiModel === "auto" ? "تلقائي" : geminiModel}</span>
          </div>
        </div>

        <div
          onClick={() => setActiveTab("delivery")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-md ${
            activeTab === "delivery" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-xs text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="size-4" />
              </div>
              <span>Redex Express DZ</span>
            </div>
            <StatusBadge
              status={serverSettings?.redex?.status || "not_configured"}
              label={isRedexConfigured ? "متصل ونشط" : "غير مهيأ"}
            />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            بوابة الشحن والتوصيل عبر 58 ولاية
          </div>
        </div>

        <div
          onClick={() => setActiveTab("analytics")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-md ${
            activeTab === "analytics" ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20" : "bg-card"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-xs text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                <BarChart3 className="size-4" />
              </div>
              <span>Meta Pixel & CAPI</span>
            </div>
            <StatusBadge
              status={isMetaConfigured ? "operational" : serverSettings?.metaPixel?.status || "not_configured"}
              label={isMetaConfigured ? "متصل ونشط" : "غير مهيأ"}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>تتبع الحملات والأحداث عبر السيرفر</span>
            <Badge variant="outline" className="text-[10px]">
              {hasMetaCapi ? "CAPI v19 ✓" : "Browser Pixel"}
            </Badge>
          </div>
        </div>

        <div
          onClick={() => setActiveTab("tiktok")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-md ${
            activeTab === "tiktok" ? "border-indigo-500 bg-indigo-500/5 ring-1 ring-indigo-500/20" : "bg-card"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-xs text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Megaphone className="size-4" />
              </div>
              <span>TikTok Ads</span>
            </div>
            <StatusBadge
              status={tiktokStatusSummary.badgeStatus}
              label={tiktokStatusSummary.labelAr}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>النماذج الفورية وطلبيات COD</span>
            <Badge variant="outline" className="text-[10px]">
              Lead Gen
            </Badge>
          </div>
        </div>

        <div
          onClick={() => setActiveTab("notifications")}
          className={`cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-md ${
            activeTab === "notifications" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "bg-card"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-xs text-foreground">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bell className="size-4" />
              </div>
              <span>Telegram Bot Alerts</span>
            </div>
            <StatusBadge
              status={serverSettings?.telegram?.status || "not_configured"}
              label={isTgConfigured ? "متصل ونشط" : "غير مهيأ"}
            />
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            إشعارات الطلبيات الفورية لقناة الإدارة
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto p-1 bg-muted/60 flex flex-nowrap w-max gap-1">
            <TabsTrigger value="general" className="gap-1.5 text-xs py-2 px-3 cursor-pointer">
              <Globe className="size-3.5" />
              <span>Store Settings</span>
            </TabsTrigger>
            <TabsTrigger value="gemini" className="gap-1.5 text-xs py-2 px-3 cursor-pointer">
              <Sparkles className="size-3.5 text-emerald-500" />
              <span>Gemini AI Integration (Orva Agent AI)</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1.5 text-xs py-2 px-3 cursor-pointer">
              <BarChart3 className="size-3.5" />
              <span>Meta Pixel & CAPI</span>
            </TabsTrigger>
            <TabsTrigger value="tiktok" className="gap-1.5 text-xs py-2 px-3 cursor-pointer">
              <Megaphone className="size-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>TikTok Ads</span>
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-1.5 text-xs py-2 px-3 cursor-pointer">
              <Truck className="size-3.5" />
              <span>Delivery Integrations</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 text-xs py-2 px-3 cursor-pointer">
              <Bell className="size-3.5" />
              <span>Notifications (Telegram)</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── 1. General Settings ───────────────────────────────────────────── */}
        <TabsContent value="general" className="space-y-4 pt-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                الإعدادات العامة وهوية المتجر (General Store Identity)
              </CardTitle>
              <CardDescription className="text-xs">
                البيانات التعريفية الأساسية للمتجر، العملة الافتراضية، المنطقة الزمنية، وصفحات المتجر النشطة.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1">
                  <div className="text-muted-foreground font-semibold">اسم المتجر الرسمي (Store Name):</div>
                  <div className="font-extrabold text-sm text-foreground">ORVA STORE ALGERIA</div>
                  <div className="text-[11px] text-muted-foreground">متجر رسمي معتمد للتجارة الإلكترونية والتوصيل عبر 58 ولاية.</div>
                </div>

                <div className="p-3.5 rounded-xl border bg-card space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-foreground font-semibold flex items-center gap-2">
                      <ImageIcon className="size-4 text-primary" />
                      <span>شعار المتجر (Store Logo)</span>
                    </div>
                    {storeLogoSaving && <Loader2 className="size-3.5 animate-spin text-primary" />}
                  </div>

                  {logoFeedback && (
                    <Alert variant={logoFeedback.type === "error" ? "destructive" : "default"} className="py-2 text-xs">
                      <AlertDescription>{logoFeedback.message}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <div className="h-12 w-28 rounded-lg border bg-background p-1.5 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={storeLogoUrl} alt="Store Logo" className="h-full w-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-[200px] flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          value={storeLogoUrl}
                          onChange={(e) => setStoreLogoUrl(e.target.value)}
                          placeholder="مسار الشعار: /images/orva-logo.png أو رابط كامل"
                          className="h-8 text-xs font-mono"
                          dir="ltr"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveLogo()}
                          disabled={storeLogoSaving}
                          className="h-8 text-xs shrink-0"
                        >
                          حفظ
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={logoFileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/svg+xml,image/webp"
                          className="hidden"
                          onChange={handleUploadLogoFile}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => logoFileInputRef.current?.click()}
                          disabled={storeLogoSaving}
                          className="h-7 text-xs gap-1.5"
                        >
                          <Upload className="size-3" />
                          <span>رفع ملف شعار جديد (PNG, SVG, WEBP)</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1">
                  <div className="text-muted-foreground font-semibold">لغة المتجر (Store Language):</div>
                  <div className="font-extrabold text-sm text-foreground">العربية (Arabic — Default)</div>
                  <div className="text-[11px] text-muted-foreground">اللغة الأساسية للمتجر ولوحة التحكم، مع دعم واجهات الفرنسية والإنجليزية.</div>
                </div>

                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1">
                  <div className="text-muted-foreground font-semibold">العملة الافتراضية (Default Currency):</div>
                  <div className="font-extrabold text-sm text-foreground">DZD (دينار جزائري — Algerian Dinar)</div>
                  <div className="text-[11px] text-muted-foreground">تنسيق مالي موحد عبر جميع صفحات المتجر والفواتير.</div>
                </div>

                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1 md:col-span-2">
                  <div className="text-muted-foreground font-semibold">المنطقة الزمنية للمتجر (Store Timezone):</div>
                  <div className="font-extrabold text-sm text-foreground font-mono">Africa/Algiers (UTC+1)</div>
                  <div className="text-[11px] text-muted-foreground">تعتمد حسابات اليوم والأسبوع وتقارير الطلبيات حصراً على توقيت الجزائر الرسمي.</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Integrated Gemini AI Section inside Store Settings */}
          <Card className="border-emerald-500/30 shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Sparkles className="size-4 text-emerald-500" />
                    <span>GEMINI AI INTEGRATION — {geminiName || "Orva Agent AI"}</span>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    مدمج الآن مباشرة ضمن إعدادات المتجر: تحكّم في تفعيل مساعد الذكاء الاصطناعي ومفاتيح Google Gemini API.
                  </CardDescription>
                </div>
                <StatusBadge
                  status={serverSettings?.geminiAi?.status || (isGeminiConfigured ? "operational" : "not_configured")}
                  label={isGeminiConfigured ? (geminiEnabled ? "متصل ونشط" : "متوقف") : "غير مهيأ"}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3.5">
                <div className="space-y-0.5">
                  <div className="font-bold text-foreground">حالة الوكيل والنموذج النشط</div>
                  <div className="text-[11px] text-muted-foreground">
                    {geminiModel === "auto" ? "التوجيه التلقائي لأسرع نموذج متاح" : geminiModel}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="store-settings-gemini-switch" className="text-xs font-semibold cursor-pointer">
                      {geminiEnabled ? "مفعّل" : "معطّل"}
                    </Label>
                    <Switch
                      id="store-settings-gemini-switch"
                      checked={geminiEnabled}
                      onCheckedChange={async (checked) => {
                        setGeminiEnabled(checked);
                        await callSettingsApi({
                          action: "save",
                          geminiAi: { enabled: checked },
                        });
                        if (typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("orva:gemini-settings-updated"));
                        }
                        await fetchSettings();
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setActiveTab("gemini")}
                    className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                  >
                    <Bot className="size-3.5" />
                    <span>فتح إعدادات Gemini AI Integration</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 1B. Gemini AI Integration (Orva Agent AI) ─────────────────────── */}
        <TabsContent value="gemini" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-4">
            <Card className="border-emerald-500/30 shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Bot className="size-4 text-emerald-600" />
                      <span>إعدادات الذكاء الاصطناعي — {geminiName || "Orva Agent AI"}</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      إدارة محرك الذكاء الاصطناعي المرتبط بنافذة المحادثة الذكية مع توجيه تلقائي لأسرع نموذج متاح وتوقف آمن عند الانقطاع.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 text-xs">
                {geminiFeedback && (
                  <Alert variant={geminiFeedback.type === "error" ? "destructive" : "default"} className="py-2.5">
                    {geminiFeedback.type === "error" ? (
                      <AlertCircle className="size-4" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    <AlertTitle className="text-xs font-bold">
                      {geminiFeedback.type === "error" ? "تنبيه" : "نتيجة العملية"}
                    </AlertTitle>
                    <AlertDescription className="text-xs mt-0.5">{geminiFeedback.message}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between p-3.5 rounded-xl border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label htmlFor="gemini-tab-toggle" className="text-xs font-bold cursor-pointer">
                      تفعيل وكيل الذكاء الاصطناعي ({geminiName || "Orva Agent AI"}) في لوحة التحكم
                    </Label>
                    <div className="text-[11px] text-muted-foreground">
                      إظهار بطاقة المحادثة الذكية العائمة وتمكين الاستعلام المباشر عن الطلبيات والتقارير عبر Google Gemini API.
                    </div>
                  </div>
                  <Switch id="gemini-tab-toggle" checked={geminiEnabled} onCheckedChange={setGeminiEnabled} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="gemini-tab-name" className="text-xs font-semibold">
                      اسم الوكيل (Name):
                    </Label>
                    <Input
                      id="gemini-tab-name"
                      type="text"
                      value={geminiName}
                      onChange={(e) => setGeminiName(e.target.value)}
                      placeholder="Orva Agent AI"
                      className="text-xs font-medium"
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="gemini-tab-project-name" className="text-xs font-semibold">
                      اسم المشروع (Project Name):
                    </Label>
                    <Input
                      id="gemini-tab-project-name"
                      type="text"
                      value={geminiProjectName}
                      onChange={(e) => setGeminiProjectName(e.target.value)}
                      placeholder="projects/347934146406"
                      className="font-mono text-xs"
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="gemini-tab-project-number" className="text-xs font-semibold">
                      رقم المشروع (Project Number):
                    </Label>
                    <Input
                      id="gemini-tab-project-number"
                      type="text"
                      value={geminiProjectNumber}
                      onChange={(e) => setGeminiProjectNumber(e.target.value)}
                      placeholder="347934146406"
                      className="font-mono text-xs"
                      dir="ltr"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="gemini-tab-model" className="text-xs font-semibold">
                      نموذج Gemini المعتمد (Model):
                    </Label>
                    <select
                      id="gemini-tab-model"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 font-mono text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      dir="ltr"
                    >
                      <option value="auto">auto (الاختيار التلقائي الذكي لأسرع نموذج شغال — موصى به)</option>
                      <option value="gemini-flash-lite-latest">gemini-flash-lite-latest (Fast Live ~1.2s)</option>
                      <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Live ~3.2s)</option>
                      <option value="gemini-3.5-flash">gemini-3.5-flash (Live ~7.4s)</option>
                      <option value="gemini-3.8-flash">gemini-3.8-flash</option>
                      <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="gemini-tab-api-key" className="text-xs font-semibold">
                        مفتاح Gemini API Key (X-goog-api-key):
                      </Label>
                      {isGeminiConfigured && (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                          🔒 محفوظ ومحمي على الخادم
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="gemini-tab-api-key"
                        type={showGeminiKey ? "text" : "password"}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder={
                          isGeminiConfigured
                            ? "•••••••••••••••••••• (محفوظ على الخادم — اتركه فارغاً للإبقاء عليه)"
                            : "أدخل مفتاح Gemini API (مثال: AQ.Ab8RN6...)"
                        }
                        className="font-mono text-xs flex-1"
                        dir="ltr"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={() => setShowGeminiKey((prev) => !prev)}
                        title={showGeminiKey ? "إخفاء المفتاح" : "إظهار المفتاح"}
                      >
                        {showGeminiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      يُرسل المفتاح من الخادم فقط ويُحفظ بشكل آمن في قاعدة البيانات.
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      نقطة النهاية النشطة (Active Gemini Endpoint):
                    </Label>
                    <Input
                      type="text"
                      readOnly
                      value={`https://generativelanguage.googleapis.com/v1beta/models/${effectivePreviewModel}:generateContent`}
                      className="font-mono text-[11px] bg-muted/40 text-muted-foreground"
                      dir="ltr"
                    />
                    <div className="text-[11px] text-muted-foreground">
                      {geminiModel === "auto"
                        ? "الوضع التلقائي يجرب أسرع نموذج عامل ويتخطى أي نموذج متعطل تلقائياً."
                        : "بوابة الوكيل الداخلية في المتجر: POST /api/ai-agent"}
                    </div>
                  </div>
                </div>

                {/* Live Test Snapshot & Full Report Display */}
                {(geminiTestSnapshot || geminiTestReport) && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3" dir="rtl">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 flex-wrap">
                        <Zap className="size-4" />
                        <span>نتيجة الاختبار المباشر: التقارير الأخيرة لعدد الطلبيات والتقرير العام للمتجر</span>
                        {geminiResolvedModel && (
                          <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/40">
                            {geminiResolvedModel}
                            {geminiTestSnapshot?.latencyMs ? ` • ${geminiTestSnapshot.latencyMs}ms` : ""}
                          </Badge>
                        )}
                      </div>
                      {geminiTestReport && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyReport}
                          className="h-7 text-[11px] gap-1"
                        >
                          {copiedReport ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                          <span>{copiedReport ? "تم نسخ التقرير" : "نسخ التقرير"}</span>
                        </Button>
                      )}
                    </div>

                    {geminiTestSnapshot && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
                        <div className="rounded-lg border bg-background/80 p-2.5">
                          <div className="text-[10px] text-muted-foreground">إجمالي الطلبيات</div>
                          <div className="font-extrabold text-sm font-mono">{geminiTestSnapshot.totalOrders}</div>
                        </div>
                        <div className="rounded-lg border bg-background/80 p-2.5">
                          <div className="text-[10px] text-muted-foreground">مسلّمة (Delivered)</div>
                          <div className="font-extrabold text-sm font-mono text-emerald-600">
                            {geminiTestSnapshot.statusCounts.delivered}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/80 p-2.5">
                          <div className="text-[10px] text-muted-foreground">قيد الانتظار / مؤكدة</div>
                          <div className="font-extrabold text-sm font-mono text-amber-600">
                            {geminiTestSnapshot.statusCounts.pending + geminiTestSnapshot.statusCounts.confirmed}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/80 p-2.5">
                          <div className="text-[10px] text-muted-foreground">مشحونة (Shipped)</div>
                          <div className="font-extrabold text-sm font-mono text-blue-600">
                            {geminiTestSnapshot.statusCounts.shipped}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/80 p-2.5">
                          <div className="text-[10px] text-muted-foreground">المبيعات المحصّلة</div>
                          <div className="font-extrabold text-sm font-mono text-emerald-600">
                            {geminiTestSnapshot.deliveredRevenueDzd.toLocaleString("fr-DZ")} د.ج
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/80 p-2.5">
                          <div className="text-[10px] text-muted-foreground">شحنات Redex</div>
                          <div className="font-extrabold text-sm font-mono">
                            {geminiTestSnapshot.redexTrackedCount}
                          </div>
                        </div>
                      </div>
                    )}

                    {geminiTestReport && (
                      <div className="rounded-lg border bg-background/90 p-3.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground font-sans">
                        {geminiTestReport}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveGeminiAi}
                    disabled={geminiSaving}
                    className="text-xs gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {geminiSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    <span>حفظ إعدادات Orva Agent AI</span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestGeminiAiReport}
                    disabled={geminiTesting || (!isGeminiConfigured && !geminiApiKey.trim())}
                    className="text-xs gap-1.5 h-8 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                  >
                    {geminiTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                    <span>اختبار التقارير الأخيرة لعدد الطلبيات والتقارير العامة للمتجر</span>
                  </Button>
                </div>

                {isGeminiConfigured && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClearGeminiKey}
                    disabled={geminiSaving}
                    className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
                  >
                    <Trash2 className="size-3.5" />
                    <span>مسح مفتاح API</span>
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {/* ── 2. Analytics & Marketing ──────────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* First-Party Analytics */}
            <Card className="md:col-span-1">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <BarChart3 className="size-4 text-primary" />
                  التحليلات الداخلية
                </CardTitle>
                <CardDescription className="text-xs">
                  نظام القياس الداخلي الخصوصي 100%.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                <div>• قياس الجلسات وحركات التصفح</div>
                <div>• رصد معاينة المنتجات</div>
                <div>• رصد إرسال الطلبات وإتمام الشراء</div>
                <div>• التوزيع الجغرافي وحساب حصص الولايات (58 ولاية)</div>
                <div>• تجميع البيانات وفق روزنامة الجزائر</div>
              </CardContent>
            </Card>

            {/* Unified Meta Pixel & CAPI Card */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Tag className="size-4 text-blue-600" />
                      إعدادات تتبع الحملات — Meta Pixel &amp; Conversions API
                    </CardTitle>
                    <CardDescription className="text-xs">
                      تتبع دقيق عالي التحويل لمبيعات COD مع تفادي حظر الكوكيز وإلغاء الازدواجية البرمجية (Deduplication) وإرسال الأحداث عبر المتصفح والخادم دون إعادة بناء الموقع.
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    <span>تشفير SHA-256 للمطابقة الصارمة نشط</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {metaFeedback && (
                  <Alert variant={metaFeedback.type === "error" ? "destructive" : "default"} className="py-2.5">
                    {metaFeedback.type === "error" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                    <AlertTitle className="text-xs font-bold">
                      {metaFeedback.type === "error" ? "تنبيه" : "نجاح العملية"}
                    </AlertTitle>
                    <AlertDescription className="text-xs mt-0.5">{metaFeedback.message}</AlertDescription>
                  </Alert>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                    <div className="space-y-0.5">
                      <Label htmlFor="meta-toggle" className="text-xs font-bold cursor-pointer">
                        حقن كود المتصفح (Browser Pixel Injection)
                      </Label>
                      <div className="text-[11px] text-muted-foreground">
                        تفعيل إطلاق أحداث PageView و ViewContent و InitiateCheckout من المتصفح.
                      </div>
                    </div>
                    <Switch
                      id="meta-toggle"
                      checked={metaEnabled}
                      onCheckedChange={setMetaEnabled}
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                    <div className="space-y-0.5">
                      <Label htmlFor="meta-capi-toggle" className="text-xs font-bold cursor-pointer">
                        خادم التحويلات (Server CAPI Events)
                      </Label>
                      <div className="text-[11px] text-muted-foreground">
                        إرسال أحداث Purchase المؤكدة مباشرة من الخادم عند اكتمال طلب الزبون.
                      </div>
                    </div>
                    <Switch
                      id="meta-capi-toggle"
                      checked={metaCapiEnabled}
                      onCheckedChange={setMetaCapiEnabled}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="meta-pixel-id" className="text-xs font-semibold">
                    معرّف بيكسل فيسبوك (Meta Pixel ID):
                  </Label>
                  <Input
                    id="meta-pixel-id"
                    type="text"
                    placeholder="مثال: 2340414976777036 (12 إلى 20 رقماً)"
                    value={metaPixelId}
                    onChange={(e) => setMetaPixelId(e.target.value)}
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                  <div className="text-[11px] text-muted-foreground">
                    المعرّف العام الظاهر للمتصفح ولوحة Meta Events Manager.
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="meta-capi-token" className="text-xs font-semibold">
                      رمز وصول Conversions API (CAPI Access Token):
                    </Label>
                    {hasMetaCapi && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                        🔒 محفوظ ومحمي على الخادم
                      </Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="meta-capi-token"
                      type={showMetaToken ? "text" : "password"}
                      placeholder={hasMetaCapi ? "•••••••••••••••••••• (محفوظ على الخادم — اتركه فارغاً للإبقاء عليه)" : "أدخل EAAB... الخاص بـ Meta Conversions API"}
                      value={metaCapiToken}
                      onChange={(e) => setMetaCapiToken(e.target.value)}
                      className="font-mono text-xs pr-20"
                      dir="ltr"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-5 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowMetaToken(!showMetaToken)}
                        title={showMetaToken ? "إخفاء الرمز" : "إظهار الرمز"}
                      >
                        {showMetaToken ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </Button>
                      <Key className="size-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    سر الخادم فقط: لا يتم تمرير هذا الرمز للمتصفح إطلاقاً ويستخدم فقط لإرسال أحداث الشراء من السيرفر.
                  </div>
                </div>

                <div className="p-3 rounded-xl border bg-muted/30 space-y-3 text-[11px]">
                  <div className="font-semibold text-foreground">نطاق تطبيق كود التتبع (Pixel Scope)</div>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="meta-scope"
                        checked={metaScope === "all"}
                        onChange={() => setMetaScope("all")}
                      />
                      <span>كل صفحات المتجر المعرّفة (Storewide)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="meta-scope"
                        checked={metaScope === "selected"}
                        onChange={() => setMetaScope("selected")}
                      />
                      <span>صفحات محددة فقط (Selective Execution)</span>
                    </label>
                  </div>
                  {metaScope === "selected" && (
                    <div className="grid gap-1.5 sm:grid-cols-2 pt-1">
                      {STOREFRONT_PAGE_OPTIONS.map((opt) => {
                        const checked = metaPages.includes(opt.path);
                        return (
                          <label key={opt.path} className="flex items-center gap-2 cursor-pointer rounded-lg border bg-background/60 px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setMetaPages((prev) =>
                                  checked ? prev.filter((p) => p !== opt.path) : [...prev, opt.path]
                                );
                              }}
                            />
                            <span className="leading-tight">{opt.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {serverSettings?.metaPixel?.updatedAt && (
                    <div className="text-muted-foreground text-[10px] pt-1">
                      آخر تحديث: {new Date(serverSettings.metaPixel.updatedAt).toLocaleString("ar-DZ")}
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveMeta}
                    disabled={metaSaving}
                    className="text-xs gap-1.5 h-8 bg-blue-600 hover:bg-blue-700"
                  >
                    {metaSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    <span>حفظ إعدادات Meta</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestMeta}
                    disabled={metaTesting || !metaPixelId.trim()}
                    className="text-xs gap-1.5 h-8"
                  >
                    {metaTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                    <span>فحص التكوين الآمن</span>
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  {isMetaConfigured && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearMetaPixelId}
                      disabled={metaSaving}
                      className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
                    >
                      <Trash2 className="size-3.5" />
                      <span>إزالة Pixel ID</span>
                    </Button>
                  )}
                  {hasMetaCapi && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearMetaToken}
                      disabled={metaSaving}
                      className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
                    >
                      <Trash2 className="size-3.5" />
                      <span>مسح CAPI Token</span>
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {/* ── 3. Delivery Integrations ──────────────────────────────────────── */}
        <TabsContent value="delivery" className="space-y-4 pt-2">
          <div className="grid grid-cols-1 gap-4">
            {/* Dynamic Redex Express DZ (Sole Active Delivery Courier) */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Truck className="size-4 text-primary" />
                    Redex Express DZ
                  </CardTitle>
                  <StatusBadge
                    status={serverSettings?.redex?.status || "not_configured"}
                    label={isRedexConfigured ? "Configured & Active" : "Not Configured"}
                  />
                </div>
                <CardDescription className="text-xs">
                  بوابة الشحن والتوزيع السريع المعتمدة والوحيدة في المتجر (Redex Express DZ).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {redexFeedback && (
                  <Alert variant={redexFeedback.type === "error" ? "destructive" : "default"} className="py-2.5">
                    {redexFeedback.type === "error" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                    <AlertTitle className="text-xs font-bold">
                      {redexFeedback.type === "error" ? "تنبيه" : "نتيجة الإجراء"}
                    </AlertTitle>
                    <AlertDescription className="text-xs mt-0.5">{redexFeedback.message}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label htmlFor="redex-toggle" className="text-xs font-bold cursor-pointer">
                      تفعيل بوابة RedEx Express
                    </Label>
                    <div className="text-[11px] text-muted-foreground">
                      تمكين دفع الشحنات اليدوي وتوليد البوليصة الرسمية.
                    </div>
                  </div>
                  <Switch
                    id="redex-toggle"
                    checked={redexEnabled}
                    onCheckedChange={setRedexEnabled}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="redex-base-url" className="text-xs font-semibold">
                    عنوان البوابة (Gateway Base URL):
                  </Label>
                  <Input
                    id="redex-base-url"
                    type="text"
                    value={redexBaseUrl}
                    onChange={(e) => setRedexBaseUrl(e.target.value)}
                    placeholder="https://redex.ecotrack.dz"
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="redex-token" className="text-xs font-semibold">
                      رمز المصادقة (RedEx API Token):
                    </Label>
                    {isRedexConfigured && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                        🔒 محفوظ ومحمي
                      </Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="redex-token"
                      type="password"
                      placeholder={isRedexConfigured ? "•••••••••••••••••••• (محفوظ على الخادم — اتركه فارغاً للإبقاء عليه)" : "أدخل RedEx API Token"}
                      value={redexToken}
                      onChange={(e) => setRedexToken(e.target.value)}
                      className="font-mono text-xs pr-8"
                      dir="ltr"
                    />
                    <Key className="size-3.5 text-muted-foreground absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    يتم تخزين الرمز مشفراً بخوارزمية AES-256-GCM. لا يتم كشف الرمز للمتصفح.
                  </div>
                </div>

                {serverSettings?.redex?.updatedAt && (
                  <div className="text-muted-foreground text-[10px]">
                    آخر تحديث: {new Date(serverSettings.redex.updatedAt).toLocaleString("ar-DZ")}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveRedex}
                    disabled={redexSaving}
                    className="text-xs gap-1.5 h-8 bg-blue-600 hover:bg-blue-700"
                  >
                    {redexSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    <span>حفظ إعدادات RedEx</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestRedex}
                    disabled={redexTesting}
                    className="text-xs gap-1.5 h-8"
                  >
                    {redexTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                    <span>فحص الاتصال الآمن</span>
                  </Button>
                </div>
                {isRedexConfigured && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearRedex}
                    disabled={redexSaving}
                    className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
                  >
                    <Trash2 className="size-3.5" />
                    <span>مسح التوكن</span>
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {/* ── 4. Notifications ──────────────────────────────────────────────── */}
        <TabsContent value="notifications" className="space-y-4 pt-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  إشعارات تيليجرام اللحظية
                </CardTitle>
                <StatusBadge
                  status={serverSettings?.telegram?.status || "not_configured"}
                  label={isTgConfigured ? "Configured & Active" : "Not Configured"}
                />
              </div>
              <CardDescription className="text-xs">
                إرسال تنبيهات فورية مشفرة لإدارة المتجر عند تسجيل طلب جديد مع منع التكرار وحماية بيانات الزبائن.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {tgFeedback && (
                <Alert variant={tgFeedback.type === "error" ? "destructive" : "default"} className="py-2.5">
                  {tgFeedback.type === "error" ? <AlertCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
                  <AlertTitle className="text-xs font-bold">
                    {tgFeedback.type === "error" ? "تنبيه" : "نتيجة الإجراء"}
                  </AlertTitle>
                  <AlertDescription className="text-xs mt-0.5">{tgFeedback.message}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                <div className="space-y-0.5">
                  <Label htmlFor="tg-toggle" className="text-xs font-bold cursor-pointer">
                    تفعيل إشعارات تيليجرام الفورية
                  </Label>
                  <div className="text-[11px] text-muted-foreground">
                    إرسال التنبيهات الفورية لقناة الإدارة عند تسجيل طلبات جديدة.
                  </div>
                </div>
                <Switch
                  id="tg-toggle"
                  checked={tgEnabled}
                  onCheckedChange={setTgEnabled}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="tg-bot-token" className="text-xs font-semibold">
                      رمز البوت (Telegram Bot Token):
                    </Label>
                    {isTgConfigured && (
                      <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                        🔒 محفوظ ومحمي
                      </Badge>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="tg-bot-token"
                      type="password"
                      placeholder={isTgConfigured ? "•••••••••••••••••••• (محفوظ على الخادم — اتركه فارغاً للإبقاء عليه)" : "أدخل رمز Telegram Bot Token"}
                      value={tgBotToken}
                      onChange={(e) => setTgBotToken(e.target.value)}
                      className="font-mono text-xs pr-8"
                      dir="ltr"
                    />
                    <Key className="size-3.5 text-muted-foreground absolute right-2.5 top-2.5 pointer-events-none" />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    رمز البوت الخاص الممنوح من BotFather. يتم تشفيره على الخادم.
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="tg-chat-id" className="text-xs font-semibold">
                    معرّف القناة أو المحادثة (Telegram Chat ID):
                  </Label>
                  <Input
                    id="tg-chat-id"
                    type="text"
                    placeholder="مثال: -1003965560132"
                    value={tgChatId}
                    onChange={(e) => setTgChatId(e.target.value)}
                    className="font-mono text-xs"
                    dir="ltr"
                  />
                  <div className="text-[11px] text-muted-foreground">
                    معرف القناة الإدارية الخاصة باستقبال الطلبيات.
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border bg-card space-y-2">
                <div className="font-bold text-foreground">نموذج محتوى إشعار الطلب الجديد:</div>
                <div className="font-mono text-[11px] bg-slate-900 text-slate-100 p-3 rounded-lg leading-relaxed dark:bg-muted dark:text-foreground">
                  🔔 طلب جديد — ORVA STORE<br />
                  ━━━━━━━━━━━━━━<br />
                  🆔 رقم الطلب: #1025<br />
                  👤 اسم العميل: أحمد محمد<br />
                  📞 الهاتف: 0791231316<br />
                  📍 الولاية: بسكرة<br />
                  🏠 البلدية: بسكرة<br />
                  ━━━━━━━━━━━━━━<br />
                  🛒 تفاصيل المنتجات:<br />
                  • Pack 1 Pro 4-in-1<br />
                  • الكمية: 1<br />
                  • السعر: 4,950 د.ج<br />
                  ━━━━━━━━━━━━━━<br />
                  💰 سعر المنتجات: 4,950 د.ج<br />
                  🚚 التوصيل: 500 د.ج<br />
                  💵 الإجمالي: 5,450 د.ج<br />
                  📅 تاريخ الطلب: 2026/11/04 14:35<br />
                  📌 الحالة: طلب جديد
                </div>
              </div>

              {serverSettings?.telegram?.updatedAt && (
                <div className="text-muted-foreground text-[10px]">
                  آخر تحديث: {new Date(serverSettings.telegram.updatedAt).toLocaleString("ar-DZ")}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveTelegram}
                  disabled={tgSaving}
                  className="text-xs gap-1.5 h-8 bg-blue-600 hover:bg-blue-700"
                >
                  {tgSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  <span>حفظ إعدادات تيليجرام</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestTelegram}
                  disabled={tgTesting}
                  className="text-xs gap-1.5 h-8"
                >
                  {tgTesting ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                  <span>فحص اتصال البوت (getMe الآمن)</span>
                </Button>
              </div>
              {isTgConfigured && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearTelegram}
                  disabled={tgSaving}
                  className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5 h-8"
                >
                  <Trash2 className="size-3.5" />
                  <span>مسح التوكن</span>
                </Button>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: TIKTOK ADS LEAD GENERATION INTEGRATION (PHASE C)
           ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="tiktok" className="mt-4">
          <TikTokLeadsIntegrationCard
            callbackParams={searchParams}
            onStatusChange={setTiktokStatusSummary}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
