import { debug } from '../utils/logger.js';
export const fileStore = new Map(); // fileId   → { chunks[], totalChunks, metadata, ... }

export function cleanupExpiredFiles() {
    const now = Date.now();
    for (const [fileId, file] of fileStore.entries()) {
        if (file.expiry && now > file.expiry) {
            fileStore.delete(fileId);
            debug('FILE', `Expired: ${fileId}`);
        }
    }
}
