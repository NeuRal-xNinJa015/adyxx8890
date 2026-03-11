import { useState, useCallback, useEffect, useRef, lazy, Suspense, Component } from 'react'
import { AnimatePresence } from 'framer-motion'
import SplashScreen from './components/SplashScreen'
import HomeScreen from './components/HomeScreen'
const JoinRoom = lazy(() => import('./components/JoinRoom'))
const WaitingRoom = lazy(() => import('./components/WaitingRoom'))
const ChatScreen = lazy(() => import('./components/ChatScreen'))
const ExamModeOverlay = lazy(() => import('./components/ExamModeOverlay'))
const SplashCursor = lazy(() => import('./components/SplashCursor'))
import * as ws from './lib/ws'

// ── Error Boundary ──
class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error }
    }
    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info)
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', flexDirection: 'column', gap: 16,
                    background: '#000', color: '#fff', fontFamily: 'monospace', padding: 40
                }}>
                    <h2 style={{ letterSpacing: '0.15em', fontSize: 18 }}>[ SYSTEM ERROR ]</h2>
                    <p style={{ color: '#666', fontSize: 12, maxWidth: 400, textAlign: 'center' }}>
                        {this.state.error?.message || 'Something went wrong'}
                    </p>
                    <button
                        onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
                        style={{
                            padding: '10px 28px', background: '#fff', color: '#000', border: 'none',
                            fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.15em',
                            textTransform: 'uppercase', cursor: 'pointer', marginTop: 12
                        }}
                    >
                        Reset Application
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

export default function App() {
    const [screen, setScreen] = useState('splash')
    const [roomCode, setRoomCode] = useState('')
    const [isCreator, setIsCreator] = useState(false)
    const [wsConnected, setWsConnected] = useState(false)
    const [wsError, setWsError] = useState(null)
    const [creating, setCreating] = useState(false)
    const [joining, setJoining] = useState(false)
    const cleanupRef = useRef([])
    const errorTimerRef = useRef(null)

    // Auto-clear errors after 5 seconds
    useEffect(() => {
        if (wsError) {
            if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
            errorTimerRef.current = setTimeout(() => setWsError(null), 5000)
        }
        return () => { if (errorTimerRef.current) clearTimeout(errorTimerRef.current) }
    }, [wsError])

    // Connect to WebSocket when splash finishes
    const handleSplashDone = useCallback(() => {
        setScreen('home')
        ws.connect()
            .then(() => {
                setWsConnected(true)
                setWsError(null)
                console.log('[App] WebSocket connected')
            })
            .catch((err) => {
                console.error('[App] WebSocket connection failed:', err)
                setWsError('Cannot connect to server. Retrying...')
                setWsConnected(false)
            })
    }, [])

    // Listen for WebSocket events
    useEffect(() => {
        const off1 = ws.on('disconnected', () => {
            setWsConnected(false)
        })
        const off2 = ws.on('connected', () => {
            setWsConnected(true)
            setWsError(null)
        })
        // When the peer ends the session, redirect to home
        const off3 = ws.on('session_ended', () => {
            console.log('[App] Peer ended session — returning to home')
            setScreen('home')
            setRoomCode('')
            setIsCreator(false)
            setWsError(null)
            setCreating(false)
            setJoining(false)
            try { sessionStorage.clear() } catch (e) { /* ignore */ }
            // Reconnect with fresh identity
            ws.disconnect()
            setTimeout(() => {
                ws.connect()
                    .then(() => setWsConnected(true))
                    .catch(() => setWsConnected(false))
            }, 100)
        })
        cleanupRef.current = [off1, off2, off3]
        return () => {
            cleanupRef.current.forEach(fn => fn())
            ws.destroy()  // full teardown on unmount
        }
    }, [])

    const handleCreateRoom = useCallback(() => {
        if (!wsConnected) {
            setWsError('Not connected to server')
            return
        }
        if (creating) return

        setCreating(true)
        setWsError(null)

        ws.createRoomAsync()
            .then((msg) => {
                setRoomCode(msg.roomCode)
                setIsCreator(true)
                setScreen('waiting')
            })
            .catch((err) => {
                console.error('[App] Create room failed:', err)
                setWsError(err.message || 'Failed to create room')
            })
            .finally(() => {
                setCreating(false)
            })
    }, [wsConnected, creating])

    const handleJoinRoom = useCallback(() => setScreen('join'), [])

    const handleJoinSubmit = useCallback((code) => {
        if (!wsConnected) {
            setWsError('Not connected to server')
            return
        }
        if (joining) return

        setJoining(true)
        setWsError(null)

        ws.joinRoomAsync(code.toLowerCase())
            .then((msg) => {
                setRoomCode(msg.roomCode)
                setIsCreator(false)
                setScreen('chat')
            })
            .catch((err) => {
                console.error('[App] Join room failed:', err)
                setWsError(err.message || 'Failed to join room')
            })
            .finally(() => {
                setJoining(false)
            })
    }, [wsConnected, joining])

    const handlePeerJoined = useCallback(() => setScreen('chat'), [])

    // When WaitingRoom auto-regenerates a room after 30s
    const handleRoomRegenerated = useCallback((newCode) => {
        setRoomCode(newCode)
        console.log('[App] Room regenerated:', newCode)
    }, [])

    const handleBack = useCallback(() => {
        setRoomCode('')
        setWsError(null)
        setCreating(false)
        setJoining(false)
        setScreen('home')
    }, [])

    const handleEndSession = useCallback(() => {
        ws.endSession(roomCode)

        setScreen('home')
        setRoomCode('')
        setIsCreator(false)
        setWsError(null)
        setCreating(false)
        setJoining(false)

        try { sessionStorage.clear() } catch (e) { /* ignore */ }

        ws.disconnect()
        setTimeout(() => {
            ws.connect()
                .then(() => {
                    setWsConnected(true)
                    console.log('[App] Fresh session started — all data cleared')
                })
                .catch(() => setWsConnected(false))
        }, 100)
    }, [roomCode])

    // Keyboard shortcuts — guarded against creating/joining
    useEffect(() => {
        const handleKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
            if (screen === 'home' && !creating && !joining) {
                if (e.key === 'c' || e.key === 'C') handleCreateRoom()
                if (e.key === 'j' || e.key === 'J') handleJoinRoom()
            }
            if (e.key === 'Escape') {
                if (screen === 'join' || screen === 'waiting') handleBack()
            }
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [screen, creating, joining, handleCreateRoom, handleJoinRoom, handleBack])

    return (
        <ErrorBoundary>
            <Suspense fallback={null}>
                {/* WebGL Fluid Cursor Effect — only on splash/home for performance */}
                {(screen === 'splash' || screen === 'home') && (
                    <SplashCursor
                        DENSITY_DISSIPATION={4}
                        VELOCITY_DISSIPATION={2.5}
                        SPLAT_FORCE={5000}
                        SPLAT_RADIUS={0.15}
                        CURL={4}
                        COLOR_UPDATE_SPEED={8}
                        BACK_COLOR={{ r: 0, g: 0, b: 0 }}
                        TRANSPARENT={true}
                    />
                )}

                <AnimatePresence mode="wait">
                    {screen === 'splash' && <SplashScreen key="splash" onDone={handleSplashDone} />}
                    {screen === 'home' && (
                        <HomeScreen
                            key="home"
                            onCreateRoom={handleCreateRoom}
                            onJoinRoom={handleJoinRoom}
                            wsConnected={wsConnected}
                            wsError={wsError}
                            creating={creating}
                        />
                    )}
                    {screen === 'join' && (
                        <JoinRoom
                            key="join"
                            onSubmit={handleJoinSubmit}
                            onBack={handleBack}
                            wsError={wsError}
                            joining={joining}
                        />
                    )}
                    {screen === 'waiting' && (
                        <WaitingRoom
                            key="waiting"
                            roomCode={roomCode}
                            onPeerJoined={handlePeerJoined}
                            onBack={handleBack}
                            onRoomRegenerated={handleRoomRegenerated}
                        />
                    )}
                    {screen === 'chat' && (
                        <ExamModeOverlay key="chat-exam" onForceEnd={handleEndSession}>
                            <ChatScreen
                                roomCode={roomCode}
                                isCreator={isCreator}
                                onEndSession={handleEndSession}
                            />
                        </ExamModeOverlay>
                    )}
                </AnimatePresence>
            </Suspense>
        </ErrorBoundary>
    )
}
