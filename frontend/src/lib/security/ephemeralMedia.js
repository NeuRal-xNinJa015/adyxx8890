/**
 * ADYX Ephemeral Media Manager
 * 
 * Manages Snapchat-style ephemeral media:
 *   - View-once mode: single open, then key destroyed
 *   - Self-destruct timer: auto-close and destroy after N seconds
 *   - Expiry tracking
 *   - Key destruction on expiry
 * 
 * Usage:
 *   import { createEphemeralSession, markAsViewed, isExpired } from './ephemeralMedia.js'
 *   createEphemeralSession(fileId, 'view_once')
 *   createEphemeralSession(fileId, 'timed', 30)
 */

// ── State ──

const ephemeralStore = new Map()  // fileId → EphemeralSession

/**
 * @typedef {Object} EphemeralSession
 * @property {string} fileId
 * @property {'view_once' | 'timed' | 'normal'} mode
 * @property {number} duration - Self-destruct timer (seconds), only for 'timed'
 * @property {boolean} viewed - Has been opened
 * @property {boolean} expired - Has expired / been destroyed
 * @property {number} createdAt - Timestamp
 * @property {number|null} viewedAt - Timestamp when first viewed
 * @property {number|null} expiresAt - Timestamp when it expires
 * @property {Function|null} onExpire - Callback when media expires
 * @property {number|null} timerId - Self-destruct timer ID
 * @property {string|null} fileKeyBase64 - Encrypted file key (destroyed on expiry)
 */

/**
 * Create an ephemeral session for a file.
 * 
 * @param {string} fileId - Unique file identifier
 * @param {'view_once' | 'timed' | 'normal'} mode
 * @param {number} duration - Seconds for self-destruct (only for 'timed')
 * @param {string} fileKeyBase64 - The file key to destroy on expiry
 * @param {Function} onExpire - Callback when media expires
 * @returns {EphemeralSession}
 */
export function createEphemeralSession(fileId, mode = 'normal', duration = 0, fileKeyBase64 = null, onExpire = null) {
    // Clean up any existing session for this fileId
    if (ephemeralStore.has(fileId)) {
        destroyEphemeralMedia(fileId)
    }

    const session = {
        fileId,
        mode,
        duration,
        viewed: false,
        expired: false,
        createdAt: Date.now(),
        viewedAt: null,
        expiresAt: null,
        onExpire,
        timerId: null,
        fileKeyBase64
    }

    ephemeralStore.set(fileId, session)
    console.log(`[Ephemeral] Session created: ${fileId} (${mode}${duration ? `, ${duration}s` : ''})`)

    return session
}

/**
 * Mark a file as viewed. For view-once, this triggers expiry.
 * For timed mode, this starts the self-destruct countdown.
 * 
 * @param {string} fileId
 * @returns {{ expired: boolean, remainingSeconds?: number }}
 */
export function markAsViewed(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session) return { expired: false }

    if (session.expired) {
        return { expired: true }
    }

    if (session.viewed && session.mode === 'view_once') {
        // Already viewed once — expired
        return { expired: true }
    }

    session.viewed = true
    session.viewedAt = Date.now()

    if (session.mode === 'view_once') {
        // Don't expire immediately — wait until viewer is closed
        console.log(`[Ephemeral] View-once opened: ${fileId}`)
        return { expired: false }
    }

    if (session.mode === 'timed' && !session.timerId) {
        // Start self-destruct timer
        const ms = session.duration * 1000
        session.expiresAt = Date.now() + ms
        session.timerId = setTimeout(() => {
            expireSession(fileId)
        }, ms)
        console.log(`[Ephemeral] Self-destruct started: ${fileId} (${session.duration}s)`)
        return { expired: false, remainingSeconds: session.duration }
    }

    return { expired: false }
}

/**
 * Called when the viewer is closed. For view-once, this triggers expiry.
 * 
 * @param {string} fileId
 */
export function onViewerClosed(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session) return

    if (session.mode === 'view_once' && session.viewed) {
        expireSession(fileId)
    }
}

/**
 * Check if a file has expired.
 * 
 * @param {string} fileId
 * @returns {boolean}
 */
export function isExpired(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session) return false
    return session.expired
}

/**
 * Check if a file is view-once and has already been viewed.
 * 
 * @param {string} fileId
 * @returns {boolean}
 */
export function isViewOnceConsumed(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session) return false
    return session.mode === 'view_once' && session.expired
}

/**
 * Get ephemeral session info for UI display.
 * 
 * @param {string} fileId
 * @returns {object|null}
 */
export function getEphemeralInfo(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session) return null

    const info = {
        mode: session.mode,
        viewed: session.viewed,
        expired: session.expired,
        duration: session.duration,
    }

    if (session.mode === 'timed' && session.expiresAt && !session.expired) {
        info.remainingSeconds = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))
    }

    return info
}

/**
 * Get remaining seconds for a timed self-destruct.
 * 
 * @param {string} fileId
 * @returns {number|null}
 */
export function getRemainingSeconds(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session || session.mode !== 'timed' || !session.expiresAt) return null
    return Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))
}

/**
 * Destroy an ephemeral media session and wipe the key.
 * 
 * @param {string} fileId
 */
export function destroyEphemeralMedia(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session) return

    // Clear timer
    if (session.timerId) {
        clearTimeout(session.timerId)
        session.timerId = null
    }

    // Destroy file key
    if (session.fileKeyBase64) {
        // Overwrite with random data
        const len = session.fileKeyBase64.length
        const noise = new Uint8Array(len)
        crypto.getRandomValues(noise)
        session.fileKeyBase64 = String.fromCharCode(...noise)
        session.fileKeyBase64 = null
    }

    session.expired = true
    ephemeralStore.delete(fileId)
    console.log(`[Ephemeral] Destroyed: ${fileId}`)
}

/**
 * Destroy all ephemeral sessions (e.g., on panic wipe or session end).
 */
export function destroyAllEphemeral() {
    for (const fileId of ephemeralStore.keys()) {
        destroyEphemeralMedia(fileId)
    }
    ephemeralStore.clear()
    console.log('[Ephemeral] All sessions destroyed')
}

/**
 * Available self-destruct timer options (seconds).
 */
export const SELF_DESTRUCT_TIMERS = [5, 10, 30, 60]

/**
 * Format seconds into human-readable timer string.
 * 
 * @param {number} seconds
 * @returns {string}
 */
export function formatTimer(seconds) {
    if (seconds <= 0) return '0s'
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m}m ${s}s` : `${m}m`
}

// ── Internal ──

function expireSession(fileId) {
    const session = ephemeralStore.get(fileId)
    if (!session || session.expired) return

    session.expired = true
    console.log(`[Ephemeral] Expired: ${fileId} (${session.mode})`)

    // Notify callback
    if (session.onExpire) {
        try { session.onExpire(fileId) } catch (e) { /* ignore */ }
    }

    // Destroy key
    if (session.fileKeyBase64) {
        const len = session.fileKeyBase64.length
        const noise = new Uint8Array(len)
        crypto.getRandomValues(noise)
        session.fileKeyBase64 = String.fromCharCode(...noise)
        session.fileKeyBase64 = null
    }

    // Clear timer
    if (session.timerId) {
        clearTimeout(session.timerId)
        session.timerId = null
    }
}
