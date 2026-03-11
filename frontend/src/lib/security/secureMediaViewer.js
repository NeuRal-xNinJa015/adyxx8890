/**
 * ADYX Secure Media Viewer — Protection Logic
 * 
 * Provides anti-exfiltration protections for the media viewer:
 *   - Right-click, copy, drag, save, print blocking
 *   - Dynamic watermark overlay
 *   - Blur on tab switch / window focus loss
 *   - Fullscreen management
 * 
 * Integrates with existing antiExfiltration.js and dynamicWatermark.js.
 * 
 * Usage:
 *   import { createViewerProtections, destroyViewerProtections } from './secureMediaViewer.js'
 *   const cleanup = createViewerProtections(containerElement, sessionId, deviceHash)
 *   // ... when done:
 *   cleanup()
 */

import SECURITY_CONFIG from './config.js'

let activeProtections = null

/**
 * Apply all viewer protections to a container element.
 * Returns a cleanup function.
 * 
 * @param {HTMLElement} container - The viewer container element
 * @param {string} sessionId - Current session/device ID
 * @param {string} deviceHash - Device fingerprint hash
 * @returns {Function} cleanup - Call to remove all protections
 */
export function createViewerProtections(container, sessionId = '', deviceHash = '') {
    if (activeProtections) {
        destroyViewerProtections()
    }

    const cleanups = []

    // 1. Disable right-click
    const contextMenuHandler = (e) => {
        e.preventDefault()
        e.stopPropagation()
        return false
    }
    container.addEventListener('contextmenu', contextMenuHandler, true)
    cleanups.push(() => container.removeEventListener('contextmenu', contextMenuHandler, true))

    // 2. Disable copy shortcuts
    const keyHandler = (e) => {
        // Block Ctrl+C, Ctrl+S, Ctrl+P, Ctrl+Shift+S, PrintScreen
        if (e.ctrlKey && ['c', 's', 'p', 'a'].includes(e.key.toLowerCase())) {
            e.preventDefault()
            e.stopPropagation()
            return false
        }
        if (e.key === 'PrintScreen' || e.key === 'F12') {
            e.preventDefault()
            e.stopPropagation()
            return false
        }
    }
    document.addEventListener('keydown', keyHandler, true)
    cleanups.push(() => document.removeEventListener('keydown', keyHandler, true))

    // 3. Disable drag
    const dragHandler = (e) => {
        e.preventDefault()
        e.stopPropagation()
        return false
    }
    container.addEventListener('dragstart', dragHandler, true)
    container.addEventListener('drop', dragHandler, true)
    cleanups.push(() => {
        container.removeEventListener('dragstart', dragHandler, true)
        container.removeEventListener('drop', dragHandler, true)
    })

    // 4. Prevent save on images
    container.querySelectorAll('img, video').forEach(el => {
        el.setAttribute('draggable', 'false')
        el.style.pointerEvents = 'auto'
        el.addEventListener('contextmenu', contextMenuHandler, true)
    })

    // 5. CSS protections
    const styleEl = document.createElement('style')
    styleEl.id = 'adyx-viewer-protection-style'
    styleEl.textContent = `
        .adyx-secure-viewer * {
            -webkit-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
        }
        .adyx-secure-viewer img,
        .adyx-secure-viewer video {
            pointer-events: auto !important;
            -webkit-user-drag: none !important;
        }
        @media print {
            .adyx-secure-viewer { display: none !important; }
            body::after {
                content: 'Printing is disabled for security reasons';
                display: block;
                padding: 40px;
                text-align: center;
                font-size: 24px;
            }
        }
    `
    document.head.appendChild(styleEl)
    cleanups.push(() => styleEl.remove())

    container.classList.add('adyx-secure-viewer')
    cleanups.push(() => container.classList.remove('adyx-secure-viewer'))

    // 6. Blur on focus loss
    const blurOverlay = createBlurOverlay(container)
    const visibilityHandler = () => {
        if (document.hidden) {
            showBlur(blurOverlay)
        } else {
            hideBlur(blurOverlay)
        }
    }
    const windowBlurHandler = () => showBlur(blurOverlay)
    const windowFocusHandler = () => hideBlur(blurOverlay)

    document.addEventListener('visibilitychange', visibilityHandler)
    window.addEventListener('blur', windowBlurHandler)
    window.addEventListener('focus', windowFocusHandler)
    cleanups.push(() => {
        document.removeEventListener('visibilitychange', visibilityHandler)
        window.removeEventListener('blur', windowBlurHandler)
        window.removeEventListener('focus', windowFocusHandler)
        blurOverlay.remove()
    })

    // 7. Dynamic watermark
    const watermarkCanvas = createViewerWatermark(container, sessionId, deviceHash)
    cleanups.push(() => watermarkCanvas?.remove())

    // 8. Disable print
    const printHandler = (e) => {
        if (e.ctrlKey && e.key.toLowerCase() === 'p') {
            e.preventDefault()
            e.stopPropagation()
        }
    }
    window.addEventListener('keydown', printHandler, true)
    cleanups.push(() => window.removeEventListener('keydown', printHandler, true))

    // Store active protections
    activeProtections = {
        container,
        cleanups
    }

    console.log('[SecureViewer] Protections active')

    return () => destroyViewerProtections()
}

/**
 * Remove all active viewer protections.
 */
export function destroyViewerProtections() {
    if (!activeProtections) return

    activeProtections.cleanups.forEach(fn => {
        try { fn() } catch (e) { /* ignore */ }
    })
    activeProtections = null

    console.log('[SecureViewer] Protections destroyed')
}

/**
 * Request fullscreen for the viewer container.
 * 
 * @param {HTMLElement} element
 * @returns {Promise<boolean>}
 */
export async function enterFullscreen(element) {
    try {
        if (element.requestFullscreen) {
            await element.requestFullscreen()
        } else if (element.webkitRequestFullscreen) {
            await element.webkitRequestFullscreen()
        }
        return true
    } catch (e) {
        console.warn('[SecureViewer] Fullscreen request denied:', e)
        return false
    }
}

/**
 * Exit fullscreen.
 */
export async function exitFullscreen() {
    try {
        if (document.fullscreenElement) {
            await document.exitFullscreen()
        } else if (document.webkitFullscreenElement) {
            await document.webkitExitFullscreen()
        }
    } catch (e) {
        // Ignore
    }
}

// ── Internal Helpers ──

function createBlurOverlay(container) {
    const overlay = document.createElement('div')
    overlay.className = 'adyx-viewer-blur-overlay'
    overlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        color: rgba(255,255,255,0.5);
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        letter-spacing: 2px;
    `
    overlay.innerHTML = `
        <div style="text-align:center">
            <div style="font-size:24px;margin-bottom:8px">LOCKED</div>
            <div>CONTENT PROTECTED</div>
            <div style="font-size:10px;margin-top:4px;opacity:0.5">Return to this tab to view</div>
        </div>
    `
    container.style.position = 'relative'
    container.appendChild(overlay)
    return overlay
}

function showBlur(overlay) {
    if (overlay) overlay.style.display = 'flex'
}

function hideBlur(overlay) {
    if (overlay) overlay.style.display = 'none'
}

function createViewerWatermark(container, sessionId, deviceHash) {
    const canvas = document.createElement('canvas')
    canvas.className = 'adyx-viewer-watermark'
    canvas.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 99998;
        opacity: 0.06;
        mix-blend-mode: overlay;
    `
    container.appendChild(canvas)

    const renderWatermark = () => {
        const w = container.clientWidth
        const h = container.clientHeight
        canvas.width = w * window.devicePixelRatio
        canvas.height = h * window.devicePixelRatio

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
        ctx.clearRect(0, 0, w, h)

        const parts = []
        if (sessionId) parts.push(`SID:${sessionId.slice(0, 8)}`)
        parts.push(new Date().toISOString().slice(0, 19))
        if (deviceHash) parts.push(`DEV:${deviceHash.slice(0, 8)}`)
        parts.push('ADYX SECURE')

        const text = parts.join('  ·  ')

        ctx.font = '10px "JetBrains Mono", "SF Mono", monospace'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
        ctx.textAlign = 'center'

        const angle = -0.35
        const lineHeight = 60
        const colWidth = 300

        for (let y = -h; y < h * 2; y += lineHeight) {
            for (let x = -w; x < w * 2; x += colWidth) {
                ctx.save()
                ctx.translate(x, y)
                ctx.rotate(angle)
                ctx.fillText(text, 0, 0)
                ctx.restore()
            }
        }
    }

    renderWatermark()

    // Update periodically
    const interval = setInterval(renderWatermark, 15000)
    canvas._adyxCleanup = () => clearInterval(interval)

    const originalRemove = canvas.remove.bind(canvas)
    canvas.remove = () => {
        canvas._adyxCleanup?.()
        originalRemove()
    }

    return canvas
}
