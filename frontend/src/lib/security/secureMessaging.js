/**
 * ADYX Secure Messaging — Wrapper Layer
 * 
 * Wraps the existing ws.sendMessage() and message receive flow with:
 *   - Double Ratchet encryption (PFS)
 *   - ECDSA digital signatures
 *   - Graceful fallback when security is disabled
 * 
 * DOES NOT modify ws.js or crypto.js — uses composition pattern.
 */

import SECURITY_CONFIG from './config.js'
import { DoubleRatchet } from './doubleRatchet.js'
import {
    generateECDHKeyPair,
    importECDHPublicKey,
    deriveSharedBits,
    generateSigningKeyPair,
    importVerifyKey,
    sign,
    verify,
    sha256,
    arrayBufferToBase64
} from './cryptoEngine.js'

// ── State ──
let ratchet = null
let signingKeyPair = null
let peerVerifyKey = null
let onSecureMessageCallback = null
let isInitiator = false
let sessionActive = false

/**
 * Initialize the secure messaging layer.
 * Call once when a room session begins.
 * 
 * @param {boolean} initiator - Whether this device is the room creator
 */
export async function initSecureSession(initiator) {
    if (!SECURITY_CONFIG.encryption.enabled) {
        console.log('[SecureMsg] Encryption disabled by config')
        return
    }

    isInitiator = initiator
    ratchet = new DoubleRatchet()

    // Generate signing keys if signatures are enabled
    if (SECURITY_CONFIG.encryption.signMessages) {
        const { signingKeyPair: kp, verifyKeyBase64 } = await generateSigningKeyPair()
        signingKeyPair = kp
        // The verify key will be sent to peer during key exchange
        console.log('[SecureMsg] Signing keys generated')
    }

    sessionActive = true
    console.log('[SecureMsg] Secure session initialized (initiator:', initiator, ')')
}

/**
 * Process key exchange with peer.
 * Call when peer_joined or key_exchange events arrive.
 * 
 * @param {string} peerPublicKeyB64 - Peer's ECDH public key (base64)
 * @param {string} peerVerifyKeyB64 - Peer's verify key (base64, optional)
 * @param {Function} sendKeyExchange - Function to send our public key to peer
 * @returns {object} - { publicKey, verifyKey } to send to peer
 */
export async function processKeyExchange(peerPublicKeyB64, peerVerifyKeyB64, sendKeyExchange) {
    if (!SECURITY_CONFIG.encryption.enabled || !sessionActive) return null

    // Import peer's verification key
    if (peerVerifyKeyB64 && SECURITY_CONFIG.encryption.signMessages) {
        try {
            peerVerifyKey = await importVerifyKey(peerVerifyKeyB64)
            console.log('[SecureMsg] Peer verify key imported')
        } catch (e) {
            console.warn('[SecureMsg] Failed to import peer verify key:', e)
        }
    }

    if (!SECURITY_CONFIG.encryption.doubleRatchet) {
        // Simple mode — no double ratchet, just upgraded key exchange
        console.log('[SecureMsg] Double Ratchet disabled, using simple E2E')
        return null
    }

    // Generate our ECDH key pair for the ratchet
    const { keyPair, publicKeyBase64 } = await generateECDHKeyPair()

    // Derive initial shared secret
    const peerPublicKey = await importECDHPublicKey(peerPublicKeyB64)
    const sharedBits = await deriveSharedBits(keyPair.privateKey, peerPublicKey)

    // Initialize the ratchet
    if (isInitiator) {
        await ratchet.initAsInitiator(sharedBits, peerPublicKeyB64)
    } else {
        await ratchet.initAsResponder(sharedBits, keyPair, publicKeyBase64)
    }

    console.log('[SecureMsg] Double Ratchet initialized')

    return {
        publicKey: publicKeyBase64,
        verifyKey: signingKeyPair ?
            arrayBufferToBase64(await crypto.subtle.exportKey('raw', signingKeyPair.publicKey)) :
            null
    }
}

/**
 * Encrypt a message for secure sending.
 * Wraps the payload — caller still uses ws.sendMessage() with the wrapped payload.
 * 
 * @param {string} plaintext - The message to encrypt
 * @returns {object} - Encrypted envelope: { securePayload, iv, header, signature }
 */
export async function encryptMessage(plaintext) {
    if (!SECURITY_CONFIG.encryption.enabled || !sessionActive) {
        return { securePayload: plaintext, encrypted: false }
    }

    // Use Double Ratchet if available
    if (ratchet && ratchet.isReady()) {
        const { header, ciphertext, iv } = await ratchet.encrypt(plaintext)

        let signature = null
        if (SECURITY_CONFIG.encryption.signMessages && signingKeyPair) {
            // Sign the ciphertext + header for authenticity
            const signData = ciphertext + JSON.stringify(header)
            signature = await sign(signingKeyPair.privateKey, signData)
        }

        return {
            securePayload: JSON.stringify({
                v: 2,  // Protocol version 2 = double ratchet
                h: header,
                c: ciphertext,
                iv: iv,
                s: signature
            }),
            encrypted: true
        }
    }

    // Fallback — return plaintext (existing crypto.js will handle basic E2E)
    return { securePayload: plaintext, encrypted: false }
}

/**
 * Decrypt a received message.
 * 
 * @param {string} payload - The received payload (may be JSON envelope or plaintext)
 * @param {string} iv - IV if provided at top level (legacy format)
 * @returns {object} - { plaintext, verified, protocol }
 */
export async function decryptMessage(payload, iv) {
    if (!SECURITY_CONFIG.encryption.enabled || !sessionActive) {
        return { plaintext: payload, verified: false, protocol: 'none' }
    }

    // Try to parse as secure envelope (v2)
    let envelope = null
    try {
        envelope = JSON.parse(payload)
    } catch {
        // Not JSON — plaintext message (legacy)
        return { plaintext: payload, verified: false, protocol: 'legacy' }
    }

    // Check for v2 double ratchet envelope
    if (envelope && envelope.v === 2 && ratchet && ratchet.isReady()) {
        try {
            // Verify signature if present
            let verified = false
            if (envelope.s && peerVerifyKey && SECURITY_CONFIG.encryption.signMessages) {
                const signData = envelope.c + JSON.stringify(envelope.h)
                verified = await verify(peerVerifyKey, envelope.s, signData)
                if (!verified) {
                    console.warn('[SecureMsg] Signature verification FAILED')
                }
            }

            // Decrypt via double ratchet
            const plaintext = await ratchet.decrypt(envelope.h, envelope.c, envelope.iv)
            return { plaintext, verified, protocol: 'double-ratchet-v2' }
        } catch (err) {
            console.error('[SecureMsg] Double Ratchet decrypt failed:', err)
            return { plaintext: '[Decryption failed — key mismatch or corrupted message]', verified: false, protocol: 'error' }
        }
    }

    // Not a v2 envelope — return as-is for legacy crypto.js handling
    return { plaintext: payload, verified: false, protocol: 'legacy' }
}

/**
 * Register a callback for when secure messages are received.
 */
export function onSecureMessage(callback) {
    onSecureMessageCallback = callback
}

/**
 * Check if the secure layer is ready.
 */
export function isSecureReady() {
    if (!SECURITY_CONFIG.encryption.enabled) return false
    if (SECURITY_CONFIG.encryption.doubleRatchet) {
        return ratchet !== null && ratchet.isReady()
    }
    return sessionActive
}

/**
 * Get current security status for UI display.
 */
export function getSecurityStatus() {
    return {
        enabled: SECURITY_CONFIG.encryption.enabled,
        doubleRatchet: ratchet?.isReady() || false,
        signatures: SECURITY_CONFIG.encryption.signMessages && signingKeyPair !== null,
        protocol: ratchet?.isReady() ? 'Double Ratchet (ECDH P-384 + AES-256-GCM)' : 'Basic E2E',
        pfs: ratchet?.isReady() || false,
    }
}

/**
 * Destroy the secure session — wipe all crypto state.
 */
export function destroySecureSession() {
    if (ratchet) {
        ratchet.destroy()
        ratchet = null
    }
    signingKeyPair = null
    peerVerifyKey = null
    onSecureMessageCallback = null
    sessionActive = false
    isInitiator = false
    console.log('[SecureMsg] Secure session destroyed')
}
