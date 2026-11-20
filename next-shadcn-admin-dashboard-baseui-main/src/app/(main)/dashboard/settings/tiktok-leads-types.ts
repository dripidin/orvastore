/**
 * ORVA Store — TikTok Ads Lead Generation Dashboard Client Types & Pure Helpers (Phase C)
 *
 * CLIENT-SAFE MODULE:
 * - Zero imports from src/lib/integrations/tiktok/* or src/app/actions/checkout.ts.
 * - Zero Node.js crypto / server-only dependencies.
 * - Zero secrets, access tokens, refresh tokens, or raw customer phone exposure.
 */

import { ALGERIA_58_WILAYAS, isStopDeskAllowed } from "@/lib/types/checkout";

export { ALGERIA_58_WILAYAS, isStopDeskAllowed };

// ── 1. Canonical Trailing-Slash API Endpoints (matching next.config.mjs) ─────

export const TIKTOK_API_ENDPOINTS = {
  connect: "/api/integrations/tiktok/connect/",
  accounts: "/api/integrations/tiktok/accounts/",
  forms: "/api/integrations/tiktok/forms/",
  sync: "/api/integrations/tiktok/sync/",
  webhookPath: "/api/integrations/tiktok/webhook/",
} as const;

export const RECONCILE_LOOKBACK_OPTIONS = [7, 14, 30, 90] as const;
export const DEFAULT_FORMS_PAGE_SIZE = 6;

// ── 2. Public Client DTO Contracts (Mirroring Phase B JSON Responses) ────────

export type TikTokConnectionStatus =
  | "connected"
  | "token_expired"
  | "revoked"
  | "disconnected"
  | "error";

export type TikTokUiConnectionState =
  | "not_configured"
  | "misconfigured"
  | "not_connected"
  | "connected"
  | "token_expired"
  | "revoked"
  | "error";

export type TikTokConfigurationStatus = "NOT_CONFIGURED" | "MISCONFIGURED" | "READY";
export type TikTokEnvironmentMode =
  | "local"
  | "test"
  | "mocked_sandbox"
  | "tiktok_sandbox"
  | "production";

export interface TikTokConfigurationIssue {
  key: string;
  code: string;
  message: string;
}

export interface TikTokConfigurationReadiness {
  configured: boolean;
  configurationStatus?: TikTokConfigurationStatus;
  environmentMode?: TikTokEnvironmentMode;
  productionReady?: boolean;
  apiVersion?: string;
  missingKeys: string[];
  configurationErrors?: TikTokConfigurationIssue[];
  warnings?: string[];
  redirectUriValid: boolean;
  redirectUriHttps?: boolean;
  redirectUriPathValid?: boolean;
  redirectUriOriginMatchesApp?: boolean;
  appIdValid?: boolean;
  encryptionKeyValid: boolean;
  webhookSecretConfigured?: boolean;
  webhookSecretDedicated?: boolean;
  cronSecretConfigured?: boolean;
  configuredAdvertiserId?: string | null;
  sandboxMode: boolean;
  apiBaseUrl?: string;
  telegramAlertsOptIn: boolean;
}

export interface PublicTikTokConnection {
  id: string;
  storeId: string;
  appId: string;
  status: TikTokConnectionStatus;
  scopes: Array<number | string>;
  hasRefreshToken: boolean;
  tokenExpiresAt: string | null;
  refreshExpiresAt: string | null;
  selectedAdvertiserId: string | null;
  connectedBy: string;
  lastError: string | null;
  connectedAt: string;
  updatedAt: string;
}

export interface TikTokTelegramOptInState {
  enabled: boolean;
  source: "env" | "site_settings" | "default";
  envLocked: boolean;
  existingTelegramConfigured: boolean;
}

export interface PublicTikTokAdAccount {
  id: string;
  advertiserId: string;
  advertiserName: string;
  currency: string;
  timezone: string;
  accountStatus: string;
  isSelected: boolean;
  webhookSubscribed: boolean;
  updatedAt: string;
}

export type TikTokFormStatus = "ACTIVE" | "PAUSED" | "ARCHIVED" | "DELETED" | "UNKNOWN";
export type TikTokDeliveryType = "DOMICILE" | "STOP_DESK";

export interface TikTokFormField {
  field_id?: string;
  field_name: string;
  field_type: string;
  required: boolean;
}

export interface PublicTikTokFormMapping {
  productId: string;
  packId: string;
  productName: string;
  productPrice: number;
  defaultWilayaCode: number;
  defaultDeliveryType: TikTokDeliveryType;
  autoCreateOrder: boolean;
  leadSourceLabel: string;
}

export interface PublicTikTokForm {
  id: string;
  advertiserId: string;
  formId: string;
  formName: string;
  status: TikTokFormStatus;
  fields: TikTokFormField[];
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  totalLeadsImported: number;
  mapping: PublicTikTokFormMapping | null;
}

export interface MappableCatalogProduct {
  id: string;
  slug: string;
  packId: string;
  title: string;
  sellingPrice: number;
  stockQuantity: number;
  status: string;
  showOutOfStock: boolean;
}

export type TikTokLeadSyncStatus =
  | "pending"
  | "order_created"
  | "lead_saved_no_order"
  | "duplicate_skipped"
  | "invalid_phone"
  | "unmapped_form"
  | "order_creation_failed";

export type TikTokSyncTriggerSource = "manual" | "webhook" | "scheduled" | "reconciliation";
export type TikTokSyncRunStatus = "success" | "partial" | "failed";

export interface TikTokSyncLogItem {
  id: string;
  advertiserId: string | null;
  formId: string | null;
  triggerSource: TikTokSyncTriggerSource;
  status: TikTokSyncRunStatus;
  leadsFetched: number;
  leadsImported: number;
  ordersCreated: number;
  duplicatesSkipped: number;
  leadsFailed: number;
  durationMs: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string;
}

export interface TikTokRecoverableLead {
  id: string;
  externalLeadId: string;
  formId: string;
  advertiserId: string;
  customerName: string | null;
  maskedPhone: string | null;
  phoneValid: boolean;
  wilayaCode: number | null;
  wilayaName: string | null;
  mappedProductName: string | null;
  orderId: string | null;
  syncStatus: TikTokLeadSyncStatus;
  retryCount: number;
  errorMessage: string | null;
  importedAt: string;
}

export interface TikTokLeadStats {
  totalSampled: number;
  byStatus: Record<string, number>;
}

export interface TikTokSyncMetricsSummary {
  leadsFetched: number;
  leadsImported: number;
  ordersCreated: number;
  duplicatesSkipped: number;
  invalidPhoneCount?: number;
  unmappedFormCount?: number;
  leadsFailed: number;
  durationMs: number;
  status?: TikTokSyncRunStatus;
  errorMessage?: string | null;
}

export interface TikTokDashboardSnapshot {
  readiness: TikTokConfigurationReadiness | null;
  connection: PublicTikTokConnection | null;
  telegramOptIn: TikTokTelegramOptInState;
  accounts: PublicTikTokAdAccount[];
  forms: PublicTikTokForm[];
  catalogProducts: MappableCatalogProduct[];
  logs: TikTokSyncLogItem[];
  leadStats: TikTokLeadStats;
  recoverableLeads: TikTokRecoverableLead[];
}

export interface TikTokConnectionBadgeSummary {
  state: TikTokUiConnectionState;
  badgeStatus: "connected" | "configured" | "not_connected" | "error";
  labelAr: string;
  descriptionAr: string;
  requiresReconnect: boolean;
}

// ── 3. Connection State Derivation ───────────────────────────────────────────

export function deriveTikTokConnectionUiState(
  readiness: TikTokConfigurationReadiness | null,
  connection: PublicTikTokConnection | null,
): TikTokConnectionBadgeSummary {
  if (readiness && !readiness.configured && !connection) {
    if (readiness.configurationStatus === "MISCONFIGURED") {
      return {
        state: "misconfigured",
        badgeStatus: "error",
        labelAr: "خطأ في إعدادات الخادم",
        descriptionAr:
          "يوجد تعارض أو خطأ في صياغة متغيرات بيئة TikTok على الخادم (MISCONFIGURED). يرجى تصحيح الإعدادات في Hostinger / Server Env قبل الربط.",
        requiresReconnect: false,
      };
    }
    return {
      state: "not_configured",
      badgeStatus: "not_connected",
      labelAr: "غير مهيأ على الخادم",
      descriptionAr: "يرجى استكمال متغيرات بيئة TikTok على الخادم قبل بدء الربط.",
      requiresReconnect: false,
    };
  }

  if (!connection || connection.status === "disconnected") {
    return {
      state: "not_connected",
      badgeStatus: readiness?.configured ? "configured" : "not_connected",
      labelAr: "غير متصل",
      descriptionAr: "جاهز للربط عبر تفويض TikTok Business OAuth 2.0 الآمن.",
      requiresReconnect: false,
    };
  }

  if (connection.status === "token_expired") {
    return {
      state: "token_expired",
      badgeStatus: "error",
      labelAr: "انتهت صلاحية الرمز",
      descriptionAr: "انتهت صلاحية رمز الوصول لـ TikTok. يرجى إعادة الربط لاستئناف جلب العملاء المحتملين.",
      requiresReconnect: true,
    };
  }

  if (connection.status === "revoked") {
    return {
      state: "revoked",
      badgeStatus: "error",
      labelAr: "تم سحب الصلاحية",
      descriptionAr: "تم إلغاء التفويض من جهة TikTok Business Center. أعد ربط الحساب لاستئناف المزامنة.",
      requiresReconnect: true,
    };
  }

  if (connection.status === "error") {
    return {
      state: "error",
      badgeStatus: "error",
      labelAr: "خطأ في الاتصال",
      descriptionAr: connection.lastError || "حدث خطأ غير متوقع في اتصال TikTok. يرجى إعادة التحقق أو إعادة الربط.",
      requiresReconnect: true,
    };
  }

  return {
    state: "connected",
    badgeStatus: "connected",
    labelAr: "متصل ونشط",
    descriptionAr: "الحساب متصل ومشفّر على الخادم (AES-256-GCM). يتم حفظ الطلبيات بحالة قيد الانتظار فقط.",
    requiresReconnect: false,
  };
}

// ── 4. Sanitized OAuth Callback Redirect Notice Parser ───────────────────────

export interface TikTokOAuthCallbackNotice {
  type: "success" | "error";
  code: string;
  titleAr: string;
  messageAr: string;
}

const KNOWN_OAUTH_ERROR_MESSAGES: Record<string, { titleAr: string; messageAr: string }> = {
  oauth_denied: {
    titleAr: "تم إلغاء تفويض TikTok",
    messageAr: "تم رفض أو إلغاء عملية الربط من نافذة TikTok Business. يمكنك المحاولة مجدداً عند الجاهزية.",
  },
  missing_callback_params: {
    titleAr: "معاملات التفويض غير مكتملة",
    messageAr: "لم يستقبل الخادم رمز التفويض أو حالة الأمان المطلوبة. يرجى إعادة بدء الربط من لوحة التحكم.",
  },
  missing_state_cookie: {
    titleAr: "انتهت جلسة التحقق الأمني (CSRF Cookie)",
    messageAr: "تعذر العثور على ملف تعريف أمان OAuth أو انتهت صلاحيته (10 دقائق). أعد الضغط على ربط TikTok.",
  },
  invalid_state: {
    titleAr: "فشل التحقق من توقيع أمان OAuth",
    messageAr: "تم رفض الاستجابة لحماية الحساب من محاولات إعادة الاستخدام أو التزوير. يرجى بدء جلسة ربط جديدة.",
  },
  token_exchange_failed: {
    titleAr: "تعذر إكمال تبادل رمز الوصول مع TikTok",
    messageAr: "فشل التحقق من رمز التفويض لدى خادم TikTok. تأكد من صلاحية إعدادات التطبيق وأعد المحاولة.",
  },
};

/**
 * Strictly maps whitelisted callback query parameters to static, XSS-safe notices.
 * Never reflects arbitrary untrusted query strings into the DOM.
 */
export function parseTikTokOAuthCallbackNotice(
  params: { get(name: string): string | null } | URLSearchParams | null | undefined,
): TikTokOAuthCallbackNotice | null {
  if (!params) return null;
  const status = (params.get("tiktok_status") || "").trim().toLowerCase();
  if (!status) return null;

  if (status === "connected") {
    return {
      type: "success",
      code: "connected",
      titleAr: "تم ربط حساب TikTok Business بنجاح",
      messageAr:
        "تم تشفير وحفظ رموز الوصول على الخادم. اختر الحساب الإعلاني النشط ثم اربط النماذج الفورية بمنتجات كتالوج ORVA.",
    };
  }

  if (status === "error") {
    const rawCode = (params.get("tiktok_error") || "").trim().toLowerCase();
    const mapped = KNOWN_OAUTH_ERROR_MESSAGES[rawCode] ?? {
      titleAr: "فشل إتمام ربط TikTok Business",
      messageAr: "تعذر إكمال عملية التفويض. يرجى التحقق من جلسة الإدارة وإعدادات التطبيق ثم إعادة المحاولة.",
    };
    return {
      type: "error",
      code: KNOWN_OAUTH_ERROR_MESSAGES[rawCode] ? rawCode : "unknown_oauth_error",
      titleAr: mapped.titleAr,
      messageAr: mapped.messageAr,
    };
  }

  return null;
}

// ── 5. Forms Filtering, Pagination & Mapping Payload Guards ──────────────────

export type TikTokFormsFilterMode = "all" | "mapped" | "unmapped" | "sync_enabled" | "deleted";

export function filterTikTokForms(
  forms: PublicTikTokForm[],
  searchQuery: string,
  filterMode: TikTokFormsFilterMode = "all",
): PublicTikTokForm[] {
  const q = searchQuery.trim().toLowerCase();

  return forms.filter((form) => {
    if (filterMode === "mapped" && (!form.mapping || form.status === "DELETED")) return false;
    if (filterMode === "unmapped" && (Boolean(form.mapping) || form.status === "DELETED")) return false;
    if (filterMode === "sync_enabled" && !form.syncEnabled) return false;
    if (filterMode === "deleted" && form.status !== "DELETED") return false;

    if (!q) return true;
    const haystack = [
      form.formName,
      form.formId,
      form.advertiserId,
      form.mapping?.productName || "",
      form.mapping?.packId || "",
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
}

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}

export function paginateItems<T>(
  items: T[],
  requestedPage: number,
  pageSize = DEFAULT_FORMS_PAGE_SIZE,
): PaginationResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage || 1)), totalPages);
  const startIndex = (page - 1) * safePageSize;
  const slice = items.slice(startIndex, startIndex + safePageSize);
  const endIndex = startIndex + slice.length;

  return {
    items: slice,
    page,
    pageSize: safePageSize,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
  };
}

/**
 * Determines whether synchronization may be enabled for a form.
 * Strictly blocks DELETED forms and unmapped forms.
 */
export function canToggleFormSync(form: PublicTikTokForm): {
  allowed: boolean;
  canEnable: boolean;
  reasonAr: string | null;
} {
  if (form.status === "DELETED") {
    return {
      allowed: false,
      canEnable: false,
      reasonAr: "تم حذف هذا النموذج من TikTok ولا يمكن تفعيل المزامنة عليه.",
    };
  }
  if (!form.mapping) {
    return {
      allowed: form.syncEnabled, // Allow disabling if ever left on; never allow enabling unmapped
      canEnable: false,
      reasonAr: "يجب ربط النموذج بمنتج فعلي من كتالوج ORVA قبل تفعيل المزامنة.",
    };
  }
  return {
    allowed: true,
    canEnable: true,
    reasonAr: null,
  };
}

export interface ProductMappingSubmitInput {
  formId: string;
  productId: string;
  defaultWilayaCode: number;
  defaultDeliveryType: TikTokDeliveryType;
  autoCreateOrder: boolean;
  syncEnabled?: boolean;
}

export interface SafeProductMappingRequestBody {
  action: "map_product";
  formId: string;
  productId: string;
  defaultWilayaCode: number;
  defaultDeliveryType: TikTokDeliveryType;
  autoCreateOrder: boolean;
  syncEnabled?: boolean;
}

/**
 * Constructs the exact strict payload accepted by POST /api/integrations/tiktok/forms/.
 * SECURITY INVARIANT: Never sends client-side productPrice, productName, or packId.
 * All prices and product titles are resolved authoritatively from ORVA's Supabase catalog server-side.
 */
export function buildProductMappingPayload(
  input: ProductMappingSubmitInput,
): SafeProductMappingRequestBody {
  const formId = input.formId.trim();
  const productId = input.productId.trim();
  if (!formId) {
    throw new Error("معرّف النموذج (formId) مطلوب.");
  }
  if (!productId) {
    throw new Error("يرجى اختيار منتج فعلي من كتالوج ORVA قبل الحفظ.");
  }

  const parsedWilaya = Math.round(Number(input.defaultWilayaCode));
  const clampedWilaya = Number.isFinite(parsedWilaya)
    ? Math.min(58, Math.max(1, parsedWilaya))
    : 16;

  const payload: SafeProductMappingRequestBody = {
    action: "map_product",
    formId,
    productId,
    defaultWilayaCode: clampedWilaya,
    defaultDeliveryType: input.defaultDeliveryType === "STOP_DESK" ? "STOP_DESK" : "DOMICILE",
    autoCreateOrder: Boolean(input.autoCreateOrder),
  };

  if (input.syncEnabled !== undefined) {
    payload.syncEnabled = Boolean(input.syncEnabled);
  }

  return payload;
}

export function getWilayaDeliveryNotice(
  wilayaCode: number,
  deliveryType: TikTokDeliveryType,
): string | null {
  if (deliveryType !== "STOP_DESK") return null;
  if (isStopDeskAllowed(wilayaCode)) return null;
  const w = ALGERIA_58_WILAYAS.find((item) => item.code === wilayaCode);
  const label = w ? `${String(w.code).padStart(2, "0")} - ${w.nameAr}` : `الولاية ${wilayaCode}`;
  return `ملاحظة لوجستية: خدمة التوصيل للمكتب (Stop Desk) غير متاحة للولاية (${label} — ولايات الجنوب / المنطقة 5). سيقوم النظام تلقائياً بتحويلها إلى التوصيل للمنزل (DOMICILE) عند إنشاء الطلب.`;
}

export function clampReconcileLookbackDays(days: number): number {
  const rounded = Math.round(Number(days));
  if (!Number.isFinite(rounded)) return 7;
  return Math.min(90, Math.max(1, rounded));
}

// ── 6. Lead Failure Explanations & API Error Formatting ──────────────────────

export interface LeadStatusMetadata {
  labelAr: string;
  tone: "success" | "warning" | "error" | "neutral";
  explanationAr: string;
  actionHintAr: string;
  retryable: boolean;
}

export function getLeadFailureExplanation(syncStatus: TikTokLeadSyncStatus | string): LeadStatusMetadata {
  switch (syncStatus) {
    case "invalid_phone":
      return {
        labelAr: "رقم هاتف غير صالح",
        tone: "warning",
        explanationAr:
          "لم يطابق رقم الهاتف صيغة الهاتف الجزائري الصحيحة (05 / 06 / 07 متبوعاً بـ 8 أرقام). تم حفظ بيانات العميل للمراجعة اليدوية دون إنشاء طلب.",
        actionHintAr: "راجع بيانات العميل في TikTok Ads Manager أو تواصل معه لتأكيد رقم جزائري صحيح.",
        retryable: false,
      };
    case "unmapped_form":
      return {
        labelAr: "نموذج غير مربوط بمنتج",
        tone: "warning",
        explanationAr:
          "وصل العميل من نموذج فوري غير مربوط بمنتج في كتالوج ORVA، لذلك تم حفظه بأمان دون إنشاء طلب.",
        actionHintAr: "اربط النموذج بمنتج من كتالوج ORVA في قسم «النماذج الفورية» ثم اضغط «إعادة المحاولة».",
        retryable: true,
      };
    case "order_creation_failed":
      return {
        labelAr: "تعذر إنشاء الطلب",
        tone: "error",
        explanationAr:
          "تعذر حفظ الطلب في جدول الطلبيات (مثلاً بسبب منتج مؤرشف أو خطأ مؤقت في قاعدة البيانات). لم يتم فقدان بيانات العميل.",
        actionHintAr: "تحقق من حالة المنتج المربوط في الكتالوج ثم أعد محاولة تحويل هذا العميل إلى طلب.",
        retryable: true,
      };
    case "pending":
      return {
        labelAr: "قيد المعالجة",
        tone: "neutral",
        explanationAr: "تم استلام العميل ولم يكتمل تحويله إلى طلب بعد.",
        actionHintAr: "يمكنك تشغيل إعادة المحاولة لإكمال المعالجة.",
        retryable: true,
      };
    case "order_created":
      return {
        labelAr: "تم إنشاء الطلب (قيد الانتظار)",
        tone: "success",
        explanationAr: "تم إنشاء طلب COD جديد بحالة pending (غير مرسل لـ Redex) جاهز لتأكيد فريق الاتصال.",
        actionHintAr: "افتح قسم الطلبيات لمراجعة الطلب وتأكيده قبل الشحن.",
        retryable: false,
      };
    case "duplicate_skipped":
      return {
        labelAr: "مكرر (تم تجاهله)",
        tone: "neutral",
        explanationAr: "تم استلام هذا المعرّف مسبقاً، وتم منع إنشاء طلب مكرر تلقائياً.",
        actionHintAr: "لا يلزم أي إجراء.",
        retryable: false,
      };
    case "lead_saved_no_order":
      return {
        labelAr: "محفوظ بدون طلب تلقائي",
        tone: "neutral",
        explanationAr: "تم حفظ العميل المحتمل فقط لأن خيار الإنشاء التلقائي للطلب معطّل على هذا النموذج.",
        actionHintAr: "فعّل الإنشاء التلقائي للطلبيات على النموذج إذا أردت تحويل العملاء الجدد تلقائياً.",
        retryable: false,
      };
    default:
      return {
        labelAr: String(syncStatus || "غير معروف"),
        tone: "neutral",
        explanationAr: "حالة مزامنة غير مصنفة.",
        actionHintAr: "راجع سجل المزامنة للتفاصيل.",
        retryable: false,
      };
  }
}

export interface FormattedTikTokApiError {
  status: number;
  code: string;
  messageAr: string;
  isAuthError: boolean;
  isPermissionError: boolean;
  isConflict: boolean;
}

export function formatTikTokApiError(
  status: number,
  payload: Record<string, unknown> | null | undefined,
): FormattedTikTokApiError {
  const code = String(payload?.code || "UNKNOWN_ERROR");
  const rawMessage = typeof payload?.error === "string" ? payload.error : "";

  if (status === 401 || code === "UNAUTHORIZED" || code === "AUTH_TOKEN_EXPIRED") {
    if (code === "AUTH_TOKEN_EXPIRED") {
      return {
        status,
        code,
        messageAr:
          "انتهت صلاحية رمز الوصول أو تم سحبه من TikTok. يرجى إعادة ربط حساب TikTok Business من قسم إدارة الاتصال.",
        isAuthError: true,
        isPermissionError: false,
        isConflict: false,
      };
    }
    return {
      status,
      code,
      messageAr: "جلسة الإدارة منتهية أو غير مصرح بها (401). يرجى تسجيل الدخول مجدداً إلى لوحة التحكم.",
      isAuthError: true,
      isPermissionError: false,
      isConflict: false,
    };
  }

  if (status === 403 || code === "AUTH_PERMISSION_DENIED" || code === "CSRF_ORIGIN_MISMATCH") {
    if (code === "CSRF_ORIGIN_MISMATCH") {
      return {
        status,
        code,
        messageAr: "تم حظر الطلب بسبب فشل التحقق من الأصل الأمني (CSRF 403). حدّث الصفحة وأعد المحاولة.",
        isAuthError: false,
        isPermissionError: true,
        isConflict: false,
      };
    }
    return {
      status,
      code,
      messageAr:
        rawMessage.includes("12010100") || /lead|permission|scope/i.test(rawMessage)
          ? "لا يملك الحساب الإعلاني صلاحية جلب العملاء المحتملين (Lead Retrieval Scope 12010100). يرجى منح الصلاحية من TikTok Business Center أو مراجعة حالة الموافقة على التطبيق."
          : `رفض الخادم الطلب لعدم توفر الصلاحيات اللازمة (403)${rawMessage ? `: ${rawMessage}` : "."}`,
      isAuthError: false,
      isPermissionError: true,
      isConflict: false,
    };
  }

  if (status === 409) {
    if (code === "TELEGRAM_OPT_IN_ENV_LOCKED") {
      return {
        status,
        code,
        messageAr:
          "خيار تنبيهات Telegram لـ TikTok مقفل عبر متغير البيئة TIKTOK_TELEGRAM_ALERTS_ENABLED على الخادم. قم بتعديله من إعدادات Hostinger / Server Env لتغيير الحالة.",
        isAuthError: false,
        isPermissionError: false,
        isConflict: true,
      };
    }
    return {
      status,
      code,
      messageAr: "توجد عملية مزامنة جارية حالياً لهذا النموذج (409 Conflict). انتظر لحظات ثم أعد المحاولة.",
      isAuthError: false,
      isPermissionError: false,
      isConflict: true,
    };
  }

  if (status === 429 || code === "RATE_LIMITED") {
    return {
      status,
      code,
      messageAr: "تم تجاوز حد الطلبات المؤقت لـ TikTok API (429). يرجى الانتظار قليلاً ثم إعادة المحاولة.",
      isAuthError: false,
      isPermissionError: false,
      isConflict: false,
    };
  }

  if (status === 502 || status === 503) {
    return {
      status,
      code,
      messageAr: "تعذر الوصول إلى خادم TikTok أو قاعدة البيانات مؤقتاً. أعد المحاولة بعد قليل.",
      isAuthError: false,
      isPermissionError: false,
      isConflict: false,
    };
  }

  return {
    status,
    code,
    messageAr: rawMessage || `تعذر تنفيذ العملية (HTTP ${status || 500}).`,
    isAuthError: false,
    isPermissionError: false,
    isConflict: false,
  };
}

// ── 7. Formatting Utilities ──────────────────────────────────────────────────

export function formatDzd(amount: number | null | undefined): string {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return "0 د.ج";
  return `${Math.round(num).toLocaleString("en-US")} د.ج`;
}

export function formatAlgiersDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("ar-DZ", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function getWilayaLabelAr(code: number | null | undefined): string {
  if (!code) return "غير محددة";
  const match = ALGERIA_58_WILAYAS.find((w) => w.code === code);
  if (!match) return `ولاية ${code}`;
  return `${String(match.code).padStart(2, "0")} — ${match.nameAr}`;
}
