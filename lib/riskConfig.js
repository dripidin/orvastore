// Risk Engine - Centralized Configuration
// All tunable numbers live here. No magic constants elsewhere.

module.exports = {

    // Rate Limiting
    RATE_LIMIT: { maxRequests: 2, windowMinutes: 360 },

    // Score Weights (points added per triggered rule)
    SCORE_WEIGHTS: {
        RATE_LIMIT_HIT:         40,  // IP or deviceId exceeded quota
        RAPID_SUBMISSION:       25,  // form submitted too fast
        HONEYPOT_TRIGGERED:     80,  // hidden field was filled (bot)
        MULTI_DEVICE_IDENTITY:  20,  // same device, many different phones
        PREVIOUS_REJECTION:     30,  // actor previously rejected/blocked
        REPEATED_PHONE:         15,  // same phone, multiple submissions in window
        INVALID_PHONE_PATTERN:  10,  // does not match Algerian phone format
    },

    // Decision Thresholds
    //  0-29  LOW     => ALLOW
    // 30-59  MEDIUM  => ALLOW (monitor)
    // 60-79  HIGH    => REVIEW
    // 80-100 CRITICAL=> BLOCK
    THRESHOLDS: { LOW: 30, MEDIUM: 60, HIGH: 80 },

    // Minimum seconds a real human needs to fill the form
    MIN_FORM_SECONDS: 8,

    // If same deviceId has >= N distinct phones in window -> signal
    MULTI_DEVICE_THRESHOLD: 3,

    // Algerian mobile: 05, 06, 07 + 8 digits
    PHONE_REGEX_STRING: '^0[567]\\d{8}$',

    // risk_events older than this (days) may be cleaned up
    RETENTION_DAYS: 30,

    // Recognized store identifiers
    STORE_IDS: ['tnt_clock', 'yamahasac']
};
