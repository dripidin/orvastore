/**
 * CodFlow integration — runtime feature flags (Phase 0).
 *
 * Flags are served by the PHP bridge (`/__flags`) from `CODFLOW_FLAGS`, so a
 * rollback does not require rebuilding the static dashboard. If the bridge is
 * unreachable, every domain fails closed to `off` and the legacy path stays in
 * charge.
 */

import { codflowInternalRequest } from "./client";
import { CODFLOW_FLAGS_PATH, CODFLOW_FLAGS_TTL_MS } from "./config";

export type CodflowDomain = "orders" | "products" | "customers" | "delivery" | "store";

export type CodflowDomainFlag = "off" | "read" | "write";

export type CodflowAuthMode = "bridge" | "jwt";

export interface CodflowFlags {
  orders: CodflowDomainFlag;
  products: CodflowDomainFlag;
  customers: CodflowDomainFlag;
  delivery: CodflowDomainFlag;
  store: CodflowDomainFlag;
  auth: CodflowAuthMode;
}

export interface CodflowFlagsOptions {
  force?: boolean;
  signal?: AbortSignal;
}

export const DEFAULT_CODFLOW_FLAGS: CodflowFlags = Object.freeze({
  orders: "off",
  products: "off",
  customers: "off",
  delivery: "off",
  store: "off",
  auth: "bridge",
});

const DOMAIN_VALUES: readonly CodflowDomainFlag[] = ["off", "read", "write"];
const AUTH_VALUES: readonly CodflowAuthMode[] = ["bridge", "jwt"];
const DOMAIN_RANK: Record<CodflowDomainFlag, number> = { off: 0, read: 1, write: 2 };

let cachedFlags: CodflowFlags | null = null;
let cachedAt = 0;
let inflight: Promise<CodflowFlags> | null = null;

/** Fetches flags with a 60-second cache and in-flight de-duplication. */
export async function getCodflowFlags(options: CodflowFlagsOptions = {}): Promise<CodflowFlags> {
  const now = Date.now();
  if (options.force !== true && cachedFlags !== null && now - cachedAt < CODFLOW_FLAGS_TTL_MS) {
    return cachedFlags;
  }
  if (inflight !== null) {
    return inflight;
  }

  inflight = (async () => {
    try {
      const rawFlags = await codflowInternalRequest<unknown>(CODFLOW_FLAGS_PATH, { signal: options.signal });
      const flags = parseCodflowFlags(rawFlags);
      cachedFlags = flags;
      cachedAt = Date.now();
      return flags;
    } catch (error) {
      // Fail closed: keep legacy behavior rather than exposing partial data.
      console.warn("[codflow] flags unavailable; defaulting every domain to off", error);
      cachedFlags = DEFAULT_CODFLOW_FLAGS;
      cachedAt = Date.now();
      return cachedFlags;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Pure check used by repositories that already hold a flag snapshot. */
export function isCodflowFlagEnabled(
  flags: CodflowFlags,
  domain: CodflowDomain,
  minimum: "read" | "write" = "read",
): boolean {
  return DOMAIN_RANK[flags[domain]] >= DOMAIN_RANK[minimum];
}

/** Convenience check that fetches (or reuses) the current flags. */
export async function isCodflowDomainEnabled(
  domain: CodflowDomain,
  minimum: "read" | "write" = "read",
  options: CodflowFlagsOptions = {},
): Promise<boolean> {
  const flags = await getCodflowFlags(options);
  return isCodflowFlagEnabled(flags, domain, minimum);
}

export async function getCodflowAuthMode(options: CodflowFlagsOptions = {}): Promise<CodflowAuthMode> {
  const flags = await getCodflowFlags(options);
  return flags.auth;
}

/** Test/rollback helper: forces the next call to fetch from the bridge. */
export function resetCodflowFlagsCache(): void {
  cachedFlags = null;
  cachedAt = 0;
  inflight = null;
}

function parseCodflowFlags(raw: unknown): CodflowFlags {
  const record = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    orders: pickAllowed(record.orders, DOMAIN_VALUES, DEFAULT_CODFLOW_FLAGS.orders),
    products: pickAllowed(record.products, DOMAIN_VALUES, DEFAULT_CODFLOW_FLAGS.products),
    customers: pickAllowed(record.customers, DOMAIN_VALUES, DEFAULT_CODFLOW_FLAGS.customers),
    delivery: pickAllowed(record.delivery, DOMAIN_VALUES, DEFAULT_CODFLOW_FLAGS.delivery),
    store: pickAllowed(record.store, DOMAIN_VALUES, DEFAULT_CODFLOW_FLAGS.store),
    auth: pickAllowed(record.auth, AUTH_VALUES, DEFAULT_CODFLOW_FLAGS.auth),
  };
}

function pickAllowed<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
