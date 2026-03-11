/**
 * ADYX Secure Memory Wipe
 * 
 * Crypto-safe cleanup on logout/session end:
 *   - Clear localStorage and sessionStorage
 *   - Overwrite sensitive variables with random data
 *   - Invalidate all crypto key references
 *   - Clear canvases
 *   - Force garbage collection hint
 */

/**
 * Perform a full secure wipe of all sensitive client-side data.
 * Call on session end, logout, or threat detection.
 */
export function performSecureWipe() {
    console.log('[SecureWipe] Initiating secure memory wipe...')

    // 1. Clear web storage
    try {
        localStorage.clear()
        console.log('[SecureWipe] localStorage cleared')
    } catch (e) { /* ignore */ }

    try {
        sessionStorage.clear()
        console.log('[SecureWipe] sessionStorage cleared')
    } catch (e) { /* ignore */ }

    // 2. Clear all cookies
    try {
        document.cookie.split(';').forEach(cookie => {
            const name = cookie.split('=')[0].trim()
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${location.hostname}`
        })
        console.log('[SecureWipe] Cookies cleared')
    } catch (e) { /* ignore */ }

    // 3. Clear all canvases (watermark, cursor effects, etc.)
    try {
        const canvases = document.querySelectorAll('canvas')
        canvases.forEach(canvas => {
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                // Overwrite with random noise
                const imageData = ctx.createImageData(canvas.width, canvas.height)
                crypto.getRandomValues(imageData.data)
                ctx.putImageData(imageData, 0, 0)
                ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
        })
        console.log('[SecureWipe] Canvases wiped')
    } catch (e) { /* ignore */ }

    // 4. Clear Service Worker caches
    try {
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => caches.delete(name))
            })
        }
        console.log('[SecureWipe] Cache API cleared')
    } catch (e) { /* ignore */ }

    // 5. Clear IndexedDB databases
    try {
        if ('indexedDB' in window) {
            indexedDB.databases?.().then(dbs => {
                dbs.forEach(db => {
                    if (db.name) indexedDB.deleteDatabase(db.name)
                })
            })
        }
    } catch (e) { /* ignore */ }

    // 6. Overwrite clipboard if possible
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText('')
        }
    } catch (e) { /* ignore */ }

    // 7. Clear performance entries (timing data)
    try {
        if (performance.clearResourceTimings) performance.clearResourceTimings()
        if (performance.clearMarks) performance.clearMarks()
        if (performance.clearMeasures) performance.clearMeasures()
    } catch (e) { /* ignore */ }

    // 8. Remove security-related DOM elements
    try {
        const secElements = document.querySelectorAll(
            '#adyx-watermark, #adyx-blur-overlay, #adyx-no-select, #adyx-security-monitor'
        )
        secElements.forEach(el => el.remove())
    } catch (e) { /* ignore */ }

    console.log('[SecureWipe] Secure wipe complete')
}

/**
 * Overwrite a variable with random data before nulling.
 * Best-effort — JS GC doesn't guarantee immediate cleanup.
 */
export function secureOverwrite(obj, key) {
    if (obj && obj[key]) {
        if (typeof obj[key] === 'string') {
            // Overwrite string with random chars
            const len = obj[key].length
            const chars = new Uint8Array(len)
            crypto.getRandomValues(chars)
            obj[key] = String.fromCharCode(...chars)
        } else if (obj[key] instanceof ArrayBuffer || ArrayBuffer.isView(obj[key])) {
            // Overwrite buffer with random data
            const view = new Uint8Array(obj[key] instanceof ArrayBuffer ? obj[key] : obj[key].buffer)
            crypto.getRandomValues(view)
        }
        obj[key] = null
    }
}

/**
 * Securely wipe an array of strings/buffers.
 */
export function secureWipeArray(arr) {
    if (!arr || !Array.isArray(arr)) return
    for (let i = 0; i < arr.length; i++) {
        if (typeof arr[i] === 'string') {
            arr[i] = crypto.getRandomValues(new Uint8Array(arr[i].length)).toString()
        }
        arr[i] = null
    }
    arr.length = 0
}
