import { MAX_DEVICE_ID_LEN, RATE_LIMIT_ROOMS, RATE_LIMIT_MESSAGES } from '../config/env.js';

export const connections = new Map(); // deviceId → { ws, alive, roomRateWindow, msgRateWindow }

export function isValidDeviceId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= MAX_DEVICE_ID_LEN && /^[a-zA-Z0-9_-]+$/.test(id);
}

export function checkRate(connInfo, type) {
    const now = Date.now();
    const window = type === 'room' ? connInfo.roomRateWindow : connInfo.msgRateWindow;
    const limit = type === 'room' ? RATE_LIMIT_ROOMS : RATE_LIMIT_MESSAGES;

    while (window.length > 0 && window[0] < now - 60000) {
        window.shift();
    }

    if (window.length >= limit) return false;
    window.push(now);
    return true;
}
