import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(join(__filename, '..', '..')); // points to backend/src

export const STATIC_DIR = resolve(join(__dirname, '..', '..', 'frontend', 'dist'));
export const VERSION = '1.0.0';

export const PORT = parseInt(process.env.PORT || '8443', 10);
export const NODE_ENV = process.env.NODE_ENV || 'production';
export const IS_PROD = NODE_ENV === 'production';

export const HEARTBEAT_INTERVAL = 30_000;          // 30s ping/pong
export const ROOM_TTL = 10 * 60 * 1000;            // 10 min idle cleanup
export const RATE_LIMIT_ROOMS = 5;                 // max rooms created per 60s
export const RATE_LIMIT_MESSAGES = 60;             // max messages per 60s
export const MAX_PAYLOAD_SIZE = 256 * 1024;        // 256KB per WebSocket frame
export const MAX_DEVICE_ID_LEN = 32;
export const MAX_FILE_SIZE = 50 * 1024 * 1024;     // 50MB max assembled file
export const FILE_EXPIRY_MS = 10 * 60 * 1000;      // 10 min file expiry

export const VALID_TYPES = new Set([
    'auth', 'create_room', 'join_room', 'leave_room', 'key_exchange',
    'message', 'typing', 'end_session', 'presence',
    'file_upload', 'file_chunk', 'file_download', 'file_delete',
    'reaction', 'read_receipt'
]);
