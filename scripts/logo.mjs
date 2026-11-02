// Draws the Sergeant logo (three rank chevrons) as PNGs with no dependencies. Usage: node scripts/logo.mjs app/assets/images
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const out = process.argv[2];
const NAVY = [22, 33, 62], AMBER = [240, 163, 94], WHITE = [255, 255, 255];

// One chevron pointing up, in unit coords; `scale` shrinks the group around the center.
function chevrons(scale) {
  const polys = [];
  const w = 0.62 * scale, h = 0.2 * scale, t = 0.11 * scale, gap = 0.06 * scale;
  const total = 3 * (h + t) + 2 * gap - h * 0; // stack height
  let a = 0.5 - (h + t) * 1.5 - gap + 0.02 * scale;
  for (let i = 0; i < 3; i++) {
    polys.push([[0.5 - w / 2, a + h], [0.5, a], [0.5 + w / 2, a + h], [0.5 + w / 2, a + h + t], [0.5, a + t], [0.5 - w / 2, a + h + t]]);
    a += t + gap + 0.02 * scale;
  }
  void total;
  const ys = polys.flat().map((p) => p[1]);
  const dy = 0.5 - (Math.min(...ys) + Math.max(...ys)) / 2;
  return polys.map((p) => p.map(([x, y]) => [x, y + dy]));
}

function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// bg: [r,g,b] or null for transparent; fg color; scale of the chevron group.
function png(file, size, bg, fg, scale) {
  const polys = chevrons(scale);
  const S = 4; // supersampling per axis
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const u = (x + (sx + 0.5) / S) / size, v = (y + (sy + 0.5) / S) / size;
        if (polys.some((p) => inside(p, u, v))) hits++;
      }
      const a = hits / (S * S);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (bg) {
        for (let k = 0; k < 3; k++) raw[o + k] = Math.round(bg[k] * (1 - a) + fg[k] * a);
        raw[o + 3] = 255;
      } else {
        for (let k = 0; k < 3; k++) raw[o + k] = fg[k];
        raw[o + 3] = Math.round(a * 255);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(`${out}/${file}`, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

if (process.argv.includes('--pwa')) {
  png('icon-192.png', 192, NAVY, AMBER, 0.78);
  png('icon-512.png', 512, NAVY, AMBER, 0.78);
  png('icon-maskable-512.png', 512, NAVY, AMBER, 0.5);
} else {
png('icon.png', 1024, NAVY, AMBER, 0.78);
png('favicon.png', 48, NAVY, AMBER, 0.86);
png('android-icon-background.png', 512, NAVY, NAVY, 0.5);
// Adaptive foreground: keep inside the 66% safe zone.
png('android-icon-foreground.png', 512, null, AMBER, 0.5);
png('android-icon-monochrome.png', 432, null, WHITE, 0.5);
png('splash-icon.png', 512, null, AMBER, 0.9);
}
console.log('ok');
