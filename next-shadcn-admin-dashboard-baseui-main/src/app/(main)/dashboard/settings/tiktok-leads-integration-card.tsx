"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  History,
  Info,
  Link2,
  Loader2,
  Lock,
  Package,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Unlink,
  X,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  ALGERIA_58_WILAYAS,
  DEFAULT_FORMS_PAGE_SIZE,
  RECONCILE_LOOKBACK_OPTIONS,
  TIKTOK_API_ENDPOINTS,
  type MappableCatalogProduct,
  type PublicTikTokAdAccount,
  type PublicTikTokConnection,
  type PublicTikTokForm,
  type TikTokConfigurationReadiness,
  type TikTokConnectionBadgeSummary,
  type TikTokDashboardSnapshot,
  type TikTokDeliveryType,
  type TikTokFormsFilterMode,
  type TikTokLeadStats,
  type TikTokOAuthCallbackNotice,
  type TikTokRecoverableLead,
  type TikTokSyncLogItem,
  type TikTokSyncMetricsSummary,
  type TikTokTelegramOptInState,
  buildProductMappingPayload,
  canToggleFormSync,
  clampReconcileLookbackDays,
  deriveTikTokConnectionUiState,
  filterTikTokForms,
  formatAlgiersDateTime,
  formatDzd,
  formatTikTokApiError,
  getLeadFailureExplanation,
  getWilayaDeliveryNotice,
  getWilayaLabelAr,
  paginateItems,
  parseTikTokOAuthCallbackNotice,
} from "./tiktok-leads-types";

export interface TikTokLeadsIntegrationCardProps {
  /** Optional read-only search params forwarded from the Settings page shell (for OAuth callback banner). */
  callbackParams?: { get(name: string): string | null } | null;
  /** Optional preloaded snapshot (used for deterministic SSR/unit rendering and initial hydration). */
  initialData?: Partial<TikTokDashboardSnapshot>;
  /** Optional callback notifying parent Settings quick-jump strip of honest TikTok status. */
  onStatusChange?: (summary: TikTokConnectionBadgeSummary) => void;
}

interface InlineFeedback {
  type: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
}

const DEFAULT_TELEGRAM_OPT_IN: TikTokTelegramOptInState = {
  enabled: false,
  source: "default",
  envLocked: false,
  existingTelegramConfigured: false,
};

const DEFAULT_LEAD_STATS: TikTokLeadStats = {
  totalSampled: 0,
  byStatus: {
    order_created: 0,
    lead_saved_no_order: 0,
    duplicate_skipped: 0,
    invalid_phone: 0,
    unmapped_form: 0,
    order_creation_failed: 0,
    pending: 0,
  },
};

function buildAdminHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (typeof window !== "undefined") {
    try {
      const token = window.localStorage.getItem("orva_admin_token");
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Ignore storage restrictions
    }
  }
  return headers;
}

async function requestTikTokApi<T = Record<string, unknown>>(
  url: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const res = await fetch(url, {
    method,
    headers: buildAdminHeaders(),
    credentials: "same-origin",
    ...(method === "POST" && options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || data?.success === false) {
    const formatted = formatTikTokApiError(res.status, data);
    const err = new Error(formatted.messageAr) as Error & {
      status?: number;
      code?: string;
      isConflict?: boolean;
      isPermissionError?: boolean;
      isAuthError?: boolean;
    };
    err.status = formatted.status;
    err.code = formatted.code;
    err.isConflict = formatted.isConflict;
    err.isPermissionError = formatted.isPermissionError;
    err.isAuthError = formatted.isAuthError;
    throw err;
  }

  return (data ?? {}) as T;
}

function ConnectionStatusBadge({ summary }: { summary: TikTokConnectionBadgeSummary }) {
  switch (summary.state) {
    case "connected":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 text-[11px]">
          <CheckCircle2 className="size-3" />
          <span>{summary.labelAr}</span>
        </Badge>
      );
    case "misconfigured":
    case "token_expired":
    case "revoked":
    case "error":
      return (
        <Badge variant="destructive" className="font-bold gap-1 text-[11px]">
          <ShieldAlert className="size-3" />
          <span>{summary.labelAr}</span>
        </Badge>
      );
    case "not_connected":
      return (
        <Badge
          variant="outline"
          className="border-blue-400 text-blue-700 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-300 font-bold gap-1 text-[11px]"
        >
          <ShieldCheck className="size-3" />
          <span>{summary.labelAr}</span>
        </Badge>
      );
    case "not_configured":
    default:
      return (
        <Badge
          variant="outline"
          className="border-slate-300 text-slate-600 bg-slate-50 dark:bg-slate-900 dark:text-slate-400 font-bold text-[11px]"
        >
          <span>{summary.labelAr}</span>
        </Badge>
      );
  }
}

function FormStatusBadge({ status }: { status: PublicTikTokForm["status"] }) {
  switch (status) {
    case "ACTIVE":
      return (
        <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
          نشط (ACTIVE)
        </Badge>
      );
    case "PAUSED":
      return (
        <Badge
          variant="outline"
          className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-bold"
        >
          متوقف (PAUSED)
        </Badge>
      );
    case "ARCHIVED":
      return (
        <Badge variant="secondary" className="text-[10px] font-bold">
          مؤرشف (ARCHIVED)
        </Badge>
      );
    case "DELETED":
      return (
        <Badge variant="destructive" className="text-[10px] font-bold gap-1">
          <XCircle className="size-3" />
          <span>محذوف من TikTok (DELETED)</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px]">
          {status}
        </Badge>
      );
  }
}

function TriggerSourceBadge({ source }: { source: TikTokSyncLogItem["triggerSource"] }) {
  const labels: Record<TikTokSyncLogItem["triggerSource"], string> = {
    manual: "مزامنة يدوية",
    webhook: "Webhook فوري",
    scheduled: "مجدول",
    reconciliation: "مزامنة تاريخية",
  };
  return (
    <Badge variant="outline" className="text-[10px] font-medium">
      {labels[source] || source}
    </Badge>
  );
}

function SyncRunStatusBadge({ status }: { status: TikTokSyncLogItem["status"] }) {
  if (status === "success") {
    return (
      <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
        ناجح
      </Badge>
    );
  }
  if (status === "partial") {
    return (
      <Badge
        variant="outline"
        className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-bold"
      >
        جزئي
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px] font-bold">
      فشل
    </Badge>
  );
}

function FeedbackAlert({
  feedback,
  onDismiss,
}: {
  feedback: InlineFeedback | null;
  onDismiss?: () => void;
}) {
  if (!feedback) return null;

  const styles =
    feedback.type === "error"
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : feedback.type === "warning"
        ? "border-amber-500/40 bg-amber-50/80 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        : feedback.type === "success"
          ? "border-emerald-500/40 bg-emerald-50/80 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
          : "border-blue-500/40 bg-blue-50/80 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200";

  return (
    <Alert className={`py-2.5 text-xs ${styles}`}>
      <div className="flex items-start justify-between gap-2 w-full">
        <div className="flex items-start gap-2">
          {feedback.type === "error" ? (
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
          ) : feedback.type === "warning" ? (
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          ) : feedback.type === "success" ? (
            <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
          ) : (
            <Info className="size-4 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            {feedback.title && <AlertTitle className="text-xs font-bold">{feedback.title}</AlertTitle>}
            <AlertDescription className="text-xs leading-relaxed">{feedback.message}</AlertDescription>
          </div>
        </div>
        {onDismiss && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDismiss}
            className="size-6 shrink-0"
            aria-label="إغلاق التنبيه"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </Alert>
  );
}

export function TikTokLeadsIntegrationCard({
  callbackParams,
  initialData,
  onStatusChange,
}: TikTokLeadsIntegrationCardProps) {
  // ── Core Server State ──────────────────────────────────────────────────────
  const [loading, setLoading] = React.useState<boolean>(!initialData);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [readiness, setReadiness] = React.useState<TikTokConfigurationReadiness | null>(
    initialData?.readiness ?? null,
  );
  const [connection, setConnection] = React.useState<PublicTikTokConnection | null>(
    initialData?.connection ?? null,
  );
  const [telegramOptIn, setTelegramOptIn] = React.useState<TikTokTelegramOptInState>(
    initialData?.telegramOptIn ?? DEFAULT_TELEGRAM_OPT_IN,
  );
  const [accounts, setAccounts] = React.useState<PublicTikTokAdAccount[]>(
    initialData?.accounts ?? [],
  );
  const [forms, setForms] = React.useState<PublicTikTokForm[]>(initialData?.forms ?? []);
  const [catalogProducts, setCatalogProducts] = React.useState<MappableCatalogProduct[]>(
    initialData?.catalogProducts ?? [],
  );
  const [logs, setLogs] = React.useState<TikTokSyncLogItem[]>(initialData?.logs ?? []);
  const [leadStats, setLeadStats] = React.useState<TikTokLeadStats>(
    initialData?.leadStats ?? DEFAULT_LEAD_STATS,
  );
  const [recoverableLeads, setRecoverableLeads] = React.useState<TikTokRecoverableLead[]>(
    initialData?.recoverableLeads ?? [],
  );

  // ── Action Locks & Section Feedback (Prevents Double Submission) ──────────
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [connectionFeedback, setConnectionFeedback] = React.useState<InlineFeedback | null>(null);
  const [accountsFeedback, setAccountsFeedback] = React.useState<InlineFeedback | null>(null);
  const [formsFeedback, setFormsFeedback] = React.useState<InlineFeedback | null>(null);
  const [syncFeedback, setSyncFeedback] = React.useState<InlineFeedback | null>(null);
  const [telegramFeedback, setTelegramFeedback] = React.useState<InlineFeedback | null>(null);
  const [lastSyncResult, setLastSyncResult] = React.useState<{
    label: string;
    summary: TikTokSyncMetricsSummary;
  } | null>(null);

  // ── OAuth Callback Notice ─────────────────────────────────────────────────
  const parsedCallbackNotice = React.useMemo<TikTokOAuthCallbackNotice | null>(
    () => parseTikTokOAuthCallbackNotice(callbackParams),
    [callbackParams],
  );
  const [dismissedCallbackCode, setDismissedCallbackCode] = React.useState<string | null>(null);
  const activeCallbackNotice =
    parsedCallbackNotice && dismissedCallbackCode !== parsedCallbackNotice.code
      ? parsedCallbackNotice
      : null;

  // ── Disconnect Dialog State ───────────────────────────────────────────────
  const [disconnectOpen, setDisconnectOpen] = React.useState<boolean>(false);

  // ── Webhook URL Display & Copy ────────────────────────────────────────────
  const [webhookUrlDisplay, setWebhookUrlDisplay] = React.useState<string>(
    TIKTOK_API_ENDPOINTS.webhookPath,
  );
  const [copiedWebhook, setCopiedWebhook] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.location?.origin) {
      setWebhookUrlDisplay(`${window.location.origin}${TIKTOK_API_ENDPOINTS.webhookPath}`);
    }
  }, []);

  // ── Forms Search, Filter, Pagination & Schema Inspector ───────────────────
  const [formSearch, setFormSearch] = React.useState<string>("");
  const [formFilter, setFormFilter] = React.useState<TikTokFormsFilterMode>("all");
  const [formsPage, setFormsPage] = React.useState<number>(1);
  const [expandedFormIds, setExpandedFormIds] = React.useState<Record<string, boolean>>({});

  // ── Product Mapping Dialog State ──────────────────────────────────────────
  const [mappingForm, setMappingForm] = React.useState<PublicTikTokForm | null>(null);
  const [selectedProductId, setSelectedProductId] = React.useState<string>("");
  const [defaultWilayaCode, setDefaultWilayaCode] = React.useState<number>(16);
  const [defaultDeliveryType, setDefaultDeliveryType] =
    React.useState<TikTokDeliveryType>("DOMICILE");
  const [autoCreateOrder, setAutoCreateOrder] = React.useState<boolean>(true);
  const [mappingSyncEnabled, setMappingSyncEnabled] = React.useState<boolean>(true);
  const [mappingError, setMappingError] = React.useState<string | null>(null);

  // ── Historical Reconciliation Selector ────────────────────────────────────
  const [reconcileDays, setReconcileDays] = React.useState<number>(7);

  // ── Derived State ─────────────────────────────────────────────────────────
  const connectionSummary = React.useMemo(
    () => deriveTikTokConnectionUiState(readiness, connection),
    [readiness, connection],
  );

  React.useEffect(() => {
    onStatusChange?.(connectionSummary);
  }, [connectionSummary, onStatusChange]);

  const activeAccount = React.useMemo(
    () =>
      accounts.find((a) => a.isSelected) ??
      accounts.find((a) => a.advertiserId === connection?.selectedAdvertiserId) ??
      null,
    [accounts, connection?.selectedAdvertiserId],
  );

  const filteredForms = React.useMemo(
    () => filterTikTokForms(forms, formSearch, formFilter),
    [forms, formSearch, formFilter],
  );

  const paginatedForms = React.useMemo(
    () => paginateItems(filteredForms, formsPage, DEFAULT_FORMS_PAGE_SIZE),
    [filteredForms, formsPage],
  );

  React.useEffect(() => {
    setFormsPage(1);
  }, [formSearch, formFilter]);

  const selectedCatalogProduct = React.useMemo(
    () => catalogProducts.find((p) => p.id === selectedProductId) ?? null,
    [catalogProducts, selectedProductId],
  );

  const wilayaDeliveryWarning = React.useMemo(
    () => getWilayaDeliveryNotice(defaultWilayaCode, defaultDeliveryType),
    [defaultWilayaCode, defaultDeliveryType],
  );

  const enabledFormsCount = React.useMemo(
    () => forms.filter((f) => f.syncEnabled && f.status !== "DELETED" && Boolean(f.mapping)).length,
    [forms],
  );

  const retryableLeadsCount = React.useMemo(
    () => recoverableLeads.filter((l) => getLeadFailureExplanation(l.syncStatus).retryable).length,
    [recoverableLeads],
  );

  const isAnyActionBusy = busyAction !== null;

  // ── Data Loading (Strictly via Phase B Admin APIs) ────────────────────────
  const loadDashboardData = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const connectRes = await requestTikTokApi<{
        readiness: TikTokConfigurationReadiness;
        connection: PublicTikTokConnection | null;
        telegramOptIn?: TikTokTelegramOptInState;
      }>(TIKTOK_API_ENDPOINTS.connect);

      setReadiness(connectRes.readiness ?? null);
      setConnection(connectRes.connection ?? null);
      if (connectRes.telegramOptIn) {
        setTelegramOptIn(connectRes.telegramOptIn);
      }

      const [accountsRes, formsRes, syncRes] = await Promise.allSettled([
        requestTikTokApi<{ accounts: PublicTikTokAdAccount[] }>(TIKTOK_API_ENDPOINTS.accounts),
        requestTikTokApi<{
          forms: PublicTikTokForm[];
          catalogProducts?: MappableCatalogProduct[];
        }>(`${TIKTOK_API_ENDPOINTS.forms}?includeCatalog=1`),
        requestTikTokApi<{
          logs: TikTokSyncLogItem[];
          leadStats: TikTokLeadStats;
          recoverableLeads: TikTokRecoverableLead[];
        }>(`${TIKTOK_API_ENDPOINTS.sync}?limit=25`),
      ]);

      if (accountsRes.status === "fulfilled") {
        setAccounts(Array.isArray(accountsRes.value.accounts) ? accountsRes.value.accounts : []);
      }
      if (formsRes.status === "fulfilled") {
        setForms(Array.isArray(formsRes.value.forms) ? formsRes.value.forms : []);
        if (Array.isArray(formsRes.value.catalogProducts)) {
          setCatalogProducts(formsRes.value.catalogProducts);
        }
      }
      if (syncRes.status === "fulfilled") {
        setLogs(Array.isArray(syncRes.value.logs) ? syncRes.value.logs : []);
        if (syncRes.value.leadStats) setLeadStats(syncRes.value.leadStats);
        setRecoverableLeads(
          Array.isArray(syncRes.value.recoverableLeads) ? syncRes.value.recoverableLeads : [],
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "تعذر تحميل حالة تكامل TikTok Ads من الخادم.";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!initialData) {
      void loadDashboardData();
    }
  }, [initialData, loadDashboardData]);

  const refreshLogsAndLeads = React.useCallback(async () => {
    const syncRes = await requestTikTokApi<{
      logs: TikTokSyncLogItem[];
      leadStats: TikTokLeadStats;
      recoverableLeads: TikTokRecoverableLead[];
    }>(`${TIKTOK_API_ENDPOINTS.sync}?limit=25`);
    setLogs(Array.isArray(syncRes.logs) ? syncRes.logs : []);
    if (syncRes.leadStats) setLeadStats(syncRes.leadStats);
    setRecoverableLeads(
      Array.isArray(syncRes.recoverableLeads) ? syncRes.recoverableLeads : [],
    );
  }, []);

  // ── Section A Handlers: Connect & Disconnect ──────────────────────────────
  const handleStartConnect = async () => {
    if (isAnyActionBusy) return;
    setBusyAction("connect_start");
    setConnectionFeedback(null);
    try {
      const res = await requestTikTokApi<{ authorizationUrl: string }>(
        TIKTOK_API_ENDPOINTS.connect,
        { method: "POST", body: { action: "start" } },
      );
      if (!res.authorizationUrl) {
        throw new Error("لم يرجع الخادم رابط تفويض TikTok صالحاً.");
      }
      if (typeof window !== "undefined") {
        window.location.assign(res.authorizationUrl);
      }
    } catch (err) {
      setConnectionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر بدء تفويض TikTok OAuth.",
      });
      setBusyAction(null);
    }
  };

  const handleConfirmDisconnect = async () => {
    if (isAnyActionBusy) return;
    setBusyAction("disconnect");
    setConnectionFeedback(null);
    try {
      const res = await requestTikTokApi<{ disconnected: boolean; upstreamRevoked: boolean }>(
        TIKTOK_API_ENDPOINTS.connect,
        { method: "POST", body: { action: "disconnect" } },
      );
      setDisconnectOpen(false);
      setConnectionFeedback({
        type: "info",
        message: res.upstreamRevoked
          ? "تم فصل حساب TikTok وحذف الرموز المشفرة محلياً وإلغاء التفويض من جهة TikTok بنجاح. تم الإبقاء على الطلبيات والسجلات السابقة بأمان."
          : "تم فصل حساب TikTok وحذف الرموز المشفرة من قاعدة البيانات بنجاح. تم الإبقاء على الطلبيات والسجلات السابقة بأمان.",
      });
      await loadDashboardData();
    } catch (err) {
      setConnectionFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر فصل حساب TikTok.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  // ── Section B Handlers: Advertisers & Webhooks ────────────────────────────
  const handleRefreshAccounts = async () => {
    if (isAnyActionBusy) return;
    setBusyAction("accounts_refresh");
    setAccountsFeedback(null);
    try {
      const res = await requestTikTokApi<{
        accounts: PublicTikTokAdAccount[];
        revokedIds?: string[];
        metadataWarning?: string | null;
      }>(TIKTOK_API_ENDPOINTS.accounts, {
        method: "POST",
        body: { action: "refresh" },
      });
      setAccounts(Array.isArray(res.accounts) ? res.accounts : []);
      setAccountsFeedback({
        type: res.metadataWarning ? "warning" : "success",
        message: res.metadataWarning
          ? `تم تحديث ${res.accounts.length} حساب إعلاني مع ملاحظة: ${res.metadataWarning}`
          : `تم تحديث قائمة الحسابات الإعلانية المصرح بها (${res.accounts.length} حساب).`,
      });
    } catch (err) {
      setAccountsFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر تحديث الحسابات الإعلانية من TikTok.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectAdvertiser = async (advertiserId: string) => {
    if (isAnyActionBusy) return;
    setBusyAction(`select_${advertiserId}`);
    setAccountsFeedback(null);
    try {
      const res = await requestTikTokApi<{
        selectedAccount: PublicTikTokAdAccount;
        leadPermissionVerified: boolean;
      }>(TIKTOK_API_ENDPOINTS.accounts, {
        method: "POST",
        body: { action: "select", advertiserId },
      });

      setAccounts((prev) =>
        prev.map((acc) => ({
          ...acc,
          isSelected: acc.advertiserId === advertiserId,
        })),
      );
      setConnection((prev) => (prev ? { ...prev, selectedAdvertiserId: advertiserId } : prev));
      setAccountsFeedback({
        type: "success",
        message: `تم تفعيل الحساب الإعلاني «${res.selectedAccount.advertiserName}» والتحقق من صلاحية جلب العملاء المحتملين (12010100).`,
      });

      // Reload stored forms for newly active advertiser
      const formsRes = await requestTikTokApi<{
        forms: PublicTikTokForm[];
        catalogProducts?: MappableCatalogProduct[];
      }>(`${TIKTOK_API_ENDPOINTS.forms}?advertiserId=${encodeURIComponent(advertiserId)}&includeCatalog=1`);
      setForms(Array.isArray(formsRes.forms) ? formsRes.forms : []);
      if (Array.isArray(formsRes.catalogProducts)) {
        setCatalogProducts(formsRes.catalogProducts);
      }
    } catch (err) {
      setAccountsFeedback({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "تعذر اختيار الحساب الإعلاني. تحقق من صلاحية جلب العملاء المحتملين.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleWebhook = async (account: PublicTikTokAdAccount) => {
    if (isAnyActionBusy) return;
    const action = account.webhookSubscribed ? "unsubscribe_webhook" : "subscribe_webhook";
    setBusyAction(`webhook_${account.advertiserId}`);
    setAccountsFeedback(null);
    try {
      const res = await requestTikTokApi<{
        supported: boolean;
        webhookSubscribed: boolean;
        account?: PublicTikTokAdAccount;
        warningMessage?: string | null;
        webhookUrl?: string;
      }>(TIKTOK_API_ENDPOINTS.accounts, {
        method: "POST",
        body: { action, advertiserId: account.advertiserId },
      });

      if (res.webhookUrl) {
        setWebhookUrlDisplay(res.webhookUrl);
      }

      setAccounts((prev) =>
        prev.map((a) =>
          a.advertiserId === account.advertiserId
            ? {
                ...a,
                webhookSubscribed: Boolean(res.webhookSubscribed),
                ...(res.account ?? {}),
              }
            : a,
        ),
      );

      if (res.warningMessage) {
        setAccountsFeedback({
          type: "warning",
          message: res.warningMessage,
        });
      } else {
        setAccountsFeedback({
          type: "success",
          message: res.webhookSubscribed
            ? `تم تسجيل اشتراك Webhook الفوري للحساب «${account.advertiserName}».`
            : `تم إيقاف اشتراك Webhook للحساب «${account.advertiserName}» (تبقى المزامنة اليدوية والمجدولة متاحة).`,
        });
      }
    } catch (err) {
      setAccountsFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر تحديث حالة اشتراك Webhook.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyWebhookUrl = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(webhookUrlDisplay);
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
    }
  };

  // ── Section C Handlers: Forms Refresh, Mapping & Sync Toggle ─────────────
  const handleRefreshForms = async () => {
    if (isAnyActionBusy) return;
    setBusyAction("forms_refresh");
    setFormsFeedback(null);
    try {
      const res = await requestTikTokApi<{
        forms: PublicTikTokForm[];
        createdFormIds?: string[];
        updatedFormIds?: string[];
        removedFormIds?: string[];
        permissionWarnings?: Array<{ formId: string; message: string }>;
      }>(TIKTOK_API_ENDPOINTS.forms, {
        method: "POST",
        body: {
          action: "refresh",
          ...(activeAccount ? { advertiserId: activeAccount.advertiserId } : {}),
        },
      });
      setForms(Array.isArray(res.forms) ? res.forms : []);
      const removedCount = res.removedFormIds?.length ?? 0;
      const warningsCount = res.permissionWarnings?.length ?? 0;
      setFormsFeedback({
        type: removedCount > 0 || warningsCount > 0 ? "warning" : "success",
        message: `تم تحديث النماذج الفورية (${res.forms.length} نموذج)${
          removedCount > 0 ? ` — تم رصد ${removedCount} نموذج محذوف وإيقاف مزامنته تلقائياً` : ""
        }${warningsCount > 0 ? ` — ${warningsCount} تحذير صلاحية لحقول النموذج` : ""}.`,
      });
    } catch (err) {
      setFormsFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر تحديث قائمة النماذج الفورية من TikTok.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const openMappingDialog = (form: PublicTikTokForm) => {
    if (form.status === "DELETED") return;
    setMappingForm(form);
    setSelectedProductId(form.mapping?.productId ?? catalogProducts[0]?.id ?? "");
    setDefaultWilayaCode(form.mapping?.defaultWilayaCode ?? 16);
    setDefaultDeliveryType(form.mapping?.defaultDeliveryType ?? "DOMICILE");
    setAutoCreateOrder(form.mapping?.autoCreateOrder ?? true);
    setMappingSyncEnabled(form.mapping ? form.syncEnabled : true);
    setMappingError(null);
  };

  const handleSaveMapping = async () => {
    if (!mappingForm || isAnyActionBusy) return;
    setMappingError(null);

    let payload: Record<string, unknown>;
    try {
      payload = buildProductMappingPayload({
        formId: mappingForm.formId,
        productId: selectedProductId,
        defaultWilayaCode,
        defaultDeliveryType,
        autoCreateOrder,
        syncEnabled: mappingSyncEnabled,
      }) as unknown as Record<string, unknown>;
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "بيانات الربط غير مكتملة.");
      return;
    }

    setBusyAction(`map_${mappingForm.formId}`);
    try {
      const res = await requestTikTokApi<{ form: PublicTikTokForm }>(TIKTOK_API_ENDPOINTS.forms, {
        method: "POST",
        body: payload,
      });

      setForms((prev) =>
        prev.map((item) => (item.formId === mappingForm.formId ? res.form : item)),
      );
      setFormsFeedback({
        type: "success",
        message: `تم ربط النموذج «${res.form.formName}» بالمنتج «${res.form.mapping?.productName || ""}» بسعر الخادم المعتمد (${formatDzd(res.form.mapping?.productPrice)}).`,
      });
      setMappingForm(null);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "تعذر حفظ ربط المنتج.");
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleFormSync = async (form: PublicTikTokForm, nextEnabled: boolean) => {
    if (isAnyActionBusy) return;
    const guard = canToggleFormSync(form);
    if (nextEnabled && !guard.canEnable) {
      setFormsFeedback({
        type: "warning",
        message: guard.reasonAr || "لا يمكن تفعيل المزامنة لهذا النموذج.",
      });
      return;
    }

    setBusyAction(`toggle_${form.formId}`);
    setFormsFeedback(null);
    try {
      const res = await requestTikTokApi<{ form: PublicTikTokForm }>(TIKTOK_API_ENDPOINTS.forms, {
        method: "POST",
        body: {
          action: "toggle_sync",
          formId: form.formId,
          syncEnabled: nextEnabled,
        },
      });
      setForms((prev) => prev.map((item) => (item.formId === form.formId ? res.form : item)));
      setFormsFeedback({
        type: "success",
        message: nextEnabled
          ? `تم تفعيل المزامنة التلقائية للنموذج «${form.formName}».`
          : `تم إيقاف المزامنة للنموذج «${form.formName}».`,
      });
    } catch (err) {
      setFormsFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر تحديث حالة المزامنة للنموذج.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  // ── Section D & E Handlers: Sync, Retry Failed, Reconcile ─────────────────
  const handleSyncSingleForm = async (form: PublicTikTokForm) => {
    if (isAnyActionBusy || form.status === "DELETED") return;
    setBusyAction(`sync_form_${form.formId}`);
    setSyncFeedback(null);
    try {
      const res = await requestTikTokApi<{ summary: TikTokSyncMetricsSummary }>(
        TIKTOK_API_ENDPOINTS.sync,
        {
          method: "POST",
          body: {
            action: "sync_form",
            formId: form.formId,
            advertiserId: form.advertiserId,
          },
        },
      );
      setLastSyncResult({ label: `مزامنة النموذج: ${form.formName}`, summary: res.summary });
      setSyncFeedback({
        type: res.summary.leadsFailed > 0 ? "warning" : "success",
        message: `اكتملت مزامنة النموذج «${form.formName}»: تم جلب ${res.summary.leadsFetched}، إنشاء ${res.summary.ordersCreated} طلب قيد الانتظار، وتجاهل ${res.summary.duplicatesSkipped} مكرر.`,
      });
      await loadDashboardData();
    } catch (err) {
      const isConflict = Boolean((err as { isConflict?: boolean })?.isConflict);
      setSyncFeedback({
        type: isConflict ? "warning" : "error",
        message: err instanceof Error ? err.message : "تعذر مزامنة النموذج حالياً.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncAllEnabled = async () => {
    if (isAnyActionBusy) return;
    setBusyAction("sync_all");
    setSyncFeedback(null);
    try {
      const res = await requestTikTokApi<{
        formsSynced: number;
        totals: TikTokSyncMetricsSummary;
      }>(TIKTOK_API_ENDPOINTS.sync, {
        method: "POST",
        body: {
          action: "sync_all",
          ...(activeAccount ? { advertiserId: activeAccount.advertiserId } : {}),
        },
      });
      setLastSyncResult({
        label: `مزامنة شاملة (${res.formsSynced} نموذج مفعّل)`,
        summary: res.totals,
      });
      setSyncFeedback({
        type: res.totals.leadsFailed > 0 ? "warning" : "success",
        message: `تمت مزامنة ${res.formsSynced} نموذج مفعّل: تم إنشاء ${res.totals.ordersCreated} طلب جديد بحالة pending وتجاهل ${res.totals.duplicatesSkipped} مكرر.`,
      });
      await refreshLogsAndLeads();
    } catch (err) {
      setSyncFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر تشغيل المزامنة الشاملة.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRetryFailedLeads = async (leadIds?: string[]) => {
    if (isAnyActionBusy) return;
    const actionKey = leadIds?.length === 1 ? `retry_${leadIds[0]}` : "retry_failed";
    setBusyAction(actionKey);
    setSyncFeedback(null);
    try {
      const res = await requestTikTokApi<{ summary: TikTokSyncMetricsSummary }>(
        TIKTOK_API_ENDPOINTS.sync,
        {
          method: "POST",
          body: {
            action: "retry_failed",
            ...(leadIds && leadIds.length > 0 ? { leadIds } : {}),
          },
        },
      );
      setLastSyncResult({
        label: leadIds?.length === 1 ? "إعادة محاولة عميل محدد" : "إعادة محاولة العملاء الفاشلين",
        summary: res.summary,
      });
      setSyncFeedback({
        type: res.summary.leadsFailed > 0 ? "warning" : "success",
        message: `اكتملت إعادة المحاولة: تم إنشاء ${res.summary.ordersCreated} طلب قيد الانتظار، وتبقى ${res.summary.leadsFailed} يحتاج مراجعة.`,
      });
      await refreshLogsAndLeads();
    } catch (err) {
      setSyncFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر إعادة محاولة العملاء الفاشلين.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleHistoricalReconcile = async () => {
    if (isAnyActionBusy) return;
    const lookbackDays = clampReconcileLookbackDays(reconcileDays);
    setBusyAction("reconcile");
    setSyncFeedback(null);
    try {
      const res = await requestTikTokApi<{
        lookbackDays: number;
        formsProcessed: number;
        totals: TikTokSyncMetricsSummary;
      }>(TIKTOK_API_ENDPOINTS.sync, {
        method: "POST",
        body: {
          action: "reconcile",
          lookbackDays,
          ...(activeAccount ? { advertiserId: activeAccount.advertiserId } : {}),
        },
      });
      setLastSyncResult({
        label: `مزامنة تاريخية (${res.lookbackDays} يوم — ${res.formsProcessed} نموذج)`,
        summary: res.totals,
      });
      setSyncFeedback({
        type: res.totals.leadsFailed > 0 ? "warning" : "success",
        message: `اكتملت المزامنة التاريخية لآخر ${res.lookbackDays} يوم (${res.formsProcessed} نموذج): تم جلب ${res.totals.leadsFetched}، إنشاء ${res.totals.ordersCreated} طلب جديد، وتجاهل ${res.totals.duplicatesSkipped} مكرر.`,
      });
      await refreshLogsAndLeads();
    } catch (err) {
      setSyncFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر تشغيل المزامنة التاريخية.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  // ── Section F Handler: Opt-In Telegram Toggle ─────────────────────────────
  const handleToggleTelegramOptIn = async (nextEnabled: boolean) => {
    if (isAnyActionBusy || telegramOptIn.envLocked) return;
    setBusyAction("telegram_opt_in");
    setTelegramFeedback(null);
    try {
      const res = await requestTikTokApi<{ telegramOptIn: TikTokTelegramOptInState }>(
        TIKTOK_API_ENDPOINTS.connect,
        {
          method: "POST",
          body: { action: "set_telegram_opt_in", enabled: nextEnabled },
        },
      );
      setTelegramOptIn(res.telegramOptIn);
      setTelegramFeedback({
        type: "success",
        message: res.telegramOptIn.enabled
          ? "تم تفعيل تنبيهات Telegram الاختيارية لطلبيات TikTok Leads الجديدة فقط. لن يؤثر ذلك على تنبيهات المتجر العادية ولن يؤكد أو يشحن أي طلب تلقائياً."
          : "تم تعطيل تنبيهات Telegram لطلبيات TikTok Leads (الوضع الافتراضي الآمن).",
      });
    } catch (err) {
      setTelegramFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "تعذر تحديث إعداد تنبيهات Telegram لـ TikTok.",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleExpandFields = (formId: string) => {
    setExpandedFormIds((prev) => ({ ...prev, [formId]: !prev[formId] }));
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5" dir="rtl" data-testid="tiktok-ads-integration-panel">
      {/* OAuth Callback Result Banner */}
      {activeCallbackNotice && (
        <FeedbackAlert
          feedback={{
            type: activeCallbackNotice.type,
            title: activeCallbackNotice.titleAr,
            message: activeCallbackNotice.messageAr,
          }}
          onDismiss={() => setDismissedCallbackCode(activeCallbackNotice.code)}
        />
      )}

      {/* Top Load Error Banner */}
      {loadError && (
        <FeedbackAlert
          feedback={{
            type: "error",
            title: "تعذر تحميل بيانات تكامل TikTok Ads",
            message: loadError,
          }}
        />
      )}

      {/* =====================================================================
          SECTION A — CONNECTION MANAGEMENT
         ===================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-bold">
                  إدارة اتصال TikTok Ads
                </CardTitle>
                <ConnectionStatusBadge summary={connectionSummary} />
                {readiness?.sandboxMode && (
                  <Badge
                    variant="outline"
                    className="border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300 text-[10px] font-bold"
                  >
                    وضع Sandbox التجريبي
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                ربط حساب TikTok الإعلاني لجلب استمارات وطلبيات الزبائن تلقائياً إلى متجرك.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadDashboardData()}
              disabled={loading || isAnyActionBusy}
              className="text-xs gap-1.5 h-8"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>تحديث البيانات</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>جاري التحقق من حالة اتصال TikTok Ads على الخادم...</span>
            </div>
          ) : (
            <>
              <FeedbackAlert
                feedback={connectionFeedback}
                onDismiss={() => setConnectionFeedback(null)}
              />

              {/* Missing or Invalid Server Environment Configuration Warning (Names/Codes Only, Zero Secrets) */}
              {readiness && (!readiness.configured || (readiness.configurationErrors?.length ?? 0) > 0) && (
                <Alert
                  className={
                    readiness.configurationStatus === "MISCONFIGURED"
                      ? "border-destructive/50 bg-destructive/10 py-3"
                      : "border-amber-400/60 bg-amber-50/70 dark:bg-amber-950/20 py-3"
                  }
                >
                  <AlertTriangle
                    className={`size-4 ${
                      readiness.configurationStatus === "MISCONFIGURED"
                        ? "text-destructive"
                        : "text-amber-600"
                    }`}
                  />
                  <AlertTitle
                    className={`text-xs font-bold ${
                      readiness.configurationStatus === "MISCONFIGURED"
                        ? "text-destructive"
                        : "text-amber-900 dark:text-amber-200"
                    }`}
                  >
                    {readiness.configurationStatus === "MISCONFIGURED"
                      ? "خطأ في تهيئة متغيرات بيئة TikTok على الخادم (MISCONFIGURED)"
                      : "متغيرات بيئة TikTok على الخادم غير مكتملة"}
                  </AlertTitle>
                  <AlertDescription
                    className={`text-xs space-y-2 mt-1 ${
                      readiness.configurationStatus === "MISCONFIGURED"
                        ? "text-destructive/90"
                        : "text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    <p>
                      يرجى إعداد أو تصحيح المتغيرات التالية في بيئة الخادم (Hostinger / Server Env — يمنع استخدام بادئة{" "}
                      <code className="font-mono">NEXT_PUBLIC_</code>) قبل ربط الحساب:
                    </p>
                    <div className="flex flex-wrap gap-1.5" dir="ltr">
                      {readiness.environmentMode && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] bg-background"
                        >
                          MODE: {readiness.environmentMode}
                        </Badge>
                      )}
                      {readiness.missingKeys.map((envKey) => (
                        <Badge
                          key={envKey}
                          variant="outline"
                          className="font-mono text-[10px] border-amber-500/50 bg-background"
                        >
                          MISSING: {envKey}
                        </Badge>
                      ))}
                      {(readiness.configurationErrors ?? []).map((issue, idx) => (
                        <Badge
                          key={`${issue.key}-${issue.code}-${idx}`}
                          variant="destructive"
                          className="font-mono text-[10px]"
                        >
                          {issue.key}: {issue.code}
                        </Badge>
                      ))}
                      {!readiness.redirectUriValid && (
                        <Badge
                          variant="destructive"
                          className="font-mono text-[10px]"
                        >
                          TIKTOK_REDIRECT_URI (HTTPS required)
                        </Badge>
                      )}
                      {readiness.redirectUriValid && readiness.redirectUriHttps === false && (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] border-amber-500 text-amber-800 dark:text-amber-300"
                        >
                          TIKTOK_REDIRECT_URI is HTTP — TikTok Portal requires HTTPS tunnel/domain
                        </Badge>
                      )}
                      {readiness.apiBaseUrl && (
                        <Badge
                          variant="secondary"
                          className="font-mono text-[10px]"
                        >
                          API: {readiness.apiBaseUrl}
                        </Badge>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Expired / Revoked / Error Banner */}
              {connectionSummary.requiresReconnect && (
                <Alert variant="destructive" className="py-3">
                  <ShieldAlert className="size-4" />
                  <AlertTitle className="text-xs font-bold">
                    {connectionSummary.labelAr} — يتطلب إعادة التفويض
                  </AlertTitle>
                  <AlertDescription className="text-xs leading-relaxed">
                    {connectionSummary.descriptionAr}
                    {connection?.lastError && (
                      <span className="block mt-1 font-mono text-[11px] opacity-90" dir="ltr">
                        {connection.lastError}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Connected Metadata Grid (Zero Tokens / Zero Secrets) */}
              {connection && connection.status !== "disconnected" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-xl border bg-muted/30 p-3.5 text-xs">
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">معرّف تطبيق TikTok (App ID)</div>
                    <div className="font-mono font-semibold text-foreground break-all" dir="ltr">
                      {connection.appId}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">تم الربط بواسطة / التاريخ</div>
                    <div className="font-medium text-foreground">
                      {connection.connectedBy} — {formatAlgiersDateTime(connection.connectedAt)}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">صلاحية الرمز والتجديد</div>
                    <div className="font-medium text-foreground">
                      {connection.tokenExpiresAt
                        ? `ينتهي: ${formatAlgiersDateTime(connection.tokenExpiresAt)}`
                        : "رمز طويل الأمد (بدون انتهاء محدد)"}
                      <span className="block text-[10px] text-muted-foreground">
                        Refresh Token: {connection.hasRefreshToken ? "متوفر ومشفّر" : "غير صادر من TikTok"}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[11px] text-muted-foreground">الصلاحيات الممنوحة (Scopes)</div>
                    <div className="flex flex-wrap gap-1 pt-0.5" dir="ltr">
                      {connection.scopes.length > 0 ? (
                        connection.scopes.map((scope) => (
                          <Badge key={String(scope)} variant="secondary" className="font-mono text-[10px]">
                            {String(scope)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground flex items-center gap-3">
                  <Lock className="size-4 shrink-0 text-muted-foreground" />
                  <p className="leading-relaxed">
                    اضغط على زر «ربط حساب TikTok Business» لتوجيهك بأمان إلى منصة تيك توك لتأكيد منح الصلاحيات للمتجر.
                  </p>
                </div>
              )}

              {/* Connection Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleStartConnect}
                    disabled={!readiness?.configured || isAnyActionBusy}
                    className="text-xs gap-1.5 h-9"
                  >
                    {busyAction === "connect_start" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Link2 className="size-3.5" />
                    )}
                    <span>
                      {connection && connection.status !== "disconnected"
                        ? "إعادة ربط حساب TikTok"
                        : "ربط حساب TikTok Business"}
                    </span>
                  </Button>

                  {connection && connection.status !== "disconnected" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDisconnectOpen(true)}
                      disabled={isAnyActionBusy}
                      className="text-xs gap-1.5 h-9 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Unlink className="size-3.5" />
                      <span>فصل حساب TikTok</span>
                    </Button>
                  )}
                </div>

                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Lock className="size-3" />
                  <span>اتصال محمي ومشفر بالكامل</span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* =====================================================================
          SECTION B — ADVERTISER ACCOUNTS & WEBHOOK CONTROLS
         ===================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold">
                الحسابات الإعلانية (TikTok Ad Accounts)
              </CardTitle>
              <CardDescription className="text-xs">
                اختر الحساب الإعلاني النشط الذي تطلق منه الإعلانات لاستقبال الطلبيات منه.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshAccounts}
              disabled={
                !connection ||
                connection.status !== "connected" ||
                isAnyActionBusy
              }
              className="text-xs gap-1.5 h-8"
            >
              {busyAction === "accounts_refresh" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span>تحديث الحسابات</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <FeedbackAlert
            feedback={accountsFeedback}
            onDismiss={() => setAccountsFeedback(null)}
          />

          {/* Canonical Webhook Endpoint Bar */}
          <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5 min-w-0">
              <div className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
                <Radio className="size-3.5 text-primary" />
                <span>رابط الـ Webhook لاستقبال الطلبيات الفورية:</span>
              </div>
              <div className="font-mono text-[11px] text-muted-foreground break-all" dir="ltr">
                {webhookUrlDisplay}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyWebhookUrl}
              className="text-xs gap-1.5 h-8 shrink-0 self-start sm:self-center"
            >
              {copiedWebhook ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              <span>{copiedWebhook ? "تم النسخ" : "نسخ الرابط"}</span>
            </Button>
          </div>

          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 px-4 text-center space-y-2">
              <p className="text-xs font-medium text-foreground">
                لا توجد حسابات إعلانية مخزنة حالياً
              </p>
              <p className="text-[11px] text-muted-foreground">
                {connection?.status === "connected"
                  ? "اضغط على «تحديث الحسابات» لجلب الحسابات الإعلانية المصرح بها من TikTok Business."
                  : "قم بربط حساب TikTok Business أولاً لعرض واختيار الحساب الإعلاني النشط."}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right text-xs">الحساب الإعلاني</TableHead>
                    <TableHead className="text-right text-xs">المعرّف (ID)</TableHead>
                    <TableHead className="text-right text-xs">الحالة</TableHead>
                    <TableHead className="text-right text-xs">العملة / التوقيت</TableHead>
                    <TableHead className="text-right text-xs">Webhook</TableHead>
                    <TableHead className="text-left text-xs">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((acc) => {
                    const isRevoked = acc.accountStatus === "STATUS_REVOKED";
                    const isSelecting = busyAction === `select_${acc.advertiserId}`;
                    const isTogglingWebhook = busyAction === `webhook_${acc.advertiserId}`;

                    return (
                      <TableRow
                        key={acc.advertiserId}
                        className={acc.isSelected ? "bg-emerald-50/40 dark:bg-emerald-950/15" : ""}
                      >
                        <TableCell className="text-xs font-semibold">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{acc.advertiserName}</span>
                            {acc.isSelected && (
                              <Badge className="bg-emerald-600 text-white text-[10px]">
                                الحساب النشط
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs" dir="ltr">
                          {acc.advertiserId}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant={isRevoked ? "destructive" : "outline"}
                            className="font-mono text-[10px]"
                          >
                            {acc.accountStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="font-mono">{acc.currency}</span>
                          <span className="mx-1">·</span>
                          <span className="font-mono text-[11px]">{acc.timezone}</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {acc.webhookSubscribed ? (
                            <Badge className="bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px]">
                              Webhook مفعّل
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              مزامنة Polling فقط
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-left">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant={acc.isSelected ? "secondary" : "default"}
                              disabled={
                                isRevoked ||
                                acc.isSelected ||
                                connection?.status !== "connected" ||
                                isAnyActionBusy
                              }
                              onClick={() => void handleSelectAdvertiser(acc.advertiserId)}
                              className="text-[11px] h-7 px-2.5 gap-1"
                            >
                              {isSelecting && <Loader2 className="size-3 animate-spin" />}
                              <span>{acc.isSelected ? "مفعّل حالياً" : "اختيار كنشط"}</span>
                            </Button>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                isRevoked ||
                                connection?.status !== "connected" ||
                                isAnyActionBusy
                              }
                              onClick={() => void handleToggleWebhook(acc)}
                              className="text-[11px] h-7 px-2.5 gap-1"
                            >
                              {isTogglingWebhook && <Loader2 className="size-3 animate-spin" />}
                              <span>{acc.webhookSubscribed ? "إيقاف Webhook" : "تفعيل Webhook"}</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================================
          SECTION C — INSTANT FORMS & REAL ORVA CATALOG PRODUCT MAPPING
         ===================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold">
                النماذج الفورية وربط منتجات كتالوج ORVA (Instant Forms)
              </CardTitle>
              <CardDescription className="text-xs">
                اربط كل نموذج فوري بمنتج حقيقي من كتالوج ORVA. يتم اعتماد اسم المنتج والسعر بالدينار الجزائري من الخادم حصراً.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshForms}
              disabled={
                !connection ||
                connection.status !== "connected" ||
                !activeAccount ||
                isAnyActionBusy
              }
              className="text-xs gap-1.5 h-8"
            >
              {busyAction === "forms_refresh" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              <span>تحديث النماذج</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <FeedbackAlert feedback={formsFeedback} onDismiss={() => setFormsFeedback(null)} />

          {/* Search & Filter Controls */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="size-3.5 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                value={formSearch}
                onChange={(e) => setFormSearch(e.target.value)}
                placeholder="بحث باسم النموذج أو المعرّف أو المنتج المربوط..."
                className="pr-8 h-8 text-xs"
                aria-label="بحث في النماذج الفورية"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: `الكل (${forms.length})` },
                  {
                    id: "mapped",
                    label: `مربوط (${forms.filter((f) => Boolean(f.mapping) && f.status !== "DELETED").length})`,
                  },
                  {
                    id: "unmapped",
                    label: `غير مربوط (${forms.filter((f) => !f.mapping && f.status !== "DELETED").length})`,
                  },
                  {
                    id: "sync_enabled",
                    label: `مزامنة مفعّلة (${enabledFormsCount})`,
                  },
                  {
                    id: "deleted",
                    label: `محذوف (${forms.filter((f) => f.status === "DELETED").length})`,
                  },
                ] as Array<{ id: TikTokFormsFilterMode; label: string }>
              ).map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  size="sm"
                  variant={formFilter === tab.id ? "default" : "outline"}
                  onClick={() => setFormFilter(tab.id)}
                  className="text-[11px] h-7 px-2.5"
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Forms List */}
          {paginatedForms.totalItems === 0 ? (
            <div className="rounded-xl border border-dashed py-8 px-4 text-center space-y-2">
              <FileText className="size-6 mx-auto text-muted-foreground/60" />
              <p className="text-xs font-medium text-foreground">
                {forms.length === 0
                  ? "لا توجد نماذج فورية محفوظة لهذا الحساب بعد"
                  : "لا توجد نماذج مطابقة لمعايير البحث أو التصفية"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {forms.length === 0
                  ? "اختر الحساب الإعلاني النشط أعلاه ثم اضغط «تحديث النماذج» لجلب النماذج الفورية من TikTok."
                  : "جرّب مسح نص البحث أو اختيار «الكل»."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedForms.items.map((form) => {
                const isDeleted = form.status === "DELETED";
                const syncGuard = canToggleFormSync(form);
                const isExpanded = Boolean(expandedFormIds[form.formId]);
                const isFormBusy =
                  busyAction === `toggle_${form.formId}` ||
                  busyAction === `sync_form_${form.formId}` ||
                  busyAction === `map_${form.formId}`;

                return (
                  <div
                    key={form.formId}
                    data-form-id={form.formId}
                    className={`rounded-xl border p-3.5 space-y-3 transition-colors ${
                      isDeleted
                        ? "border-destructive/40 bg-destructive/5 opacity-85"
                        : !form.mapping
                          ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10"
                          : "bg-card"
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-foreground break-words">
                            {form.formName}
                          </span>
                          <FormStatusBadge status={form.status} />
                          {!form.mapping && !isDeleted && (
                            <Badge
                              variant="outline"
                              className="border-amber-500 text-amber-800 bg-amber-100/80 dark:bg-amber-950/50 dark:text-amber-300 text-[10px] font-bold gap-1"
                            >
                              <AlertTriangle className="size-3" />
                              <span>غير مربوط بمنتج</span>
                            </Badge>
                          )}
                          {form.syncEnabled && !isDeleted && form.mapping && (
                            <Badge className="bg-emerald-600 text-white text-[10px] font-bold">
                              المزامنة مفعّلة
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="font-mono" dir="ltr">
                            Form ID: {form.formId}
                          </span>
                          <span>العملاء المستوردون: {form.totalLeadsImported}</span>
                          <span>آخر مزامنة: {formatAlgiersDateTime(form.lastSyncedAt)}</span>
                        </div>
                      </div>

                      {/* Per-Form Controls */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
                          <Label
                            htmlFor={`sync-switch-${form.formId}`}
                            className="text-[11px] font-medium cursor-pointer"
                          >
                            المزامنة
                          </Label>
                          <Switch
                            id={`sync-switch-${form.formId}`}
                            dir="ltr"
                            checked={form.syncEnabled}
                            disabled={
                              isAnyActionBusy ||
                              (!form.syncEnabled && !syncGuard.canEnable) ||
                              isDeleted
                            }
                            onCheckedChange={(checked) =>
                              void handleToggleFormSync(form, Boolean(checked))
                            }
                          />
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant={form.mapping ? "outline" : "default"}
                          disabled={isDeleted || isAnyActionBusy}
                          onClick={() => openMappingDialog(form)}
                          className="text-xs h-8 gap-1.5"
                        >
                          <Package className="size-3.5" />
                          <span>{form.mapping ? "تعديل الربط" : "ربط بمنتج ORVA"}</span>
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={
                            isDeleted ||
                            !connection ||
                            connection.status !== "connected" ||
                            isAnyActionBusy
                          }
                          onClick={() => void handleSyncSingleForm(form)}
                          className="text-xs h-8 gap-1.5"
                        >
                          {busyAction === `sync_form_${form.formId}` ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                          <span>مزامنة الآن</span>
                        </Button>
                      </div>
                    </div>

                    {/* Authoritative Mapped Product Summary OR Clear Unmapped / Deleted Notice */}
                    {isDeleted ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive flex items-center gap-2">
                        <XCircle className="size-3.5 shrink-0" />
                        <span>
                          هذا النموذج لم يعد موجوداً على TikTok (محذوف). تم تعطيل المزامنة تلقائياً مع الحفاظ على سجل العملاء والطلبيات السابقة.
                        </span>
                      </div>
                    ) : form.mapping ? (
                      <div className="rounded-lg border bg-muted/35 p-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                        <div>
                          <div className="text-[10px] text-muted-foreground">منتج ORVA المعتمد (من الكتالوج)</div>
                          <div className="font-bold text-foreground">{form.mapping.productName}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">سعر البيع المعتمد على الخادم</div>
                          <div className="font-bold text-emerald-700 dark:text-emerald-400">
                            {formatDzd(form.mapping.productPrice)}
                            <span className="text-[10px] font-mono text-muted-foreground mr-1.5">
                              ({form.mapping.packId})
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">الولاية وطريقة التوصيل الافتراضية</div>
                          <div className="font-medium text-foreground">
                            {getWilayaLabelAr(form.mapping.defaultWilayaCode)} ·{" "}
                            {form.mapping.defaultDeliveryType === "STOP_DESK"
                              ? "مكتب (Stop Desk)"
                              : "للمنزل (Domicile)"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">إنشاء طلب Pending تلقائياً</div>
                          <div className="font-medium text-foreground">
                            {form.mapping.autoCreateOrder
                              ? "مفعّل (status = pending, in_redex = false)"
                              : "معطّل (حفظ العميل فقط)"}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-amber-400/50 bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>
                          {syncGuard.reasonAr ||
                            "هذا النموذج غير مربوط بمنتج من كتالوج ORVA. العملاء الواردون سيُحفظون بحالة unmapped_form دون إنشاء طلب حتى يتم الربط."}
                        </span>
                      </div>
                    )}

                    {/* Expandable Fields Schema Preview */}
                    {form.fields.length > 0 && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleExpandFields(form.formId)}
                          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 cursor-pointer"
                        >
                          {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                          <span>حقول النموذج الفوري ({form.fields.length} حقل)</span>
                        </button>
                        {isExpanded && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {form.fields.map((field, idx) => (
                              <Badge
                                key={`${form.formId}-field-${idx}`}
                                variant="secondary"
                                className="text-[10px] gap-1"
                              >
                                <span>{field.field_name}</span>
                                <span className="font-mono opacity-70">({field.field_type})</span>
                                {field.required && <span className="text-destructive">*</span>}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {isFormBusy && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Loader2 className="size-3 animate-spin" />
                        <span>جاري تنفيذ الإجراء...</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Client-Side Pagination Controls */}
              {paginatedForms.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs">
                  <div className="text-muted-foreground text-[11px]">
                    عرض {paginatedForms.startIndex + 1}–{paginatedForms.endIndex} من أصل{" "}
                    {paginatedForms.totalItems} نموذج
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={paginatedForms.page <= 1}
                      onClick={() => setFormsPage((p) => Math.max(1, p - 1))}
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <ChevronRight className="size-3.5" />
                      <span>السابق</span>
                    </Button>
                    <span className="px-2 text-[11px] font-medium">
                      صفحة {paginatedForms.page} / {paginatedForms.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={paginatedForms.page >= paginatedForms.totalPages}
                      onClick={() =>
                        setFormsPage((p) => Math.min(paginatedForms.totalPages, p + 1))
                      }
                      className="h-7 px-2 text-xs gap-1"
                    >
                      <span>التالي</span>
                      <ChevronLeft className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================================
          SECTION D — SYNCHRONIZATION CONTROLS
         ===================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-bold">
            التحكم في المزامنة والاسترداد التاريخي (Synchronization)
          </CardTitle>
          <CardDescription className="text-xs">
            تشغيل مزامنة يدوية لجميع النماذج المفعّلة، إعادة معالجة العملاء الفاشلين، أو إجراء مزامنة تاريخية ضمن الحد الرسمي (حتى 90 يوماً).
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <FeedbackAlert feedback={syncFeedback} onDismiss={() => setSyncFeedback(null)} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* Sync All Enabled Forms */}
            <div className="rounded-xl border p-3.5 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <RefreshCw className="size-3.5 text-primary" />
                  <span>مزامنة جميع النماذج المفعّلة</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  يجلب العملاء الجدد من كافة النماذج المربوطة والمفعّلة ({enabledFormsCount} نموذج) مع منع التكرار تلقائياً.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleSyncAllEnabled}
                disabled={
                  !connection ||
                  connection.status !== "connected" ||
                  !activeAccount ||
                  enabledFormsCount === 0 ||
                  isAnyActionBusy
                }
                className="w-full text-xs h-8 gap-1.5"
              >
                {busyAction === "sync_all" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                <span>مزامنة الكل الآن</span>
              </Button>
            </div>

            {/* Retry Failed Leads */}
            <div className="rounded-xl border p-3.5 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <RotateCcw className="size-3.5 text-amber-600" />
                  <span>إعادة محاولة العملاء الفاشلين</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  يعيد محاولة إنشاء الطلبيات للعملاء القابلين للاسترداد ({retryableLeadsCount} عميل بحالة unmapped_form أو order_creation_failed).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleRetryFailedLeads()}
                disabled={retryableLeadsCount === 0 || isAnyActionBusy}
                className="w-full text-xs h-8 gap-1.5"
              >
                {busyAction === "retry_failed" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                <span>إعادة المحاولة ({retryableLeadsCount})</span>
              </Button>
            </div>

            {/* Historical Reconciliation (<= 90 days) */}
            <div className="rounded-xl border p-3.5 space-y-2.5 flex flex-col justify-between">
              <div className="space-y-1">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <History className="size-3.5 text-blue-600" />
                  <span>مزامنة تاريخية (حتى 90 يوماً)</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  يسترجع أي عملاء فائتين خلال الفترة المحددة عبر API المزامنة غير المتزامنة دون إنشاء أي تكرار.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <NativeSelect
                  value={String(reconcileDays)}
                  onChange={(e) =>
                    setReconcileDays(clampReconcileLookbackDays(Number(e.target.value)))
                  }
                  disabled={isAnyActionBusy}
                  className="w-28 text-xs"
                  aria-label="فترة المزامنة التاريخية بالأيام"
                >
                  {RECONCILE_LOOKBACK_OPTIONS.map((days) => (
                    <NativeSelectOption key={days} value={String(days)}>
                      آخر {days} يوم
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleHistoricalReconcile}
                  disabled={
                    !connection ||
                    connection.status !== "connected" ||
                    !activeAccount ||
                    isAnyActionBusy
                  }
                  className="flex-1 text-xs h-8 gap-1.5"
                >
                  {busyAction === "reconcile" ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <History className="size-3.5" />
                  )}
                  <span>استرداد</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Last Sync Run Metrics Strip */}
          {lastSyncResult && (
            <div className="rounded-xl border bg-muted/35 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-foreground">
                  نتيجة آخر تشغيل: {lastSyncResult.label}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {lastSyncResult.summary.durationMs} ms
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-center">
                <div className="rounded-lg border bg-background p-2">
                  <div className="text-[10px] text-muted-foreground">تم جلبهم</div>
                  <div className="text-sm font-bold">{lastSyncResult.summary.leadsFetched}</div>
                </div>
                <div className="rounded-lg border bg-background p-2">
                  <div className="text-[10px] text-muted-foreground">تم استيرادهم</div>
                  <div className="text-sm font-bold">{lastSyncResult.summary.leadsImported}</div>
                </div>
                <div className="rounded-lg border bg-background p-2">
                  <div className="text-[10px] text-muted-foreground">طلبيات Pending جديدة</div>
                  <div className="text-sm font-bold text-emerald-600">
                    {lastSyncResult.summary.ordersCreated}
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-2">
                  <div className="text-[10px] text-muted-foreground">مكررة (تم تجاهلها)</div>
                  <div className="text-sm font-bold text-muted-foreground">
                    {lastSyncResult.summary.duplicatesSkipped}
                  </div>
                </div>
                <div className="rounded-lg border bg-background p-2">
                  <div className="text-[10px] text-muted-foreground">فشلت / تحتاج مراجعة</div>
                  <div className="text-sm font-bold text-destructive">
                    {lastSyncResult.summary.leadsFailed}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================================
          SECTION E — SYNCHRONIZATION LOGS & LEAD RECOVERY
         ===================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold">
                سجل المزامنة واسترداد العملاء (Logs & Lead Recovery)
              </CardTitle>
              <CardDescription className="text-xs">
                ملخص حالات العملاء المحتملين (بأرقام هواتف مقنّعة لحماية الخصوصية)، شرح أسباب التعثر، وسجل عمليات المزامنة.
              </CardDescription>
            </div>
            <a
              href="/dashboard/ecommerce/#orders"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <span>عرض طلبيات TikTok في جدول الطلبيات</span>
              <ExternalLink className="size-3.5" />
            </a>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Lead Status KPI Strip */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl border p-3 bg-emerald-50/40 dark:bg-emerald-950/15">
              <div className="text-[11px] text-muted-foreground">طلبيات أُنشئت (Pending)</div>
              <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                {leadStats.byStatus.order_created ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-3 bg-muted/25">
              <div className="text-[11px] text-muted-foreground">مكررة (تم منعها)</div>
              <div className="text-lg font-bold text-foreground">
                {leadStats.byStatus.duplicate_skipped ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-3 bg-amber-50/40 dark:bg-amber-950/15">
              <div className="text-[11px] text-muted-foreground">هاتف غير صالح</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                {leadStats.byStatus.invalid_phone ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-3 bg-amber-50/40 dark:bg-amber-950/15">
              <div className="text-[11px] text-muted-foreground">نموذج غير مربوط</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                {leadStats.byStatus.unmapped_form ?? 0}
              </div>
            </div>
            <div className="rounded-xl border p-3 bg-destructive/5">
              <div className="text-[11px] text-muted-foreground">فشل إنشاء الطلب</div>
              <div className="text-lg font-bold text-destructive">
                {leadStats.byStatus.order_creation_failed ?? 0}
              </div>
            </div>
          </div>

          {/* Recoverable Leads Table (Masked Phone Numbers ONLY) */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold text-foreground">
                العملاء المحتملون الذين يحتاجون مراجعة أو إعادة محاولة ({recoverableLeads.length})
              </h4>
              <span className="text-[11px] text-muted-foreground">
                تُعرض أرقام الهواتف بصيغة مقنّعة فقط لحماية بيانات العملاء
              </span>
            </div>

            {recoverableLeads.length === 0 ? (
              <div className="rounded-xl border border-dashed py-6 px-4 text-center text-xs text-muted-foreground">
                لا يوجد عملاء متعثرون أو بانتظار الاسترداد حالياً.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">العميل / الهاتف المقنّع</TableHead>
                      <TableHead className="text-right text-xs">النموذج / الولاية</TableHead>
                      <TableHead className="text-right text-xs">الحالة وسبب التعثر</TableHead>
                      <TableHead className="text-right text-xs">المحاولات / التوقيت</TableHead>
                      <TableHead className="text-left text-xs">الإجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recoverableLeads.map((lead) => {
                      const meta = getLeadFailureExplanation(lead.syncStatus);
                      const isRetryingOne = busyAction === `retry_${lead.externalLeadId}`;

                      return (
                        <TableRow key={lead.id || lead.externalLeadId}>
                          <TableCell className="text-xs align-top">
                            <div className="font-semibold text-foreground">
                              {lead.customerName || "عميل بدون اسم"}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                              {lead.maskedPhone || "رقم غير صالح / غير متوفر"}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs align-top">
                            <div className="font-mono text-[11px]" dir="ltr">
                              {lead.formId}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {lead.wilayaName || getWilayaLabelAr(lead.wilayaCode)}
                              {lead.mappedProductName ? ` · ${lead.mappedProductName}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs align-top max-w-sm whitespace-normal">
                            <div className="space-y-1">
                              <Badge
                                variant={meta.tone === "error" ? "destructive" : "outline"}
                                className={`text-[10px] font-bold ${
                                  meta.tone === "warning"
                                    ? "border-amber-400 text-amber-800 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300"
                                    : ""
                                }`}
                              >
                                {meta.labelAr}
                              </Badge>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {meta.explanationAr}
                              </p>
                              <p className="text-[10px] text-foreground/80">
                                {meta.actionHintAr}
                              </p>
                              {lead.errorMessage && (
                                <p className="text-[10px] font-mono text-destructive/90 break-words" dir="ltr">
                                  {lead.errorMessage}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs align-top text-muted-foreground">
                            <div>محاولات: {lead.retryCount}</div>
                            <div className="text-[10px]">
                              {formatAlgiersDateTime(lead.importedAt)}
                            </div>
                          </TableCell>
                          <TableCell className="text-left align-top">
                            <div className="flex flex-col items-end gap-1.5">
                              {meta.retryable && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isAnyActionBusy}
                                  onClick={() =>
                                    void handleRetryFailedLeads([lead.externalLeadId])
                                  }
                                  className="text-[11px] h-7 px-2.5 gap-1"
                                >
                                  {isRetryingOne ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="size-3" />
                                  )}
                                  <span>إعادة المحاولة</span>
                                </Button>
                              )}
                              {lead.orderId && (
                                <a
                                  href={`/dashboard/ecommerce/?orderId=${encodeURIComponent(lead.orderId)}#orders`}
                                  className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  <span>فتح الطلب</span>
                                  <ExternalLink className="size-3" />
                                </a>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Sync Audit Logs Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-muted-foreground" />
              <span>سجل عمليات المزامنة الأخيرة ({logs.length})</span>
            </h4>

            {logs.length === 0 ? (
              <div className="rounded-xl border border-dashed py-6 px-4 text-center text-xs text-muted-foreground">
                لم تُسجّل أي عملية مزامنة بعد.
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right text-xs">التاريخ</TableHead>
                      <TableHead className="text-right text-xs">المصدر</TableHead>
                      <TableHead className="text-right text-xs">الحالة</TableHead>
                      <TableHead className="text-right text-xs">النموذج</TableHead>
                      <TableHead className="text-right text-xs">النتائج (جلب / طلب / مكرر / فشل)</TableHead>
                      <TableHead className="text-right text-xs">المدة</TableHead>
                      <TableHead className="text-right text-xs">ملاحظات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {formatAlgiersDateTime(log.startedAt)}
                        </TableCell>
                        <TableCell className="text-xs">
                          <TriggerSourceBadge source={log.triggerSource} />
                        </TableCell>
                        <TableCell className="text-xs">
                          <SyncRunStatusBadge status={log.status} />
                        </TableCell>
                        <TableCell className="font-mono text-[11px]" dir="ltr">
                          {log.formId || "الكل"}
                        </TableCell>
                        <TableCell className="text-xs font-mono" dir="ltr">
                          {log.leadsFetched} /{" "}
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                            {log.ordersCreated}
                          </span>{" "}
                          / {log.duplicatesSkipped} /{" "}
                          <span className={log.leadsFailed > 0 ? "text-destructive font-bold" : ""}>
                            {log.leadsFailed}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                          {log.durationMs} ms
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground max-w-xs whitespace-normal">
                          {log.errorMessage ? (
                            <span className="text-destructive">{log.errorMessage}</span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* =====================================================================
          SECTION F — OPT-IN TELEGRAM NOTIFICATIONS FOR TIKTOK LEADS
         ===================================================================== */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  <span>تنبيهات Telegram الاختيارية لعملاء TikTok</span>
                </CardTitle>
                <Badge
                  variant={telegramOptIn.enabled ? "default" : "outline"}
                  className="text-[10px] font-bold"
                >
                  {telegramOptIn.enabled ? "مفعّل (اختيارياً)" : "معطّل افتراضياً"}
                </Badge>
                {telegramOptIn.envLocked && (
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    مقفل عبر متغير البيئة
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                خيار مستقل تماماً عن تنبيهات طلبيات المتجر العادية، ويعيد استخدام بوت تيليجرام المعتمد مسبقاً دون تعديل سلوك الدفع.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 px-3 py-2">
              <Label
                htmlFor="tiktok-telegram-opt-in-switch"
                className="text-xs font-bold cursor-pointer"
              >
                {telegramOptIn.enabled ? "تنبيهات TikTok مفعّلة" : "تنبيهات TikTok معطّلة"}
              </Label>
              <Switch
                id="tiktok-telegram-opt-in-switch"
                dir="ltr"
                checked={telegramOptIn.enabled}
                disabled={telegramOptIn.envLocked || isAnyActionBusy}
                onCheckedChange={(checked) => void handleToggleTelegramOptIn(Boolean(checked))}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <FeedbackAlert
            feedback={telegramFeedback}
            onDismiss={() => setTelegramFeedback(null)}
          />

          <div className="rounded-xl border bg-muted/30 p-3.5 text-xs space-y-2 leading-relaxed">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">جاهزية بوت Telegram الحالي للمتجر:</span>
              <Badge
                variant={telegramOptIn.existingTelegramConfigured ? "default" : "outline"}
                className={
                  telegramOptIn.existingTelegramConfigured
                    ? "bg-emerald-600 text-white text-[10px]"
                    : "text-[10px]"
                }
              >
                {telegramOptIn.existingTelegramConfigured
                  ? "بيانات البوت مهيأة على الخادم"
                  : "غير مهيأ بعد — اضبطه من تبويب Notifications (Telegram)"}
              </Badge>
            </div>

            {telegramOptIn.envLocked && (
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                هذه الحالة مقفلة حالياً عبر متغير البيئة{" "}
                <code className="font-mono">TIKTOK_TELEGRAM_ALERTS_ENABLED</code> على الخادم.
              </p>
            )}

            <p className="text-[11px] text-muted-foreground">
              <strong>تنبيه تشغيلي مهم:</strong> إرسال تنبيهات Telegram لطلبيات TikTok هو إشعار إعلامي غير معطّل (بمهلة قصوى 2500ms ولا يُرسل للعملاء المكررين أو غير الصالحين).{" "}
              <strong className="text-foreground">
                تفعيل هذا الخيار لا يقوم أبداً بتأكيد الطلب ولا بإرساله إلى شركة التوصيل Redex.
              </strong>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* =====================================================================
          DISCONNECT CONFIRMATION DIALOG
         ===================================================================== */}
      <Dialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader className="pr-7">
            <DialogTitle className="text-right">تأكيد فصل حساب TikTok Business</DialogTitle>
            <DialogDescription className="text-right text-xs leading-relaxed">
              سيتم إلغاء التفويض لدى TikTok وحذف رموز الوصول المشفرة من خادم ORVA فوراً. ستبقى جميع الطلبيات السابقة وسجلات العملاء محفوظة بالكامل دون حذف.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDisconnect}
              disabled={isAnyActionBusy}
              className="text-xs gap-1.5"
            >
              {busyAction === "disconnect" && <Loader2 className="size-3.5 animate-spin" />}
              <span>تأكيد الفصل النهائي</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDisconnectOpen(false)}
              disabled={isAnyActionBusy}
              className="text-xs"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================================
          PRODUCT MAPPING DIALOG (AUTHORITATIVE SERVER ORVA CATALOG ONLY)
         ===================================================================== */}
      <Dialog
        open={Boolean(mappingForm)}
        onOpenChange={(open) => {
          if (!open && !isAnyActionBusy) setMappingForm(null);
        }}
      >
        <DialogContent className="sm:max-w-xl" dir="rtl">
          <DialogHeader className="pr-7">
            <DialogTitle className="text-right">
              ربط النموذج الفوري بمنتج من كتالوج ORVA
            </DialogTitle>
            <DialogDescription className="text-right text-xs">
              {mappingForm ? (
                <>
                  النموذج: <strong>{mappingForm.formName}</strong>{" "}
                  <span className="font-mono" dir="ltr">
                    ({mappingForm.formId})
                  </span>
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1 text-xs">
            {mappingError && (
              <FeedbackAlert
                feedback={{ type: "error", message: mappingError }}
                onDismiss={() => setMappingError(null)}
              />
            )}

            {/* Real ORVA Catalog Product Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="tiktok-map-product" className="text-xs font-bold">
                المنتج المعتمد من كتالوج ORVA
              </Label>
              {catalogProducts.length === 0 ? (
                <Alert variant="destructive" className="py-2.5 text-xs">
                  <AlertCircle className="size-4" />
                  <AlertDescription className="text-xs">
                    لا توجد منتجات نشطة متاحة للربط في كتالوج ORVA حالياً. أضف منتجاً نشطاً في قسم المنتجات أولاً.
                  </AlertDescription>
                </Alert>
              ) : (
                <NativeSelect
                  id="tiktok-map-product"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full text-xs"
                >
                  <NativeSelectOption value="">— اختر منتجاً من كتالوج ORVA —</NativeSelectOption>
                  {catalogProducts.map((product) => (
                    <NativeSelectOption key={product.id} value={product.id}>
                      {product.title} — {formatDzd(product.sellingPrice)} (المخزون:{" "}
                      {product.stockQuantity})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </div>

            {/* Read-Only Authoritative Server Price Preview */}
            {selectedCatalogProduct && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-foreground">{selectedCatalogProduct.title}</span>
                  <Badge className="bg-emerald-600 text-white text-xs font-bold">
                    {formatDzd(selectedCatalogProduct.sellingPrice)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="font-mono" dir="ltr">
                    Pack / Slug: {selectedCatalogProduct.packId}
                  </span>
                  <span>المخزون المتاح: {selectedCatalogProduct.stockQuantity}</span>
                  <span>الحالة: {selectedCatalogProduct.status}</span>
                </div>
                <p className="text-[10px] text-emerald-800 dark:text-emerald-300">
                  يتم قراءة اسم المنتج وسعر البيع المعتمد مباشرة من قاعدة بيانات ORVA على الخادم عند حفظ الربط وعند إنشاء كل طلب — لا يرسل المتصفح أي سعر.
                </p>
              </div>
            )}

            {/* Default Wilaya & Delivery Type */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tiktok-map-wilaya" className="text-xs font-bold">
                  الولاية الافتراضية (في حال غيابها بالنموذج)
                </Label>
                <NativeSelect
                  id="tiktok-map-wilaya"
                  value={String(defaultWilayaCode)}
                  onChange={(e) => setDefaultWilayaCode(Number(e.target.value))}
                  className="w-full text-xs"
                >
                  {ALGERIA_58_WILAYAS.map((w) => (
                    <NativeSelectOption key={w.code} value={String(w.code)}>
                      {String(w.code).padStart(2, "0")} — {w.nameAr} ({w.nameFr})
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tiktok-map-delivery" className="text-xs font-bold">
                  طريقة التوصيل الافتراضية
                </Label>
                <NativeSelect
                  id="tiktok-map-delivery"
                  value={defaultDeliveryType}
                  onChange={(e) =>
                    setDefaultDeliveryType(
                      e.target.value === "STOP_DESK" ? "STOP_DESK" : "DOMICILE",
                    )
                  }
                  className="w-full text-xs"
                >
                  <NativeSelectOption value="DOMICILE">توصيل للمنزل (DOMICILE)</NativeSelectOption>
                  <NativeSelectOption value="STOP_DESK">توصيل للمكتب (STOP_DESK)</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>

            {/* Southern Wilaya / Zone-5 Stop-Desk Fallback Warning */}
            {wilayaDeliveryWarning && (
              <Alert className="border-amber-400/60 bg-amber-50/80 dark:bg-amber-950/30 py-2.5 text-xs">
                <AlertTriangle className="size-4 text-amber-600" />
                <AlertDescription className="text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                  {wilayaDeliveryWarning}
                </AlertDescription>
              </Alert>
            )}

            {/* Auto-Create Pending Order & Enable Sync Switches */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-2.5">
                <div className="space-y-0.5 pl-2">
                  <Label htmlFor="tiktok-map-autocreate" className="text-xs font-semibold cursor-pointer">
                    إنشاء طلب Pending تلقائياً
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    يحفظ الطلب بحالة pending فقط دون شحن لـ Redex
                  </p>
                </div>
                <Switch
                  id="tiktok-map-autocreate"
                  dir="ltr"
                  checked={autoCreateOrder}
                  onCheckedChange={(checked) => setAutoCreateOrder(Boolean(checked))}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-2.5">
                <div className="space-y-0.5 pl-2">
                  <Label htmlFor="tiktok-map-enable-sync" className="text-xs font-semibold cursor-pointer">
                    تفعيل مزامنة النموذج
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    تضمين هذا النموذج في المزامنة الفورية والمجدولة
                  </p>
                </div>
                <Switch
                  id="tiktok-map-enable-sync"
                  dir="ltr"
                  checked={mappingSyncEnabled}
                  onCheckedChange={(checked) => setMappingSyncEnabled(Boolean(checked))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              size="sm"
              onClick={handleSaveMapping}
              disabled={!selectedProductId || catalogProducts.length === 0 || isAnyActionBusy}
              className="text-xs gap-1.5"
            >
              {mappingForm && busyAction === `map_${mappingForm.formId}` && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              <span>حفظ ربط المنتج</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMappingForm(null)}
              disabled={isAnyActionBusy}
              className="text-xs"
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
