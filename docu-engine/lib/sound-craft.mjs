// Ses zanaatı — küçük, ücretsiz ses işleri (yalnızca JS + ffmpeg, hiçbir API çağrısı yok):
//
//   synthFoley(kind, variant)      kâğıt hışırtısı, kalem cızırtısı, deklanşör, raptiye, daktilo, sayfa çevirme
//   synthLogo()                    kanalın ~2 sn'lik ses imzası
//   renderSynth({ bin, pcm, out }) sentezi ffmpeg'den geçirip (küçük oda, yumuşak sınırlayıcı) WAV yazar
//   spaceOfText(text)              sahnenin mekânı: cave | hall | ship | open | null
//   applySpace({ bin, src, space }) olay sesine o mekânın yankısı (afir, önbellekli; aecho yedek)
//   panVariant({ bin, src, dir })  whoosh'un soldan sağa / sağdan sola geçen eşit güçlü kopyası
//   widenBed({ bin, src })         ortam yatağına mono-uyumlu hafif stereo genişlik
//   voiceChain() / processVoice()  yayın anlatım zinciri (HPF, çamur temizliği, varlık, de-esser,
//                                  2-3 dB veri yolu sıkıştırma, yumuşak sınırlayıcı) + -19 LUFS
//   measure(bin, file)             EBU R128: I, LRA, TP, en yüksek anlık (M)
//
// Her çıktı içerik + tarif sürümüyle önbelleklenir: aynı dosya ikinci kez işlenmez.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

const SR = 48000;
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fileOk = (f) => {
  try {
    return statSync(f).size > 0;
  } catch {
    return false;
  }
};
const run = (bin, args, opts = {}) => spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 28, windowsHide: true, ...opts });
/** Content identity of a file for cache keys (path + size + mtime). */
function sig(file) {
  const st = statSync(file);
  return `${file}|${st.size}|${Math.round(st.mtimeMs)}`;
}

/* ------------------------------------------------------------ measuring */

/**
 * EBU R128 of a file (after an optional chain): integrated loudness, loudness
 * range, true peak and the loudest momentary (400 ms) value.
 */
export function measure(bin, file, chain = null) {
  const af = [chain, 'apad=pad_dur=0.5', 'ebur128=peak=true:framelog=info'].filter(Boolean).join(',');
  const r = run(bin, ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', af, '-f', 'null', '-']);
  const text = String(r.stderr ?? '');
  const sum = text.slice(Math.max(0, text.lastIndexOf('Summary:')));
  const num = (re) => {
    const v = Number(sum.match(re)?.[1]);
    return Number.isFinite(v) ? v : null;
  };
  let maxM = -Infinity;
  for (const m of text.slice(0, text.lastIndexOf('Summary:')).matchAll(/ M:\s*(-?[\d.]+)/g)) {
    const v = Number(m[1]);
    if (v > -70 && v > maxM) maxM = v;
  }
  const I = num(/I:\s+(-?[\d.]+) LUFS/);
  return { I: I !== null && I > -70 ? I : null, LRA: num(/LRA:\s+(-?[\d.]+) LU\b/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/), maxM: Number.isFinite(maxM) ? maxM : null };
}

/* ------------------------------------------------------------- synthesis */

/** Deterministic PRNG (mulberry32) from a string. */
function rngOf(seed) {
  let a = createHash('sha1').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** RBJ biquad, processed in place. type: lp | hp | bp | peak. */
function biquad(x, type, f, q = 0.707, gainDb = 0) {
  const w = (2 * Math.PI * clamp(f, 10, SR / 2 - 100)) / SR;
  const cw = Math.cos(w);
  const al = Math.sin(w) / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') [b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'hp') [b0, b1, b2, a0, a1, a2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + al, -2 * cw, 1 - al];
  else if (type === 'bp') [b0, b1, b2, a0, a1, a2] = [al, 0, -al, 1 + al, -2 * cw, 1 - al];
  else [b0, b1, b2, a0, a1, a2] = [1 + al * A, -2 * cw, 1 - al * A, 1 + al / A, -2 * cw, 1 - al / A];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

const buf = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
const noiseInto = (x, rnd, amp = 1) => {
  for (let i = 0; i < x.length; i++) x[i] = (rnd() * 2 - 1) * amp;
  return x;
};
/** Add `src` into `dst` starting at `at` seconds, scaled. */
function addAt(dst, src, at, g = 1) {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length && o + i < dst.length; i++) if (o + i >= 0) dst[o + i] += src[i] * g;
}
/** A click: a noise burst of decay `tau` exciting a resonance at `f` (a small mechanical part). */
function click(rnd, { tau = 0.0015, f = 2800, q = 8, ring = 0.6, body = 0, bodyF = 180, bodyTau = 0.018, len = 0.12 }) {
  const n = buf(len);
  for (let i = 0; i < n.length; i++) n[i] = (rnd() * 2 - 1) * Math.exp(-i / SR / tau);
  const res = biquad(Float32Array.from(n), 'bp', f, q);
  const out = buf(len);
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] = n[i] * 0.55 + res[i] * ring * 3 + (body ? body * Math.sin(2 * Math.PI * bodyF * t) * Math.exp(-t / bodyTau) : 0);
  }
  return out;
}
/** Two channels from one source: `width` of decorrelated noise-free delay, `pan` 0 = left .. 1 = right (equal power). */
function stereo(mono, pan = 0.5, spread = 0) {
  const L = new Float32Array(mono.length);
  const R = new Float32Array(mono.length);
  const d = Math.round(spread * SR);
  const gl = Math.cos((Math.PI / 2) * pan) * Math.SQRT2;
  const gr = Math.sin((Math.PI / 2) * pan) * Math.SQRT2;
  for (let i = 0; i < mono.length; i++) {
    L[i] = mono[i] * gl;
    R[i] = (d && i >= d ? 0.85 * mono[i] + 0.15 * mono[i - d] : mono[i]) * gr;
  }
  return [L, R];
}

/** Length of each synthesized foley kind, seconds. */
export const FOLEY_LEN = { paper: 0.85, pen: 3.4, shutter: 0.45, pin: 0.3, type: 3.4, page: 1.0 };

/**
 * One variant of a foley sound as raw stereo PCM (48 kHz float). Built from
 * filtered noise and resonances, shaped like the real action: a crumple of
 * short crinkles, a nib dragged across paper tooth in strokes, a two-curtain
 * shutter, a pin tapped into cork, irregular keystrikes, a page swept over.
 * @returns {Float32Array[]} [L, R]
 */
export function synthFoley(kind, variant = 0) {
  const rnd = rngOf(`foley|${kind}|${variant}`);
  const len = FOLEY_LEN[kind] ?? 0.5;
  if (kind === 'paper') {
    const x = noiseInto(buf(len), rnd);
    const env = buf(len);
    for (let i = 0; i < env.length; i++) env[i] = 0.22 * Math.pow(Math.sin(Math.PI * Math.min(1, i / SR / (len - 0.08))), 1.5);
    const n = 12 + Math.floor(rnd() * 6);
    for (let k = 0; k < n; k++) {
      const t0 = 0.02 + Math.pow(rnd(), 1.4) * (len - 0.25);
      const a = 0.35 + rnd() * 0.65;
      const tau = 0.003 + rnd() * 0.012;
      for (let i = Math.round(t0 * SR); i < env.length; i++) {
        const v = a * Math.exp(-(i / SR - t0) / tau);
        if (v < 1e-3) break;
        env[i] += v;
      }
    }
    for (let i = 0; i < x.length; i++) x[i] *= env[i];
    biquad(x, 'hp', 750, 0.7);
    biquad(x, 'peak', 3400, 0.9, 4);
    biquad(x, 'lp', 9500, 0.7);
    return stereo(x, 0.45 + rnd() * 0.1, 0.004);
  }
  if (kind === 'pen') {
    const x = buf(len);
    let t = 0.02;
    while (t < len - 0.15) {
      const d = 0.1 + rnd() * 0.18;
      const a = 0.55 + rnd() * 0.45;
      const tooth = 28 + rnd() * 34;
      const f = 3000 + rnd() * 2200;
      const s = noiseInto(buf(d), rnd);
      for (let i = 0; i < s.length; i++) {
        const u = i / s.length;
        s[i] *= a * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * tooth * (i / SR))));
      }
      biquad(s, 'bp', f, 1.1);
      biquad(s, 'hp', 1400, 0.7);
      addAt(x, s, t, 2.2);
      t += d + 0.02 + rnd() * 0.06;
    }
    // Pressure: a faint low rub under the strokes.
    const rub = noiseInto(buf(len), rnd, 0.05);
    biquad(rub, 'lp', 420, 0.7);
    for (let i = 0; i < x.length; i++) x[i] += rub[i] * Math.min(1, i / SR / 0.05, (len - i / SR) / 0.1);
    return stereo(x, 0.5, 0.003);
  }
  if (kind === 'shutter') {
    const x = buf(len);
    const f1 = 2600 + rnd() * 600;
    addAt(x, click(rnd, { f: f1, q: 7, ring: 0.6, body: 0.45, bodyF: 150 + rnd() * 40 }), 0.005);
    const whirr = noiseInto(buf(0.07), rnd, 0.12);
    for (let i = 0; i < whirr.length; i++) whirr[i] *= Math.sin((Math.PI * i) / whirr.length);
    biquad(whirr, 'bp', 5200, 1.5);
    addAt(x, whirr, 0.012);
    addAt(x, click(rnd, { f: f1 * 0.82, q: 6, ring: 0.5, body: 0.3, bodyF: 190 }), 0.075 + rnd() * 0.02, 0.62);
    biquad(x, 'hp', 110, 0.7);
    return stereo(x, 0.5, 0.002);
  }
  if (kind === 'pin') {
    const x = buf(len);
    addAt(x, click(rnd, { tau: 0.0008, f: 3900 + rnd() * 700, q: 10, ring: 0.5, len: 0.08 }), 0.004);
    addAt(x, click(rnd, { tau: 0.001, f: 1250 + rnd() * 200, q: 4, ring: 0.35, len: 0.08 }), 0.004, 0.5);
    const thumb = noiseInto(buf(0.12), rnd);
    for (let i = 0; i < thumb.length; i++) thumb[i] *= 0.45 * Math.exp(-i / SR / 0.022);
    biquad(thumb, 'lp', 260, 0.8);
    addAt(x, thumb, 0.03);
    biquad(x, 'hp', 80, 0.7);
    return stereo(x, 0.5, 0.001);
  }
  if (kind === 'type') {
    const x = buf(len);
    let t = 0.01;
    let n = 0;
    while (t < len - 0.12) {
      const space = n > 0 && n % (6 + Math.floor(rnd() * 5)) === 0;
      const a = 0.55 + rnd() * 0.45;
      addAt(
        x,
        click(rnd, { tau: 0.0011, f: space ? 1500 : 1900 + rnd() * 700, q: 6, ring: 0.45, body: space ? 0.55 : 0.4, bodyF: space ? 160 : 220 + rnd() * 80, bodyTau: 0.02, len: 0.1 }),
        t,
        a,
      );
      t += space ? 0.16 + rnd() * 0.1 : 0.075 + rnd() * 0.085;
      n++;
    }
    biquad(x, 'hp', 120, 0.7);
    return stereo(x, 0.5, 0.003);
  }
  if (kind === 'page') {
    const x = buf(len);
    const nz = noiseInto(buf(len), rnd);
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / SR;
      // The sweep of air under the page: the cutoff opens as it swings over, then closes.
      const u = clamp(t / 0.75, 0, 1);
      const fc = 700 + 3600 * Math.sin(Math.PI * Math.pow(u, 0.8));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      lp += a * (nz[i] - lp);
      const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 1.6);
      x[i] = lp * env * 0.9;
    }
    for (let k = 0; k < 4; k++) {
      const t0 = 0.3 + rnd() * 0.25;
      const s = noiseInto(buf(0.05), rnd);
      for (let i = 0; i < s.length; i++) s[i] *= Math.exp(-i / SR / 0.006) * (0.3 + rnd() * 0.25);
      biquad(s, 'hp', 1500, 0.7);
      addAt(x, s, t0);
    }
    const settle = noiseInto(buf(0.15), rnd);
    for (let i = 0; i < settle.length; i++) settle[i] *= 0.35 * Math.exp(-i / SR / 0.03);
    biquad(settle, 'lp', 500, 0.7);
    addAt(x, settle, 0.72);
    biquad(x, 'hp', 150, 0.7);
    // The page travels across: left to right over the turn.
    const L = new Float32Array(x.length);
    const R = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const p = 0.3 + 0.4 * clamp(i / SR / 0.75, 0, 1);
      L[i] = x[i] * Math.cos((Math.PI / 2) * p) * Math.SQRT2;
      R[i] = x[i] * Math.sin((Math.PI / 2) * p) * Math.SQRT2;
    }
    return [L, R];
  }
  throw new Error(`bilinmeyen foley: ${kind}`);
}

/**
 * The sonic logo, ~2.2 s: a low bloom and two soft bell tones a fifth apart
 * (E4 then B4, left then right), with a breath of air on top. Quiet by
 * design; the same file serves every video (cached in the library).
 */
export function synthLogo() {
  const len = 2.2;
  const rnd = rngOf('nova-logo|v1');
  const L = buf(len);
  const R = buf(len);
  const bell = (f0, at, pan, amp) => {
    const partials = [[1, 1, 1.15], [2.0, 0.32, 0.7], [2.76, 0.22, 0.5], [5.4, 0.07, 0.22]];
    for (let i = Math.round(at * SR); i < L.length; i++) {
      const t = i / SR - at;
      let v = 0;
      for (const [m, a, tau] of partials) v += a * Math.sin(2 * Math.PI * f0 * m * t) * Math.exp(-t / tau);
      v *= amp * Math.min(1, t / 0.004);
      L[i] += v * Math.cos((Math.PI / 2) * pan) * Math.SQRT2;
      R[i] += v * Math.sin((Math.PI / 2) * pan) * Math.SQRT2;
    }
  };
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    const v = 0.5 * Math.sin(2 * Math.PI * 49 * t) * Math.min(1, t / 0.06) * Math.exp(-t / 0.7);
    L[i] += v;
    R[i] += v;
  }
  bell(329.63, 0.06, 0.38, 0.32);
  bell(493.88, 0.44, 0.62, 0.26);
  const air = noiseInto(buf(len), rnd, 0.05);
  biquad(air, 'bp', 7200, 0.8);
  const airR = noiseInto(buf(len), rnd, 0.05);
  biquad(airR, 'bp', 7200, 0.8);
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    const e = Math.min(1, t / 0.5) * Math.exp(-Math.max(0, t - 0.5) / 0.45);
    L[i] += air[i] * e;
    R[i] += airR[i] * e;
  }
  return [L, R];
}

/** 16-bit PCM WAV from float channels. */
export function writeWav(file, channels, sr = SR) {
  const n = channels[0].length;
  const ch = channels.length;
  const b = Buffer.alloc(44 + n * ch * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * ch * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(ch, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * ch * 2, 28);
  b.writeUInt16LE(ch * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * ch * 2, 40);
  let peak = 0;
  for (const c of channels) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(c[i]));
  const k = peak > 0.89 ? 0.89 / peak : 1;
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++, o += 2) b.writeInt16LE(Math.round(clamp(channels[c][i] * k, -1, 1) * 32767), o);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, b);
}

/**
 * Raw synthesis -> finished file through ffmpeg: a small room so the sound
 * sits in a space instead of in the speaker (the logo gets a hall), a
 * short fade at the end and a soft limiter.
 */
export function renderSynth({ bin, pcm, out, room = 'small', len }) {
  const raw = `${out}.raw.wav`;
  writeWav(raw, pcm);
  const verb = room === 'hall' ? 'aecho=0.8:0.5:47|83|131|197:0.32|0.24|0.17|0.11' : 'aecho=0.9:0.85:9|17|29:0.16|0.1|0.06';
  const L = len ?? pcm[0].length / SR;
  const af = `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,${verb},afade=t=out:st=${Math.max(0, L - 0.06).toFixed(3)}:d=0.06,atrim=0:${L.toFixed(3)},alimiter=limit=0.89:attack=1:release=40:level=false:latency=1`;
  const tmp = `${out}.tmp.wav`;
  const r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', af, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
  rmSync(raw, { force: true });
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    throw new Error(`sentez işlenemedi: ${String(r.stderr).slice(-300)}`);
  }
  mkdirSync(dirname(out), { recursive: true });
  renameSync(tmp, out);
  return out;
}

/* ----------------------------------------------------------------- space */

/*
 * The acoustic spaces an event can sit in. Words are folded (Turkish letters
 * to ASCII, lower case); the writer's place/sound text is read before the
 * narration. Cave beats ship beats hall beats open air: the most enclosing
 * space named wins ("the ship's hold in the storm" is a ship, not open sea).
 */
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const foldText = (s) => String(s ?? '').replace(/[Iİ]/g, (c) => (c === 'I' ? 'ı' : 'i')).toLowerCase().replace(/[çğıöşüâîû]/g, (c) => FOLD[c]);
/* Folded Turkish case endings a place word may carry ("mağarada", "geminin", "sarayın"). */
const TR_CASE = 'da|de|ta|te|dan|den|tan|ten|a|e|ya|ye|i|u|yi|yu|in|un|nin|nun|lar|ler|lara|lere|larda|lerde|lari|leri|daki|deki|ndaki|ndeki|nda|nde|ndan|nden|na|ne|si|su|sinda|sinde|sunda|sundan|sine|suna|sini|sunu|inda|inde|unda|unde|indan|inden|undan|unden|ina|ine|una|une|ini|unu|indaki|indeki';
const words = (en, tr) => new RegExp(`\\b(?:${en.join('|')}|(?:${tr.join('|')})(?:${TR_CASE})?)\\b`);
const SPACE_WORDS = [
  ['cave', words(['caves?', 'caverns?', 'tunnels?', 'mine ?shafts?', 'coal ?mines?', 'underground', 'sewers?', 'catacombs?', 'bunkers?', 'crypts?', 'dungeons?', 'cellars?'], ['magara', 'tunel', 'maden ocag', 'kanalizasyon', 'yeralti', 'siginak', 'siginag', 'zindan', 'mahzen', 'kuyu'])],
  ['ship', words(['ships?', 'hulls?', 'decks?', 'submarines?', 'cabins?', 'engine room', 'boiler room', 'steamers?', 'liners?', 'vessels?'], ['gemi', 'guverte', 'denizalti', 'kamara', 'makine daire', 'ambar'])],
  ['hall', words(['halls?', 'hallways?', 'churche?s?', 'cathedrals?', 'chapels?', 'mosques?', 'palaces?', 'court ?rooms?', 'courthouses?', 'hangars?', 'warehouses?', 'museums?', 'parliament', 'ballrooms?', 'lobby', 'atrium', 'corridors?'], ['kilise', 'katedral', 'cami', 'saray', 'mahkeme salon', 'salon', 'hangar', 'depo', 'muze', 'meclis', 'koridor'])],
  ['open', words(['open air', 'outdoors?', 'outside', 'fields?', 'meadows?', 'deserts?', 'mountains?', 'valleys?', 'battlefields?', 'plains?', 'beach(?:es)?', 'coast', 'harbou?rs?', 'streets?', 'square', 'forests?', 'sea', 'ocean', 'sky'], ['acik hava', 'acik alan', 'tarla', 'cayir', 'col', 'dag', 'vadi', 'savas alan', 'ova', 'sahil', 'kiyi', 'liman', 'sokak', 'cadde', 'meydan', 'orman', 'deniz', 'okyanus', 'gokyuzu'])],
];
/** Which space a scene's text names (place/sound first, then narration), or null. */
export function spaceOfText(...texts) {
  for (const t of texts) {
    const f = ` ${foldText(String(t ?? '').replace(/\[[^\]]*\]/g, ' '))} `;
    if (!f.trim()) continue;
    for (const [name, re] of SPACE_WORDS) if (re.test(f)) return name;
  }
  return null;
}

/*
 * Space presets. The impulse response is synthesized (decorrelated noise with
 * an exponential decay that darkens over time, a few early reflections, and
 * for a ship the ring of a steel hull), convolved with afir and mixed in low:
 * a tag of space, not a wash. `tail` = seconds the file grows by.
 */
export const SPACES = {
  cave: { pre: 0.025, rt60: 2.6, dampFrom: 6000, dampTo: 1400, er: [0.023, 0.041, 0.067, 0.089], wet: -9, tail: 2.0, echo: 'aecho=0.8:0.6:63|113|187:0.35|0.25|0.18' },
  hall: { pre: 0.018, rt60: 1.8, dampFrom: 8000, dampTo: 2400, er: [0.013, 0.029, 0.047], wet: -11, tail: 1.5, echo: 'aecho=0.8:0.5:41|79|127:0.28|0.2|0.13' },
  ship: { pre: 0.006, rt60: 0.9, dampFrom: 5000, dampTo: 1800, er: [0.007, 0.016], wet: -12, tail: 0.8, modes: [182, 347, 611], echo: 'aecho=0.8:0.5:13|29:0.3|0.2' },
  open: { pre: 0, rt60: 0.35, dampFrom: 5000, dampTo: 2000, er: [], slap: [[0.14, -14], [0.26, -22]], wet: -14, tail: 0.5, echo: 'aecho=0.8:0.4:140|260:0.2|0.08' },
};

function spaceIR(name) {
  const p = SPACES[name];
  const rnd = rngOf(`ir|${name}`);
  const len = Math.min(3, p.pre + p.rt60 * 1.1 + 0.05);
  const out = [buf(len), buf(len)];
  const tau = p.rt60 / 6.91;
  for (const ch of out) {
    let lp = 0;
    for (let i = Math.round(p.pre * SR); i < ch.length; i++) {
      const t = i / SR - p.pre;
      const fc = p.dampTo + (p.dampFrom - p.dampTo) * Math.exp(-t / Math.max(0.05, tau * 1.5));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
      lp += a * ((rnd() * 2 - 1) - lp);
      ch[i] = lp * Math.exp(-t / tau) * Math.min(1, t / 0.004);
    }
    for (const e of p.er) {
      const i = Math.round((p.pre + e) * SR);
      if (i < ch.length) ch[i] += (0.5 + rnd() * 0.3) * (rnd() < 0.5 ? -1 : 1);
    }
    for (const [at, db] of p.slap ?? []) {
      const i = Math.round(at * SR);
      const g = Math.pow(10, db / 20) * 8;
      for (let k = 0; k < 240 && i + k < ch.length; k++) ch[i + k] += g * (rnd() * 2 - 1) * Math.exp(-k / 60);
    }
    for (const m of p.modes ?? []) {
      const ph = rnd() * Math.PI * 2;
      for (let i = 0; i < ch.length; i++) ch[i] += 0.02 * Math.sin(2 * Math.PI * m * (i / SR) + ph) * Math.exp(-(i / SR) / (tau * 1.3));
    }
    // Unit energy: the mix weight alone sets how much space is heard.
    let e = 0;
    for (let i = 0; i < ch.length; i++) e += ch[i] * ch[i];
    const k = e > 0 ? 1 / Math.sqrt(e) : 1;
    for (let i = 0; i < ch.length; i++) ch[i] *= k;
  }
  return out;
}

/** Recipe version of every processed copy below; bump to re-render caches. */
export const CRAFT_VERSION = 'sc1';

/**
 * The event file with its space: dry + a low wet convolution, the tail kept,
 * then levelled back to the dry file's loudest moment (so the director's gain
 * still holds). Falls back to a multi-tap echo when afir is unavailable.
 * @returns {{file:string, tail:number}|null}
 */
export function applySpace({ bin, src, space, outDir, log = () => {} }) {
  const p = SPACES[space];
  if (!p || !fileOk(src)) return null;
  const out = join(outDir, space, `${basename(src, extname(src)).slice(0, 40)}-${hash(`${CRAFT_VERSION}|${sig(src)}|${space}|${JSON.stringify(p)}`)}.wav`);
  if (fileOk(out)) return { file: out, tail: p.tail };
  mkdirSync(dirname(out), { recursive: true });
  const ir = join(outDir, `ir-${space}-${hash(`${CRAFT_VERSION}|${JSON.stringify(p)}`)}.wav`);
  if (!fileOk(ir)) writeWav(ir, spaceIR(space));
  const wet = Math.pow(10, p.wet / 20);
  const base = `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${p.tail}`;
  const tmp = `${out}.tmp.wav`;
  const graph = `[0:a]${base},asplit[d][x];[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[ir];[x][ir]afir=gtype=none:irgain=1[w];[d][w]amix=inputs=2:weights='1 ${wet.toFixed(4)}':normalize=0:duration=first[m]`;
  let r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-i', ir, '-filter_complex', graph, '-map', '[m]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
  if (r.status !== 0 || !fileOk(tmp)) {
    log(`yankı (afir) olmadı, aecho ile: ${String(r.stderr).slice(-160)}`);
    r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', `${base},${p.echo}`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
  }
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    return null;
  }
  // Same loudest moment as the dry file, and never over -1 dBFS.
  const a = measure(bin, src);
  const b = measure(bin, tmp);
  let g = a.maxM !== null && b.maxM !== null ? clamp(a.maxM - b.maxM, -6, 3) : 0;
  if (b.TP !== null) g = Math.min(g, -1 - b.TP);
  const tmp2 = `${out}.tmp2.wav`;
  const r2 = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-af', `volume=${g.toFixed(2)}dB`, '-c:a', 'pcm_s16le', '-f', 'wav', tmp2]);
  rmSync(tmp, { force: true });
  if (r2.status !== 0 || !fileOk(tmp2)) {
    rmSync(tmp2, { force: true });
    return null;
  }
  renameSync(tmp2, out);
  return { file: out, tail: p.tail };
}

/* ---------------------------------------------------------------- stereo */

/**
 * A whoosh that travels: equal-power pan from one side to the other, the
 * crossing centred on the sound's own peak (so the air passes the viewer ON
 * the cut). The stereo image of the source is kept as side signal and the
 * level stays equal to the centred file. `dir` 'lr' = left to right.
 */
export function panVariant({ bin, src, dir, peakAt = 0.2, outDir, width = 0.62 }) {
  if (!fileOk(src)) return null;
  const out = join(outDir, `${basename(src, extname(src)).slice(0, 40)}-${dir}-${hash(`${CRAFT_VERSION}|${sig(src)}|${dir}|${peakAt}|${width}`)}.wav`);
  if (fileOk(out)) return out;
  mkdirSync(dirname(out), { recursive: true });
  const s = dir === 'lr' ? 1 : -1;
  const th = `(0.7854+${(s * width).toFixed(3)}*tanh((t-${Number(peakAt).toFixed(3)})/0.16))`;
  const m = '(val(0)+val(1))/2';
  const sd = '(val(0)-val(1))/2';
  const af = `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,aeval=exprs='${m}*1.4142*cos(${th})+${sd}|${m}*1.4142*sin(${th})-${sd}':channel_layout=stereo,alimiter=limit=0.89:attack=1:release=30:level=false:latency=1`;
  const tmp = `${out}.tmp.wav`;
  const r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    return null;
  }
  renameSync(tmp, out);
  return out;
}

/**
 * Gentle width for a room-tone bed, mono-compatible: the source's own side
 * signal a little wider, plus a decorrelated side made from the mid (delayed,
 * high-passed) that cancels exactly when summed to mono. Level-matched to the
 * source so the director's bed gain still holds.
 */
export function widenBed({ bin, src, outDir }) {
  if (!fileOk(src)) return null;
  const out = join(outDir, `${basename(src, extname(src)).slice(0, 40)}-w-${hash(`${CRAFT_VERSION}|${sig(src)}`)}.wav`);
  if (fileOk(out)) return out;
  mkdirSync(dirname(out), { recursive: true });
  const graph =
    '[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit[a][b];' +
    '[a]extrastereo=m=1.25[st];' +
    '[b]pan=mono|c0=0.5*c0+0.5*c1,adelay=17,highpass=f=300,volume=0.26[sd];' +
    '[st][sd]amerge=inputs=2,pan=stereo|c0=c0+c2|c1=c1-c2[w]';
  const tmp = `${out}.tmp.wav`;
  const r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-filter_complex', graph, '-map', '[w]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    return null;
  }
  const a = measure(bin, src);
  const b = measure(bin, tmp);
  let g = a.I !== null && b.I !== null ? clamp(a.I - b.I, -4, 4) : 0;
  if (b.TP !== null) g = Math.min(g, -1 - b.TP);
  const tmp2 = `${out}.tmp2.wav`;
  const r2 = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', tmp, '-af', `volume=${g.toFixed(2)}dB`, '-c:a', 'pcm_s16le', '-f', 'wav', tmp2]);
  rmSync(tmp, { force: true });
  if (r2.status !== 0 || !fileOk(tmp2)) {
    rmSync(tmp2, { force: true });
    return null;
  }
  renameSync(tmp2, out);
  return out;
}

/* ----------------------------------------------------------------- voice */

/**
 * Version of the narration chain. It is part of every levelled voice file's
 * cache tag, so changing the chain re-processes old narration (from the
 * cached ElevenLabs MP3, never a new request).
 */
export const VOICE_CHAIN_VERSION = 'v1';

/**
 * The broadcast narration chain, applied to a line already brought near
 * -19 LUFS (so the compressor always sees the same level):
 *   - high-pass 70 Hz (rumble, plosive thumps; the voice has nothing there)
 *   - -2 dB around 300 Hz (the boxy low-mid of a close TTS voice)
 *   - +2 dB presence around 3.2 kHz, +1 dB air shelf at 10 kHz
 *   - de-esser on the sibilance the presence lift brings up
 *   - bus-style compression, 2:1 from -16 dBFS RMS, slow enough to breathe
 *     (≈2-3 dB on stressed words, nothing between them: no pumping)
 * The -19 LUFS trim and the soft limiter follow in processVoice.
 */
export function voiceChain() {
  return [
    'highpass=f=70:poles=2',
    'equalizer=f=300:t=q:w=1.1:g=-2',
    'equalizer=f=3200:t=q:w=1.0:g=2',
    'treble=g=1:f=10000:t=s:w=0.6',
    'deesser=i=0.35:m=0.5:f=0.55:s=o',
    'acompressor=threshold=0.158:ratio=2:attack=12:release=220:knee=4:detection=rms:makeup=1',
  ].join(',');
}

/**
 * Narration line -> finished 48 kHz mono WAV at `target` LUFS: pre-gain to
 * the target, the chain, a measured trim back onto the target, then a soft
 * limiter at -1.5 dBFS. Returns the loudness before (raw) and after.
 */
export function processVoice({ bin, src, dst, target = -19, chain = true }) {
  const before = measure(bin, src);
  const pre = before.I === null ? 0 : clamp(target - before.I, -12, 20);
  const body = [`aresample=48000`, `volume=${pre.toFixed(2)}dB`, chain ? voiceChain() : null].filter(Boolean).join(',');
  const mid = measure(bin, src, body);
  const trim = mid.I === null ? 0 : clamp(target - mid.I, -6, 6);
  const af = `${body},volume=${trim.toFixed(2)}dB,alimiter=limit=${Math.pow(10, -1.5 / 20).toFixed(4)}:attack=2:release=60:level=false:latency=1`;
  const tmp = `${dst}.tmp.wav`;
  mkdirSync(dirname(dst), { recursive: true });
  // A spawn can fail transiently on Windows (antivirus lock, EAGAIN): retry before failing the video.
  let r;
  for (let i = 0; i < 4; i++) {
    r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', af, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
    if (r.status === 0 && fileOk(tmp)) break;
    rmSync(tmp, { force: true });
    if (i < 3) spawnSync(process.execPath, ['-e', `setTimeout(()=>{}, ${500 * (i + 1)})`], { windowsHide: true });
  }
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    throw new Error(`anlatım işlenemedi: ${r.error ? r.error.message : String(r.stderr || '').slice(-300) || `çıkış kodu ${r.status}`}`);
  }
  renameSync(tmp, dst);
  return { before, gainDb: +(pre + trim).toFixed(2) };
}

export const _craftInternals = { spaceIR, rngOf, SR, existsSync, readFileSync };
