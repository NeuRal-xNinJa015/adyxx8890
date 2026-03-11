import { randomBytes } from 'crypto';
import { log, debug, safeSend } from '../utils/logger.js';
import { connections, isValidDeviceId, checkRate } from '../core/ClientManager.js';
import { rooms, generateRoomCode, isValidRoomCode } from '../core/RoomManager.js';
import { fileStore } from '../core/FileManager.js';
import { VALID_TYPES, FILE_EXPIRY_MS, MAX_PAYLOAD_SIZE, MAX_FILE_SIZE } from '../config/env.js';

export function handleMessage(ws, raw, deviceIdRef, authenticatedRef, connInfoRef) {
    if (raw.length > MAX_PAYLOAD_SIZE) {
        safeSend(ws, { type: 'error', error: 'Message too large' });
        return;
    }

    let msg;
    try {
        msg = JSON.parse(raw.toString());
    } catch (e) {
        safeSend(ws, { type: 'error', message: 'Invalid JSON' });
        return;
    }

    if (!msg.type || !VALID_TYPES.has(msg.type)) {
        safeSend(ws, { type: 'error', error: 'Unknown message type' });
        return;
    }

    // ── AUTH ──
    if (msg.type === 'auth') {
        if (!isValidDeviceId(msg.deviceId)) {
            safeSend(ws, { type: 'error', error: 'Invalid device ID' });
            return;
        }
        deviceIdRef.current = msg.deviceId;
        authenticatedRef.current = true;
        connInfoRef.current = {
            ws, deviceId: msg.deviceId, alive: true,
            roomRateWindow: [], msgRateWindow: []
        };
        connections.set(msg.deviceId, connInfoRef.current);
        debug('AUTH', `Authenticated: ${msg.deviceId}`);
        safeSend(ws, { type: 'auth_ok', deviceId: msg.deviceId, status: 'authenticated' });
        return;
    }

    if (!authenticatedRef.current) {
        safeSend(ws, { type: 'error', message: 'Not authenticated. Send auth message first.' });
        return;
    }

    const deviceId = deviceIdRef.current;
    const connInfo = connInfoRef.current;

    // ── CREATE ROOM ──
    if (msg.type === 'create_room') {
        if (!checkRate(connInfo, 'room')) {
            safeSend(ws, { type: 'error', error: 'Rate limit: too many rooms created. Wait a moment.' });
            return;
        }
        const roomCode = generateRoomCode();
        rooms.set(roomCode, {
            creator: deviceId,
            members: [{ deviceId, ws }],
            lastActivity: Date.now()
        });
        log('ROOM', `Created ${roomCode} by ${deviceId}`);
        safeSend(ws, { type: 'room_created', roomCode });
        return;
    }

    // ── JOIN ROOM ──
    if (msg.type === 'join_room') {
        const roomCode = msg.roomCode;
        if (!isValidRoomCode(roomCode)) {
            safeSend(ws, { type: 'error', error: 'Invalid room code format' });
            return;
        }
        const room = rooms.get(roomCode);
        if (!room) {
            safeSend(ws, { type: 'error', error: 'Room not found' });
            return;
        }
        if (room.members.some(m => m.deviceId === deviceId)) {
            safeSend(ws, { type: 'error', error: 'Already in this room' });
            return;
        }
        if (room.members.length >= 2) {
            safeSend(ws, { type: 'error', error: 'Room is full' });
            return;
        }

        room.members.push({ deviceId, ws });
        room.lastActivity = Date.now();
        log('ROOM', `${deviceId} joined ${roomCode}`);

        safeSend(ws, { type: 'room_joined', roomCode });

        room.members.forEach(member => {
            if (member.deviceId !== deviceId) {
                safeSend(member.ws, { type: 'peer_joined', deviceId, roomCode });
            }
        });
        room.members.forEach(member => {
            if (member.deviceId !== deviceId) {
                safeSend(ws, { type: 'peer_joined', deviceId: member.deviceId, roomCode });
            }
        });
        return;
    }

    // ── KEY EXCHANGE ──
    if (msg.type === 'key_exchange') {
        const roomCode = msg.roomCode;
        if (!msg.publicKey || typeof msg.publicKey !== 'string') return;
        const room = rooms.get(roomCode);
        if (room) {
            room.lastActivity = Date.now();
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    safeSend(member.ws, { type: 'key_exchange', publicKey: msg.publicKey, deviceId, roomCode });
                }
            });
            debug('E2E', `Key exchange relayed in ${roomCode}`);
        }
        return;
    }

    // ── MESSAGE ──
    if (msg.type === 'message') {
        if (!checkRate(connInfo, 'message')) {
            safeSend(ws, { type: 'error', error: 'Rate limit: sending too fast. Slow down.' });
            return;
        }
        const roomCode = msg.roomCode;
        if (!roomCode || typeof roomCode !== 'string') {
            safeSend(ws, { type: 'error', error: 'Missing room code' });
            return;
        }
        if (!msg.payload) {
            safeSend(ws, { type: 'error', error: 'Empty message' });
            return;
        }
        const room = rooms.get(roomCode);
        const messageId = msg.messageId || randomBytes(4).toString('hex');

        if (!room) {
            safeSend(ws, { type: 'error', error: 'Room not found' });
            return;
        }

        room.lastActivity = Date.now();
        let delivered = false;
        room.members.forEach(member => {
            if (member.deviceId !== deviceId) {
                const sent = safeSend(member.ws, {
                    type: 'message',
                    from: deviceId,
                    deviceId,
                    payload: msg.payload,
                    iv: msg.iv || null,
                    encrypted: msg.encrypted || false,
                    messageId
                });
                if (sent) delivered = true;
            }
        });

        safeSend(ws, { type: 'ack', messageId, status: delivered ? 'delivered' : 'queued' });
        return;
    }

    // ── TYPING ──
    if (msg.type === 'typing') {
        const roomCode = msg.roomCode;
        if (!roomCode || typeof roomCode !== 'string') return;
        const room = rooms.get(roomCode);
        if (room) {
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    safeSend(member.ws, { type: 'typing', deviceId });
                }
            });
        }
        return;
    }

    // ── LEAVE ROOM ──
    if (msg.type === 'leave_room') {
        const roomCode = msg.roomCode;
        if (!roomCode || typeof roomCode !== 'string') return;
        const room = rooms.get(roomCode);
        if (room) {
            const idx = room.members.findIndex(m => m.deviceId === deviceId);
            if (idx !== -1) {
                room.members.splice(idx, 1);
                room.members.forEach(member => {
                    safeSend(member.ws, { type: 'peer_left', deviceId, roomCode });
                });
                if (room.members.length === 0) {
                    rooms.delete(roomCode);
                    for (const [fileId, file] of fileStore.entries()) {
                        if (file.roomCode === roomCode) {
                            fileStore.delete(fileId);
                            debug('FILE', `Cleaned: ${fileId} (room empty)`);
                        }
                    }
                    debug('CLEANUP', `Room ${roomCode} deleted (empty after leave)`);
                }
                log('ROOM', `${deviceId} left ${roomCode}`);
            }
        }
        safeSend(ws, { type: 'room_left', roomCode });
        return;
    }

    // ── END SESSION ──
    if (msg.type === 'end_session') {
        const roomCode = msg.roomCode;
        if (!roomCode || typeof roomCode !== 'string') {
            safeSend(ws, { type: 'error', error: 'Missing room code' });
            return;
        }
        const room = rooms.get(roomCode);
        if (room) {
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    safeSend(member.ws, { type: 'session_ended', roomCode, reason: 'Peer ended the session' });
                }
            });
            rooms.delete(roomCode);
            for (const [fileId, file] of fileStore.entries()) {
                if (file.roomCode === roomCode) {
                    fileStore.delete(fileId);
                    debug('FILE', `Cleaned: ${fileId} (session ended)`);
                }
            }
            log('SESSION', `Room ${roomCode} ended by ${deviceId}`);
        }
        safeSend(ws, { type: 'session_ended', roomCode, reason: 'You ended the session' });
        return;
    }

    // ── PRESENCE ──
    if (msg.type === 'presence') {
        debug('PRESENCE', `${deviceId} → ${msg.status}`);
        return;
    }

    // ── REACTION ──
    if (msg.type === 'reaction') {
        // Validate inputs
        if (!msg.messageId || typeof msg.messageId !== 'string' || msg.messageId.length > 100) return;
        if (!msg.reaction || typeof msg.reaction !== 'string' || msg.reaction.length > 10) return;
        const roomCode = msg.roomCode;
        if (!roomCode || typeof roomCode !== 'string') return;
        const room = rooms.get(roomCode);
        if (room) {
            room.lastActivity = Date.now();
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    safeSend(member.ws, {
                        type: 'reaction',
                        messageId: msg.messageId,
                        reaction: msg.reaction,
                        from: deviceId
                    });
                }
            });
            debug('REACTION', `${deviceId} reacted in ${roomCode}`);
        }
        return;
    }

    // ── READ RECEIPT ──
    if (msg.type === 'read_receipt') {
        const roomCode = msg.roomCode;
        if (!roomCode || typeof roomCode !== 'string') return;
        const room = rooms.get(roomCode);
        if (room && Array.isArray(msg.messageIds)) {
            // Cap size to prevent abuse
            const safeIds = msg.messageIds
                .filter(id => typeof id === 'string' && id.length > 0 && id.length <= 100)
                .slice(0, 100);
            if (safeIds.length === 0) return;
            room.members.forEach(member => {
                if (member.deviceId !== deviceId) {
                    safeSend(member.ws, {
                        type: 'read_receipt',
                        messageIds: safeIds,
                        from: deviceId
                    });
                }
            });
            debug('READ', `${deviceId} read ${safeIds.length} msgs in ${roomCode}`);
        }
        return;
    }

    // ── FILE UPLOAD ──
    if (msg.type === 'file_upload') {
        if (!checkRate(connInfo, 'message')) {
            safeSend(ws, { type: 'error', error: 'Rate limit: too many uploads. Slow down.' });
            return;
        }
        const roomCode = msg.roomCode;
        const room = rooms.get(roomCode);
        if (!room) {
            safeSend(ws, { type: 'error', error: 'Room not found' });
            return;
        }
        const fileId = msg.fileId;
        if (!fileId || typeof fileId !== 'string') {
            safeSend(ws, { type: 'error', error: 'Missing file ID' });
            return;
        }

        fileStore.set(fileId, {
            chunks: [],
            totalChunks: msg.totalChunks || 1,
            metadata: msg.encryptedMetadata || null,
            thumbnail: msg.thumbnail || null,
            iv: msg.iv || null,
            hash: msg.hash || null,
            ephemeral: msg.ephemeral || null,
            displayCategory: msg.displayCategory || 'documents',
            expiry: Date.now() + FILE_EXPIRY_MS,
            roomCode,
            senderId: deviceId,
            receivedChunks: 0,
        });

        debug('FILE', `Upload init: ${fileId} (${msg.totalChunks} chunks) by ${deviceId}`);
        safeSend(ws, { type: 'file_upload_ack', fileId, status: 'ready' });
        return;
    }

    // ── FILE CHUNK ──
    if (msg.type === 'file_chunk') {
        const fileId = msg.fileId;
        const file = fileStore.get(fileId);
        if (!file) {
            safeSend(ws, { type: 'error', error: 'File not found — upload first' });
            return;
        }
        if (file.senderId !== deviceId) {
            safeSend(ws, { type: 'error', error: 'Not authorized to upload chunks for this file' });
            return;
        }

        // Validate chunk index
        const chunkIndex = typeof msg.chunkIndex === 'number' ? msg.chunkIndex : file.receivedChunks;
        if (chunkIndex < 0 || chunkIndex >= file.totalChunks) {
            safeSend(ws, { type: 'error', error: 'Invalid chunk index' });
            return;
        }

        // Enforce max file size (sum of all chunk data)
        const chunkSize = typeof msg.data === 'string' ? msg.data.length : 0;
        file._totalBytes = (file._totalBytes || 0) + chunkSize;
        if (file._totalBytes > MAX_FILE_SIZE) {
            fileStore.delete(fileId);
            safeSend(ws, { type: 'error', error: 'File exceeds maximum size limit (50MB)' });
            return;
        }

        file.chunks[chunkIndex] = msg.data;
        file.receivedChunks++;

        if (file.receivedChunks >= file.totalChunks) {
            debug('FILE', `Complete: ${fileId} (${file.chunks.length} chunks)`);
            const room = rooms.get(file.roomCode);
            if (room) {
                room.lastActivity = Date.now();
                room.members.forEach(member => {
                    if (member.deviceId !== deviceId) {
                        safeSend(member.ws, {
                            type: 'file_ready',
                            fileId,
                            from: deviceId,
                            deviceId,
                            totalChunks: file.totalChunks,
                            iv: file.iv,
                            hash: file.hash,
                            encryptedMetadata: file.metadata,
                            thumbnail: file.thumbnail,
                            ephemeral: file.ephemeral,
                            displayCategory: file.displayCategory,
                        });
                    }
                });
            }
            safeSend(ws, { type: 'file_upload_complete', fileId });
        } else {
            safeSend(ws, { type: 'file_chunk_ack', fileId, received: file.receivedChunks });
        }
        return;
    }

    // ── FILE DOWNLOAD ──
    if (msg.type === 'file_download') {
        const fileId = msg.fileId;
        const file = fileStore.get(fileId);
        if (!file) {
            safeSend(ws, { type: 'error', error: 'File not found or expired' });
            return;
        }
        const room = rooms.get(file.roomCode);
        if (!room || !room.members.some(m => m.deviceId === deviceId)) {
            safeSend(ws, { type: 'error', error: 'Not authorized to download this file' });
            return;
        }

        for (let i = 0; i < file.chunks.length; i++) {
            safeSend(ws, {
                type: 'file_chunk_data',
                fileId,
                chunkIndex: i,
                data: file.chunks[i],
                totalChunks: file.chunks.length,
            });
        }
        debug('FILE', `Download: ${fileId} → ${deviceId}`);
        return;
    }

    // ── FILE DELETE ──
    if (msg.type === 'file_delete') {
        const fileId = msg.fileId;
        const file = fileStore.get(fileId);
        if (file && (file.senderId === deviceId || msg.reason === 'panic_wipe')) {
            fileStore.delete(fileId);
            debug('FILE', `Deleted: ${fileId} by ${deviceId}`);
            const room = rooms.get(file.roomCode);
            if (room) {
                room.members.forEach(member => {
                    if (member.deviceId !== deviceId) {
                        safeSend(member.ws, { type: 'file_deleted', fileId });
                    }
                });
            }
        }
        return;
    }
}
