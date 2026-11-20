/**
 * ORVA Store — TikTok Lead Synchronization, Async Task Polling & Webhook Engine (Phase A2)
 *
 * Official TikTok Business API v1.3 Endpoints Verified:
 * - Async Lead Export Task Create/Poll: POST /open_api/v1.3/page/lead/task/
 * - Async Lead Export Download:         GET  /open_api/v1.3/page/lead/task/download/
 * - Webhook Verification Header:        TikTok-Signature: t=<unix_ts>,s=<hmac_sha256_hex>
 *
 * Capabilities:
 * 1. Manual & scheduled Lead synchronization per form or across all enabled forms.
 * 2. Webhook signature verification (constant-time HMAC-SHA256 + replay window) & ingestion.
 * 3. Async Lead export task creation, bounded exponential backoff polling, and download.
 * 4. Pure Node.js ZIP (node:zlib, zip-bomb protected), UTF-8 CSV, and JSON response extraction.
 * 5. Concurrency locks (per-form sync lock + per-lead processing lock) + DB idempotency.
 * 6. Failed / unmapped Lead retry and bounded historical reconciliation (<= 90-day TikTok window).
 * 7. Structured synchronization audit logs persisted to public.tiktok_sync_logs.
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import crypto from "node:crypto";
import zlib from "node:zlib";
import { z } from "zod";
import type { Product } from "@/lib/repository/product-types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { LiveTariff } from "@/lib/types/checkout";
import { TikTokApiClient } from "./client";
import {
  type RawTikTokLeadInput,
  type TikTokTelegramNotifyOptions,
  extractLeadsFromWebhookPayload,
  parseTikTokLeadsCsv,
  processNormalizedTikTokLead,
} from "./leads";
import { type TikTokOAuthConfigOverrides, createTikTokRefreshHandler } from "./oauth";
import { TikTokTokenManager } from "./token-manager";
import {
  DEFAULT_ORVA_STORE_ID,
  TikTokApiError,
  type TikTokFormRow,
  type TikTokLeadRow,
  type TikTokMockLeadData,
  type TikTokSyncLogRow,
  type TikTokSyncRunStatus,
  type TikTokSyncTriggerSource,
  redactSensitiveForLog,
  tikTokMockLeadDataSchema,
} from "./types";

const MAX_ZIP_ENTRIES = 50;
const MAX_ZIP_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25 MB zip-bomb cap
const TIKTOK_LEAD_RETENTION_MAX_DAYS = 90;
const DEFAULT_WEBHOOK_MAX_AGE_SECONDS = 300; // 5 minutes replay tolerance

const ALLOWED_DOWNLOAD_HOST_SUFFIXES = [
  ".tiktok.com",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".tiktokcdn-eu.com",
  ".byteoversea.com",
  ".ibytedtos.com",
];

const tikTokLeadTaskDataSchema = z
  .object({
    task_id: z.union([z.string(), z.number()]).transform(String).optional(),
    status: z.string().optional(),
    file_url: z.string().optional(),
  })
  .passthrough();

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function getDb(): any {
  try {
    return getSupabaseServerClient() as any;
  } catch (err) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: "Supabase service-role client unavailable for TikTok sync operations (fail-closed).",
      retryable: false,
      cause: err,
    });
  }
}

async function propagateAuthFailure(
  err: unknown,
  storeId: string,
  tokenManager: TikTokTokenManager,
): Promise<never> {
  if (err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED") {
    const nextStatus = /revok/i.test(err.message) ? "revoked" : "token_expired";
    try {
      await tokenManager.markConnectionStatus(storeId, nextStatus, err.message);
    } catch {
      // Preserve primary upstream error
    }
  }
  throw err;
}

// ── 1. Concurrency Protection Locks ──────────────────────────────────────────

const activeSyncLocks = new Map<string, Promise<unknown>>();
const activeLeadLocks = new Map<string, Promise<unknown>>();

/**
 * Serializes concurrent processing of the exact same external_lead_id within an isolate
 * so overlapping webhook retries wait and resolve cleanly via idempotency without racing.
 */
async function withLeadProcessingLock<T>(externalLeadId: string, operation: () => Promise<T>): Promise<T> {
  const previous = activeLeadLocks.get(externalLeadId) ?? Promise.resolve();
  let release!: () => void;
  const currentGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => currentGate);
  activeLeadLocks.set(externalLeadId, chained);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (activeLeadLocks.get(externalLeadId) === chained) {
      activeLeadLocks.delete(externalLeadId);
    }
  }
}

export function __testResetTikTokSyncLocks(): void {
  activeSyncLocks.clear();
  activeLeadLocks.clear();
}

// ── 2. Webhook Signature Verification (HMAC-SHA256 + Replay Window) ──────────

export interface VerifyWebhookSignatureResult {
  valid: boolean;
  timestamp?: number;
  reason?: string;
}

/**
 * Verifies TikTok's official `TikTok-Signature: t=<unix_ts>,s=<hmac_sha256_hex>` header
 * against raw unparsed request text using crypto.timingSafeEqual and a 5-minute replay window.
 *
 * Phase B's `/api/integrations/tiktok/webhook` MUST invoke this unconditionally before calling
 * processWebhookLeadEvent().
 */
export function verifyTikTokWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null | undefined;
  secret?: string;
  maxAgeSeconds?: number;
  nowSec?: number;
}): VerifyWebhookSignatureResult {
  const secret = (
    params.secret ??
    process.env.TIKTOK_WEBHOOK_SECRET ??
    process.env.TIKTOK_APP_SECRET ??
    ""
  ).trim();

  if (!secret) {
    return { valid: false, reason: "TikTok webhook verification secret is not configured." };
  }

  const header = (params.signatureHeader || "").trim();
  if (!header) {
    return { valid: false, reason: "Missing TikTok-Signature header." };
  }

  let timestampStr = "";
  let signatureHex = "";
  for (const part of header.split(",")) {
    const [k, ...rest] = part.trim().split("=");
    const key = (k || "").trim().toLowerCase();
    const val = rest.join("=").trim();
    if (key === "t") timestampStr = val;
    if (key === "s") signatureHex = val.toLowerCase();
  }

  if (!timestampStr || !/^\d{9,13}$/.test(timestampStr) || !signatureHex || !/^[0-9a-f]{64}$/.test(signatureHex)) {
    return { valid: false, reason: "Malformed TikTok-Signature header format." };
  }

  const parsedTs = Number.parseInt(timestampStr, 10);
  const tsSeconds = timestampStr.length > 10 ? Math.floor(parsedTs / 1000) : parsedTs;
  const nowSec = params.nowSec ?? Math.floor(Date.now() / 1000);
  const maxAge = Math.max(30, params.maxAgeSeconds ?? DEFAULT_WEBHOOK_MAX_AGE_SECONDS);

  if (Math.abs(nowSec - tsSeconds) > maxAge) {
    return {
      valid: false,
      timestamp: tsSeconds,
      reason: "TikTok webhook signature timestamp is outside the allowed replay window.",
    };
  }

  const signedPayload = `${timestampStr}.${params.rawBody}`;
  const expectedHex = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  const providedBuf = Buffer.from(signatureHex, "hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");
  if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return { valid: false, timestamp: tsSeconds, reason: "TikTok webhook HMAC signature mismatch." };
  }

  return { valid: true, timestamp: tsSeconds };
}

// ── 3. Pure Node.js ZIP Archive & Multi-Format Export Extractor ──────────────

const ZIP_LOCAL_HEADER_SIG = 0x04034b50;
const ZIP_CENTRAL_DIR_SIG = 0x02014b50;
const ZIP_EOCD_SIG = 0x06054b50;

export function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === ZIP_LOCAL_HEADER_SIG;
}

/**
 * Pure Node.js (node:zlib) ZIP CSV extractor with strict zip-bomb & path-traversal protection.
 * Supports compression methods 0 (STORE) and 8 (DEFLATE) used by TikTok bulk lead exports (> 10 MB).
 */
export function extractCsvFilesFromZipBuffer(
  zipBuffer: Buffer,
  limits?: { maxEntries?: number; maxUncompressedBytes?: number },
): Array<{ fileName: string; content: string }> {
  const maxEntries = limits?.maxEntries ?? MAX_ZIP_ENTRIES;
  const maxUncompressed = limits?.maxUncompressedBytes ?? MAX_ZIP_UNCOMPRESSED_BYTES;

  if (!isZipBuffer(zipBuffer)) {
    throw new TikTokApiError({
      category: "RESPONSE_VALIDATION_ERROR",
      message: "Downloaded TikTok ZIP export does not have a valid PKZIP header.",
    });
  }

  // Locate End of Central Directory (EOCD) scanning backwards from end of buffer
  const minOffset = Math.max(0, zipBuffer.length - 65_557);
  let eocdOffset = -1;
  for (let pos = zipBuffer.length - 22; pos >= minOffset; pos -= 1) {
    if (zipBuffer.readUInt32LE(pos) === ZIP_EOCD_SIG) {
      eocdOffset = pos;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new TikTokApiError({
      category: "RESPONSE_VALIDATION_ERROR",
      message: "Corrupted TikTok ZIP export: End of Central Directory record missing.",
    });
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries > maxEntries) {
    throw new TikTokApiError({
      category: "RESPONSE_VALIDATION_ERROR",
      message: `TikTok ZIP export exceeds maximum allowed file entries (${totalEntries} > ${maxEntries}).`,
    });
  }

  if (centralDirOffset + centralDirSize > zipBuffer.length) {
    throw new TikTokApiError({
      category: "RESPONSE_VALIDATION_ERROR",
      message: "Corrupted TikTok ZIP export: Central Directory bounds exceed archive size.",
    });
  }

  const csvFiles: Array<{ fileName: string; content: string }> = [];
  let offset = centralDirOffset;
  let totalUncompressedBytes = 0;

  for (let i = 0; i < totalEntries; i += 1) {
    if (offset + 46 > zipBuffer.length || zipBuffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIR_SIG) {
      throw new TikTokApiError({
        category: "RESPONSE_VALIDATION_ERROR",
        message: "Corrupted TikTok ZIP export: invalid Central Directory entry.",
      });
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const declaredUncompressedSize = zipBuffer.readUInt32LE(offset + 24);
    const nameLen = zipBuffer.readUInt16LE(offset + 28);
    const extraLen = zipBuffer.readUInt16LE(offset + 30);
    const commentLen = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);

    const fileName = zipBuffer.toString("utf8", offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;

    // Security: Reject path traversal attempts
    if (fileName.includes("..") || fileName.startsWith("/") || fileName.startsWith("\\")) {
      throw new TikTokApiError({
        category: "RESPONSE_VALIDATION_ERROR",
        message: "Unsafe file path detected inside TikTok ZIP export.",
      });
    }

    // Skip directories & non-CSV files
    if (fileName.endsWith("/") || !fileName.toLowerCase().endsWith(".csv")) {
      continue;
    }

    if (declaredUncompressedSize > maxUncompressed) {
      throw new TikTokApiError({
        category: "RESPONSE_VALIDATION_ERROR",
        message: "TikTok ZIP entry exceeds maximum uncompressed safety limit (zip-bomb protection).",
      });
    }

    if (
      localHeaderOffset + 30 > zipBuffer.length ||
      zipBuffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_HEADER_SIG
    ) {
      throw new TikTokApiError({
        category: "RESPONSE_VALIDATION_ERROR",
        message: "Corrupted TikTok ZIP export: invalid local file header.",
      });
    }

    const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length) {
      throw new TikTokApiError({
        category: "RESPONSE_VALIDATION_ERROR",
        message: "Corrupted TikTok ZIP export: compressed entry truncated.",
      });
    }

    const compressedSlice = zipBuffer.subarray(dataStart, dataEnd);
    let inflated: Buffer;
    if (compressionMethod === 0) {
      inflated = compressedSlice;
    } else if (compressionMethod === 8) {
      inflated = zlib.inflateRawSync(compressedSlice, { maxOutputLength: maxUncompressed });
    } else {
      throw new TikTokApiError({
        category: "RESPONSE_VALIDATION_ERROR",
        message: `Unsupported ZIP compression method (${compressionMethod}) in TikTok export.`,
      });
    }

    totalUncompressedBytes += inflated.length;
    if (totalUncompressedBytes > maxUncompressed) {
      throw new TikTokApiError({
        category: "RESPONSE_VALIDATION_ERROR",
        message: "TikTok ZIP export total decompressed size exceeds 25 MB safety limit.",
      });
    }

    csvFiles.push({
      fileName,
      content: inflated.toString("utf8"),
    });
  }

  return csvFiles;
}

function isAllowedTikTokFileUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWED_DOWNLOAD_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

/**
 * Extracts RawTikTokLeadInput[] from a downloaded TikTok export payload supporting:
 * - ZIP archives (> 10 MB exports containing CSV files)
 * - Direct UTF-8 CSV streams (<= 10 MB exports)
 * - JSON responses (direct JSON lead arrays OR allowlisted HTTPS `file_url` redirect)
 */
export async function extractLeadsFromDownloadedExport(params: {
  contentType: string;
  body: Buffer;
  formId: string;
  advertiserId: string;
  fetchImpl?: typeof fetch;
  allowExternalFileUrl?: boolean;
  depth?: number;
}): Promise<RawTikTokLeadInput[]> {
  const depth = params.depth ?? 0;
  if (depth > 1) {
    throw new TikTokApiError({
      category: "RESPONSE_VALIDATION_ERROR",
      message: "Exceeded maximum redirect depth while unpacking TikTok lead export.",
    });
  }

  const ct = (params.contentType || "").toLowerCase();

  // 1. ZIP archive
  if (isZipBuffer(params.body) || ct.includes("zip")) {
    const csvFiles = extractCsvFilesFromZipBuffer(params.body);
    const leads: RawTikTokLeadInput[] = [];
    for (const file of csvFiles) {
      leads.push(
        ...parseTikTokLeadsCsv(file.content, {
          formId: params.formId,
          advertiserId: params.advertiserId,
        }),
      );
    }
    return leads;
  }

  // 2. JSON payload (either direct lead list or signed TikTok file_url)
  const text = params.body.toString("utf8").trim();
  if (!text) return [];

  if (ct.includes("json") || text.startsWith("{") || text.startsWith("[")) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      // Fall through to CSV parser if it merely started with a quote/bracket character
      parsedJson = null;
    }

    if (parsedJson !== null && typeof parsedJson === "object") {
      const rec = parsedJson as Record<string, unknown>;
      const dataObj = rec.data && typeof rec.data === "object" ? (rec.data as Record<string, unknown>) : rec;
      const fileUrl = typeof dataObj.file_url === "string" ? dataObj.file_url.trim() : "";

      if (fileUrl) {
        if (!isAllowedTikTokFileUrl(fileUrl)) {
          throw new TikTokApiError({
            category: "RESPONSE_VALIDATION_ERROR",
            message: "Rejected untrusted TikTok lead export file_url domain (SSRF protection).",
          });
        }
        const fetchImpl = params.fetchImpl ?? globalThis.fetch.bind(globalThis);
        const dlRes = await fetchImpl(fileUrl, {
          method: "GET",
          signal: AbortSignal.timeout(15_000),
        });
        if (!dlRes.ok) {
          throw new TikTokApiError({
            category: "UPSTREAM_SERVER_ERROR",
            httpStatus: dlRes.status,
            retryable: dlRes.status >= 500 || dlRes.status === 429,
            message: `Failed to download TikTok lead file_url (HTTP ${dlRes.status}).`,
          });
        }
        const buf = Buffer.from(await dlRes.arrayBuffer());
        return extractLeadsFromDownloadedExport({
          contentType: dlRes.headers.get("content-type") || "text/csv",
          body: buf,
          formId: params.formId,
          advertiserId: params.advertiserId,
          fetchImpl: params.fetchImpl,
          depth: depth + 1,
        });
      }

      return extractLeadsFromWebhookPayload(parsedJson, {
        formId: params.formId,
        advertiserId: params.advertiserId,
      });
    }
  }

  // 3. Direct UTF-8 CSV stream
  return parseTikTokLeadsCsv(text, {
    formId: params.formId,
    advertiserId: params.advertiserId,
  });
}

// ── 4. Async Lead Export Task Creation, Polling & Download ───────────────────

export interface CreateLeadExportTaskResult {
  taskId: string;
  status: string;
  fileUrl: string | null;
}

export async function createLeadExportTask(params: {
  accessToken: string;
  advertiserId: string;
  pageId: string;
  startTime?: string;
  endTime?: string;
  client?: TikTokApiClient;
  configOverrides?: TikTokOAuthConfigOverrides;
}): Promise<CreateLeadExportTaskResult> {
  const client =
    params.client ??
    new TikTokApiClient({ sandboxMode: params.configOverrides?.sandboxMode });
  const body: Record<string, unknown> = {
    advertiser_id: params.advertiserId,
    page_id: params.pageId,
    task_type: "LEAD_DOWNLOAD",
  };
  if (params.startTime) body.start_time = params.startTime;
  if (params.endTime) body.end_time = params.endTime;

  const res = await client.requestJson({
    method: "POST",
    path: "/page/lead/task/",
    accessToken: params.accessToken,
    body,
    dataSchema: tikTokLeadTaskDataSchema,
    idempotent: false,
  });

  const taskId = (res.data.task_id || "").trim();
  if (!taskId) {
    throw new TikTokApiError({
      category: "RESPONSE_VALIDATION_ERROR",
      message: "TikTok /page/lead/task/ did not return a valid task_id.",
      requestId: res.requestId,
    });
  }

  return {
    taskId,
    status: (res.data.status || "PROCESSING").toUpperCase(),
    fileUrl: res.data.file_url ?? null,
  };
}

export interface PollLeadExportTaskResult {
  taskId: string;
  status: "SUCCEED";
  attempts: number;
  fileUrl: string | null;
}

function isTaskSucceededStatus(status: string): boolean {
  return ["SUCCEED", "SUCCESS", "COMPLETED", "DONE"].includes(status.toUpperCase());
}

function isTaskFailedStatus(status: string): boolean {
  return ["FAILED", "FAIL", "ERROR", "EXPIRED", "CANCELLED"].includes(status.toUpperCase());
}

/**
 * Polls TikTok's async lead export task status using bounded exponential backoff
 * until status transitions to SUCCEED (or fails / exceeds maxAttempts).
 */
export async function pollLeadExportTask(params: {
  accessToken: string;
  advertiserId: string;
  pageId: string;
  taskId: string;
  initialStatus?: string;
  initialFileUrl?: string | null;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  client?: TikTokApiClient;
  configOverrides?: TikTokOAuthConfigOverrides;
}): Promise<PollLeadExportTaskResult> {
  if (params.initialStatus && isTaskSucceededStatus(params.initialStatus)) {
    return {
      taskId: params.taskId,
      status: "SUCCEED",
      attempts: 0,
      fileUrl: params.initialFileUrl ?? null,
    };
  }
  if (params.initialStatus && isTaskFailedStatus(params.initialStatus)) {
    throw new TikTokApiError({
      category: "UPSTREAM_SERVER_ERROR",
      retryable: false,
      message: `TikTok async lead task '${params.taskId}' failed immediately (status: ${params.initialStatus}).`,
    });
  }

  const client =
    params.client ??
    new TikTokApiClient({ sandboxMode: params.configOverrides?.sandboxMode });
  const sleep = params.sleepImpl ?? defaultSleep;
  const maxAttempts = Math.min(Math.max(params.maxAttempts ?? 6, 1), 20);
  const baseDelayMs = Math.max(0, params.baseDelayMs ?? 1_500);
  const maxDelayMs = Math.max(baseDelayMs, params.maxDelayMs ?? 10_000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
    if (delayMs > 0) {
      await sleep(delayMs);
    }

    const res = await client.requestJson({
      method: "POST",
      path: "/page/lead/task/",
      accessToken: params.accessToken,
      body: {
        advertiser_id: params.advertiserId,
        page_id: params.pageId,
        task_id: params.taskId,
      },
      dataSchema: tikTokLeadTaskDataSchema,
      idempotent: true,
    });

    const status = (res.data.status || "PROCESSING").toUpperCase();
    if (isTaskSucceededStatus(status)) {
      return {
        taskId: params.taskId,
        status: "SUCCEED",
        attempts: attempt,
        fileUrl: res.data.file_url ?? null,
      };
    }

    if (isTaskFailedStatus(status)) {
      throw new TikTokApiError({
        category: "UPSTREAM_SERVER_ERROR",
        retryable: false,
        requestId: res.requestId,
        message: `TikTok async lead export task '${params.taskId}' failed with status '${status}'.`,
      });
    }
  }

  throw new TikTokApiError({
    category: "UPSTREAM_SERVER_ERROR",
    retryable: true,
    message: `TikTok async lead export task '${params.taskId}' did not complete after ${maxAttempts} poll attempts.`,
  });
}

export async function downloadLeadExportTask(params: {
  accessToken: string;
  advertiserId: string;
  taskId: string;
  client?: TikTokApiClient;
  configOverrides?: TikTokOAuthConfigOverrides;
}) {
  const client =
    params.client ??
    new TikTokApiClient({ sandboxMode: params.configOverrides?.sandboxMode });
  return client.requestBinary({
    path: "/page/lead/task/download/",
    accessToken: params.accessToken,
    query: {
      advertiser_id: params.advertiserId,
      task_id: params.taskId,
    },
  });
}

// ── 5. Synchronization Audit Log Writer ──────────────────────────────────────

export interface SyncMetricsSummary {
  leadsFetched: number;
  leadsImported: number;
  ordersCreated: number;
  duplicatesSkipped: number;
  leadsFailed: number;
  durationMs: number;
  status: TikTokSyncRunStatus;
  errorMessage: string | null;
  skippedConcurrent?: boolean;
  logId?: string | null;
  /** Detached non-blocking post-order promises (e.g., opt-in Telegram alerts) for Next.js after(). */
  backgroundTasks?: Array<Promise<unknown>>;
}

export async function writeTikTokSyncLog(entry: {
  storeId?: string;
  advertiserId?: string | null;
  formId?: string | null;
  triggerSource: TikTokSyncTriggerSource;
  status: TikTokSyncRunStatus;
  leadsFetched: number;
  leadsImported: number;
  ordersCreated: number;
  duplicatesSkipped: number;
  leadsFailed: number;
  durationMs: number;
  errorMessage?: string | null;
  details?: Record<string, unknown>;
  startedAt: string;
  completedAt: string;
}): Promise<TikTokSyncLogRow | null> {
  try {
    const db = getDb();
    const safeDetails = redactSensitiveForLog(entry.details ?? {}) as Record<string, unknown>;
    const { data, error } = await db
      .from("tiktok_sync_logs")
      .insert({
        store_id: (entry.storeId || DEFAULT_ORVA_STORE_ID).trim(),
        advertiser_id: entry.advertiserId ?? null,
        form_id: entry.formId ?? null,
        trigger_source: entry.triggerSource,
        status: entry.status,
        leads_fetched: Math.max(0, entry.leadsFetched),
        leads_imported: Math.max(0, entry.leadsImported),
        orders_created: Math.max(0, entry.ordersCreated),
        duplicates_skipped: Math.max(0, entry.duplicatesSkipped),
        leads_failed: Math.max(0, entry.leadsFailed),
        duration_ms: Math.max(0, Math.round(entry.durationMs)),
        error_message: entry.errorMessage ? String(entry.errorMessage).slice(0, 1000) : null,
        details: safeDetails,
        started_at: entry.startedAt,
        completed_at: entry.completedAt,
      })
      .select("*")
      .single();

    if (error) {
      console.warn("[TikTok Sync Log Warning]:", error.message);
      return null;
    }
    return (data as TikTokSyncLogRow) ?? null;
  } catch (err) {
    console.warn("[TikTok Sync Log Exception]:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ── 6. High-Level Synchronization Orchestrators ──────────────────────────────

export interface TikTokSyncDeps {
  storeId?: string;
  client?: TikTokApiClient;
  tokenManager?: TikTokTokenManager;
  configOverrides?: TikTokOAuthConfigOverrides;
  catalogGetProduct?: (id: string) => Promise<Product | null>;
  loadLiveDeliveryFees?: () => Promise<Record<number, LiveTariff> | null>;
  telegramOptions?: TikTokTelegramNotifyOptions;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  nowMs?: () => number;
  pollMaxAttempts?: number;
  pollBaseDelayMs?: number;
}

async function processLeadBatch(
  leads: RawTikTokLeadInput[],
  deps: TikTokSyncDeps & { allowRetryExisting?: boolean },
): Promise<{
  leadsFetched: number;
  leadsImported: number;
  ordersCreated: number;
  duplicatesSkipped: number;
  leadsFailed: number;
  failedLeadIds: string[];
  backgroundTasks: Array<Promise<unknown>>;
}> {
  let leadsImported = 0;
  let ordersCreated = 0;
  let duplicatesSkipped = 0;
  let leadsFailed = 0;
  const failedLeadIds: string[] = [];
  const backgroundTasks: Array<Promise<unknown>> = [];

  for (const lead of leads) {
    const outcome = await withLeadProcessingLock(lead.externalLeadId, () =>
      processNormalizedTikTokLead({
        storeId: deps.storeId,
        lead,
        allowRetryExisting: deps.allowRetryExisting,
        catalogGetProduct: deps.catalogGetProduct,
        loadLiveDeliveryFees: deps.loadLiveDeliveryFees,
        telegramOptions: deps.telegramOptions,
        nowMs: deps.nowMs,
      }),
    );

    if (outcome.telegramNotificationPromise) {
      backgroundTasks.push(outcome.telegramNotificationPromise);
    }

    if (outcome.syncStatus === "order_created") {
      leadsImported += 1;
      ordersCreated += 1;
    } else if (outcome.syncStatus === "lead_saved_no_order") {
      leadsImported += 1;
    } else if (outcome.syncStatus === "duplicate_skipped") {
      duplicatesSkipped += 1;
    } else {
      // invalid_phone, unmapped_form, order_creation_failed
      leadsFailed += 1;
      failedLeadIds.push(lead.externalLeadId);
    }
  }

  return {
    leadsFetched: leads.length,
    leadsImported,
    ordersCreated,
    duplicatesSkipped,
    leadsFailed,
    failedLeadIds,
    backgroundTasks,
  };
}

function determineRunStatus(counts: {
  leadsFetched: number;
  leadsImported: number;
  duplicatesSkipped: number;
  leadsFailed: number;
}): TikTokSyncRunStatus {
  if (counts.leadsFailed === 0) return "success";
  if (counts.leadsImported > 0 || counts.duplicatesSkipped > 0) return "partial";
  return "failed";
}

/**
 * 1. Manual / Scheduled / Reconciliation Lead Sync for a single Instant Form.
 * Runs Create Task -> Poll Task -> Download (CSV/ZIP/JSON) -> Normalize & Persist -> Audit Log.
 * Guarded by an isolate-level concurrency lock preventing duplicate overlapping export runs.
 */
export async function syncFormLeads(
  params: TikTokSyncDeps & {
    advertiserId: string;
    formId: string;
    triggerSource?: TikTokSyncTriggerSource;
    startTime?: string;
    endTime?: string;
  },
): Promise<SyncMetricsSummary> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const advertiserId = (params.advertiserId || "").trim();
  const formId = (params.formId || "").trim();
  const triggerSource: TikTokSyncTriggerSource = params.triggerSource ?? "manual";
  const nowFn = params.nowMs ?? Date.now;

  if (!advertiserId || !formId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "advertiserId and formId are required for syncFormLeads().",
    });
  }

  const lockKey = `sync:${storeId}:${advertiserId}:${formId}`;
  if (activeSyncLocks.has(lockKey)) {
    return {
      leadsFetched: 0,
      leadsImported: 0,
      ordersCreated: 0,
      duplicatesSkipped: 0,
      leadsFailed: 0,
      durationMs: 0,
      status: "partial",
      errorMessage: "A synchronization run is already in progress for this form.",
      skippedConcurrent: true,
      logId: null,
    };
  }

  const runPromise = (async (): Promise<SyncMetricsSummary> => {
    const startedMs = nowFn();
    const startedAt = new Date(startedMs).toISOString();
    const client =
      params.client ??
      new TikTokApiClient({
        sandboxMode: params.configOverrides?.sandboxMode,
        sleepImpl: params.sleepImpl,
      });
    const tokenManager = params.tokenManager ?? new TikTokTokenManager();

    try {
      const { accessToken } = await tokenManager.getValidAccessToken({
        storeId,
        refreshHandler: createTikTokRefreshHandler({
          client,
          configOverrides: params.configOverrides,
          nowMs: params.nowMs,
        }),
      });

      // Step 1: Create async lead export task
      const createdTask = await createLeadExportTask({
        accessToken,
        advertiserId,
        pageId: formId,
        startTime: params.startTime,
        endTime: params.endTime,
        client,
      });

      // Step 2: Poll async task status until SUCCEED
      const polled = await pollLeadExportTask({
        accessToken,
        advertiserId,
        pageId: formId,
        taskId: createdTask.taskId,
        initialStatus: createdTask.status,
        initialFileUrl: createdTask.fileUrl,
        maxAttempts: params.pollMaxAttempts,
        baseDelayMs: params.pollBaseDelayMs,
        sleepImpl: params.sleepImpl,
        client,
      });

      // Step 3: Download CSV/ZIP/JSON file
      let rawLeads: RawTikTokLeadInput[];
      if (polled.fileUrl) {
        const jsonBuf = Buffer.from(JSON.stringify({ file_url: polled.fileUrl }), "utf8");
        rawLeads = await extractLeadsFromDownloadedExport({
          contentType: "application/json",
          body: jsonBuf,
          formId,
          advertiserId,
          fetchImpl: params.fetchImpl,
        });
      } else {
        const download = await downloadLeadExportTask({
          accessToken,
          advertiserId,
          taskId: createdTask.taskId,
          client,
        });

        rawLeads = await extractLeadsFromDownloadedExport({
          contentType: download.contentType,
          body: download.body,
          formId,
          advertiserId,
          fetchImpl: params.fetchImpl,
        });
      }

      // Step 4: Normalize, deduplicate, and create pending orders
      const batch = await processLeadBatch(rawLeads, params);
      const completedMs = nowFn();
      const completedAt = new Date(completedMs).toISOString();
      const durationMs = Math.max(0, completedMs - startedMs);
      const runStatus = determineRunStatus(batch);

      // Update form last_synced_at
      try {
        const db = getDb();
        await db
          .from("tiktok_forms")
          .update({ last_synced_at: completedAt, updated_at: completedAt })
          .eq("store_id", storeId)
          .eq("form_id", formId);
      } catch {
        // Non-fatal metadata update
      }

      const logRow = await writeTikTokSyncLog({
        storeId,
        advertiserId,
        formId,
        triggerSource,
        status: runStatus,
        leadsFetched: batch.leadsFetched,
        leadsImported: batch.leadsImported,
        ordersCreated: batch.ordersCreated,
        duplicatesSkipped: batch.duplicatesSkipped,
        leadsFailed: batch.leadsFailed,
        durationMs,
        errorMessage:
          batch.leadsFailed > 0
            ? `${batch.leadsFailed} lead(s) require admin review (invalid phone, unmapped form, or order failure).`
            : null,
        details: {
          taskId: createdTask.taskId,
          pollAttempts: polled.attempts,
          failedLeadIds: batch.failedLeadIds,
        },
        startedAt,
        completedAt,
      });

      return {
        leadsFetched: batch.leadsFetched,
        leadsImported: batch.leadsImported,
        ordersCreated: batch.ordersCreated,
        duplicatesSkipped: batch.duplicatesSkipped,
        leadsFailed: batch.leadsFailed,
        durationMs,
        status: runStatus,
        errorMessage: logRow?.error_message ?? null,
        logId: logRow?.id ?? null,
        backgroundTasks: batch.backgroundTasks,
      };
    } catch (err) {
      const completedMs = nowFn();
      const completedAt = new Date(completedMs).toISOString();
      const durationMs = Math.max(0, completedMs - startedMs);
      const safeMessage = err instanceof Error ? err.message : "TikTok form sync failed.";

      if (err instanceof TikTokApiError && err.category === "AUTH_TOKEN_EXPIRED") {
        try {
          await propagateAuthFailure(err, storeId, tokenManager);
        } catch {
          // status updated; continue to write audit log before rethrowing
        }
      }

      await writeTikTokSyncLog({
        storeId,
        advertiserId,
        formId,
        triggerSource,
        status: "failed",
        leadsFetched: 0,
        leadsImported: 0,
        ordersCreated: 0,
        duplicatesSkipped: 0,
        leadsFailed: 0,
        durationMs,
        errorMessage: safeMessage,
        details:
          err instanceof TikTokApiError
            ? { category: err.category, tiktokCode: err.tiktokCode, retryable: err.retryable }
            : { error: safeMessage },
        startedAt,
        completedAt,
      });

      throw err;
    }
  })();

  activeSyncLocks.set(lockKey, runPromise);
  try {
    return await runPromise;
  } finally {
    if (activeSyncLocks.get(lockKey) === runPromise) {
      activeSyncLocks.delete(lockKey);
    }
  }
}

/**
 * 2. Syncs all sync_enabled=true Instant Forms for the selected (or explicit) advertiser.
 */
export async function syncEnabledForms(
  params?: TikTokSyncDeps & {
    advertiserId?: string;
    triggerSource?: TikTokSyncTriggerSource;
    startTime?: string;
    endTime?: string;
  },
): Promise<{
  advertiserId: string;
  formsSynced: number;
  results: Array<{ formId: string; summary?: SyncMetricsSummary; error?: string }>;
  totals: SyncMetricsSummary;
}> {
  const storeId = (params?.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const nowFn = params?.nowMs ?? Date.now;
  const startedMs = nowFn();
  const db = getDb();

  let advertiserId = (params?.advertiserId || "").trim();
  if (!advertiserId) {
    const tokenManager = params?.tokenManager ?? new TikTokTokenManager();
    const conn = await tokenManager.getPublicConnection(storeId);
    advertiserId = (conn?.selectedAdvertiserId || "").trim();
  }

  if (!advertiserId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "No TikTok advertiser account is selected for synchronization.",
    });
  }

  const { data: formsData, error: formsErr } = await db
    .from("tiktok_forms")
    .select("*")
    .eq("store_id", storeId)
    .eq("advertiser_id", advertiserId)
    .eq("sync_enabled", true);

  if (formsErr) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to query enabled TikTok forms: ${formsErr.message}`,
      cause: formsErr,
    });
  }

  const enabledForms = ((formsData ?? []) as TikTokFormRow[]).filter((f) => f.status !== "DELETED");
  const results: Array<{ formId: string; summary?: SyncMetricsSummary; error?: string }> = [];

  let leadsFetched = 0;
  let leadsImported = 0;
  let ordersCreated = 0;
  let duplicatesSkipped = 0;
  let leadsFailed = 0;
  let formFailures = 0;
  const allBackgroundTasks: Array<Promise<unknown>> = [];

  for (const form of enabledForms) {
    try {
      const summary = await syncFormLeads({
        ...params,
        storeId,
        advertiserId,
        formId: form.form_id,
        triggerSource: params?.triggerSource ?? "manual",
        startTime: params?.startTime,
        endTime: params?.endTime,
      });
      results.push({ formId: form.form_id, summary });
      leadsFetched += summary.leadsFetched;
      leadsImported += summary.leadsImported;
      ordersCreated += summary.ordersCreated;
      duplicatesSkipped += summary.duplicatesSkipped;
      leadsFailed += summary.leadsFailed;
      if (summary.backgroundTasks?.length) {
        allBackgroundTasks.push(...summary.backgroundTasks);
      }
    } catch (err) {
      formFailures += 1;
      results.push({
        formId: form.form_id,
        error: err instanceof Error ? err.message : "Form sync failed",
      });
    }
  }

  const durationMs = Math.max(0, nowFn() - startedMs);
  const status: TikTokSyncRunStatus =
    formFailures === 0 && leadsFailed === 0
      ? "success"
      : formFailures === enabledForms.length && enabledForms.length > 0
        ? "failed"
        : "partial";

  return {
    advertiserId,
    formsSynced: enabledForms.length,
    results,
    totals: {
      leadsFetched,
      leadsImported,
      ordersCreated,
      duplicatesSkipped,
      leadsFailed,
      durationMs,
      status,
      errorMessage:
        formFailures > 0 ? `${formFailures} of ${enabledForms.length} form(s) failed to sync.` : null,
      backgroundTasks: allBackgroundTasks,
    },
  };
}

/**
 * 3. Webhook Event Processing Service.
 * Called ONLY by Phase B's `/api/integrations/tiktok/webhook` AFTER verifyTikTokWebhookSignature() passes.
 */
export async function processWebhookLeadEvent(
  params: TikTokSyncDeps & {
    payload: unknown;
    defaultAdvertiserId?: string;
    defaultFormId?: string;
  },
): Promise<SyncMetricsSummary> {
  const storeId = (params.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const nowFn = params.nowMs ?? Date.now;
  const startedMs = nowFn();
  const startedAt = new Date(startedMs).toISOString();

  const leads = extractLeadsFromWebhookPayload(params.payload, {
    advertiserId: params.defaultAdvertiserId,
    formId: params.defaultFormId,
  });

  if (leads.length === 0) {
    const completedMs = nowFn();
    const completedAt = new Date(completedMs).toISOString();
    const durationMs = Math.max(0, completedMs - startedMs);
    const logRow = await writeTikTokSyncLog({
      storeId,
      advertiserId: params.defaultAdvertiserId ?? null,
      formId: params.defaultFormId ?? null,
      triggerSource: "webhook",
      status: "success",
      leadsFetched: 0,
      leadsImported: 0,
      ordersCreated: 0,
      duplicatesSkipped: 0,
      leadsFailed: 0,
      durationMs,
      details: { note: "Webhook payload contained zero actionable lead records." },
      startedAt,
      completedAt,
    });

    return {
      leadsFetched: 0,
      leadsImported: 0,
      ordersCreated: 0,
      duplicatesSkipped: 0,
      leadsFailed: 0,
      durationMs,
      status: "success",
      errorMessage: null,
      logId: logRow?.id ?? null,
    };
  }

  const batch = await processLeadBatch(leads, params);
  const completedMs = nowFn();
  const completedAt = new Date(completedMs).toISOString();
  const durationMs = Math.max(0, completedMs - startedMs);
  const status = determineRunStatus(batch);

  const firstLead = leads[0];
  const logRow = await writeTikTokSyncLog({
    storeId,
    advertiserId: firstLead?.advertiserId ?? params.defaultAdvertiserId ?? null,
    formId: firstLead?.formId ?? params.defaultFormId ?? null,
    triggerSource: "webhook",
    status,
    leadsFetched: batch.leadsFetched,
    leadsImported: batch.leadsImported,
    ordersCreated: batch.ordersCreated,
    duplicatesSkipped: batch.duplicatesSkipped,
    leadsFailed: batch.leadsFailed,
    durationMs,
    errorMessage:
      batch.leadsFailed > 0 ? `${batch.leadsFailed} webhook lead(s) recorded with errors.` : null,
    details: { failedLeadIds: batch.failedLeadIds },
    startedAt,
    completedAt,
  });

  return {
    leadsFetched: batch.leadsFetched,
    leadsImported: batch.leadsImported,
    ordersCreated: batch.ordersCreated,
    duplicatesSkipped: batch.duplicatesSkipped,
    leadsFailed: batch.leadsFailed,
    durationMs,
    status,
    errorMessage: logRow?.error_message ?? null,
    logId: logRow?.id ?? null,
    backgroundTasks: batch.backgroundTasks,
  };
}

/**
 * 4. Failed / Unmapped Lead Retry Service.
 * Reprocesses recoverable leads (order_creation_failed, unmapped_form, pending) bounded by maxRetries.
 * Never loses failed leads; preserves audit trail in public.tiktok_sync_logs.
 */
export async function retryFailedTikTokLeads(
  params?: TikTokSyncDeps & {
    leadIds?: string[];
    maxRetries?: number;
    limit?: number;
  },
): Promise<SyncMetricsSummary> {
  const storeId = (params?.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const maxRetries = Math.min(Math.max(params?.maxRetries ?? 5, 1), 20);
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
  const nowFn = params?.nowMs ?? Date.now;
  const startedMs = nowFn();
  const startedAt = new Date(startedMs).toISOString();

  const db = getDb();
  const { data: rows, error } = await db
    .from("tiktok_leads")
    .select("*")
    .eq("store_id", storeId)
    .in("sync_status", ["order_creation_failed", "unmapped_form", "pending"]);

  if (error) {
    throw new TikTokApiError({
      category: "DATABASE_ERROR",
      message: `Failed to load retryable TikTok leads: ${error.message}`,
      cause: error,
    });
  }

  const filterSet = params?.leadIds?.length ? new Set(params.leadIds) : null;
  const candidates = ((rows ?? []) as TikTokLeadRow[])
    .filter((row) => row.retry_count < maxRetries && !row.order_id)
    .filter((row) => !filterSet || filterSet.has(row.id) || filterSet.has(row.external_lead_id))
    .slice(0, limit);

  const rawInputs: RawTikTokLeadInput[] = candidates.map((row) => {
    const stringFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(row.raw_field_data ?? {})) {
      const str = String(v ?? "").trim();
      if (str) stringFields[k] = str;
    }
    return {
      externalLeadId: row.external_lead_id,
      formId: row.form_id,
      advertiserId: row.advertiser_id,
      campaignId: row.campaign_id,
      campaignName: row.campaign_name,
      adgroupId: row.adgroup_id,
      adId: row.ad_id,
      leadCreatedAt: row.lead_created_at,
      fields: stringFields,
    };
  });

  const batch = await processLeadBatch(rawInputs, {
    ...(params ?? {}),
    storeId,
    allowRetryExisting: true,
  });

  const completedMs = nowFn();
  const completedAt = new Date(completedMs).toISOString();
  const durationMs = Math.max(0, completedMs - startedMs);
  const status = determineRunStatus(batch);

  const logRow = await writeTikTokSyncLog({
    storeId,
    advertiserId: candidates[0]?.advertiser_id ?? null,
    formId: null,
    triggerSource: "reconciliation",
    status,
    leadsFetched: batch.leadsFetched,
    leadsImported: batch.leadsImported,
    ordersCreated: batch.ordersCreated,
    duplicatesSkipped: batch.duplicatesSkipped,
    leadsFailed: batch.leadsFailed,
    durationMs,
    errorMessage:
      batch.leadsFailed > 0
        ? `${batch.leadsFailed} retried lead(s) still failed and remain preserved for review.`
        : null,
    details: { mode: "retry_failed_leads", maxRetries, failedLeadIds: batch.failedLeadIds },
    startedAt,
    completedAt,
  });

  return {
    leadsFetched: batch.leadsFetched,
    leadsImported: batch.leadsImported,
    ordersCreated: batch.ordersCreated,
    duplicatesSkipped: batch.duplicatesSkipped,
    leadsFailed: batch.leadsFailed,
    durationMs,
    status,
    errorMessage: logRow?.error_message ?? null,
    logId: logRow?.id ?? null,
    backgroundTasks: batch.backgroundTasks,
  };
}

/**
 * 5. Historical Lead Reconciliation Service.
 * Re-pulls leads within a bounded lookback window (clamped strictly to TikTok's 90-day retention cap)
 * so missed webhooks are recovered idempotently with zero duplicate orders.
 */
export async function reconcileHistoricalLeads(
  params?: TikTokSyncDeps & {
    advertiserId?: string;
    formIds?: string[];
    lookbackDays?: number;
  },
): Promise<{
  lookbackDays: number;
  startTime: string;
  endTime: string;
  formsProcessed: number;
  totals: SyncMetricsSummary;
}> {
  const nowFn = params?.nowMs ?? Date.now;
  const endMs = nowFn();
  const lookbackDays = Math.min(
    Math.max(Math.round(params?.lookbackDays ?? 7), 1),
    TIKTOK_LEAD_RETENTION_MAX_DAYS,
  );
  const startMs = endMs - lookbackDays * 24 * 60 * 60 * 1000;
  const startTime = new Date(startMs).toISOString();
  const endTime = new Date(endMs).toISOString();

  if (params?.formIds && params.formIds.length > 0 && params.advertiserId) {
    let leadsFetched = 0;
    let leadsImported = 0;
    let ordersCreated = 0;
    let duplicatesSkipped = 0;
    let leadsFailed = 0;
    let failures = 0;
    const allBackgroundTasks: Array<Promise<unknown>> = [];

    for (const formId of params.formIds) {
      try {
        const res = await syncFormLeads({
          ...params,
          advertiserId: params.advertiserId,
          formId,
          triggerSource: "reconciliation",
          startTime,
          endTime,
        });
        leadsFetched += res.leadsFetched;
        leadsImported += res.leadsImported;
        ordersCreated += res.ordersCreated;
        duplicatesSkipped += res.duplicatesSkipped;
        leadsFailed += res.leadsFailed;
        if (res.backgroundTasks?.length) {
          allBackgroundTasks.push(...res.backgroundTasks);
        }
      } catch {
        failures += 1;
      }
    }

    const durationMs = Math.max(0, nowFn() - endMs);
    return {
      lookbackDays,
      startTime,
      endTime,
      formsProcessed: params.formIds.length,
      totals: {
        leadsFetched,
        leadsImported,
        ordersCreated,
        duplicatesSkipped,
        leadsFailed,
        durationMs,
        status:
          failures === 0 && leadsFailed === 0
            ? "success"
            : failures === params.formIds.length
              ? "failed"
              : "partial",
        errorMessage: failures > 0 ? `${failures} form(s) failed historical reconciliation.` : null,
        backgroundTasks: allBackgroundTasks,
      },
    };
  }

  const enabledRun = await syncEnabledForms({
    ...params,
    triggerSource: "reconciliation",
    startTime,
    endTime,
  });

  return {
    lookbackDays,
    startTime,
    endTime,
    formsProcessed: enabledRun.formsSynced,
    totals: enabledRun.totals,
  };
}

// ── 7. Official TikTok Test Leads Helpers (Scope 12020100 — Sandbox Validation) ──

/**
 * Resolves an authorized server-side access token for official TikTok v1.3 Test Leads
 * API calls (`12020100`: /page/lead/mock/{create,get,delete}/).
 */
async function resolveTestLeadAccessToken(
  deps: TikTokSyncDeps | undefined,
  client: TikTokApiClient,
): Promise<string> {
  const storeId = (deps?.storeId || DEFAULT_ORVA_STORE_ID).trim();
  const tokenManager = deps?.tokenManager ?? new TikTokTokenManager();
  const { accessToken } = await tokenManager.getValidAccessToken({
    storeId,
    refreshHandler: createTikTokRefreshHandler({
      client,
      configOverrides: deps?.configOverrides,
      nowMs: deps?.nowMs,
    }),
  });
  return accessToken;
}

/**
 * Triggers a single synthetic Test Lead via official TikTok API v1.3
 * `POST /open_api/v1.3/page/lead/mock/create/` (requires scope `12020100`).
 * Does NOT bypass webhook/sync pipeline or fabricate local orders.
 */
export async function createTikTokMockTestLead(
  params: TikTokSyncDeps & {
    advertiserId: string;
    formId: string;
    leadData?: Array<{ field_name: string; field_value: string }>;
  },
): Promise<{ mockLead: TikTokMockLeadData; requestId: string | null }> {
  const advertiserId = (params.advertiserId || "").trim();
  const formId = (params.formId || "").trim();
  if (!advertiserId || !formId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "advertiserId and formId are required to create a TikTok Test Lead.",
    });
  }

  const client =
    params.client ??
    new TikTokApiClient({ sandboxMode: params.configOverrides?.sandboxMode });
  const accessToken = await resolveTestLeadAccessToken(params, client);

  const body: Record<string, unknown> = {
    advertiser_id: advertiserId,
    page_id: formId,
  };
  if (Array.isArray(params.leadData) && params.leadData.length > 0) {
    body.lead_data = params.leadData;
  }

  const res = await client.requestJson({
    method: "POST",
    path: "/page/lead/mock/create/",
    accessToken,
    body,
    dataSchema: tikTokMockLeadDataSchema,
    idempotent: false,
  });

  return { mockLead: res.data, requestId: res.requestId };
}

/**
 * Fetches an active synthetic Test Lead via official TikTok API v1.3
 * `GET /open_api/v1.3/page/lead/mock/get/` (requires scope `12020100`).
 */
export async function getTikTokMockTestLead(
  params: TikTokSyncDeps & {
    advertiserId: string;
    formId: string;
  },
): Promise<{ mockLead: TikTokMockLeadData; requestId: string | null }> {
  const advertiserId = (params.advertiserId || "").trim();
  const formId = (params.formId || "").trim();
  if (!advertiserId || !formId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "advertiserId and formId are required to fetch a TikTok Test Lead.",
    });
  }

  const client =
    params.client ??
    new TikTokApiClient({ sandboxMode: params.configOverrides?.sandboxMode });
  const accessToken = await resolveTestLeadAccessToken(params, client);

  const res = await client.requestJson({
    method: "GET",
    path: "/page/lead/mock/get/",
    accessToken,
    query: {
      advertiser_id: advertiserId,
      page_id: formId,
    },
    dataSchema: tikTokMockLeadDataSchema,
    idempotent: true,
  });

  return { mockLead: res.data, requestId: res.requestId };
}

/**
 * Clears the synthetic Test Lead state for an Instant Form via official TikTok API v1.3
 * `POST /open_api/v1.3/page/lead/mock/delete/` (required before regenerating a Test Lead on the same form).
 */
export async function deleteTikTokMockTestLead(
  params: TikTokSyncDeps & {
    advertiserId: string;
    formId: string;
    leadId?: string;
  },
): Promise<{ deleted: boolean; requestId: string | null }> {
  const advertiserId = (params.advertiserId || "").trim();
  const formId = (params.formId || "").trim();
  if (!advertiserId || !formId) {
    throw new TikTokApiError({
      category: "INVALID_PARAMETERS",
      message: "advertiserId and formId are required to delete a TikTok Test Lead.",
    });
  }

  const client =
    params.client ??
    new TikTokApiClient({ sandboxMode: params.configOverrides?.sandboxMode });
  const accessToken = await resolveTestLeadAccessToken(params, client);

  const body: Record<string, unknown> = {
    advertiser_id: advertiserId,
    page_id: formId,
  };
  if (params.leadId && params.leadId.trim()) {
    body.lead_id = params.leadId.trim();
  }

  const res = await client.requestJson({
    method: "POST",
    path: "/page/lead/mock/delete/",
    accessToken,
    body,
    idempotent: false,
  });

  return { deleted: true, requestId: res.requestId };
}
