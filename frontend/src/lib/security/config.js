/**
 * ADYX Security Configuration — Feature Flags
 * 
 * All security features are toggleable via this central config.
 * Import and modify before calling initializeSecurity() to customize behavior.
 */

const SECURITY_CONFIG = {
    // ── Phase 1: Cryptographic Layer ──
    encryption: {
        enabled: true,
        algorithm: 'AES-GCM',
        keyLength: 256,
        curveType: 'P-384',           // Upgrade from P-256
        signMessages: true,            // Ed25519 / ECDSA signatures
        doubleRatchet: true,           // Perfect Forward Secrecy
        ratchetOnEveryMessage: false,  // DH ratchet on direction change only
    },

    // ── Phase 2: Zero-Knowledge ──
    zeroKnowledge: {
        enabled: true,
        metadataMinimization: true,
        serverSideRateLimit: true,
    },

    // ── Phase 3: Transport Security ──
    transport: {
        enforceWSS: false,             // Set true in production
        enforceHSTS: false,            // Set true in production
    },

    // ── Phase 4: Anti-Exfiltration ──
    antiExfiltration: {
        enabled: true,
        disableTextSelection: true,
        disableRightClick: true,
        disableCopyShortcuts: true,
        blurOnTabSwitch: true,
        blurOnDevTools: true,
        autoLockOnBlur: false,         // Can be aggressive — off by default
        autoLockDelayMs: 30000,        // 30s after blur
    },

    // ── Phase 4: Watermark ──
    watermark: {
        enabled: true,
        opacity: 0.03,
        updateIntervalMs: 30000,       // Refresh every 30s
        showSessionId: true,
        showTimestamp: true,
        showDeviceHash: true,
        animationEnabled: true,
    },

    // ── Phase 5: Device & Session Security ──
    deviceSecurity: {
        enabled: true,
        fingerprintBinding: true,
        inactivityTimeoutMs: 5 * 60 * 1000,   // 5 min
        keyRotationIntervalMs: 10 * 60 * 1000, // 10 min
    },

    // ── Phase 6: Metadata Protection ──
    metadataProtection: {
        enabled: true,
        uniformPacketSize: true,
        packetSizeBlock: 256,          // Pad to nearest 256 bytes
        randomDelayEnabled: false,     // Off by default (adds latency)
        maxDelayMs: 500,
        encryptRoomIds: true,
    },

    // ── Phase 7: Threat Detection ──
    threatDetection: {
        enabled: true,
        maxFailedAttempts: 5,
        anomalyWindow: 60000,          // 1 min window
        autoDestroyOnThreat: true,
    },

    // ── Phase 8: Anonymity Mode ──
    anonymity: {
        enabled: false,                // Opt-in
        ephemeralIdentity: true,
        torCompatible: false,
    },

    // ── Phase 9: Post-Quantum ──
    postQuantum: {
        enabled: false,                // Future use
        provider: 'classic',          // 'classic' | 'hybrid'
    },

    // ── Phase 10: Exam Mode (TCS-level Lockdown) ──
    examMode: {
        enabled: true,
        enforceFullscreen: true,       // Force fullscreen during chat
        blockScreenshots: true,        // Block PrintScreen, Win+Shift+S, etc.
        blockTabSwitch: true,          // Detect tab switch / Alt+Tab
        blockCopyPaste: true,          // Block Ctrl+C/V/X/A outside inputs
        blockRightClick: true,         // Disable context menu globally
        blockPrint: true,              // Block Ctrl+P and @media print
        blockDevTools: true,           // Block F12, Ctrl+Shift+I/J/C
        blockKeyboardShortcuts: true,  // Block Ctrl+W/T/N/L/S, F5, F11, Alt+F4
        maxViolations: 5,             // Force-end session after this many violations
        violationWarningDurationMs: 3000, // How long violation warning shows
    },

    // ── Phase 11: Secure Media & File Sharing ──
    secureMedia: {
        enabled: true,
        maxFileSizeMB: 50,                          // Max file size in MB
        allowedTypes: {
            documents: true,
            images: true,
            video: true,
            audio: true,
            archives: true,
        },
        ephemeralMedia: true,                        // Enable ephemeral modes
        viewOnce: true,                              // Allow view-once media
        selfDestructTimers: [5, 10, 30, 60],         // Available timers (seconds)
        metadataStripping: true,                     // Auto-strip EXIF from images
        integrityVerification: true,                 // SHA-256 hash verification
        secureViewer: true,                          // Protected viewer with watermark
        encryptedThumbnails: true,                   // Generate encrypted previews
        fileVault: false,                            // In-room file vault (optional)
        expiringDownloads: false,                    // Time-limited download links (optional)
    },
}

/**
 * Deep-merge user overrides into SECURITY_CONFIG.
 * Call before initializeSecurity().
 */
export function configureSecurity(overrides) {
    deepMerge(SECURITY_CONFIG, overrides)
}

function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            if (!target[key]) target[key] = {}
            deepMerge(target[key], source[key])
        } else {
            target[key] = source[key]
        }
    }
}

export default SECURITY_CONFIG
