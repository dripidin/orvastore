const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let supabase = null;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false
            }
        });
    } catch (e) {
        console.warn('Supabase client initialization warning:', e.message);
    }
}

function getSupabase() {
    if (!supabase && supabaseUrl && supabaseKey) {
        try {
            supabase = createClient(supabaseUrl, supabaseKey, {
                auth: { persistSession: false, autoRefreshToken: false }
            });
        } catch (e) {}
    }
    return supabase;
}

module.exports = {
    getSupabase,
    supabase
};
