/**
 * ADYX Transport Security Configuration
 * 
 * TLS 1.3 configuration, WSS enforcement, and certificate loading.
 * Used by secureServer.js for production deployments.
 */

import { readFileSync, existsSync } from 'fs'
import SECURITY_CONFIG from './securityConfig.js'

/**
 * Get TLS options for HTTPS/WSS server.
 * Returns null if no certificates are configured.
 */
export function getTLSOptions() {
    const certPath = process.env.ADYX_TLS_CERT || './certs/fullchain.pem'
    const keyPath = process.env.ADYX_TLS_KEY || './certs/privkey.pem'
    const caPath = process.env.ADYX_TLS_CA || './certs/chain.pem'

    // Check if certificates exist
    if (!existsSync(certPath) || !existsSync(keyPath)) {
        console.warn('[Transport] TLS certificates not found — running without TLS')
        console.warn('[Transport]   Expected cert:', certPath)
        console.warn('[Transport]   Expected key:', keyPath)
        return null
    }

    const options = {
        cert: readFileSync(certPath),
        key: readFileSync(keyPath),
        minVersion: SECURITY_CONFIG.transport.tlsMinVersion || 'TLSv1.3',
        // Prefer server cipher order
        honorCipherOrder: true,
        // Modern cipher suites
        ciphers: [
            'TLS_AES_256_GCM_SHA384',
            'TLS_CHACHA20_POLY1305_SHA256',
            'TLS_AES_128_GCM_SHA256',
        ].join(':'),
    }

    // Add CA chain if available
    if (existsSync(caPath)) {
        options.ca = readFileSync(caPath)
    }

    console.log('[Transport] TLS configured with', SECURITY_CONFIG.transport.tlsMinVersion)
    return options
}

/**
 * Check if the current connection is using WSS.
 * Returns true if secure, false if not.
 */
export function isSecureConnection(req) {
    // Check direct TLS
    if (req.socket.encrypted) return true
    // Check reverse proxy headers
    if (req.headers['x-forwarded-proto'] === 'https') return true
    return false
}

/**
 * Middleware to enforce WSS-only connections.
 * Returns true if connection should be rejected.
 */
export function enforceWSS(req) {
    if (!SECURITY_CONFIG.transport.enforceWSS) return false
    return !isSecureConnection(req)
}
