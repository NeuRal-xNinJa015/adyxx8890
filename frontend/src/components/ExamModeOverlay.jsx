/**
 * ADYX SecureModeOverlay — React Component
 * 
 * Wraps the ChatScreen with content protection:
 *   - Activates secure mode on mount (screenshots, clipboard, tab-blur)
 *   - Optional fullscreen toggle (not forced)
 *   - Security event notifications
 *   - Status badge showing protection is active
 * 
 * Does NOT force fullscreen or terminate sessions — this is messaging, not an exam.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, AlertTriangle, Maximize, Minimize } from 'lucide-react'
import SECURITY_CONFIG from '../lib/security/config.js'
import {
    startSecureMode,
    stopSecureMode,
    onSecurityEvent,
    requestFullscreen,
    isFullscreen,
} from '../lib/security/examMode.js'

export default function ExamModeOverlay({ children, onForceEnd }) {
    const config = SECURITY_CONFIG.examMode
    const [isActive, setIsActive] = useState(false)
    const [notification, setNotification] = useState(null)
    const [isFs, setIsFs] = useState(false)
    const notifTimerRef = useRef(null)
    const startedRef = useRef(false)

    // Start secure mode on mount
    useEffect(() => {
        if (!config?.enabled) return

        if (!startedRef.current) {
            startedRef.current = true
            startSecureMode()
            setIsActive(true)
        }

        return () => {
            if (startedRef.current) {
                stopSecureMode()
                startedRef.current = false
                setIsActive(false)
            }
        }
    }, [config?.enabled])

    // Subscribe to security events and show brief notifications
    useEffect(() => {
        if (!config?.enabled) return

        const off = onSecurityEvent((event) => {
            // Only show notifications for blocked actions, not routine events
            if (event.type.includes('BLOCKED') || event.type.includes('DETECTED')) {
                setNotification(event)
                if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
                notifTimerRef.current = setTimeout(() => setNotification(null), 2500)
            }
        })

        return () => {
            off()
            if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
        }
    }, [config?.enabled])

    // Track fullscreen state
    useEffect(() => {
        const handler = () => setIsFs(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    // Toggle fullscreen
    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { })
        } else {
            requestFullscreen()
        }
    }, [])

    if (!config?.enabled) return children

    return (
        <>
            {children}

            {/* Brief security notification — slides in from top when something is blocked */}
            <AnimatePresence>
                {notification && (
                    <motion.div
                        className="secure-notif"
                        initial={{ y: -60, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -60, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    >
                        <AlertTriangle size={14} className="secure-notif__icon" />
                        <span className="secure-notif__text">{notification.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Secure mode badge + fullscreen toggle */}
            <div className="secure-badge">
                <span className="secure-badge__dot" />
                <span className="secure-badge__label">PROTECTED</span>
                <button
                    className="secure-badge__fs-btn"
                    onClick={toggleFullscreen}
                    title={isFs ? 'Exit fullscreen' : 'Enter fullscreen for maximum privacy'}
                >
                    {isFs ? <Minimize size={10} /> : <Maximize size={10} />}
                </button>
            </div>
        </>
    )
}
