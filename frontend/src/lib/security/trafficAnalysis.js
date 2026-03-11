/**
 * ADYX Traffic Analysis Resistance
 * 
 * Prevents traffic analysis attacks via:
 *   - Uniform packet size padding (nearest 256-byte boundary)
 *   - Randomized padding bytes
 *   - Optional delay injection (0-500ms random)
 *   - Room ID encryption in transit
 */

import SECURITY_CONFIG from './config.js'

/**
 * Pad a payload to a uniform size (nearest block boundary).
 * Prevents message length analysis.
 * 
 * Format: [2-byte length][payload][random padding]
 * Total size is rounded up to the nearest BLOCK_SIZE.
 * 
 * @param {string} payload - The payload to pad
 * @returns {string} - The padded payload (base64)
 */
export function padPayload(payload) {
    const config = SECURITY_CONFIG.metadataProtection
    if (!config.enabled || !config.uniformPacketSize) return payload

    const blockSize = config.packetSizeBlock || 256
    const payloadBytes = new TextEncoder().encode(payload)

    // Calculate padded size (round up to nearest block)
    // Reserve 2 bytes for length prefix
    const totalNeeded = payloadBytes.length + 2
    const paddedSize = Math.ceil(totalNeeded / blockSize) * blockSize

    // Create padded buffer
    const padded = new Uint8Array(paddedSize)

    // Write 2-byte big-endian length prefix
    padded[0] = (payloadBytes.length >> 8) & 0xFF
    padded[1] = payloadBytes.length & 0xFF

    // Copy payload
    padded.set(payloadBytes, 2)

    // Fill remaining with random bytes
    const randomPart = padded.subarray(2 + payloadBytes.length)
    if (randomPart.length > 0) {
        crypto.getRandomValues(randomPart)
    }

    // Convert to base64
    let binary = ''
    for (let i = 0; i < padded.length; i++) {
        binary += String.fromCharCode(padded[i])
    }
    return btoa(binary)
}

/**
 * Unpad a payload.
 * Extracts the original message from a padded packet.
 * 
 * @param {string} paddedBase64 - The padded payload (base64)
 * @returns {string} - The original payload
 */
export function unpadPayload(paddedBase64) {
    const config = SECURITY_CONFIG.metadataProtection
    if (!config.enabled || !config.uniformPacketSize) return paddedBase64

    try {
        // Decode base64
        const binary = atob(paddedBase64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i)
        }

        // Read 2-byte length prefix
        const length = (bytes[0] << 8) | bytes[1]

        if (length > bytes.length - 2) {
            console.warn('[TrafficPad] Invalid padding — length exceeds buffer')
            return paddedBase64
        }

        // Extract original payload
        const payloadBytes = bytes.slice(2, 2 + length)
        return new TextDecoder().decode(payloadBytes)
    } catch (e) {
        console.warn('[TrafficPad] Unpad failed, returning raw:', e)
        return paddedBase64
    }
}

/**
 * Add a random delay before sending a message.
 * Returns a Promise that resolves after 0–maxDelay ms.
 */
export function randomDelay() {
    const config = SECURITY_CONFIG.metadataProtection
    if (!config.enabled || !config.randomDelayEnabled) {
        return Promise.resolve()
    }

    const maxDelay = config.maxDelayMs || 500
    const delay = Math.floor(Math.random() * maxDelay)

    return new Promise(resolve => setTimeout(resolve, delay))
}

/**
 * Encrypt a room identifier for transit.
 * Uses a simple XOR with a session-derived key for obfuscation.
 * (True encryption would require shared state, this provides basic obfuscation)
 * 
 * @param {string} roomCode - The room code (e.g., "a1b2c3")
 * @returns {string} - Obfuscated room code
 */
export async function obfuscateRoomId(roomCode) {
    const config = SECURITY_CONFIG.metadataProtection
    if (!config.enabled || !config.encryptRoomIds) return roomCode

    // Derive a session-specific mask from the room code
    const encoded = new TextEncoder().encode('adyx-room-mask-' + roomCode)
    const hash = await crypto.subtle.digest('SHA-256', encoded)
    const hashBytes = new Uint8Array(hash)

    // XOR room code bytes with hash
    const roomBytes = new TextEncoder().encode(roomCode)
    const obfuscated = new Uint8Array(roomBytes.length)
    for (let i = 0; i < roomBytes.length; i++) {
        obfuscated[i] = roomBytes[i] ^ hashBytes[i % hashBytes.length]
    }

    // Encode as hex
    let hex = ''
    for (const b of obfuscated) {
        hex += b.toString(16).padStart(2, '0')
    }
    return hex
}

/**
 * Generate a dummy/decoy message (same size as real messages).
 * Used to maintain constant traffic rate and prevent timing analysis.
 * 
 * @param {number} size - Target size in bytes
 * @returns {object} - Decoy message envelope
 */
export function generateDecoyMessage(size = 256) {
    const padding = new Uint8Array(size)
    crypto.getRandomValues(padding)

    let binary = ''
    for (let i = 0; i < padding.length; i++) {
        binary += String.fromCharCode(padding[i])
    }

    return {
        type: 'message',
        payload: btoa(binary),
        decoy: true,
        encrypted: true
    }
}
