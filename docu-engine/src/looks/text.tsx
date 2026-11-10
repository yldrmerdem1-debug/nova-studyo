import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, textLocale, textWidth } from '../fonts';
import { LETTERBOX } from '../fx';
import type { FontKey, Genre, TextStyle } from '../types';
import { alpha, contrast, isLight, lum, mix, readable } from './color';
import { ELITE } from './fonts';

/*
 * TEXT STYLES — how words are set, beyond the genre's original 'box'.
 * Four entry points, one per scene kind that sets words:
 *   StyledCaption      narration captions (words scenes) incl. the keyword
 *   StyledSlam         the one-word punch (slam scenes)
 *   StyledTitle        the video title (title scenes, not chapter cards)
 *   StyledMontageWord  the cold open's words (montage)
 * Every word still lands on the frame it is spoken (the callers pass the
 * frames); every block is sized from the width model (fonts.ts) to stay inside
 * the safe area — the engine's +5% impact punch included — and clear of the
 * letterbox bars. Colours come from the scene's look (src/looks/resolve.ts):
 * `surface` says whether type sits on a light ground (dark ink, no glow) or a
 * dark one / a picture (light ink, soft shadow).
 */

export interface TextCtx {
  genre: Genre;
  style: TextStyle;
  surface: 'light' | 'dark';
  chapterName?: string;
  /** An info caption's own small-caps kicker (words.kicker); else the chapter name. */
  kicker?: string;
  index: number;
  /**
   * The picture under the words shows a face (scene.textAt, the pipeline's call): the block leaves the frame's middle
   * for the lower third ('low') or the upper band ('top'). Lula (Oct 2026): "HOW BRAZIL REALLY VOTED" sat on Lula's
   * mouth and a giant "52" on Flávio Bolsonaro's face — every centred slam, title and stacked line crossed the face.
   */
  at?: 'low' | 'top';
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const FW = 1920;
const FH = 1080;
const BOX = { boxSizing: 'border-box' } as const;
const outExpo = Easing.out(Easing.exp);
const outCubic = Easing.out(Easing.cubic);
const inOut = Easing.inOut(Easing.cubic);
/** The engine's impact punch (+5%) on top of a style's own landing. */
const PUNCH = 1.05;

const barPx = (g: Genre) => (g.letterbox ? Math.round(FH * LETTERBOX) : 0);

/** The tallest block kept off a face (ctx.at): about a third of the frame, so it stays under the eyes. */
export const BAND_H = Math.round(FH * 0.3);
/** Biggest slam/key word in that band (the classic 260 px slam plus its line would climb back to the face). */
export const BAND_SLAM = 200;
/**
 * Where a block kept off a face sits (ctx.at): the lower third, clear of the letterbox bar and the bottom edge, or the
 * upper band. `left`/`right` keep a style's own side padding (stack and editorial blocks are flush-left).
 */
export function band(at: 'low' | 'top', g: Genre, alignItems: React.CSSProperties['alignItems'], left = 0, right = 0): React.CSSProperties {
  const bar = barPx(g);
  return at === 'low'
    ? { ...BOX, justifyContent: 'flex-end', alignItems, padding: `0 ${right}px ${Math.max(140, bar + 80)}px ${left}px` }
    : { ...BOX, justifyContent: 'flex-start', alignItems, padding: `${Math.max(120, bar + 70)}px ${right}px 0 ${left}px` };
}

/* ================================================================ faces */

type FaceKey = FontKey | 'elite';
interface Face {
  key: FaceKey;
  family: string;
  upper: boolean;
  trackEm: number;
  weight: number;
  italic: boolean;
}

function face(style: TextStyle, g: Genre): Face {
  switch (style) {
    case 'serif': {
      const k: FontKey = g.headline === 'playfair' ? 'playfair' : 'dmserif';
      return { key: k, family: FONT[k], upper: false, trackEm: -0.005, weight: k === 'playfair' ? 700 : 400, italic: true };
    }
    case 'typewriter':
      return { key: 'elite', family: ELITE, upper: false, trackEm: 0.01, weight: 400, italic: false };
    case 'stamp':
      return { key: 'oswald', family: FONT.oswald, upper: true, trackEm: 0.06, weight: 700, italic: false };
    case 'neon':
      return { key: 'spacegrotesk', family: FONT.spacegrotesk, upper: true, trackEm: 0.05, weight: 500, italic: false };
    default:
      return { key: g.headline, family: FONT[g.headline], upper: true, trackEm: 0.012, weight: 800, italic: false };
  }
}

/** The body face for captions in a style. */
function bodyFace(style: TextStyle, g: Genre): Face {
  switch (style) {
    case 'serif': {
      const f = face('serif', g);
      return { ...f, weight: f.key === 'playfair' ? 500 : 400 };
    }
    case 'typewriter':
    case 'cutout':
      return { key: 'elite', family: ELITE, upper: false, trackEm: 0, weight: 400, italic: false };
    case 'glitch':
      return { key: 'jetbrains', family: FONT.jetbrains, upper: true, trackEm: 0.04, weight: 400, italic: false };
    case 'neon':
      return { key: 'spacegrotesk', family: FONT.spacegrotesk, upper: false, trackEm: 0.01, weight: 400, italic: false };
    default:
      // Confident, not thin: a bold body face reads over any picture (a 600 grey line sank into the photo).
      return { key: g.body, family: FONT[g.body], upper: false, trackEm: 0, weight: 700, italic: false };
  }
}

const loc = () => textLocale();

/** Width in px of one line in a face. */
function widthOf(text: string, f: Face, size: number): number {
  if (f.key === 'elite') {
    const n = [...text].length;
    return size * n * (0.61 + f.trackEm);
  }
  return textWidth(text, f.key, size, { trackEm: f.trackEm, upper: f.upper }) * (f.italic ? 1.04 : 1);
}

/** Cut-out letters: a scrap per letter (padding + margin + the widest faces). */
function cutoutWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += ch === ' ' ? 0.34 : 0.92;
  return w * size;
}

/** Largest size (<= cap) at which `text` in `style` fits `maxW` px, scaled by `scaleMax`, with `padEm` of furniture. */
export function fitStyled(text: string, style: TextStyle, g: Genre, o: { maxW: number; cap: number; scaleMax?: number; padEm?: number; min?: number }): number {
  const t = shownText(text, style);
  const per = (style === 'cutout' ? cutoutWidth(t, 100) : widthOf(t, face(style, g), 100)) / 100 + (o.padEm ?? padOf(style));
  if (per <= 0) return o.cap;
  return Math.max(o.min ?? 20, Math.floor(Math.min(o.cap, o.maxW / ((o.scaleMax ?? 1) * 1.03 * per))));
}

/** Horizontal furniture of a style, in em (stamp border, typewriter slip, marker overhang...). */
function padOf(style: TextStyle): number {
  switch (style) {
    case 'stamp':
      return 0.9;
    case 'typewriter':
      return 0.8;
    case 'marker':
      return 0.3;
    case 'neon':
      return 0.5;
    default:
      return 0.04;
  }
}

/** ALL-CAPS words become Title Case for the italic serif (caps italics shout). */
function serifCase(t: string): string {
  const L = loc();
  return t
    .split(/(\s+)/)
    .map((w) => {
      const letters = w.replace(/[^\p{L}]/gu, '');
      if (letters.length >= 3 && letters === letters.toLocaleUpperCase(L) && letters !== letters.toLocaleLowerCase(L)) {
        const lo = w.toLocaleLowerCase(L);
        const i = lo.search(/\p{L}/u);
        return i < 0 ? lo : lo.slice(0, i) + lo[i].toLocaleUpperCase(L) + lo.slice(i + 1);
      }
      return w;
    })
    .join('');
}

/** Styles set in their own case (the rest are capitals). */
const OWN_CASE = new Set<TextStyle>(['serif', 'typewriter']);

function shownText(t: string, style: TextStyle): string {
  const s = String(t ?? '');
  if (style === 'serif') return serifCase(s);
  if (OWN_CASE.has(style)) return s;
  return s.toLocaleUpperCase(loc());
}

/** A word as a face shows it: a lower-case face (a lyric's small words) keeps the script's case. */
function shownFor(text: string, f: Face, style: TextStyle = 'box'): string {
  if (style === 'serif' || OWN_CASE.has(style)) return shownText(text, style);
  return f.upper ? String(text ?? '').toLocaleUpperCase(loc()) : String(text ?? '');
}

/** Small connecting words a lyric line sets small and light. */
const MINOR = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'but', 'for', 'by', 'with', 'from', 'as', 'is', 'was', 'it', 'its', 'that', 'this', 'into', 'bir', 've', 'ile', 'da', 'de', 'bu', 'şu', 'o', 'için', 'gibi', 'ki']);
const isMinor = (w: string) => MINOR.has(w.toLocaleLowerCase(loc()).replace(/[^\p{L}]/gu, ''));

/** Lines of a lyric: 1-4 words, broken after punctuation, the keyword never split. */
function lyricLines(words: string[], k0: number, k1: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let from = 0;
  let chars = 0;
  for (let i = 0; i < words.length; i++) {
    const inKey = k0 >= 0 && i > k0 && i < k1;
    const n = i - from;
    if (!inKey && n > 0 && (n >= 4 || chars + words[i].length > 17 || (i === k0 && n >= 2))) {
      out.push({ from, to: i });
      from = i;
      chars = 0;
    }
    chars += words[i].length + 1;
    if (/[.,;:!?—…]$/.test(words[i]) && !(k0 >= 0 && i >= k0 && i < k1 - 1)) {
      out.push({ from, to: i + 1 });
      from = i + 1;
      chars = 0;
    }
  }
  if (from < words.length) out.push({ from, to: words.length });
  return out;
}

/* =============================================================== colours */

interface Pal {
  ink: string;
  accent: string;
  accent2: string;
  /** Soft shadow under light type over a picture; none on a light ground. */
  shadow: string;
  light: boolean;
  paper: string;
}

function palette(ctx: TextCtx): Pal {
  const g = ctx.genre;
  const light = ctx.surface === 'light';
  const ground = light ? g.bg : '#141414';
  return {
    ink: g.ink,
    accent: readable(g.accent, ground, 3),
    accent2: readable(g.accent2, ground, 3),
    shadow: light ? 'none' : '0 0 3px rgba(0,0,0,0.85), 0 3px 18px rgba(0,0,0,0.75)',
    light,
    paper: isLight(g.paper) ? g.paper : '#efe9dc',
  };
}

/** HSL saturation 0..1. */
function saturation(color: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return 0;
  return (mx - mn) / (1 - Math.abs(2 * l - 1));
}

/** Ink that reads on a fill. */
const inkOn = (fill: string) => (lum(fill) > 0.36 ? '#111111' : '#ffffff');

/* ======================================================== baked textures */

const bakeCache = new Map<string, string>();

/** Worn-ink mask for stamps: speckled alpha, baked once per render tab. */
function inkMask(): string {
  const key = 'stamp-mask';
  const hit = bakeCache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d');
  if (!x) return '';
  x.fillStyle = '#000';
  x.fillRect(0, 0, 512, 256);
  let s = 12345;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // Holes where the ink did not take: clusters of small clear specks, a few larger voids.
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i++) {
    const px = r() * 512;
    const py = r() * 256;
    const rad = r() < 0.94 ? 0.6 + r() * 1.6 : 2 + r() * 5;
    x.fillStyle = `rgba(0,0,0,${0.35 + r() * 0.6})`;
    x.beginPath();
    x.arc(px, py, rad, 0, Math.PI * 2);
    x.fill();
  }
  const url = c.toDataURL('image/png');
  bakeCache.set(key, url);
  return url;
}

/* ============================================================= the word */

interface WordProps {
  text: string;
  ctx: TextCtx;
  size: number;
  /** Frames since this word landed (negative: not yet). */
  since: number;
  /** The big version (slam, hook, title): furniture and echoes. */
  hero?: boolean;
  /** Inline keyword colour role: the emphasis colour instead of ink. */
  emphasis?: boolean;
  seed?: string;
  /** Face override (captions). */
  f?: Face;
  /** Typewriter: type on its own paper slip (off inside a typewriter caption, which is the slip). */
  plate?: boolean;
}

/**
 * One word or short phrase in a style, animating in from `since` = 0.
 * Returns an inline-block the caller positions.
 */
export const StyledWord: React.FC<WordProps> = ({ text, ctx, size, since, hero, emphasis, seed = '', f: faceIn, plate = true }) => {
  const frame = useCurrentFrame();
  const style = ctx.style;
  const g = ctx.genre;
  const P = palette(ctx);
  const F = faceIn ?? face(style, g);
  const t = shownFor(text, F, style);
  if (since < 0) return <span style={{ display: 'inline-block', opacity: 0, fontSize: size, fontFamily: F.family }}>{t}</span>;
  const base: React.CSSProperties = {
    fontFamily: F.family,
    fontWeight: F.weight,
    fontStyle: F.italic ? 'italic' : 'normal',
    fontSize: size,
    lineHeight: 1,
    letterSpacing: `${F.trackEm}em`,
    textTransform: F.upper ? 'uppercase' : 'none',
    whiteSpace: 'nowrap',
  };
  const col = emphasis ? P.accent : P.ink;

  switch (style) {
    case 'underline': {
      // Printed label (the early videos' punchy yellow tags): the word slams onto a solid
      // block that lands a frame earlier. Replaces the thin accent bar wiping in under the
      // word, which read as a template ("Claude olduğu çok belli" — user, 1929 "SAVED").
      const fill = g.labelBg ?? P.accent;
      const ink = g.labelInk ?? inkOn(fill);
      const block = interpolate(since, [0, 5], [0, 1], { ...clamp, easing: outExpo });
      const pop = interpolate(since, [1, 4, 9], [1.22, 0.97, 1], { ...clamp, easing: outCubic });
      const tilt = ((random(`lb${seed}${t}`) - 0.5) * 3.2).toFixed(2);
      return (
        <span style={{ position: 'relative', display: 'inline-block', fontSize: size, padding: '0.06em 0.2em 0.02em', transform: `rotate(${tilt}deg)` }}>
          <span style={{ position: 'absolute', inset: 0, background: fill, transform: `scaleY(${block})`, transformOrigin: 'center bottom', boxShadow: hero ? `0 0.07em 0 ${mix(fill, '#000000', 0.45)}, 0 0.25em 0.5em rgba(0,0,0,0.45)` : '0 0.16em 0.4em rgba(0,0,0,0.35)' }} />
          <span style={{ ...base, position: 'relative', display: 'inline-block', color: ink, transform: `scale(${pop})`, opacity: block > 0.4 ? 1 : 0 }}>{t}</span>
        </span>
      );
    }
    case 'marker': {
      const sweep = interpolate(since, [0, 7], [0, 1], { ...clamp, easing: outCubic });
      const sweep2 = interpolate(since, [3, 11], [0, 1], { ...clamp, easing: outCubic });
      const fill = isLight(g.accent) || lum(g.accent) > 0.18 ? g.accent : g.labelBg;
      const ink = inkOn(fill);
      const r = (k: string) => random(`mk${seed}${t}${k}`);
      const tilt = (r('t') - 0.5) * 2.4;
      const d1 = `M1 ${7 + r('a') * 3} C 18 ${4 + r('b') * 3}, 45 ${6 + r('c') * 2}, 70 ${4 + r('d') * 3} S 94 ${5 + r('e') * 2}, 99 ${6 + r('f') * 3} L 98.5 ${24 - r('g') * 3} C 80 ${27 - r('h') * 2}, 52 ${25 - r('i') * 3}, 30 ${27 - r('j') * 2} S 6 ${25 - r('k') * 2}, 2 ${26 - r('l') * 3} Z`;
      const d2 = `M0 ${11 + r('m') * 3} C 25 ${9 + r('n') * 2}, 60 ${12 + r('o') * 2}, 100 ${10 + r('p') * 3} L 100 ${19 + r('q') * 2} C 62 ${22 + r('r') * 2}, 28 ${20 + r('s') * 2}, 1 ${21 + r('u') * 2} Z`;
      return (
        <span style={{ position: 'relative', display: 'inline-block', padding: '0 0.14em', fontSize: size }}>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ position: 'absolute', left: '-0.05em', right: '-0.05em', width: 'calc(100% + 0.1em)', top: '0.02em', height: '1.08em', overflow: 'visible', transform: `rotate(${tilt}deg)` }}>
            <path d={d1} fill={fill} opacity={0.94} style={{ clipPath: `inset(0 ${(1 - sweep) * 100}% 0 0)` }} />
            <path d={d2} fill={mix(fill, '#000000', 0.12)} opacity={0.35} style={{ clipPath: `inset(0 ${(1 - sweep2) * 100}% 0 0)` }} />
          </svg>
          <span style={{ ...base, position: 'relative', color: ink, textTransform: F.upper ? 'uppercase' : 'none' }}>{t}</span>
        </span>
      );
    }
    case 'outline': {
      const fill = interpolate(since, [3, 17], [0, 1], { ...clamp, easing: inOut });
      const sw = Math.max(2, Math.round(size * 0.022));
      const pop = interpolate(since, [0, 4], [1.12, 1], { ...clamp, easing: outCubic });
      const echoes = hero
        ? [3, 2, 1].map((k) => {
            const out = interpolate(since, [0, 10], [0, 1], { ...clamp, easing: outCubic });
            return (
              <span
                key={k}
                style={{
                  ...base,
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  color: 'transparent',
                  WebkitTextStroke: `${Math.max(1.5, sw * 0.7)}px ${k === 1 ? P.accent : P.accent2}`,
                  opacity: (0.55 - k * 0.13) * out,
                  transform: `translate(${k * 0.045 * out}em, ${k * 0.045 * out}em)`,
                }}
              >
                {t}
              </span>
            );
          })
        : null;
      return (
        <span style={{ position: 'relative', display: 'inline-block', fontSize: size, transform: `scale(${pop})` }}>
          {echoes}
          <span style={{ ...base, position: 'relative', color: 'transparent', WebkitTextStroke: `${sw}px ${hero ? P.ink : col}` }}>{t}</span>
          {/* The fill sweeps in behind the stroke: light ink on a hero (the accent lives in the echoes), the accent on a keyword. */}
          <span style={{ ...base, position: 'absolute', left: 0, top: 0, color: hero ? P.ink : P.accent, clipPath: `inset(-10% ${(1 - fill) * 100}% -10% 0)`, WebkitTextStroke: `${sw}px ${hero ? P.ink : P.accent}`, textShadow: P.shadow }}>{t}</span>
        </span>
      );
    }
    case 'serif': {
      const chars = [...t];
      const step = Math.min(1.2, 14 / Math.max(1, chars.length));
      return (
        <span style={{ ...base, display: 'inline-block', color: hero ? P.ink : col, textShadow: P.shadow }}>
          {chars.map((ch, i) => {
            const p = interpolate(since, [i * step, i * step + 9], [0, 1], { ...clamp, easing: outCubic });
            return (
              <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: p, transform: `translateY(${(1 - p) * 0.25}em)`, filter: p < 0.98 ? `blur(${(1 - p) * 8}px)` : undefined }}>
                {ch}
              </span>
            );
          })}
        </span>
      );
    }
    case 'typewriter': {
      const chars = [...t];
      const per = hero ? 1.2 : 0.8;
      const n = Math.min(chars.length, Math.floor(since / per) + 1);
      const cursor = n < chars.length || Math.floor(frame / 9) % 2 === 0;
      const ink = '#1b1712';
      // The second ribbon's colour: the look's most vivid colour on the paper, else classic typewriter red.
      const vivid = saturation(g.accent2) >= saturation(g.accent) ? g.accent2 : g.accent;
      const redInk = saturation(vivid) >= 0.35 ? readable(vivid, P.paper, 3.2) : '#b3151a';
      const col2 = emphasis || hero ? redInk : ink;
      const under = interpolate(since, [chars.length * per, chars.length * per + 8], [0, 1], { ...clamp, easing: outCubic });
      return (
        <span
          style={{
            position: 'relative',
            display: 'inline-block',
            fontSize: size,
            background: plate ? P.paper : undefined,
            padding: plate ? '0.16em 0.4em 0.1em' : '0 0.02em 0.1em',
            transform: plate ? `rotate(${hero ? -1.2 : (random(`tw${seed}`) - 0.5) * 2}deg)` : undefined,
            boxShadow: !plate ? undefined : P.light ? '0 2px 0 rgba(0,0,0,0.08)' : '0 0.08em 0.3em rgba(0,0,0,0.45)',
          }}
        >
          <span style={{ ...base, color: col2 }}>
            {chars.slice(0, n).join('')}
            <span style={{ display: 'inline-block', width: '0.07em', marginRight: '-0.07em', height: '0.86em', verticalAlign: '-0.1em', background: col2, opacity: cursor ? 0.85 : 0 }} />
            <span style={{ visibility: 'hidden' }}>{chars.slice(n).join('')}</span>
          </span>
          {emphasis || hero ?<span style={{ position: 'absolute', left: '0.36em', right: '0.36em', bottom: '0.1em', height: Math.max(2, size * 0.045), background: redInk, transform: `scaleX(${under})`, transformOrigin: 'left center' }} /> : null}
        </span>
      );
    }
    case 'cutout': {
      const letters = [...t];
      const fonts: string[] = [FONT.anton, FONT.bebas, FONT.dmserif, FONT.courier, FONT.archivo, FONT.oswald, FONT.playfair];
      const fills: [string, string][] = [
        [P.paper, '#111111'],
        ['#141414', '#f4efe4'],
        [g.accent, inkOn(g.accent)],
        ['#d9d3c4', '#161616'],
        [g.accent2, inkOn(g.accent2)],
        ['#ffffff', '#c8102e'],
        ['#f2d24b', '#111111'],
      ];
      let li = 0;
      return (
        <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: size, lineHeight: 1 }}>
          {letters.map((ch, i) => {
            if (ch === ' ') return <span key={i} style={{ display: 'inline-block', width: '0.34em' }} />;
            const k = li++;
            const rr = (s: string) => random(`co${seed}${t}${i}${s}`);
            const at = k * 1.4;
            const p = interpolate(since, [at, at + 4], [0, 1], { ...clamp, easing: outCubic });
            const [bg, fg] = fills[Math.floor(rr('c') * fills.length)];
            const fam = fonts[Math.floor(rr('f') * fonts.length)];
            const sc = 0.86 + rr('s') * 0.24;
            const rot = (rr('r') - 0.5) * 14;
            const torn = `polygon(${(rr('a') * 6).toFixed(1)}% ${(rr('b') * 8).toFixed(1)}%, 40% ${(rr('d') * 5).toFixed(1)}%, ${(94 + rr('e') * 6).toFixed(1)}% ${(rr('g') * 7).toFixed(1)}%, 100% 55%, ${(95 + rr('h') * 5).toFixed(1)}% ${(93 + rr('i') * 7).toFixed(1)}%, 55% 100%, ${(rr('j') * 6).toFixed(1)}% ${(94 + rr('k') * 6).toFixed(1)}%, 0% 45%)`;
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  margin: '0 0.03em',
                  verticalAlign: 'middle',
                  opacity: p,
                  transform: `translateY(${(rr('y') - 0.5) * 0.12}em) rotate(${rot}deg) scale(${sc * (1 + (1 - p) * 0.6)})`,
                  filter: P.light ? 'drop-shadow(0.03em 0.05em 0 rgba(0,0,0,0.18))' : 'drop-shadow(0.03em 0.06em 0.02em rgba(0,0,0,0.55))',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    background: bg,
                    color: fg,
                    fontFamily: fam,
                    fontWeight: 700,
                    fontSize: '0.86em',
                    lineHeight: 1.05,
                    padding: '0.1em 0.1em 0.04em',
                    textTransform: 'uppercase',
                    clipPath: torn,
                  }}
                >
                  {ch}
                </span>
              </span>
            );
          })}
        </span>
      );
    }
    case 'glitch': {
      const burst = since < 10;
      const relapse = !burst && random(`gl${seed}${Math.floor((frame + 7) / 43)}`) > 0.72 && (frame + 7) % 43 < 3;
      const live = burst || relapse;
      const amp = burst ? interpolate(since, [0, 10], [1, 0.15], clamp) : relapse ? 0.5 : 0;
      const split = Math.max(1.5, size * 0.018) + amp * size * 0.06;
      const cyan = P.light ? '#009fb7' : '#00e5ff';
      const red = P.light ? '#e0004d' : '#ff2b5a';
      const main = hero ? P.ink : col;
      const bands: [number, number][] = [
        [0, 22],
        [22, 48],
        [48, 71],
        [71, 100],
      ];
      return (
        <span style={{ position: 'relative', display: 'inline-block', fontSize: size }}>
          <span style={{ ...base, position: 'absolute', left: 0, top: 0, color: cyan, opacity: 0.8, transform: `translateX(${-split}px)`, mixBlendMode: P.light ? 'multiply' : 'screen' }}>{t}</span>
          <span style={{ ...base, position: 'absolute', left: 0, top: 0, color: red, opacity: 0.8, transform: `translateX(${split}px)`, mixBlendMode: P.light ? 'multiply' : 'screen' }}>{t}</span>
          <span style={{ ...base, position: 'relative', color: main, visibility: live ? 'hidden' : 'visible' }}>{t}</span>
          {live
            ? bands.map(([a, b], k) => (
                <span
                  key={k}
                  style={{
                    ...base,
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    color: main,
                    clipPath: `inset(${a}% -5% ${100 - b}% -5%)`,
                    transform: `translateX(${(random(`gs${seed}${frame}${k}`) - 0.5) * amp * size * 0.5}px)`,
                  }}
                >
                  {t}
                </span>
              ))
            : null}
        </span>
      );
    }
    case 'neon': {
      const on = [0, 0.85, 0.1, 1, 0.25, 1, 1, 0.55, 1][since] ?? 1;
      const hum = 0.94 + Math.sin(frame / 2.1) * 0.03 + Math.sin(frame / 5.3) * 0.03;
      const tube = emphasis || hero ? g.accent : g.accent2;
      if (P.light) {
        return <span style={{ ...base, color: readable(tube, g.bg, 3), opacity: on }}>{t}</span>;
      }
      const core = mix(tube, '#ffffff', 0.62);
      const glow = `0 0 0.02em #ffffff, 0 0 0.07em ${tube}, 0 0 0.18em ${tube}, 0 0 0.42em ${alpha(tube, 0.85)}, 0 0 0.9em ${alpha(tube, 0.5)}`;
      const frameP = interpolate(since, [2, 16], [0, 1], { ...clamp, easing: inOut });
      return (
        <span style={{ position: 'relative', display: 'inline-block', fontSize: size, padding: hero ? '0.18em 0.25em' : 0, opacity: on * hum }}>
          {hero ? (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '0.28em',
                border: `${Math.max(3, size * 0.03)}px solid ${mix(g.accent2, '#ffffff', 0.5)}`,
                boxShadow: `0 0 ${size * 0.08}px ${g.accent2}, inset 0 0 ${size * 0.08}px ${alpha(g.accent2, 0.6)}`,
                clipPath: `inset(0 ${(1 - frameP) * 100}% 0 0)`,
              }}
            />
          ) : null}
          <span style={{ ...base, position: 'relative', color: core, textShadow: glow }}>{t}</span>
        </span>
      );
    }
    case 'stamp': {
      const s = interpolate(since, [0, 3, 6], [2.3, 0.95, 1], { ...clamp, easing: outCubic });
      const o = interpolate(since, [0, 1], [0, 0.94], clamp);
      // Stamp ink: the look's most saturated colour (a grey/black accent would print as a smudge), then made readable.
      const vivid = saturation(g.accent2) >= saturation(g.accent) ? g.accent2 : g.accent;
      const inkBase = saturation(vivid) < 0.25 ? '#c0152b' : vivid;
      const ink = readable(inkBase, P.light ? g.bg : '#1a1a1a', 3);
      const mask = inkMask();
      const rot = hero ? -6 : -4 + (random(`st${seed}`) - 0.5) * 3;
      return (
        <span
          style={{
            ...base,
            display: 'inline-block',
            color: ink,
            border: `${Math.max(3, size * 0.07)}px solid ${ink}`,
            outline: `${Math.max(1.5, size * 0.025)}px solid ${ink}`,
            outlineOffset: `-${Math.max(6, size * 0.15)}px`,
            padding: '0.2em 0.36em 0.12em',
            borderRadius: '0.06em',
            opacity: o,
            transform: `rotate(${rot}deg) scale(${s})`,
            WebkitMaskImage: mask ? `url(${mask})` : undefined,
            maskImage: mask ? `url(${mask})` : undefined,
            WebkitMaskSize: '512px 256px',
            maskSize: '512px 256px',
          }}
        >
          {t}
        </span>
      );
    }
    case 'lyric': {
      const p = interpolate(since, [0, 3], [0, 1], clamp);
      const s = interpolate(since, [0, 4, 8], [0.55, 1.08, 1], { ...clamp, easing: outCubic });
      const y = interpolate(since, [0, 6], [0.28, 0], { ...clamp, easing: outCubic });
      return (
        <span style={{ ...base, display: 'inline-block', color: emphasis ? P.accent : P.ink, opacity: p, transform: `translateY(${y}em) scale(${s})`, textShadow: P.shadow }}>
          {t}
        </span>
      );
    }
    case 'kinetic': {
      const dir = random(`kd${seed}${t}`) < 0.5 ? -1 : 1;
      const rot = (random(`kr${seed}${t}`) - 0.5) * 7;
      const x = interpolate(since, [0, 4], [dir * 0.7, 0], { ...clamp, easing: outExpo });
      const s = interpolate(since, [0, 3, 6], [1.4, 0.95, 1], { ...clamp, easing: outCubic });
      const blur = since < 4 ? (4 - since) * 5 : 0;
      const shake = emphasis && since < 12 ? (1 - since / 12) * size * 0.04 : 0;
      const jx = shake ? (random(`kx${seed}${frame}`) - 0.5) * shake : 0;
      const jy = shake ? (random(`ky${seed}${frame}`) - 0.5) * shake : 0;
      return (
        <span
          style={{
            ...base,
            display: 'inline-block',
            color: emphasis ? P.accent : P.ink,
            opacity: interpolate(since, [0, 1], [0, 1], clamp),
            transform: `translate(calc(${x}em + ${jx}px), ${jy}px) rotate(${rot * interpolate(since, [0, 6], [1.6, 0.5], clamp)}deg) scale(${s})`,
            filter: blur ? `blur(${blur * 0.5}px)` : undefined,
            // Motion streak: two trailing copies behind the direction of travel while it lands.
            textShadow:
              since < 4
                ? `${-dir * 0.09 * (4 - since)}em 0 0 ${alpha(emphasis ? P.accent : P.ink, 0.4)}, ${-dir * 0.2 * (4 - since)}em 0 0 ${alpha(emphasis ? P.accent : P.ink, 0.18)}`
                : P.shadow,
          }}
        >
          {t}
        </span>
      );
    }
    case 'lower-third':
    case 'stack':
    default: {
      // Mask rise in the headline face (stack rows, lower-third keywords).
      const rise = interpolate(since, [0, 8], [1.05, 0], { ...clamp, easing: outExpo });
      return (
        <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', padding: '0.06em 0.02em 0.02em', fontSize: size }}>
          <span style={{ ...base, display: 'inline-block', color: emphasis ? P.accent : P.ink, transform: `translateY(${rise * 100}%)`, textShadow: P.shadow }}>{t}</span>
        </span>
      );
    }
  }
};

/* ============================================================= captions */

/** Rows for the kinetic stack: 1-3 words each, the keyword alone on its row. */
function stackRows(words: string[], k0: number, k1: number): { from: number; to: number; key: boolean }[] {
  const rows: { from: number; to: number; key: boolean }[] = [];
  let i = 0;
  while (i < words.length) {
    if (k0 >= 0 && i === k0) {
      rows.push({ from: k0, to: k1, key: true });
      i = k1;
      continue;
    }
    let j = i;
    let chars = 0;
    while (j < words.length && !(k0 >= 0 && j === k0) && (j === i || (chars + words[j].length <= 13 && j - i < 3))) {
      chars += words[j].length + 1;
      j++;
    }
    rows.push({ from: i, to: j, key: false });
    i = j;
  }
  return rows;
}

/**
 * A soft dark pool behind a text block over a picture: an ellipse that fades
 * out in every direction, never a band with edges (the feathered rectangle
 * read as a cheap template strip across the photo). No blur: cheap.
 */
const Scrim: React.FC<{ on: boolean; opacity: number; pad?: number; strength?: number }> = ({ on, opacity, pad = 90, strength = 0.66 }) =>
  on ? (
    <div
      style={{
        position: 'absolute',
        left: -pad * 1.9,
        right: -pad * 1.9,
        top: -110,
        bottom: -110,
        background: `radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,${strength * 0.92}) 0%, rgba(0,0,0,${strength * 0.7}) 42%, rgba(0,0,0,${strength * 0.25}) 72%, rgba(0,0,0,0) 100%)`,
        opacity,
        pointerEvents: 'none',
      }}
    />
  ) : null;

/** The refined serif of the editorial caption: the look's own serif headline, else DM Serif Display. */
const editorialKey = (g: Genre): FontKey => (g.headline === 'playfair' || g.headline === 'dmserif' ? g.headline : 'dmserif');
/** Small-caps kicker colour: ink warmed by the accent (never a loud accent strip). */
const kickerInk = (P: Pal) => (P.light ? mix(P.ink, P.accent, 0.5) : mix('#f6f2ea', P.accent, 0.3));

export interface CaptionProps {
  ctx: TextCtx;
  words: string[];
  frames: number[];
  k0: number;
  k1: number;
  /** Over a picture (scrim, light ink). */
  pictured: boolean;
  /** Depth-split subject box: the text takes the empty side. */
  side?: 'left' | 'right';
  durFrames: number;
}

/**
 * Narration captions in a text style. The keyword (k0..k1) gets the style's
 * emphasis; `stack`, `serif`, `lower-third` and `typewriter` also re-set the
 * whole line (layout, face, furniture).
 */

export const StyledCaption: React.FC<CaptionProps> = ({ ctx, words, frames, k0, k1, pictured, side, durFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const style = ctx.style;
  const g = ctx.genre;
  const P = palette(ctx);
  const bar = barPx(g);
  const first = frames.length ? frames[0] : 0;
  const scrimIn = interpolate(f, [first - 6, first + 4], [0, 1], clamp);
  const colW = side ? FW * 0.46 - 30 : FW - 340;
  const sinceOf = (i: number) => f - (frames[i] ?? 0);

  /* ---- lyric / kinetic: the line fills the screen word by word; finished lines move on ---- */
  if (style === 'lyric' || style === 'kinetic') {
    const kinetic = style === 'kinetic';
    const lines = lyricLines(words, k0, k1);
    const maxW = side ? colW : 1640;
    const F = face(style, g);
    const small: Face = { key: g.body, family: FONT[g.body], upper: false, trackEm: 0, weight: 500, italic: false };
    const laid = lines.map((l) => {
      const items = words.slice(l.from, l.to).map((w, j) => {
        const i = l.from + j;
        const key = i >= k0 && i < k1;
        const minor = !key && isMinor(w);
        const fc = minor ? small : F;
        const rel = key ? 1.5 : minor ? 0.52 : random(`ly${ctx.index}${i}`) < 0.3 ? 1.18 : 1;
        return { w, i, key, fc, rel };
      });
      // One base size per line: the whole line (with its gaps) fits the width, the engine's punch included.
      const per = items.reduce((a, it) => a + (widthOf(shownFor(it.w, it.fc), it.fc, 100) / 100) * it.rel + 0.26, 0);
      const base = Math.max(30, Math.min(kinetic ? 150 : 140, Math.floor(maxW / (per * 1.03 * PUNCH * 1.08))));
      return { items, base };
    });
    const starts = lines.map((l) => frames[l.from] ?? 0);
    let L = 0;
    starts.forEach((s, i) => {
      if (f >= s) L = i;
    });
    const t = interpolate(f - starts[L], [0, kinetic ? 4 : 10], [0, 1], { ...clamp, easing: kinetic ? outExpo : inOut });
    const dimIn = interpolate(f, [first - 8, first + 4], [0, 1], clamp);
    // Off a face (ctx.at) the live line sits in the lower third or the upper band; finished lines still rise from it.
    const cy = side ? FH / 2 : ctx.at === 'low' ? Math.round(FH * 0.72) : ctx.at === 'top' ? Math.round(FH * 0.27) : FH / 2 + 30;
    const cx = side === 'left' ? 150 + maxW / 2 : side === 'right' ? FW - 150 - maxW / 2 : FW / 2;
    const lineEl = (li: number, y: number, scale: number, opacity: number, extra: React.CSSProperties = {}) => {
      const L0 = laid[li];
      if (!L0 || opacity <= 0.01) return null;
      return (
        <div
          key={li}
          style={{
            position: 'absolute',
            left: cx,
            top: cy + y,
            transform: `translate(-50%, -50%) scale(${scale})`,
            opacity,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: `${Math.round(L0.base * 0.26)}px`,
            whiteSpace: 'nowrap',
            ...extra,
          }}
        >
          {L0.items.map((it) => (
            <StyledWord key={it.i} text={it.w} ctx={ctx} size={Math.round(L0.base * it.rel)} since={f - (frames[it.i] ?? 0)} emphasis={it.key} seed={`${ctx.index}w${it.i}`} f={it.fc} />
          ))}
        </div>
      );
    };
    const cur = laid[L]?.base ?? 100;
    const prev = laid[L - 1]?.base ?? 100;
    const gap1 = cur * 0.62 + prev * 0.3 + 40;
    const out: React.ReactNode[] = [];
    if (kinetic) {
      // The finished line whips up and out in 4 frames.
      if (L > 0 && t < 1) out.push(lineEl(L - 1, -t * 520, 1, 1 - t, { filter: t > 0.05 ? `blur(${t * 14}px)` : undefined }));
    } else {
      const older = laid[L - 2]?.base ?? 100;
      if (L > 1) out.push(lineEl(L - 2, -gap1 - (prev * 0.3 + older * 0.22 + 30) * t, 0.55 - 0.1 * t, 0.35 * (1 - t)));
      if (L > 0) out.push(lineEl(L - 1, -gap1 * t, 1 - 0.45 * t, 1 - 0.65 * t));
    }
    out.push(lineEl(L, 0, 1, 1));
    return (
      <AbsoluteFill>
        {pictured ? <AbsoluteFill style={{ background: 'rgba(0,0,0,0.5)', opacity: dimIn }} /> : null}
        {out}
      </AbsoluteFill>
    );
  }

  /* ---- kinetic stack: rows justified to one width, the keyword row biggest ---- */
  if (style === 'stack') {
    const rows = stackRows(words, k0, k1);
    const blockW = side ? colW : Math.min(1180, colW);
    // Off a face (ctx.at, no depth split) the block keeps to a third of the frame, in its band.
    const banded = !side && !!ctx.at;
    const H = banded ? BAND_H : FH - 2 * Math.max(110, bar + 60);
    const F = face('stack', g);
    let sizes = rows.map((r) => {
      const text = words.slice(r.from, r.to).join(' ');
      return fitStyled(text, 'stack', g, { maxW: blockW, cap: r.key ? 230 : 124, scaleMax: PUNCH, padEm: 0.05, min: 26 });
    });
    const lineH = 0.98;
    const total = sizes.reduce((a, s) => a + s * lineH + 6, 0);
    if (total > H) sizes = sizes.map((s) => Math.floor((s * H) / total));
    const left = side === 'right' ? undefined : side === 'left' ? 150 : 170;
    return (
      <AbsoluteFill style={banded && ctx.at ? band(ctx.at, g, 'flex-start', 170) : { ...BOX, justifyContent: 'center', alignItems: side === 'right' ? 'flex-end' : 'flex-start', padding: side === 'right' ? '0 150px 0 0' : `0 0 0 ${left}px` }}>
        <div style={{ position: 'relative', width: blockW }}>
          <Scrim on={pictured} opacity={scrimIn} pad={120} strength={0.6} />
          {rows.map((r, i) => {
            const text = words.slice(r.from, r.to).join(' ');
            const since = sinceOf(r.from);
            return (
              <div key={i} style={{ position: 'relative', height: sizes[i] * lineH + 6, textAlign: side === 'right' ? 'right' : 'left' }}>
                <StyledWord text={text} ctx={ctx} size={sizes[i]} since={since} emphasis={r.key} seed={`${ctx.index}r${i}`} f={F} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  /*
   * ---- editorial info caption (Netflix/HBO documentary super) ----
   * Only for a name, a place, a date or a figure: a small-caps kicker with wide
   * tracking over the line in a refined serif (no hairline rule: thin lines read as a template)
   * at the lower left — no plate, no coloured bar, a scrim you barely see. The
   * super slides in on the first spoken word and each word appears as it is said
   * (a name or figure is never on screen before the narrator says it); it fades out
   * before the cut; the keyword warms to the accent on its spoken frame.
   */
  if (style === 'lower-third') {
    const SK = editorialKey(g);
    const onGround = !pictured && !side;
    const kicker = String(ctx.kicker ?? ctx.chapterName ?? '').trim();
    const maxW = side ? colW : onGround ? 1320 : 1160;
    const text = words.join(' ');
    // One or two lines: the largest size (<= cap) at which the line fits in two.
    const cap = onGround ? 68 : 54;
    const oneLine = textWidth(text, SK, 100) / 100;
    const size = Math.max(34, Math.min(cap, Math.floor((maxW * 1.85) / Math.max(1, oneLine * 1.04))));
    const t0 = first;
    const inP = interpolate(f, [t0, t0 + 14], [0, 1], { ...clamp, easing: outCubic });
    const lineP = interpolate(f, [t0, t0 + 8], [0, 1], { ...clamp, easing: outCubic });
    const rule = interpolate(f, [t0 + 3, t0 + 24], [0, 1], { ...clamp, easing: inOut });
    const out = durFrames > 30 ? interpolate(f, [durFrames - 10, durFrames - 1], [1, 0], clamp) : 1;
    const right = side === 'right';
    const shadow = P.light ? 'none' : '0 1px 2px rgba(0,0,0,0.5), 0 3px 24px rgba(0,0,0,0.55)';
    const kSize = onGround ? 26 : 23;
    const kW = kicker ? Math.min(maxW, textWidth(kicker, g.body, kSize, { trackEm: 0.32, upper: true }) * 1.04) : 0;
    return (
      <AbsoluteFill
        style={{
          ...BOX,
          justifyContent: 'flex-end',
          alignItems: right ? 'flex-end' : 'flex-start',
          padding: `0 ${right ? 140 : 0}px ${Math.max(onGround ? 150 : 118, bar + 74)}px ${right ? 0 : 140}px`,
          opacity: out,
        }}
      >
        <div style={{ position: 'relative', maxWidth: maxW, textAlign: right ? 'right' : 'left', transform: `translateY(${(1 - inP) * 14}px)`, opacity: inP }}>
          {pictured && !P.light ? (
            <div style={{ position: 'absolute', left: -220, right: -260, top: -120, bottom: -100, background: 'radial-gradient(ellipse 50% 50% at 42% 55%, rgba(0,0,0,0.46) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 100%)', pointerEvents: 'none' }} />
          ) : null}
          {kicker ? (
            <div style={{ position: 'relative', fontFamily: FONT[g.body], fontWeight: 600, fontSize: kSize, letterSpacing: '0.32em', textTransform: 'uppercase', color: kickerInk(P), whiteSpace: 'nowrap', textShadow: shadow, marginBottom: 14 }}>
              {kicker}
            </div>
          ) : null}
          <div style={{ position: 'relative', fontFamily: FONT[SK], fontWeight: 400, fontSize: size, lineHeight: 1.16, letterSpacing: '0.005em', color: P.ink, textShadow: shadow, opacity: lineP, transform: `translateY(${(1 - lineP) * 10}px)` }}>
            {words.map((w, i) => {
              const isKey = i >= k0 && i < k1;
              const lit = isKey ? interpolate(sinceOf(i), [0, 6], [0, 1], clamp) : 0;
              const shown = interpolate(sinceOf(i), [0, 5], [0, 1], clamp);
              return (
                <span key={i} style={{ opacity: shown, fontStyle: isKey ? 'italic' : 'normal', color: isKey ? mix(P.ink, P.accent, 0.25 + 0.6 * lit) : P.ink }}>
                  {w}
                  {i < words.length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  /* ---- everything else: a flowing caption with the style's body face ---- */
  const B = bodyFace(style, g);
  const serif = style === 'serif';
  const typewriter = style === 'typewriter';
  // On a bare ground the caption is the whole composition: centred and a size up.
  const up = pictured || side ? 1 : 1.3;
  const bodySize = Math.round((serif ? 70 : typewriter ? 50 : style === 'glitch' ? 44 : style === 'neon' ? 60 : style === 'marker' ? 64 : 60) * up);
  const keyCap = Math.round((serif ? 104 : style === 'stamp' ? 84 : style === 'cutout' ? 92 : style === 'neon' ? 104 : 112) * up);
  const keyWords = words.slice(Math.max(0, k0), Math.max(0, k1));
  const keySize = k0 >= 0 ? Math.min(...keyWords.map((w) => fitStyled(w, style, g, { maxW: colW, cap: keyCap, scaleMax: 1.05 }))) : keyCap;
  // Every caption is centred (or takes the depth split's empty side): the flush-left line with a thin bar read as a template.
  const leftAligned = false;
  const centreV = !pictured && !side;
  const zone: React.CSSProperties = side
    ? { ...BOX, justifyContent: 'center', alignItems: side === 'left' ? 'flex-start' : 'flex-end', padding: side === 'left' ? '160px 0 60px 150px' : '160px 150px 60px 0' }
    : centreV
      ? { ...BOX, justifyContent: 'center', alignItems: 'center', padding: '0 190px' }
      : ctx.at === 'top'
        ? band('top', g, 'center', 170, 170)
        : { ...BOX, justifyContent: 'flex-end', alignItems: leftAligned ? 'flex-start' : 'center', padding: `0 ${leftAligned ? 400 : 170}px ${g.letterbox ? 220 : 170}px ${leftAligned ? 150 : 170}px` };
  const textAlign: React.CSSProperties['textAlign'] = side ? (side === 'left' ? 'left' : 'right') : leftAligned ? 'left' : 'center';

  const body = words.map((w, i) => {
    const since = sinceOf(i);
    const isKey = i >= k0 && i < k1;
    if (isKey) {
      const pop = style === 'stamp' || style === 'cutout' ? 1 : interpolate(since, [0, 3, 7], [1.18, 0.97, 1], clamp);
      return (
        <span key={i} style={{ position: 'relative', display: 'inline-block', margin: `0 ${serif ? 0.24 : 0.3}em 0 0`, verticalAlign: 'middle', transform: `scale(${since >= 0 ? pop : 1})`, fontSize: bodySize }}>
          <StyledWord text={w} ctx={ctx} size={keySize} since={since} emphasis seed={`${ctx.index}k${i}`} plate={!typewriter} />
        </span>
      );
    }
    const o = interpolate(since, [0, 3], [0, 1], clamp);
    const y = interpolate(since, [0, 6], [serif ? 22 : 14, 0], { ...clamp, easing: outCubic });
    let shown: React.ReactNode = w;
    if (typewriter) {
      const chars = [...w];
      const n = since < 0 ? 0 : Math.min(chars.length, Math.floor(since / 0.9) + 1);
      shown = (
        <>
          {chars.slice(0, n).join('')}
          <span style={{ visibility: 'hidden' }}>{chars.slice(n).join('')}</span>
        </>
      );
    }
    return (
      <span
        key={i}
        style={{
          position: 'relative',
          display: 'inline-block',
          marginRight: `${serif ? 0.24 : 0.3}em`,
          opacity: typewriter ? (since >= 0 ? 1 : 0) : o,
          transform: typewriter ? undefined : `translateY(${y}px)`,
          filter: serif && o < 0.98 ? `blur(${(1 - o) * 6}px)` : undefined,
          fontFamily: B.family,
          fontWeight: B.weight,
          fontStyle: B.italic ? 'italic' : 'normal',
          fontSize: bodySize,
          letterSpacing: `${B.trackEm}em`,
          textTransform: B.upper ? 'uppercase' : 'none',
          color: typewriter ? '#1b1712' : P.ink,
          textShadow: typewriter ? 'none' : style === 'neon' && !P.light ? `0 0 14px ${alpha(g.accent2, 0.45)}, 0 2px 10px rgba(0,0,0,0.8)` : P.light ? P.shadow : '0 0 3px rgba(0,0,0,0.9), 0 2px 5px rgba(0,0,0,0.8), 0 3px 18px rgba(0,0,0,0.85)',
          verticalAlign: 'middle',
        }}
      >
        {shown}
      </span>
    );
  });

  const slip = typewriter;
  void durFrames;
  void fps;
  return (
    <AbsoluteFill style={zone}>
      <div
        style={{
          position: 'relative',
          textAlign,
          lineHeight: serif ? 1.18 : 1.32,
          maxWidth: side ? '46%' : leftAligned ? 1300 : '100%',
          ...(slip
            ? {
                background: P.paper,
                padding: '26px 44px 22px',
                transform: 'rotate(-0.8deg)',
                boxShadow: P.light ? '0 3px 0 rgba(0,0,0,0.1)' : '0 18px 40px rgba(0,0,0,0.5)',
                opacity: scrimIn,
              }
            : {}),
        }}
      >
        {!slip ? <Scrim on={pictured} opacity={scrimIn} /> : null}
        {body}
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================= slam */

export interface SlamProps {
  ctx: TextCtx;
  word: string;
  sub?: string;
  /** Frames since the word landed. */
  since: number;
  durFrames: number;
  /** Context line appears this many frames after the landing. */
  subAt: number;
  /** Size relative to a slam (a words scene's key-word emphasis is set a little smaller than a slam). */
  weight?: number;
}

/**
 * The one-word punch in a style. Centred for most; `underline` and
 * `lower-third` set it flush-left, `stack` builds a poster block.
 */
export const StyledSlam: React.FC<SlamProps> = ({ ctx, word, sub, since, durFrames, subAt, weight = 1 }) => {
  const style = ctx.style;
  const g = ctx.genre;
  const P = palette(ctx);
  const bar = barPx(g);
  if (since < 0) return null;
  const drift = interpolate(since, [0, durFrames], [1, 1.05], clamp);
  const subP = interpolate(since - subAt, [0, 10], [0, 1], { ...clamp, easing: outCubic });
  const scaleMax = 1.05 * PUNCH;

  const subEl = (size: number, extra: React.CSSProperties = {}) =>
    sub ? (
      <div
        style={{
          fontFamily: FONT[g.body],
          fontWeight: 600,
          fontSize: size,
          color: P.ink,
          whiteSpace: 'nowrap',
          opacity: subP,
          transform: `translateY(${(1 - subP) * 16}px)`,
          textShadow: P.shadow,
          ...extra,
        }}
      >
        {sub}
      </div>
    ) : null;
  const subSize = (maxW: number, cap: number) => (sub ? Math.min(cap, Math.floor(maxW / Math.max(1, (textWidth(sub, g.body, 100) / 100) * 1.03))) : cap);

  if (style === 'lower-third') {
    // Editorial: the word in the refined serif, big, at the lower left under a small-caps kicker and a hairline.
    const SK = editorialKey(g);
    const per = textWidth(word, SK, 100) / 100;
    const size = Math.max(60, Math.min(230 * weight, Math.floor(1500 / Math.max(0.1, per * scaleMax * 1.03))));
    const kicker = String(ctx.kicker ?? ctx.chapterName ?? '').trim();
    const inP = interpolate(since, [0, 9], [0, 1], { ...clamp, easing: outExpo });
    const rule = interpolate(since, [3, 20], [0, 1], { ...clamp, easing: inOut });
    const shadow = P.light ? 'none' : '0 2px 4px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.6)';
    // Already in the lower third; a face low in the frame (ctx.at 'top') sends it to the upper left instead.
    const top = ctx.at === 'top';
    return (
      <AbsoluteFill style={top ? band('top', g, 'flex-start', 140) : { ...BOX, justifyContent: 'flex-end', alignItems: 'flex-start', padding: `0 0 ${Math.max(130, bar + 70)}px 140px` }}>
        <div style={{ position: 'relative', transform: `scale(${drift})`, transformOrigin: top ? 'left top' : 'left bottom' }}>
          {kicker ? <div style={{ fontFamily: FONT[g.body], fontWeight: 600, fontSize: 24, letterSpacing: '0.34em', textTransform: 'uppercase', color: kickerInk(P), whiteSpace: 'nowrap', textShadow: shadow, marginBottom: 14 }}>{kicker}</div> : null}
          <div style={{ overflow: 'hidden', padding: '0.04em 0.02em 0.1em' }}>
            <div style={{ fontFamily: FONT[SK], fontWeight: 400, fontSize: size, lineHeight: 1.02, color: P.ink, whiteSpace: 'nowrap', textShadow: shadow, transform: `translateY(${(1 - inP) * 100}%)` }}>{shownText(word, 'serif')}</div>
          </div>
          {subEl(subSize(1400, 40), { marginTop: 14 })}
        </div>
      </AbsoluteFill>
    );
  }

  if (style === 'stack' || style === 'underline') {
    const blockW = 1500;
    const size = fitStyled(word, style, g, { maxW: blockW, cap: (ctx.at ? BAND_SLAM : 280) * weight, scaleMax, min: 60 });
    const kickT = style === 'stack' ? (sub ? String(sub) : String(ctx.chapterName ?? '')) : '';
    const kSize = kickT ? Math.min(44, Math.floor(blockW / Math.max(1, (textWidth(kickT, g.body, 100, { trackEm: 0.18, upper: true }) / 100) * 1.03))) : 0;
    const ruleP = interpolate(since, [4, 18], [0, 1], { ...clamp, easing: inOut });
    return (
      <AbsoluteFill style={ctx.at ? band(ctx.at, g, 'flex-start', 170) : { ...BOX, justifyContent: 'center', alignItems: 'flex-start', padding: '0 0 0 170px' }}>
        <div style={{ transform: `scale(${drift})`, transformOrigin: ctx.at === 'low' ? 'left bottom' : ctx.at === 'top' ? 'left top' : 'left center' }}>
          {kickT ? (
            <div style={{ overflow: 'hidden', marginBottom: 10 }}>
              {/* The word's own ink and a real shadow, not the raw accent: a dark red, then a pale pink
                  "BORODINO" vanished above HAUNT on Napoleon's snow (QA 7:16). */}
              <div style={{ fontFamily: FONT[g.body], fontWeight: 700, fontSize: kSize, letterSpacing: '0.18em', textTransform: 'uppercase', color: P.ink, whiteSpace: 'nowrap', transform: `translateY(${interpolate(since, [2, 10], [110, 0], { ...clamp, easing: outExpo })}%)`, textShadow: isLight(P.ink) ? '0 2px 5px rgba(0,0,0,0.75), 0 6px 26px rgba(0,0,0,0.6)' : P.shadow }}>{kickT}</div>
            </div>
          ) : null}
          <StyledWord text={word} ctx={ctx} size={size} since={since} hero seed={`sl${ctx.index}`} />
          {style === 'underline' ? subEl(subSize(blockW, 50), { marginTop: 22 }) : null}
        </div>
      </AbsoluteFill>
    );
  }

  // Centred styles.
  // Every slam is as big as the classic box slam (260 px): a stamp or ransom-note word at 190 px read as a caption, not a punch.
  // Off a face (ctx.at) the word lands in its band a size down, so word + line stay under the eyes.
  const cap = Math.min(style === 'typewriter' ? 230 : 260, ctx.at ? BAND_SLAM : Infinity);
  const size = fitStyled(word, style, g, { maxW: 1720, cap: cap * weight, scaleMax, min: 56 });
  let subNode: React.ReactNode = null;
  if (sub) {
    if (style === 'serif') {
      const s = subSize(1400, 34);
      subNode = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 34, opacity: subP }}>
          <div style={{ fontFamily: FONT[g.body], fontWeight: 600, fontSize: s, letterSpacing: '0.2em', textTransform: 'uppercase', color: P.ink, whiteSpace: 'nowrap', textShadow: P.shadow }}>{sub}</div>
        </div>
      );
    } else if (style === 'typewriter' || style === 'cutout') {
      const s = Math.min(46, Math.floor(1300 / Math.max(1, [...sub].length * 0.61 * 1.03)));
      const chars = [...sub];
      const n = Math.max(0, Math.min(chars.length, Math.floor((since - subAt) / 0.8)));
      subNode = (
        <div style={{ marginTop: 40, background: P.paper, padding: '10px 26px 8px', transform: 'rotate(1deg)', opacity: since >= subAt ? 1 : 0, boxShadow: P.light ? 'none' : '0 10px 26px rgba(0,0,0,0.45)' }}>
          <span style={{ fontFamily: ELITE, fontSize: s, color: '#1b1712', whiteSpace: 'pre' }}>
            {chars.slice(0, n).join('')}
            <span style={{ visibility: 'hidden' }}>{chars.slice(n).join('')}</span>
          </span>
        </div>
      );
    } else if (style === 'glitch') {
      const s = Math.min(36, Math.floor(1300 / Math.max(1, ([...sub].length + 2) * 0.6 * 1.1)));
      subNode = (
        <div style={{ marginTop: 36, fontFamily: FONT.jetbrains, fontSize: s, letterSpacing: '0.08em', textTransform: 'uppercase', color: P.accent, opacity: subP, whiteSpace: 'nowrap', textShadow: P.shadow }}>
          {'> '}
          {sub}
        </div>
      );
    } else if (style === 'neon') {
      const s = subSize(1300, 40);
      subNode = subEl(s, { marginTop: 40, fontFamily: FONT.spacegrotesk, fontWeight: 400, letterSpacing: '0.16em', textTransform: 'uppercase', color: P.light ? P.ink : mix(g.ink, '#ffffff', 0.3) });
    } else {
      subNode = subEl(subSize(1500, 50), { marginTop: style === 'stamp' ? 48 : 30 });
    }
  }
  return (
    <AbsoluteFill style={ctx.at ? band(ctx.at, g, 'center') : { justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${drift})`, transformOrigin: ctx.at === 'low' ? 'center bottom' : ctx.at === 'top' ? 'center top' : 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <StyledWord text={word} ctx={ctx} size={size} since={since} hero seed={`sl${ctx.index}`} />
        {subNode}
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================ title */

function balance(text: string, over = 16): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (text.length <= over || words.length < 2) return [text];
  if (text.length > 44 && words.length >= 4) {
    // Three lines for a long title.
    let best: [number, number] = [1, 2];
    let bestD = Infinity;
    for (let a = 1; a < words.length - 1; a++)
      for (let b = a + 1; b < words.length; b++) {
        const L = [words.slice(0, a), words.slice(a, b), words.slice(b)].map((x) => x.join(' ').length);
        const d = Math.max(...L) - Math.min(...L);
        if (d < bestD) {
          bestD = d;
          best = [a, b];
        }
      }
    return [words.slice(0, best[0]).join(' '), words.slice(best[0], best[1]).join(' '), words.slice(best[1]).join(' ')];
  }
  let best = 1;
  const diff = (k: number) => Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length);
  for (let k = 1; k < words.length; k++) if (diff(k) < diff(best)) best = k;
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

export interface TitleProps {
  ctx: TextCtx;
  title: string;
  kicker?: string;
  durFrames: number;
}

/** The video's title card in a style (plain titles; chapter cards keep their own furniture). */
export const StyledTitle: React.FC<TitleProps> = ({ ctx, title, kicker, durFrames }) => {
  const f = useCurrentFrame();
  const style = ctx.style;
  const g = ctx.genre;
  const P = palette(ctx);
  const bar = barPx(g);
  const lines = balance(title, style === 'stack' ? 10 : 16);
  const kick = interpolate(f, [2, 14], [0, 1], { ...clamp, easing: outCubic });
  const rule = interpolate(f, [10, 30], [0, 1], { ...clamp, easing: inOut });
  const creep = interpolate(f, [0, durFrames], [1, 1.035], clamp);
  // Over a face (ctx.at) the whole title keeps to a third of the frame, in its band (Lula's hook title sat on his mouth).
  const maxH = ctx.at ? BAND_H - (kicker ? 60 : 0) : FH - 2 * Math.max(120, bar + 70) - (kicker ? 90 : 0);
  const kickerEl = (align: 'center' | 'left', extra: React.CSSProperties = {}) =>
    kicker ? (
      <div
        style={{
          fontFamily: FONT[g.body],
          fontWeight: 700,
          fontSize: Math.min(30, Math.floor(1400 / Math.max(1, (textWidth(kicker, g.body, 100, { trackEm: 0.3, upper: true }) / 100) * 1.03))),
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: P.accent,
          opacity: kick,
          transform: `translateY(${(1 - kick) * 14}px)`,
          whiteSpace: 'nowrap',
          textAlign: align,
          marginBottom: 26,
          textShadow: P.shadow,
          ...extra,
        }}
      >
        {kicker}
      </div>
    ) : null;

  const wordsIn = (i: number) => 5 + i * 6;

  if (style === 'lower-third') {
    // Editorial title: kicker, hairline, the title in the refined serif at the lower left.
    const SK = editorialKey(g);
    const blockW = 1400;
    let size = Math.min(...lines.map((l) => Math.floor(blockW / Math.max(0.1, (textWidth(l, SK, 100) / 100) * 1.04 * PUNCH))), 150);
    if (lines.length * size * 1.08 > maxH) size = Math.floor(maxH / (lines.length * 1.08));
    const shadow = P.light ? 'none' : '0 2px 4px rgba(0,0,0,0.45), 0 8px 40px rgba(0,0,0,0.6)';
    const top = ctx.at === 'top';
    return (
      <AbsoluteFill style={top ? band('top', g, 'flex-start', 140) : { ...BOX, justifyContent: 'flex-end', alignItems: 'flex-start', padding: `0 0 ${Math.max(140, bar + 80)}px 140px` }}>
        <div style={{ transform: `scale(${creep})`, transformOrigin: top ? 'left top' : 'left bottom' }}>
          {kicker ? <div style={{ fontFamily: FONT[g.body], fontWeight: 600, fontSize: 24, letterSpacing: '0.34em', textTransform: 'uppercase', color: kickerInk(P), whiteSpace: 'nowrap', opacity: kick, textShadow: shadow, marginBottom: 14 }}>{kicker}</div> : null}
          {lines.map((l, i) => {
            const p = interpolate(f - wordsIn(i), [0, 12], [0, 1], { ...clamp, easing: outCubic });
            return (
              <div key={i} style={{ overflow: 'hidden', padding: '0.02em 0.02em 0.08em' }}>
                <div style={{ fontFamily: FONT[SK], fontWeight: 400, fontSize: size, lineHeight: 1.04, color: g.titleInk ?? P.ink, whiteSpace: 'nowrap', textShadow: shadow, transform: `translateY(${(1 - p) * 100}%)` }}>{shownText(l, 'serif')}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }

  if (style === 'stack' || style === 'underline') {
    const blockW = 1480;
    const cap = style === 'stack' ? 230 : 150;
    let sizes = lines.map((l) => fitStyled(l, style === 'stack' ? 'stack' : 'underline', g, { maxW: blockW, cap: style === 'stack' ? cap : Math.min(cap, 150), scaleMax: 1.04 * PUNCH, min: 40 }));
    if (style !== 'stack') sizes = sizes.map(() => Math.min(...sizes));
    const total = sizes.reduce((a, s) => a + s * 1.02 + 8, 0);
    if (total > maxH) sizes = sizes.map((s) => Math.floor((s * maxH) / total));
    return (
      <AbsoluteFill style={ctx.at ? band(ctx.at, g, 'flex-start', 170) : { ...BOX, justifyContent: 'center', alignItems: 'flex-start', padding: '0 0 0 170px' }}>
        <div style={{ position: 'relative', transform: `scale(${creep})`, transformOrigin: ctx.at === 'low' ? 'left bottom' : ctx.at === 'top' ? 'left top' : 'left center' }}>
          <div>
            {kickerEl('left')}
            {lines.map((l, i) => (
              <div key={i} style={{ height: sizes[i] * 1.02 + 8 + (style === 'underline' && i === lines.length - 1 ? sizes[i] * 0.2 : 0) }}>
                <StyledWord text={l} ctx={{ ...ctx, style: style === 'underline' && i < lines.length - 1 ? 'stack' : style }} size={sizes[i]} since={f - wordsIn(i)} hero seed={`ti${i}`} />
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // Centred styles: one size for every line, fitted to the longest.
  const cap = style === 'cutout' ? 130 : style === 'stamp' ? 120 : style === 'typewriter' ? 96 : style === 'serif' ? 170 : 160;
  // A stamped title: the lines rise in the headline face and the kicker is the stamp.
  const lineStyle: TextStyle = style === 'stamp' ? 'stack' : style;
  let size = Math.min(...lines.map((l) => fitStyled(l, lineStyle, g, { maxW: 1660, cap, scaleMax: 1.04 * PUNCH, min: 36 })));
  const lh = style === 'typewriter' ? 1.45 : style === 'cutout' ? 1.25 : 1.08;
  if (lines.length * size * lh > maxH) size = Math.floor(maxH / (lines.length * lh));
  const serifRules = style === 'serif';
  return (
    <AbsoluteFill style={ctx.at ? band(ctx.at, g, 'center') : { justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `scale(${creep})`, transformOrigin: ctx.at === 'low' ? 'center bottom' : ctx.at === 'top' ? 'center top' : 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {serifRules && kicker ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 30, opacity: kick }}>
            {kickerEl('center', { marginBottom: 0 })}
          </div>
        ) : (
          style === 'stamp' && kicker ? (
            <div style={{ marginBottom: 44 }}>
              <StyledWord text={kicker} ctx={ctx} size={Math.min(56, fitStyled(kicker, 'stamp', g, { maxW: 1200, cap: 56 }))} since={f - 16} seed="tk" />
            </div>
          ) : (
            kickerEl('center', style === 'cutout' || style === 'typewriter' ? { marginBottom: 50 } : {})
          )
        )}
        {lines.map((l, i) => (
          <div key={i} style={{ height: size * lh, display: 'flex', alignItems: 'center' }}>
            <StyledWord text={l} ctx={lineStyle === style ? ctx : { ...ctx, style: lineStyle }} size={size} since={f - wordsIn(i)} hero={style === 'neon' ? lines.length === 1 : style !== 'outline' || i === lines.length - 1} seed={`ti${i}`} />
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================= montage */

export interface MontageWordProps {
  ctx: TextCtx;
  word: string;
  since: number;
  hook: boolean;
  /** Corner index for non-hook words. */
  spot: number;
}

/** The hook's colour: the look's warning colour (accent2), else its accent — whichever is vivid and reads over a picture. */
function hookInk(g: Genre): string {
  for (const c of [g.accent2, g.accent]) if (saturation(c) >= 0.35 && contrast(c, '#111111') >= 3) return c;
  return g.ink;
}

/** A cold-open word in a style: corners for the run, the hook dead centre and bigger. */
export const StyledMontageWord: React.FC<MontageWordProps> = ({ ctx, word, since, hook, spot }) => {
  const g = ctx.genre;
  const bar = barPx(g);
  const top = Math.max(150, bar + 56);
  const bottom = Math.max(170, bar + 56);
  const size = hook
    ? fitStyled(word, ctx.style, g, { maxW: 1680, cap: 240, scaleMax: 1.05 * PUNCH, min: 60 })
    : fitStyled(word, ctx.style, g, { maxW: 1500, cap: 140, scaleMax: 1.02 * PUNCH, min: 40 });
  const spots: React.CSSProperties[] = [
    { ...BOX, justifyContent: 'flex-start', alignItems: 'flex-start', padding: `${top}px 0 0 160px` },
    { ...BOX, justifyContent: 'flex-end', alignItems: 'flex-end', padding: `0 160px ${bottom}px 0` },
    { ...BOX, justifyContent: 'flex-start', alignItems: 'flex-end', padding: `${top}px 160px 0 0` },
    { ...BOX, justifyContent: 'flex-end', alignItems: 'flex-start', padding: `0 0 ${bottom}px 160px` },
  ];
  const at: React.CSSProperties = hook ? { justifyContent: 'center', alignItems: 'center' } : spots[spot % spots.length];
  return (
    <AbsoluteFill style={at}>
      <StyledWord text={word} ctx={hook ? { ...ctx, genre: { ...g, ink: hookInk(g) } } : ctx} size={size} since={since} hero={hook} seed={`mo${spot}`} />
    </AbsoluteFill>
  );
};
