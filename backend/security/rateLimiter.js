/**
 * ADYX Enhanced Rate Limiter — Zero-Knowledge Server Security
 * 
 * Features:
 *   - IP anonymization (SHA-256 hashing)
 *   - OTP-specific rate limiting (3 attempts, exponential backoff)
 *   - Temporary lockout after failed attempts
 *   - Sliding window per hashed-IP
 *   - Connection flood protection
 * 
 * Wraps/supplements existing checkRate() without modifying server.js
 */

import { createHash } from 'crypto'
import SECURITY_CONFIG from './securityConfig.js'

// Storage — in-memory, no persistence
const otpAttempts = new Map()       // hashedIP → { count, lastAttempt, lockedUntil }
const connectionCounts = new Map()  // hashedIP → [timestamps]
const rateLimitWindows = new Map()  // hashedIP:type → [timestamps]

/**
 * Anonymize an IP address by hashing with SHA-256.
 * Never stores or logs raw IPs.
 */
export function anonymizeIP(ip) {
    if (!ip) return 'unknown'
    return createHash('sha256').update(ip + 'adyx-ip-salt-v1').digest('hex').slice(0, 16)
}

/**
 * Check OTP rate limit with exponential backoff.
 * Returns { allowed, retryAfterMs, remaining }
 */
export function checkOTPRate(hashedIP) {
    if (!SECURITY_CONFIG.rateLimit.enabled) {
        return { allowed: true, retryAfterMs: 0, remaining: SECURITY_CONFIG.rateLimit.otpMaxAttempts }
    }

    const now = Date.now()
    let record = otpAttempts.get(hashedIP)

    if (!record) {
        record = { count: 0, lastAttempt: 0, lockedUntil: 0 }
        otpAttempts.set(hashedIP, record)
    }

    // Check lockout
    if (record.lockedUntil > now) {
        return {
            allowed: false,
            retryAfterMs: record.lockedUntil - now,
            remaining: 0
        }
    }

    // Reset if lockout has expired
    if (record.lockedUntil > 0 && record.lockedUntil <= now) {
        record.count = 0
        record.lockedUntil = 0
    }

    const maxAttempts = SECURITY_CONFIG.rateLimit.otpMaxAttempts
    const remaining = Math.max(0, maxAttempts - record.count)

    if (record.count >= maxAttempts) {
        // Lock out
        record.lockedUntil = now + SECURITY_CONFIG.rateLimit.otpLockoutMs
        return {
            allowed: false,
            retryAfterMs: SECURITY_CONFIG.rateLimit.otpLockoutMs,
            remaining: 0
        }
    }

    // Calculate exponential backoff
    if (record.count > 0) {
        const backoffMs = SECURITY_CONFIG.rateLimit.otpBackoffBaseMs * Math.pow(2, record.count - 1)
        const timeSinceLastAttempt = now - record.lastAttempt
        if (timeSinceLastAttempt < backoffMs) {
            return {
                allowed: false,
                retryAfterMs: backoffMs - timeSinceLastAttempt,
                remaining: remaining
            }
        }
    }

    // Allow attempt
    record.count++
    record.lastAttempt = now
    return { allowed: true, retryAfterMs: 0, remaining: remaining - 1 }
}

/**
 * Reset OTP attempts on successful verification.
 */
export function resetOTPAttempts(hashedIP) {
    otpAttempts.delete(hashedIP)
}

/**
 * Check connection flood rate.
 * Returns { allowed, retryAfterMs }
 */
export function checkConnectionFlood(hashedIP) {
    if (!SECURITY_CONFIG.rateLimit.enabled) return { allowed: true }

    const now = Date.now()
    const window = SECURITY_CONFIG.rateLimit.connectionFloodWindowMs
    const max = SECURITY_CONFIG.rateLimit.connectionFloodMax

    let timestamps = connectionCounts.get(hashedIP)
    if (!timestamps) {
        timestamps = []
        connectionCounts.set(hashedIP, timestamps)
    }

    // Remove entries older than window
    while (timestamps.length > 0 && timestamps[0] < now - window) {
        timestamps.shift()
    }

    if (timestamps.length >= max) {
        return { allowed: false, retryAfterMs: timestamps[0] + window - now }
    }

    timestamps.push(now)
    return { allowed: true }
}

/**
 * Generic sliding-window rate limiter (per hashed-IP + type).
 */
export function checkGenericRate(hashedIP, type, maxPerMinute) {
    if (!SECURITY_CONFIG.rateLimit.enabled) return true

    const key = `${hashedIP}:${type}`
    const now = Date.now()
    let window = rateLimitWindows.get(key)

    if (!window) {
        window = []
        rateLimitWindows.set(key, window)
    }

    // Remove entries older than 60s
    while (window.length > 0 && window[0] < now - 60000) {
        window.shift()
    }

    if (window.length >= maxPerMinute) return false
    window.push(now)
    return true
}

/**
 * Periodic cleanup of stale rate limit data.
 * Call this on an interval to prevent memory leaks.
 */
export function cleanupRateLimitData() {
    const now = Date.now()

    // Clean OTP attempts older than lockout period
    for (const [key, record] of otpAttempts.entries()) {
        if (now - record.lastAttempt > SECURITY_CONFIG.rateLimit.otpLockoutMs * 2) {
            otpAttempts.delete(key)
        }
    }

    // Clean connection counts
    for (const [key, timestamps] of connectionCounts.entries()) {
        if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 120000) {
            connectionCounts.delete(key)
        }
    }

    // Clean generic rate windows
    for (const [key, timestamps] of rateLimitWindows.entries()) {
        if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] > 120000) {
            rateLimitWindows.delete(key)
        }
    }
}
