'use strict';
// =============================================================================
// DEPRECATED — Supabase has been removed. Google Sheets is now the data layer.
// This stub prevents crashes from any stale require('./supabaseServer') calls.
// =============================================================================
function getSupabase() {
    console.warn('[DEPRECATED] supabaseServer.js is no longer used. All data goes through lib/googleSheets.js via lib/db.js');
    return null;
}
module.exports = { getSupabase };
