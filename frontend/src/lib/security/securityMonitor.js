/**
 * ADYX Client-Side Security Monitor
 * 
 * Active threat detection module that monitors for:
 *   - Rapid failed send attempts (brute force indicator)
 *   - DevTools open detection
 *   - Abnormal request frequency
 *   - Tab/window manipulation
 *   - Session anomalies (fingerprint change)
 * 
 * On threat: destroys session, revokes keys, emits event.
 * Logs are sanitized — no PII or sensitive data.
 */

import SECURITY_CONFIG from './config.js'

/**
 * SecurityMonitor — singleton threat detection engine.
 */
class SecurityMonitor {
    constructor() {
        this.enabled = SECURITY_CONFIG.threatDetection.enabled
        this.events = []
        this.counters = {
            failedSends: 0,
            failedDecrypts: 0,
            rapidMessages: 0,
            suspiciousEvents: 0,
        }
        this.messageTimestamps = []
        this.threatLevel = 'green'  // green | yellow | red
        this.listeners = new Map()
        this.checkInterval = null
        this.maxEvents = 200
    }

    /**
     * Start monitoring.
     */
    start() {
        if (!this.enabled) return

        // Periodic anomaly check
        this.checkInterval = setInterval(() => this._anomalyCheck(), 10000)

        this._logEvent('MONITOR_START', 'Security monitor activated')
        console.log('[SecurityMonitor] Active')
    }

    /**
     * Stop monitoring.
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
        }
        this._logEvent('MONITOR_STOP', 'Security monitor deactivated')
    }

    /**
     * Report a failed send attempt.
     */
    reportFailedSend() {
        if (!this.enabled) return
        this.counters.failedSends++
        this._logEvent('FAILED_SEND', `Failed send #${this.counters.failedSends}`)

        if (this.counters.failedSends > SECURITY_CONFIG.threatDetection.maxFailedAttempts) {
            this._raiseThreat('red', 'Excessive failed send attempts detected')
        }
    }

    /**
     * Report a failed decryption.
     */
    reportFailedDecrypt() {
        if (!this.enabled) return
        this.counters.failedDecrypts++
        this._logEvent('FAILED_DECRYPT', `Failed decrypt #${this.counters.failedDecrypts}`)

        if (this.counters.failedDecrypts > 3) {
            this._raiseThreat('yellow', 'Multiple decryption failures — possible key mismatch')
        }
    }

    /**
     * Report a message (for frequency tracking).
     */
    reportMessage() {
        if (!this.enabled) return
        const now = Date.now()
        this.messageTimestamps.push(now)

        // Clean old timestamps
        const window = SECURITY_CONFIG.threatDetection.anomalyWindow
        this.messageTimestamps = this.messageTimestamps.filter(t => t > now - window)

        // Check for abnormal frequency (> 30 msgs/min is suspicious)
        if (this.messageTimestamps.length > 30) {
            this._raiseThreat('yellow', 'Abnormal message frequency detected')
        }
    }

    /**
     * Report a suspicious event.
     */
    reportSuspicious(type, detail = '') {
        if (!this.enabled) return
        this.counters.suspiciousEvents++
        this._logEvent(type, detail)

        if (this.counters.suspiciousEvents > 10) {
            this._raiseThreat('red', 'High suspicious activity count')
        }
    }

    /**
     * Report fingerprint change (device binding violation).
     */
    reportFingerprintChange(expected, actual) {
        if (!this.enabled) return
        this._logEvent('FINGERPRINT_MISMATCH', `Expected ${expected?.slice(0, 8)}... got ${actual?.slice(0, 8)}...`)
        this._raiseThreat('red', 'Device fingerprint changed — possible session hijacking')
    }

    /**
     * Get current threat level.
     * @returns {'green' | 'yellow' | 'red'}
     */
    getThreatLevel() {
        return this.threatLevel
    }

    /**
     * Get sanitized event log.
     */
    getEvents() {
        return [...this.events]
    }

    /**
     * Register a threat listener.
     * @param {'threat' | 'event'} type
     * @param {Function} callback
     */
    on(type, callback) {
        if (!this.listeners.has(type)) {
            this.listeners.set(type, [])
        }
        this.listeners.get(type).push(callback)
        return () => {
            const arr = this.listeners.get(type)
            if (arr) {
                this.listeners.set(type, arr.filter(cb => cb !== callback))
            }
        }
    }

    /**
     * Reset all counters (e.g., after key rotation).
     */
    reset() {
        this.counters = {
            failedSends: 0,
            failedDecrypts: 0,
            rapidMessages: 0,
            suspiciousEvents: 0,
        }
        this.messageTimestamps = []
        this.threatLevel = 'green'
        this._emit('event', { type: 'MONITOR_RESET' })
    }

    /**
     * Destroy the monitor — full cleanup.
     */
    destroy() {
        this.stop()
        this.events = []
        this.listeners.clear()
        this.reset()
    }

    // ── Private ──

    _anomalyCheck() {
        const now = Date.now()
        const window = SECURITY_CONFIG.threatDetection.anomalyWindow

        // Decay counters over time
        if (this.counters.failedSends > 0 && this.counters.failedSends < SECURITY_CONFIG.threatDetection.maxFailedAttempts) {
            this.counters.failedSends = Math.max(0, this.counters.failedSends - 1)
        }

        // Auto-recover threat level if no new threats
        if (this.threatLevel === 'yellow' && this.counters.suspiciousEvents < 5) {
            this.threatLevel = 'green'
            this._emit('event', { type: 'THREAT_CLEARED', level: 'green' })
        }
    }

    _raiseThreat(level, reason) {
        const prevLevel = this.threatLevel
        if (level === 'red' || (level === 'yellow' && this.threatLevel !== 'red')) {
            this.threatLevel = level
        }

        this._logEvent('THREAT', `[${level.toUpperCase()}] ${reason}`)
        console.warn(`[SecurityMonitor] THREAT [${level}]:`, reason)

        this._emit('threat', { level, reason, prevLevel })

        // Auto-destroy on critical threat
        if (level === 'red' && SECURITY_CONFIG.threatDetection.autoDestroyOnThreat) {
            console.error('[SecurityMonitor] CRITICAL THREAT - auto-destroying session')
            this._emit('threat', { level: 'critical', reason: 'Auto-destroy triggered', action: 'destroy' })
        }
    }

    _logEvent(type, detail) {
        const event = {
            type,
            detail,
            timestamp: new Date().toISOString(),
        }
        this.events.push(event)

        // Cap event log
        if (this.events.length > this.maxEvents) {
            this.events = this.events.slice(-this.maxEvents)
        }

        this._emit('event', event)
    }

    _emit(type, data) {
        const callbacks = this.listeners.get(type)
        if (callbacks) {
            callbacks.forEach(cb => {
                try { cb(data) } catch (e) { /* ignore listener errors */ }
            })
        }
    }
}

// Singleton
export const securityMonitor = new SecurityMonitor()
