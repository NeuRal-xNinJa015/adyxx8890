// Convert PNG to ICO format (simple wrapper)
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

const srcPng = path.join(__dirname, 'build', 'icon.png');
const outIco = path.join(__dirname, 'build', 'icon.ico');

async function createIco() {
    // Resize to 256x256 PNG
    const pngBuf = await sharp(srcPng).resize(256, 256).png().toBuffer();

    // ICO file format:
    // ICONDIR header (6 bytes) + ICONDIRENTRY (16 bytes per image) + PNG data
    const icondir = Buffer.alloc(6);
    icondir.writeUInt16LE(0, 0);    // reserved
    icondir.writeUInt16LE(1, 2);    // type: 1 = ICO
    icondir.writeUInt16LE(1, 4);    // count: 1 image

    const entry = Buffer.alloc(16);
    entry.writeUInt8(0, 0);          // width (0 = 256)
    entry.writeUInt8(0, 1);          // height (0 = 256)
    entry.writeUInt8(0, 2);          // color palette
    entry.writeUInt8(0, 3);          // reserved
    entry.writeUInt16LE(1, 4);       // color planes
    entry.writeUInt16LE(32, 6);      // bits per pixel
    entry.writeUInt32LE(pngBuf.length, 8);  // image data size
    entry.writeUInt32LE(22, 12);     // offset (6 + 16 = 22)

    const ico = Buffer.concat([icondir, entry, pngBuf]);
    fs.writeFileSync(outIco, ico);
    console.log('Created icon.ico:', ico.length, 'bytes');
}

createIco().catch(console.error);
