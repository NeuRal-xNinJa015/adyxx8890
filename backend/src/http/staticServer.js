import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';
import { gzipSync } from 'zlib';
import { STATIC_DIR, IS_PROD, VERSION, PORT, NODE_ENV } from '../config/env.js';
import { log } from '../utils/logger.js';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml',
    '.wasm': 'application/wasm',
    '.map': 'application/json',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml', '.map']);
const staticCache = IS_PROD ? new Map() : null;

function getCacheControl(filePath) {
    if (filePath.endsWith('index.html')) return 'no-cache, no-store, must-revalidate';
    const basename = filePath.split(/[/\\]/).pop();
    if (basename && /[-\.][a-zA-Z0-9]{8,}\.(js|css|woff2?|ttf|png|jpg|svg|webp|avif)$/.test(basename)) {
        return 'public, max-age=31536000, immutable';
    }
    return 'public, max-age=3600';
}

export function serveStaticFile(req, res, corsHeaders) {
    if (!existsSync(STATIC_DIR)) {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>ADYX — Starting</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#050505;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh}
.c{text-align:center;max-width:480px;padding:2rem}.t{font-size:2.5rem;margin-bottom:.5rem;letter-spacing:4px;font-weight:200}
.s{opacity:.5;margin-bottom:2rem;font-size:.9rem}code{background:#111;padding:4px 12px;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:.85rem;border:1px solid #222}
.d{margin-top:1rem;opacity:.3;font-size:.8rem}</style></head>
<body><div class="c"><div class="t">ADYX</div><div class="s">Backend is running. Frontend not compiled yet.</div>
<p>Run <code>npm run build</code> then restart the server.</p>
<p style="margin-top:.75rem">Or use <code>npm run dev</code> for development.</p>
<div class="d">v${VERSION} • Port ${PORT} • ${NODE_ENV}</div></div></body></html>`);
        return;
    }

    let urlPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    if (urlPath === '/') urlPath = '/index.html';

    let filePath = join(STATIC_DIR, urlPath);

    if (!resolve(filePath).startsWith(STATIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    try {
        if (existsSync(filePath) && statSync(filePath).isFile()) {
            const ext = extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const cacheControl = getCacheControl(filePath);
            const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip');
            const shouldCompress = COMPRESSIBLE.has(ext) && acceptsGzip;

            const cacheKey = filePath + (shouldCompress ? ':gz' : '');
            if (staticCache && staticCache.has(cacheKey)) {
                const cached = staticCache.get(cacheKey);
                const headers = { 'Content-Type': contentType, 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff', ...corsHeaders };
                if (shouldCompress) headers['Content-Encoding'] = 'gzip';
                res.writeHead(200, headers);
                res.end(cached);
                return;
            }

            let content = readFileSync(filePath);
            const headers = { 'Content-Type': contentType, 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff', ...corsHeaders };

            if (shouldCompress) {
                content = gzipSync(content);
                headers['Content-Encoding'] = 'gzip';
            }

            if (staticCache && content.length < 1024 * 1024) staticCache.set(cacheKey, content);

            res.writeHead(200, headers);
            res.end(content);
        } else {
            const indexPath = join(STATIC_DIR, 'index.html');
            if (existsSync(indexPath)) {
                const content = readFileSync(indexPath);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'X-Content-Type-Options': 'nosniff', ...corsHeaders });
                res.end(content);
            } else {
                res.writeHead(404, corsHeaders);
                res.end('Not found');
            }
        }
    } catch (err) {
        log('HTTP', `Error serving ${urlPath}: ${err.message}`);
        res.writeHead(500, corsHeaders);
        res.end('Internal server error');
    }
}
