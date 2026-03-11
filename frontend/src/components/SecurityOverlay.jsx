/**
 * ADYX SecurityOverlay — React Component
 * 
 * Integrates all client-side security visual features:
 *   - Anti-exfiltration controls
 *   - Dynamic watermark overlay
 *   - Blur overlay when tab is hidden or DevTools detected
 *   - Lock screen on inactivity timeout
 * 
 * Wraps the chat screen — does NOT modify ChatScreen.jsx.
 * Usage: <SecurityOverlay sessionId="..." deviceHash="..."> <ChatScreen /> </SecurityOverlay>
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import SECURITY_CONFIG from '../lib/security/config.js'
import { initAntiExfiltration, destroyAntiExfiltration } from '../lib/security/antiExfiltration.js'
import { initWatermark, destroyWatermark } from '../lib/security/dynamicWatermark.js'
import { initSessionGuard, destroySessionGuard, unlockSession, getSessionState } from '../lib/security/sessionGuard.js'
import { securityMonitor } from '../lib/security/securityMonitor.js'

export default function SecurityOverlay({ children, sessionId, deviceHash, onSessionExpired, onKeyRotation }) {
    const [sessionState, setSessionState] = useState('active')
    const [threatLevel, setThreatLevel] = useState('green')
    const [showLockScreen, setShowLockScreen] = useState(false)
    const lockClickRef = useRef(null)

    // Initialize security features
    useEffect(() => {
        // Anti-exfiltration
        if (SECURITY_CONFIG.antiExfiltration.enabled) {
            initAntiExfiltration()
        }

        // Watermark
        if (SECURITY_CONFIG.watermark.enabled) {
            initWatermark(sessionId, deviceHash)
        }

        // Session guard
        if (SECURITY_CONFIG.deviceSecurity.enabled) {
            initSessionGuard({
                onStateChange: (newState, oldState) => {
                    setSessionState(newState)
                    if (newState === 'locked') {
                        setShowLockScreen(true)
                    } else if (newState === 'active') {
                        setShowLockScreen(false)
                    } else if (newState === 'expired') {
                        if (onSessionExpired) onSessionExpired()
                    }
                },
                onKeyRotation: () => {
                    if (onKeyRotation) onKeyRotation()
                }
            })
        }

        // Security monitor
        if (SECURITY_CONFIG.threatDetection.enabled) {
            securityMonitor.start()
            const offThreat = securityMonitor.on('threat', (data) => {
                setThreatLevel(data.level)
                if (data.action === 'destroy' && onSessionExpired) {
                    onSessionExpired()
                }
            })
        }

        return () => {
            destroyAntiExfiltration()
            destroyWatermark()
            destroySessionGuard()
            securityMonitor.stop()
        }
    }, [sessionId, deviceHash, onSessionExpired, onKeyRotation])

    const handleUnlock = useCallback(() => {
        unlockSession()
        setShowLockScreen(false)
    }, [])

    return (
        <>
            {children}

            {/* Lock Screen */}
            {showLockScreen && (
                <div
                    onClick={handleUnlock}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.97)',
                        backdropFilter: 'blur(30px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        gap: '20px',
                        zIndex: 99998,
                        cursor: 'pointer',
                        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                    }}
                >
                    <div style={{
                        fontSize: '48px',
                        opacity: 0.5,
                        animation: 'pulse 2s infinite',
                    }}>
                        LOCKED
                    </div>
                    <div style={{
                        color: '#ff4444',
                        fontSize: '13px',
                        letterSpacing: '0.25em',
                        textTransform: 'uppercase',
                    }}>
                        SESSION LOCKED
                    </div>
                    <div style={{
                        color: '#444',
                        fontSize: '10px',
                        letterSpacing: '0.15em',
                    }}>
                        CLICK ANYWHERE TO UNLOCK
                    </div>
                    <div style={{
                        color: '#333',
                        fontSize: '9px',
                        letterSpacing: '0.1em',
                        marginTop: '20px',
                    }}>
                        Locked due to inactivity • All messages are protected
                    </div>
                </div>
            )}

            {/* Threat Level Indicator */}
            {SECURITY_CONFIG.threatDetection.enabled && threatLevel !== 'green' && (
                <div style={{
                    position: 'fixed',
                    top: '8px',
                    right: '8px',
                    padding: '4px 12px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontFamily: "'JetBrains Mono', monospace",
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    zIndex: 99997,
                    pointerEvents: 'none',
                    background: threatLevel === 'red' ? 'rgba(255,0,0,0.15)' : 'rgba(255,170,0,0.15)',
                    color: threatLevel === 'red' ? '#ff4444' : '#ffaa00',
                    border: `1px solid ${threatLevel === 'red' ? 'rgba(255,0,0,0.3)' : 'rgba(255,170,0,0.3)'}`,
                }}>
                    THREAT: {threatLevel.toUpperCase()}
                </div>
            )}

            {/* Security Status Badge */}
            {SECURITY_CONFIG.threatDetection.enabled && (
                <div
                    id="adyx-security-monitor"
                    style={{
                        position: 'fixed',
                        bottom: '8px',
                        left: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 10px',
                        borderRadius: '3px',
                        fontSize: '8px',
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        zIndex: 99997,
                        pointerEvents: 'none',
                        background: 'rgba(0,0,0,0.7)',
                        color: '#444',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <span style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: threatLevel === 'green' ? '#00ff88' : threatLevel === 'yellow' ? '#ffaa00' : '#ff4444',
                        display: 'inline-block',
                    }} />
                    SEC.MONITOR • {sessionState.toUpperCase()}
                </div>
            )}
        </>
    )
}
