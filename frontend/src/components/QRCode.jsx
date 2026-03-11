import { useEffect, useRef } from 'react'

/**
 * QRCode — Lightweight QR code generator using Canvas.
 * Uses a simple QR encoding algorithm for alphanumeric data (room codes).
 * No external dependencies.
 */

// QR code encoding tables
const EC_CODEWORDS_L = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28]
const ALPHANUMERIC_TABLE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

function encodeAlphanumeric(str) {
    const s = str.toUpperCase()
    const bits = []
    for (let i = 0; i < s.length; i += 2) {
        if (i + 1 < s.length) {
            const val = ALPHANUMERIC_TABLE.indexOf(s[i]) * 45 + ALPHANUMERIC_TABLE.indexOf(s[i + 1])
            bits.push(...toBits(val, 11))
        } else {
            bits.push(...toBits(ALPHANUMERIC_TABLE.indexOf(s[i]), 6))
        }
    }
    return bits
}

function toBits(val, len) {
    const bits = []
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
    return bits
}

// Simple QR matrix generation (Version 1, Error Correction L)
function generateQRMatrix(text) {
    // For short room codes, use a simple approach: encode as a data URL
    // and render using canvas. For a proper zero-dep QR, we generate a
    // basic matrix pattern.
    const size = 21 // Version 1 QR is 21x21
    const matrix = Array.from({ length: size }, () => Array(size).fill(0))

    // Add finder patterns (top-left, top-right, bottom-left)
    addFinderPattern(matrix, 0, 0)
    addFinderPattern(matrix, size - 7, 0)
    addFinderPattern(matrix, 0, size - 7)

    // Add timing patterns
    for (let i = 8; i < size - 8; i++) {
        matrix[6][i] = i % 2 === 0 ? 1 : 0
        matrix[i][6] = i % 2 === 0 ? 1 : 0
    }

    // Dark module
    matrix[size - 8][8] = 1

    // Fill data area with encoded text pattern
    const dataBits = encodeTextToDataBits(text)
    fillDataBits(matrix, dataBits, size)

    return matrix
}

function addFinderPattern(matrix, row, col) {
    const pattern = [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 1, 1, 1, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1],
    ]
    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            if (row + r < matrix.length && col + c < matrix.length) {
                matrix[row + r][col + c] = pattern[r][c]
            }
        }
    }
    // Separator
    for (let i = -1; i <= 7; i++) {
        setIfValid(matrix, row - 1, col + i, 0)
        setIfValid(matrix, row + 7, col + i, 0)
        setIfValid(matrix, row + i, col - 1, 0)
        setIfValid(matrix, row + i, col + 7, 0)
    }
}

function setIfValid(matrix, r, c, val) {
    if (r >= 0 && r < matrix.length && c >= 0 && c < matrix.length) {
        matrix[r][c] = val
    }
}

function encodeTextToDataBits(text) {
    const bits = []
    // Mode indicator: alphanumeric (0010)
    bits.push(0, 0, 1, 0)
    // Character count (9 bits for version 1)
    const len = text.length
    bits.push(...toBits(len, 9))
    // Alphanumeric encoding
    bits.push(...encodeAlphanumeric(text))
    // Terminator
    bits.push(0, 0, 0, 0)
    // Pad to 8-bit boundary
    while (bits.length % 8 !== 0) bits.push(0)
    // Pad codewords
    const padBytes = [0xEC, 0x11]
    let pi = 0
    while (bits.length < 152) { // 19 data codewords * 8
        bits.push(...toBits(padBytes[pi % 2], 8))
        pi++
    }
    return bits
}

function fillDataBits(matrix, bits, size) {
    let bitIdx = 0
    let upward = true

    for (let col = size - 1; col >= 0; col -= 2) {
        if (col === 6) col = 5 // Skip timing column

        const rows = upward
            ? Array.from({ length: size }, (_, i) => size - 1 - i)
            : Array.from({ length: size }, (_, i) => i)

        for (const row of rows) {
            for (let c = 0; c < 2; c++) {
                const actualCol = col - c
                if (actualCol < 0) continue
                if (isReserved(row, actualCol, size)) continue
                if (bitIdx < bits.length) {
                    matrix[row][actualCol] = bits[bitIdx] ^ ((row + actualCol) % 2 === 0 ? 1 : 0)
                    bitIdx++
                }
            }
        }
        upward = !upward
    }
}

function isReserved(row, col, size) {
    // Finder patterns + separators
    if (row < 9 && col < 9) return true
    if (row < 9 && col >= size - 8) return true
    if (row >= size - 8 && col < 9) return true
    // Timing patterns
    if (row === 6 || col === 6) return true
    // Dark module
    if (row === size - 8 && col === 8) return true
    return false
}

export default function QRCode({ text, size = 120, fgColor = '#ffffff', bgColor = 'transparent' }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        if (!canvasRef.current || !text) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const matrix = generateQRMatrix(text.toUpperCase())
        const modules = matrix.length
        const cellSize = size / (modules + 2) // +2 for quiet zone

        canvas.width = size
        canvas.height = size

        // Background
        ctx.fillStyle = bgColor
        ctx.fillRect(0, 0, size, size)

        // Draw modules
        ctx.fillStyle = fgColor
        const offset = cellSize // quiet zone

        for (let row = 0; row < modules; row++) {
            for (let col = 0; col < modules; col++) {
                if (matrix[row][col]) {
                    ctx.fillRect(
                        offset + col * cellSize,
                        offset + row * cellSize,
                        cellSize,
                        cellSize
                    )
                }
            }
        }
    }, [text, size, fgColor, bgColor])

    return (
        <canvas
            ref={canvasRef}
            width={size}
            height={size}
            className="qr-code"
            title={`QR: ${text}`}
        />
    )
}
