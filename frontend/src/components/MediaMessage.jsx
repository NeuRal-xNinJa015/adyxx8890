import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shield, Eye, Timer, Lock, Image, Video, FileText, Music, AlertTriangle } from 'lucide-react'
import { importFileKey, decryptFile, decryptMetadata, reassembleChunks, verifyFileIntegrity } from '../lib/security/fileCrypto.js'
import { createSecureBuffer } from '../lib/security/fileMemorySecurity.js'
import {
    isExpired, isViewOnceConsumed, getEphemeralInfo,
    createEphemeralSession, formatTimer
} from '../lib/security/ephemeralMedia.js'
import { formatFileSize } from '../lib/security/fileValidator.js'
import SecureMediaViewer from './SecureMediaViewer.jsx'

/**
 * MediaMessage — Renders an encrypted file message in chat.
 *
 * States:
 *   - Encrypted (locked, click to decrypt)
 *   - Decrypting (loading)
 *   - Viewed (opened once)
 *   - Expired (self-destructed or view-once consumed)
 */
export default function MediaMessage({
    fileData,           // { fileId, chunks, iv, hash, keyBase64, encryptedMetadata, thumbnail, ephemeral, displayCategory }
    isSent = false,     // Whether this user sent it
    sessionId = '',
    deviceHash = '',
}) {
    const [status, setStatus] = useState('encrypted')  // encrypted, decrypting, ready, viewed, expired, error
    const [metadata, setMetadata] = useState(null)
    const [viewerOpen, setViewerOpen] = useState(false)
    const [fileUrl, setFileUrl] = useState(null)
    const [bufferId, setBufferId] = useState(null)
    const [error, setError] = useState(null)

    const { fileId, ephemeral, displayCategory } = fileData

    // Check ephemeral status
    useEffect(() => {
        if (!fileId) return

        const checkStatus = () => {
            if (isExpired(fileId) || isViewOnceConsumed(fileId)) {
                setStatus('expired')
                setFileUrl(null)
                setBufferId(null)
            }
        }

        checkStatus()
        const interval = setInterval(checkStatus, 1000)
        return () => clearInterval(interval)
    }, [fileId])

    // Create ephemeral session for received files
    useEffect(() => {
        if (!isSent && fileId && ephemeral?.mode && ephemeral.mode !== 'normal') {
            createEphemeralSession(
                fileId,
                ephemeral.mode,
                ephemeral.duration || 0,
                fileData.keyBase64,
                () => {
                    setStatus('expired')
                    setFileUrl(null)
                    setViewerOpen(false)
                }
            )
        }
    }, [fileId, isSent])

    const handleOpen = useCallback(async () => {
        if (status === 'expired') return
        if (status === 'ready' || status === 'viewed') {
            // Already decrypted — check if still valid
            if (isExpired(fileId) || isViewOnceConsumed(fileId)) {
                setStatus('expired')
                return
            }
            setViewerOpen(true)
            return
        }

        setStatus('decrypting')
        setError(null)

        try {
            // 1. Import file key
            const key = await importFileKey(fileData.keyBase64)

            // 2. Decrypt metadata
            if (fileData.encryptedMetadata) {
                const meta = await decryptMetadata(
                    fileData.encryptedMetadata.encrypted,
                    key,
                    fileData.encryptedMetadata.iv
                )
                setMetadata(meta)
            }

            // 3. Reassemble chunks
            const encryptedBuffer = reassembleChunks(fileData.chunks)

            // 4. Verify integrity
            if (fileData.hash) {
                const valid = await verifyFileIntegrity(encryptedBuffer, fileData.hash)
                if (!valid) {
                    throw new Error('Integrity check failed — file may be corrupted')
                }
            }

            // 5. Decrypt file
            const iv = new Uint8Array(fileData.iv)
            const decryptedBuffer = await decryptFile(encryptedBuffer, key, iv)

            // 6. Create secure buffer + blob URL
            const mimeType = metadata?.type || getMimeFromCategory(displayCategory)
            const { id: bufId, url } = createSecureBuffer(decryptedBuffer, mimeType)

            setBufferId(bufId)
            setFileUrl(url)
            setStatus('ready')
            setViewerOpen(true)
        } catch (err) {
            console.error('[MediaMessage] Decryption failed:', err)
            setError(err.message || 'Decryption failed')
            setStatus('error')
        }
    }, [fileData, fileId, status, metadata, displayCategory])

    const handleViewerClose = useCallback(() => {
        setViewerOpen(false)
        if (status === 'ready') {
            setStatus('viewed')
        }
        // Check if now expired
        if (isExpired(fileId) || isViewOnceConsumed(fileId)) {
            setStatus('expired')
            setFileUrl(null)
        }
    }, [fileId, status])

    const getCategoryIcon = () => {
        switch (displayCategory) {
            case 'images': return <Image size={16} />
            case 'video': return <Video size={16} />
            case 'audio': return <Music size={16} />
            default: return <FileText size={16} />
        }
    }

    const getCategoryLabel = () => {
        switch (displayCategory) {
            case 'images': return 'Encrypted Image'
            case 'video': return 'Encrypted Video'
            case 'audio': return 'Encrypted Audio'
            case 'documents': return 'Encrypted Document'
            default: return 'Encrypted File'
        }
    }

    // ── Expired state ──
    if (status === 'expired') {
        return (
            <div className={`media-msg media-msg--expired media-msg--${isSent ? 'sent' : 'received'}`}>
                <div className="media-msg__expired-content">
                    <Lock size={14} />
                    <span>Secure Media Expired</span>
                </div>
                {ephemeral?.mode === 'view_once' && (
                    <div className="media-msg__expired-reason">
                        <Eye size={9} /> View once — already viewed
                    </div>
                )}
                {ephemeral?.mode === 'timed' && (
                    <div className="media-msg__expired-reason">
                        <Timer size={9} /> Self-destructed
                    </div>
                )}
            </div>
        )
    }

    // ── Error state ──
    if (status === 'error') {
        return (
            <div className={`media-msg media-msg--error media-msg--${isSent ? 'sent' : 'received'}`}>
                <div className="media-msg__error-content">
                    <AlertTriangle size={14} />
                    <span>{error || 'Decryption failed'}</span>
                </div>
            </div>
        )
    }

    // ── Normal / encrypted / decrypting / ready ──
    const ephemeralInfo = getEphemeralInfo(fileId)

    return (
        <>
            <motion.div
                className={`media-msg media-msg--${isSent ? 'sent' : 'received'} media-msg--${status}`}
                onClick={handleOpen}
                whileHover={{ scale: status === 'decrypting' ? 1 : 1.01 }}
                whileTap={{ scale: status === 'decrypting' ? 1 : 0.98 }}
                style={{ cursor: status === 'decrypting' ? 'wait' : 'pointer' }}
            >
                <div className="media-msg__icon">
                    {status === 'decrypting' ? (
                        <div className="media-msg__spinner" />
                    ) : (
                        getCategoryIcon()
                    )}
                </div>
                <div className="media-msg__info">
                    <div className="media-msg__title">
                        {status === 'decrypting' ? 'Decrypting...' : getCategoryLabel()}
                    </div>
                    <div className="media-msg__meta">
                        {metadata ? (
                            <>
                                <span>{metadata.name}</span>
                                <span className="media-msg__dot">·</span>
                                <span>{formatFileSize(metadata.size)}</span>
                            </>
                        ) : (
                            <span>Click to decrypt</span>
                        )}
                    </div>
                </div>
                <div className="media-msg__badges">
                    {/* Encryption badge */}
                    <span className="media-msg__badge media-msg__badge--encrypted">
                        <Lock size={8} />
                    </span>

                    {/* Status badge */}
                    {status === 'viewed' && (
                        <span className="media-msg__badge media-msg__badge--viewed">
                            <Eye size={8} />
                        </span>
                    )}

                    {/* Ephemeral badge */}
                    {ephemeral?.mode === 'view_once' && (
                        <span className="media-msg__badge media-msg__badge--ephemeral">
                            <Eye size={8} /> 1×
                        </span>
                    )}
                    {ephemeral?.mode === 'timed' && (
                        <span className="media-msg__badge media-msg__badge--ephemeral">
                            <Timer size={8} /> {formatTimer(ephemeral.duration)}
                        </span>
                    )}
                </div>
            </motion.div>

            {/* Secure Media Viewer */}
            <SecureMediaViewer
                isOpen={viewerOpen}
                onClose={handleViewerClose}
                fileUrl={fileUrl}
                fileType={getCategoryForViewer(displayCategory)}
                fileName={metadata?.name}
                fileId={fileId}
                bufferId={bufferId}
                sessionId={sessionId}
                deviceHash={deviceHash}
                ephemeralMode={ephemeral?.mode || 'normal'}
            />
        </>
    )
}

// ── Helpers ──

function getMimeFromCategory(category) {
    const mimeMap = {
        images: 'image/jpeg',
        video: 'video/mp4',
        audio: 'audio/mpeg',
        documents: 'application/octet-stream',
    }
    return mimeMap[category] || 'application/octet-stream'
}

function getCategoryForViewer(category) {
    const map = {
        images: 'image',
        video: 'video',
        audio: 'audio',
        documents: 'document',
    }
    return map[category] || 'document'
}
