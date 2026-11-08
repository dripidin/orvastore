/**
 * ORVA Store — Supabase Browser/Client Integration
 * Project Reference: olmsjkhdfghyydogcvvy
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const SUPABASE_PROJECT_REF = 'olmsjkhdfghyydogcvvy';
export const DEFAULT_SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

// Fallback anonymous key for safe client initialization when env variable is not yet populated
const FALLBACK_ANON_KEY = 'sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY;

let clientInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton instance of the Supabase client configured for public/anon operations.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!clientInstance) {
    clientInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: typeof window !== 'undefined',
        autoRefreshToken: true,
      },
    });
  }
  return clientInstance;
}

export const supabase = getSupabaseClient();
