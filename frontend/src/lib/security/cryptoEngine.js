/**
 * ADYX CryptoEngine — Advanced Cryptographic Primitives
 * 
 * Provides:
 *   - ECDH P-384 key exchange (upgrade from P-256)
 *   - AES-256-GCM authenticated encryption
 *   - ECDSA P-384 digital signatures
 *   - HKDF key derivation with domain separation
 *   - Key serialization helpers
 * 
 * All operations use the Web Crypto API — no external dependencies.
 * Keys are non-extractable where possible for maximum security.
 */

import SECURITY_CONFIG from './config.js'

// ── Encoding Helpers ──

export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

export function base64ToArrayBuffer(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
}

export function concatBuffers(...buffers) {
    const total = buffers.reduce((sum, b) => sum + b.byteLength, 0)
    const result = new Uint8Array(total)
    let offset = 0
    for (const buf of buffers) {
        result.set(new Uint8Array(buf), offset)
        offset += buf.byteLength
    }
    return result.buffer
}

// ── ECDH Key Exchange (P-384) ──

/**
 * Generate an ephemeral ECDH P-384 key pair.
 * Returns { keyPair, publicKeyBase64 }
 */
export async function generateECDHKeyPair() {
    const curve = SECURITY_CONFIG.encryption.curveType || 'P-384'
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: curve },
        false,  // non-extractable private key
        ['deriveBits']
    )
    const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    return {
        keyPair,
        publicKeyBase64: arrayBufferToBase64(pubRaw)
    }
}

/**
 * Import a peer's raw ECDH public key from base64.
 */
export async function importECDHPublicKey(base64) {
    const curve = SECURITY_CONFIG.encryption.curveType || 'P-384'
    const raw = base64ToArrayBuffer(base64)
    return crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'ECDH', namedCurve: curve },
        false,
        []
    )
}

/**
 * Derive shared bits from our private key + peer public key.
 * Returns raw ArrayBuffer of shared secret.
 */
export async function deriveSharedBits(privateKey, peerPublicKey) {
    return crypto.subtle.deriveBits(
        { name: 'ECDH', public: peerPublicKey },
        privateKey,
        384  // P-384 = 384 bits
    )
}

// ── HKDF Key Derivation ──

/**
 * Derive an AES-256-GCM key from raw key material using HKDF.
 * @param {ArrayBuffer} ikm - Input keying material
 * @param {string} salt - Salt string
 * @param {string} info - Context/info string for domain separation
 * @returns {Promise<CryptoKey>} AES-256-GCM key
 */
export async function deriveAESKey(ikm, salt, info) {
    const hkdfKey = await crypto.subtle.importKey(
        'raw',
        ikm,
        'HKDF',
        false,
        ['deriveKey', 'deriveBits']
    )

    return crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-384',
            salt: new TextEncoder().encode(salt),
            info: new TextEncoder().encode(info)
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,  // non-extractable
        ['encrypt', 'decrypt']
    )
}

/**
 * Derive raw bits from key material using HKDF (for chain key ratcheting).
 */
export async function deriveHKDFBits(ikm, salt, info, lengthBits = 256) {
    const hkdfKey = await crypto.subtle.importKey(
        'raw',
        ikm,
        'HKDF',
        false,
        ['deriveBits']
    )

    return crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-384',
            salt: new TextEncoder().encode(salt),
            info: new TextEncoder().encode(info)
        },
        hkdfKey,
        lengthBits
    )
}

// ── AES-256-GCM Encryption ──

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns { ciphertext, iv, tag } all as base64.
 */
export async function aesEncrypt(key, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(plaintext)

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        key,
        encoded
    )

    return {
        ciphertext: arrayBufferToBase64(cipherBuffer),
        iv: arrayBufferToBase64(iv)
    }
}

/**
 * Decrypt ciphertext with AES-256-GCM.
 * Returns plaintext string.
 */
export async function aesDecrypt(key, ciphertextBase64, ivBase64) {
    const cipherBuffer = base64ToArrayBuffer(ciphertextBase64)
    const iv = base64ToArrayBuffer(ivBase64)

    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: 128 },
        key,
        cipherBuffer
    )

    return new TextDecoder().decode(plainBuffer)
}

// ── ECDSA Digital Signatures (P-384) ──

/**
 * Generate an ECDSA P-384 signing key pair.
 * Returns { signingKeyPair, verifyKeyBase64 }
 */
export async function generateSigningKeyPair() {
    const curve = SECURITY_CONFIG.encryption.curveType || 'P-384'
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: curve },
        false,
        ['sign', 'verify']
    )

    // Export public verify key for transmission
    const pubRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey)
    return {
        signingKeyPair: keyPair,
        verifyKeyBase64: arrayBufferToBase64(pubRaw)
    }
}

/**
 * Import a peer's ECDSA verify key from base64.
 */
export async function importVerifyKey(base64) {
    const curve = SECURITY_CONFIG.encryption.curveType || 'P-384'
    const raw = base64ToArrayBuffer(base64)
    return crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'ECDSA', namedCurve: curve },
        false,
        ['verify']
    )
}

/**
 * Sign data with ECDSA private key.
 * Returns signature as base64.
 */
export async function sign(privateKey, data) {
    const curve = SECURITY_CONFIG.encryption.curveType || 'P-384'
    const hash = curve === 'P-384' ? 'SHA-384' : 'SHA-256'
    const encoded = typeof data === 'string' ? new TextEncoder().encode(data) : data

    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash },
        privateKey,
        encoded
    )

    return arrayBufferToBase64(sig)
}

/**
 * Verify an ECDSA signature.
 * Returns boolean.
 */
export async function verify(publicKey, signatureBase64, data) {
    const curve = SECURITY_CONFIG.encryption.curveType || 'P-384'
    const hash = curve === 'P-384' ? 'SHA-384' : 'SHA-256'
    const sig = base64ToArrayBuffer(signatureBase64)
    const encoded = typeof data === 'string' ? new TextEncoder().encode(data) : data

    return crypto.subtle.verify(
        { name: 'ECDSA', hash },
        publicKey,
        sig,
        encoded
    )
}

// ── Utility ──

/**
 * Generate cryptographically random bytes.
 */
export function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * SHA-256 hash of arbitrary data.
 */
export async function sha256(data) {
    const encoded = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const hash = await crypto.subtle.digest('SHA-256', encoded)
    return arrayBufferToBase64(hash)
}

/**
 * SHA-384 hash of arbitrary data.
 */
export async function sha384(data) {
    const encoded = typeof data === 'string' ? new TextEncoder().encode(data) : data
    const hash = await crypto.subtle.digest('SHA-384', encoded)
    return arrayBufferToBase64(hash)
}

/**
 * Constant-time comparison of two base64 strings (timing-safe).
 */
export function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return diff === 0
}
