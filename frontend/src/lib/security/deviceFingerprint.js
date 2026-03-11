/**
 * ADYX Device Fingerprinting
 * 
 * Generates a browser/device fingerprint from:
 *   - User agent, screen resolution, timezone
 *   - WebGL renderer, canvas fingerprint
 *   - Language, color depth, platform
 *   - Hardware concurrency, device memory
 * 
 * SHA-256 hashed — never sent in raw form.
 * Used for session binding and anomaly detection.
 */

import SECURITY_CONFIG from './config.js'

let cachedFingerprint = null

/**
 * Generate a device fingerprint.
 * Returns a SHA-256 hash string.
 */
export async function generateFingerprint() {
    if (!SECURITY_CONFIG.deviceSecurity.enabled) return 'disabled'
    if (cachedFingerprint) return cachedFingerprint

    const components = []

    // User agent
    components.push(navigator.userAgent || '')

    // Screen
    components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`)
    components.push(`${screen.availWidth}x${screen.availHeight}`)

    // Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
    components.push(String(new Date().getTimezoneOffset()))

    // Language
    components.push(navigator.language || '')
    components.push((navigator.languages || []).join(','))

    // Platform
    components.push(navigator.platform || '')
    components.push(String(navigator.hardwareConcurrency || 0))
    components.push(String(navigator.deviceMemory || 0))
    components.push(String(navigator.maxTouchPoints || 0))

    // WebGL renderer
    try {
        const canvas = document.createElement('canvas')
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
            if (debugInfo) {
                components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '')
                components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
            }
            components.push(gl.getParameter(gl.RENDERER) || '')
        }
    } catch (e) { /* ignore */ }

    // Canvas fingerprint
    try {
        const canvas = document.createElement('canvas')
        canvas.width = 200
        canvas.height = 50
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.textBaseline = 'alphabetic'
            ctx.font = '14px Arial'
            ctx.fillStyle = '#f60'
            ctx.fillRect(125, 1, 62, 20)
            ctx.fillStyle = '#069'
            ctx.fillText('ADYX-FP-v1', 2, 15)
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
            ctx.fillText('ADYX-FP-v1', 4, 17)
            components.push(canvas.toDataURL())
        }
    } catch (e) { /* ignore */ }

    // Audio context fingerprint
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const oscillator = audioCtx.createOscillator()
        const analyser = audioCtx.createAnalyser()
        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime)
        const gainNode = audioCtx.createGain()
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
        oscillator.connect(analyser)
        analyser.connect(gainNode)
        gainNode.connect(audioCtx.destination)
        components.push(String(analyser.frequencyBinCount))
        audioCtx.close()
    } catch (e) { /* ignore */ }

    // Do not track
    components.push(String(navigator.doNotTrack || ''))

    // Connection type
    try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection
        if (conn) {
            components.push(conn.effectiveType || '')
        }
    } catch (e) { /* ignore */ }

    // Hash all components
    const raw = components.join('|')
    const encoded = new TextEncoder().encode(raw)
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded)
    const hashArray = new Uint8Array(hashBuffer)
    let hex = ''
    for (const b of hashArray) {
        hex += b.toString(16).padStart(2, '0')
    }

    cachedFingerprint = hex
    console.log('[Fingerprint] Generated:', hex.slice(0, 16) + '...')
    return hex
}

/**
 * Verify that the current device matches a previously stored fingerprint.
 * Returns { match: boolean, similarity: number }
 */
export async function verifyFingerprint(storedFingerprint) {
    const current = await generateFingerprint()
    const match = current === storedFingerprint
    return { match, current, stored: storedFingerprint }
}

/**
 * Get a truncated hash suitable for display (8 chars).
 */
export async function getShortFingerprint() {
    const fp = await generateFingerprint()
    return fp.slice(0, 8)
}

/**
 * Reset cached fingerprint (for testing).
 */
export function resetFingerprint() {
    cachedFingerprint = null
}
