/**
 * ORVA Store — Dynamic TikTok URL-Prefix Signature File Verification Store
 *
 * Allows administrators to register TikTok developer portal signature files
 * (e.g., `tiktokAbCdEf12345.txt` -> `tiktok-developers-site-verification=...`)
 * dynamically in `site_settings.integrations.tiktok_domain_verification` without
 * rebuilding or redeploying the Next.js standalone server.
 *
 * Security Invariants:
 * 1. Strict filename allowlist: ONLY `tiktok*.txt` (optionally under `.well-known/`, `terms/`, or `privacy/`).
 *    Path traversal (`..`), slashes outside allowed prefixes, and non-`.txt` extensions are rejected.
 * 2. Strict plain-text content sanitizer: printable ASCII only (4..512 chars), `<` and `>` rejected
 *    so HTML/XSS payloads can never be stored or served.
 * 3. Bounded storage: maximum 10 active verification entries.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const MAX_TIKTOK_VERIFICATION_FILES = 10;

export const TIKTOK_VERIFICATION_PATH_REGEX =
  /^(?:(?:\.well-known|terms|privacy)\/)?tiktok[A-Za-z0-9_.-]{4,100}\.txt$/i;

const PRINTABLE_PLAIN_TEXT_REGEX = /^[\x20-\x7E\r\n]{4,512}$/;

export interface TikTokDomainVerificationEntry {
  fileName: string;
  content: string;
  updatedAt: string;
}

let fallbackVerificationFiles: TikTokDomainVerificationEntry[] = [];

/** Normalizes a user-supplied filename or URL path into a canonical relative path (no leading slash). */
export function normalizeTikTokVerificationFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let cleaned = raw.trim().replace(/\\/g, "/");

  // If the admin pasted a full https://orva-store.com/tiktokXXXX.txt URL, extract pathname cleanly
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      cleaned = new URL(cleaned).pathname;
    } catch {
      return null;
    }
  }

  cleaned = cleaned.split("?")[0].split("#")[0].replace(/^\/+/, "").replace(/\/+$/, "");
  if (!cleaned || cleaned.includes("..") || cleaned.includes("//")) {
    return null;
  }

  if (!TIKTOK_VERIFICATION_PATH_REGEX.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/** Validates and normalizes plain-text TikTok signature verification file contents. */
export function sanitizeTikTokVerificationContent(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length < 4 || trimmed.length > 512) {
    return null;
  }
  if (trimmed.includes("<") || trimmed.includes(">") || trimmed.includes("\0")) {
    return null;
  }
  if (!PRINTABLE_PLAIN_TEXT_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseEntriesArray(raw: unknown): TikTokDomainVerificationEntry[] {
  if (!Array.isArray(raw)) return [];
  const valid: TikTokDomainVerificationEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const fileName = normalizeTikTokVerificationFileName(rec.fileName);
    const content = sanitizeTikTokVerificationContent(rec.content);
    if (!fileName || !content) continue;
    valid.push({
      fileName,
      content,
      updatedAt: typeof rec.updatedAt === "string" && rec.updatedAt ? rec.updatedAt : new Date().toISOString(),
    });
    if (valid.length >= MAX_TIKTOK_VERIFICATION_FILES) break;
  }
  return valid;
}

/** Lists all configured TikTok domain signature verification files. */
export async function listTikTokVerificationFiles(): Promise<TikTokDomainVerificationEntry[]> {
  try {
    const supabase = getSupabaseServerClient() as any;
    if (supabase) {
      const { data, error } = await supabase
        .from("site_settings")
        .select("integrations")
        .eq("id", 1)
        .maybeSingle();

      if (!error && data?.integrations?.tiktok_domain_verification) {
        const parsed = parseEntriesArray(data.integrations.tiktok_domain_verification.files);
        fallbackVerificationFiles = parsed;
        return parsed;
      }
    }
  } catch {
    // Graceful fallback to in-memory cache when DB is unavailable
  }

  return [...fallbackVerificationFiles];
}

/** Resolves a verification file's plain-text content by exact relative path or matching basename. */
export async function resolveTikTokVerificationFileContent(requestedPath: string): Promise<string | null> {
  const normalized = normalizeTikTokVerificationFileName(requestedPath);
  if (!normalized) return null;

  const files = await listTikTokVerificationFiles();
  const exact = files.find((f) => f.fileName.toLowerCase() === normalized.toLowerCase());
  if (exact) return exact.content;

  // Fallback: if admin uploaded `tiktokXXXX.txt` at root, also satisfy `/terms/tiktokXXXX.txt` or `/.well-known/...`
  const requestedBase = normalized.split("/").pop()?.toLowerCase();
  if (requestedBase) {
    const byBase = files.find((f) => f.fileName.split("/").pop()?.toLowerCase() === requestedBase);
    if (byBase) return byBase.content;
  }

  return null;
}

async function persistVerificationFiles(nextFiles: TikTokDomainVerificationEntry[]): Promise<void> {
  const bounded = nextFiles.slice(0, MAX_TIKTOK_VERIFICATION_FILES);
  fallbackVerificationFiles = bounded;

  try {
    const supabase = getSupabaseServerClient() as any;
    if (!supabase) return;

    const { data: currentRow } = await supabase
      .from("site_settings")
      .select("id, integrations")
      .eq("id", 1)
      .maybeSingle();

    const existingIntegrations =
      currentRow?.integrations && typeof currentRow.integrations === "object"
        ? (currentRow.integrations as Record<string, unknown>)
        : {};

    const nowIso = new Date().toISOString();
    const mergedIntegrations: Record<string, unknown> = {
      ...existingIntegrations,
      tiktok_domain_verification: {
        files: bounded,
        updated_at: nowIso,
      },
    };

    if (currentRow) {
      await supabase
        .from("site_settings")
        .update({ integrations: mergedIntegrations, updated_at: nowIso })
        .eq("id", 1);
    } else {
      await supabase
        .from("site_settings")
        .upsert({ id: 1, integrations: mergedIntegrations, updated_at: nowIso }, { onConflict: "id" });
    }
  } catch {
    // Keep in-memory fallback updated even when running offline tests
  }
}

/** Upserts a validated TikTok signature verification file entry. */
export async function upsertTikTokVerificationFile(input: {
  fileName: string;
  content: string;
}): Promise<TikTokDomainVerificationEntry[]> {
  const fileName = normalizeTikTokVerificationFileName(input.fileName);
  if (!fileName) {
    throw new Error(
      "اسم الملف غير صالح: يجب أن يبدأ بـ tiktok وينتهي بـ .txt (مثال: tiktokAbCd1234.txt).",
    );
  }

  const content = sanitizeTikTokVerificationContent(input.content);
  if (!content) {
    throw new Error(
      "محتوى ملف التوقيع غير صالح: يجب أن يكون نصاً صريحاً (مثل tiktok-developers-site-verification=...) بدون وسوم HTML.",
    );
  }

  const existing = await listTikTokVerificationFiles();
  const nowIso = new Date().toISOString();
  const filtered = existing.filter((f) => f.fileName.toLowerCase() !== fileName.toLowerCase());
  const next: TikTokDomainVerificationEntry[] = [
    { fileName, content, updatedAt: nowIso },
    ...filtered,
  ].slice(0, MAX_TIKTOK_VERIFICATION_FILES);

  await persistVerificationFiles(next);
  return next;
}

/** Deletes a stored TikTok signature verification file by name. */
export async function deleteTikTokVerificationFile(rawFileName: string): Promise<TikTokDomainVerificationEntry[]> {
  const fileName = normalizeTikTokVerificationFileName(rawFileName);
  if (!fileName) {
    return await listTikTokVerificationFiles();
  }
  const existing = await listTikTokVerificationFiles();
  const next = existing.filter((f) => f.fileName.toLowerCase() !== fileName.toLowerCase());
  await persistVerificationFiles(next);
  return next;
}

export function __testResetTikTokVerificationFallback(): void {
  fallbackVerificationFiles = [];
}
