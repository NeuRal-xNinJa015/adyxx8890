import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, X, Loader } from 'lucide-react'

/**
 * QRScanner — Camera-based QR code scanner using BarcodeDetector API.
 * Falls back to a "not supported" message if the API is unavailable.
 *
 * Props:
 *   onScan(code) — called when a valid 6-char hex room code is detected
 *   onClose()    — called when the user closes the scanner
 */
export default function QRScanner({ onScan, onClose }) {
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const scanIntervalRef = useRef(null)
    const [status, setStatus] = useState('initializing') // initializing | scanning | error | unsupported
    const [errorMsg, setErrorMsg] = useState('')
    const hasScannedRef = useRef(false)

    const stopCamera = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current)
            scanIntervalRef.current = null
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
    }, [])

    const handleClose = useCallback(() => {
        stopCamera()
        onClose()
    }, [stopCamera, onClose])

    useEffect(() => {
        let cancelled = false

        async function startScanner() {
            // Check BarcodeDetector support
            if (!('BarcodeDetector' in window)) {
                setStatus('unsupported')
                return
            }

            // Request camera
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
                })
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop())
                    return
                }
                streamRef.current = stream
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    await videoRef.current.play()
                }
                setStatus('scanning')
            } catch (err) {
                if (cancelled) return
                console.error('[QRScanner] Camera error:', err)
                setErrorMsg(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Cannot access camera')
                setStatus('error')
                return
            }

            // Start scanning loop
            try {
                const detector = new BarcodeDetector({ formats: ['qr_code'] })
                scanIntervalRef.current = setInterval(async () => {
                    if (!videoRef.current || videoRef.current.readyState < 2 || hasScannedRef.current) return
                    try {
                        const barcodes = await detector.detect(videoRef.current)
                        for (const barcode of barcodes) {
                            const raw = (barcode.rawValue || '').trim()
                            // Extract 6-char hex code — could be just the code or a URL containing it
                            const match = raw.match(/([a-f0-9]{6})/i)
                            if (match && !hasScannedRef.current) {
                                hasScannedRef.current = true
                                stopCamera()
                                onScan(match[1].toLowerCase())
                                return
                            }
                        }
                    } catch (_) { /* scan frame failed, continue */ }
                }, 250)
            } catch (err) {
                if (cancelled) return
                console.error('[QRScanner] BarcodeDetector error:', err)
                setStatus('unsupported')
            }
        }

        startScanner()

        return () => {
            cancelled = true
            stopCamera()
        }
    }, [onScan, stopCamera])

    return (
        <AnimatePresence>
            <motion.div
                className="qr-scanner-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
            >
                <div className="qr-scanner-container">
                    {/* Close button */}
                    <button className="qr-scanner-close" onClick={handleClose}>
                        <X size={18} />
                    </button>

                    <div className="qr-scanner-header">
                        <Camera size={16} />
                        <span>Scan QR Code</span>
                    </div>

                    {/* Camera viewport */}
                    <div className="qr-scanner-viewport">
                        {status === 'initializing' && (
                            <div className="qr-scanner-status">
                                <Loader size={20} className="qr-scanner-spinner" />
                                <span>Starting camera...</span>
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="qr-scanner-status qr-scanner-status--error">
                                <span>{errorMsg}</span>
                                <button className="qr-scanner-retry" onClick={() => window.location.reload()}>
                                    Retry
                                </button>
                            </div>
                        )}

                        {status === 'unsupported' && (
                            <div className="qr-scanner-status qr-scanner-status--error">
                                <span>QR scanning not supported in this browser</span>
                                <span className="qr-scanner-hint">Use Chrome or Edge on a mobile device</span>
                            </div>
                        )}

                        {(status === 'scanning' || status === 'initializing') && (
                            <video
                                ref={videoRef}
                                className="qr-scanner-video"
                                playsInline
                                muted
                            />
                        )}

                        {/* Scan frame overlay */}
                        {status === 'scanning' && (
                            <div className="qr-scanner-frame">
                                <div className="qr-scanner-corner qr-scanner-corner--tl" />
                                <div className="qr-scanner-corner qr-scanner-corner--tr" />
                                <div className="qr-scanner-corner qr-scanner-corner--bl" />
                                <div className="qr-scanner-corner qr-scanner-corner--br" />
                                <div className="qr-scanner-scanline" />
                            </div>
                        )}
                    </div>

                    <div className="qr-scanner-footer">
                        Point at a room QR code to join automatically
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
