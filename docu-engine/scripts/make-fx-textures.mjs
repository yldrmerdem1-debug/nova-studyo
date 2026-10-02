// Effect textures (public/fx), made once and committed like the grain tiles:
//   node scripts/make-fx-textures.mjs
// - ink-sheet.png  : 16 frames (4x4, 480x270 each) of ink blots spreading to full cover
// - burn-sheet.png : 16 frames of a film burn eating in from the right edge
// - cloud.png      : a tileable soft cloud mask (film-burn scene effect)
// All are grey+alpha PNGs used as CSS masks (alpha = coverage). Deterministic.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fx');
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- PNG */
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** Grey+alpha PNG from an alpha plane (grey fixed at 255). */
function pngLA(w, h, alpha) {
  const raw = Buffer.alloc((w * 2 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 2 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      raw[row + 1 + x * 2] = 255;
      raw[row + 2 + x * 2] = alpha[y * w + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 4; // grey + alpha
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* -------------------------------------------------------------- noise */
function hash(ix, iy, s) {
  let h = (ix * 374761393 + iy * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const fade = (t) => t * t * (3 - 2 * t);
/** Value noise, lattice wrapped at `period` cells when given (tileable). */
function vnoise(x, y, s, period = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const w = (v) => (period ? ((v % period) + period) % period : v);
  const a = hash(w(x0), w(y0), s);
  const b = hash(w(x0 + 1), w(y0), s);
  const c = hash(w(x0), w(y0 + 1), s);
  const d = hash(w(x0 + 1), w(y0 + 1), s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function fbm(x, y, s, oct = 5, period = 0) {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, s + o * 17, period ? period * f : 0);
    amp *= 0.5;
    f *= 2;
  }
  return sum; // ~0..1
}
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* -------------------------------------------------------------- sheets */
const FW = 480;
const FH = 270;
const COLS = 4;
const N = 16;

function sheet(field, ease, soft) {
  const Wd = FW * COLS;
  const Hd = FH * Math.ceil(N / COLS);
  const F = new Float32Array(FW * FH);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      const v = field(x / FW, y / FH);
      F[y * FW + x] = v;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  const alpha = new Uint8Array(Wd * Hd);
  for (let k = 0; k < N; k++) {
    const T = lo + (hi - lo + soft * 2) * ease(k / (N - 1));
    const ox = (k % COLS) * FW;
    const oy = Math.floor(k / COLS) * FH;
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const a = k === 0 ? 0 : 1 - smooth(T - soft, T + soft, F[y * FW + x]);
        alpha[(oy + y) * Wd + ox + x] = Math.round(a * 255);
      }
  }
  return pngLA(Wd, Hd, alpha);
}

// Ink: three blots bleeding outwards with fibrous edges, meeting until the frame is covered.
const seeds = [
  [0.3, 0.42, 0.9],
  [0.72, 0.58, 1.0],
  [0.55, 0.18, 1.25],
];
const ink = (u, v) => {
  const ar = FW / FH;
  let d = Infinity;
  for (const [sx, sy, r] of seeds) d = Math.min(d, (Math.hypot((u - sx) * ar, v - sy) / ar) * r);
  return d + 0.22 * fbm(u * 4, v * 4 * (FH / FW) * 1.8, 11) + 0.07 * fbm(u * 22, v * 22, 5);
};
writeFileSync(join(OUT, 'ink-sheet.png'), sheet(ink, (t) => Math.pow(t, 1.25), 0.01));

// Burn: eats in from the right edge (a little from the top), ragged and hot.
const burn = (u, v) => (1 - u) * 1.0 + 0.25 * Math.abs(v - 0.35) + 0.42 * fbm(u * 3, v * 3, 29) + 0.12 * fbm(u * 14, v * 14, 7);
writeFileSync(join(OUT, 'burn-sheet.png'), sheet(burn, (t) => t, 0.045));

// Cloud: tileable soft blotches.
{
  const S = 512;
  const P = 4;
  const a = new Uint8Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = fbm((x / S) * P, (y / S) * P, 3, 5, P);
      a[y * S + x] = Math.round(smooth(0.35, 0.72, n) * 255);
    }
  writeFileSync(join(OUT, 'cloud.png'), pngLA(S, S, a));
}
console.log('fx textures written to', OUT);
