// Hakimi pixel-logo generator v7: compact cat-ear spaceship icon (11 cols).
// v7: symmetric light-blue eyes on the visor, flat base, no flame.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const grid = [
  '..S.....S..', // ear tips
  '.SoS...SoS.', // orange inner ears
  'SSSSSSSSSSS', // head top
  'SWWWWWWWWWS', // hull
  'SWVBBBBBVWS', // visor: light-blue eyes, both sides
  'SWBBBBBBBWS', // visor
  'SWoooooooWS', // orange collar
  'SSSSSSSSSSS', // flat base
];

const W = 11;
for (const row of grid) {
  if (row.length !== W) throw new Error(`bad row length ${row.length}: ${row}`);
}

const COLORS = {
  S: '#3A4A63', // dark outline
  W: '#F2F7FD', // hull white
  o: '#F5831F', // orange inner ear / collar
  V: '#8FE6FF', // visor highlight / eyes
  B: '#1E7CF0', // visor blue
};

console.log('--- grid ---');
for (const row of grid) console.log(`  '${row}',`);

// ---------- PNG (terminal aspect 1:2) ----------
const H = grid.length;
const SX = 10, SY = 20;
const pngW = W * SX, pngH = H * SY;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const raw = Buffer.alloc((pngW * 3 + 1) * pngH);
for (let y = 0; y < pngH; y++) {
  raw[y * (pngW * 3 + 1)] = 0;
  for (let x = 0; x < pngW; x++) {
    const c = grid[Math.floor(y / SY)][Math.floor(x / SX)];
    const [r, g, b] = c === '.' ? [10, 14, 24] : hex(COLORS[c] ?? '#FF00FF');
    const o = y * (pngW * 3 + 1) + 1 + x * 3;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(pngW, 0); ihdr.writeUInt32BE(pngH, 4);
ihdr[8] = 8; ihdr[9] = 2;
writeFileSync('/tmp/hakimi-logo/logo7.png', Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log('--- wrote /tmp/hakimi-logo/logo7.png ---');
