import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

export default function SplashScreen({ onDone }) {
    const [phase, setPhase] = useState(0)
    const canvasRef = useRef(null)

    // Particle network canvas
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        let animId
        const particles = []
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
        resize()
        window.addEventListener('resize', resize)

        for (let i = 0; i < 40; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                size: Math.random() * 1.5 + 0.3,
                opacity: Math.random() * 0.25 + 0.05,
            })
        }

        const maxDistSq = 130 * 130
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            // Batch connections by alpha level for fewer state changes
            ctx.lineWidth = 0.5
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x
                    const dy = particles[i].y - particles[j].y
                    const dsq = dx * dx + dy * dy
                    if (dsq < maxDistSq) {
                        const dist = Math.sqrt(dsq)
                        const alpha = 0.035 * (1 - dist / 130)
                        ctx.beginPath()
                        ctx.strokeStyle = `rgba(255,255,255,${alpha})`
                        ctx.moveTo(particles[i].x, particles[i].y)
                        ctx.lineTo(particles[j].x, particles[j].y)
                        ctx.stroke()
                    }
                }
            }
            particles.forEach(p => {
                p.x += p.vx; p.y += p.vy
                if (p.x < 0 || p.x > canvas.width) p.vx *= -1
                if (p.y < 0 || p.y > canvas.height) p.vy *= -1
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
                ctx.fillStyle = `rgba(255,255,255,${p.opacity})`
                ctx.fill()
            })
            animId = requestAnimationFrame(draw)
        }
        draw()
        return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize) }
    }, [])

    // Phase timing — fast 2.5s total
    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 200)
        const t2 = setTimeout(() => setPhase(2), 800)
        const t3 = setTimeout(() => setPhase(3), 1800)
        const t4 = setTimeout(onDone, 2500)
        return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
    }, [onDone])

    const letters = 'ADYX'.split('')

    return (
        <motion.div
            className="splash"
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            onClick={onDone}
            style={{ cursor: 'pointer' }}
        >
            <canvas ref={canvasRef} className="splash__canvas" />
            <div className="splash__scanlines" />
            <div className="splash__vignette" />

            {/* Pulsing rings */}
            <div className="splash__rings">
                {[0, 1, 2].map(i => (
                    <div key={i} className="splash__ring" style={{ animationDelay: `${i * 0.7}s` }} />
                ))}
            </div>

            {/* Corner brackets */}
            <motion.div className="splash__corner splash__corner--tl"
                initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 0.3, duration: 0.6 }} />
            <motion.div className="splash__corner splash__corner--tr"
                initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 0.4, duration: 0.6 }} />
            <motion.div className="splash__corner splash__corner--bl"
                initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 0.5, duration: 0.6 }} />
            <motion.div className="splash__corner splash__corner--br"
                initial={{ opacity: 0 }} animate={{ opacity: 0.4 }} transition={{ delay: 0.6, duration: 0.6 }} />

            {/* Corner labels */}
            {['SYS.BOOT', 'PROTO.V1', 'CIPHER.INIT', 'NULL.TRACE'].map((text, i) => (
                <motion.span key={text}
                    className={`splash__meta splash__meta--${['tl', 'tr', 'bl', 'br'][i]}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 + i * 0.1, duration: 0.5 }}
                >{text}</motion.span>
            ))}

            <div className="splash__content">
                {/* Pre-title */}
                <motion.div className="splash__preline"
                    initial={{ opacity: 0, width: 0 }}
                    animate={phase >= 1 ? { opacity: 1, width: 'auto' } : {}}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                >
                    <span className="splash__preline-dash" />
                    <span className="splash__preline-text">initializing secure protocol</span>
                    <span className="splash__preline-dash" />
                </motion.div>

                {/* ADYX */}
                <h1 className="splash__title">
                    {letters.map((letter, i) => (
                        <motion.span key={i} className="splash__letter"
                            initial={{ opacity: 0, y: 60, scaleY: 0.5, filter: 'blur(8px)' }}
                            animate={phase >= 1 ? { opacity: 1, y: 0, scaleY: 1, filter: 'blur(0px)' } : {}}
                            transition={{ delay: 0.15 + i * 0.12, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                        >{letter}</motion.span>
                    ))}
                </h1>

                {/* Animated underline */}
                <motion.div className="splash__underline"
                    initial={{ width: 0 }}
                    animate={phase >= 1 ? { width: 100 } : {}}
                    transition={{ delay: 0.8, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                />

                {/* Tagline */}
                <motion.p className="splash__tagline"
                    initial={{ opacity: 0, y: 12 }}
                    animate={phase >= 2 ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >no trace . no login . just talk</motion.p>

                {/* Secondary line */}
                <motion.p className="splash__sub"
                    initial={{ opacity: 0, y: 8 }}
                    animate={phase >= 2 ? { opacity: 0.5, y: 0 } : {}}
                    transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >where conversations disappear</motion.p>

                {/* Loader */}
                <motion.div className="splash__loader"
                    initial={{ opacity: 0 }}
                    animate={phase >= 2 ? { opacity: 1 } : {}}
                    transition={{ duration: 0.4 }}
                >
                    <motion.div className="splash__loader-bar"
                        initial={{ width: '0%' }}
                        animate={phase >= 2 ? { width: '100%' } : {}}
                        transition={{ delay: 0.3, duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
                    />
                </motion.div>
            </div>
        </motion.div>
    )
}
