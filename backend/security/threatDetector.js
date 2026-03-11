/**
 * ADYX Server-Side Threat Detector
 * 
 * Detects and responds to:
 *   - Brute force attempts
 *   - Rapid OTP guessing
 *   - Multiple device IDs from same connection
 *   - Connection flood attacks
 *   - Abnormal message patterns
 * 
 * On detection: terminate connection, log anonymized event.
 */

import { createHash } from 'crypto'
import SECURITY_CONFIG from './securityConfig.js'
import { anonymizeIP } from './rateLimiter.js'

// ── Tracking state ──
const deviceIdHistory = new Map()      // connectionId → Set<deviceId>
const messagePatterns = new Map()       // hashedIP → { counts[], timestamps[] }
const threatEvents = []                 // Anonymized threat log (capped at 1000)
const MAX_EVENTS = 1000

/**
 * ThreatDetector class — one instance per server.
 */
export class ThreatDetector {
    constructor() {
        this.enabled = SECURITY_CONFIG.threatDetection.enabled
    }

    /**
     * Track a device ID for a connection.
     * Detects if multiple device IDs are used on the same connection (session hijacking).
     * 
     * @param {string} connectionId - Unique connection identifier
     * @param {string} deviceId - The device ID being used
     * @returns {{ threat: boolean, reason: string }}
     */
    trackDeviceId(connectionId, deviceId) {
        if (!this.enabled) return { threat: false }

        let devices = deviceIdHistory.get(connectionId)
        if (!devices) {
            devices = new Set()
            deviceIdHistory.set(connectionId, devices)
        }

        devices.add(deviceId)

        if (devices.size > SECURITY_CONFIG.threatDetection.maxDeviceIdsPerConnection) {
            this._logThreat('MULTI_DEVICE', { connectionId: connectionId.slice(0, 8), deviceCount: devices.size })
            return { threat: true, reason: 'Multiple device IDs detected on single connection' }
        }

        return { threat: false }
    }

    /**
     * Track message frequency for a hashed IP.
     * Detects abnormal burst patterns.
     */
    trackMessageRate(hashedIP, messageType) {
        if (!this.enabled) return { threat: false }

        const now = Date.now()
        const window = SECURITY_CONFIG.threatDetection.bruteForceWindowMs
        let pattern = messagePatterns.get(hashedIP)

        if (!pattern) {
            pattern = { timestamps: [], types: {} }
            messagePatterns.set(hashedIP, pattern)
        }

        // Remove old entries
        pattern.timestamps = pattern.timestamps.filter(t => t > now - window)

        pattern.timestamps.push(now)
        pattern.types[messageType] = (pattern.types[messageType] || 0) + 1

        // Check for brute force (too many messages in window)
        if (pattern.timestamps.length > SECURITY_CONFIG.threatDetection.bruteForceMaxAttempts) {
            this._logThreat('BRUTE_FORCE', { hashedIP, messageCount: pattern.timestamps.length })
            return { threat: true, reason: 'Abnormal message frequency detected' }
        }

        // Check for auth spam (repeated auth attempts)
        if (messageType === 'auth' && pattern.types.auth > 5) {
            this._logThreat('AUTH_SPAM', { hashedIP, authCount: pattern.types.auth })
            return { threat: true, reason: 'Excessive authentication attempts' }
        }

        // Check for room brute force (trying many room codes)
        if (messageType === 'join_room' && pattern.types.join_room > 10) {
            this._logThreat('ROOM_BRUTE_FORCE', { hashedIP, joinAttempts: pattern.types.join_room })
            return { threat: true, reason: 'Room code brute force detected' }
        }

        return { threat: false }
    }

    /**
     * Clean up connection tracking.
     */
    removeConnection(connectionId) {
        deviceIdHistory.delete(connectionId)
    }

    /**
     * Get anonymized threat event log.
     */
    getEvents() {
        return [...threatEvents]
    }

    /**
     * Periodic cleanup of stale tracking data.
     */
    cleanup() {
        const now = Date.now()
        const window = SECURITY_CONFIG.threatDetection.bruteForceWindowMs * 2

        for (const [ip, pattern] of messagePatterns.entries()) {
            if (pattern.timestamps.length === 0 ||
                now - pattern.timestamps[pattern.timestamps.length - 1] > window) {
                messagePatterns.delete(ip)
            }
        }

        // Cap event log
        while (threatEvents.length > MAX_EVENTS) {
            threatEvents.shift()
        }
    }

    // ── Private ──

    _logThreat(type, details) {
        const event = {
            type,
            timestamp: new Date().toISOString(),
            ...details
        }

        // Never log sensitive data
        delete event.rawIP
        delete event.deviceId
        delete event.payload

        threatEvents.push(event)
        console.warn(`[THREAT] ${type}:`, JSON.stringify(event))
    }
}

// Singleton
export const threatDetector = new ThreatDetector()
