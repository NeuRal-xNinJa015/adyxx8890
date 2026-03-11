import { IS_PROD } from '../config/env.js';

export function timestamp() {
    return new Date().toISOString().slice(11, 23);
}

export function log(tag, ...args) {
    console.log(`[${timestamp()}] [${tag}]`, ...args);
}

export function debug(tag, ...args) {
    if (!IS_PROD) console.log(`[${timestamp()}] [${tag}]`, ...args);
}

export function safeSend(ws, data) {
    try {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(typeof data === 'string' ? data : JSON.stringify(data));
            return true;
        }
    } catch (err) {
        log('SEND_ERR', err.message);
    }
    return false;
}
