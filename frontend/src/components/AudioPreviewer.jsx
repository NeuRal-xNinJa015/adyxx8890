import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
    Shield, AlertTriangle, Info, Disc
} from 'lucide-react'

/**
 * AudioPreviewer - Production-level secure audio player.
 *
 * Features:
 *   - Custom waveform-style progress bar
 *   - Play/pause with animated disc
 *   - Volume control
 *   - Time display (current / total)
 *   - Format badge
 *   - Non-playable format info card
 *   - Keyboard shortcuts (Space, M, arrows)
 *   - Anti-download protections
 */

const BROWSER_PLAYABLE = new Set([
    'mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'flac', 'aiff', 'aif', 'au', 'webm'
])

const FORMAT_LABELS = {
    'mp3': 'MP3', 'wav': 'WAV', 'ogg': 'Ogg Vorbis', 'opus': 'Opus',
    'm4a': 'AAC/M4A', 'aac': 'AAC', 'flac': 'FLAC', 'wma': 'WMA',
    'aiff': 'AIFF', 'aif': 'AIFF', 'alac': 'Apple Lossless',
    'ape': 'Monkey Audio', 'dsf': 'DSD', 'dff': 'DSD',
    'mid': 'MIDI', 'midi': 'MIDI', 'amr': 'AMR', 'au': 'AU',
    'ra': 'RealAudio', 'ac3': 'Dolby AC3', 'dts': 'DTS',
    'pcm': 'PCM', 'wv': 'WavPack', 'mka': 'Matroska Audio',
    'webm': 'WebM Audio',
}

const FORMAT_QUALITY = {
    'flac': 'Lossless', 'alac': 'Lossless', 'wav': 'Lossless', 'aiff': 'Lossless',
    'aif': 'Lossless', 'ape': 'Lossless', 'dsf': 'Hi-Res', 'dff': 'Hi-Res',
    'pcm': 'Lossless', 'wv': 'Lossless', 'dts': 'Surround',
    'ac3': 'Surround', 'opus': 'Efficient',
}

export default function AudioPreviewer({ src, fileName, fileExtension }) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [isMuted, setIsMuted] = useState(false)
    const [loadError, setLoadError] = useState(false)

    const audioRef = useRef(null)

    const ext = (fileExtension || fileName?.split('.').pop() || '').toLowerCase()
    const canPlay = BROWSER_PLAYABLE.has(ext) && !loadError
    const formatLabel = FORMAT_LABELS[ext] || ext.toUpperCase()
    const quality = FORMAT_QUALITY[ext] || 'Lossy'

    const formatTime = (s) => {
        if (!s || isNaN(s)) return '0:00'
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    const togglePlay = useCallback(() => {
        if (!audioRef.current) return
        if (audioRef.current.paused) {
            audioRef.current.play()
            setIsPlaying(true)
        } else {
            audioRef.current.pause()
            setIsPlaying(false)
        }
    }, [])

    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const pct = (e.clientX - rect.left) / rect.width
        if (audioRef.current) {
            audioRef.current.currentTime = pct * duration
        }
    }

    const skip = (seconds) => {
        if (audioRef.current) {
            audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds))
        }
    }

    useEffect(() => {
        const handler = (e) => {
            if (e.key === ' ') { e.preventDefault(); togglePlay() }
            else if (e.key === 'm' || e.key === 'M') {
                if (audioRef.current) { audioRef.current.muted = !isMuted; setIsMuted(!isMuted) }
            }
            else if (e.key === 'ArrowRight') skip(5)
            else if (e.key === 'ArrowLeft') skip(-5)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [togglePlay, duration, isMuted])

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    if (!canPlay) {
        return (
            <div className="aud-preview">
                <div className="aud-preview__nopreview">
                    <div className="aud-preview__nopreview-icon"><Shield size={28} /></div>
                    <div className="aud-preview__nopreview-ext">.{ext}</div>
                    <div className="aud-preview__nopreview-label">{formatLabel}</div>
                    {quality !== 'Lossy' && (
                        <div className="aud-preview__quality-badge">{quality}</div>
                    )}
                    <div className="aud-preview__nopreview-divider" />
                    <div className="aud-preview__nopreview-msg">
                        {loadError ? (
                            <><AlertTriangle size={12} /><span>Audio cannot be played in browser</span></>
                        ) : (
                            <><Shield size={12} /><span>Requires native player</span></>
                        )}
                    </div>
                    <div className="aud-preview__nopreview-note">E2E encrypted. Download blocked.</div>
                </div>
            </div>
        )
    }

    return (
        <div className="aud-preview">
            <audio
                ref={audioRef}
                src={src}
                onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
                onEnded={() => setIsPlaying(false)}
                onError={() => setLoadError(true)}
                onContextMenu={(e) => e.preventDefault()}
                controlsList="nodownload"
                preload="metadata"
            />

            <div className="aud-preview__player">
                {/* Disc animation */}
                <motion.div
                    className="aud-preview__disc"
                    animate={{ rotate: isPlaying ? 360 : 0 }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                >
                    <Disc size={40} />
                </motion.div>

                {/* Info */}
                <div className="aud-preview__info">
                    <div className="aud-preview__filename">{fileName || 'Audio File'}</div>
                    <div className="aud-preview__meta-row">
                        <span className="aud-preview__format-badge">{formatLabel}</span>
                        {quality !== 'Lossy' && (
                            <span className="aud-preview__quality-badge">{quality}</span>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="aud-preview__controls">
                    {/* Progress bar */}
                    <div className="aud-preview__progress" onClick={handleSeek}>
                        <div className="aud-preview__progress-bg" />
                        <div className="aud-preview__progress-fill" style={{ width: `${progress}%` }} />
                        <div className="aud-preview__progress-thumb" style={{ left: `${progress}%` }} />
                    </div>

                    <div className="aud-preview__controls-row">
                        <div className="aud-preview__controls-left">
                            <button className="aud-preview__ctrl-btn" onClick={() => skip(-10)}>
                                <SkipBack size={12} />
                            </button>
                            <button className="aud-preview__ctrl-btn aud-preview__ctrl-btn--play" onClick={togglePlay}>
                                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                            </button>
                            <button className="aud-preview__ctrl-btn" onClick={() => skip(10)}>
                                <SkipForward size={12} />
                            </button>
                        </div>
                        <div className="aud-preview__time">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                        <button className="aud-preview__ctrl-btn" onClick={() => {
                            if (audioRef.current) { audioRef.current.muted = !isMuted; setIsMuted(!isMuted) }
                        }}>
                            {isMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
