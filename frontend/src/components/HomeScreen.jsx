import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, LogIn, Shield, UserX, Zap, Fingerprint, ArrowRight, Loader, WifiOff } from 'lucide-react'
import DotGrid from './DotGrid'
import Orb from './Orb'

const TAGLINES = [
    'talk without a footprint',
    'where words leave no trace',
    'anonymous by default',
    'your identity stays yours',
    'conversations that vanish',
]

const pageVariants = {
    initial: { opacity: 0, y: 20, filter: 'blur(4px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    exit: { opacity: 0, y: -15, filter: 'blur(4px)' },
}

const stagger = {
    animate: { transition: { staggerChildren: 0.08 } },
}

const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
}

export default function HomeScreen({ onCreateRoom, onJoinRoom, wsConnected, wsError, creating }) {
    const homeRef = useRef(null)
    const [taglineIdx, setTaglineIdx] = useState(0)

    // Rotating taglines
    useEffect(() => {
        const interval = setInterval(() => {
            setTaglineIdx(prev => (prev + 1) % TAGLINES.length)
        }, 3500)
        return () => clearInterval(interval)
    }, [])

    // Cursor light
    useEffect(() => {
        const el = homeRef.current
        if (!el) return
        const move = (e) => {
            el.style.setProperty('--mx', `${e.clientX}px`)
            el.style.setProperty('--my', `${e.clientY}px`)
        }
        window.addEventListener('mousemove', move)
        return () => window.removeEventListener('mousemove', move)
    }, [])

    return (
        <motion.div className="home" ref={homeRef}
            variants={pageVariants}
            initial="initial" animate="animate" exit="exit"
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
            <div className="home__grid-bg" />
            <div className="home__radial" />
            <div className="home__cursor-light" />

            {/* Layer 2 - DotGrid Background (behind Orb) */}
            <div style={{
                position: 'absolute',
                inset: 0,
                zIndex: 0,
                opacity: 0.3,
                pointerEvents: 'auto',
            }}>
                <DotGrid
                    dotSize={3}
                    gap={28}
                    baseColor="#5227FF"
                    activeColor="#5227FF"
                    proximity={150}
                    speedTrigger={100}
                    shockRadius={250}
                    shockStrength={5}
                    maxSpeed={5000}
                    resistance={750}
                    returnDuration={1.5}
                />
            </div>

            {/* Layer 1 - Orb (topmost background layer, above DotGrid) */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '500px',
                height: '500px',
                zIndex: 2,
                opacity: 0.6,
                pointerEvents: 'none',
            }}>
                <Orb
                    hue={0}
                    hoverIntensity={0.3}
                    rotateOnHover={true}
                    forceHoverState={false}
                    backgroundColor="#000000"
                />
            </div>
            {/* Floating particles */}
            {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className={`home__float home__float--${i}`} />
            ))}

            {/* Corner system labels */}
            {[
                { pos: 'tl', text: 'SYS.ACTIVE' },
                { pos: 'tr', text: 'V1.0.0' },
                { pos: 'bl', text: 'PROTOCOL.READY' },
                { pos: 'br', text: 'ENCRYPTED' },
            ].map(({ pos, text }) => (
                <motion.span key={pos} className={`home__mark home__mark--${pos}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 1.4, duration: 0.8 }}
                >{text}</motion.span>
            ))}

            {/* Side text */}
            <span className="home__side-text home__side-text--left">SECURE COMMUNICATION LAYER</span>
            <span className="home__side-text home__side-text--right">NO LOGS . NO SERVERS . NO TRACE</span>

            <motion.div className="home__content" variants={stagger} initial="initial" animate="animate">
                {/* Connection error banner */}
                {wsError && (
                    <motion.div
                        className="home__error"
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                    >
                        <WifiOff size={14} strokeWidth={1.5} />
                        <span>{wsError}</span>
                    </motion.div>
                )}
                {/* Brand */}
                <motion.div className="home__brand" variants={fadeUp} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
                    <div className="home__logo-wrapper">
                        <span className="home__logo-accent">[</span>
                        <h1 className="home__logo">ADYX</h1>
                        <span className="home__logo-accent">]</span>
                    </div>
                    <p className="home__subtitle">anonymous communication protocol</p>
                </motion.div>

                <motion.div className="home__divider" variants={fadeUp} transition={{ duration: 0.6 }}>
                    <span className="home__divider-line" />
                    <span className="home__divider-dot" />
                    <span className="home__divider-line" />
                </motion.div>

                {/* Rotating tagline */}
                <div className="home__tagline-wrapper">
                    <AnimatePresence mode="wait">
                        <AnimatedTagline key={taglineIdx} text={TAGLINES[taglineIdx]} />
                    </AnimatePresence>
                </div>

                {/* Buttons */}
                <motion.div className="home__actions" variants={fadeUp} transition={{ duration: 0.8 }}>
                    <motion.button
                        className={`home__btn ${(!wsConnected || creating) ? 'home__btn--disabled' : ''}`}
                        onClick={onCreateRoom}
                        id="btn-create"
                        disabled={!wsConnected || creating}
                        whileHover={(!wsConnected || creating) ? {} : { y: -2 }}
                        whileTap={(!wsConnected || creating) ? {} : { scale: 0.98 }}
                    >
                        <span className="home__btn-text">
                            <span className="home__btn-icon">
                                {creating
                                    ? <Loader size={18} strokeWidth={1.5} className="home__btn-spinner" />
                                    : <Plus size={18} strokeWidth={1.5} />
                                }
                            </span>
                            <span className="home__btn-label">{creating ? 'Creating...' : 'Create Room'}</span>
                            <span className="home__btn-desc">
                                {!wsConnected
                                    ? 'cannot connect to server . waiting for connection'
                                    : 'Start a new private session. Share the generated code with anyone you want to talk to. No signup needed.'
                                }
                            </span>
                            <span className="home__btn-footer">
                                <span className="home__btn-tag">instant . private . anonymous</span>
                                <span className="home__btn-shortcut">C</span>
                            </span>
                        </span>
                        <span className="home__btn-fill" />
                    </motion.button>

                    <motion.button className="home__btn" onClick={onJoinRoom} id="btn-join"
                        whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                    >
                        <span className="home__btn-text">
                            <span className="home__btn-icon"><LogIn size={18} strokeWidth={1.5} /></span>
                            <span className="home__btn-label">Join Room</span>
                            <span className="home__btn-desc">
                                Enter a 6-character room code to connect instantly. Encrypted from the first message onward.
                            </span>
                            <span className="home__btn-footer">
                                <span className="home__btn-tag">enter code . connect . talk</span>
                                <span className="home__btn-shortcut">J</span>
                            </span>
                        </span>
                        <span className="home__btn-fill" />
                    </motion.button>
                </motion.div>

                {/* Features */}
                <motion.div className="home__features" variants={fadeUp} transition={{ duration: 0.8 }}>
                    <Feature icon={<Shield size={14} strokeWidth={1.5} />} title="Zero Trace" sub="Nothing stored. Ever." />
                    <div className="home__feature-sep" />
                    <Feature icon={<UserX size={14} strokeWidth={1.5} />} title="No Login" sub="No email. No password." />
                    <div className="home__feature-sep" />
                    <Feature icon={<Zap size={14} strokeWidth={1.5} />} title="Peer to Peer" sub="Direct. No middleman." />
                </motion.div>

                {/* Stats  */}
                <motion.div className="home__stats" variants={fadeUp} transition={{ duration: 0.8 }}>
                    <div className="home__stat">
                        <span className="home__stat-value">0</span>
                        <span className="home__stat-label">data stored</span>
                    </div>
                    <div className="home__stat-sep" />
                    <div className="home__stat">
                        <span className="home__stat-value">256</span>
                        <span className="home__stat-label">bit encryption</span>
                    </div>
                    <div className="home__stat-sep" />
                    <div className="home__stat">
                        <span className="home__stat-value">&lt;1s</span>
                        <span className="home__stat-label">connect time</span>
                    </div>
                </motion.div>

                {/* Watermark */}
                <motion.div className="home__watermark"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 1.8, duration: 1 }}
                >
                    <Fingerprint size={10} strokeWidth={1} />
                    <span>built for those who value privacy</span>
                </motion.div>
            </motion.div>
        </motion.div>
    )
}

function Feature({ icon, title, sub }) {
    return (
        <div className="home__feature">
            <span className="home__feature-icon">{icon}</span>
            <div>
                <span className="home__feature-title">{title}</span>
                <span className="home__feature-sub">{sub}</span>
            </div>
        </div>
    )
}

function AnimatedTagline({ text }) {
    return (
        <motion.p className="home__tagline"
            key={text}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >{text}</motion.p>
    )
}
