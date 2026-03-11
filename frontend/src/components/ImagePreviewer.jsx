import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    ZoomIn, ZoomOut, RotateCw, Maximize, Minimize,
    Move, Info, Shield, AlertTriangle
} from 'lucide-react'

/**
 * ImagePreviewer - Production-level secure image viewer.
 *
 * Features:
 *   - Zoom via mouse wheel + buttons (25% - 500%)
 *   - Pan via click-drag when zoomed
 *   - Rotation (90 degree increments)
 *   - Fit-to-screen / actual-size toggle
 *   - Format-aware rendering (browser-viewable vs non-previewable)
 *   - Anti-download CSS protections
 *   - Format badge display
 *   - Keyboard shortcuts (+ - R F)
 *   - Smooth transitions
 *
 * Supported for direct render:
 *   jpg, jpeg, jfif, png, apng, webp, gif, bmp, ico, avif, svg, tif, tiff
 *
 * Non-previewable (shown as info card):
 *   psd, xcf, ai, eps, cdr, indd, dds, exr, raw, cr2, nef, arw, dng, heic, heif
 */

// Formats the browser can render natively via <img>
const BROWSER_VIEWABLE = new Set([
    'jpg', 'jpeg', 'jfif', 'png', 'apng', 'webp', 'gif',
    'bmp', 'ico', 'avif', 'svg', 'tif', 'tiff'
])

// Format display names
const FORMAT_LABELS = {
    'jpg': 'JPEG', 'jpeg': 'JPEG', 'jfif': 'JFIF',
    'png': 'PNG', 'apng': 'Animated PNG', 'webp': 'WebP',
    'gif': 'GIF', 'bmp': 'Bitmap', 'ico': 'Icon',
    'tif': 'TIFF', 'tiff': 'TIFF', 'svg': 'SVG',
    'avif': 'AVIF', 'heic': 'HEIC', 'heif': 'HEIF',
    'dds': 'DirectDraw', 'exr': 'OpenEXR',
    'raw': 'RAW', 'cr2': 'Canon RAW', 'nef': 'Nikon RAW',
    'arw': 'Sony RAW', 'dng': 'Adobe DNG',
    'psd': 'Photoshop', 'xcf': 'GIMP',
    'ai': 'Illustrator', 'eps': 'PostScript',
    'cdr': 'CorelDRAW', 'indd': 'InDesign',
}

// Format categories for info display
const FORMAT_CATEGORIES = {
    'jpg': 'Raster', 'jpeg': 'Raster', 'jfif': 'Raster',
    'png': 'Raster', 'apng': 'Animated', 'webp': 'Raster',
    'gif': 'Animated', 'bmp': 'Raster', 'ico': 'Icon',
    'tif': 'Raster', 'tiff': 'Raster', 'svg': 'Vector',
    'avif': 'Modern', 'heic': 'HEIF', 'heif': 'HEIF',
    'dds': 'Gaming', 'exr': 'HDR',
    'raw': 'Camera RAW', 'cr2': 'Camera RAW', 'nef': 'Camera RAW',
    'arw': 'Camera RAW', 'dng': 'Camera RAW',
    'psd': 'Design', 'xcf': 'Design',
    'ai': 'Vector', 'eps': 'Vector',
    'cdr': 'Vector', 'indd': 'Layout',
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 5
const ZOOM_STEP = 0.15

export default function ImagePreviewer({ src, fileName, fileExtension }) {
    const [zoom, setZoom] = useState(1)
    const [rotation, setRotation] = useState(0)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [isFitted, setIsFitted] = useState(true)
    const [naturalSize, setNaturalSize] = useState(null)
    const [showInfo, setShowInfo] = useState(false)
    const [loadError, setLoadError] = useState(false)

    const containerRef = useRef(null)
    const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })

    const ext = (fileExtension || fileName?.split('.').pop() || '').toLowerCase()
    const canPreview = BROWSER_VIEWABLE.has(ext) && !loadError
    const formatLabel = FORMAT_LABELS[ext] || ext.toUpperCase()
    const formatCategory = FORMAT_CATEGORIES[ext] || 'Image'

    // Reset state when src changes
    useEffect(() => {
        setZoom(1)
        setRotation(0)
        setPosition({ x: 0, y: 0 })
        setIsFitted(true)
        setLoadError(false)
        setShowInfo(false)
    }, [src])

    // Zoom controls
    const handleZoomIn = useCallback(() => {
        setZoom(z => Math.min(z + ZOOM_STEP, MAX_ZOOM))
        setIsFitted(false)
    }, [])

    const handleZoomOut = useCallback(() => {
        setZoom(z => Math.max(z - ZOOM_STEP, MIN_ZOOM))
        setIsFitted(false)
    }, [])

    const handleFitToggle = useCallback(() => {
        if (isFitted) {
            setZoom(1)
            setIsFitted(false)
        } else {
            setZoom(1)
            setPosition({ x: 0, y: 0 })
            setIsFitted(true)
        }
    }, [isFitted])

    const handleRotate = useCallback(() => {
        setRotation(r => (r + 90) % 360)
    }, [])

    // Mouse wheel zoom
    const handleWheel = useCallback((e) => {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
        setZoom(z => {
            const newZoom = Math.min(Math.max(z + delta, MIN_ZOOM), MAX_ZOOM)
            if (newZoom !== 1) setIsFitted(false)
            return newZoom
        })
    }, [])

    // Pan via drag
    const handleMouseDown = useCallback((e) => {
        if (zoom <= 1 && isFitted) return
        e.preventDefault()
        setIsDragging(true)
        dragStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            posX: position.x,
            posY: position.y,
        }
    }, [zoom, isFitted, position])

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return
        const dx = e.clientX - dragStartRef.current.x
        const dy = e.clientY - dragStartRef.current.y
        setPosition({
            x: dragStartRef.current.posX + dx,
            y: dragStartRef.current.posY + dy,
        })
    }, [isDragging])

    const handleMouseUp = useCallback(() => {
        setIsDragging(false)
    }, [])

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if (e.key === '=' || e.key === '+') handleZoomIn()
            else if (e.key === '-') handleZoomOut()
            else if (e.key === 'r' || e.key === 'R') handleRotate()
            else if (e.key === 'f' || e.key === 'F') handleFitToggle()
            else if (e.key === 'i' || e.key === 'I') setShowInfo(v => !v)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleZoomIn, handleZoomOut, handleRotate, handleFitToggle])

    const handleImageLoad = (e) => {
        setNaturalSize({
            width: e.target.naturalWidth,
            height: e.target.naturalHeight,
        })
    }

    const zoomPercent = Math.round(zoom * 100)

    // ── Non-previewable format ──
    if (!canPreview) {
        return (
            <div className="img-preview">
                <div className="img-preview__nopreview">
                    <div className="img-preview__nopreview-icon">
                        <Shield size={28} />
                    </div>
                    <div className="img-preview__nopreview-ext">.{ext}</div>
                    <div className="img-preview__nopreview-label">{formatLabel}</div>
                    <div className="img-preview__nopreview-category">{formatCategory} Format</div>
                    <div className="img-preview__nopreview-divider" />
                    {loadError ? (
                        <div className="img-preview__nopreview-msg">
                            <AlertTriangle size={12} />
                            <span>Image could not be rendered in browser</span>
                        </div>
                    ) : (
                        <div className="img-preview__nopreview-msg">
                            <Shield size={12} />
                            <span>This format requires native application to view</span>
                        </div>
                    )}
                    <div className="img-preview__nopreview-note">
                        File is encrypted and verified. Cannot be downloaded.
                    </div>
                </div>
            </div>
        )
    }

    // ── Previewable format ──
    return (
        <div
            className="img-preview"
            ref={containerRef}
            onWheel={handleWheel}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Image canvas */}
            <div
                className={`img-preview__canvas ${isDragging ? 'img-preview__canvas--dragging' : ''}`}
                onMouseDown={handleMouseDown}
                style={{
                    cursor: zoom > 1 || !isFitted ? (isDragging ? 'grabbing' : 'grab') : 'default',
                }}
            >
                <motion.img
                    src={src}
                    alt={fileName || 'Encrypted image'}
                    className="img-preview__image"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    onLoad={handleImageLoad}
                    onError={() => setLoadError(true)}
                    animate={{
                        scale: zoom,
                        rotate: rotation,
                        x: position.x,
                        y: position.y,
                    }}
                    transition={{
                        type: isDragging ? 'tween' : 'spring',
                        stiffness: isDragging ? undefined : 300,
                        damping: isDragging ? undefined : 30,
                        duration: isDragging ? 0 : undefined,
                    }}
                    style={{
                        maxWidth: isFitted ? '100%' : 'none',
                        maxHeight: isFitted ? '100%' : 'none',
                        objectFit: isFitted ? 'contain' : 'none',
                    }}
                />
            </div>

            {/* Toolbar */}
            <div className="img-preview__toolbar">
                <div className="img-preview__toolbar-group">
                    <button
                        className="img-preview__tool-btn"
                        onClick={handleZoomOut}
                        disabled={zoom <= MIN_ZOOM}
                        title="Zoom out (-)"
                    >
                        <ZoomOut size={14} />
                    </button>
                    <div className="img-preview__zoom-display">{zoomPercent}%</div>
                    <button
                        className="img-preview__tool-btn"
                        onClick={handleZoomIn}
                        disabled={zoom >= MAX_ZOOM}
                        title="Zoom in (+)"
                    >
                        <ZoomIn size={14} />
                    </button>
                </div>

                <div className="img-preview__toolbar-divider" />

                <div className="img-preview__toolbar-group">
                    <button
                        className="img-preview__tool-btn"
                        onClick={handleFitToggle}
                        title={isFitted ? 'Actual size (F)' : 'Fit to screen (F)'}
                    >
                        {isFitted ? <Maximize size={14} /> : <Minimize size={14} />}
                    </button>
                    <button
                        className="img-preview__tool-btn"
                        onClick={handleRotate}
                        title="Rotate 90 (R)"
                    >
                        <RotateCw size={14} />
                    </button>
                    <button
                        className={`img-preview__tool-btn ${showInfo ? 'img-preview__tool-btn--active' : ''}`}
                        onClick={() => setShowInfo(!showInfo)}
                        title="Image info (I)"
                    >
                        <Info size={14} />
                    </button>
                </div>

                {/* Format badge */}
                <div className="img-preview__format-badge">
                    {formatLabel}
                </div>
            </div>

            {/* Info panel */}
            {showInfo && naturalSize && (
                <motion.div
                    className="img-preview__info-panel"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                >
                    <div className="img-preview__info-title">IMAGE DETAILS</div>
                    <div className="img-preview__info-grid">
                        <span>Format</span><span>{formatLabel} ({formatCategory})</span>
                        <span>File</span><span>{fileName || 'Encrypted'}</span>
                        <span>Resolution</span><span>{naturalSize.width} x {naturalSize.height}</span>
                        <span>Zoom</span><span>{zoomPercent}%</span>
                        <span>Rotation</span><span>{rotation} deg</span>
                        <span>Security</span><span>E2E Encrypted</span>
                    </div>
                    <div className="img-preview__info-note">
                        Download disabled. Right-click blocked.
                    </div>
                </motion.div>
            )}
        </div>
    )
}
