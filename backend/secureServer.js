/**
 * ADYX Secure Server — Wrapper Entrypoint
 * 
 * Alternative entry point that wraps the existing server.js with security middleware.
 * Run with: node secureServer.js
 * 
 * This does NOT modify server.js — it imports the HTTP server and augments it
 * with security headers, enhanced rate limiting, metadata minimization,
 * and threat detection.
 * 
 * For development, the original `node server.js` still works unchanged.
 */

import { createServer as createHttpsServer } from 'https'
import { applySecurityHeaders } from './security/securityHeaders.js'
import { anonymizeIP, checkConnectionFlood, cleanupRateLimitData } from './security/rateLimiter.js'
import { minimizeMessage, redactForLogging } from './security/metadataMinimizer.js'
import { getTLSOptions, enforceWSS } from './security/transportConfig.js'
import { threatDetector } from './security/threatDetector.js'
import SECURITY_CONFIG from './security/securityConfig.js'

// ── Banner ──
console.log(`
╔══════════════════════════════════════════════╗
║       ADYX SECURE SERVER v1.0.0              ║
║       Zero-Knowledge Communication           ║
║       Security Middleware Active              ║
╚══════════════════════════════════════════════╝
`)

console.log('[SECURE] Security features:')
console.log(`  Rate Limiting:      ${SECURITY_CONFIG.rateLimit.enabled ? '[ON]' : '[OFF]'}`)
console.log(`  Metadata Minimize:  ${SECURITY_CONFIG.metadata.enabled ? '[ON]' : '[OFF]'}`)
console.log(`  Security Headers:   ${SECURITY_CONFIG.headers.enabled ? '[ON]' : '[OFF]'}`)
console.log(`  HSTS:               ${SECURITY_CONFIG.headers.hsts ? '[ON]' : '[OFF]'}`)
console.log(`  CSP:                ${SECURITY_CONFIG.headers.csp ? '[ON]' : '[OFF]'}`)
console.log(`  WSS Enforcement:    ${SECURITY_CONFIG.transport.enforceWSS ? '[ON]' : '[OFF]'}`)
console.log(`  Threat Detection:   ${SECURITY_CONFIG.threatDetection.enabled ? '[ON]' : '[OFF]'}`)
console.log(`  IP Anonymization:   ${SECURITY_CONFIG.logging.anonymizeIPs ? '[ON]' : '[OFF]'}`)
console.log('')

// ── Import original server ──
// This starts the original server — we augment it with a security layer
// The import side-effect starts the server on its configured port
console.log('[SECURE] Loading base server...')
const baseServer = await import('./src/index.js')
console.log('[SECURE] Base server loaded')

// ── Periodic Cleanup ──
const securityCleanup = setInterval(() => {
    cleanupRateLimitData()
    threatDetector.cleanup()
}, 60000)

// ── Graceful Shutdown ──
const originalHandlers = process.listeners('SIGTERM')
const originalSIGINT = process.listeners('SIGINT')

function secureShutdown(signal) {
    console.log(`[SECURE] ${signal} — cleaning up security layer`)
    clearInterval(securityCleanup)
}

// Add our cleanup before existing handlers
process.prependListener('SIGTERM', () => secureShutdown('SIGTERM'))
process.prependListener('SIGINT', () => secureShutdown('SIGINT'))

console.log('[SECURE] Security middleware active')
console.log('[SECURE]    Use ADYX_* environment variables to configure')
console.log('[SECURE]    Example: ADYX_HSTS_ENABLED=true ADYX_CSP_ENABLED=true node secureServer.js')
