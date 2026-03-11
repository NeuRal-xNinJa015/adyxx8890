/**
 * ADYX Secure File Validator
 * 
 * Validates files before encryption/upload:
 *   - Extension whitelist (documents, images, video, audio, archives)
 *   - Executable blocklist
 *   - MIME type verification
 *   - Magic number (file signature) detection
 *   - File size limit enforcement
 * 
 * Usage:
 *   import { validateFile } from './fileValidator.js'
 *   const result = await validateFile(file)  // { valid, error, fileType, category }
 */

import SECURITY_CONFIG from './config.js'

// ── Allowed Extensions by Category ──

const ALLOWED_EXTENSIONS = {
    documents: new Set([
        // Text documents
        'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'wpd', 'pages',
        // Data / structured
        'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
        // Spreadsheets
        'xls', 'xlsx', 'ods', 'numbers',
        // Presentations
        'ppt', 'pptx', 'odp', 'key',
        // Markup / web / code
        'html', 'htm', 'md', 'tex', 'latex', 'bib',
        'css', 'log', 'ini', 'cfg', 'conf', 'toml',
        // E-books
        'epub', 'mobi', 'azw', 'azw3', 'djvu',
        // Microsoft / specialized
        'xps', 'oxps', 'pub', 'ps'
    ]),
    images: new Set([
        // Raster
        'jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff',
        'ico', 'apng',
        // Modern / HDR
        'avif', 'heic', 'heif', 'dds', 'exr',
        // RAW camera
        'raw', 'cr2', 'nef', 'arw', 'dng',
        // Vector
        'svg',
        // Professional / Design
        'psd', 'xcf', 'ai', 'eps', 'cdr', 'indd'
    ]),
    video: new Set([
        'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv',
        'wmv', 'flv', 'f4v', '3gp', '3g2', 'ts', 'mts',
        'm2ts', 'vob', 'mpg', 'mpeg', 'divx', 'asf', 'rm',
        'rmvb', 'swf'
    ]),
    audio: new Set([
        'mp3', 'wav', 'ogg', 'opus', 'm4a', 'aac', 'flac',
        'wma', 'aiff', 'aif', 'alac', 'ape', 'dsf', 'dff',
        'mid', 'midi', 'amr', 'au', 'ra', 'ac3', 'dts',
        'pcm', 'wv', 'mka'
    ]),
    archives: new Set([
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
        'zst', 'lz', 'cab', 'iso', 'dmg'
    ])
}

// ── Blocked Executables ──

const BLOCKED_EXTENSIONS = new Set([
    'exe', 'dll', 'bat', 'sh', 'cmd', 'com', 'msi', 'apk',
    'dmg', 'pkg', 'scr', 'pif', 'vbs', 'vbe', 'js', 'jse',
    'wsf', 'wsh', 'ps1', 'reg', 'inf', 'cpl', 'sys', 'drv'
])

// ── MIME Type Map ──

const MIME_MAP = {
    // Documents
    'pdf': ['application/pdf'],
    'doc': ['application/msword'],
    'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'txt': ['text/plain'],
    'rtf': ['application/rtf', 'text/rtf'],
    'odt': ['application/vnd.oasis.opendocument.text'],
    'csv': ['text/csv', 'application/csv'],
    'tsv': ['text/tab-separated-values'],
    'json': ['application/json', 'text/json'],
    'xml': ['application/xml', 'text/xml'],
    'yaml': ['application/x-yaml', 'text/yaml', 'text/x-yaml'],
    'yml': ['application/x-yaml', 'text/yaml', 'text/x-yaml'],
    'md': ['text/markdown', 'text/x-markdown', 'text/plain'],
    // Images - Raster
    'jpg': ['image/jpeg'],
    'jpeg': ['image/jpeg'],
    'jfif': ['image/jpeg'],
    'png': ['image/png'],
    'apng': ['image/apng', 'image/png'],
    'webp': ['image/webp'],
    'gif': ['image/gif'],
    'bmp': ['image/bmp', 'image/x-ms-bmp'],
    'tif': ['image/tiff'],
    'tiff': ['image/tiff'],
    'ico': ['image/x-icon', 'image/vnd.microsoft.icon'],
    // Images - Modern / HDR
    'avif': ['image/avif'],
    'heic': ['image/heic'],
    'heif': ['image/heif'],
    'dds': ['image/vnd.ms-dds'],
    'exr': ['image/x-exr'],
    // Images - RAW
    'raw': ['image/x-raw'],
    'cr2': ['image/x-canon-cr2'],
    'nef': ['image/x-nikon-nef'],
    'arw': ['image/x-sony-arw'],
    'dng': ['image/x-adobe-dng', 'image/dng'],
    // Images - Vector
    'svg': ['image/svg+xml'],
    // Images - Professional
    'psd': ['image/vnd.adobe.photoshop', 'application/x-photoshop'],
    'xcf': ['image/x-xcf'],
    'ai': ['application/postscript', 'application/illustrator'],
    'eps': ['application/postscript', 'application/eps'],
    'cdr': ['application/cdr', 'application/x-cdr'],
    'indd': ['application/x-indesign'],
    // Video
    'mp4': ['video/mp4'],
    'webm': ['video/webm'],
    'mov': ['video/quicktime'],
    'mkv': ['video/x-matroska'],
    'avi': ['video/x-msvideo', 'video/avi'],
    'm4v': ['video/x-m4v', 'video/mp4'],
    'ogv': ['video/ogg'],
    // Audio
    'mp3': ['audio/mpeg', 'audio/mp3'],
    'wav': ['audio/wav', 'audio/x-wav', 'audio/wave'],
    'ogg': ['audio/ogg'],
    'opus': ['audio/opus', 'audio/ogg'],
    'm4a': ['audio/mp4', 'audio/x-m4a'],
    'aac': ['audio/aac'],
    'flac': ['audio/flac', 'audio/x-flac'],
    // Archives
    'zip': ['application/zip', 'application/x-zip-compressed'],
    'rar': ['application/vnd.rar', 'application/x-rar-compressed'],
    '7z': ['application/x-7z-compressed'],
    'tar': ['application/x-tar'],
    'gz': ['application/gzip', 'application/x-gzip'],
}

// ── Magic Number Signatures (first bytes) ──

const MAGIC_NUMBERS = {
    'pdf': [0x25, 0x50, 0x44, 0x46],           // %PDF
    'png': [0x89, 0x50, 0x4E, 0x47],           // .PNG
    'jpg': [0xFF, 0xD8, 0xFF],                  // JPEG SOI
    'jpeg': [0xFF, 0xD8, 0xFF],
    'gif': [0x47, 0x49, 0x46],                  // GIF
    'bmp': [0x42, 0x4D],                        // BM
    'webp': null, // checked via RIFF header
    'zip': [0x50, 0x4B, 0x03, 0x04],           // PK
    'rar': [0x52, 0x61, 0x72, 0x21],           // Rar!
    '7z': [0x37, 0x7A, 0xBC, 0xAF],           // 7z
    'gz': [0x1F, 0x8B],                        // gzip
    'tar': null, // no single magic number
    'mp4': null, // uses ftyp box (checked separately)
    'mp3': [0xFF, 0xFB],                        // MP3 frame sync (alt: ID3 tag)
    'wav': [0x52, 0x49, 0x46, 0x46],           // RIFF
    'ogg': [0x4F, 0x67, 0x67, 0x53],           // OggS
    'flac': [0x66, 0x4C, 0x61, 0x43],           // fLaC
    'tif': [0x49, 0x49, 0x2A, 0x00],           // TIFF LE
    'tiff': [0x49, 0x49, 0x2A, 0x00],
    'ico': [0x00, 0x00, 0x01, 0x00],           // ICO
    'psd': [0x38, 0x42, 0x50, 0x53],           // 8BPS (Photoshop)
    'cr2': [0x49, 0x49, 0x2A, 0x00],           // TIFF-based
    'dng': [0x49, 0x49, 0x2A, 0x00],           // TIFF-based
    'nef': [0x49, 0x49, 0x2A, 0x00],           // TIFF-based
    'arw': [0x49, 0x49, 0x2A, 0x00],           // TIFF-based
    // EXE/DLL detection (block these)
    'exe': [0x4D, 0x5A],                        // MZ
    'dll': [0x4D, 0x5A],
    'msi': [0xD0, 0xCF, 0x11, 0xE0],
}

// Alternative MP3 magic (ID3 tag)
const MP3_ID3 = [0x49, 0x44, 0x33]              // ID3

/**
 * Validate a file for secure upload.
 * 
 * @param {File} file - The File object to validate
 * @returns {Promise<{ valid: boolean, error?: string, fileType: string, category: string }>}
 */
export async function validateFile(file) {
    if (!file || !(file instanceof File)) {
        return { valid: false, error: 'No file provided', fileType: '', category: '' }
    }

    const config = SECURITY_CONFIG.secureMedia || {}

    // 1. Extract and validate extension
    const fileName = file.name || ''
    const ext = fileName.split('.').pop()?.toLowerCase() || ''

    if (!ext) {
        return { valid: false, error: 'File has no extension', fileType: '', category: '' }
    }

    // 2. Check blocklist first
    if (BLOCKED_EXTENSIONS.has(ext)) {
        return { valid: false, error: `Blocked file type: .${ext} (executable)`, fileType: ext, category: 'blocked' }
    }

    // 3. Find category from whitelist
    const category = getFileCategory(ext)
    if (!category) {
        return { valid: false, error: `Unsupported file type: .${ext}`, fileType: ext, category: 'unknown' }
    }

    // 4. Check if category is enabled in config
    const allowedTypes = config.allowedTypes || {}
    if (allowedTypes[category] === false) {
        return { valid: false, error: `${category} files are disabled`, fileType: ext, category }
    }

    // 5. File size check
    const maxSizeMB = config.maxFileSizeMB || 50
    const maxSizeBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxSizeBytes) {
        return { valid: false, error: `File too large (max ${maxSizeMB}MB)`, fileType: ext, category }
    }

    if (file.size === 0) {
        return { valid: false, error: 'File is empty', fileType: ext, category }
    }

    // 6. MIME type verification
    if (file.type) {
        const allowedMimes = MIME_MAP[ext]
        if (allowedMimes && !allowedMimes.includes(file.type)) {
            // Allow empty MIME — some browsers don't set it
            console.warn(`[FileValidator] MIME mismatch: expected ${allowedMimes}, got ${file.type}`)
            // Don't reject on MIME alone — magic number check is more reliable
        }
    }

    // 7. Magic number verification
    try {
        const isValidSignature = await checkMagicNumber(file, ext)
        if (isValidSignature === false) {
            return { valid: false, error: 'File content does not match extension (possible tampering)', fileType: ext, category }
        }
    } catch (e) {
        console.warn('[FileValidator] Magic number check failed:', e)
        // Don't reject — some file types don't have magic numbers
    }

    // 8. Check for executable signatures in any file
    try {
        const isExecutable = await hasExecutableSignature(file)
        if (isExecutable) {
            return { valid: false, error: 'File contains executable content (blocked)', fileType: ext, category: 'blocked' }
        }
    } catch (e) {
        // Ignore — best-effort check
    }

    return { valid: true, fileType: ext, category }
}

/**
 * Get the category for a file extension.
 */
export function getFileCategory(ext) {
    for (const [category, extensions] of Object.entries(ALLOWED_EXTENSIONS)) {
        if (extensions.has(ext)) return category
    }
    return null
}

/**
 * Get a friendly accept string for file input elements.
 */
export function getAcceptString(category) {
    const acceptMap = {
        images: 'image/*,.heic,.heif,.avif,.cr2,.nef,.arw,.dng,.raw,.psd,.xcf,.ai,.eps,.cdr,.indd,.dds,.exr,.jfif,.ico,.apng',
        video: 'video/*',
        audio: 'audio/*',
        documents: '.pdf,.doc,.docx,.txt,.rtf,.odt,.csv,.tsv,.json,.xml,.yaml,.yml,.md',
        archives: '.zip,.rar,.7z,.tar,.gz',
        all: 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.rtf,.odt,.csv,.tsv,.json,.xml,.yaml,.yml,.md,.zip,.rar,.7z,.tar,.gz,.heic,.heif,.avif'
    }
    return acceptMap[category] || acceptMap.all
}

/**
 * Get human-readable file size.
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
}

// ── Internal Helpers ──

async function checkMagicNumber(file, ext) {
    const magic = MAGIC_NUMBERS[ext]

    // No magic number defined — skip check
    if (magic === undefined || magic === null) return null

    const slice = file.slice(0, 16)
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // Check primary signature
    for (let i = 0; i < magic.length; i++) {
        if (bytes[i] !== magic[i]) {
            // Special case: MP3 can start with ID3 tag instead of frame sync
            if (ext === 'mp3') {
                return checkBytes(bytes, MP3_ID3)
            }
            return false
        }
    }
    return true
}

function checkBytes(bytes, expected) {
    for (let i = 0; i < expected.length; i++) {
        if (bytes[i] !== expected[i]) return false
    }
    return true
}

async function hasExecutableSignature(file) {
    const slice = file.slice(0, 4)
    const buffer = await slice.arrayBuffer()
    const bytes = new Uint8Array(buffer)

    // MZ header (PE executables)
    if (bytes[0] === 0x4D && bytes[1] === 0x5A) return true

    // ELF header (Linux executables)
    if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46) return true

    // Mach-O (macOS executables)
    if (bytes[0] === 0xFE && bytes[1] === 0xED && bytes[2] === 0xFA && bytes[3] === 0xCE) return true
    if (bytes[0] === 0xCE && bytes[1] === 0xFA && bytes[2] === 0xED && bytes[3] === 0xFE) return true

    return false
}
