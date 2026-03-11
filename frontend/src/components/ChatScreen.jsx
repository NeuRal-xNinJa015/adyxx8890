import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Shield, Clock, LogOut, User, Lock, Zap, Wifi, WifiOff, CornerUpLeft, X, Palette, Timer, ExternalLink, Globe, Bell, BellOff, Signal, Download } from 'lucide-react'
import * as ws from '../lib/ws'
import FileUploadButton from './FileUploadButton.jsx'
import VoiceRecordButton from './VoiceRecordButton.jsx'
import MediaMessage from './MediaMessage.jsx'

// ── Monochrome B/W Reactions ──
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
    const [logs, setLogs] = useState([])
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [replyTo, setReplyTo] = useState(null)            // message being replied to
    const [activeReactionId, setActiveReactionId] = useState(null)  // message id showing reaction picker
    const [peerLastSeen, setPeerLastSeen] = useState(null)  // timestamp of peer's last activity
    const [chatTheme, setChatTheme] = useState(() => sessionStorage.getItem('adyx-chat-theme') || 'classic')
    const [disappearTimer, setDisappearTimer] = useState(0)  // 0 = off, seconds until messages vanish
    const [notificationsEnabled, setNotificationsEnabled] = useState(() => sessionStorage.getItem('adyx-notifications') !== 'off')
    const [unreadCount, setUnreadCount] = useState(0)
    const [, setTick] = useState(0)  // force re-render for disappear countdowns
    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const typingTimeoutRef = useRef(null)
    const lastTypingSentRef = useRef(0)
    const sendingRef = useRef(false)
    const fileKeysRef = useRef(new Map())
    const reactionPickerRef = useRef(null)
    const notificationsEnabledRef = useRef(notificationsEnabled)
    const audioCtxRef = useRef(null)
    const readReceiptTimerRef = useRef(null)
    const pendingReadIdsRef = useRef(new Set())
    const MAX_MESSAGES = 500

    const addLog = useCallback((text) => {
        setLogs(prev => [...prev.slice(-50), {
            time: new Date().toLocaleTimeString('en-US', { hour12: false }),
            text
        }])
    }, [])

    const addSystemMessage = useCallback((text) => {
        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            type: 'system',
            text,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        }])
    }, [])

    // Close reaction picker on outside click (with delay to prevent instant close)
    useEffect(() => {
        if (activeReactionId === null) return
        const handleClickOutside = (e) => {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target)) {
                setActiveReactionId(null)
            }
        }
        // Delay adding listener so the opening click doesn't immediately close it
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
        addLog('E2E session active')
        addLog(`Room: ${roomCode.toUpperCase()}`)
        addLog(`Role: ${isCreator ? 'HOST' : 'GUEST'}`)

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
            addLog(`MSG IN ${msg.encrypted ? '[E2E]' : '[PLAIN]'} ${msg.deviceId?.slice(0, 8) || 'peer'}`)
            setPeerTyping(false)
            setPeerLastSeen(Date.now())

            // Notification when tab is hidden (uses ref to avoid stale closure)
            if (document.hidden && notificationsEnabledRef.current) {
                setUnreadCount(prev => prev + 1)
                try {
                    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                        new Notification('ADYX', {
                            body: msg.payload?.slice(0, 60) || 'New message',
                            icon: '/favicon.ico',
                            tag: 'adyx-msg',
                        })
                    }
                } catch { }
                // Short beep sound — reuse shared AudioContext
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

        // Also cap received messages
        const offMessage2 = ws.on('message', () => {
            setMessages(prev => prev.length > MAX_MESSAGES ? prev.slice(prev.length - MAX_MESSAGES) : prev)
        })

        const offAck = ws.on('ack', (msg) => {
            addLog(`ACK: ${msg.status}`)
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
            addLog('PEER_LEFT')
        })

        const offDisconnected = ws.on('disconnected', () => {
            setWsConnected(false)
            addSystemMessage('Connection lost — reconnecting...')
            addLog('WS disconnected')
        })

        const offConnected = ws.on('connected', () => {
            setWsConnected(true)
            addLog('WS reconnected')
        })

        const offEncReady = ws.on('encryption_ready', () => {
            setEncrypted(true)
            addSystemMessage('End-to-end encryption activated')
            addLog('E2E: ECDH P-256 + AES-256-GCM [OK]')
        })

        const offTyping = ws.on('typing', () => {
            setPeerTyping(true)
            setPeerLastSeen(Date.now())
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000)
        })

        // ── Reaction Events ──
        const offReaction = ws.on('reaction', (msg) => {
            setMessages(prev => prev.map(m => {
                if (m.messageId === msg.messageId) {
                    const existing = m.reactions || []
                    // Toggle: remove if same reaction from same person, else add
                    const alreadyIdx = existing.findIndex(r => r.from === msg.from && r.symbol === msg.reaction)
                    if (alreadyIdx !== -1) {
                        return { ...m, reactions: existing.filter((_, i) => i !== alreadyIdx) }
                    }
                    return { ...m, reactions: [...existing, { symbol: msg.reaction, from: msg.from }] }
                }
                return m
            }))
            addLog(`REACTION ← ${msg.reaction}`)
        })

        // ── File Events ──
        const offFileKeyMsg = ws.on('message', (msg) => {
            if (!msg.payload) return
            try {
                const parsed = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : null
                if (parsed && parsed.type === 'file_key') {
                    fileKeysRef.current.set(parsed.fileId, parsed.keyBase64)
                    addLog(`FILE KEY ← ${parsed.fileId.slice(0, 8)}`)
                }
            } catch (_) { }
        })

        const offFileReady = ws.on('file_ready', async (msg) => {
            addLog(`FILE ← ${msg.displayCategory} from ${msg.deviceId?.slice(0, 8)}`)
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
                addLog('FILE download FAILED')
            }
        })

        const offFileDeleted = ws.on('file_deleted', (msg) => {
            addLog(`FILE DELETED: ${msg.fileId.slice(0, 8)}`)
        })

        // ── Read Receipt Events ──
        const offReadReceipt = ws.on('read_receipt', (msg) => {
            if (Array.isArray(msg.messageIds)) {
                setMessages(prev => prev.map(m => {
                    if (m.type === 'sent' && msg.messageIds.includes(m.messageId)) {
                        return { ...m, read: true }
                    }
                    return m
                }))
                addLog(`READ ← ${msg.messageIds.length} msgs`)
            }
        })

        return () => {
            offMessage(); offMessage2(); offAck(); offPeerLeft(); offDisconnected(); offConnected(); offEncReady(); offTyping()
            offReaction(); offReadReceipt(); offFileKeyMsg(); offFileReady(); offFileDeleted()
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        }
    }, [roomCode, isCreator, addLog, addSystemMessage])

    // Timer
    useEffect(() => {
        const t = setInterval(() => setElapsed(prev => prev + 1), 1000)
        return () => clearInterval(t)
    }, [])

    // Disappearing messages cleanup + tick for countdown display
    useEffect(() => {
        if (disappearTimer === 0) return
        const interval = setInterval(() => {
            const now = Date.now()
            setMessages(prev => {
                const next = prev.filter(m => {
                    if (m.type === 'system') return true
                    if (!m.createdAt) return true
                    return now - m.createdAt < disappearTimer * 1000
                })
                return next.length !== prev.length ? next : prev  // avoid re-render if nothing changed
            })
            setTick(t => t + 1)  // drive countdown badge re-renders at 1Hz
        }, 1000)
        return () => clearInterval(interval)
    }, [disappearTimer])

    // Keep notificationsEnabledRef in sync
    useEffect(() => {
        notificationsEnabledRef.current = notificationsEnabled
    }, [notificationsEnabled])

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

    // Debounced read receipt sender (batches receipts, max 1 send per 500ms)
    const flushReadReceipts = useCallback(() => {
        const ids = Array.from(pendingReadIdsRef.current)
        if (ids.length === 0) return
        pendingReadIdsRef.current.clear()
        ws.sendReadReceipt(ids, roomCode)
        setMessages(prev => prev.map(m =>
            ids.includes(m.messageId) ? { ...m, readSent: true } : m
        ))
    }, [roomCode])

    // Queue read receipts for new received messages (debounced)
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

    // Send pending read receipts when tab becomes visible
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
        return () => { document.title = 'ADYX' }
    }, [unreadCount])

    // Clear unread on focus
    useEffect(() => {
        const handleFocus = () => setUnreadCount(0)
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [])

    // Focus input
    useEffect(() => { inputRef.current?.focus() }, [])

    // Browser notifications for background tab
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
            addLog(`MSG OUT ${encrypted ? '[E2E]' : '[PLAIN]'} peer`)
        } catch (err) {
            console.error('[Chat] Send failed:', err)
            addLog('MSG → FAILED')
        } finally {
            sendingRef.current = false
        }

        try {
            if (document.hidden && Notification.permission === 'granted') {
                new Notification('ADYX', { body: 'New message sent', silent: true })
            }
        } catch (_) { }
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
            addLog(`FILE OUT [E2E] ${fileData.displayCategory}`)
            setMessages(prev => prev.map(m =>
                m.fileData?.fileId === fileData.fileId ? { ...m, delivered: true } : m
            ))
        } catch (err) {
            console.error('[Chat] File send failed:', err)
            addLog('FILE → FAILED')
        }
    }, [roomCode, addLog])

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

        // Optimistic update locally
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

        const inlineContent = parts.map((part, i) => {
            if (urlRegex.test(part)) {
                return <a key={`link-${i}`} href={part} target="_blank" rel="noopener noreferrer" className="msg__link">{part}</a>
            }
            return part
        })

        // If there are URLs, also render preview cards below the text
        if (urls.length > 0) {
            const cards = urls.map((url, i) => {
                try {
                    const parsed = new URL(url)
                    const domain = parsed.hostname.replace('www.', '')
                    const path = parsed.pathname !== '/' ? parsed.pathname.slice(0, 40) : ''
                    return (
                        <a
                            key={`card-${i}`}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-card"
                        >
                            <div className="link-card__icon">
                                <Globe size={14} />
                            </div>
                            <div className="link-card__info">
                                <span className="link-card__domain">{domain}</span>
                                {path && <span className="link-card__path">{path}</span>}
                            </div>
                            <ExternalLink size={10} className="link-card__ext" />
                        </a>
                    )
                } catch {
                    return null
                }
            })
            return (
                <>
                    <span>{inlineContent}</span>
                    <div className="link-cards">{cards}</div>
                </>
            )
        }

        return inlineContent
    }

    const formatElapsed = (s) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }

    const shouldGroup = (msg, prevMsg) => {
        if (!prevMsg) return false
        if (msg.type !== prevMsg.type) return false
        if (msg.type === 'system') return false
        return msg.time === prevMsg.time
    }

    // Group reactions by symbol for display
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

    return (
        <motion.div
            className="chat"
            data-chat-theme={chatTheme}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Connection lost banner */}
            <AnimatePresence>
                {!wsConnected && (
                    <motion.div
                        className="chat__banner chat__banner--warn"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <WifiOff size={12} /> Connection lost — attempting to reconnect...
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Header */}
            <div className="chat__header">
                <div className="chat__header-left">
                    <div className="chat__brand-mini">
                        <span className="chat__brand-bracket">[</span>
                        <span className="chat__room-name">ADYX</span>
                        <span className="chat__brand-bracket">]</span>
                    </div>
                    <span className="chat__room-badge chat__room-badge--accent">
                        <Lock size={9} /> {roomCode.toUpperCase()}
                    </span>
                    <span className={`chat__room-badge ${encrypted ? 'chat__room-badge--encrypted' : ''}`}>
                        <Zap size={9} /> {encrypted ? 'E2E ACTIVE' : 'HANDSHAKE...'}
                    </span>
                </div>
                <div className="chat__header-right">
                    <div className="chat__session-time">
                        <Clock size={10} /> {formatElapsed(elapsed)}
                    </div>
                    <div className="chat__quality" title={`Connection: ${wsConnected ? (peerConnected ? 'Excellent' : 'Server Only') : 'Disconnected'}`}>
                        <Signal size={10} />
                        <div className="quality-bars">
                            <span className={`quality-bar ${wsConnected ? 'quality-bar--on' : ''}`} />
                            <span className={`quality-bar ${wsConnected && peerConnected ? 'quality-bar--on' : ''}`} />
                            <span className={`quality-bar ${wsConnected && peerConnected && encrypted ? 'quality-bar--on' : ''}`} />
                        </div>
                    </div>
                    <div className="chat__status-indicator">
                        <span className={`chat__status-dot ${peerConnected ? (peerTyping ? 'chat__status-dot--typing' : 'chat__status-dot--active') : ''}`} />
                        {!peerConnected
                            ? 'OFFLINE'
                            : peerTyping
                                ? 'TYPING...'
                                : peerLastSeen
                                    ? `ONLINE`
                                    : 'LIVE'
                        }
                    </div>
                    <button
                        className="chat__sidebar-toggle"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        title="Toggle sidebar"
                    >
                        {sidebarOpen ? '◁' : '▷'}
                    </button>
                    <button className="chat__end-btn" onClick={onEndSession}>
                        <LogOut size={10} /> END
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="chat__body">
                {/* Sidebar */}
                <AnimatePresence>
                    {sidebarOpen && (
                        <motion.div
                            className="chat__sidebar"
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 220, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            <div className="chat__sidebar-content">
                                <div className="chat__sidebar-section">
                                    <div className="chat__sidebar-title">
                                        <Shield size={10} /> Session Info
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Room</span>
                                        <span className="chat__sidebar-value">{roomCode.toUpperCase()}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Role</span>
                                        <span className="chat__sidebar-value">{isCreator ? 'HOST' : 'GUEST'}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Peer</span>
                                        <span className="chat__sidebar-value" style={{ color: peerConnected ? 'var(--white-pure)' : 'var(--gray-600)' }}>
                                            {peerConnected ? 'CONNECTED' : 'OFFLINE'}
                                        </span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Duration</span>
                                        <span className="chat__sidebar-value">{formatElapsed(elapsed)}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Cipher</span>
                                        <span className="chat__sidebar-value">{encrypted ? 'AES-256-GCM' : 'PENDING'}</span>
                                    </div>
                                    <div className="chat__sidebar-item">
                                        <span className="chat__sidebar-label">Key</span>
                                        <span className="chat__sidebar-value">{encrypted ? 'ECDH P-256' : 'PENDING'}</span>
                                    </div>
                                </div>

                                <div className="chat__sidebar-section">
                                    <div className="chat__sidebar-title">
                                        <Bell size={10} /> Notifications
                                    </div>
                                    <button
                                        className={`notif-toggle ${notificationsEnabled ? 'notif-toggle--on' : ''}`}
                                        onClick={() => {
                                            const next = !notificationsEnabled
                                            setNotificationsEnabled(next)
                                            sessionStorage.setItem('adyx-notifications', next ? 'on' : 'off')
                                            if (next && Notification.permission === 'default') {
                                                Notification.requestPermission()
                                            }
                                            addLog(`NOTIFY: ${next ? 'ON' : 'OFF'}`)
                                        }}
                                    >
                                        {notificationsEnabled ? <Bell size={10} /> : <BellOff size={10} />}
                                        {notificationsEnabled ? 'ON' : 'OFF'}
                                    </button>
                                </div>

                                <div className="chat__sidebar-section">
                                    <div className="chat__sidebar-title">
                                        <Palette size={10} /> Theme
                                    </div>
                                    <div className="theme-picker">
                                        {[
                                            { id: 'classic', label: 'Classic' },
                                            { id: 'midnight', label: 'Midnight' },
                                            { id: 'ghost', label: 'Ghost' },
                                            { id: 'neon', label: 'Neon' },
                                        ].map(t => (
                                            <button
                                                key={t.id}
                                                className={`theme-picker__swatch theme-picker__swatch--${t.id} ${chatTheme === t.id ? 'theme-picker__swatch--active' : ''}`}
                                                onClick={() => {
                                                    setChatTheme(t.id)
                                                    sessionStorage.setItem('adyx-chat-theme', t.id)
                                                }}
                                                title={t.label}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="chat__sidebar-section">
                                    <div className="chat__sidebar-title">
                                        <Timer size={10} /> Disappear
                                    </div>
                                    <div className="disappear-picker">
                                        {[
                                            { val: 0, label: 'Off' },
                                            { val: 30, label: '30s' },
                                            { val: 60, label: '1m' },
                                            { val: 300, label: '5m' },
                                        ].map(opt => (
                                            <button
                                                key={opt.val}
                                                className={`disappear-picker__opt ${disappearTimer === opt.val ? 'disappear-picker__opt--active' : ''}`}
                                                onClick={() => {
                                                    setDisappearTimer(opt.val)
                                                    if (opt.val > 0) addLog(`DISAPPEAR: ${opt.label}`)
                                                    else addLog('DISAPPEAR: OFF')
                                                }}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="chat__sidebar-section">
                                    <div className="chat__sidebar-title">
                                        {'>'}_ Protocol Log
                                    </div>
                                    <div className="chat__sidebar-log">
                                        {logs.map((log, i) => (
                                            <div key={i}>
                                                <span className="log-prefix">[{log.time}]</span> {log.text}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="chat__sidebar-section">
                                    <button
                                        className="chat__export-btn"
                                        onClick={() => {
                                            const sanitize = (str) => (str || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, 5000)
                                            const lines = messages
                                                .filter(m => m.type !== 'system')
                                                .map(m => {
                                                    const dir = m.type === 'sent' ? 'YOU' : 'PEER'
                                                    return `[${m.time}] ${dir}: ${sanitize(m.text) || '[media]'}`
                                                })
                                            const safeRoom = roomCode.toUpperCase().replace(/[^A-Z0-9]/g, '')
                                            const header = `ADYX Chat Export\nRoom: ${safeRoom}\nDate: ${new Date().toISOString()}\nMessages: ${lines.length}\nEncryption: ${encrypted ? 'AES-256-GCM + ECDH P-256' : 'Pending'}\n${'─'.repeat(50)}\n`
                                            const blob = new Blob(['\uFEFF' + header + lines.join('\n')], { type: 'text/plain;charset=utf-8' })
                                            const a = document.createElement('a')
                                            a.href = URL.createObjectURL(blob)
                                            a.download = `adyx-chat-${safeRoom}-${Date.now()}.txt`
                                            a.click()
                                            URL.revokeObjectURL(a.href)
                                            addLog('EXPORT: chat saved')
                                        }}
                                    >
                                        <Download size={10} /> EXPORT CHAT
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Messages column */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div className="chat__messages">
                        {messages.map((msg, idx) => (
                            <div
                                key={msg.id}
                                className={`msg msg--${msg.type} ${shouldGroup(msg, messages[idx - 1]) ? 'msg--grouped' : ''}`}
                            >
                                {msg.type === 'system' ? (
                                    <div className="msg__bubble">
                                        <Shield size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                        {msg.text}
                                    </div>
                                ) : msg.isFile ? (
                                    <div className="msg__wrapper">
                                        <MediaMessage
                                            fileData={msg.fileData}
                                            isSent={msg.type === 'sent'}
                                            sessionId={ws.getStatus().deviceId}
                                            deviceHash=""
                                        />
                                        {/* Reaction bar for file messages */}
                                        {(msg.reactions && msg.reactions.length > 0) && (
                                            <div className="msg__reactions">
                                                {groupReactions(msg.reactions).map(r => (
                                                    <span
                                                        key={r.symbol}
                                                        className={`msg__reaction-badge ${r.mine ? 'msg__reaction-badge--mine' : ''}`}
                                                        onClick={() => handleReaction(msg, r.symbol)}
                                                    >
                                                        {r.symbol}{r.count > 1 ? ` ${r.count}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        {/* Action buttons for file messages */}
                                        <div className="msg__actions">
                                            <button className="msg__action-btn msg__action-btn--emoji" onClick={(e) => { e.stopPropagation(); setActiveReactionId(activeReactionId === msg.id ? null : msg.id) }} title="React">
                                                😊
                                            </button>
                                            <button className="msg__action-btn" onClick={() => handleReply(msg)} title="Reply">
                                                <CornerUpLeft size={11} />
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="msg__wrapper">
                                        {/* Reply quote */}
                                        {msg.replyTo && (
                                            <div className="msg__reply-quote">
                                                <span className="msg__reply-sender">{msg.replyTo.sender || 'Unknown'}</span>
                                                <span className="msg__reply-text">{msg.replyTo.text || '[file]'}</span>
                                            </div>
                                        )}
                                        <div className="msg__bubble">{linkifyText(msg.text)}</div>
                                        <div className="msg__time">
                                            {msg.type === 'received' && msg.sender && (
                                                <><User size={8} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />{msg.sender} · </>
                                            )}
                                            {msg.time}
                                            {msg.type === 'sent' && (
                                                <span className={`msg__delivery ${msg.read ? 'msg__delivery--read' : ''}`}>
                                                    {msg.read ? ' ✓✓' : msg.delivered ? ' ✓✓' : ' ✓'}
                                                </span>
                                            )}
                                            {disappearTimer > 0 && msg.createdAt && msg.type !== 'system' && (() => {
                                                const remaining = Math.max(0, Math.ceil((msg.createdAt + disappearTimer * 1000 - Date.now()) / 1000))
                                                return (
                                                    <span className={`msg__disappear-badge ${remaining < 10 ? 'msg__disappear-badge--urgent' : ''}`}>
                                                        <Timer size={7} /> {remaining}s
                                                    </span>
                                                )
                                            })()}
                                        </div>

                                        {/* Reactions display */}
                                        {(msg.reactions && msg.reactions.length > 0) && (
                                            <div className="msg__reactions">
                                                {groupReactions(msg.reactions).map(r => (
                                                    <span
                                                        key={r.symbol}
                                                        className={`msg__reaction-badge ${r.mine ? 'msg__reaction-badge--mine' : ''}`}
                                                        onClick={() => handleReaction(msg, r.symbol)}
                                                    >
                                                        {r.symbol}{r.count > 1 ? ` ${r.count}` : ''}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Hover actions: react + reply */}
                                        <div className="msg__actions">
                                            <button className="msg__action-btn msg__action-btn--emoji" onClick={(e) => { e.stopPropagation(); setActiveReactionId(activeReactionId === msg.id ? null : msg.id) }} title="React">
                                                😊
                                            </button>
                                            <button className="msg__action-btn" onClick={() => handleReply(msg)} title="Reply">
                                                <CornerUpLeft size={11} />
                                            </button>
                                        </div>

                                        {/* Reaction picker */}
                                        <AnimatePresence>
                                            {activeReactionId === msg.id && (
                                                <motion.div
                                                    className="msg__reaction-picker"
                                                    ref={reactionPickerRef}
                                                    initial={{ opacity: 0, scale: 0.8, y: 5 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.8, y: 5 }}
                                                    transition={{ duration: 0.15 }}
                                                >
                                                    {REACTIONS.map(r => (
                                                        <button
                                                            key={r.symbol}
                                                            className="msg__reaction-option"
                                                            onClick={() => handleReaction(msg, r.symbol)}
                                                            title={r.label}
                                                        >
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
                                    className="msg msg--typing"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    <div className="msg__bubble msg__bubble--typing">
                                        <span className="typing-dots">
                                            <span />
                                            <span />
                                            <span />
                                        </span>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input area */}
                    <div className="chat__input-area">
                        {!peerConnected && (
                            <div className="chat__input-hint" style={{ color: 'var(--gray-400)', marginBottom: 6 }}>
                                Peer disconnected — messages won't be delivered
                            </div>
                        )}

                        {/* Reply-to bar */}
                        <AnimatePresence>
                            {replyTo && (
                                <motion.div
                                    className="chat__reply-bar"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <div className="chat__reply-bar-inner">
                                        <CornerUpLeft size={12} />
                                        <div className="chat__reply-info">
                                            <span className="chat__reply-to-sender">
                                                {replyTo.type === 'sent' ? 'You' : (replyTo.sender || 'Peer')}
                                            </span>
                                            <span className="chat__reply-to-text">
                                                {replyTo.isFile ? '[File]' : (replyTo.text?.slice(0, 60) || '...')}
                                            </span>
                                        </div>
                                        <button className="chat__reply-close" onClick={() => setReplyTo(null)}>
                                            <X size={12} />
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="chat__input-wrapper">
                            <FileUploadButton
                                onFileReady={handleFileReady}
                                disabled={!peerConnected}
                                roomCode={roomCode}
                            />
                            <input
                                ref={inputRef}
                                type="text"
                                className="chat__input"
                                placeholder={peerConnected ? 'Type a message...' : 'Peer disconnected'}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                disabled={!peerConnected}
                                autoComplete="off"
                            />
                            <VoiceRecordButton
                                onFileReady={handleFileReady}
                                disabled={!peerConnected}
                                roomCode={roomCode}
                            />
                            <button
                                className={`chat__send ${input.trim() && peerConnected ? 'chat__send--active' : ''}`}
                                onClick={handleSend}
                                disabled={!input.trim() || !peerConnected}
                            >
                                <Send size={16} />
                            </button>
                        </div>
                        <div className="chat__input-hint">
                            <Lock size={8} /> ENTER TO SEND · {encrypted ? 'AES-256-GCM ENCRYPTED' : 'ENCRYPTING...'}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
