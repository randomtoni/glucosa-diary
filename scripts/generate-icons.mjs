import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'icons');
mkdirSync(outDir, { recursive: true });

const crcTable = (() => {
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
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const BG_TOP = hexToRgb('#14b8a6');
const BG_BOTTOM = hexToRgb('#0d9488');
const DROP = [255, 255, 255];

function sign(ax, ay, bx, by, cx, cy) {
  return (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
}

function makeGeometry(box) {
  const cx = 0.5, cy = 0.62, r = 0.3;
  const apex = { x: 0.5, y: 0.1 };
  const d = cy - apex.y;
  const alpha = Math.acos(r / d);
  const s = Math.sin(alpha), c = Math.cos(alpha);
  const t1 = { x: cx + r * s, y: cy - r * c };
  const t2 = { x: cx - r * s, y: cy - r * c };
  const map = (p) => ({ x: box.x + p.x * box.size, y: box.y + p.y * box.size });
  return {
    circle: { ...map({ x: cx, y: cy }), r: r * box.size },
    a: map(apex),
    t1: map(t1),
    t2: map(t2),
  };
}

function insideDrop(px, py, g) {
  const dx = px - g.circle.x, dy = py - g.circle.y;
  if (dx * dx + dy * dy <= g.circle.r * g.circle.r) return true;
  const d1 = sign(px, py, g.a.x, g.a.y, g.t1.x, g.t1.y);
  const d2 = sign(px, py, g.t1.x, g.t1.y, g.t2.x, g.t2.y);
  const d3 = sign(px, py, g.t2.x, g.t2.y, g.a.x, g.a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function insideRoundedRect(px, py, size, radius) {
  const min = radius, maxX = size - radius, maxY = size - radius;
  let qx = px, qy = py;
  if (px < min) qx = min; else if (px > maxX) qx = maxX;
  if (py < min) qy = min; else if (py > maxY) qy = maxY;
  const dx = px - qx, dy = py - qy;
  return dx * dx + dy * dy <= radius * radius;
}

function renderIcon(size, { maskable, dropFraction }) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4;
  const radius = maskable ? 0 : size * 0.2;
  const dropSize = size * dropFraction;
  const box = { size: dropSize, x: (size - dropSize) / 2, y: (size - dropSize) / 2 };
  const g = makeGeometry(box);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sumA = 0, sumR = 0, sumG = 0, sumB = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          let r = 0, gg = 0, b = 0, a = 0;
          const inBg = maskable ? true : insideRoundedRect(px, py, size, radius);
          if (inBg) {
            const tY = py / size;
            r = Math.round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * tY);
            gg = Math.round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * tY);
            b = Math.round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * tY);
            a = 255;
          }
          if (insideDrop(px, py, g)) {
            r = DROP[0]; gg = DROP[1]; b = DROP[2]; a = 255;
          }
          sumA += a; sumR += r * a; sumG += gg * a; sumB += b * a;
        }
      }
      const n = ss * ss;
      const outA = Math.round(sumA / n);
      const idx = (y * size + x) * 4;
      if (sumA > 0) {
        rgba[idx] = Math.round(sumR / sumA);
        rgba[idx + 1] = Math.round(sumG / sumA);
        rgba[idx + 2] = Math.round(sumB / sumA);
      }
      rgba[idx + 3] = outA;
    }
  }
  return encodePNG(size, size, rgba);
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false, dropFraction: 0.62 },
  { file: 'icon-512.png', size: 512, maskable: false, dropFraction: 0.62 },
  { file: 'icon-maskable-512.png', size: 512, maskable: true, dropFraction: 0.5 },
  { file: 'apple-touch-icon.png', size: 180, maskable: true, dropFraction: 0.58 },
  { file: 'favicon-32.png', size: 32, maskable: false, dropFraction: 0.7 },
];

for (const t of targets) {
  const png = renderIcon(t.size, t);
  writeFileSync(join(outDir, t.file), png);
  console.log(`generated icons/${t.file} (${png.length} bytes)`);
}
