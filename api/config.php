<?php
// ==============================================================================
// ORVA STORE — Server Configuration for Hostinger LiteSpeed (PHP 8.3)
// Security: Direct web access is blocked by .htaccess and the check below.
// ==============================================================================

if (!defined('ORVA_API')) {
    http_response_code(403);
    exit('Direct access not permitted.');
}

return [
    // ── Supabase Cloud Database ──────────────────────────────────────────────
    'supabase' => [
        'url' => 'https://olmsjkhdfghyydogcvvy.supabase.co',
        'anon_key' => 'sb_publishable_7c9dtcV6aM5B32hwxWxPGw_JLLC7tmu',
    ],

    // ── Telegram Instant Order Notifications ──────────────────────────────────
    'telegram' => [
        'bot_token' => '8749469493:AAG__aGu7sSVJoRFLpFQ8eR2V_XIJMZSD0o',
        'chat_id' => '-1003965560132',
    ],

    // ── Meta Conversions API (CAPI) ──────────────────────────────────────────
    'meta' => [
        'pixel_id' => '2340414976777036',
    ],

    // ── Admin Security ────────────────────────────────────────────────────────
    'admin' => [
        'password' => 'orva2026',
        'token' => 'orva-admin-2026-secure',
    ]
];
