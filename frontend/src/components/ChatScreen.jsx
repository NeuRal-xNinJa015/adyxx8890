import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Shield, Lock, Zap, WifiOff, CornerUpLeft, X, LogOut, Hash, Globe, Eye, EyeOff, Clock, CheckCheck, Check, MessageSquare } from 'lucide-react'
import * as ws from '../lib/ws'
import FileUploadButton from './FileUploadButton.jsx'
import VoiceRecordButton from './VoiceRecordButton.jsx'
import MediaMessage from './MediaMessage.jsx'

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
    const [inputFocused, setInputFocused] = useState(false)
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

    const addSystemMessage = useCallback((text, variant = 'info') => {
        setMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            type: 'system',
            text,
            variant,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        }])
    }, [])

    useEffect(() => {
        if (activeReactionId === null) return
        const handleClickOutside = (e) => {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target)) {
                setActiveReactionId(null)
            }
        }
        const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 100)
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClickOutside) }
    }, [activeReactionId])

    useEffect(() => {
        addSystemMessage('Secure tunnel established', 'success')

        const offMessage = ws.on('message', (msg) => {
            setMessages(prev => [...prev, {
                id: Date.now() + Math.random(),
                messageId: msg.messageId,
                type: 'received',
                text: msg.payload,
                sender: msg.deviceId?.slice(0, 8) || 'Anon',
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
                    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') audioCtxRef.current = new AudioContext()
                    const ctx = audioCtxRef.current
                    if (ctx.state === 'suspended') ctx.resume()
                    const osc = ctx.createOscillator()
                    const gain = ctx.createGain()
                    osc.connect(gain); gain.connect(ctx.destination)
                    osc.frequency.value = 800; gain.gain.value = 0.1
                    osc.start(); osc.stop(ctx.currentTime + 0.08)
                } catch { }
            }
        })

        const offMessage2 = ws.on('message', () => {
            setMessages(prev => prev.length > MAX_MESSAGES ? prev.slice(prev.length - MAX_MESSAGES) : prev)
        })

        const offAck = ws.on('ack', (msg) => {
            if (msg.status === 'delivered') {
                setMessages(prev => prev.map(m => m.messageId === msg.messageId ? { ...m, delivered: true } : m))
            }
        })

        const offPeerLeft = ws.on('peer_left', () => {
            setPeerConnected(false); setPeerTyping(false)
            addSystemMessage('Peer disconnected from the tunnel', 'warn')
        })

        const offDisconnected = ws.on('disconnected', () => {
            setWsConnected(false)
            addSystemMessage('Connection lost — reconnecting...', 'error')
        })

        const offConnected = ws.on('connected', () => setWsConnected(true))

        const offEncReady = ws.on('encryption_ready', () => {
            setEncrypted(true)
            addSystemMessage('End-to-end encryption active — AES-256-GCM', 'success')
        })

        const offTyping = ws.on('typing', () => {
            setPeerTyping(true); setPeerLastSeen(Date.now())
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => setPeerTyping(false), 3000)
        })

        const offReaction = ws.on('reaction', (msg) => {
            setMessages(prev => prev.map(m => {
                if (m.messageId === msg.messageId) {
                    const existing = m.reactions || []
                    const alreadyIdx = existing.findIndex(r => r.from === msg.from && r.symbol === msg.reaction)
                    if (alreadyIdx !== -1) return { ...m, reactions: existing.filter((_, i) => i !== alreadyIdx) }
                    return { ...m, reactions: [...existing, { symbol: msg.reaction, from: msg.from }] }
                }
                return m
            }))
        })

        const offFileKeyMsg = ws.on('message', (msg) => {
            if (!msg.payload) return
            try {
                const parsed = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : null
                if (parsed && parsed.type === 'file_key') fileKeysRef.current.set(parsed.fileId, parsed.keyBase64)
            } catch (_) { }
        })

        const offFileReady = ws.on('file_ready', async (msg) => {
            addSystemMessage('Encrypted file received', 'info')
            try {
                const chunks = await ws.requestFile(msg.fileId, roomCode, msg.totalChunks)
                const keyBase64 = fileKeysRef.current.get(msg.fileId)
                setMessages(prev => [...prev, {
                    id: Date.now() + Math.random(), type: 'received', isFile: true,
                    fileData: {
                        fileId: msg.fileId, chunks, totalChunks: msg.totalChunks,
                        iv: msg.iv, hash: msg.hash, keyBase64: keyBase64 || '',
                        encryptedMetadata: msg.encryptedMetadata, thumbnail: msg.thumbnail,
                        ephemeral: msg.ephemeral, displayCategory: msg.displayCategory,
                    },
                    sender: msg.deviceId?.slice(0, 8) || 'Anon', encrypted: true,
                    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                    reactions: []
                }])
            } catch (err) { console.error('[Chat] File download failed:', err) }
        })

        const offFileDeleted = ws.on('file_deleted', () => { })

        const offReadReceipt = ws.on('read_receipt', (msg) => {
            if (Array.isArray(msg.messageIds)) {
                setMessages(prev => prev.map(m => (m.type === 'sent' && msg.messageIds.includes(m.messageId)) ? { ...m, read: true } : m))
            }
        })

        return () => {
            offMessage(); offMessage2(); offAck(); offPeerLeft(); offDisconnected(); offConnected(); offEncReady(); offTyping()
            offReaction(); offReadReceipt(); offFileKeyMsg(); offFileReady(); offFileDeleted()
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        }
    }, [roomCode, isCreator, addSystemMessage])

    useEffect(() => { const t = setInterval(() => setElapsed(prev => prev + 1), 1000); return () => clearInterval(t) }, [])
    useEffect(() => { return () => { if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close().catch(() => { }); if (readReceiptTimerRef.current) clearTimeout(readReceiptTimerRef.current) } }, [])
    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, peerTyping])
    useEffect(() => { inputRef.current?.focus() }, [])

    const flushReadReceipts = useCallback(() => {
        const ids = Array.from(pendingReadIdsRef.current)
        if (ids.length === 0) return
        pendingReadIdsRef.current.clear()
        ws.sendReadReceipt(ids, roomCode)
        setMessages(prev => prev.map(m => ids.includes(m.messageId) ? { ...m, readSent: true } : m))
    }, [roomCode])

    useEffect(() => {
        if (document.hidden) return
        const unreadIds = messages.filter(m => m.type === 'received' && m.messageId && !m.readSent).map(m => m.messageId)
        if (unreadIds.length === 0) return
        unreadIds.forEach(id => pendingReadIdsRef.current.add(id))
        if (readReceiptTimerRef.current) clearTimeout(readReceiptTimerRef.current)
        readReceiptTimerRef.current = setTimeout(flushReadReceipts, 500)
    }, [messages, flushReadReceipts])

    useEffect(() => {
        const h = () => { if (!document.hidden) { const ids = messages.filter(m => m.type === 'received' && m.messageId && !m.readSent).map(m => m.messageId); if (ids.length > 0) { ids.forEach(id => pendingReadIdsRef.current.add(id)); flushReadReceipts() } } }
        document.addEventListener('visibilitychange', h); return () => document.removeEventListener('visibilitychange', h)
    }, [messages, flushReadReceipts])

    useEffect(() => { document.title = unreadCount > 0 ? `(${unreadCount}) ADYX` : 'ADYX'; return () => { document.title = 'ADYX \u2014 Anonymous Communication' } }, [unreadCount])
    useEffect(() => { const h = () => setUnreadCount(0); window.addEventListener('focus', h); return () => window.removeEventListener('focus', h) }, [])
    useEffect(() => { if (!('Notification' in window)) return; if (Notification.permission === 'default') Notification.requestPermission() }, [])

    const handleSend = async () => {
        const text = input.trim()
        if (!text || sendingRef.current) return
        sendingRef.current = true
        const msgId = crypto.randomUUID().split('-')[0]
        const replyData = replyTo ? { id: replyTo.messageId || replyTo.id, text: replyTo.text?.slice(0, 80), sender: replyTo.sender || (replyTo.type === 'sent' ? 'You' : 'Anon') } : null
        setMessages(prev => {
            const next = [...prev, { id: Date.now() + Math.random(), messageId: msgId, type: 'sent', text, delivered: false, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), replyTo: replyData, reactions: [], createdAt: Date.now() }]
            return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next
        })
        setInput(''); setReplyTo(null)
        try { await ws.sendMessage(text, roomCode, msgId) } catch (err) { console.error('[Chat] Send failed:', err) } finally { sendingRef.current = false }
    }

    const handleFileReady = useCallback(async (fileData) => {
        try {
            fileKeysRef.current.set(fileData.fileId, fileData.keyBase64)
            setMessages(prev => [...prev, { id: Date.now() + Math.random(), type: 'sent', isFile: true, fileData, delivered: false, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), reactions: [] }])
            await ws.sendFile(fileData, roomCode)
            setMessages(prev => prev.map(m => m.fileData?.fileId === fileData.fileId ? { ...m, delivered: true } : m))
        } catch (err) { console.error('[Chat] File send failed:', err) }
    }, [roomCode])

    const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }; if (e.key === 'Escape' && replyTo) setReplyTo(null) }
    const handleInputChange = (e) => { setInput(e.target.value); const now = Date.now(); if (now - lastTypingSentRef.current > 2000) { ws.sendTyping(roomCode); lastTypingSentRef.current = now } }

    const handleReaction = (msg, symbol) => {
        const msgId = msg.messageId; if (!msgId) return
        setMessages(prev => prev.map(m => {
            if (m.messageId === msgId) { const existing = m.reactions || []; const idx = existing.findIndex(r => r.from === 'me' && r.symbol === symbol); if (idx !== -1) return { ...m, reactions: existing.filter((_, i) => i !== idx) }; return { ...m, reactions: [...existing, { symbol, from: 'me' }] } }
            return m
        }))
        ws.sendReaction(msgId, symbol, roomCode); setActiveReactionId(null)
    }

    const handleReply = (msg) => { setReplyTo(msg); setActiveReactionId(null); inputRef.current?.focus() }

    const linkifyText = (text) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g; const parts = text.split(urlRegex); const urls = text.match(urlRegex) || []; const urlSet = new Set(urls)
        return parts.map((part, i) => urlSet.has(part) ? <a key={`l-${i}`} href={part} target="_blank" rel="noopener noreferrer" className="ax__link">{part}</a> : part)
    }

    const formatElapsed = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60; return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` }
    const shouldGroup = (msg, prevMsg) => { if (!prevMsg) return false; if (msg.type !== prevMsg.type) return false; if (msg.type === 'system') return false; return msg.time === prevMsg.time }
    const groupReactions = (reactions) => { if (!reactions || reactions.length === 0) return []; const map = {}; reactions.forEach(r => { if (!map[r.symbol]) map[r.symbol] = { symbol: r.symbol, count: 0, mine: false }; map[r.symbol].count++; if (r.from === 'me') map[r.symbol].mine = true }); return Object.values(map) }

    const peerStatus = !peerConnected ? 'offline' : peerTyping ? 'typing' : 'online'

    return (
        <motion.div className="ax" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>

            {/* ── Connection Banner ── */}
            <AnimatePresence>
                {!wsConnected && (
                    <motion.div className="ax__banner ax__banner--error" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                        <WifiOff size={14} /> <span>Connection lost — attempting to reconnect...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Header — GitHub-style top bar ── */}
            <header className="ax__header">
                <div className="ax__header-left">
                    <div className="ax__channel">
                        <MessageSquare size={16} className="ax__channel-ico" />
                        <span className="ax__channel-name">{roomCode.toUpperCase()}</span>
                    </div>
                    <div className="ax__header-divider" />
                    <div className="ax__badges">
                        <span className="ax__label ax__label--muted">
                            <Lock size={11} /> E2E
                        </span>
                        <span className={`ax__label ${encrypted ? 'ax__label--green' : 'ax__label--yellow'}`}>
                            <Zap size={11} /> {encrypted ? 'AES-256' : 'Handshake...'}
                        </span>
                    </div>
                </div>
                <div className="ax__header-right">
                    <div className={`ax__presence ax__presence--${peerStatus}`}>
                        <span className="ax__presence-dot" />
                        <span className="ax__presence-text">
                            {peerStatus === 'offline' ? 'Offline' : peerStatus === 'typing' ? 'Typing...' : 'Online'}
                        </span>
                    </div>
                    <span className="ax__timer-badge">
                        <Clock size={12} />
                        {formatElapsed(elapsed)}
                    </span>
                    <button className="ax__btn ax__btn--danger" onClick={onEndSession} title="End Session">
                        <LogOut size={14} />
                        <span className="ax__btn-label">End</span>
                    </button>
                </div>
            </header>

            {/* ── Messages ── */}
            <main className="ax__messages" id="ax-messages">

                {/* Welcome */}
                <div className="ax__welcome-card">
                    <div className="ax__welcome-header">
                        <div className="ax__welcome-icon-wrap">
                            <Shield size={20} />
                        </div>
                        <div>
                            <h2 className="ax__welcome-title">#{roomCode.toUpperCase()}</h2>
                            <p className="ax__welcome-sub">Encrypted ephemeral channel</p>
                        </div>
                    </div>
                    <p className="ax__welcome-desc">
                        Messages are end-to-end encrypted and will be permanently deleted when the session ends. No data is stored on our servers.
                    </p>
                    <div className="ax__welcome-tags">
                        <span className="ax__tag"><Lock size={10} /> Zero-knowledge</span>
                        <span className="ax__tag"><Shield size={10} /> E2E encrypted</span>
                        <span className="ax__tag"><Zap size={10} /> Ephemeral</span>
                    </div>
                </div>

                {messages.map((msg, idx) => (
                    <div key={msg.id}>
                        {msg.type === 'system' ? (
                            <motion.div
                                className={`ax__sys ax__sys--${msg.variant || 'info'}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <div className="ax__sys-icon">
                                    {msg.variant === 'success' ? <Check size={12} /> : msg.variant === 'warn' ? <Eye size={12} /> : msg.variant === 'error' ? <X size={12} /> : <Globe size={12} />}
                                </div>
                                <span className="ax__sys-text">{msg.text}</span>
                                <span className="ax__sys-time">{msg.time}</span>
                            </motion.div>
                        ) : (
                            <motion.div
                                className={`ax__msg ${shouldGroup(msg, messages[idx - 1]) ? 'ax__msg--grouped' : ''}`}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                {/* Avatar */}
                                {!shouldGroup(msg, messages[idx - 1]) && (
                                    <div className={`ax__avatar ${msg.type === 'sent' ? 'ax__avatar--you' : 'ax__avatar--peer'}`}>
                                        {msg.type === 'sent' ? 'Y' : 'P'}
                                    </div>
                                )}

                                <div className="ax__msg-body">
                                    {/* Header */}
                                    {!shouldGroup(msg, messages[idx - 1]) && (
                                        <div className="ax__msg-head">
                                            <span className={`ax__msg-author ${msg.type === 'sent' ? 'ax__msg-author--you' : ''}`}>
                                                {msg.type === 'sent' ? 'You' : (msg.sender || 'Anon')}
                                            </span>
                                            <span className="ax__msg-ts">{msg.time}</span>
                                            {msg.encrypted && <Lock size={10} className="ax__msg-enc" />}
                                        </div>
                                    )}

                                    {/* Reply */}
                                    {msg.replyTo && (
                                        <div className="ax__reply-quote">
                                            <div className="ax__reply-bar" />
                                            <div className="ax__reply-content">
                                                <span className="ax__reply-who">{msg.replyTo.sender || '?'}</span>
                                                <span className="ax__reply-what">{msg.replyTo.text || '[file]'}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Content */}
                                    {msg.isFile ? (
                                        <MediaMessage fileData={msg.fileData} isSent={msg.type === 'sent'} sessionId={ws.getStatus().deviceId} deviceHash="" />
                                    ) : (
                                        <div className="ax__msg-text">{linkifyText(msg.text)}</div>
                                    )}

                                    {/* Delivery */}
                                    {msg.type === 'sent' && (
                                        <span className={`ax__delivery ${msg.read ? 'ax__delivery--read' : msg.delivered ? 'ax__delivery--ok' : ''}`}>
                                            {msg.read ? <><CheckCheck size={13} /> Read</> : msg.delivered ? <><CheckCheck size={13} /> Delivered</> : <><Check size={13} /> Sent</>}
                                        </span>
                                    )}

                                    {/* Reactions */}
                                    {msg.reactions && msg.reactions.length > 0 && (
                                        <div className="ax__reactions">
                                            {groupReactions(msg.reactions).map(r => (
                                                <button key={r.symbol} className={`ax__rxn ${r.mine ? 'ax__rxn--mine' : ''}`} onClick={() => handleReaction(msg, r.symbol)}>
                                                    {r.symbol}{r.count > 1 && <span className="ax__rxn-count">{r.count}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Hover Actions */}
                                <div className="ax__actions">
                                    <button onClick={(e) => { e.stopPropagation(); setActiveReactionId(activeReactionId === msg.id ? null : msg.id) }} title="Add reaction">😊</button>
                                    <button onClick={() => handleReply(msg)} title="Reply"><CornerUpLeft size={14} /></button>
                                </div>

                                {/* Reaction Picker */}
                                <AnimatePresence>
                                    {activeReactionId === msg.id && (
                                        <motion.div className="ax__picker" ref={reactionPickerRef} initial={{ opacity: 0, scale: 0.9, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 6 }} transition={{ duration: 0.12 }}>
                                            {REACTIONS.map(r => (
                                                <button key={r.symbol} onClick={() => handleReaction(msg, r.symbol)} title={r.label}>{r.symbol}</button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        )}
                    </div>
                ))}

                {/* Typing */}
                <AnimatePresence>
                    {peerTyping && (
                        <motion.div className="ax__typing" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                            <div className="ax__avatar ax__avatar--peer ax__avatar--sm">P</div>
                            <div className="ax__typing-dots">
                                <span /><span /><span />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </main>

            {/* ── Input ── */}
            <footer className="ax__footer">
                {!peerConnected && (
                    <div className="ax__flash ax__flash--warn">
                        <EyeOff size={13} />
                        Peer is offline — messages won't be delivered
                    </div>
                )}

                <AnimatePresence>
                    {replyTo && (
                        <motion.div className="ax__reply-strip" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }}>
                            <CornerUpLeft size={13} className="ax__reply-strip-ico" />
                            <span className="ax__reply-strip-who">{replyTo.type === 'sent' ? 'You' : (replyTo.sender || 'Anon')}</span>
                            <span className="ax__reply-strip-what">{replyTo.isFile ? '[File]' : (replyTo.text?.slice(0, 60) || '...')}</span>
                            <button className="ax__reply-strip-x" onClick={() => setReplyTo(null)}><X size={14} /></button>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className={`ax__composer ${inputFocused ? 'ax__composer--focus' : ''}`}>
                    <FileUploadButton onFileReady={handleFileReady} disabled={!peerConnected} roomCode={roomCode} />
                    <input
                        ref={inputRef}
                        className="ax__input"
                        type="text"
                        placeholder={peerConnected ? `Message #${roomCode.toUpperCase()}...` : 'Peer is offline...'}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setInputFocused(true)}
                        onBlur={() => setInputFocused(false)}
                        disabled={!peerConnected}
                        autoComplete="off"
                    />
                    <VoiceRecordButton onFileReady={handleFileReady} disabled={!peerConnected} roomCode={roomCode} />
                    <motion.button
                        className={`ax__send-btn ${input.trim() && peerConnected ? 'ax__send-btn--ready' : ''}`}
                        onClick={handleSend}
                        disabled={!input.trim() || !peerConnected}
                        whileTap={{ scale: 0.92 }}
                    >
                        <Send size={16} />
                    </motion.button>
                </div>

                <div className="ax__footer-meta">
                    <Lock size={9} />
                    <span>{encrypted ? 'End-to-end encrypted · AES-256-GCM' : 'Establishing encryption...'}</span>
                </div>
            </footer>
        </motion.div>
    )
}
