/**
 * ADYX SecurityMonitor — React UI Component
 * 
 * Displays security status and threat information in the chat sidebar.
 * Shows:
 *   - Current threat level (green/yellow/red)
 *   - Security feature status
 *   - Recent security events
 *   - Crypto protocol info
 * 
 * Usage: <SecurityMonitorPanel />
 */

import { useState, useEffect } from 'react'
import { securityMonitor } from '../lib/security/securityMonitor.js'
import { getSecurityStatus } from '../lib/security/secureMessaging.js'
import SECURITY_CONFIG from '../lib/security/config.js'

export default function SecurityMonitorPanel() {
    const [threatLevel, setThreatLevel] = useState('green')
    const [events, setEvents] = useState([])
    const [secStatus, setSecStatus] = useState({})

    useEffect(() => {
        // Subscribe to security events
        const offThreat = securityMonitor.on('threat', (data) => {
            setThreatLevel(data.level)
        })

        const offEvent = securityMonitor.on('event', () => {
            setEvents(securityMonitor.getEvents().slice(-10))
        })

        // Update status periodically
        const interval = setInterval(() => {
            setSecStatus(getSecurityStatus())
            setThreatLevel(securityMonitor.getThreatLevel())
        }, 5000)

        // Initial state
        setSecStatus(getSecurityStatus())
        setEvents(securityMonitor.getEvents().slice(-10))

        return () => {
            offThreat()
            offEvent()
            clearInterval(interval)
        }
    }, [])

    const threatColors = {
        green: '#00ff88',
        yellow: '#ffaa00',
        red: '#ff4444',
    }

    return (
        <div style={{
            fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
            fontSize: '9px',
            color: '#666',
            lineHeight: '1.6',
        }}>
            {/* Threat Level */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '8px',
                padding: '4px 8px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '3px',
                border: `1px solid ${threatColors[threatLevel]}20`,
            }}>
                <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: threatColors[threatLevel],
                    display: 'inline-block',
                    boxShadow: `0 0 6px ${threatColors[threatLevel]}`,
                }} />
                <span style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                    THREAT: {threatLevel}
                </span>
            </div>

            {/* Security Features */}
            <div style={{ marginBottom: '8px' }}>
                <div style={{ color: '#555', letterSpacing: '0.1em', marginBottom: '4px' }}>FEATURES</div>
                <StatusRow label="E2E Encryption" active={secStatus.enabled} />
                <StatusRow label="Double Ratchet" active={secStatus.doubleRatchet} />
                <StatusRow label="Signatures" active={secStatus.signatures} />
                <StatusRow label="PFS" active={secStatus.pfs} />
                <StatusRow label="Anti-Exfil" active={SECURITY_CONFIG.antiExfiltration.enabled} />
                <StatusRow label="Watermark" active={SECURITY_CONFIG.watermark.enabled} />
                <StatusRow label="Fingerprint" active={SECURITY_CONFIG.deviceSecurity.fingerprintBinding} />
                <StatusRow label="Monitor" active={SECURITY_CONFIG.threatDetection.enabled} />
            </div>

            {/* Protocol */}
            {secStatus.protocol && (
                <div style={{ color: '#444', fontSize: '8px', marginBottom: '8px' }}>
                    {secStatus.protocol}
                </div>
            )}

            {/* Recent Events */}
            {events.length > 0 && (
                <div>
                    <div style={{ color: '#555', letterSpacing: '0.1em', marginBottom: '4px' }}>EVENTS</div>
                    {events.map((event, i) => (
                        <div key={i} style={{
                            fontSize: '8px',
                            color: event.type === 'THREAT' ? '#ff4444' : '#444',
                            marginBottom: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            [{event.timestamp?.slice(11, 19)}] {event.type}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function StatusRow({ label, active }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1px 0',
        }}>
            <span style={{ color: '#555' }}>{label}</span>
            <span style={{
                color: active ? '#00ff88' : '#333',
                fontSize: '8px',
            }}>
                {active ? '[ON]' : '[OFF]'}
            </span>
        </div>
    )
}
