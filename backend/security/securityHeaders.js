/**
 * ADYX Security Headers Middleware
 * 
 * Adds comprehensive security headers to all HTTP responses:
 *   - HSTS (Strict-Transport-Security)
 *   - Content-Security-Policy
 *   - X-Content-Type-Options
 *   - X-Frame-Options
 *   - Referrer-Policy
 *   - Permissions-Policy
 *   - Cache-Control
 */

import SECURITY_CONFIG from './securityConfig.js'

/**
 * Apply security headers to an HTTP response.
 * Call this in the HTTP server handler before sending any response.
 * 
 * @param {http.ServerResponse} res - The HTTP response object
 */
export function applySecurityHeaders(res) {
    if (!SECURITY_CONFIG.headers.enabled) return

    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff')

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY')

    // Control referrer information
    res.setHeader('Referrer-Policy', 'no-referrer')

    // Restrict browser features
    res.setHeader('Permissions-Policy',
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
    )

    // Prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')

    // Cross-Origin isolation
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
    res.setHeader('X-Download-Options', 'noopen')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')

    // HSTS — only in production
    if (SECURITY_CONFIG.headers.hsts) {
        res.setHeader('Strict-Transport-Security',
            `max-age=${SECURITY_CONFIG.headers.hstsMaxAge}; includeSubDomains; preload`
        )
    }

    // Content Security Policy
    if (SECURITY_CONFIG.headers.csp) {
        res.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",   // React needs inline for dev
            "style-src 'self' 'unsafe-inline'",     // CSS-in-JS needs inline
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self' ws://localhost:* wss://localhost:* ws://* wss://*",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "object-src 'none'",
            "upgrade-insecure-requests",
        ].join('; '))
    }
}

/**
 * Get cookie options for secure cookie configuration.
 */
export function getSecureCookieOptions() {
    return {
        httpOnly: true,
        secure: SECURITY_CONFIG.transport.enforceWSS,
        sameSite: 'Strict',
        path: '/',
        maxAge: 3600,  // 1 hour
    }
}

/**
 * Generate a CSP nonce for inline scripts (production use).
 */
export function generateCSPNonce() {
    const { randomBytes } = await import('crypto')
    return randomBytes(16).toString('base64')
}
