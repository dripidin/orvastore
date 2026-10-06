'use strict';
// =============================================================================
// Supabase Client & PostgreSQL Pool for ORVA Store (orvastore)
// =============================================================================

const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://olmsjkhdfghyydogcvvy.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabaseInstance = null;
let pgPoolInstance = null;

function getSupabase() {
    if (!supabaseInstance && SUPABASE_URL && SUPABASE_KEY) {
        supabaseInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: { persistSession: false }
        });
    }
    return supabaseInstance;
}

function getPgPool() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        return null;
    }
    if (!pgPoolInstance) {
        pgPoolInstance = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        pgPoolInstance.on('error', (err) => {
            console.error('[PG-POOL] Unexpected idle client error:', err.message);
        });
    }
    return pgPoolInstance;
}

module.exports = {
    getSupabase,
    getPgPool,
    SUPABASE_URL
};
