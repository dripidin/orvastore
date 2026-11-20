/**
 * ORVA Store — TikTok OAuth Token Encryption & Lifecycle Manager (Phase A1)
 *
 * Security Invariants:
 * 1. AES-256-GCM authenticated encryption with a fresh 96-bit (12-byte) random IV per write.
 * 2. Requires an explicit, validated 32-byte TIKTOK_TOKEN_ENCRYPTION_KEY (64-char hex or base64 32 bytes).
 * 3. FAILS CLOSED whenever TIKTOK_TOKEN_ENCRYPTION_KEY is missing, malformed, or low-entropy.
 * 4. FAILS CLOSED when Supabase service-role persistence is unavailable (ZERO plaintext/memory fallback).
 * 5. Never logs raw access tokens, refresh tokens, or encryption keys.
 * 6. Refreshes tokens ONLY when a refresh_token was actually issued by TikTok; persists rotated
 *    refresh tokens atomically and marks non-refreshable expired tokens as `token_expired`.
 *
 * SERVER-ONLY MODULE: Never import into Client Components.
 */

import crypto from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  DEFAULT_ORVA_STORE_ID,
  type PublicTikTokConnectionDto,
  TikTokApiError,
  type TikTokConnectionRow,
  type TikTokConnectionStatus,
  TikTokEncryptionConfigError,
  toPublicTikTokConnectionDto,
} from "./types";

const ENCRYPTION_VERSION = 1;
const ENVELOPE_PREFIX = `v${ENCRYPTION_VERSION}`;
const AES_ALGORITHM = "aes-256-gcm";
const IV_BYTE_LENGTH = 12;
const AUTH_TAG_BYTE_LENGTH = 16;
const REQUIRED_KEY_BYTES = 32;
const DEFAULT_EXPIRY_SAFETY_BUFFER_MS = 120_000; // 2 minutes

// ── 1. Key Validation & AES-256-GCM Primitives ───────────────────────────────

function hasSufficientKeyEntropy(keyBuf: Buffer): boolean {
  if (keyBuf.length !== REQUIRED_KEY_BYTES) return false;
  // Reject trivial all-zero or single-repeated-byte keys
  const uniqueBytes = new Set<number>(keyBuf);
  return uniqueBytes.size >= 8;
}

/**
 * Parses and validates the 32-byte AES-256-GCM encryption key.
 * Accepts:
 * - 64 hexadecimal characters (32 bytes)
 * - Standard or URL-safe Base64 decoding to exactly 32 bytes
 *
 * Fails closed with TikTokEncryptionConfigError if missing, wrong length, or weak.
 */
export function resolveTikTokEncryptionKey(explicitKey?: string): Buffer {
  const raw = (explicitKey !== undefined ? explicitKey : process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || "").trim();

  if (!raw) {
    throw new TikTokEncryptionConfigError(
      "TIKTOK_TOKEN_ENCRYPTION_KEY is required (32-byte key encoded as 64-char hex or base64). Fail-closed protection active.",
    );
  }

  let keyBuf: Buffer | null = null;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    keyBuf = Buffer.from(raw, "hex");
  } else if (/^[A-Za-z0-9+/=_-]{43,48}$/.test(raw)) {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length === REQUIRED_KEY_BYTES) {
      keyBuf = decoded;
    }
  }

  if (!keyBuf || keyBuf.length !== REQUIRED_KEY_BYTES) {
    throw new TikTokEncryptionConfigError(
      "TIKTOK_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars or 32-byte base64).",
    );
  }

  if (!hasSufficientKeyEntropy(keyBuf)) {
    throw new TikTokEncryptionConfigError(
      "TIKTOK_TOKEN_ENCRYPTION_KEY failed entropy validation (trivial or repeated-byte key rejected).",
    );
  }

  return keyBuf;
}

/**
 * Encrypts a plaintext OAuth token using AES-256-GCM with a cryptographically secure 12-byte random IV.
 * Output envelope: `v1:<iv_base64url>:<authTag_base64url>:<ciphertext_base64url>`
 */
export function encryptTikTokToken(plaintext: string, explicitKey?: string): string {
  const clean = typeof plaintext === "string" ? plaintext.trim() : "";
  if (!clean) {
    throw new TikTokEncryptionConfigError("Cannot encrypt an empty TikTok token.");
  }

  const key = resolveTikTokEncryptionKey(explicitKey);
  const iv = crypto.randomBytes(IV_BYTE_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_BYTE_LENGTH,
  });

  const ciphertext = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

/**
 * Decrypts and authenticates an AES-256-GCM token envelope.
 * Rejects tampered ciphertexts, tampered auth tags, invalid versions, or wrong keys.
 */
export function decryptTikTokToken(envelope: string, explicitKey?: string): string {
  if (!envelope || typeof envelope !== "string") {
    throw new TikTokEncryptionConfigError("Encrypted TikTok token envelope is missing or invalid.");
  }

  const parts = envelope.trim().split(":");
  if (parts.length !== 4 || parts[0] !== ENVELOPE_PREFIX) {
    throw new TikTokEncryptionConfigError("Unsupported or malformed TikTok encrypted token envelope.");
  }

  const [, ivPart, tagPart, dataPart] = parts;
  if (!ivPart || !tagPart || !dataPart) {
    throw new TikTokEncryptionConfigError("Incomplete TikTok encrypted token envelope.");
  }

  const key = resolveTikTokEncryptionKey(explicitKey);
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(dataPart, "base64url");

  if (iv.length !== IV_BYTE_LENGTH || authTag.length !== AUTH_TAG_BYTE_LENGTH || ciphertext.length === 0) {
    throw new TikTokEncryptionConfigError("Invalid IV, authentication tag, or ciphertext length in token envelope.");
  }

  try {
    const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    if (!plaintext) {
      throw new Error("Empty decrypted plaintext");
    }
    return plaintext;
  } catch (err) {
    throw new TikTokEncryptionConfigError(
      "Failed to decrypt or authenticate stored TikTok token (key mismatch or data tampering).",
      err,
    );
  }
}

// ── 2. Token Manager Contracts ───────────────────────────────────────────────

export interface SaveTikTokConnectionInput {
  storeId?: string;
  appId: string;
  accessToken: string;
  refreshToken?: string | null;
  scopes?: Array<number | string>;
  tokenExpiresAt?: string | Date | null;
  refreshExpiresAt?: string | Date | null;
  selectedAdvertiserId?: string | null;
  connectedBy?: string;
}

export interface TikTokTokenRefreshResult {
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: string | Date | null;
  refreshExpiresAt?: string | Date | null;
  scopes?: Array<number | string>;
}

export type TikTokRefreshHandler = (params: {
  appId: string;
  refreshToken: string;
  storeId: string;
}) => Promise<TikTokTokenRefreshResult>;

export interface TikTokTokenManagerOptions {
  encryptionKey?: string;
  expirySafetyBufferMs?: number;
  nowImpl?: () => number;
}

function toIsoStringOrNull(value?: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

// ── 3. Supabase-Backed Fail-Closed Token Manager ─────────────────────────────

export class TikTokTokenManager {
  private readonly explicitKey?: string;
  private readonly expirySafetyBufferMs: number;
  private readonly nowImpl: () => number;

  constructor(options: TikTokTokenManagerOptions = {}) {
    this.explicitKey = options.encryptionKey;
    this.expirySafetyBufferMs = options.expirySafetyBufferMs ?? DEFAULT_EXPIRY_SAFETY_BUFFER_MS;
    this.nowImpl = options.nowImpl ?? Date.now;
  }

  private getDb(): any {
    try {
      return getSupabaseServerClient() as any;
    } catch (err) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: "Supabase service-role client unavailable for TikTok token storage (fail-closed).",
        retryable: false,
        cause: err,
      });
    }
  }

  private async getRawConnection(storeId: string): Promise<TikTokConnectionRow | null> {
    const db = this.getDb();
    const { data, error } = await db
      .from("tiktok_connections")
      .select("*")
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to query tiktok_connections: ${error.message}`,
        retryable: false,
        cause: error,
      });
    }

    return (data as TikTokConnectionRow | null) ?? null;
  }

  /**
   * Encrypts and upserts TikTok OAuth tokens in public.tiktok_connections.
   * Returns strictly sanitized PublicTikTokConnectionDto (no tokens).
   */
  public async saveConnectionTokens(input: SaveTikTokConnectionInput): Promise<PublicTikTokConnectionDto> {
    const storeId = (input.storeId || DEFAULT_ORVA_STORE_ID).trim();
    const appId = input.appId.trim();
    if (!appId) {
      throw new TikTokApiError({
        category: "INVALID_PARAMETERS",
        message: "TikTok appId is required to store connection tokens.",
      });
    }

    const encryptedAccess = encryptTikTokToken(input.accessToken, this.explicitKey);
    const encryptedRefresh =
      input.refreshToken && input.refreshToken.trim().length > 0
        ? encryptTikTokToken(input.refreshToken, this.explicitKey)
        : null;

    const nowIso = new Date(this.nowImpl()).toISOString();
    const rowPayload = {
      store_id: storeId,
      app_id: appId,
      access_token_encrypted: encryptedAccess,
      refresh_token_encrypted: encryptedRefresh,
      token_encryption_version: ENCRYPTION_VERSION,
      scopes: Array.isArray(input.scopes) ? input.scopes : [],
      status: "connected" as TikTokConnectionStatus,
      token_expires_at: toIsoStringOrNull(input.tokenExpiresAt),
      refresh_expires_at: toIsoStringOrNull(input.refreshExpiresAt),
      selected_advertiser_id: input.selectedAdvertiserId ?? null,
      connected_by: (input.connectedBy || "admin").trim(),
      last_error: null,
      connected_at: nowIso,
      updated_at: nowIso,
    };

    const db = this.getDb();
    const { data, error } = await db
      .from("tiktok_connections")
      .upsert(rowPayload, { onConflict: "store_id" })
      .select("*")
      .single();

    if (error || !data) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to persist encrypted TikTok tokens: ${error?.message ?? "empty result"}`,
        retryable: false,
        cause: error,
      });
    }

    return toPublicTikTokConnectionDto(data as TikTokConnectionRow);
  }

  /**
   * Reads the sanitized public connection status for admin UI responses.
   * Never decrypts or returns tokens.
   */
  public async getPublicConnection(storeId = DEFAULT_ORVA_STORE_ID): Promise<PublicTikTokConnectionDto | null> {
    const row = await this.getRawConnection(storeId);
    if (!row) return null;
    return toPublicTikTokConnectionDto(row);
  }

  /**
   * Checks whether a stored token expiry timestamp is expired (within safety buffer).
   * Returns false when token_expires_at is null (long-lived Marketing API token without expiry).
   */
  public isTokenExpired(tokenExpiresAt: string | null): boolean {
    if (!tokenExpiresAt) return false;
    const expMs = Date.parse(tokenExpiresAt);
    if (!Number.isFinite(expMs)) return true;
    return this.nowImpl() + this.expirySafetyBufferMs >= expMs;
  }

  /**
   * Returns a valid decrypted access token for server-side TikTok API calls.
   *
   * Lifecycle behavior:
   * - Rejects disconnected or revoked connections immediately.
   * - If token_expires_at is absent (standard long-lived Marketing API token), returns decrypted access token.
   * - If token is expired AND refresh_token_encrypted exists AND refreshHandler is supplied,
   *   refreshes token and atomically persists the rotated access & refresh tokens.
   * - If token is expired and refresh is unavailable or fails, updates DB status to `token_expired`
   *   and throws TikTokApiError(AUTH_TOKEN_EXPIRED) without speculative fallback.
   */
  public async getValidAccessToken(params?: {
    storeId?: string;
    refreshHandler?: TikTokRefreshHandler;
    forceRefresh?: boolean;
  }): Promise<{ accessToken: string; connection: PublicTikTokConnectionDto }> {
    const storeId = (params?.storeId || DEFAULT_ORVA_STORE_ID).trim();
    const row = await this.getRawConnection(storeId);

    if (!row) {
      throw new TikTokApiError({
        category: "AUTH_TOKEN_EXPIRED",
        message: "No TikTok Business account is connected for ORVA Store.",
      });
    }

    if (row.status === "disconnected" || row.status === "revoked") {
      throw new TikTokApiError({
        category: "AUTH_TOKEN_EXPIRED",
        message: `TikTok connection is ${row.status}. Administrator must reconnect the account.`,
      });
    }

    const expired = this.isTokenExpired(row.token_expires_at);
    const shouldRefresh = Boolean(params?.forceRefresh) || expired || row.status === "token_expired";

    if (!shouldRefresh) {
      const accessToken = decryptTikTokToken(row.access_token_encrypted, this.explicitKey);
      return {
        accessToken,
        connection: toPublicTikTokConnectionDto(row),
      };
    }

    // Attempt refresh ONLY when a refresh token was actually issued by TikTok
    if (!row.refresh_token_encrypted || !params?.refreshHandler) {
      await this.markConnectionStatus(
        storeId,
        "token_expired",
        "TikTok access token expired and no refresh token is available; re-authorization required.",
      );
      throw new TikTokApiError({
        category: "AUTH_TOKEN_EXPIRED",
        message: "TikTok access token expired and cannot be refreshed automatically. Please reconnect.",
      });
    }

    if (this.isTokenExpired(row.refresh_expires_at)) {
      await this.markConnectionStatus(
        storeId,
        "token_expired",
        "TikTok refresh token has expired; re-authorization required.",
      );
      throw new TikTokApiError({
        category: "AUTH_TOKEN_EXPIRED",
        message: "TikTok refresh token expired. Please reconnect your TikTok Business account.",
      });
    }

    const decryptedRefresh = decryptTikTokToken(row.refresh_token_encrypted, this.explicitKey);

    try {
      const refreshed = await params.refreshHandler({
        appId: row.app_id,
        refreshToken: decryptedRefresh,
        storeId,
      });

      // Atomically persist new access token AND rotated refresh token (TikTok invalidates prior refresh token)
      const nextRefreshPlaintext =
        refreshed.refreshToken && refreshed.refreshToken.trim().length > 0
          ? refreshed.refreshToken
          : decryptedRefresh;

      const updated = await this.saveConnectionTokens({
        storeId,
        appId: row.app_id,
        accessToken: refreshed.accessToken,
        refreshToken: nextRefreshPlaintext,
        scopes: refreshed.scopes ?? row.scopes,
        tokenExpiresAt: refreshed.tokenExpiresAt ?? null,
        refreshExpiresAt: refreshed.refreshExpiresAt ?? row.refresh_expires_at,
        selectedAdvertiserId: row.selected_advertiser_id,
        connectedBy: row.connected_by,
      });

      return {
        accessToken: refreshed.accessToken,
        connection: updated,
      };
    } catch (refreshErr) {
      const safeErrMsg =
        refreshErr instanceof Error ? refreshErr.message : "TikTok token refresh failed";
      await this.markConnectionStatus(storeId, "token_expired", safeErrMsg);
      throw new TikTokApiError({
        category: "AUTH_TOKEN_EXPIRED",
        message: `TikTok token refresh failed: ${safeErrMsg}`,
        retryable: false,
        cause: refreshErr,
      });
    }
  }

  /**
   * Transitions connection status (e.g., on upstream 40105 token revocation or error)
   * without leaking token values in last_error.
   */
  public async markConnectionStatus(
    storeId: string,
    status: TikTokConnectionStatus,
    lastError: string | null = null,
  ): Promise<PublicTikTokConnectionDto | null> {
    const db = this.getDb();
    const { data, error } = await db
      .from("tiktok_connections")
      .update({
        status,
        last_error: lastError,
        updated_at: new Date(this.nowImpl()).toISOString(),
      })
      .eq("store_id", storeId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to update TikTok connection status: ${error.message}`,
        retryable: false,
        cause: error,
      });
    }

    return data ? toPublicTikTokConnectionDto(data as TikTokConnectionRow) : null;
  }

  /**
   * Marks the connection revoked/disconnected and removes encrypted token material
   * by deleting the connection row (or returning the decrypted token to caller for upstream revocation first).
   */
  public async disconnectConnection(
    storeId = DEFAULT_ORVA_STORE_ID,
    revokeUpstream?: (accessToken: string, appId: string) => Promise<void>,
  ): Promise<{ disconnected: boolean; upstreamRevoked: boolean }> {
    const row = await this.getRawConnection(storeId);
    if (!row) {
      return { disconnected: false, upstreamRevoked: false };
    }

    let upstreamRevoked = false;
    if (revokeUpstream && row.status !== "disconnected") {
      try {
        const plainAccess = decryptTikTokToken(row.access_token_encrypted, this.explicitKey);
        await revokeUpstream(plainAccess, row.app_id);
        upstreamRevoked = true;
      } catch {
        // Proceed with local token purge even if upstream revocation fails or token was already revoked
        upstreamRevoked = false;
      }
    }

    const db = this.getDb();
    const { error } = await db.from("tiktok_connections").delete().eq("store_id", storeId);

    if (error) {
      throw new TikTokApiError({
        category: "DATABASE_ERROR",
        message: `Failed to purge TikTok connection tokens: ${error.message}`,
        retryable: false,
        cause: error,
      });
    }

    return { disconnected: true, upstreamRevoked };
  }
}
