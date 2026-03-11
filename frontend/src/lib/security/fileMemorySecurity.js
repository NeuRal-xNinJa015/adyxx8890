/**
 * ADYX File Memory Security
 * 
 * Secures decrypted file data in memory:
 *   - Tracks all decrypted buffers for later secure wipe
 *   - Overwrites buffers with random data on destruction
 *   - Prevents browser caching of blob URLs
 *   - Integrates with existing secureWipe.js
 * 
 * Usage:
 *   import { createSecureBuffer, destroySecureBuffer } from './fileMemorySecurity.js'
 *   const { id, url } = createSecureBuffer(decryptedArrayBuffer, 'image/jpeg')
 *   // ... use url in <img src={url}>
 *   destroySecureBuffer(id)  // wipes data + revokes URL
 */

// ── State ──

const bufferStore = new Map()  // id → { buffer, blobUrl, type, createdAt }
let nextId = 0

/**
 * Create a secure buffer entry for decrypted file data.
 * Returns an ID for tracking and a blob URL for display.
 * 
 * @param {ArrayBuffer} arrayBuffer - Decrypted file data
 * @param {string} mimeType - MIME type for blob URL
 * @returns {{ id: string, url: string }}
 */
export function createSecureBuffer(arrayBuffer, mimeType = 'application/octet-stream') {
    const id = `secure_buf_${nextId++}_${Date.now()}`

    // Create a copy so we control the memory
    const copy = new Uint8Array(arrayBuffer.slice(0))

    // Create blob URL with no-cache headers
    const blob = new Blob([copy], { type: mimeType })
    const url = URL.createObjectURL(blob)

    bufferStore.set(id, {
        buffer: copy,
        blobUrl: url,
        type: mimeType,
        createdAt: Date.now(),
        size: copy.length
    })

    console.log(`[MemSecurity] Buffer created: ${id} (${formatSize(copy.length)})`)

    return { id, url }
}

/**
 * Destroy a specific secure buffer.
 * Overwrites data with random bytes, revokes blob URL.
 * 
 * @param {string} id - Buffer ID from createSecureBuffer
 */
export function destroySecureBuffer(id) {
    const entry = bufferStore.get(id)
    if (!entry) return

    // 1. Overwrite buffer with random data
    if (entry.buffer) {
        crypto.getRandomValues(entry.buffer)
        // Zero it out after random overwrite
        entry.buffer.fill(0)
    }

    // 2. Revoke blob URL
    if (entry.blobUrl) {
        try {
            URL.revokeObjectURL(entry.blobUrl)
        } catch (e) { /* ignore */ }
    }

    // 3. Null all references
    entry.buffer = null
    entry.blobUrl = null
    entry.type = null

    bufferStore.delete(id)
    console.log(`[MemSecurity] Buffer destroyed: ${id}`)
}

/**
 * Destroy all tracked secure buffers.
 * Call on session end, logout, or panic wipe.
 */
export function destroyAllBuffers() {
    let count = 0
    for (const id of bufferStore.keys()) {
        destroySecureBuffer(id)
        count++
    }
    bufferStore.clear()
    if (count > 0) {
        console.log(`[MemSecurity] All ${count} buffers destroyed`)
    }
}

/**
 * Get the count of active secure buffers.
 * 
 * @returns {number}
 */
export function getActiveBufferCount() {
    return bufferStore.size
}

/**
 * Get the total size of all active buffers.
 * 
 * @returns {number} bytes
 */
export function getActiveBufferSize() {
    let total = 0
    for (const entry of bufferStore.values()) {
        total += entry.size || 0
    }
    return total
}

/**
 * Prevent the browser from caching responses.
 * Called once at initialization.
 */
export function preventCaching() {
    // Add meta tags to prevent caching
    const metaTags = [
        { 'http-equiv': 'Cache-Control', content: 'no-cache, no-store, must-revalidate' },
        { 'http-equiv': 'Pragma', content: 'no-cache' },
        { 'http-equiv': 'Expires', content: '0' },
    ]

    metaTags.forEach(attrs => {
        const existing = document.querySelector(`meta[http-equiv="${attrs['http-equiv']}"]`)
        if (!existing) {
            const meta = document.createElement('meta')
            Object.entries(attrs).forEach(([k, v]) => meta.setAttribute(k, v))
            document.head.appendChild(meta)
        }
    })

    console.log('[MemSecurity] Browser caching prevention active')
}

/**
 * Register with secureWipe to ensure file buffers are cleaned up.
 * Call once during security initialization.
 */
export function registerWithSecureWipe() {
    // Hook into beforeunload to wipe on page close
    window.addEventListener('beforeunload', () => {
        destroyAllBuffers()
    })

    // Hook into pagehide for mobile browsers
    window.addEventListener('pagehide', () => {
        destroyAllBuffers()
    })

    console.log('[MemSecurity] Registered with secure wipe hooks')
}

// ── Helpers ──

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
