/**
 * ADYX Server Security Configuration
 * 
 * Central configuration for all server-side security features.
 * Supports environment variable overrides.
 */

const SECURITY_CONFIG = {
    // Rate Limiting
    rateLimit: {
        enabled: envBool('ADYX_RATE_LIMIT_ENABLED', true),
        otpMaxAttempts: envInt('ADYX_OTP_MAX_ATTEMPTS', 3),
        otpLockoutMs: envInt('ADYX_OTP_LOCKOUT_MS', 5 * 60 * 1000),      // 5 min
        otpBackoffBaseMs: envInt('ADYX_OTP_BACKOFF_BASE_MS', 2000),        // 2s base
        connectionFloodMax: envInt('ADYX_CONN_FLOOD_MAX', 20),             // per min
        connectionFloodWindowMs: envInt('ADYX_CONN_FLOOD_WINDOW_MS', 60000),
    },

    // Metadata Minimization
    metadata: {
        enabled: envBool('ADYX_METADATA_MIN_ENABLED', true),
        stripTimingInfo: true,
        anonymizeIPs: true,
    },

    // Security Headers
    headers: {
        enabled: envBool('ADYX_SECURITY_HEADERS_ENABLED', true),
        hsts: envBool('ADYX_HSTS_ENABLED', false),     // false for dev, true for prod
        hstsMaxAge: envInt('ADYX_HSTS_MAX_AGE', 31536000),
        csp: envBool('ADYX_CSP_ENABLED', true),
    },

    // Transport
    transport: {
        enforceWSS: envBool('ADYX_ENFORCE_WSS', false),   // false for dev
        tlsMinVersion: 'TLSv1.3',
    },

    // Threat Detection
    threatDetection: {
        enabled: envBool('ADYX_THREAT_DETECTION_ENABLED', true),
        maxDeviceIdsPerConnection: 3,
        bruteForceWindowMs: 60000,
        bruteForceMaxAttempts: 10,
    },

    // Logging
    logging: {
        anonymizeIPs: true,
        logLevel: process.env.ADYX_LOG_LEVEL || 'info',
        redactSensitive: true,
    }
}

// ── Environment Variable Helpers ──

function envBool(key, defaultVal) {
    const val = process.env[key]
    if (val === undefined) return defaultVal
    return val === 'true' || val === '1'
}

function envInt(key, defaultVal) {
    const val = process.env[key]
    if (val === undefined) return defaultVal
    const parsed = parseInt(val, 10)
    return isNaN(parsed) ? defaultVal : parsed
}

export default SECURITY_CONFIG
