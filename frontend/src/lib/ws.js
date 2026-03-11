// ADYX WebSocket Service — connects to backend relay
// Protocol: auth → create_room / join_room → key_exchange → encrypted messages

import * as e2e from './crypto.js'

// In production, connect directly to the Railway backend via env variable
// In development, use the Vite proxy (/ws → localhost:8443)
const WS_URL = import.meta.env.VITE_WS_URL
    || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`

let socket = null
let deviceId = null
let listeners = {}
let reconnectTimer = null
let connectingPromise = null
let isConnected = false
let manualDisconnect = false
let reconnectAttempts = 0
const MAX_RECONNECT_DELAY = 30000

// Generate a unique device ID per session
function getDeviceId() {
    if (!deviceId) {
        deviceId = 'adyx_' + crypto.randomUUID().split('-')[0]
    }
    return deviceId
}

// Register event listener
export function on(type, callback) {
    if (!listeners[type]) listeners[type] = []
    listeners[type].push(callback)
    return () => {
        listeners[type] = listeners[type].filter(cb => cb !== callback)
    }
}

// Emit to listeners
function emit(type, data) {
    if (listeners[type]) {
        listeners[type].forEach(cb => cb(data))
    }
}

// Send JSON message over WebSocket
function send(msg) {
    try {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msg))
            return true
        }
    } catch (err) {
        console.error('[WS] Send error:', err)
    }
    console.warn('[WS] Not connected, cannot send:', msg.type)
    return false
}

// Connect to the relay server
export function connect() {
    manualDisconnect = false

    if (socket && socket.readyState === WebSocket.OPEN && isConnected) {
        return Promise.resolve()
    }

    if (connectingPromise) {
        return connectingPromise
    }

    connectingPromise = new Promise((resolve, reject) => {
        try {
            socket = new WebSocket(WS_URL)
        } catch (e) {
            connectingPromise = null
            reject(e)
            return
        }

        socket.onopen = () => {
            console.log('[WS] Connected')
            const did = getDeviceId()
            send({ type: 'auth', deviceId: did })
        }

        socket.onmessage = async (event) => {
            try {
                const msg = JSON.parse(event.data)
                // Don't log chunk data to avoid flooding console
                if (msg.type !== 'file_chunk_data' && msg.type !== 'file_chunk_ack') {
                    console.log('[WS] ←', msg.type, msg.type === 'message' ? '(encrypted)' : msg)
                }

                if (msg.type === 'auth_ok') {
                    isConnected = true
                    reconnectAttempts = 0
                    emit('connected', { deviceId: msg.deviceId })
                    connectingPromise = null
                    resolve()
                    return
                }

                // ── Key Exchange ──
                // When peer joins, both sides initiate key exchange
                if (msg.type === 'peer_joined') {
                    // Generate our key pair and send public key to peer
                    const pubKey = await e2e.generateKeyPair()
                    send({ type: 'key_exchange', publicKey: pubKey, roomCode: msg.roomCode || '' })
                    console.log('[E2E] Key pair generated, public key sent')
                    emit('peer_joined', msg)
                    return
                }

                // When we receive peer's public key, derive shared secret
                if (msg.type === 'key_exchange') {
                    if (!e2e.isReady()) {
                        // We haven't generated our keys yet — do it now
                        const pubKey = await e2e.generateKeyPair()
                        send({ type: 'key_exchange', publicKey: pubKey, roomCode: msg.roomCode || '' })
                        console.log('[E2E] Key pair generated (late), public key sent')
                    }
                    await e2e.deriveSharedKey(msg.publicKey)
                    console.log('[E2E] Shared key derived - encryption active')
                    emit('encryption_ready', {})
                    return
                }

                // ── Decrypt incoming messages ──
                if (msg.type === 'message') {
                    let plaintext = msg.payload
                    if (msg.encrypted && msg.iv && e2e.isReady()) {
                        try {
                            plaintext = await e2e.decrypt(msg.payload, msg.iv)
                            console.log('[E2E] Message decrypted')
                        } catch (err) {
                            console.error('[E2E] Decryption failed:', err)
                            plaintext = '[Decryption failed]'
                        }
                    }
                    emit('message', { ...msg, payload: plaintext })
                    return
                }

                // ── File Events ──
                if (msg.type === 'file_ready') {
                    // Peer sent us a file — need to download chunks + decrypt key
                    console.log(`[File] File ready from ${msg.deviceId}: ${msg.fileId}`)
                    emit('file_ready', msg)
                    return
                }

                if (msg.type === 'file_chunk_data') {
                    emit('file_chunk_data', msg)
                    return
                }

                if (msg.type === 'file_upload_ack' || msg.type === 'file_upload_complete') {
                    emit(msg.type, msg)
                    return
                }

                if (msg.type === 'file_chunk_ack') {
                    emit('file_chunk_ack', msg)
                    return
                }

                if (msg.type === 'file_deleted') {
                    console.log(`[File] File deleted: ${msg.fileId}`)
                    emit('file_deleted', msg)
                    return
                }

                emit(msg.type, msg)
            } catch (e) {
                console.error('[WS] Parse error:', e)
            }
        }

        socket.onclose = (event) => {
            console.log('[WS] Disconnected', event.code)
            const wasConnected = isConnected
            isConnected = false
            connectingPromise = null

            if (wasConnected) {
                emit('disconnected', { code: event.code })
            }

            if (!manualDisconnect && !reconnectTimer) {
                reconnectAttempts++
                const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY)
                console.log(`[WS] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`)
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null
                    connect().catch(() => { })
                }, delay)
            }
        }

        socket.onerror = (error) => {
            console.error('[WS] Error:', error)
            connectingPromise = null
            emit('error', { error })
        }

        setTimeout(() => {
            if (!isConnected) {
                connectingPromise = null
                // Close zombie socket to prevent duplicate connections
                if (socket) {
                    socket.onclose = null
                    socket.close()
                    socket = null
                }
                reject(new Error('Connection timeout'))
            }
        }, 5000)
    })
    return connectingPromise
}

// Create a new room (host) — raw send (returns true/false)
export function createRoom() {
    return send({ type: 'create_room' })
}

// Create a new room — Promise-based with auto-cleanup
// Resolves with { roomCode } on success, rejects on failure/timeout
export function createRoomAsync(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            reject(new Error('Not connected to server'))
            return
        }

        let timer = null

        const offCreated = on('room_created', (msg) => {
            clearTimeout(timer)
            offCreated()
            offError()
            resolve(msg)
        })

        const offError = on('error', (msg) => {
            clearTimeout(timer)
            offCreated()
            offError()
            reject(new Error(msg.error || 'Failed to create room'))
        })

        timer = setTimeout(() => {
            offCreated()
            offError()
            reject(new Error('Create room timed out'))
        }, timeoutMs)

        const sent = send({ type: 'create_room' })
        if (!sent) {
            clearTimeout(timer)
            offCreated()
            offError()
            reject(new Error('Failed to send create_room — socket not open'))
        }
    })
}

// Join existing room (guest) — raw send
export function joinRoom(roomCode) {
    return send({ type: 'join_room', roomCode })
}

// Join existing room — Promise-based with auto-cleanup
export function joinRoomAsync(roomCode, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            reject(new Error('Not connected to server'))
            return
        }

        let timer = null

        const offJoined = on('room_joined', (msg) => {
            clearTimeout(timer)
            offJoined()
            offError()
            resolve(msg)
        })

        const offError = on('error', (msg) => {
            clearTimeout(timer)
            offJoined()
            offError()
            reject(new Error(msg.error || 'Failed to join room'))
        })

        timer = setTimeout(() => {
            offJoined()
            offError()
            reject(new Error('Join room timed out'))
        }, timeoutMs)

        const sent = send({ type: 'join_room', roomCode })
        if (!sent) {
            clearTimeout(timer)
            offJoined()
            offError()
            reject(new Error('Failed to send join_room — socket not open'))
        }
    })
}

// Send encrypted message to room peer
export async function sendMessage(payload, roomCode, messageId) {
    const msgId = messageId || crypto.randomUUID().split('-')[0]

    // Encrypt if key exchange is complete
    if (e2e.isReady()) {
        try {
            const { ciphertext, iv } = await e2e.encrypt(payload)
            console.log('[E2E] Message encrypted')
            return send({
                type: 'message',
                roomCode,
                payload: ciphertext,
                iv,
                encrypted: true,
                messageId: msgId
            })
        } catch (err) {
            console.error('[E2E] Encryption failed, sending plaintext:', err)
        }
    }

    // Fallback: send plaintext (before key exchange completes)
    return send({
        type: 'message',
        roomCode,
        payload,
        encrypted: false,
        messageId: msgId
    })
}

// Send typing indicator
export function sendTyping(roomCode) {
    return send({ type: 'typing', roomCode })
}

// Send a reaction on a specific message
export function sendReaction(messageId, reaction, roomCode) {
    if (!messageId || typeof messageId !== 'string') return false
    if (!reaction || typeof reaction !== 'string' || reaction.length > 10) return false
    if (!roomCode || typeof roomCode !== 'string') return false
    return send({ type: 'reaction', messageId, reaction, roomCode })
}

// Send read receipts for a batch of message IDs (capped at 100)
export function sendReadReceipt(messageIds, roomCode) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return false
    if (!roomCode || typeof roomCode !== 'string') return false
    // Cap to prevent oversized payloads
    const safeIds = messageIds.filter(id => typeof id === 'string' && id.length > 0).slice(0, 100)
    if (safeIds.length === 0) return false
    return send({ type: 'read_receipt', messageIds: safeIds, roomCode })
}

// ── Secure File Sharing ──

// Pending file downloads: fileId → { chunks[], totalChunks, resolve, reject }
const pendingDownloads = new Map()

/**
 * Send an encrypted file to room peers.
 * Chunks the encrypted data and sends the file key through E2E channel.
 * 
 * @param {object} fileData - From FileUploadButton's onFileReady
 * @param {string} roomCode
 * @returns {Promise<void>}
 */
export async function sendFile(fileData, roomCode) {
    const { fileId, chunks, totalChunks, iv, hash, keyBase64, encryptedMetadata, thumbnail, ephemeral, displayCategory } = fileData

    if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Not connected to server')
    }

    // 1. Send file key through E2E encrypted channel as a special message
    if (!e2e.isReady()) {
        throw new Error('E2E encryption not ready — cannot send file securely')
    }

    try {
        const keyMsg = JSON.stringify({
            type: 'file_key',
            fileId,
            keyBase64,
        })
        const { ciphertext, iv: keyIv } = await e2e.encrypt(keyMsg)
        send({
            type: 'message',
            roomCode,
            payload: ciphertext,
            iv: keyIv,
            encrypted: true,
            messageId: `fk_${fileId}`,
            isFileKey: true  // marker so ChatScreen can intercept
        })
        console.log('[File] File key sent through E2E channel')
    } catch (err) {
        console.error('[File] Failed to encrypt file key:', err)
        throw err
    }

    // 2. Initiate upload and wait for server ACK before sending chunks
    await new Promise((resolve, reject) => {
        const offAck = on('file_upload_ack', (ack) => {
            if (ack.fileId === fileId) {
                clearTimeout(ackTimeout)
                offAck()
                resolve()
            }
        })
        const ackTimeout = setTimeout(() => {
            offAck()
            reject(new Error('File upload ACK timed out'))
        }, 10000)

        send({
            type: 'file_upload',
            fileId,
            roomCode,
            totalChunks,
            iv,
            hash,
            encryptedMetadata,
            thumbnail,
            ephemeral,
            displayCategory,
        })
    })

    // 3. Send chunks
    for (let i = 0; i < chunks.length; i++) {
        send({
            type: 'file_chunk',
            fileId,
            chunkIndex: i,
            data: chunks[i],
        })
    }

    console.log(`[File] Sent ${chunks.length} chunks for file ${fileId}`)
}

/**
 * Request file download from server.
 * Returns a promise that resolves with all file chunks.
 * 
 * @param {string} fileId
 * @param {string} roomCode
 * @param {number} totalChunks
 * @returns {Promise<string[]>} Array of base64-encoded chunks
 */
export function requestFile(fileId, roomCode, totalChunks) {
    return new Promise((resolve, reject) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            reject(new Error('Not connected to server'))
            return
        }

        const chunks = []
        const timeout = setTimeout(() => {
            pendingDownloads.delete(fileId)
            offChunk()  // Clean up listener to prevent leaks
            reject(new Error('File download timed out'))
        }, 30000)

        pendingDownloads.set(fileId, {
            chunks,
            totalChunks,
            resolve: (data) => {
                clearTimeout(timeout)
                pendingDownloads.delete(fileId)
                resolve(data)
            },
            reject: (err) => {
                clearTimeout(timeout)
                pendingDownloads.delete(fileId)
                reject(err)
            }
        })

        // Listen for chunk data
        const offChunk = on('file_chunk_data', (msg) => {
            if (msg.fileId !== fileId) return
            chunks[msg.chunkIndex] = msg.data

            // Check if all chunks received
            const received = chunks.filter(Boolean).length
            if (received >= totalChunks) {
                offChunk()
                clearTimeout(timeout)
                pendingDownloads.delete(fileId)
                resolve(chunks)
            }
        })

        // Send download request
        send({ type: 'file_download', fileId, roomCode })
    })
}

/**
 * Delete a file from server storage.
 * 
 * @param {string} fileId
 * @param {string} reason - 'manual' | 'panic_wipe'
 */
export function deleteFile(fileId, reason = 'manual') {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    return send({ type: 'file_delete', fileId, reason })
}

// End session — notifies peer via server
export function endSession(roomCode) {
    return send({ type: 'end_session', roomCode })
}

// Disconnect — closes socket but PRESERVES event listeners
export function disconnect() {
    manualDisconnect = true
    connectingPromise = null
    if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
    }
    if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
    }
    isConnected = false
    reconnectAttempts = 0
    deviceId = null
    e2e.reset()  // clear crypto state
}

// Full teardown — only call on app unmount
export function destroy() {
    disconnect()
    listeners = {}
}

// Get connection status
export function getStatus() {
    return {
        connected: isConnected,
        deviceId: getDeviceId(),
        encrypted: e2e.isReady()
    }
}

// Check if E2E encryption is active
export function isEncrypted() {
    return e2e.isReady()
}
