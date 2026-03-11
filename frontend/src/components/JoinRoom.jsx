import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Hash, Loader, ScanLine } from 'lucide-react'

const QRScanner = lazy(() => import('./QRScanner'))

export default function JoinRoom({ onSubmit, onBack, wsError, joining }) {
    const [chars, setChars] = useState(['', '', '', '', '', ''])
    const [error, setError] = useState('')
    const [showScanner, setShowScanner] = useState(false)
    const inputRefs = useRef([])

    useEffect(() => {
        inputRefs.current[0]?.focus()
    }, [])

    useEffect(() => {
        if (wsError) setError(wsError)
    }, [wsError])

    const handleChange = (index, value) => {
        if (joining) return
        if (!/^[a-zA-Z0-9]?$/.test(value)) return

        const newChars = [...chars]
        newChars[index] = value.toUpperCase()
        setChars(newChars)
        setError('')

        // Auto-focus next
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus()
        }

        // Auto-submit when all filled
        if (value && index === 5) {
            const code = newChars.join('')
            if (code.length === 6) {
                onSubmit(code)
            }
        }
    }

    const handleKeyDown = (index, e) => {
        if (joining) return
        if (e.key === 'Backspace' && !chars[index] && index > 0) {
            inputRefs.current[index - 1]?.focus()
            const newChars = [...chars]
            newChars[index - 1] = ''
            setChars(newChars)
        }
        if (e.key === 'Enter') {
            const code = chars.join('')
            if (code.length === 6) {
                onSubmit(code)
            } else {
                setError('Enter all 6 characters')
            }
        }
    }

    const handlePaste = (e) => {
        if (joining) return
        e.preventDefault()
        const pasted = e.clipboardData.getData('text').trim().toUpperCase().slice(0, 6)
        if (pasted.length > 0) {
            const newChars = [...chars]
            for (let i = 0; i < pasted.length && i < 6; i++) {
                newChars[i] = pasted[i]
            }
            setChars(newChars)

            if (pasted.length >= 6) {
                onSubmit(newChars.join(''))
            } else {
                inputRefs.current[Math.min(pasted.length, 5)]?.focus()
            }
        }
    }

    // When QR scanner detects a code
    const handleQRScan = (code) => {
        setShowScanner(false)
        const upper = code.toUpperCase()
        const newChars = upper.split('').slice(0, 6)
        while (newChars.length < 6) newChars.push('')
        setChars(newChars)
        if (newChars.join('').length === 6) {
            onSubmit(newChars.join(''))
        }
    }

    const filled = chars.filter(c => c !== '').length

    return (
        <motion.div
            className="join"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
        >
            {/* Back button */}
            <button className="join__back" onClick={onBack}>
                <ArrowLeft size={14} /> ESC
            </button>

            {/* Crosshair decoration */}
            <div className="join__crosshair">
                <div className="join__crosshair-h" />
                <div className="join__crosshair-v" />
                <div className="join__crosshair-circle" />
            </div>

            {/* Content */}
            <motion.div
                className="join__content"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
            >
                <div className="join__header">
                    <span className="join__header-bracket">[</span>
                    <span className="join__header-text">Join Room</span>
                    <span className="join__header-bracket">]</span>
                </div>

                <div className="join__label">Enter the 6-character room code</div>
                <div className="join__hint">Case-insensitive · You can paste the code</div>

                {/* Input characters */}
                <div className="join__inputs" onPaste={handlePaste}>
                    {chars.map((char, i) => (
                        <div key={i} className="join__char-wrapper">
                            <input
                                ref={el => inputRefs.current[i] = el}
                                type="text"
                                maxLength={1}
                                className={`join__char ${char ? 'join__char--filled' : ''} ${error ? 'join__char--error' : ''}`}
                                value={char}
                                onChange={(e) => handleChange(i, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(i, e)}
                            />
                            {i === 2 && <span className="join__char-sep" />}
                        </div>
                    ))}
                </div>

                {/* QR Scanner button */}
                <button
                    className="join__qr-btn"
                    onClick={() => setShowScanner(true)}
                    disabled={joining}
                    title="Scan QR code"
                >
                    <ScanLine size={14} />
                    <span>Scan QR Code</span>
                </button>

                {/* Progress dots */}
                <div className="join__progress">
                    {chars.map((_, i) => (
                        <span
                            key={i}
                            className={`join__progress-dot ${i < filled ? 'join__progress-dot--filled' : ''}`}
                        />
                    ))}
                </div>

                {/* Submit button */}
                <button
                    className={`join__submit ${filled === 6 && !joining ? 'join__submit--active' : ''}`}
                    disabled={joining || filled < 6}
                    onClick={() => {
                        if (joining) return
                        const code = chars.join('')
                        if (code.length === 6) onSubmit(code)
                    }}
                >
                    {joining ? <><Loader size={14} className="join__spinner" /> CONNECTING...</> : <>CONNECT <ArrowRight size={14} /></>}
                </button>

                {/* Error message */}
                {error && (
                    <motion.div
                        className="join__error"
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        {error}
                    </motion.div>
                )}

                {/* Footer */}
                <div className="join__footer">
                    <Hash size={10} /> PROTOCOL.CONNECT
                </div>
            </motion.div>

            {/* Corner meta */}
            <div className="join__meta join__meta--bl">HANDSHAKE.READY</div>
            <div className="join__meta join__meta--br">ENCRYPTED</div>

            {/* QR Scanner overlay */}
            {showScanner && (
                <Suspense fallback={null}>
                    <QRScanner
                        onScan={handleQRScan}
                        onClose={() => setShowScanner(false)}
                    />
                </Suspense>
            )}
        </motion.div>
    )
}
