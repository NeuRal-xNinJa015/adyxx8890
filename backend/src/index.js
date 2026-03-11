import { httpServer } from './http/server.js';
import { initializeWebSocket } from './websocket/server.js';
import { cleanupExpiredRooms } from './core/RoomManager.js';
import { cleanupExpiredFiles } from './core/FileManager.js';
import { log, safeSend } from './utils/logger.js';
import { PORT, VERSION, NODE_ENV, STATIC_DIR, HEARTBEAT_INTERVAL, ROOM_TTL } from './config/env.js';
import { existsSync } from 'fs';

const wss = initializeWebSocket(httpServer);

// ── Room & File TTL Cleanup ──
setInterval(() => {
    cleanupExpiredRooms();
    cleanupExpiredFiles();
}, 60_000);

// ── Graceful Shutdown ──
function shutdown(signal) {
    log('SERVER', `${signal} — shutting down gracefully`);
    wss.clients.forEach(ws => {
        safeSend(ws, { type: 'session_ended', reason: 'Server shutting down' });
        try { ws.close(1001, 'Server shutting down'); } catch (_) { /* ignore */ }
    });
    httpServer.close(() => {
        log('SERVER', 'Shutdown complete');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    log('ERROR', `Unhandled promise rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
    log('FATAL', `Uncaught exception: ${err.message}`);
    shutdown('uncaughtException');
});

// ── Start Server ──
const hasFrontend = existsSync(STATIC_DIR);
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║           A D Y X   S E R V E R             ║');
    console.log('  ║     Zero-Knowledge Communication            ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Version     ${VERSION}`);
    console.log(`  Mode        ${NODE_ENV}`);
    console.log(`  Port        ${PORT}`);
    console.log(`  WebSocket   ws://0.0.0.0:${PORT}`);
    console.log(`  Health      http://0.0.0.0:${PORT}/health`);
    console.log(`  Heartbeat   ${HEARTBEAT_INTERVAL / 1000}s`);
    console.log(`  Room TTL    ${ROOM_TTL / 60000} min`);
    console.log(`  Frontend    ${hasFrontend ? '✓ Serving from ' + STATIC_DIR : '✗ Not built (run npm run build)'}`);
    console.log('');
    if (hasFrontend) {
        console.log(`  → Open http://localhost:${PORT}`);
    } else {
        console.log('  → Run "npm run build" to compile frontend');
        console.log(`  → Then open http://localhost:${PORT}`);
    }
});
