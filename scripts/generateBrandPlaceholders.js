/**
 * scripts/generateBrandPlaceholders.js
 * 
 * Generates placeholder raster images (.png) and favicon (.ico)
 * matching the TeamForge brand colors (#1E3A8A, #14B8A6, #2563EB)
 * until final high-res custom assets are provided.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, crcData, crc]);
}

function createPng(width, height, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // 8 bits per channel
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // no interlace

  const rowLen = 1 + width * 4;
  const raw = Buffer.alloc(rowLen * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    raw[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a !== undefined ? a : 255;
    }
  }

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function createIcoFromPng(pngBuffer, width = 32, height = 32) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(1, 4); // count of images

  // Icon entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry.writeUInt8(width >= 256 ? 0 : width, 0);
  entry.writeUInt8(height >= 256 ? 0 : height, 1);
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // image size
  entry.writeUInt32LE(22, 12); // offset (6 + 16 = 22)

  return Buffer.concat([header, entry, pngBuffer]);
}

const imagesDir = path.join(__dirname, '..', 'public', 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// 1. Favicon 32x32 PNG (#1E3A8A navy background with #14B8A6 accent dot)
const fav32 = createPng(32, 32, (x, y, w, h) => {
  // Rounded corner border effect
  const isCorner = (x < 2 && y < 2) || (x >= w - 2 && y < 2) || (x < 2 && y >= h - 2) || (x >= w - 2 && y >= h - 2);
  if (isCorner) return [0, 0, 0, 0];
  // Accent dot at top right
  if (x >= 22 && x <= 26 && y >= 6 && y <= 10) {
    return [20, 184, 166, 255]; // #14B8A6
  }
  // TF Lettermark approximation in center
  const isT = (y >= 10 && y <= 13 && x >= 8 && x <= 18) || (y >= 13 && y <= 24 && x >= 12 && x <= 14);
  const isF = (y >= 10 && y <= 24 && x >= 17 && x <= 19) || (y >= 10 && y <= 13 && x >= 19 && x <= 25) || (y >= 16 && y <= 18 && x >= 19 && x <= 23);
  if (isT || isF) return [255, 255, 255, 255];
  // Gradient navy background
  const mix = Math.floor(30 + (x + y) * 0.5);
  return [mix, 58, 138, 255];
});
fs.writeFileSync(path.join(imagesDir, 'favicon-32.png'), fav32);

// 2. Favicon ICO (wrapping 32x32 PNG)
const icoBuf = createIcoFromPng(fav32, 32, 32);
fs.writeFileSync(path.join(imagesDir, 'favicon.ico'), icoBuf);

// 3. Apple Touch Icon 180x180 PNG
const appleTouch = createPng(180, 180, (x, y, w, h) => {
  const isCorner = (x < 16 && y < 16 && (16 - x) ** 2 + (16 - y) ** 2 > 256) ||
                   (x > w - 16 && y < 16 && (x - (w - 16)) ** 2 + (16 - y) ** 2 > 256) ||
                   (x < 16 && y > h - 16 && (16 - x) ** 2 + (y - (h - 16)) ** 2 > 256) ||
                   (x > w - 16 && y > h - 16 && (x - (w - 16)) ** 2 + (y - (h - 16)) ** 2 > 256);
  if (isCorner) return [0, 0, 0, 0];

  // Accent dot
  const dx = x - 138;
  const dy = y - 48;
  if (dx * dx + dy * dy <= 120) {
    return [20, 184, 166, 255]; // #14B8A6
  }

  // Large TF lettermark
  const isT = (y >= 45 && y <= 62 && x >= 40 && x <= 92) || (y >= 62 && y <= 135 && x >= 60 && x <= 72);
  const isF = (y >= 45 && y <= 135 && x >= 96 && x <= 108) || (y >= 45 && y <= 62 && x >= 108 && x <= 135) || (y >= 82 && y <= 98 && x >= 108 && x <= 128);
  if (isT || isF) return [255, 255, 255, 255];

  // Subtle gradient: #1E3A8A to #2563EB
  const ratio = (x + y) / (w + h);
  const r = Math.round(30 + ratio * (37 - 30));
  const g = Math.round(58 + ratio * (99 - 58));
  const b = Math.round(138 + ratio * (235 - 138));
  return [r, g, b, 255];
});
fs.writeFileSync(path.join(imagesDir, 'apple-touch-icon.png'), appleTouch);

// 4. Logo Icon 64x64 PNG
const logoIcon = createPng(64, 64, (x, y, w, h) => {
  const isCorner = (x < 6 && y < 6 && (6 - x) ** 2 + (6 - y) ** 2 > 36) ||
                   (x > w - 6 && y < 6 && (x - (w - 6)) ** 2 + (6 - y) ** 2 > 36) ||
                   (x < 6 && y > h - 6 && (6 - x) ** 2 + (y - (h - 6)) ** 2 > 36) ||
                   (x > w - 6 && y > h - 6 && (x - (w - 6)) ** 2 + (y - (h - 6)) ** 2 > 36);
  if (isCorner) return [0, 0, 0, 0];

  // Accent dot
  const dx = x - 49;
  const dy = y - 18;
  if (dx * dx + dy * dy <= 16) {
    return [20, 184, 166, 255]; // #14B8A6
  }

  // TF lettermark
  const isT = (y >= 16 && y <= 22 && x >= 14 && x <= 32) || (y >= 22 && y <= 48 && x >= 21 && x <= 25);
  const isF = (y >= 16 && y <= 48 && x >= 34 && x <= 38) || (y >= 16 && y <= 22 && x >= 38 && x <= 48) || (y >= 30 && y <= 35 && x >= 38 && x <= 45);
  if (isT || isF) return [255, 255, 255, 255];

  const ratio = (x + y) / (w + h);
  const r = Math.round(30 + ratio * 7);
  const g = Math.round(58 + ratio * 41);
  const b = Math.round(138 + ratio * 97);
  return [r, g, b, 255];
});
fs.writeFileSync(path.join(imagesDir, 'logo-icon.png'), logoIcon);

// 5. Logo Horizontal 240x60 PNG
const logoHorizontal = createPng(240, 60, (x, y, w, h) => {
  // Left side icon box: 0 to 52
  if (x >= 4 && x <= 52 && y >= 6 && y <= 54) {
    const ix = x - 4;
    const iy = y - 6;
    // TF lettermark in icon
    const isT = (iy >= 12 && iy <= 17 && ix >= 10 && ix <= 26) || (iy >= 17 && iy <= 36 && ix >= 16 && ix <= 20);
    const isF = (iy >= 12 && iy <= 36 && ix >= 27 && ix <= 31) || (iy >= 12 && iy <= 17 && ix >= 31 && ix <= 40) || (iy >= 23 && iy <= 27 && ix >= 31 && ix <= 37);
    if (isT || isF) return [255, 255, 255, 255];
    if ((ix - 41) ** 2 + (iy - 14) ** 2 <= 12) return [20, 184, 166, 255]; // dot
    return [30, 58, 138, 255]; // #1E3A8A
  }
  // Wordmark area background: transparent/clean
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(imagesDir, 'logo-horizontal.png'), logoHorizontal);

// 6. Open Graph Preview 1200x630 PNG
const ogImage = createPng(1200, 630, (x, y, w, h) => {
  // Top/bottom border accents
  if (y < 8 || y > h - 8) return [30, 58, 138, 255];
  // Rich dark navy background
  const ratio = (x + y) / (w + h);
  const r = Math.round(15 + ratio * 15);
  const g = Math.round(23 + ratio * 35);
  const b = Math.round(42 + ratio * 96);
  return [r, g, b, 255];
});
fs.writeFileSync(path.join(imagesDir, 'og-image.png'), ogImage);

console.log('Brand placeholders successfully generated in public/images/');
