import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, Send, X, Loader } from 'lucide-react'
import { generateFileKey, encryptFile, exportFileKey, hashFile, chunkData, encryptMetadata } from '../lib/security/fileCrypto.js'

/**
 * VoiceRecordButton — Hold-to-record voice messages with encryption.
 *
 * - Click mic to start recording
 * - Click stop to finish
 * - Preview waveform + duration
 * - Send or discard
 * - Audio encrypted through the same pipeline as file uploads
 */
export default function VoiceRecordButton({ onFileReady, disabled = false, roomCode = '' }) {
    const [recording, setRecording] = useState(false)
    const [recorded, setRecorded] = useState(false)
    const [sending, setSending] = useState(false)
    const [duration, setDuration] = useState(0)
    const [audioLevel, setAudioLevel] = useState(0)

    const mediaRecorderRef = useRef(null)
    const chunksRef = useRef([])
    const timerRef = useRef(null)
    const streamRef = useRef(null)
    const analyserRef = useRef(null)
    const animFrameRef = useRef(null)
    const audioBlobRef = useRef(null)
    const audioCtxRef = useRef(null)

    const MAX_DURATION = 120 // 2 minutes max

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopAllStreams()
            if (timerRef.current) clearInterval(timerRef.current)
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        }
    }, [])

    const stopAllStreams = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop())
            streamRef.current = null
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current)
            animFrameRef.current = null
        }
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close().catch(() => { })
            audioCtxRef.current = null
        }
    }

    const startRecording = useCallback(async () => {
        // Guard: check if MediaRecorder is available
        if (typeof MediaRecorder === 'undefined') {
            console.warn('[Voice] MediaRecorder not supported in this browser')
            return
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }
            })
            streamRef.current = stream

            // Audio level analysis for waveform
            const audioCtx = new AudioContext()
            audioCtxRef.current = audioCtx
            const source = audioCtx.createMediaStreamSource(stream)
            const analyser = audioCtx.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            analyserRef.current = analyser

            const dataArray = new Uint8Array(analyser.frequencyBinCount)
            const tick = () => {
                analyser.getByteFrequencyData(dataArray)
                const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
                setAudioLevel(avg / 255)
                animFrameRef.current = requestAnimationFrame(tick)
            }
            tick()

            // MediaRecorder
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm'

            const recorder = new MediaRecorder(stream, { mimeType })
            chunksRef.current = []

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType })
                audioBlobRef.current = blob
                setRecorded(true)
                stopAllStreams()
            }

            recorder.onerror = (event) => {
                console.error('[Voice] MediaRecorder error:', event.error)
                stopAllStreams()
                setRecording(false)
                setRecorded(false)
                setAudioLevel(0)
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
            }

            mediaRecorderRef.current = recorder
            recorder.start(100) // collect data every 100ms

            setRecording(true)
            setRecorded(false)
            setDuration(0)
            audioBlobRef.current = null

            // Duration timer
            timerRef.current = setInterval(() => {
                setDuration(prev => {
                    if (prev >= MAX_DURATION - 1) {
                        stopRecording()
                        return prev
                    }
                    return prev + 1
                })
            }, 1000)

        } catch (err) {
            console.error('[Voice] Mic access denied:', err)
        }
    }, [])

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
        setRecording(false)
        setAudioLevel(0)
    }, [])

    const discardRecording = useCallback(() => {
        audioBlobRef.current = null
        chunksRef.current = []
        setRecorded(false)
        setDuration(0)
    }, [])

    const sendRecording = useCallback(async () => {
        const blob = audioBlobRef.current
        if (!blob || sending) return

        setSending(true)
        try {
            // Run through the same encryption pipeline as file uploads
            const fileBuffer = await blob.arrayBuffer()

            // Generate encryption key
            const key = await generateFileKey()
            const keyBase64 = await exportFileKey(key)

            // Encrypt
            const { encrypted, iv } = await encryptFile(fileBuffer, key)

            // Hash
            const hash = await hashFile(encrypted)

            // Encrypt metadata
            const metadata = {
                name: `voice_${Date.now()}.webm`,
                type: blob.type,
                size: blob.size,
                category: 'audio',
                fileType: 'webm',
                isVoiceMessage: true,
                voiceDuration: duration,
            }
            const encMeta = await encryptMetadata(metadata, key)

            // Chunk
            const chunks = chunkData(encrypted)

            const fileId = crypto.randomUUID()
            const fileData = {
                fileId,
                chunks,
                totalChunks: chunks.length,
                iv: Array.from(iv),
                hash,
                keyBase64,
                encryptedMetadata: encMeta,
                thumbnail: null,
                ephemeral: { mode: 'normal', duration: 0 },
                displayCategory: 'audio',
                isVoiceMessage: true,
                voiceDuration: duration,
            }

            if (onFileReady) onFileReady(fileData)

            console.log(`[Voice] Sent ${duration}s voice message (${chunks.length} chunks)`)

            // Reset
            audioBlobRef.current = null
            chunksRef.current = []
            setRecorded(false)
            setDuration(0)
        } catch (err) {
            console.error('[Voice] Encrypt/send failed:', err)
        } finally {
            setSending(false)
        }
    }, [duration, onFileReady, sending])

    const formatTime = (s) => {
        const m = Math.floor(s / 60)
        const sec = s % 60
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    // Generate waveform bars from audio level
    const bars = Array.from({ length: 20 }, (_, i) => {
        if (!recording) return 0.1
        // Create varied heights based on audio level + position
        const base = audioLevel * 0.8
        const variance = Math.sin((i * 0.5) + (Date.now() * 0.005)) * 0.3
        return Math.max(0.1, Math.min(1, base + variance))
    })

    return (
        <div className="voice-record">
            <AnimatePresence mode="wait">
                {/* ── Idle: Show mic button ── */}
                {!recording && !recorded && (
                    <motion.button
                        key="mic"
                        className="voice-record__btn"
                        onClick={startRecording}
                        disabled={disabled || sending}
                        title="Record voice message"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <Mic size={16} />
                    </motion.button>
                )}

                {/* ── Recording: Show waveform + stop ── */}
                {recording && (
                    <motion.div
                        key="recording"
                        className="voice-record__active"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <span className="voice-record__pulse" />
                        <span className="voice-record__time">{formatTime(duration)}</span>
                        <div className="voice-record__waveform">
                            {bars.map((h, i) => (
                                <div
                                    key={i}
                                    className="voice-record__bar"
                                    style={{ height: `${h * 100}%` }}
                                />
                            ))}
                        </div>
                        <button className="voice-record__stop" onClick={stopRecording} title="Stop">
                            <Square size={12} />
                        </button>
                    </motion.div>
                )}

                {/* ── Recorded: Show preview + send/discard ── */}
                {recorded && !recording && (
                    <motion.div
                        key="preview"
                        className="voice-record__preview"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 'auto', opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <button className="voice-record__discard" onClick={discardRecording} title="Discard">
                            <X size={12} />
                        </button>
                        <span className="voice-record__time">{formatTime(duration)}</span>
                        <button
                            className="voice-record__send"
                            onClick={sendRecording}
                            disabled={sending}
                            title="Send"
                        >
                            {sending ? <Loader size={12} className="voice-record__spinner" /> : <Send size={12} />}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
