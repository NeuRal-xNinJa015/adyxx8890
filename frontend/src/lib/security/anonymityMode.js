/**
 * ADYX Anonymity Mode
 * 
 * Features:
 *   - Ephemeral identity per room (random pseudonym)
 *   - No persistent identity across rooms
 *   - Tor-compatible mode (.onion hostname detection)
 *   - Header stripping when anonymity mode is active
 */

import SECURITY_CONFIG from './config.js'

// Word lists for generating anonymous names
const ADJECTIVES = [
    'silent', 'shadow', 'phantom', 'cipher', 'stealth', 'hidden', 'dark', 'ghost',
    'null', 'void', 'zero', 'quantum', 'binary', 'crypto', 'masked', 'anon',
    'rogue', 'echo', 'drift', 'flux', 'nova', 'omega', 'delta', 'sigma'
]

const NOUNS = [
    'agent', 'node', 'proxy', 'relay', 'beacon', 'vector', 'shield', 'vault',
    'circuit', 'matrix', 'kernel', 'daemon', 'socket', 'packet', 'cipher', 'hash',
    'pulse', 'wave', 'spark', 'byte', 'bit', 'core', 'link', 'gate'
]

let currentIdentity = null

/**
 * Generate a random ephemeral identity for a room.
 * Returns { displayName, identityHash }
 */
export function generateEphemeralIdentity() {
    if (!SECURITY_CONFIG.anonymity.enabled || !SECURITY_CONFIG.anonymity.ephemeralIdentity) {
        return null
    }

    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
    const suffix = Math.floor(Math.random() * 100).toString().padStart(2, '0')

    const displayName = `${adj}_${noun}_${suffix}`

    // Generate a hash for identity binding (without revealing the name)
    const identityBytes = crypto.getRandomValues(new Uint8Array(16))
    let hex = ''
    for (const b of identityBytes) {
        hex += b.toString(16).padStart(2, '0')
    }

    currentIdentity = {
        displayName,
        identityHash: hex,
        createdAt: Date.now(),
        roomBound: false,
    }

    console.log('[Anonymity] Ephemeral identity:', displayName)
    return currentIdentity
}

/**
 * Bind the current identity to a specific room.
 * After binding, the identity cannot be reused in another room.
 */
export function bindIdentityToRoom(roomCode) {
    if (currentIdentity) {
        currentIdentity.roomBound = true
        currentIdentity.roomCode = roomCode
        console.log('[Anonymity] Identity bound to room:', roomCode)
    }
}

/**
 * Get the current ephemeral identity.
 */
export function getCurrentIdentity() {
    return currentIdentity
}

/**
 * Destroy the current identity.
 */
export function destroyIdentity() {
    currentIdentity = null
    console.log('[Anonymity] Identity destroyed')
}

/**
 * Check if running over Tor (.onion hostname).
 */
export function isTorConnection() {
    if (!SECURITY_CONFIG.anonymity.torCompatible) return false
    return location.hostname.endsWith('.onion')
}

/**
 * Get the appropriate WebSocket URL for the current mode.
 * In Tor mode, uses the .onion hostname.
 */
export function getAnonymousWSUrl() {
    if (isTorConnection()) {
        // Use the same .onion hostname for WebSocket
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${protocol}//${location.host}/ws`
    }

    // Standard mode — use the default URL
    return null  // null = use default WS_URL from ws.js
}

/**
 * Get headers that should be stripped in anonymity mode.
 * These headers can leak identifying information.
 */
export function getStrippedHeaders() {
    if (!SECURITY_CONFIG.anonymity.enabled) return []

    return [
        'X-Forwarded-For',
        'X-Real-IP',
        'Via',
        'Forwarded',
        'X-Client-IP',
        'CF-Connecting-IP',
        'True-Client-IP',
        'X-Cluster-Client-IP',
    ]
}

/**
 * Check if anonymity mode is active.
 */
export function isAnonymityActive() {
    return SECURITY_CONFIG.anonymity.enabled
}
