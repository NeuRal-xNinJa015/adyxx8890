import { createServer } from 'http';
import { serveStaticFile } from './staticServer.js';
import { VERSION, NODE_ENV } from '../config/env.js';
import { connections } from '../core/ClientManager.js';
import { rooms } from '../core/RoomManager.js';
import { fileStore } from '../core/FileManager.js';
import { log } from '../utils/logger.js';

export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export const httpServer = createServer((req, res) => {
    const startTime = Date.now();
    // ── CORS Preflight ──
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
    }

    // ── Health Check ──
    if (req.url === '/health' && req.method === 'GET') {
        const uptime = process.uptime();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS });
        res.end(JSON.stringify({
            status: 'ok',
            version: VERSION,
            env: NODE_ENV,
            uptime: Math.round(uptime),
            uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
            connections: connections.size,
            rooms: rooms.size,
            files: fileStore.size,
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        }));
        return;
    }

    // ── Server Info (API) ──
    if (req.url === '/api/info' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS });
        res.end(JSON.stringify({
            name: 'ADYX',
            version: VERSION,
            protocol: 'WebSocket JSON',
            encryption: 'ECDH P-256 + AES-256-GCM',
            features: ['e2ee', 'file_sharing', 'ephemeral_rooms', 'zero_trace']
        }));
        return;
    }

    // ── Static Files (Frontend) ──
    serveStaticFile(req, res, CORS_HEADERS);
});
