import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    Play, Pause, Volume2, VolumeX, Maximize, Minimize,
    SkipBack, SkipForward, Shield, AlertTriangle, Info
} from 'lucide-react'

/**
 * VideoPreviewer - Production-level secure video player.
 *
 * Features:
 *   - Custom controls (play/pause, seek, volume, fullscreen)
 *   - Format-aware: browser-playable vs non-playable info card
 *   - Anti-download protections (no right-click, no controlsList download)
 *   - Progress bar with seek
 *   - Time display
 *   - Format badge
 *   - Keyboard shortcuts (Space, F, M, arrows)
 */

const BROWSER_PLAYABLE = new Set([
    'mp4', 'webm', 'mov', 'ogv', 'm4v', '3gp', 'ts'
])

const FORMAT_LABELS = {
    'mp4': 'MP4', 'webm': 'WebM', 'mov': 'QuickTime', 'mkv': 'Matroska',
    'avi': 'AVI', 'm4v': 'M4V', 'ogv': 'Ogg Video', 'wmv': 'WMV',
    'flv': 'Flash Video', 'f4v': 'F4V', '3gp': '3GPP', '3g2': '3GPP2',
    'ts': 'MPEG-TS', 'mts': 'MTS', 'm2ts': 'M2TS', 'vob': 'DVD VOB',
    'mpg': 'MPEG', 'mpeg': 'MPEG', 'divx': 'DivX', 'asf': 'ASF',
    'rm': 'RealMedia', 'rmvb': 'RMVB', 'swf': 'Flash',
}

export default function VideoPreviewer({ src, fileName, fileExtension }) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [showControls, setShowControls] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [showInfo, setShowInfo] = useState(false)

    const videoRef = useRef(null)
    const containerRef = useRef(null)
    const controlsTimeoutRef = useRef(null)

    const ext = (fileExtension || fileName?.split('.').pop() || '').toLowerCase()
    const canPlay = BROWSER_PLAYABLE.has(ext) && !loadError
    const formatLabel = FORMAT_LABELS[ext] || ext.toUpperCase()

    const formatTime = (s) => {
        if (!s || isNaN(s)) return '0:00'
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${m}:${sec.toString().padStart(2, '0')}`
    }

    const togglePlay = useCallback(() => {
        if (!videoRef.current) return
        if (videoRef.current.paused) {
            videoRef.current.play()
            setIsPlaying(true)
        } else {
            videoRef.current.pause()
            setIsPlaying(false)
        }
    }, [])

    const handleSeek = (e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const pct = (e.clientX - rect.left) / rect.width
        if (videoRef.current) {
            videoRef.current.currentTime = pct * duration
        }
    }

    const skip = (seconds) => {
        if (videoRef.current) {
            videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds))
        }
    }

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted
            setIsMuted(!isMuted)
        }
    }

    const toggleFullscreen = async () => {
        if (!containerRef.current) return
        if (document.fullscreenElement) {
            await document.exitFullscreen()
        } else {
            await containerRef.current.requestFullscreen()
        }
    }

    const handleMouseMove = () => {
        setShowControls(true)
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
        if (isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
        }
    }

    useEffect(() => {
        const handler = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', handler)
        return () => document.removeEventListener('fullscreenchange', handler)
    }, [])

    useEffect(() => {
        const handler = (e) => {
            if (e.key === ' ') { e.preventDefault(); togglePlay() }
            else if (e.key === 'f' || e.key === 'F') toggleFullscreen()
            else if (e.key === 'm' || e.key === 'M') toggleMute()
            else if (e.key === 'ArrowRight') skip(5)
            else if (e.key === 'ArrowLeft') skip(-5)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [togglePlay, duration])

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0

    if (!canPlay) {
        return (
            <div className="vid-preview">
                <div className="vid-preview__nopreview">
                    <div className="vid-preview__nopreview-icon"><Shield size={28} /></div>
                    <div className="vid-preview__nopreview-ext">.{ext}</div>
                    <div className="vid-preview__nopreview-label">{formatLabel}</div>
                    <div className="vid-preview__nopreview-divider" />
                    <div className="vid-preview__nopreview-msg">
                        {loadError ? (
                            <><AlertTriangle size={12} /><span>Video cannot be played in browser</span></>
                        ) : (
                            <><Shield size={12} /><span>Requires native player to view</span></>
                        )}
                    </div>
                    <div className="vid-preview__nopreview-note">E2E encrypted. Download blocked.</div>
                </div>
            </div>
        )
    }

    return (
        <div
            className="vid-preview"
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
        >
            <video
                ref={videoRef}
                src={src}
                className="vid-preview__video"
                onClick={togglePlay}
                onContextMenu={(e) => e.preventDefault()}
                onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
                onEnded={() => setIsPlaying(false)}
                onError={() => setLoadError(true)}
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                playsInline
            />

            {/* Play overlay when paused */}
            {!isPlaying && (
                <motion.div
                    className="vid-preview__play-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={togglePlay}
                >
                    <div className="vid-preview__play-btn">
                        <Play size={32} fill="white" />
                    </div>
                </motion.div>
            )}

            {/* Controls */}
            <motion.div
                className="vid-preview__controls"
                animate={{ opacity: showControls ? 1 : 0 }}
                transition={{ duration: 0.2 }}
            >
                {/* Progress bar */}
                <div className="vid-preview__progress" onClick={handleSeek}>
                    <div className="vid-preview__progress-fill" style={{ width: `${progress}%` }} />
                    <div className="vid-preview__progress-thumb" style={{ left: `${progress}%` }} />
                </div>

                <div className="vid-preview__controls-row">
                    <div className="vid-preview__controls-left">
                        <button className="vid-preview__ctrl-btn" onClick={() => skip(-10)} title="Back 10s">
                            <SkipBack size={14} />
                        </button>
                        <button className="vid-preview__ctrl-btn vid-preview__ctrl-btn--play" onClick={togglePlay}>
                            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button className="vid-preview__ctrl-btn" onClick={() => skip(10)} title="Forward 10s">
                            <SkipForward size={14} />
                        </button>
                        <div className="vid-preview__time">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                    </div>
                    <div className="vid-preview__controls-right">
                        <div className="vid-preview__format-badge">{formatLabel}</div>
                        <button className="vid-preview__ctrl-btn" onClick={toggleMute}>
                            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                        </button>
                        <button className="vid-preview__ctrl-btn" onClick={toggleFullscreen}>
                            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
