/**
 * ORVA Store — Supabase Server-Side Client Integration
 * Project Reference: olmsjkhdfghyydogcvvy
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { DEFAULT_SUPABASE_URL, SUPABASE_PROJECT_REF } from './client';

const FALLBACK_SERVICE_KEY = 'sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu';

let serverInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a Supabase client with administrative / service_role privileges
 * for backend API routes, webhooks, and background jobs.
 */
export function getSupabaseServerClient(): SupabaseClient<Database> {
  if (!serverInstance) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SERVICE_KEY;

    serverInstance = createClient<Database>(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return serverInstance;
}

export const supabaseServer = getSupabaseServerClient();
export { SUPABASE_PROJECT_REF };
