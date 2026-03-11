import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Shield, Eye, Timer, Maximize2, Minimize2, Music, FileText } from 'lucide-react'
import {
    createViewerProtections, destroyViewerProtections,
    enterFullscreen, exitFullscreen
} from '../lib/security/secureMediaViewer.js'
import {
    markAsViewed, onViewerClosed, getRemainingSeconds,
    isExpired, getEphemeralInfo, formatTimer
} from '../lib/security/ephemeralMedia.js'
import { destroySecureBuffer } from '../lib/security/fileMemorySecurity.js'
import ImagePreviewer from './ImagePreviewer.jsx'
import VideoPreviewer from './VideoPreviewer.jsx'
import AudioPreviewer from './AudioPreviewer.jsx'
import DocumentPreviewer from './DocumentPreviewer.jsx'

/**
 * SecureMediaViewer — Protected fullscreen modal for viewing encrypted media.
 *
 * Features:
 *   - Fullscreen viewing
 *   - Dynamic watermark overlay
 *   - Blur on tab switch / focus loss
 *   - Disable right-click, copy, drag, save, print
 *   - View-once auto-close
 *   - Self-destruct timer countdown
 *   - Secure cleanup on close
 */
export default function SecureMediaViewer({
    isOpen,
    onClose,
    fileUrl,           // Blob URL of decrypted file
    fileType,          // 'image', 'video', 'audio', 'document'
    fileName,          // Original file name
    fileId,            // Unique file identifier
    bufferId,          // Secure buffer ID for cleanup
    sessionId = '',
    deviceHash = '',
    ephemeralMode = 'normal',  // 'normal', 'view_once', 'timed'
}) {
    const containerRef = useRef(null)
    const cleanupRef = useRef(null)
    const timerRef = useRef(null)
    const [countdown, setCountdown] = useState(null)
    const [isFullscreen, setIsFullscreen] = useState(false)

    // Apply protections when viewer opens
    useEffect(() => {
        if (!isOpen || !containerRef.current) return

        // Apply viewer protections
        cleanupRef.current = createViewerProtections(
            containerRef.current,
            sessionId,
            deviceHash
        )

        // Mark as viewed for ephemeral tracking
        if (fileId) {
            const result = markAsViewed(fileId)
            if (result.expired) {
                handleClose()
                return
            }
        }

        // Start countdown timer for timed mode
        if (ephemeralMode === 'timed' && fileId) {
            timerRef.current = setInterval(() => {
                const remaining = getRemainingSeconds(fileId)
                if (remaining !== null) {
                    setCountdown(remaining)
                    if (remaining <= 0) {
                        handleClose()
                    }
                }
            }, 200)
        }

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current()
                cleanupRef.current = null
            }
            if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
            }
        }
    }, [isOpen, fileId, ephemeralMode])

    // Handle fullscreen changes
    useEffect(() => {
        const handler = () => {
            setIsFullscreen(!!document.fullscreenElement)
        }
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    const handleClose = useCallback(() => {
        // Cleanup protections
        if (cleanupRef.current) {
            cleanupRef.current()
            cleanupRef.current = null
        }

        // Stop countdown
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }

        // Exit fullscreen if active
        exitFullscreen()

        // Notify ephemeral system (destroys key for view-once)
        if (fileId) {
            onViewerClosed(fileId)
        }

        // Destroy secure buffer
        if (bufferId) {
            destroySecureBuffer(bufferId)
        }

        setCountdown(null)
        onClose()
    }, [fileId, bufferId, onClose])

    const toggleFullscreen = async () => {
        if (isFullscreen) {
            await exitFullscreen()
        } else if (containerRef.current) {
            await enterFullscreen(containerRef.current)
        }
    }

    // ESC to close
    useEffect(() => {
        if (!isOpen) return
        const handler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                handleClose()
            }
        }
        window.addEventListener('keydown', handler, true)
        return () => window.removeEventListener('keydown', handler, true)
    }, [isOpen, handleClose])

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <motion.div
                className="secure-viewer__backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
            >
                <div
                    ref={containerRef}
                    className="secure-viewer__container"
                >
                    {/* Header */}
                    <div className="secure-viewer__header">
                        <div className="secure-viewer__header-left">
                            <Shield size={12} />
                            <span className="secure-viewer__label">SECURE VIEWER</span>
                            {ephemeralMode === 'view_once' && (
                                <span className="secure-viewer__badge secure-viewer__badge--view-once">
                                    <Eye size={10} /> VIEW ONCE
                                </span>
                            )}
                            {ephemeralMode === 'timed' && countdown !== null && (
                                <span className={`secure-viewer__badge secure-viewer__badge--timer ${countdown <= 5 ? 'secure-viewer__badge--urgent' : ''}`}>
                                    <Timer size={10} /> {formatTimer(countdown)}
                                </span>
                            )}
                        </div>
                        <div className="secure-viewer__header-right">
                            {fileName && (
                                <span className="secure-viewer__filename">{fileName}</span>
                            )}
                            <button
                                className="secure-viewer__btn"
                                onClick={toggleFullscreen}
                                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                            >
                                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                            <button
                                className="secure-viewer__btn secure-viewer__btn--close"
                                onClick={handleClose}
                                title="Close viewer"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="secure-viewer__content">
                        {fileType === 'image' && fileUrl && (
                            <ImagePreviewer
                                src={fileUrl}
                                fileName={fileName}
                                fileExtension={fileName?.split('.').pop()}
                            />
                        )}

                        {fileType === 'video' && fileUrl && (
                            <VideoPreviewer
                                src={fileUrl}
                                fileName={fileName}
                                fileExtension={fileName?.split('.').pop()}
                            />
                        )}

                        {fileType === 'audio' && fileUrl && (
                            <AudioPreviewer
                                src={fileUrl}
                                fileName={fileName}
                                fileExtension={fileName?.split('.').pop()}
                            />
                        )}

                        {fileType === 'document' && fileUrl && (
                            <DocumentPreviewer
                                src={fileUrl}
                                fileName={fileName}
                                fileExtension={fileName?.split('.').pop()}
                            />
                        )}
                    </div>

                    {/* Self-destruct timer bar */}
                    {ephemeralMode === 'timed' && countdown !== null && (
                        <div className="secure-viewer__timer-bar">
                            <motion.div
                                className="secure-viewer__timer-fill"
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{
                                    duration: countdown,
                                    ease: 'linear'
                                }}
                            />
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
