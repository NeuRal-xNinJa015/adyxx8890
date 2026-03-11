/**
 * ADYX Dynamic Watermark Overlay
 * 
 * Renders a semi-transparent watermark over the chat area containing:
 *   - Session ID (truncated)
 *   - Current timestamp
 *   - Device hash (fingerprint)
 * 
 * Subtle diagonal text pattern with slight animation.
 * Non-interactive (pointer-events: none).
 */

import SECURITY_CONFIG from './config.js'

let canvas = null
let ctx = null
let animationFrame = null
let updateInterval = null
let rotation = 0

/**
 * Initialize the dynamic watermark.
 * @param {string} sessionId - Current session/device ID
 * @param {string} deviceHash - Truncated device fingerprint
 */
export function initWatermark(sessionId = '', deviceHash = '') {
    const config = SECURITY_CONFIG.watermark
    if (!config.enabled) {
        console.log('[Watermark] Disabled by config')
        return
    }

    // Create canvas
    canvas = document.createElement('canvas')
    canvas.id = 'adyx-watermark'
    canvas.style.cssText = `
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 99990;
        opacity: ${config.opacity};
        mix-blend-mode: overlay;
    `
    document.body.appendChild(canvas)

    ctx = canvas.getContext('2d')

    // Draw initial watermark
    const drawWatermark = () => {
        resizeCanvas()
        render(sessionId, deviceHash)
    }

    drawWatermark()

    // Update timestamp periodically
    updateInterval = setInterval(drawWatermark, config.updateIntervalMs)

    // Animation loop (subtle drift)
    if (config.animationEnabled) {
        const animate = () => {
            rotation += 0.001
            render(sessionId, deviceHash)
            animationFrame = requestAnimationFrame(animate)
        }
        animationFrame = requestAnimationFrame(animate)
    }

    // Handle resize
    window.addEventListener('resize', drawWatermark)

    console.log('[Watermark] Active')
}

/**
 * Destroy the watermark.
 */
export function destroyWatermark() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame)
        animationFrame = null
    }
    if (updateInterval) {
        clearInterval(updateInterval)
        updateInterval = null
    }
    if (canvas) {
        canvas.remove()
        canvas = null
        ctx = null
    }
    console.log('[Watermark] Destroyed')
}

// ── Rendering ──

function resizeCanvas() {
    if (!canvas) return
    canvas.width = window.innerWidth * window.devicePixelRatio
    canvas.height = window.innerHeight * window.devicePixelRatio
    if (ctx) {
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
}

function render(sessionId, deviceHash) {
    if (!ctx || !canvas) return

    const w = window.innerWidth
    const h = window.innerHeight

    ctx.clearRect(0, 0, w, h)

    // Build watermark text
    const config = SECURITY_CONFIG.watermark
    const parts = []
    if (config.showSessionId && sessionId) parts.push(`SID:${sessionId.slice(0, 8)}`)
    if (config.showTimestamp) parts.push(new Date().toISOString().slice(0, 19))
    if (config.showDeviceHash && deviceHash) parts.push(`DEV:${deviceHash.slice(0, 8)}`)

    const text = parts.join('  ·  ')
    if (!text) return

    ctx.save()
    ctx.font = '10px "JetBrains Mono", "SF Mono", monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.textAlign = 'center'

    // Diagonal grid pattern
    const baseAngle = -0.35 + (rotation || 0) // ~-20 degrees + subtle drift
    const lineHeight = 80
    const colWidth = 350

    for (let y = -h; y < h * 2; y += lineHeight) {
        for (let x = -w; x < w * 2; x += colWidth) {
            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(baseAngle)
            ctx.fillText(text, 0, 0)
            ctx.restore()
        }
    }

    ctx.restore()
}
