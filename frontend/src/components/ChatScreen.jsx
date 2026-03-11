import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Shield, Lock, Zap, WifiOff, CornerUpLeft, X, LogOut, User, Hash } from 'lucide-react'
import * as ws from '../lib/ws'
import FileUploadButton from './FileUploadButton.jsx'
import VoiceRecordButton from './VoiceRecordButton.jsx'
import MediaMessage from './MediaMessage.jsx'

// ── Reactions ──
const REACTIONS = [
    { symbol: '👍', label: 'thumbs up' },
    { symbol: '❤️', label: 'love' },
    { symbol: '😂', label: 'laugh' },
    { symbol: '🔥', label: 'fire' },
    { symbol: '😮', label: 'wow' },
    { symbol: '👎', label: 'thumbs down' },
]

export default function ChatScreen({ roomCode, isCreator, onEndSession }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [peerConnected, setPeerConnected] = useState(true)
    const [wsConnected, setWsConnected] = useState(true)
    const [encrypted, setEncrypted] = useState(false)
    const [peerTyping, setPeerTyping] = useState(false)
    const [elapsed, setElapsed] = useState(0)
    const [replyTo, setReplyTo] = useState(null)
    const [activeReactionId, setActiveReactionId] = useState(null)
    const [peerLastSeen, setPeerLastSeen] = useState(null)
    const [unreadCount, setUnreadCount] = useState(0)
    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)
    const lastTypingSentRef = useRef(0)
    const sendingRef = useRef(false)
    const fileKeysRef = useRef(new Map())
    const reactionPickerRef = useRef(null)
    const audioCtxRef = useRef(null)
    const readReceiptTimerRef = useRef(null)
    const pendingReadIdsRef = useRef(new Set())
    const MAX_MESSAGES = 500

    const addSystemMessage = useCallback((text) => {
        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            type: 'system',
            text,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        }])
    }, [])

    // Close reaction picker on outside click
    useEffect(() => {
        if (activeReactionId === null) return
        const handleClickOutside = (e) => {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target)) {
                setActiveReactionId(null)
            }
        }
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside)
        }, 100)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [activeReactionId])

    // WebSocket listeners
    useEffect(() => {
        addSystemMessage('Secure session established')

        const offMessage = ws.on('message', (msg) => {
            setMessages(prev => [...prev, {
                id: Date.now() + Math.random(),
                messageId: msg.messageId,
                type: 'received',
                text: msg.payload,
                sender: msg.deviceId?.slice(0, 8) || 'Peer',
                encrypted: msg.encrypted || false,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                replyTo: msg.replyTo || null,
                reactions: [],
                createdAt: Date.now(),
            }])
            setPeerTyping(false)
            setPeerLastSeen(Date.now())

            if (document.hidden) {
                setUnreadCount(prev => prev + 1)
                try {
                    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                        new Notification('ADYX', { body: msg.payload?.slice(0, 60) || 'New message', icon: '/favicon.ico', tag: 'adyx-msg' })
                    }
                } catch { }
                try {
                    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                        audioCtxRef.current = new AudioContext()
                    }
                    const ctx = audioCtxRef.current
                    if (ctx.state === 'suspended') ctx.resume()
                    const osc = ctx.createOscillator()
                    const gain = ctx.createGain()
                    osc.connect(gain)
                    gain.connect(ctx.destination)
                    osc.frequency.value = 800
                    gain.gain.value = 0.1
                    osc.start()
                    osc.stop(ctx.currentTime + 0.08)
                } catch { }
            }
        })

        const offMessage2 = ws.on('message', () => {
            setMessages(prev => prev.length > MAX_MESSAGES ? prev.slice(prev.length - MAX_MESSAGES) : prev)
        })

        const offAck = ws.on('ack', (msg) => {
            if (msg.status === 'delivered') {
                setMessages(prev => prev.map(m =>
                    m.messageId === msg.messageId ? { ...m, delivered: true } : m
                ))
            }
        })

        const offPeerLeft = ws.on('peer_left', () => {
            setPeerConnected(false)
            setPeerTyping(false)
            addSystemMessage('Peer disconnected')
        })

        const offDisconnected = ws.on('disconnected', () => {
            setWsConnected(false)
            addSystemMessage('Connection lost — reconnecting...')
        })

        const offConnected = ws.on('connected', () => {
            setWsConnected(true)
        })

        const offEncReady = ws.on('encryption_ready', () => {
            setEncrypted(true)
            addSystemMessage('End-to-end encryption activated')
        })

        const offTyping = ws.on('typing', () => {
            setPeerTyping(true)
            setPeerLastSeen(Date.now())
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000)
        })

        const offReaction = ws.on('reaction', (msg) => {
            setMessages(prev => prev.map(m => {
                if (m.messageId === msg.messageId) {
                    const existing = m.reactions || []
                    const alreadyIdx = existing.findIndex(r => r.from === msg.from && r.symbol === msg.reaction)
                    if (alreadyIdx !== -1) {
                        return { ...m, reactions: existing.filter((_, i) => i !== alreadyIdx) }
                    }
                    return { ...m, reactions: [...existing, { symbol: msg.reaction, from: msg.from }] }
                }
                return m
            }))
        })

        const offFileKeyMsg = ws.on('message', (msg) => {
            if (!msg.payload) return
            try {
                const parsed = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : null
                if (parsed && parsed.type === 'file_key') {
                    fileKeysRef.current.set(parsed.fileId, parsed.keyBase64)
                }
            } catch (_) { }
        })

        const offFileReady = ws.on('file_ready', async (msg) => {
            addSystemMessage('Encrypted file received')
            try {
                const chunks = await ws.requestFile(msg.fileId, roomCode, msg.totalChunks)
                const keyBase64 = fileKeysRef.current.get(msg.fileId)
                setMessages(prev => [...prev, {
                    id: Date.now() + Math.random(),
                    type: 'received',
                    isFile: true,
                    fileData: {
                        fileId: msg.fileId, chunks, totalChunks: msg.totalChunks,
                        iv: msg.iv, hash: msg.hash, keyBase64: keyBase64 || '',
                        encryptedMetadata: msg.encryptedMetadata, thumbnail: msg.thumbnail,
                        ephemeral: msg.ephemeral, displayCategory: msg.displayCategory,
                    },
                    sender: msg.deviceId?.slice(0, 8) || 'Peer',
                    encrypted: true,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                    reactions: []
                }])
            } catch (err) {
                console.error('[Chat] File download failed:', err)
            }
        })

        const offFileDeleted = ws.on('file_deleted', () => { })

        const offReadReceipt = ws.on('read_receipt', (msg) => {
            if (Array.isArray(msg.messageIds)) {
                setMessages(prev => prev.map(m => {
                    if (m.type === 'sent' && msg.messageIds.includes(m.messageId)) {
                        return { ...m, read: true }
                    }
                    return m
                }))
            }
        })

        return () => {
            offMessage(); offMessage2(); offAck(); offPeerLeft(); offDisconnected(); offConnected(); offEncReady(); offTyping()
            offReaction(); offReadReceipt(); offFileKeyMsg(); offFileReady(); offFileDeleted()
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        }
    }, [roomCode, isCreator, addSystemMessage])

    // Timer
    useEffect(() => {
        const t = setInterval(() => setElapsed(prev => prev + 1), 1000)
        return () => clearInterval(t)
    }, [])

    // Cleanup shared AudioContext on unmount
    useEffect(() => {
        return () => {
            if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
                audioCtxRef.current.close().catch(() => { })
            }
            if (readReceiptTimerRef.current) clearTimeout(readReceiptTimerRef.current)
        }
    }, [])

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, peerTyping])

    // Read receipts
    const flushReadReceipts = useCallback(() => {
        const ids = Array.from(pendingReadIdsRef.current)
        if (ids.length === 0) return
        pendingReadIdsRef.current.clear()
        ws.sendReadReceipt(ids, roomCode)
        setMessages(prev => prev.map(m =>
            ids.includes(m.messageId) ? { ...m, readSent: true } : m
        ))
    }, [roomCode])

    useEffect(() => {
        if (document.hidden) return
        const unreadIds = messages
            .filter(m => m.type === 'received' && m.messageId && !m.readSent)
            .map(m => m.messageId)
        if (unreadIds.length === 0) return
        unreadIds.forEach(id => pendingReadIdsRef.current.add(id))
        if (readReceiptTimerRef.current) clearTimeout(readReceiptTimerRef.current)
        readReceiptTimerRef.current = setTimeout(flushReadReceipts, 500)
    }, [messages, flushReadReceipts])

    useEffect(() => {
        const handleVisibility = () => {
            if (!document.hidden) {
                const unreadIds = messages
                    .filter(m => m.type === 'received' && m.messageId && !m.readSent)
                    .map(m => m.messageId)
                if (unreadIds.length > 0) {
                    unreadIds.forEach(id => pendingReadIdsRef.current.add(id))
                    flushReadReceipts()
                }
            }
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [messages, flushReadReceipts])

    // Title bar unread badge
    useEffect(() => {
        if (unreadCount > 0) {
            document.title = `(${unreadCount}) ADYX`
        } else {
            document.title = 'ADYX'
        }
        return () => { document.title = 'ADYX \u2014 Anonymous Communication' }
    }, [unreadCount])

    // Clear unread on focus
    useEffect(() => {
        const handleFocus = () => setUnreadCount(0)
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [])

    // Focus input
    useEffect(() => { inputRef.current?.focus() }, [])

    // Browser notifications
    useEffect(() => {
        if (!('Notification' in window)) return
        if (Notification.permission === 'default') {
            Notification.requestPermission()
        }
    }, [])

    // ── Handlers ──
    const handleSend = async () => {
        const text = input.trim()
        if (!text || sendingRef.current) return
        sendingRef.current = true

        const msgId = crypto.randomUUID().split('-')[0]
        const replyData = replyTo ? { id: replyTo.messageId || replyTo.id, text: replyTo.text?.slice(0, 80), sender: replyTo.sender || (replyTo.type === 'sent' ? 'You' : 'Peer') } : null

        setMessages(prev => {
            const next = [...prev, {
                id: Date.now() + Math.random(),
                messageId: msgId,
                type: 'sent',
                text,
                delivered: false,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                replyTo: replyData,
                reactions: [],
                createdAt: Date.now(),
            }]
            return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
        })
        setInput('')
        setReplyTo(null)

        try {
            await ws.sendMessage(text, roomCode, msgId)
        } catch (err) {
            console.error('[Chat] Send failed:', err)
        } finally {
            sendingRef.current = false
        }
    }

    const handleFileReady = useCallback(async (fileData) => {
        try {
            fileKeysRef.current.set(fileData.fileId, fileData.keyBase64)
            setMessages(prev => [...prev, {
                id: Date.now() + Math.random(),
                type: 'sent',
                isFile: true,
                fileData,
                delivered: false,
                time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                reactions: []
            }])
            await ws.sendFile(fileData, roomCode)
            setMessages(prev => prev.map(m =>
                m.fileData?.fileId === fileData.fileId ? { ...m, delivered: true } : m
            ))
        } catch (err) {
            console.error('[Chat] File send failed:', err)
        }
    }, [roomCode])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
        if (e.key === 'Escape' && replyTo) {
            setReplyTo(null)
        }
    }

    const handleInputChange = (e) => {
        setInput(e.target.value)
        const now = Date.now()
        if (now - lastTypingSentRef.current > 2000) {
            ws.sendTyping(roomCode)
            lastTypingSentRef.current = now
        }
    }

    const handleReaction = (msg, symbol) => {
        const msgId = msg.messageId
        if (!msgId) return
        setMessages(prev => prev.map(m => {
            if (m.messageId === msgId) {
                const existing = m.reactions || []
                const alreadyIdx = existing.findIndex(r => r.from === 'me' && r.symbol === symbol)
                if (alreadyIdx !== -1) {
                    return { ...m, reactions: existing.filter((_, i) => i !== alreadyIdx) }
                }
                return { ...m, reactions: [...existing, { symbol, from: 'me' }] }
            }
            return m
        }))
        ws.sendReaction(msgId, symbol, roomCode)
        setActiveReactionId(null)
    }

    const handleReply = (msg) => {
        setReplyTo(msg)
        setActiveReactionId(null)
        inputRef.current?.focus()
    }

    const linkifyText = (text) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g
        const parts = text.split(urlRegex)
        const urls = text.match(urlRegex) || []
        const urlSet = new Set(urls)
        return parts.map((part, i) => {
            if (urlSet.has(part)) {
                return <a key={`link-${i}`} href={part} target="_blank" rel="noopener noreferrer" className="dc-msg__link">{part}</a>
            }
            return part
        })
    }

    const formatElapsed = (s) => {
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        const sec = s % 60
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }

    const shouldGroup = (msg, prevMsg) => {
        if (!prevMsg) return false
        if (msg.type !== prevMsg.type) return false
        if (msg.type === 'system') return false
        return msg.time === prevMsg.time
    }

    const groupReactions = (reactions) => {
        if (!reactions || reactions.length === 0) return []
        const map = {}
        reactions.forEach(r => {
            if (!map[r.symbol]) map[r.symbol] = { symbol: r.symbol, count: 0, mine: false }
            map[r.symbol].count++
            if (r.from === 'me') map[r.symbol].mine = true
        })
        return Object.values(map)
    }

    // ── Render ──
    return (
        <motion.div
            className="dc"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Connection lost banner */}
            <AnimatePresence>
                {!wsConnected && (
                    <motion.div
                        className="dc__banner"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <WifiOff size={12} /> Connection lost — attempting to reconnect...
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Discord-style Header ── */}
            <div className="dc__header">
                <div className="dc__header-left">
                    <Hash size={18} className="dc__hash" />
                    <span className="dc__channel-name">{roomCode.toUpperCase()}</span>
                    <div className="dc__header-divider" />
                    <span className="dc__header-badge dc__header-badge--lock">
                        <Lock size={10} /> E2E
                    </span>
                    <span className={`dc__header-badge ${encrypted ? 'dc__header-badge--active' : 'dc__header-badge--pending'}`}>
                        <Zap size={10} /> {encrypted ? 'AES-256' : 'HANDSHAKE'}
                    </span>
                </div>
                <div className="dc__header-right">
                    {/* Live Status Indicator */}
                    <div className={`dc__live-indicator ${peerConnected ? (peerTyping ? 'dc__live-indicator--typing' : 'dc__live-indicator--live') : 'dc__live-indicator--offline'}`}>
                        <span className="dc__live-dot">
                            <span className="dc__live-dot-core" />
                            {peerConnected && <span className="dc__live-dot-ring" />}
                        </span>
                        <span className="dc__live-label">
                            {!peerConnected ? 'OFFLINE' : peerTyping ? 'TYPING' : 'LIVE'}
                        </span>
                    </div>
                    <span className="dc__elapsed">{formatElapsed(elapsed)}</span>
                    <button className="dc__end-btn" onClick={onEndSession}>
                        <LogOut size={14} /> End
                    </button>
                </div>
            </div>

            {/* ── Messages Area ── */}
            <div className="dc__messages">
                {/* Welcome card */}
                <div className="dc__welcome">
                    <div className="dc__welcome-icon">
                        <Hash size={36} />
                    </div>
                    <h3 className="dc__welcome-title">Welcome to #{roomCode.toUpperCase()}</h3>
                    <p className="dc__welcome-desc">
                        This is an encrypted, ephemeral channel. Messages are end-to-end encrypted and never stored.
                    </p>
                </div>

                {messages.map((msg, idx) => (
                    <div key={msg.id}>
                        {msg.type === 'system' ? (
                            <div className="dc__system">
                                <Shield size={12} />
                                <span>{msg.text}</span>
                                <span className="dc__system-time">{msg.time}</span>
                            </div>
                        ) : (
                            <div className={`dc__msg ${shouldGroup(msg, messages[idx - 1]) ? 'dc__msg--grouped' : ''}`}>
                                {/* Avatar + Header (only on non-grouped) */}
                                {!shouldGroup(msg, messages[idx - 1]) && (
                                    <div className="dc__msg-header">
                                        <div className={`dc__avatar ${msg.type === 'sent' ? 'dc__avatar--you' : 'dc__avatar--peer'}`}>
                                            {msg.type === 'sent' ? 'Y' : 'P'}
                                        </div>
                                        <span className={`dc__msg-author ${msg.type === 'sent' ? 'dc__msg-author--you' : 'dc__msg-author--peer'}`}>
                                            {msg.type === 'sent' ? 'You' : (msg.sender || 'Peer')}
                                        </span>
                                        <span className="dc__msg-timestamp">{msg.time}</span>
                                    </div>
                                )}

                                {/* Content */}
                                <div className="dc__msg-content">
                                    {/* Reply quote */}
                                    {msg.replyTo && (
                                        <div className="dc__reply-quote">
                                            <div className="dc__reply-bar" />
                                            <div className="dc__reply-body">
                                                <span className="dc__reply-author">{msg.replyTo.sender || 'Unknown'}</span>
                                                <span className="dc__reply-text">{msg.replyTo.text || '[file]'}</span>
                                            </div>
                                        </div>
                                    )}

                                    {msg.isFile ? (
                                        <MediaMessage
                                            fileData={msg.fileData}
                                            isSent={msg.type === 'sent'}
                                            sessionId={ws.getStatus().deviceId}
                                            deviceHash=""
                                        />
                                    ) : (
                                        <div className="dc__msg-text">{linkifyText(msg.text)}</div>
                                    )}

                                    {/* Delivery status */}
                                    {msg.type === 'sent' && (
                                        <span className={`dc__delivery ${msg.read ? 'dc__delivery--read' : ''}`}>
                                            {msg.read ? '✓✓' : msg.delivered ? '✓✓' : '✓'}
                                        </span>
                                    )}
                                </div>

                                {/* Reactions */}
                                {msg.reactions && msg.reactions.length > 0 && (
                                    <div className="dc__reactions">
                                        {groupReactions(msg.reactions).map(r => (
                                            <button
                                                key={r.symbol}
                                                className={`dc__reaction ${r.mine ? 'dc__reaction--mine' : ''}`}
                                                onClick={() => handleReaction(msg, r.symbol)}
                                            >
                                                {r.symbol}{r.count > 1 ? ` ${r.count}` : ''}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Hover actions */}
                                <div className="dc__msg-actions">
                                    <button className="dc__action-btn" onClick={(e) => { e.stopPropagation(); setActiveReactionId(activeReactionId === msg.id ? null : msg.id) }} title="React">😊</button>
                                    <button className="dc__action-btn" onClick={() => handleReply(msg)} title="Reply">
                                        <CornerUpLeft size={14} />
                                    </button>
                                </div>

                                {/* Reaction picker */}
                                <AnimatePresence>
                                    {activeReactionId === msg.id && (
                                        <motion.div
                                            className="dc__reaction-picker"
                                            ref={reactionPickerRef}
                                            initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                            transition={{ duration: 0.12 }}
                                        >
                                            {REACTIONS.map(r => (
                                                <button key={r.symbol} className="dc__reaction-opt" onClick={() => handleReaction(msg, r.symbol)} title={r.label}>
                                                    {r.symbol}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                ))}

                {/* Typing indicator */}
                <AnimatePresence>
                    {peerTyping && (
                        <motion.div
                            className="dc__typing"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        >
                            <div className="dc__avatar dc__avatar--peer dc__avatar--sm">P</div>
                            <span className="dc__typing-dots">
                                <span /><span /><span />
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* ── Input Area ── */}
            <div className="dc__input-area">
                {!peerConnected && (
                    <div className="dc__input-warn">
                        Peer disconnected — messages won't be delivered
                    </div>
                )}

                {/* Reply bar */}
                <AnimatePresence>
                    {replyTo && (
                        <motion.div
                            className="dc__reply-bar-input"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                        >
                            <CornerUpLeft size={12} />
                            <span className="dc__reply-input-author">
                                {replyTo.type === 'sent' ? 'You' : (replyTo.sender || 'Peer')}
                            </span>
                            <span className="dc__reply-input-text">
                                {replyTo.isFile ? '[File]' : (replyTo.text?.slice(0, 60) || '...')}
                            </span>
                            <button className="dc__reply-close" onClick={() => setReplyTo(null)}>
                                <X size={14} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="dc__input-row">
                    <FileUploadButton onFileReady={handleFileReady} disabled={!peerConnected} roomCode={roomCode} />
                    <input
                        ref={inputRef}
                        type="text"
                        className="dc__input"
                        placeholder={peerConnected ? `Message #${roomCode.toUpperCase()}` : 'Peer disconnected'}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        disabled={!peerConnected}
                        autoComplete="off"
                    />
                    <VoiceRecordButton onFileReady={handleFileReady} disabled={!peerConnected} roomCode={roomCode} />
                    <button
                        className={`dc__send ${input.trim() && peerConnected ? 'dc__send--active' : ''}`}
                        onClick={handleSend}
                        disabled={!input.trim() || !peerConnected}
                    >
                        <Send size={18} />
                    </button>
                </div>
                <div className="dc__input-hint">
                    <Lock size={8} /> {encrypted ? 'AES-256-GCM ENCRYPTED' : 'ENCRYPTING...'}
                </div>
            </div>
        </motion.div>
    )
}
