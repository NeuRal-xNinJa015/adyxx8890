/**
 * ADYX Secure File Crypto
 * 
 * Client-side file encryption/decryption using Web Crypto API:
 *   - AES-256-GCM for file encryption (per-file random key)
 *   - SHA-256 for integrity verification
 *   - Key import/export for E2E channel transmission
 * 
 * Zero-knowledge: file keys are transmitted through the existing
 * encrypted message channel, never exposed to the server.
 * 
 * Usage:
 *   import { generateFileKey, encryptFile, decryptFile } from './fileCrypto.js'
 *   const key = await generateFileKey()
 *   const { encrypted, iv } = await encryptFile(arrayBuffer, key)
 *   const decrypted = await decryptFile(encrypted, key, iv)
 */

// ── Key Generation ──

/**
 * Generate a random AES-256-GCM key for encrypting a single file.
 * A new key should be generated for each file.
 * 
 * @returns {Promise<CryptoKey>}
 */
export async function generateFileKey() {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,  // extractable — must export for E2E transmission
        ['encrypt', 'decrypt']
    )
}

// ── File Encryption ──

/**
 * Encrypt a file/buffer using AES-256-GCM.
 * 
 * @param {ArrayBuffer} data - Raw file data
 * @param {CryptoKey} key - AES-256-GCM key from generateFileKey()
 * @returns {Promise<{ encrypted: ArrayBuffer, iv: Uint8Array }>}
 */
export async function encryptFile(data, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        key,
        data
    )

    return { encrypted, iv }
}

// ── File Decryption ──

/**
 * Decrypt a file/buffer using AES-256-GCM.
 * 
 * @param {ArrayBuffer} encrypted - Encrypted file data
 * @param {CryptoKey} key - AES-256-GCM key
 * @param {Uint8Array|ArrayBuffer} iv - Initialization vector
 * @returns {Promise<ArrayBuffer>}
 */
export async function decryptFile(encrypted, key, iv) {
    const ivBuffer = iv instanceof Uint8Array ? iv : new Uint8Array(iv)

    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
        key,
        encrypted
    )
}

// ── Key Serialization ──

/**
 * Export a CryptoKey to a base64 string for transmission over E2E channel.
 * 
 * @param {CryptoKey} key
 * @returns {Promise<string>} Base64-encoded raw key
 */
export async function exportFileKey(key) {
    const raw = await crypto.subtle.exportKey('raw', key)
    return arrayBufferToBase64(raw)
}

/**
 * Import a CryptoKey from a base64 string received over E2E channel.
 * 
 * @param {string} base64Key - Base64-encoded raw key
 * @returns {Promise<CryptoKey>}
 */
export async function importFileKey(base64Key) {
    const raw = base64ToArrayBuffer(base64Key)
    return crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    )
}

// ── Integrity Verification ──

/**
 * Generate SHA-256 hash of data for integrity verification.
 * 
 * @param {ArrayBuffer} data
 * @returns {Promise<string>} Hex-encoded hash
 */
export async function hashFile(data) {
    const hash = await crypto.subtle.digest('SHA-256', data)
    return arrayBufferToHex(hash)
}

/**
 * Verify file integrity by comparing SHA-256 hashes.
 * 
 * @param {ArrayBuffer} data - File data to verify
 * @param {string} expectedHash - Expected hex hash
 * @returns {Promise<boolean>}
 */
export async function verifyFileIntegrity(data, expectedHash) {
    const actualHash = await hashFile(data)
    return actualHash === expectedHash
}

// ── Metadata Encryption ──

/**
 * Encrypt file metadata (name, type, size) for zero-knowledge storage.
 * The server only sees the encrypted blob, not what's inside.
 * 
 * @param {object} metadata - { name, type, size, category }
 * @param {CryptoKey} key - Same key used for the file
 * @returns {Promise<{ encrypted: string, iv: string }>} Base64-encoded
 */
export async function encryptMetadata(metadata, key) {
    const json = JSON.stringify(metadata)
    const encoded = new TextEncoder().encode(json)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        key,
        encoded
    )

    return {
        encrypted: arrayBufferToBase64(encrypted),
        iv: arrayBufferToBase64(iv)
    }
}

/**
 * Decrypt file metadata.
 * 
 * @param {string} encryptedBase64
 * @param {CryptoKey} key
 * @param {string} ivBase64
 * @returns {Promise<object>}
 */
export async function decryptMetadata(encryptedBase64, key, ivBase64) {
    const encrypted = base64ToArrayBuffer(encryptedBase64)
    const iv = base64ToArrayBuffer(ivBase64)

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv), tagLength: 128 },
        key,
        encrypted
    )

    const json = new TextDecoder().decode(decrypted)
    return JSON.parse(json)
}

// ── Chunking Helpers ──

const CHUNK_SIZE = 48 * 1024  // 48KB per chunk (fits in 64KB WS frame with overhead)

/**
 * Split encrypted data into chunks for transmission.
 * 
 * @param {ArrayBuffer} data
 * @returns {string[]} Array of base64-encoded chunks
 */
export function chunkData(data) {
    const bytes = new Uint8Array(data)
    const chunks = []
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const chunk = bytes.slice(offset, offset + CHUNK_SIZE)
        chunks.push(arrayBufferToBase64(chunk.buffer))
    }
    return chunks
}

/**
 * Reassemble chunks into a single ArrayBuffer.
 * 
 * @param {string[]} chunks - Array of base64-encoded chunks
 * @returns {ArrayBuffer}
 */
export function reassembleChunks(chunks) {
    const arrays = chunks.map(c => new Uint8Array(base64ToArrayBuffer(c)))
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const arr of arrays) {
        result.set(arr, offset)
        offset += arr.length
    }
    return result.buffer
}

// ── Helpers ──

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

function arrayBufferToHex(buffer) {
    const bytes = new Uint8Array(buffer)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}
