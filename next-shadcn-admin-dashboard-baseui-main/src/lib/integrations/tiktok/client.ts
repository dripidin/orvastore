/**
 * ORVA Store — Centralized TikTok Business API v1.3 HTTP Client (Phase A1)
 *
 * Capabilities:
 * - Official API v1.3 base URL (https://business-api.tiktok.com/open_api/v1.3)
 * - Zod validation of TikTok response envelopes and endpoint payloads
 * - Verified TikTok error code classification (40001, 40002, 40100, 40105, 50000)
 * - Controlled exponential backoff retries for HTTP 429 / 5xx and TikTok code 40100
 * - Support for both JSON endpoints and binary/CSV download streams
 * - Injectable fetch & sleep implementations for deterministic unit testing
 * - Zero logging of Access-Token, secret, or sensitive headers/body fields
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import type { ZodType } from "zod";
import { type TikTokEnvironmentMode, resolveTikTokEnvironmentMode } from "./env";
import {
  TIKTOK_RETURN_CODES,
  TikTokApiError,
  type TikTokErrorCategory,
  redactSensitiveForLog,
  resolveTikTokApiBaseUrl,
  tikTokApiEnvelopeSchema,
} from "./types";

const NATIVE_GLOBAL_FETCH = globalThis.fetch;

export interface TikTokClientLogger {
  warn: (event: string, context: Record<string, unknown>) => void;
  error: (event: string, context: Record<string, unknown>) => void;
}

export interface TikTokApiClientOptions {
  baseUrl?: string;
  sandboxMode?: boolean;
  environmentMode?: TikTokEnvironmentMode;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  logger?: TikTokClientLogger;
}

export interface TikTokJsonRequestOptions<TData> {
  method: "GET" | "POST";
  path: string;
  accessToken?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  dataSchema?: ZodType<TData>;
  idempotent?: boolean;
}

export interface TikTokBinaryRequestOptions {
  path: string;
  accessToken: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
}

export interface TikTokJsonResponse<TData> {
  code: number;
  message: string;
  requestId: string | null;
  data: TData;
}

export interface TikTokBinaryResponse {
  contentType: string;
  body: Buffer;
  text: string;
  requestId: string | null;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 400;
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const defaultLogger: TikTokClientLogger = {
  warn: (event, context) => {
    console.warn(`[TikTokApiClient] ${event}`, redactSensitiveForLog(context));
  },
  error: (event, context) => {
    console.error(`[TikTokApiClient] ${event}`, redactSensitiveForLog(context));
  },
};

/**
 * Parses Retry-After HTTP header (seconds or HTTP-date) into milliseconds.
 */
export function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }

  return null;
}

/**
 * Classifies TikTok Business API v1.3 numeric return codes & HTTP statuses
 * according to verified official documentation.
 */
export function classifyTikTokApiError(params: {
  tiktokCode?: number | null;
  httpStatus?: number | null;
  message?: string;
  requestId?: string | null;
  retryAfterMs?: number | null;
}): TikTokApiError {
  const code = params.tiktokCode ?? null;
  const httpStatus = params.httpStatus ?? null;
  const requestId = params.requestId ?? null;
  const rawMessage = (params.message || "").trim();

  let category: TikTokErrorCategory = "UNKNOWN_API_ERROR";
  let retryable = false;

  if (code === TIKTOK_RETURN_CODES.TOKEN_INVALID_OR_EXPIRED || httpStatus === 401) {
    category = "AUTH_TOKEN_EXPIRED";
    retryable = false;
  } else if (code === TIKTOK_RETURN_CODES.NO_PERMISSION || httpStatus === 403) {
    category = "AUTH_PERMISSION_DENIED";
    retryable = false;
  } else if (code === TIKTOK_RETURN_CODES.INVALID_PARAMETERS || httpStatus === 400) {
    category = "INVALID_PARAMETERS";
    retryable = false;
  } else if (code === TIKTOK_RETURN_CODES.RATE_LIMITED || httpStatus === 429) {
    category = "RATE_LIMITED";
    retryable = true;
  } else if (
    (code !== null && code >= TIKTOK_RETURN_CODES.UPSTREAM_INTERNAL_ERROR) ||
    (httpStatus !== null && httpStatus >= 500)
  ) {
    category = "UPSTREAM_SERVER_ERROR";
    retryable = true;
  }

  return new TikTokApiError({
    category,
    message: rawMessage || `TikTok API error (${category})`,
    tiktokCode: code,
    httpStatus,
    requestId,
    retryable,
    retryAfterMs: params.retryAfterMs ?? null,
  });
}

export class TikTokApiClient {
  private readonly baseUrl: string;
  private readonly sandboxMode?: boolean;
  private readonly environmentMode?: TikTokEnvironmentMode;
  private readonly hasExplicitFetchImpl: boolean;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly logger: TikTokClientLogger;

  constructor(options: TikTokApiClientOptions = {}) {
    this.sandboxMode = options.sandboxMode;
    this.environmentMode = options.environmentMode;
    this.baseUrl = resolveTikTokApiBaseUrl({
      baseUrl: options.baseUrl,
      sandboxMode: options.sandboxMode,
    });
    this.hasExplicitFetchImpl = typeof options.fetchImpl === "function";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
    this.maxRetryDelayMs = Math.max(this.retryBaseDelayMs, options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS);
    this.sleepImpl = options.sleepImpl ?? defaultSleep;
    this.logger = options.logger ?? defaultLogger;
  }

  /**
   * Blocks unmocked outbound HTTP requests in automated `test` and `mocked_sandbox`
   * modes so tests never accidentally contact live TikTok endpoints.
   */
  private assertOutboundNetworkPermitted(): void {
    const mode =
      this.environmentMode ??
      resolveTikTokEnvironmentMode({ sandboxMode: this.sandboxMode }).mode;
    if (
      (mode === "test" || mode === "mocked_sandbox") &&
      !this.hasExplicitFetchImpl &&
      globalThis.fetch === NATIVE_GLOBAL_FETCH
    ) {
      throw new TikTokApiError({
        category: "INVALID_PARAMETERS",
        message: `Outbound TikTok HTTP requests are blocked in '${mode}' mode without a mocked fetch transport.`,
        retryable: false,
      });
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public buildUrl(
    endpointPath: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    const cleanPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
    const url = new URL(`${this.baseUrl}${cleanPath}`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private computeRetryDelayMs(attempt: number, retryAfterMs: number | null): number {
    if (retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
      return Math.min(retryAfterMs, this.maxRetryDelayMs);
    }
    const exponential = this.retryBaseDelayMs * Math.pow(2, attempt);
    return Math.min(exponential, this.maxRetryDelayMs);
  }

  private async executeWithRetry<T>(
    meta: { method: string; path: string; allowRetry: boolean },
    operation: () => Promise<T>,
  ): Promise<T> {
    let attempt = 0;

    while (true) {
      try {
        return await operation();
      } catch (err) {
        const apiError =
          err instanceof TikTokApiError
            ? err
            : new TikTokApiError({
                category: "NETWORK_ERROR",
                message: err instanceof Error ? err.message : "Network request to TikTok API failed",
                retryable: true,
                cause: err,
              });

        const canRetry = meta.allowRetry && apiError.retryable && attempt < this.maxRetries;
        if (!canRetry) {
          this.logger.error("request_failed", {
            method: meta.method,
            path: meta.path,
            attempt,
            error: apiError.toLogObject(),
          });
          throw apiError;
        }

        const delayMs = this.computeRetryDelayMs(attempt, apiError.retryAfterMs);
        this.logger.warn("request_retrying", {
          method: meta.method,
          path: meta.path,
          attempt: attempt + 1,
          delayMs,
          category: apiError.category,
          tiktokCode: apiError.tiktokCode,
          httpStatus: apiError.httpStatus,
        });

        attempt += 1;
        await this.sleepImpl(delayMs);
      }
    }
  }

  /**
   * Executes a JSON request against TikTok Business API v1.3, validates the envelope,
   * classifies TikTok numeric return codes, and optionally validates `data` with Zod.
   */
  public async requestJson<TData = unknown>(
    options: TikTokJsonRequestOptions<TData>,
  ): Promise<TikTokJsonResponse<TData>> {
    this.assertOutboundNetworkPermitted();
    const url = this.buildUrl(options.path, options.query);
    const allowRetry = options.idempotent ?? options.method === "GET";

    return this.executeWithRetry(
      { method: options.method, path: options.path, allowRetry },
      async () => {
        const headers: Record<string, string> = {
          Accept: "application/json",
          ...(options.method === "POST" ? { "Content-Type": "application/json" } : {}),
          ...(options.headers ?? {}),
        };
        if (options.accessToken) {
          headers["Access-Token"] = options.accessToken;
        }

        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            method: options.method,
            headers,
            body: options.method === "POST" && options.body ? JSON.stringify(options.body) : undefined,
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (networkErr) {
          throw new TikTokApiError({
            category: "NETWORK_ERROR",
            message:
              networkErr instanceof Error
                ? `TikTok network failure: ${networkErr.message}`
                : "TikTok network request failed",
            retryable: true,
            cause: networkErr,
          });
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        const rawText = await response.text();

        let parsedJson: unknown;
        try {
          parsedJson = rawText ? JSON.parse(rawText) : null;
        } catch (parseErr) {
          if (!response.ok) {
            throw classifyTikTokApiError({
              httpStatus: response.status,
              message: `TikTok API HTTP ${response.status} with non-JSON response`,
              retryAfterMs,
            });
          }
          throw new TikTokApiError({
            category: "RESPONSE_VALIDATION_ERROR",
            message: "TikTok API returned invalid JSON payload",
            httpStatus: response.status,
            retryable: false,
            cause: parseErr,
          });
        }

        const envelopeResult = tikTokApiEnvelopeSchema.safeParse(parsedJson);
        if (!envelopeResult.success) {
          if (!response.ok) {
            throw classifyTikTokApiError({
              httpStatus: response.status,
              message: `TikTok API HTTP ${response.status} unexpected envelope`,
              retryAfterMs,
            });
          }
          throw new TikTokApiError({
            category: "RESPONSE_VALIDATION_ERROR",
            message: `TikTok API envelope validation failed: ${envelopeResult.error.issues[0]?.message ?? "invalid shape"}`,
            httpStatus: response.status,
            retryable: false,
          });
        }

        const envelope = envelopeResult.data;
        if (!response.ok || envelope.code !== TIKTOK_RETURN_CODES.OK) {
          throw classifyTikTokApiError({
            tiktokCode: envelope.code !== TIKTOK_RETURN_CODES.OK ? envelope.code : null,
            httpStatus: response.status,
            message: envelope.message || `TikTok API returned code ${envelope.code}`,
            requestId: envelope.request_id ?? null,
            retryAfterMs,
          });
        }

        let validatedData: TData;
        if (options.dataSchema) {
          const dataResult = options.dataSchema.safeParse(envelope.data);
          if (!dataResult.success) {
            throw new TikTokApiError({
              category: "RESPONSE_VALIDATION_ERROR",
              message: `TikTok API payload schema mismatch: ${dataResult.error.issues[0]?.message ?? "invalid data"}`,
              tiktokCode: envelope.code,
              httpStatus: response.status,
              requestId: envelope.request_id ?? null,
              retryable: false,
            });
          }
          validatedData = dataResult.data;
        } else {
          validatedData = envelope.data as TData;
        }

        return {
          code: envelope.code,
          message: envelope.message,
          requestId: envelope.request_id ?? null,
          data: validatedData,
        };
      },
    );
  }

  /**
   * Executes a binary/CSV download request (e.g. GET /open_api/v1.3/page/lead/task/download/).
   * Automatically detects if TikTok returns a JSON error envelope instead of a CSV/ZIP stream.
   */
  public async requestBinary(options: TikTokBinaryRequestOptions): Promise<TikTokBinaryResponse> {
    this.assertOutboundNetworkPermitted();
    const url = this.buildUrl(options.path, options.query);

    return this.executeWithRetry(
      { method: "GET", path: options.path, allowRetry: true },
      async () => {
        const headers: Record<string, string> = {
          "Access-Token": options.accessToken,
          ...(options.headers ?? {}),
        };

        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(this.timeoutMs),
          });
        } catch (networkErr) {
          throw new TikTokApiError({
            category: "NETWORK_ERROR",
            message:
              networkErr instanceof Error
                ? `TikTok download network failure: ${networkErr.message}`
                : "TikTok download request failed",
            retryable: true,
            cause: networkErr,
          });
        }

        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        const contentType = (response.headers.get("content-type") || "application/octet-stream").toLowerCase();
        const requestId = response.headers.get("x-tt-logid") || null;
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // TikTok returns JSON error envelopes even on download endpoints when token/task fails
        if (contentType.includes("application/json") || !response.ok) {
          const textBody = buffer.toString("utf8").trim();
          try {
            const parsed = JSON.parse(textBody);
            const env = tikTokApiEnvelopeSchema.safeParse(parsed);
            if (env.success && env.data.code !== TIKTOK_RETURN_CODES.OK) {
              throw classifyTikTokApiError({
                tiktokCode: env.data.code,
                httpStatus: response.status,
                message: env.data.message,
                requestId: env.data.request_id ?? requestId,
                retryAfterMs,
              });
            }
          } catch (inner) {
            if (inner instanceof TikTokApiError) throw inner;
          }

          if (!response.ok) {
            throw classifyTikTokApiError({
              httpStatus: response.status,
              message: `TikTok binary download failed with HTTP ${response.status}`,
              requestId,
              retryAfterMs,
            });
          }
        }

        return {
          contentType,
          body: buffer,
          text: buffer.toString("utf8"),
          requestId,
        };
      },
    );
  }
}
