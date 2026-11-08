/**
 * CodFlow integration — the single fetch seam (Phase 0).
 *
 * All dashboard access to CodFlow goes through the authenticated PHP bridge at
 * `/api/codflow`. Repositories must never call `fetch` directly and must never
 * see the CodFlow API key.
 */

import { CODFLOW_BRIDGE_PATH, CODFLOW_CLIENT_TIMEOUT_MS } from "./config";
import {
  CodflowApiError,
  CodflowError,
  CodflowNetworkError,
  CodflowProtocolError,
  CodflowTimeoutError,
} from "./errors";
import type { CodflowEnvelope, CodflowErrorPayload, CodflowHealth, CodflowHttpMethod, CodflowQuery } from "./types";

export interface CodflowRequestOptions {
  method?: CodflowHttpMethod;
  query?: CodflowQuery;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  requestId?: string;
}

export interface CodflowInternalRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  query?: CodflowQuery;
}

export interface CodflowProbeOptions {
  probe?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Calls one CodFlow merchant path through the bridge.
 *
 * @param path CodFlow API path, e.g. `/api/orders` or `/api/orders/abc/status`.
 */
export async function codflowRequest<T>(
  path: string,
  options: CodflowRequestOptions = {},
): Promise<CodflowEnvelope<T>> {
  const method = options.method ?? "GET";
  const requestId = options.requestId ?? createRequestId();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Orva-Request-Id": requestId,
    ...options.headers,
  };

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (isFormData(options.body) || isBlob(options.body)) {
      // The browser supplies the multipart boundary; never set Content-Type.
      body = options.body;
    } else if (typeof options.body === "string") {
      body = options.body;
      if (options.headers?.["Content-Type"] === undefined) {
        headers["Content-Type"] = "application/json";
      }
    } else {
      body = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? CODFLOW_CLIENT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal !== undefined) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort);
    }
  }

  try {
    const response = await fetch(buildBridgeUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    const responseRequestId = response.headers.get("x-orva-request-id") ?? requestId;
    const rawBody = await response.text();
    let parsed: unknown = null;

    if (rawBody.trim() !== "") {
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new CodflowProtocolError("CodFlow bridge returned a non-JSON response.", responseRequestId);
      }
    }

    if (!response.ok) {
      throw buildApiError(response.status, parsed, responseRequestId);
    }

    // 204 No Content is a valid success (e.g. an upstream delete); there is no
    // envelope to parse, and treating it as a protocol error would surface a
    // false failure to the UI.
    if (response.status === 204) {
      return { success: true };
    }

    if (parsed === null || typeof parsed !== "object") {
      throw new CodflowProtocolError("CodFlow bridge returned an empty or scalar payload.", responseRequestId);
    }

    const envelope = parsed as CodflowEnvelope<T>;
    if (envelope.success === false) {
      throw buildApiError(response.status, parsed, responseRequestId);
    }

    return envelope;
  } catch (error) {
    if (error instanceof CodflowError) {
      throw error;
    }
    if (timedOut) {
      throw new CodflowTimeoutError();
    }
    if (isAbortError(error)) {
      throw new CodflowNetworkError("The request was aborted.");
    }
    throw new CodflowNetworkError(error instanceof Error ? error.message : undefined);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Calls a bridge-local endpoint (`/__flags`, `/__health`) and unwraps `data`. */
export async function codflowInternalRequest<T>(
  path: "/__flags" | "/__health",
  options: CodflowInternalRequestOptions = {},
): Promise<T> {
  const envelope = await codflowRequest<T>(path, {
    method: "GET",
    query: options.query,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });

  if (envelope.data === undefined) {
    const requestId = typeof envelope.requestId === "string" ? envelope.requestId : undefined;
    throw new CodflowProtocolError("CodFlow bridge response is missing a data payload.", requestId);
  }

  return envelope.data;
}

/** Health check, optionally probing the upstream CodFlow API. */
export function probeCodflowBridge(options: CodflowProbeOptions = {}): Promise<CodflowHealth> {
  return codflowInternalRequest<CodflowHealth>("/__health", {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    query: options.probe === true ? { probe: "1" } : undefined,
  });
}

function buildBridgeUrl(path: string, query?: CodflowQuery): string {
  const search = new URLSearchParams();
  search.set("path", path);
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        search.set(key, String(value));
      }
    }
  }

  const base = CODFLOW_BRIDGE_PATH;
  if (/^https?:\/\//i.test(base)) {
    const url = new URL(base);
    url.search = search.toString();
    return url.toString();
  }

  return `${base}?${search.toString()}`;
}

function buildApiError(status: number, payload: unknown, requestId: string): CodflowApiError {
  const body = readErrorPayload(payload);
  return new CodflowApiError({
    status,
    code: readErrorCode(body),
    category: typeof body.category === "string" ? body.category : undefined,
    message: readErrorMessage(body, status),
    requestId,
  });
}

function readErrorPayload(payload: unknown): CodflowErrorPayload {
  return payload !== null && typeof payload === "object" ? (payload as CodflowErrorPayload) : {};
}

function readErrorCode(body: CodflowErrorPayload): string | undefined {
  if (typeof body.code === "string" && body.code !== "") {
    return body.code;
  }
  if (typeof body.error_code === "string" && body.error_code !== "") {
    return body.error_code;
  }
  if (typeof body.error === "string" && /^[A-Z0-9_]+$/.test(body.error)) {
    return body.error;
  }
  return undefined;
}

function readErrorMessage(body: CodflowErrorPayload, status: number): string {
  if (typeof body.message === "string" && body.message !== "") {
    return body.message;
  }
  if (typeof body.error === "string" && !/^[A-Z0-9_]+$/.test(body.error)) {
    return body.error;
  }
  return `CodFlow request failed with HTTP ${status}.`;
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `orva-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isFormData(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}
