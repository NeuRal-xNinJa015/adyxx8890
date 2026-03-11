/**
 * ADYX Anti-Exfiltration Module
 * 
 * Prevents data leakage via:
 *   - Text selection blocking
 *   - Right-click context menu blocking
 *   - Copy/paste keyboard shortcut blocking
 *   - Tab visibility blur (Visibility API)
 *   - DevTools detection → content blur
 *   - Auto-lock on window blur
 * 
 * All features are toggled via SECURITY_CONFIG.antiExfiltration
 */

import SECURITY_CONFIG from './config.js'

let isActive = false
let blurOverlay = null
let devToolsCheckInterval = null
let windowBlurTimer = null
let cleanupFunctions = []

/**
 * Initialize all anti-exfiltration measures.
 * Call once when entering the chat screen.
 */
export function initAntiExfiltration() {
    const config = SECURITY_CONFIG.antiExfiltration
    if (!config.enabled) {
        console.log('[AntiExfil] Disabled by config')
        return
    }

    console.log('[AntiExfil] Initializing anti-exfiltration measures')

    // Create blur overlay (hidden by default)
    createBlurOverlay()

    // Disable text selection
    if (config.disableTextSelection) {
        const style = document.createElement('style')
        style.id = 'adyx-no-select'
        style.textContent = `
            .chat__messages, .msg__bubble, .chat__sidebar-log {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }
        `
        document.head.appendChild(style)
        cleanupFunctions.push(() => style.remove())
    }

    // Disable right-click
    if (config.disableRightClick) {
        const handler = (e) => {
            if (e.target.closest('.chat, .msg, .chat__messages')) {
                e.preventDefault()
                e.stopPropagation()
                console.log('[AntiExfil] Right-click blocked')
            }
        }
        document.addEventListener('contextmenu', handler, true)
        cleanupFunctions.push(() => document.removeEventListener('contextmenu', handler, true))
    }

    // Disable copy shortcuts
    if (config.disableCopyShortcuts) {
        const handler = (e) => {
            if (e.target.closest('.chat, .msg, .chat__messages')) {
                const key = e.key?.toLowerCase()
                if ((e.ctrlKey || e.metaKey) && (key === 'c' || key === 'a' || key === 'x' || key === 'p' || key === 's')) {
                    // Allow Ctrl+C in input fields for normal typing experience
                    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                        if (key === 'c' || key === 'a' || key === 'x') return // Allow in inputs
                    }
                    e.preventDefault()
                    e.stopPropagation()
                    console.log('[AntiExfil] Copy shortcut blocked:', key)
                }
            }
        }
        document.addEventListener('keydown', handler, true)
        cleanupFunctions.push(() => document.removeEventListener('keydown', handler, true))
    }

    // Tab visibility blur
    if (config.blurOnTabSwitch) {
        const handler = () => {
            if (document.hidden) {
                showBlurOverlay('Tab hidden — content protected')
            } else {
                hideBlurOverlay()
            }
        }
        document.addEventListener('visibilitychange', handler)
        cleanupFunctions.push(() => document.removeEventListener('visibilitychange', handler))
    }

    // Window blur auto-lock
    if (config.autoLockOnBlur) {
        const blurHandler = () => {
            windowBlurTimer = setTimeout(() => {
                showBlurOverlay('Session locked — click to unlock')
            }, config.autoLockDelayMs)
        }
        const focusHandler = () => {
            if (windowBlurTimer) {
                clearTimeout(windowBlurTimer)
                windowBlurTimer = null
            }
            hideBlurOverlay()
        }
        window.addEventListener('blur', blurHandler)
        window.addEventListener('focus', focusHandler)
        cleanupFunctions.push(() => {
            window.removeEventListener('blur', blurHandler)
            window.removeEventListener('focus', focusHandler)
        })
    }

    // DevTools detection
    if (config.blurOnDevTools) {
        startDevToolsDetection()
    }

    // Disable drag
    const dragHandler = (e) => {
        if (e.target.closest('.chat, .msg')) {
            e.preventDefault()
        }
    }
    document.addEventListener('dragstart', dragHandler, true)
    cleanupFunctions.push(() => document.removeEventListener('dragstart', dragHandler, true))

    // Disable print
    const printHandler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'p') {
            e.preventDefault()
            console.log('[AntiExfil] Print blocked')
        }
    }
    document.addEventListener('keydown', printHandler, true)
    cleanupFunctions.push(() => document.removeEventListener('keydown', printHandler, true))

    isActive = true
    console.log('[AntiExfil] All measures active')
}

/**
 * Destroy all anti-exfiltration measures.
 * Call when leaving the chat screen.
 */
export function destroyAntiExfiltration() {
    cleanupFunctions.forEach(fn => fn())
    cleanupFunctions = []

    if (devToolsCheckInterval) {
        clearInterval(devToolsCheckInterval)
        devToolsCheckInterval = null
    }
    if (windowBlurTimer) {
        clearTimeout(windowBlurTimer)
        windowBlurTimer = null
    }
    if (blurOverlay) {
        blurOverlay.remove()
        blurOverlay = null
    }

    const noSelectStyle = document.getElementById('adyx-no-select')
    if (noSelectStyle) noSelectStyle.remove()

    isActive = false
    console.log('[AntiExfil] Destroyed')
}

/**
 * Check if anti-exfiltration is active.
 */
export function isAntiExfiltrationActive() {
    return isActive
}

// ── Blur Overlay ──

function createBlurOverlay() {
    blurOverlay = document.createElement('div')
    blurOverlay.id = 'adyx-blur-overlay'
    blurOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.95);
        backdrop-filter: blur(20px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        flex-direction: column;
        gap: 16px;
        cursor: pointer;
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
    `
    blurOverlay.innerHTML = `
        <div style="color: #ff4444; font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase;">
            CONTENT PROTECTED
        </div>
        <div id="adyx-blur-reason" style="color: #666; font-size: 11px; letter-spacing: 0.1em;"></div>
    `
    blurOverlay.addEventListener('click', () => {
        if (!document.hidden) {
            hideBlurOverlay()
        }
    })
    document.body.appendChild(blurOverlay)
}

function showBlurOverlay(reason = '') {
    if (blurOverlay) {
        const reasonEl = blurOverlay.querySelector('#adyx-blur-reason')
        if (reasonEl) reasonEl.textContent = reason
        blurOverlay.style.display = 'flex'
    }
}

function hideBlurOverlay() {
    if (blurOverlay) {
        blurOverlay.style.display = 'none'
    }
}

// ── DevTools Detection ──

function startDevToolsDetection() {
    let devToolsOpen = false

    devToolsCheckInterval = setInterval(() => {
        const widthThreshold = window.outerWidth - window.innerWidth > 160
        const heightThreshold = window.outerHeight - window.innerHeight > 160

        const isOpen = widthThreshold || heightThreshold

        if (isOpen && !devToolsOpen) {
            devToolsOpen = true
            showBlurOverlay('Developer tools detected — content hidden')
            console.warn('[AntiExfil] DevTools detected')
        } else if (!isOpen && devToolsOpen) {
            devToolsOpen = false
            if (!document.hidden) {
                hideBlurOverlay()
            }
        }
    }, 1000)

    cleanupFunctions.push(() => {
        clearInterval(devToolsCheckInterval)
        devToolsCheckInterval = null
    })
}
