/**
 * ADYX Security Module — Unified Entry Point
 * 
 * Re-exports all security modules and provides:
 *   - initializeSecurity(config) — bootstrap all enabled features
 *   - teardownSecurity() — clean shutdown of all modules
 * 
 * Integration with existing ws.js and crypto.js without modifying them.
 * 
 * Usage:
 *   import { initializeSecurity, teardownSecurity } from './security/index.js'
 *   await initializeSecurity()  // Call once at app start
 *   teardownSecurity()          // Call on app unmount
 */

// ── Configuration ──
export { default as SECURITY_CONFIG, configureSecurity } from './config.js'

// ── Phase 1: Cryptographic Layer ──
export * as cryptoEngine from './cryptoEngine.js'
export { DoubleRatchet } from './doubleRatchet.js'
export {
    initSecureSession,
    processKeyExchange,
    encryptMessage,
    decryptMessage,
    isSecureReady,
    getSecurityStatus,
    destroySecureSession
} from './secureMessaging.js'

// ── Phase 4: Anti-Exfiltration ──
export { initAntiExfiltration, destroyAntiExfiltration } from './antiExfiltration.js'
export { initWatermark, destroyWatermark } from './dynamicWatermark.js'
export { performSecureWipe, secureOverwrite } from './secureWipe.js'

// ── Phase 5: Device & Session Security ──
export { generateFingerprint, verifyFingerprint, getShortFingerprint } from './deviceFingerprint.js'
export {
    initSessionGuard,
    destroySessionGuard,
    unlockSession,
    lockSession,
    getSessionState
} from './sessionGuard.js'

// ── Phase 6: Traffic Analysis Resistance ──
export { padPayload, unpadPayload, randomDelay, generateDecoyMessage } from './trafficAnalysis.js'

// ── Phase 7: Security Monitor ──
export { securityMonitor } from './securityMonitor.js'

// ── Phase 8: Anonymity Mode ──
export {
    generateEphemeralIdentity,
    getCurrentIdentity,
    destroyIdentity,
    isAnonymityActive,
    isTorConnection
} from './anonymityMode.js'

// ── Phase 9: Post-Quantum ──
export { getCryptoProvider, ClassicProvider, HybridProvider } from './hybridCrypto.js'

// ── Phase 11: Secure Media & File Sharing ──
export { validateFile, getFileCategory, getAcceptString, formatFileSize } from './fileValidator.js'
export {
    generateFileKey, encryptFile, decryptFile,
    exportFileKey, importFileKey,
    hashFile, verifyFileIntegrity,
    encryptMetadata, decryptMetadata,
    chunkData, reassembleChunks
} from './fileCrypto.js'
export { stripImageMetadata, canStripMetadata, generateThumbnail } from './metadataStripper.js'
export {
    createViewerProtections, destroyViewerProtections,
    enterFullscreen, exitFullscreen
} from './secureMediaViewer.js'
export {
    createEphemeralSession, markAsViewed, onViewerClosed,
    isExpired, isViewOnceConsumed, getEphemeralInfo,
    getRemainingSeconds, destroyEphemeralMedia, destroyAllEphemeral,
    SELF_DESTRUCT_TIMERS, formatTimer
} from './ephemeralMedia.js'
export {
    createSecureBuffer, destroySecureBuffer, destroyAllBuffers,
    getActiveBufferCount, preventCaching, registerWithSecureWipe
} from './fileMemorySecurity.js'

// ── Lifecycle ──

let initialized = false

/**
 * Initialize all enabled security features.
 * Call once when the application starts.
 * 
 * @param {object} configOverrides - Optional config overrides
 */
export async function initializeSecurity(configOverrides = {}) {
    if (initialized) {
        console.warn('[Security] Already initialized')
        return
    }

    const { configureSecurity } = await import('./config.js')
    if (Object.keys(configOverrides).length > 0) {
        configureSecurity(configOverrides)
    }

    const config = (await import('./config.js')).default

    console.log('[Security] ═══════════════════════════════════════')
    console.log('[Security]   ADYX Security Layer v1.0.0')
    console.log('[Security] ═══════════════════════════════════════')
    console.log('[Security] Encryption:      ', config.encryption.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] Double Ratchet:  ', config.encryption.doubleRatchet ? '[ON]' : '[OFF]')
    console.log('[Security] Signatures:      ', config.encryption.signMessages ? '[ON]' : '[OFF]')
    console.log('[Security] Anti-Exfiltration:', config.antiExfiltration.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] Watermark:       ', config.watermark.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] Device Binding:  ', config.deviceSecurity.fingerprintBinding ? '[ON]' : '[OFF]')
    console.log('[Security] Session Guard:   ', config.deviceSecurity.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] Traffic Padding: ', config.metadataProtection.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] Threat Monitor:  ', config.threatDetection.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] Anonymity Mode:  ', config.anonymity.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] Post-Quantum:    ', config.postQuantum.enabled ? '[ON]' : '[OFF]')
    console.log('[Security] ═══════════════════════════════════════')

    // Generate device fingerprint
    if (config.deviceSecurity.fingerprintBinding) {
        const { generateFingerprint } = await import('./deviceFingerprint.js')
        const fp = await generateFingerprint()
        console.log('[Security] Device fingerprint:', fp.slice(0, 16) + '...')
    }

    // Start security monitor
    if (config.threatDetection.enabled) {
        const { securityMonitor } = await import('./securityMonitor.js')
        securityMonitor.start()
    }

    initialized = true
    console.log('[Security] All security layers initialized')
}

/**
 * Tear down all security features — clean shutdown.
 * Call when the application unmounts.
 */
export async function teardownSecurity() {
    if (!initialized) return

    console.log('[Security] Tearing down security layers...')

    // Destroy session guard
    const { destroySessionGuard } = await import('./sessionGuard.js')
    destroySessionGuard()

    // Destroy anti-exfiltration
    const { destroyAntiExfiltration } = await import('./antiExfiltration.js')
    destroyAntiExfiltration()

    // Destroy watermark
    const { destroyWatermark } = await import('./dynamicWatermark.js')
    destroyWatermark()

    // Stop security monitor
    const { securityMonitor } = await import('./securityMonitor.js')
    securityMonitor.destroy()

    // Destroy secure messaging
    const { destroySecureSession } = await import('./secureMessaging.js')
    destroySecureSession()

    // Destroy anonymity
    const { destroyIdentity } = await import('./anonymityMode.js')
    destroyIdentity()

    // Perform secure wipe
    const { performSecureWipe } = await import('./secureWipe.js')
    performSecureWipe()

    initialized = false
    console.log('[Security] All security layers torn down')
}

/**
 * Check if security is initialized.
 */
export function isSecurityInitialized() {
    return initialized
}
