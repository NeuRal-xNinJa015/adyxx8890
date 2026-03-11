/**
 * ADYX Metadata Stripper
 * 
 * Removes EXIF/GPS/camera metadata from images before encryption.
 * Uses Canvas re-encoding (strips all metadata naturally).
 * 
 * Supported: JPEG, PNG, WebP, BMP, GIF (rasterizable formats)
 * Not supported: SVG (passed through), Video/Audio (warning shown)
 * 
 * Usage:
 *   import { stripImageMetadata, canStripMetadata } from './metadataStripper.js'
 *   const cleanBlob = await stripImageMetadata(file)
 */

// ── Formats that support Canvas re-encoding ──

const STRIPPABLE_FORMATS = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif'
])

const OUTPUT_FORMAT_MAP = {
    'image/jpeg': 'image/jpeg',
    'image/png': 'image/png',
    'image/webp': 'image/webp',
    'image/bmp': 'image/png',  // BMP → PNG (better compression)
    'image/gif': 'image/png',  // GIF → PNG (single frame, drops animation)
}

/**
 * Check if metadata can be stripped from this file type.
 * 
 * @param {File} file
 * @returns {{ canStrip: boolean, reason?: string }}
 */
export function canStripMetadata(file) {
    if (!file || !file.type) {
        return { canStrip: false, reason: 'Unknown file type' }
    }

    if (STRIPPABLE_FORMATS.has(file.type)) {
        return { canStrip: true }
    }

    if (file.type.startsWith('image/')) {
        return { canStrip: false, reason: 'SVG/HEIC metadata stripping not supported — file sent as-is' }
    }

    if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        return { canStrip: false, reason: 'Video/audio metadata stripping requires server-side processing — metadata may be present' }
    }

    return { canStrip: false, reason: 'Not a media file' }
}

/**
 * Strip all EXIF/GPS/camera metadata from an image.
 * Works by re-encoding through a Canvas element.
 * 
 * Removes:
 *   - GPS coordinates
 *   - Device model
 *   - Timestamps
 *   - Camera settings (aperture, ISO, etc.)
 *   - Orientation tags
 *   - Thumbnail data
 *   - All other EXIF chunks
 * 
 * @param {File|Blob} file - Image file
 * @param {number} quality - JPEG quality (0.0 - 1.0), default 0.92
 * @returns {Promise<Blob>} Clean image blob with no metadata
 */
export async function stripImageMetadata(file, quality = 0.92) {
    const type = file.type || 'image/png'

    if (!STRIPPABLE_FORMATS.has(type)) {
        console.warn('[MetadataStripper] Cannot strip metadata from', type, '— returning original')
        return file
    }

    return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)

        img.onload = () => {
            try {
                // Create canvas at original dimensions
                const canvas = document.createElement('canvas')
                canvas.width = img.naturalWidth
                canvas.height = img.naturalHeight

                const ctx = canvas.getContext('2d')
                if (!ctx) {
                    reject(new Error('Canvas context unavailable'))
                    return
                }

                // Draw image — this inherently drops all EXIF data
                ctx.drawImage(img, 0, 0)

                // Convert back to blob
                const outputType = OUTPUT_FORMAT_MAP[type] || 'image/png'
                const outputQuality = outputType === 'image/jpeg' ? quality : undefined

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Canvas toBlob returned null'))
                            return
                        }
                        console.log(`[MetadataStripper] Stripped metadata: ${formatSize(file.size)} → ${formatSize(blob.size)}`)

                        // Clean up
                        URL.revokeObjectURL(url)
                        canvas.width = 0
                        canvas.height = 0

                        resolve(blob)
                    },
                    outputType,
                    outputQuality
                )
            } catch (err) {
                URL.revokeObjectURL(url)
                reject(err)
            }
        }

        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Failed to load image for metadata stripping'))
        }

        img.src = url
    })
}

/**
 * Generate a small encrypted thumbnail for preview.
 * Creates a low-res version of the image for display in chat.
 * 
 * @param {File|Blob} file - Image file
 * @param {number} maxSize - Max dimension in pixels (default 120)
 * @returns {Promise<Blob>} Thumbnail blob
 */
export async function generateThumbnail(file, maxSize = 120) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)

        img.onload = () => {
            try {
                // Calculate thumbnail dimensions
                let w = img.naturalWidth
                let h = img.naturalHeight
                if (w > maxSize || h > maxSize) {
                    const ratio = Math.min(maxSize / w, maxSize / h)
                    w = Math.round(w * ratio)
                    h = Math.round(h * ratio)
                }

                const canvas = document.createElement('canvas')
                canvas.width = w
                canvas.height = h

                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, w, h)

                // Apply slight blur for privacy
                ctx.filter = 'blur(2px)'
                ctx.drawImage(canvas, 0, 0)

                canvas.toBlob(
                    (blob) => {
                        URL.revokeObjectURL(url)
                        canvas.width = 0
                        canvas.height = 0
                        resolve(blob)
                    },
                    'image/jpeg',
                    0.5  // Low quality for small size
                )
            } catch (err) {
                URL.revokeObjectURL(url)
                reject(err)
            }
        }

        img.onerror = () => {
            URL.revokeObjectURL(url)
            reject(new Error('Failed to generate thumbnail'))
        }

        img.src = url
    })
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
