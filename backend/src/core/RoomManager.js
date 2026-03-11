import { randomBytes } from 'crypto';
import { log, debug, safeSend } from '../utils/logger.js';
import { ROOM_TTL } from '../config/env.js';
import { fileStore } from './FileManager.js';

export const rooms = new Map(); // roomCode → { creator, members[], lastActivity }

export function generateRoomCode() {
    return randomBytes(3).toString('hex');
}

export function isValidRoomCode(code) {
    return typeof code === 'string' && /^[a-f0-9]{6}$/.test(code);
}

export function cleanupExpiredRooms() {
    const now = Date.now();
    for (const [roomCode, room] of rooms.entries()) {
        if (now - room.lastActivity > ROOM_TTL) {
            log('CLEANUP', `Room ${roomCode} expired (idle ${Math.round((now - room.lastActivity) / 1000)}s)`);
            room.members.forEach(m => {
                safeSend(m.ws, { type: 'session_ended', roomCode, reason: 'Room expired due to inactivity' });
            });
            rooms.delete(roomCode);
            // Clean up files tied to this room
            for (const [fileId, file] of fileStore.entries()) {
                if (file.roomCode === roomCode) {
                    fileStore.delete(fileId);
                    debug('FILE', `Cleaned: ${fileId} (room expired)`);
                }
            }
        }
    }
}
