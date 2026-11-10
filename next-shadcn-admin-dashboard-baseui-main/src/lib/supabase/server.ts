/**
 * ORVA Store — Supabase Server-Side Client Integration (Hardened Fail-Closed)
 * Project Reference: olmsjkhdfghyydogcvvy
 *
 * SECURITY INVARIANTS:
 * 1. ZERO fallback to public anonymous or publishable keys for server operations.
 * 2. Fail closed: Throws an explicit error if a valid service_role credential is missing or malformed.
 * 3. Never prints, logs, or exposes secret values.
 * 4. Distinct boundary between public browser client (client.ts) and administrative server client (server.ts).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { DEFAULT_SUPABASE_URL, SUPABASE_PROJECT_REF } from './client';

let serverInstance: SupabaseClient<Database> | null = null;

export interface KeyValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates whether a given key qualifies as a genuine administrative service-role credential.
 * Rejects publishable keys, public anon keys, mismatched JWT roles, and empty/truncated strings.
 * Never leaks the key parameter to logs or error messages.
 */
export function validateServiceRoleKey(key: string | undefined | null): KeyValidationResult {
  if (key === undefined || key === null || typeof key !== 'string') {
    return { valid: false, reason: 'Credential missing or non-string' };
  }

  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'Credential is empty' };
  }

  // Reject publishable keys
  if (trimmed.startsWith('sb_publishable_')) {
    return { valid: false, reason: 'Publishable key cannot be used for administrative operations' };
  }

  // Reject anon keys matching public configuration
  const publicAnon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (publicAnon && trimmed === publicAnon) {
    return { valid: false, reason: 'Public anonymous key cannot be used for administrative operations' };
  }

  // Inspect JWT structure if present (header.payload.signature)
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const payloadJson = Buffer.from(parts[1], 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      if (payload && typeof payload === 'object') {
        if (payload.role && payload.role !== 'service_role') {
          return { valid: false, reason: `JWT role claim is "${payload.role}", expected "service_role"` };
        }
      }
    } catch {
      return { valid: false, reason: 'Malformed JWT structure in credential' };
    }
  } else if (trimmed.length < 20) {
    return { valid: false, reason: 'Credential format or length insufficient' };
  }

  return { valid: true };
}

/**
 * Returns true if a valid service-role key is configured in the environment.
 */
export function isServiceRoleConfigured(): boolean {
  return validateServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY).valid;
}

/**
 * Returns a Supabase client with administrative / service_role privileges
 * for backend API routes, webhooks, and background jobs.
 * Fails closed immediately if valid credentials are not present.
 */
export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (!serverInstance) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const validation = validateServiceRoleKey(key);

    if (!validation.valid) {
      throw new Error(
        `[Supabase Server Security Error]: Privileged operations require a valid SUPABASE_SERVICE_ROLE_KEY (${validation.reason}). Fail-closed protection active.`
      );
    }

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;

    serverInstance = createClient<Database>(url, key!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serverInstance;
}

/**
 * Lazy proxy export preserving backward compatibility with direct imports
 * while ensuring fail-closed semantics on access without premature module-load exceptions.
 */
export const supabaseServer = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getSupabaseServerClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

export { SUPABASE_PROJECT_REF };

/**
 * Test isolation utilities
 */
export function __testResetSupabaseServerInstance(): void {
  serverInstance = null;
}

export function __testSetSupabaseServerInstance(customClient: any): void {
  serverInstance = customClient;
}
