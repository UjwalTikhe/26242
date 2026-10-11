// Generates PWA icons (pwa-192.png, pwa-512.png) as raw PNGs matching icon.svg.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, px) { // px: (x,y) -> [r,g,b]
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = px(x, y);
      const o = row + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const NAVY = [31, 56, 100];
const NAVY_DARK = [22, 41, 75];
const SAFFRON = [255, 153, 51];
const GREEN = [19, 136, 8];
const WHITE = [255, 255, 255];

function draw(size) {
  return (x, y) => {
    if (y >= size * 0.55) {
      if (y >= size * 0.3 + size * 0.55 && y < size * 0.3 + size * 0.55 + size * 0.14) return SAFFRON;
      if (y >= size * 0.44 + size * 0.55) return GREEN;
      return NAVY_DARK;
    }
    return NAVY;
  };
}

for (const size of [192, 512]) {
  writeFileSync(join(root, `pwa-${size}.png`), png(size, size, draw(size)));
  console.log('wrote pwa-' + size + '.png');
}
mkdirSync(root, { recursive: true });
console.log('icons done');