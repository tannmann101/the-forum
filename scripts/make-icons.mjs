// make-icons.mjs
// Generates the PWA icon set from code instead of checking in binaries
// nobody can re-derive. No image library: Node's zlib is enough to emit a
// PNG, and every shape here is a rounded rectangle or a circle, sampled
// 4x4 per pixel so the edges come out smooth.
//
// Run with `npm run icons` after changing the mark or the palette.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const OUT_DIR = new URL('../public/icons/', import.meta.url);

const INK = [0x2e, 0x5e, 0x7e]; // forum blue -- matches theme.js FORUM
const PAPER = [0xf6, 0xf3, 0xec]; // warm paper -- matches theme.js PAGE
const CLAY = [0xc0, 0x77, 0x44]; // the accent bubble

// Coverage of a rounded rectangle at a point, as a 0/1 test. Anti-aliasing
// comes from supersampling the whole icon, not from this.
const inRoundRect = (px, py, x, y, w, h, r) => {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
};

const inCircle = (px, py, cx, cy, r) => {
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
};

// The mark: two overlapping speech bubbles -- a big paper-colored one with
// three dots, and a smaller clay one tucked behind it -- on a forum-blue
// field. Drawn in a 0..1 unit square so one definition serves every size.
// `bleed` fills the whole canvas instead of insetting a rounded tile, which
// is what a maskable icon wants.
function sample(u, v, bleed) {
  const bg = bleed || inRoundRect(u, v, 0.06, 0.06, 0.88, 0.88, 0.2);
  if (!bg) return null;

  // Back bubble (clay), peeking out to the upper right.
  const backBody = inRoundRect(u, v, 0.44, 0.17, 0.4, 0.3, 0.09);
  const backTail = inRoundRect(u, v, 0.72, 0.43, 0.1, 0.12, 0.03);
  if (backBody || backTail) return CLAY;

  // Front bubble (paper), with its tail dropping to the lower left.
  const frontBody = inRoundRect(u, v, 0.16, 0.32, 0.5, 0.36, 0.1);
  const frontTail = inRoundRect(u, v, 0.22, 0.62, 0.12, 0.14, 0.035);
  if (frontBody || frontTail) {
    // Three dots: the universal "someone is saying something" shorthand.
    for (const dx of [-0.13, 0, 0.13]) {
      if (inCircle(u, v, 0.41 + dx, 0.5, 0.035)) return INK;
    }
    return PAPER;
  }

  return INK;
}

function renderRGBA(size, bleed) {
  const SS = 4; // 4x4 supersamples per pixel
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const c = sample(u, v, bleed);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      // Un-premultiply so partially covered edge pixels keep their color.
      const cov = a / n;
      px[i] = cov > 0 ? Math.round(r / (a / 255)) : 0;
      px[i + 1] = cov > 0 ? Math.round(g / (a / 255)) : 0;
      px[i + 2] = cov > 0 ? Math.round(b / (a / 255)) : 0;
      px[i + 3] = Math.round(cov);
    }
  }
  return px;
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function toPNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // Each scanline is prefixed with filter type 0 (none) -- the shapes are
  // flat color, so deflate does the compressing and a filter buys nothing.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="6" y="6" width="88" height="88" rx="20" fill="#2E5E7E"/>
  <g>
    <rect x="44" y="17" width="40" height="30" rx="9" fill="#C07744"/>
    <rect x="72" y="43" width="10" height="12" rx="3" fill="#C07744"/>
  </g>
  <g>
    <rect x="16" y="32" width="50" height="36" rx="10" fill="#F6F3EC"/>
    <rect x="22" y="62" width="12" height="14" rx="3.5" fill="#F6F3EC"/>
    <circle cx="28" cy="50" r="3.5" fill="#2E5E7E"/>
    <circle cx="41" cy="50" r="3.5" fill="#2E5E7E"/>
    <circle cx="54" cy="50" r="3.5" fill="#2E5E7E"/>
  </g>
</svg>
`;

mkdirSync(OUT_DIR, { recursive: true });
// icon-512 bleeds to the edges so it also works as the maskable icon, where
// the platform crops a circle or squircle out of the middle.
for (const [name, size, bleed] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
]) {
  writeFileSync(new URL(name, OUT_DIR), toPNG(size, renderRGBA(size, bleed)));
  console.log(`wrote icons/${name} (${size}x${size})`);
}
writeFileSync(new URL('icon.svg', OUT_DIR), svg);
console.log('wrote icons/icon.svg');
