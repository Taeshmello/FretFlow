import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ORANGE = [232, 102, 61, 255];
const CREAM = [253, 252, 248, 255];
const DESIGN_SIZE = 1024;

const orangeRects = [
  [302, 302, 420, 38, 19],
  [302, 397, 420, 38, 19],
  [302, 492, 420, 38, 19],
  [302, 587, 420, 38, 19],
  [302, 682, 420, 38, 19],
  [370, 282, 30, 458, 15],
  [493, 282, 38, 458, 19],
  [624, 282, 30, 458, 15],
];

function insideRoundedRect(x, y, [left, top, width, height, radius]) {
  if (x < left || y < top || x >= left + width || y >= top + height) return false;
  const cx = Math.max(left + radius, Math.min(x, left + width - radius));
  const cy = Math.max(top + radius, Math.min(y, top + height - radius));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function colorAt(x, y) {
  if (orangeRects.some(rect => insideRoundedRect(x, y, rect))) return ORANGE;
  if (insideRoundedRect(x, y, [210, 210, 604, 604, 132])) return CREAM;
  return ORANGE;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function render(size) {
  const samples = 4;
  const rowBytes = size * 4 + 1;
  const raw = Buffer.alloc(rowBytes * size);
  const scale = DESIGN_SIZE / size;

  for (let y = 0; y < size; y += 1) {
    const row = y * rowBytes;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const color = colorAt((x + (sx + 0.5) / samples) * scale, (y + (sy + 0.5) / samples) * scale);
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += color[channel];
        }
      }
      const offset = row + 1 + x * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        raw[offset + channel] = Math.round(totals[channel] / (samples * samples));
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ]);
}

const outputDir = resolve('apps/web/public/icons');
mkdirSync(outputDir, { recursive: true });

for (const size of [180, 192, 512, 1024]) {
  const path = resolve(outputDir, `fretflow-${size}.png`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, render(size));
  console.log(`generated ${path}`);
}

copyFileSync(resolve(outputDir, 'fretflow-512.png'), resolve(outputDir, 'fretflow-maskable-512.png'));
