/**
 * ADYX Secure Mode — Client-Side Content Protection Engine
 * 
 * Defense-grade content protection for sovereign messaging:
 *   - Screenshot prevention (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5)
 *   - Content blur on tab switch / window blur (hide messages when away)
 *   - Copy/cut/paste blocking on message content (input allowed)
 *   - Right-click blocking on messages
 *   - Print blocking (Ctrl+P + @media print)
 *   - DevTools detection & content protection
 *   - Keyboard shortcut protection (F12, Ctrl+Shift+I/J/C, Ctrl+U)
 *   - Text selection disabled on message bubbles
 * 
 * Unlike exam-mode software, this does NOT:
 *   - Force fullscreen (optional, user chooses)
 *   - Count violations or terminate sessions
 *   - Block normal OS usage (Alt+Tab is fine, content just blurs)
 *   - Prevent the user from closing the tab
 * 
 * The philosophy: protect the CONTENT, not lock the USER.
 */

import SECURITY_CONFIG from './config.js'

// ── State ──
let active = false
let cleanupFns = []
let devToolsInterval = null
let blurOverlay = null
let contentBlurred = false
let securityEvents = []
let eventCallbacks = []

// ── Public API ──

/**
 * Start secure mode content protection.
 * Call when entering the chat screen.
 */
export function startSecureMode() {
    const config = SECURITY_CONFIG.examMode
    if (!config || !config.enabled) {
        console.log('[SecureMode] Disabled by config')
        return
    }
    if (active) return

    console.log('[SecureMode] Initializing content protection...')
    active = true
    securityEvents = []

    // Create the blur overlay (hidden by default)
    createBlurOverlay()

    // 1. Screenshot prevention
    if (config.blockScreenshots) {
        initScreenshotProtection()
    }

    // 2. Content blur on tab switch / window blur
    if (config.blockTabSwitch) {
        initContentBlurOnSwitch()
    }

    // 3. Copy/paste blocking on messages
    if (config.blockCopyPaste) {
        initClipboardProtection()
    }

    // 4. Right-click on messages
    if (config.blockRightClick) {
        initContextMenuProtection()
    }

    // 5. Print blocking
    if (config.blockPrint) {
        initPrintProtection()
    }

    // 6. DevTools detection
    if (config.blockDevTools) {
        initDevToolsProtection()
    }

    // 7. Dangerous keyboard shortcuts
    if (config.blockKeyboardShortcuts) {
        initKeyboardProtection()
    }

    // 8. Text selection on messages
    injectMessageProtectionCSS()

    // 9. Print block CSS
    injectPrintBlockCSS()

    // 10. Warn before leaving
    initUnloadWarning()

    logEvent('SECURE_MODE_START', 'Content protection activated')
    console.log('[SecureMode] All content protections active')
}

/**
 * Stop secure mode and clean up all listeners.
 */
export function stopSecureMode() {
    if (!active) return

    cleanupFns.forEach(fn => fn())
    cleanupFns = []

    if (devToolsInterval) {
        clearInterval(devToolsInterval)
        devToolsInterval = null
    }

    removeBlurOverlay()

    // Remove injected styles
    document.getElementById('adyx-secure-noselect')?.remove()
    document.getElementById('adyx-secure-noprint')?.remove()

    active = false
    securityEvents = []
    eventCallbacks = []
    console.log('[SecureMode] Content protection released')
}

/**
 * Get security event log.
 */
export function getSecurityEvents() {
    return [...securityEvents]
}

/**
 * Register a callback for security events.
 * @param {Function} cb - Called with { type, message, timestamp }
 * @returns {Function} Unsubscribe function
 */
export function onSecurityEvent(cb) {
    eventCallbacks.push(cb)
    return () => {
        eventCallbacks = eventCallbacks.filter(fn => fn !== cb)
    }
}

/**
 * Check if secure mode is active.
 */
export function isSecureModeActive() {
    return active
}

/**
 * Manually request fullscreen (optional for user).
 */
export function requestFullscreen() {
    const el = document.documentElement
    const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen
    if (request) {
        return request.call(el).then(() => true).catch(() => false)
    }
    return Promise.resolve(false)
}

/**
 * Check if currently in fullscreen.
 */
export function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement)
}


// ── Internal: Event Logging ──

function logEvent(type, message) {
    const event = { type, message, timestamp: new Date().toISOString() }
    securityEvents.push(event)
    if (securityEvents.length > 100) securityEvents = securityEvents.slice(-100)

    eventCallbacks.forEach(cb => {
        try { cb(event) } catch (e) { /* ignore */ }
    })

    console.log(`[SecureMode] ${type}: ${message}`)
}


// ── Internal: Blur Overlay ──

function createBlurOverlay() {
    if (blurOverlay) return

    blurOverlay = document.createElement('div')
    blurOverlay.id = 'adyx-secure-blur'
    blurOverlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.97);
        backdrop-filter: blur(30px);
        display: none;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 20px;
        z-index: 99999;
        cursor: pointer;
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        transition: opacity 0.2s ease;
    `
    blurOverlay.innerHTML = `
        <div style="font-size: 40px; opacity: 0.5;">LOCKED</div>
        <div style="color: #ffffff; font-size: 14px; letter-spacing: 0.25em; text-transform: uppercase; font-weight: 600;">
            CONTENT PROTECTED
        </div>
        <div id="adyx-blur-reason" style="color: #666; font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;"></div>
        <div style="color: #333; font-size: 9px; letter-spacing: 0.1em; margin-top: 20px;">
            RETURN TO THIS TAB TO CONTINUE • ALL MESSAGES ARE ENCRYPTED
        </div>
    `
    blurOverlay.addEventListener('click', () => {
        if (!document.hidden) hideBlur()
    })
    document.body.appendChild(blurOverlay)
}

function showBlur(reason = '') {
    if (blurOverlay && !contentBlurred) {
        contentBlurred = true
        const reasonEl = blurOverlay.querySelector('#adyx-blur-reason')
        if (reasonEl) reasonEl.textContent = reason
        blurOverlay.style.display = 'flex'
    }
}

function hideBlur() {
    if (blurOverlay && contentBlurred) {
        contentBlurred = false
        blurOverlay.style.display = 'none'
    }
}

function removeBlurOverlay() {
    if (blurOverlay) {
        blurOverlay.remove()
        blurOverlay = null
    }
    contentBlurred = false
}


// ── Internal: Screenshot Protection ──

function initScreenshotProtection() {
    const handler = (e) => {
        // PrintScreen
        if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
            e.preventDefault()
            e.stopImmediatePropagation()
            // Clear clipboard best-effort
            try { navigator.clipboard.writeText('').catch(() => { }) } catch (_) { }
            // Briefly blur content
            showBlur('Screenshot attempt blocked')
            setTimeout(() => { if (document.hasFocus()) hideBlur() }, 1500)
            logEvent('SCREENSHOT_BLOCKED', 'PrintScreen key intercepted')
            return false
        }

        // Win+Shift+S (Snipping Tool)
        if (e.shiftKey && (e.metaKey || e.key === 'Meta') && (e.key === 's' || e.key === 'S')) {
            e.preventDefault()
            e.stopImmediatePropagation()
            showBlur('Screen capture blocked')
            setTimeout(() => { if (document.hasFocus()) hideBlur() }, 1500)
            logEvent('SCREENSHOT_BLOCKED', 'Win+Shift+S intercepted')
            return false
        }

        // macOS Cmd+Shift+3/4/5
        if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
            e.preventDefault()
            e.stopImmediatePropagation()
            showBlur('Screen capture blocked')
            setTimeout(() => { if (document.hasFocus()) hideBlur() }, 1500)
            logEvent('SCREENSHOT_BLOCKED', 'macOS screenshot shortcut intercepted')
            return false
        }
    }

    // Also clear clipboard on PrintScreen keyup
    const keyupHandler = (e) => {
        if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
            e.preventDefault()
            try { navigator.clipboard.writeText('').catch(() => { }) } catch (_) { }
        }
    }

    document.addEventListener('keydown', handler, true)
    document.addEventListener('keyup', keyupHandler, true)
    cleanupFns.push(() => {
        document.removeEventListener('keydown', handler, true)
        document.removeEventListener('keyup', keyupHandler, true)
    })
}


// ── Internal: Content Blur on Tab Switch / Window Blur ──

function initContentBlurOnSwitch() {
    // Visibility API — tab switch
    const visHandler = () => {
        if (document.hidden) {
            showBlur('Tab hidden — messages protected')
            logEvent('TAB_HIDDEN', 'Content blurred — tab not visible')
        } else {
            hideBlur()
        }
    }
    document.addEventListener('visibilitychange', visHandler)
    cleanupFns.push(() => document.removeEventListener('visibilitychange', visHandler))

    // Window blur — user clicked outside (Alt+Tab, etc.)
    const blurHandler = () => {
        showBlur('Window not focused — messages hidden')
        logEvent('WINDOW_BLUR', 'Content blurred — window lost focus')
    }
    const focusHandler = () => {
        hideBlur()
    }
    window.addEventListener('blur', blurHandler)
    window.addEventListener('focus', focusHandler)
    cleanupFns.push(() => {
        window.removeEventListener('blur', blurHandler)
        window.removeEventListener('focus', focusHandler)
    })
}


// ── Internal: Clipboard Protection ──

function initClipboardProtection() {
    // Keyboard shortcuts
    const keyHandler = (e) => {
        const key = e.key?.toLowerCase()
        if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a'].includes(key)) {
            // Allow in input/textarea for normal typing
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return
            }
            e.preventDefault()
            e.stopImmediatePropagation()
            logEvent('CLIPBOARD_BLOCKED', `${e.ctrlKey ? 'Ctrl' : 'Cmd'}+${e.key.toUpperCase()} on message content`)
            return false
        }
    }
    document.addEventListener('keydown', keyHandler, true)
    cleanupFns.push(() => document.removeEventListener('keydown', keyHandler, true))

    // Clipboard events
    const clipHandler = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
        e.preventDefault()
        e.stopImmediatePropagation()
    }
        ;['copy', 'cut'].forEach(evt => {
            document.addEventListener(evt, clipHandler, true)
            cleanupFns.push(() => document.removeEventListener(evt, clipHandler, true))
        })
}


// ── Internal: Context Menu Protection ──

function initContextMenuProtection() {
    const handler = (e) => {
        // Block on the whole page in secure mode
        e.preventDefault()
        e.stopImmediatePropagation()
        logEvent('RIGHT_CLICK_BLOCKED', 'Context menu prevented')
        return false
    }
    document.addEventListener('contextmenu', handler, true)
    cleanupFns.push(() => document.removeEventListener('contextmenu', handler, true))
}


// ── Internal: Print Protection ──

function initPrintProtection() {
    const handler = (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'p') {
            e.preventDefault()
            e.stopImmediatePropagation()
            logEvent('PRINT_BLOCKED', 'Print attempt prevented')
            return false
        }
    }
    document.addEventListener('keydown', handler, true)
    cleanupFns.push(() => document.removeEventListener('keydown', handler, true))
}


// ── Internal: DevTools Protection ──

function initDevToolsProtection() {
    // Keyboard shortcuts for DevTools
    const keyHandler = (e) => {
        // F12
        if (e.key === 'F12' || e.keyCode === 123) {
            e.preventDefault()
            e.stopImmediatePropagation()
            logEvent('DEVTOOLS_BLOCKED', 'F12 prevented')
            return false
        }
        // Ctrl+Shift+I/J/C
        if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            const key = e.key?.toLowerCase()
            if (['i', 'j', 'c'].includes(key)) {
                e.preventDefault()
                e.stopImmediatePropagation()
                logEvent('DEVTOOLS_BLOCKED', `Ctrl+Shift+${e.key.toUpperCase()} prevented`)
                return false
            }
        }
        // Ctrl+U (view source)
        if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'u') {
            e.preventDefault()
            e.stopImmediatePropagation()
            logEvent('DEVTOOLS_BLOCKED', 'View source prevented')
            return false
        }
    }
    document.addEventListener('keydown', keyHandler, true)
    cleanupFns.push(() => document.removeEventListener('keydown', keyHandler, true))

    // Window size-based detection
    let devToolsOpen = false
    devToolsInterval = setInterval(() => {
        const widthDelta = window.outerWidth - window.innerWidth > 160
        const heightDelta = window.outerHeight - window.innerHeight > 160
        const isOpen = widthDelta || heightDelta

        if (isOpen && !devToolsOpen) {
            devToolsOpen = true
            showBlur('Developer tools detected — content hidden')
            logEvent('DEVTOOLS_DETECTED', 'DevTools open — content blurred')
        } else if (!isOpen && devToolsOpen) {
            devToolsOpen = false
            if (!document.hidden) hideBlur()
        }
    }, 1000)

    cleanupFns.push(() => {
        clearInterval(devToolsInterval)
        devToolsInterval = null
    })
}


// ── Internal: Keyboard Shortcut Protection ──

function initKeyboardProtection() {
    const handler = (e) => {
        // Ctrl+S (save page source)
        if ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 's') {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault()
                e.stopImmediatePropagation()
                return false
            }
        }

        // F5 / Ctrl+R (prevent accidental data loss)
        if (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key?.toLowerCase() === 'r')) {
            e.preventDefault()
            e.stopImmediatePropagation()
            return false
        }
    }
    document.addEventListener('keydown', handler, true)
    cleanupFns.push(() => document.removeEventListener('keydown', handler, true))
}


// ── Internal: Unload Warning ──

function initUnloadWarning() {
    const handler = (e) => {
        if (active) {
            e.preventDefault()
            e.returnValue = 'You are in a secure session. Leaving will destroy all messages. Are you sure?'
            return e.returnValue
        }
    }
    window.addEventListener('beforeunload', handler)
    cleanupFns.push(() => window.removeEventListener('beforeunload', handler))
}


// ── Internal: CSS Injection ──

function injectMessageProtectionCSS() {
    if (document.getElementById('adyx-secure-noselect')) return
    const style = document.createElement('style')
    style.id = 'adyx-secure-noselect'
    style.textContent = `
        /* Disable text selection on messages */
        .chat__messages, .msg__bubble, .msg__time, .msg__delivery,
        .chat__sidebar-content, .chat__sidebar-log {
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
        }
        /* Allow selection in input */
        .chat__input, input, textarea {
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            user-select: text !important;
        }
        /* Disable drag on all elements in chat */
        .chat img, .chat a, .msg img {
            -webkit-user-drag: none !important;
            user-drag: none !important;
        }
    `
    document.head.appendChild(style)
    cleanupFns.push(() => style.remove())
}

function injectPrintBlockCSS() {
    if (document.getElementById('adyx-secure-noprint')) return
    const style = document.createElement('style')
    style.id = 'adyx-secure-noprint'
    style.textContent = `
        @media print {
            html, body, body * {
                display: none !important;
                visibility: hidden !important;
            }
            body::after {
                content: 'CLASSIFIED — PRINTING DISABLED';
                display: block !important;
                visibility: visible !important;
                font-size: 24px;
                text-align: center;
                padding: 100px;
                color: #ff0000;
                font-family: monospace;
            }
        }
    `
    document.head.appendChild(style)
    cleanupFns.push(() => style.remove())
}
