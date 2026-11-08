/**
 * CodFlow integration — error taxonomy (Phase 0).
 *
 * Every failure crossing the bridge becomes one of these classes so UI code
 * never has to parse raw HTTP or PHP strings. `userMessage` is Arabic and safe
 * to render; `message` is the technical detail for logs.
 */

export type CodflowErrorKind = "api" | "network" | "timeout" | "protocol" | "read_only" | "config";

export class CodflowError extends Error {
  readonly kind: CodflowErrorKind;
  readonly userMessage: string;
  readonly requestId?: string;

  constructor(kind: CodflowErrorKind, message: string, userMessage: string, requestId?: string) {
    super(message);
    this.name = "CodflowError";
    this.kind = kind;
    this.userMessage = userMessage;
    this.requestId = requestId;
  }
}

export class CodflowApiError extends CodflowError {
  readonly status: number;
  readonly code?: string;
  readonly category?: string;
  readonly retryable: boolean;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    category?: string;
    requestId?: string;
  }) {
    super("api", args.message, mapStatusToUserMessage(args.status), args.requestId);
    this.name = "CodflowApiError";
    this.status = args.status;
    this.code = args.code;
    this.category = args.category;
    this.retryable = args.status === 429 || args.status >= 500;
  }
}

export class CodflowNetworkError extends CodflowError {
  constructor(message = "Network request failed.") {
    super("network", message, "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
    this.name = "CodflowNetworkError";
  }
}

export class CodflowTimeoutError extends CodflowError {
  constructor(message = "The request timed out.") {
    super("timeout", message, "انتهت مهلة الاتصال بالخادم. حاول مرة أخرى.");
    this.name = "CodflowTimeoutError";
  }
}

export class CodflowProtocolError extends CodflowError {
  constructor(message = "The server returned an invalid response.", requestId?: string) {
    super("protocol", message, "استجابة الخادم غير صالحة. حاول مرة أخرى.", requestId);
    this.name = "CodflowProtocolError";
  }
}

export class CodflowReadOnlyError extends CodflowError {
  constructor(operation: string) {
    super(
      "read_only",
      `CodFlow operation "${operation}" is disabled until the write phase is enabled.`,
      "هذه العملية غير مفعّلة بعد. الواجهة تعمل بوضع القراءة فقط.",
    );
    this.name = "CodflowReadOnlyError";
  }
}

export class CodflowConfigError extends CodflowError {
  constructor(message: string) {
    super("config", message, "إعدادات CodFlow غير مكتملة على الخادم.");
    this.name = "CodflowConfigError";
  }
}

export function isCodflowError(error: unknown): error is CodflowError {
  return error instanceof CodflowError;
}

/** Arabic message safe to render in the dashboard. */
export function getCodflowErrorMessage(error: unknown): string {
  if (error instanceof CodflowError) {
    return error.userMessage;
  }
  return "تعذر إكمال العملية. حاول مرة أخرى.";
}

/** Stable code for logs and telemetry: CodFlow code, HTTP status, or error kind. */
export function getCodflowErrorCode(error: unknown): string | undefined {
  if (error instanceof CodflowApiError) {
    return error.code ?? `HTTP_${error.status}`;
  }
  if (error instanceof CodflowError) {
    return error.kind.toUpperCase();
  }
  return undefined;
}

function mapStatusToUserMessage(status: number): string {
  switch (status) {
    case 400:
      return "الطلب غير صالح. تحقق من البيانات المدخلة.";
    case 401:
      return "انتهت جلسة الإدارة. يرجى تسجيل الدخول من جديد.";
    case 403:
      return "ليس لديك صلاحية لتنفيذ هذه العملية.";
    case 404:
      return "العنصر المطلوب غير موجود.";
    case 409:
      return "لا يمكن تنفيذ العملية بسبب حالة العنصر الحالية.";
    case 415:
      return "نوع البيانات المرسل غير مدعوم.";
    case 422:
      return "البيانات المدخلة غير صالحة أو غير مكتملة.";
    case 429:
      return "عدد الطلبات كبير جداً. حاول مرة أخرى بعد قليل.";
    case 501:
      return "هذه العملية غير مدعومة عبر جسر CodFlow.";
    case 502:
    case 503:
    case 504:
      return "خدمة CodFlow غير متاحة حالياً. حاول لاحقاً.";
    default:
      return "تعذر إكمال العملية. حاول مرة أخرى.";
  }
}
