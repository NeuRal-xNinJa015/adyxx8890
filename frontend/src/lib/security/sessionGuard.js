/**
 * ADYX Session Guard
 * 
 * Manages session lifecycle:
 *   - Inactivity timeout → auto-lock
 *   - Key rotation every 10 minutes
 *   - Session state machine: active → idle → locked → expired
 *   - Activity tracking (mouse, keyboard, scroll, touch)
 */

import SECURITY_CONFIG from './config.js'

// ── State ──
let sessionState = 'inactive'  // inactive | active | idle | locked | expired
let idleTimer = null
let keyRotationTimer = null
let lastActivity = Date.now()
let onStateChange = null
let onKeyRotation = null
let activityListeners = []

const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'mousedown']

/**
 * Initialize the session guard.
 * @param {object} callbacks
 * @param {Function} callbacks.onStateChange - Called when session state changes
 * @param {Function} callbacks.onKeyRotation - Called when keys should be rotated
 */
export function initSessionGuard(callbacks = {}) {
    const config = SECURITY_CONFIG.deviceSecurity
    if (!config.enabled) {
        console.log('[SessionGuard] Disabled by config')
        return
    }

    onStateChange = callbacks.onStateChange || null
    onKeyRotation = callbacks.onKeyRotation || null

    // Track user activity
    const activityHandler = () => {
        lastActivity = Date.now()
        if (sessionState === 'idle') {
            setSessionState('active')
        }
    }

    ACTIVITY_EVENTS.forEach(event => {
        window.addEventListener(event, activityHandler, { passive: true })
        activityListeners.push({ event, handler: activityHandler })
    })

    // Start inactivity check
    idleTimer = setInterval(() => {
        if (sessionState === 'active' || sessionState === 'idle') {
            const elapsed = Date.now() - lastActivity
            if (elapsed > config.inactivityTimeoutMs) {
                setSessionState('locked')
            } else if (elapsed > config.inactivityTimeoutMs / 2) {
                if (sessionState !== 'idle') {
                    setSessionState('idle')
                }
            }
        }
    }, 5000) // Check every 5 seconds

    // Start key rotation timer
    if (config.keyRotationIntervalMs > 0) {
        keyRotationTimer = setInterval(() => {
            if (sessionState === 'active' || sessionState === 'idle') {
                console.log('[SessionGuard] Key rotation triggered')
                if (onKeyRotation) onKeyRotation()
            }
        }, config.keyRotationIntervalMs)
    }

    setSessionState('active')
    console.log('[SessionGuard] Active (timeout:', config.inactivityTimeoutMs / 1000, 's, rotation:', config.keyRotationIntervalMs / 60000, 'min)')
}

/**
 * Destroy the session guard.
 */
export function destroySessionGuard() {
    if (idleTimer) {
        clearInterval(idleTimer)
        idleTimer = null
    }
    if (keyRotationTimer) {
        clearInterval(keyRotationTimer)
        keyRotationTimer = null
    }

    activityListeners.forEach(({ event, handler }) => {
        window.removeEventListener(event, handler)
    })
    activityListeners = []

    onStateChange = null
    onKeyRotation = null
    sessionState = 'inactive'
    console.log('[SessionGuard] Destroyed')
}

/**
 * Manually unlock the session (e.g., after user clicks the lock screen).
 */
export function unlockSession() {
    if (sessionState === 'locked') {
        lastActivity = Date.now()
        setSessionState('active')
    }
}

/**
 * Immediately lock the session.
 */
export function lockSession() {
    setSessionState('locked')
}

/**
 * Expire the session — no recovery.
 */
export function expireSession() {
    setSessionState('expired')
}

/**
 * Get the current session state.
 */
export function getSessionState() {
    return sessionState
}

/**
 * Get time since last activity in seconds.
 */
export function getIdleTime() {
    return Math.floor((Date.now() - lastActivity) / 1000)
}

// ── Private ──

function setSessionState(newState) {
    if (newState === sessionState) return
    const oldState = sessionState
    sessionState = newState
    console.log(`[SessionGuard] ${oldState} → ${newState}`)
    if (onStateChange) onStateChange(newState, oldState)
}
