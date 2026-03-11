import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Paperclip, Image, Video, FileText, Music, ChevronUp, Eye, Timer, Shield, X, Loader } from 'lucide-react'
import { validateFile, getAcceptString, formatFileSize } from '../lib/security/fileValidator.js'
import { generateFileKey, encryptFile, exportFileKey, hashFile, chunkData, encryptMetadata } from '../lib/security/fileCrypto.js'
import { stripImageMetadata, canStripMetadata, generateThumbnail } from '../lib/security/metadataStripper.js'
import { createEphemeralSession, SELF_DESTRUCT_TIMERS, formatTimer } from '../lib/security/ephemeralMedia.js'
import SECURITY_CONFIG from '../lib/security/config.js'

/**
 * FileUploadButton — Secure file upload with encryption pipeline.
 *
 * Workflow:
 *   1. User picks file type (image/video/doc/audio)
 *   2. File picker opens with filtered types
 *   3. File validated (extension, MIME, magic number)
 *   4. Metadata stripped (images)
 *   5. File encrypted (AES-256-GCM, per-file key)
 *   6. Encrypted chunks sent via WebSocket
 *   7. File key sent through E2E encrypted channel
 */
export default function FileUploadButton({
    onFileReady,        // (fileData) => void — called with encrypted file data
    disabled = false,
    roomCode = '',
}) {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [error, setError] = useState(null)
    const [ephemeralMode, setEphemeralMode] = useState('normal')
    const [selfDestructTime, setSelfDestructTime] = useState(10)
    const [showEphemeralMenu, setShowEphemeralMenu] = useState(false)
    const fileInputRef = useRef(null)
    const currentCategoryRef = useRef(null)

    const config = SECURITY_CONFIG.secureMedia || {}

    const FILE_TYPES = [
        { id: 'images', label: 'Image', icon: Image, accept: getAcceptString('images') },
        { id: 'video', label: 'Video', icon: Video, accept: getAcceptString('video') },
        { id: 'documents', label: 'Document', icon: FileText, accept: getAcceptString('documents') },
        { id: 'audio', label: 'Audio', icon: Music, accept: getAcceptString('audio') },
    ]

    const handleTypeSelect = (type) => {
        if (disabled || isUploading) return
        currentCategoryRef.current = type.id
        if (fileInputRef.current) {
            fileInputRef.current.accept = type.accept
            fileInputRef.current.click()
        }
        setIsMenuOpen(false)
        setError(null)
    }

    const handleFileSelected = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Reset input for re-selection
        e.target.value = ''

        setIsUploading(true)
        setUploadProgress(0)
        setError(null)

        try {
            // 1. Validate file
            setUploadProgress(5)
            const validation = await validateFile(file)
            if (!validation.valid) {
                throw new Error(validation.error)
            }

            // 2. Strip metadata (images only)
            setUploadProgress(15)
            let processedFile = file
            if (config.metadataStripping && validation.category === 'images') {
                const { canStrip } = canStripMetadata(file)
                if (canStrip) {
                    console.log('[Upload] Stripping image metadata...')
                    processedFile = await stripImageMetadata(file)
                }
            }

            // 3. Generate thumbnail (images only)
            setUploadProgress(25)
            let thumbnailData = null
            if (config.encryptedThumbnails && validation.category === 'images') {
                try {
                    const thumbBlob = await generateThumbnail(processedFile instanceof Blob ? processedFile : file)
                    const thumbBuffer = await thumbBlob.arrayBuffer()
                    thumbnailData = thumbBuffer
                } catch (err) {
                    console.warn('[Upload] Thumbnail generation failed:', err)
                }
            }

            // 4. Read file as ArrayBuffer
            setUploadProgress(35)
            const fileBuffer = await readFileAsArrayBuffer(processedFile)

            // 5. Generate file encryption key
            setUploadProgress(45)
            const key = await generateFileKey()
            const keyBase64 = await exportFileKey(key)

            // 6. Encrypt file
            setUploadProgress(55)
            const { encrypted, iv } = await encryptFile(fileBuffer, key)

            // 7. Compute integrity hash on ENCRYPTED data
            //    (receiver verifies hash on reassembled encrypted chunks before decrypting)
            setUploadProgress(65)
            const hash = await hashFile(encrypted)

            // 8. Encrypt metadata
            setUploadProgress(70)
            const metadata = {
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size,
                category: validation.category,
                fileType: validation.fileType,
            }
            const encMeta = await encryptMetadata(metadata, key)

            // 9. Encrypt thumbnail if available
            let encThumb = null
            if (thumbnailData) {
                const { encrypted: thumbEnc, iv: thumbIv } = await encryptFile(thumbnailData, key)
                encThumb = {
                    data: chunkData(thumbEnc)[0], // Usually small enough for 1 chunk
                    iv: Array.from(thumbIv),
                }
            }

            // 10. Chunk encrypted data
            setUploadProgress(80)
            const chunks = chunkData(encrypted)

            // 11. Create ephemeral session if needed
            const fileId = crypto.randomUUID()
            if (ephemeralMode !== 'normal') {
                createEphemeralSession(
                    fileId,
                    ephemeralMode,
                    ephemeralMode === 'timed' ? selfDestructTime : 0,
                    keyBase64,
                    null
                )
            }

            // 12. Prepare file data for sending
            setUploadProgress(95)
            const fileData = {
                fileId,
                chunks,
                totalChunks: chunks.length,
                iv: Array.from(iv),
                hash,
                keyBase64,            // Will be sent through E2E channel
                encryptedMetadata: encMeta,
                thumbnail: encThumb,
                ephemeral: {
                    mode: ephemeralMode,
                    duration: ephemeralMode === 'timed' ? selfDestructTime : 0,
                },
                // Unencrypted display hints (server can see these)
                displayCategory: validation.category,
            }

            setUploadProgress(100)

            // Callback to parent
            if (onFileReady) {
                onFileReady(fileData)
            }

            console.log(`[Upload] File encrypted: ${file.name} (${formatFileSize(file.size)}) - ${chunks.length} chunks`)
        } catch (err) {
            console.error('[Upload] Failed:', err)
            setError(err.message || 'Upload failed')
        } finally {
            setIsUploading(false)
            setUploadProgress(0)
        }
    }

    return (
        <div className="file-upload" style={{ position: 'relative' }}>
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileSelected}
            />

            {/* Main attach button */}
            <button
                className={`file-upload__btn ${isMenuOpen ? 'file-upload__btn--active' : ''}`}
                onClick={() => {
                    if (!disabled && !isUploading) {
                        setIsMenuOpen(!isMenuOpen)
                        setShowEphemeralMenu(false)
                    }
                }}
                disabled={disabled || isUploading}
                title="Attach file"
            >
                {isUploading ? (
                    <Loader size={16} className="file-upload__spinner" />
                ) : (
                    <Paperclip size={16} />
                )}
            </button>

            {/* Upload progress */}
            {isUploading && (
                <div className="file-upload__progress">
                    <div
                        className="file-upload__progress-bar"
                        style={{ width: `${uploadProgress}%` }}
                    />
                </div>
            )}

            {/* Error toast */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        className="file-upload__error"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                    >
                        <Shield size={10} />
                        <span>{error}</span>
                        <button onClick={() => setError(null)}><X size={10} /></button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Dropdown menu */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        className="file-upload__menu"
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                    >
                        <div className="file-upload__menu-header">
                            <Shield size={10} />
                            <span>SECURE UPLOAD</span>
                        </div>

                        {/* File type buttons */}
                        {FILE_TYPES.filter(t => config.allowedTypes?.[t.id] !== false).map(type => (
                            <button
                                key={type.id}
                                className="file-upload__menu-item"
                                onClick={() => handleTypeSelect(type)}
                            >
                                <type.icon size={14} />
                                <span>Send {type.label}</span>
                            </button>
                        ))}

                        {/* Ephemeral mode toggle */}
                        {config.ephemeralMedia && (
                            <>
                                <div className="file-upload__menu-divider" />
                                <button
                                    className={`file-upload__menu-item file-upload__menu-item--ephemeral ${showEphemeralMenu ? 'active' : ''}`}
                                    onClick={() => setShowEphemeralMenu(!showEphemeralMenu)}
                                >
                                    <Timer size={14} />
                                    <span>
                                        {ephemeralMode === 'normal' ? 'Ephemeral Mode' :
                                            ephemeralMode === 'view_once' ? 'View Once' :
                                                `${formatTimer(selfDestructTime)}`}
                                    </span>
                                    <ChevronUp size={10} style={{
                                        transform: showEphemeralMenu ? 'rotate(0)' : 'rotate(180deg)',
                                        transition: 'transform 0.2s',
                                        marginLeft: 'auto'
                                    }} />
                                </button>

                                {showEphemeralMenu && (
                                    <div className="file-upload__ephemeral-menu">
                                        <button
                                            className={`file-upload__ephemeral-opt ${ephemeralMode === 'normal' ? 'active' : ''}`}
                                            onClick={() => { setEphemeralMode('normal'); setShowEphemeralMenu(false) }}
                                        >
                                            Normal
                                        </button>

                                        {config.viewOnce && (
                                            <button
                                                className={`file-upload__ephemeral-opt ${ephemeralMode === 'view_once' ? 'active' : ''}`}
                                                onClick={() => { setEphemeralMode('view_once'); setShowEphemeralMenu(false) }}
                                            >
                                                <Eye size={10} /> View Once
                                            </button>
                                        )}

                                        {(config.selfDestructTimers || SELF_DESTRUCT_TIMERS).map(t => (
                                            <button
                                                key={t}
                                                className={`file-upload__ephemeral-opt ${ephemeralMode === 'timed' && selfDestructTime === t ? 'active' : ''}`}
                                                onClick={() => {
                                                    setEphemeralMode('timed')
                                                    setSelfDestructTime(t)
                                                    setShowEphemeralMenu(false)
                                                }}
                                            >
                                                <Timer size={10} /> {formatTimer(t)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// ── Helpers ──

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(file instanceof Blob ? file : file)
    })
}
