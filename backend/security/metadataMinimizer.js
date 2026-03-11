/**
 * ADYX Metadata Minimizer — Zero-Knowledge Message Relay
 * 
 * Strips all non-essential metadata from relayed messages.
 * Ensures the server only ever sees encrypted blobs.
 * Whitelist-based field filtering per message type.
 */

import SECURITY_CONFIG from './securityConfig.js'

/**
 * Whitelist of allowed fields per message type.
 * Only these fields pass through the relay — everything else is stripped.
 */
const FIELD_WHITELIST = {
    auth: ['type', 'deviceId'],
    create_room: ['type'],
    join_room: ['type', 'roomCode'],
    key_exchange: ['type', 'roomCode', 'publicKey', 'verifyKey'],
    message: ['type', 'roomCode', 'payload', 'iv', 'encrypted', 'messageId'],
    typing: ['type', 'roomCode'],
    end_session: ['type', 'roomCode'],
    presence: ['type', 'status'],
}

/**
 * Minimize message metadata before relay.
 * Only whitelisted fields for the given message type are preserved.
 * 
 * @param {object} msg - The raw parsed message
 * @returns {object} - The minimized message
 */
export function minimizeMessage(msg) {
    if (!SECURITY_CONFIG.metadata.enabled) return msg
    if (!msg || !msg.type) return msg

    const allowed = FIELD_WHITELIST[msg.type]
    if (!allowed) return { type: msg.type }  // Unknown type — strip everything but type

    const minimized = {}
    for (const field of allowed) {
        if (msg[field] !== undefined) {
            minimized[field] = msg[field]
        }
    }

    return minimized
}

/**
 * Sanitize an outgoing relay message (server → client).
 * Removes any server-internal fields that should never reach the client.
 */
export function sanitizeOutgoing(msg) {
    if (!SECURITY_CONFIG.metadata.enabled) return msg

    const sanitized = { ...msg }

    // Never send these to clients
    delete sanitized._internal
    delete sanitized._serverTimestamp
    delete sanitized._sourceIP
    delete sanitized._rawHeaders

    // Strip timing info if configured
    if (SECURITY_CONFIG.metadata.stripTimingInfo) {
        delete sanitized.serverTime
        delete sanitized.relayedAt
    }

    return sanitized
}

/**
 * Strip sensitive fields from log output.
 * Use this when logging message content.
 */
export function redactForLogging(msg) {
    if (!msg) return msg

    const redacted = { ...msg }

    // Never log payload content
    if (redacted.payload) {
        redacted.payload = `[${typeof redacted.payload === 'string' ? redacted.payload.length : '?'} bytes]`
    }

    // Never log public keys in full
    if (redacted.publicKey) {
        redacted.publicKey = redacted.publicKey.slice(0, 8) + '...'
    }

    // Never log IVs
    if (redacted.iv) {
        redacted.iv = '[redacted]'
    }

    return redacted
}
