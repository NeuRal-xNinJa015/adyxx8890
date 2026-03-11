import { WebSocketServer } from 'ws';
import { log, debug, safeSend } from '../utils/logger.js';
import { connections } from '../core/ClientManager.js';
import { rooms } from '../core/RoomManager.js';
import { handleMessage } from './handlers.js';
import { HEARTBEAT_INTERVAL } from '../config/env.js';

export function initializeWebSocket(httpServer) {
    const wss = new WebSocketServer({ server: httpServer });

    // ── Heartbeat ──
    setInterval(() => {
        wss.clients.forEach(ws => {
            const info = [...connections.values()].find(c => c.ws === ws);
            if (info && !info.alive) {
                log('HEARTBEAT', `Terminating stale: ${info.deviceId || 'unknown'}`);
                ws.terminate();
                return;
            }
            if (info) info.alive = false;
            ws.ping();
        });
    }, HEARTBEAT_INTERVAL);

    wss.on('connection', (ws) => {
        const deviceIdRef = { current: null };
        const authenticatedRef = { current: false };
        const connInfoRef = { current: null };

        debug('WS', 'New connection');

        ws.on('pong', () => {
            if (connInfoRef.current) connInfoRef.current.alive = true;
        });

        ws.on('message', (raw) => {
            handleMessage(ws, raw, deviceIdRef, authenticatedRef, connInfoRef);
        });

        ws.on('close', () => {
            const deviceId = deviceIdRef.current;
            debug('WS', `Disconnected: ${deviceId}`);
            if (deviceId) {
                connections.delete(deviceId);
                for (const [roomCode, room] of rooms.entries()) {
                    const idx = room.members.findIndex(m => m.deviceId === deviceId);
                    if (idx !== -1) {
                        room.members.splice(idx, 1);
                        room.members.forEach(member => {
                            safeSend(member.ws, { type: 'peer_left', deviceId });
                        });
                        if (room.members.length === 0) {
                            rooms.delete(roomCode);
                            debug('CLEANUP', `Room ${roomCode} deleted (empty)`);
                        }
                    }
                }
            }
        });

        ws.on('error', (err) => {
            log('ERROR', `${deviceIdRef.current}: ${err.message}`);
        });
    });

    return wss;
}
