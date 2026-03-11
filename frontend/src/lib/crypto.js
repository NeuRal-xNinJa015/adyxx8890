/**
 * ADYX Crypto Module — Real End-to-End Encryption
 * 
 * Uses Web Crypto API:
 *   - ECDH P-256 for key exchange
 *   - AES-256-GCM for message encryption
 *   - HKDF for key derivation
 * 
 * Flow:
 *   1. Both peers generate ephemeral ECDH key pairs
 *   2. Public keys are exchanged via the server
 *   3. Each peer derives a shared secret using ECDH
 *   4. Shared secret is stretched via HKDF into an AES-256 key
 *   5. All messages are encrypted with AES-256-GCM (unique IV per message)
 */

let keyPair = null
let sharedKey = null

/**
 * Generate an ephemeral ECDH P-256 key pair for this session.
 * Returns the public key as a base64-encoded string for transmission.
 */
export async function generateKeyPair() {
    keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false,  // non-extractable private key
        ['deriveKey', 'deriveBits']
    )

    // Export public key as raw bytes → base64
    const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    return arrayBufferToBase64(pubRaw)
}

/**
 * Derive a shared AES-256-GCM key from our private key + peer's public key.
 * Uses HKDF with SHA-256 to stretch the ECDH shared secret.
 */
export async function deriveSharedKey(peerPublicKeyBase64) {
    // Import peer's public key
    const peerPubRaw = base64ToArrayBuffer(peerPublicKeyBase64)
    const peerPublicKey = await crypto.subtle.importKey(
        'raw',
        peerPubRaw,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
    )

    // ECDH: derive shared bits
    const sharedBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: peerPublicKey },
        keyPair.privateKey,
        256
    )

    // Import shared bits as HKDF key material
    const hkdfKey = await crypto.subtle.importKey(
        'raw',
        sharedBits,
        'HKDF',
        false,
        ['deriveKey']
    )

    // HKDF: derive AES-256-GCM key
    sharedKey = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode('adyx-e2e-v1'),
            info: new TextEncoder().encode('adyx-message-key')
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )

    return true
}

/**
 * Encrypt a plaintext message using AES-256-GCM.
 * Returns { ciphertext, iv } both as base64 strings.
 * Each message gets a unique 12-byte random IV.
 */
export async function encrypt(plaintext) {
    if (!sharedKey) throw new Error('No shared key — key exchange not complete')

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(plaintext)

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        sharedKey,
        encoded
    )

    return {
        ciphertext: arrayBufferToBase64(cipherBuffer),
        iv: arrayBufferToBase64(iv)
    }
}

/**
 * Decrypt a ciphertext message using AES-256-GCM.
 * Expects { ciphertext, iv } both as base64 strings.
 * Returns the plaintext string.
 */
export async function decrypt(ciphertext, iv) {
    if (!sharedKey) throw new Error('No shared key — key exchange not complete')

    const cipherBuffer = base64ToArrayBuffer(ciphertext)
    const ivBuffer = base64ToArrayBuffer(iv)

    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
        sharedKey,
        cipherBuffer
    )

    return new TextDecoder().decode(plainBuffer)
}

/**
 * Check if encryption is ready (key exchange complete).
 */
export function isReady() {
    return sharedKey !== null
}

/**
 * Reset all crypto state — call on session end.
 */
export function reset() {
    keyPair = null
    sharedKey = null
}

// ── Helpers ──

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
}
