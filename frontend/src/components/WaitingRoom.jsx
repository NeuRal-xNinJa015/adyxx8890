import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Copy, Check, ArrowLeft, Loader, RefreshCw, QrCode } from 'lucide-react'
import * as ws from '../lib/ws'
import QRCodeCanvas from './QRCode.jsx'

const ROOM_TTL = 30 // seconds before auto-regenerating room code

export default function WaitingRoom({ roomCode, onPeerJoined, onBack, onRoomRegenerated }) {
    const [copied, setCopied] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const [status, setStatus] = useState('Scanning for peer connection')
    const [regenerating, setRegenerating] = useState(false)
    const [showQR, setShowQR] = useState(false)
    const timerRef = useRef(null)
    const peerJoinedRef = useRef(false)
    const regeneratingRef = useRef(false)

    // Listen for real peer_joined event from server
    useEffect(() => {
        const offPeerJoined = ws.on('peer_joined', () => {
            peerJoinedRef.current = true
            setStatus('Peer connected! Entering room...')
            setTimeout(() => onPeerJoined(), 800)
        })
        const offError = ws.on('error', (msg) => {
            setStatus(msg.error || 'Connection error')
        })
        const offDisconnected = ws.on('disconnected', () => {
            setStatus('Disconnected from server. Reconnecting...')
        })
        return () => { offPeerJoined(); offError(); offDisconnected() }
    }, [onPeerJoined])

    // Auto-regenerate room after ROOM_TTL seconds
    const regenerateRoom = useCallback(() => {
        if (peerJoinedRef.current || regeneratingRef.current) return
        regeneratingRef.current = true
        setRegenerating(true)
        setStatus('Room expired. Generating new code...')

        const off = ws.on('room_created', (msg) => {
            if (onRoomRegenerated) onRoomRegenerated(msg.roomCode)
            setElapsed(0)
            regeneratingRef.current = false
            setRegenerating(false)
            setStatus('Scanning for peer connection')
            setCopied(false)
            off()
            clearTimeout(fallbackTimer)
        })

        // Fallback: if room_created never arrives, reset after 5s
        const fallbackTimer = setTimeout(() => {
            off()
            regeneratingRef.current = false
            setRegenerating(false)
            setStatus('Failed to refresh room. Retrying...')
            setElapsed(0)
        }, 5000)

        ws.createRoom()
    }, [onRoomRegenerated])

    // Elapsed timer
    useEffect(() => {
        timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
        return () => clearInterval(timerRef.current)
    }, [])

    // Check for room expiry
    useEffect(() => {
        if (elapsed >= ROOM_TTL && !peerJoinedRef.current && !regenerating) {
            regenerateRoom()
        }
    }, [elapsed, regenerating, regenerateRoom])

    const remaining = Math.max(ROOM_TTL - elapsed, 0)

    const copyCode = () => {
        navigator.clipboard.writeText(roomCode.toUpperCase())
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <motion.div
            className="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
        >
            {/* Back */}
            <button className="waiting__back" onClick={onBack}>
                <ArrowLeft size={14} /> ESC
            </button>

            {/* Orbit rings */}
            <div className="waiting__orbit">
                <div className="waiting__orbit-ring"><div className="waiting__orbit-dot" /></div>
                <div className="waiting__orbit-ring"><div className="waiting__orbit-dot" /></div>
                <div className="waiting__orbit-ring"><div className="waiting__orbit-dot" /></div>
            </div>

            {/* Content */}
            <motion.div
                className="waiting__content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
            >
                <div className="waiting__header">
                    <span className="waiting__header-bracket">[</span>
                    <span className="waiting__header-text">Room Created</span>
                    <span className="waiting__header-bracket">]</span>
                </div>

                <div className="waiting__label">Share this code with your peer</div>

                {/* Room code */}
                <div className="waiting__code-wrapper">
                    <div className="waiting__code">
                        <div className="waiting__code-chars">
                            {roomCode.toUpperCase().split('').map((char, i) => (
                                <span key={i} className="waiting__code-char">{char}</span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* QR Code */}
                <div className="waiting__qr-section">
                    <button
                        className={`waiting__qr-toggle ${showQR ? 'waiting__qr-toggle--active' : ''}`}
                        onClick={() => setShowQR(!showQR)}
                    >
                        <QrCode size={12} />
                        {showQR ? 'HIDE QR' : 'SHOW QR CODE'}
                    </button>
                    {showQR && (
                        <div className="waiting__qr-container">
                            <QRCodeCanvas
                                text={`${window.location.origin}/join/${roomCode.toUpperCase()}`}
                                size={140}
                                fgColor="#ffffff"
                                bgColor="transparent"
                            />
                            <span className="waiting__qr-label">Scan to Join</span>
                        </div>
                    )}
                </div>

                {/* Copy button */}
                <button
                    className="waiting__copy-btn"
                    onClick={copyCode}
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'COPIED' : 'COPY CODE'}
                </button>

                {/* Divider */}
                <div className="waiting__divider" />

                {/* Status */}
                <div className="waiting__status">
                    <div className="waiting__beacon">
                        <div className="waiting__beacon-core" />
                        <div className="waiting__beacon-ring" />
                    </div>
                    <span className="waiting__status-text">{status}</span>
                </div>

                {/* ── Segment Countdown ── */}
                <div className={`waiting__countdown ${remaining <= 5 ? 'waiting__countdown--urgent' : ''} ${regenerating ? 'waiting__countdown--regen' : ''}`}>
                    <div className="waiting__countdown-digits">
                        <div className="waiting__digit-card">
                            <span className="waiting__digit">{String(Math.floor(remaining / 10))}</span>
                        </div>
                        <div className="waiting__digit-card">
                            <span className="waiting__digit">{String(remaining % 10)}</span>
                        </div>
                    </div>
                    <span className="waiting__countdown-unit">seconds remaining</span>

                    {/* Segmented progress bar */}
                    <div className="waiting__segments">
                        {Array.from({ length: 30 }, (_, i) => (
                            <div
                                key={i}
                                className={`waiting__segment ${i < elapsed ? 'waiting__segment--spent' : ''} ${i === Math.floor(elapsed) ? 'waiting__segment--active' : ''}`}
                            />
                        ))}
                    </div>
                </div>

                <div className="waiting__ttl-label">
                    {regenerating
                        ? <span className="waiting__ttl-regen">generating fresh code</span>
                        : remaining <= 5
                            ? <span className="waiting__ttl-hot">code expiring</span>
                            : <span>code refreshes in <strong>{remaining}s</strong></span>
                    }
                </div>

                <div className="waiting__info">
                    <p>End-to-end encrypted</p>
                    <p>No data stored on server</p>
                </div>
            </motion.div>

            {/* Corner meta */}
            <div className="waiting__meta waiting__meta--bl">ROOM.ACTIVE</div>
            <div className="waiting__meta waiting__meta--br">AWAITING.PEER</div>
        </motion.div>
    )
}
