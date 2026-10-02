import React from 'react';
import { AbsoluteFill, Easing, Img, getInputProps, interpolate, useCurrentFrame } from 'remotion';
import { paperTexture } from '../paper';
import type { Genre, Scene } from '../types';
import { GenreBg, H, TitleTag, W, clamp, safeBand, surfaceTexture } from '../devices/common';
import type { DevFont, Fit } from '../devices/type';
import { DFONT, fitWrap as fitWrapDev, measure as measureDev } from '../devices/type';

/*
 * The infographics' shared furniture: one palette per genre look (printed
 * label / glowing / terminal), the art director's per-scene backdrop and text
 * style when the script carries them, locale number formatting, and the
 * stage every chart stands on (background, a soft key light, a slow push).
 */

/* ------------------------------------------------------------------ colour */

const HEX6 = /^#[0-9a-f]{6}$/i;
export function rgb(c: string): [number, number, number] {
  const h = String(c ?? '').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
}
export const rgba = (c: string, a: number) => {
  const [r, g, b] = rgb(c);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  const k = (i: number) => Math.round(A[i] + (B[i] - A[i]) * t);
  return `#${[k(0), k(1), k(2)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
export function lum(c: string): number {
  const [r, g, b] = rgb(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/* ------------------------------------------------------ the art direction */

type Backdrop = { kind: string; color?: string; color2?: string };
type LookHints = { backdrop?: Backdrop; textStyle?: string; accent?: string };

let chapterAccents: (string | undefined)[] | null = null;
/** Per-chapter accent from the art director's colour journey (script.chapterLooks), when present. */
function chapterAccent(ch?: number): string | undefined {
  if (!Number.isInteger(ch)) return undefined;
  if (!chapterAccents) {
    chapterAccents = [];
    try {
      if (typeof window !== 'undefined') {
        const s = (getInputProps() as { script?: { chapterLooks?: { accent?: string }[] } })?.script;
        chapterAccents = (s?.chapterLooks ?? []).map((c) => (HEX6.test(String(c?.accent ?? '')) ? c!.accent : undefined));
      }
    } catch {
      chapterAccents = [];
    }
  }
  return chapterAccents[ch as number];
}

/**
 * The art director's per-scene fields (src/looks, docu-art-director.js), read
 * loosely: `backdrop` {kind, color?, color2?} and `textStyle` when present —
 * whatever shape types.ts gives them, only these keys are used.
 */
function hints(scene: Scene): LookHints {
  const s = scene as unknown as { backdrop?: { kind?: unknown; color?: unknown; color2?: unknown }; textStyle?: unknown; chapter?: number };
  const raw = s.backdrop && typeof s.backdrop === 'object' && typeof s.backdrop.kind === 'string' ? s.backdrop : undefined;
  const b: Backdrop | undefined = raw
    ? { kind: String(raw.kind), color: typeof raw.color === 'string' ? raw.color : undefined, color2: typeof raw.color2 === 'string' ? raw.color2 : undefined }
    : undefined;
  return { backdrop: b && b.kind !== 'blur' ? b : undefined, textStyle: typeof s.textStyle === 'string' ? s.textStyle : undefined, accent: chapterAccent(s.chapter) };
}

/** The art director's text style picks the title's typographic family. */
const STYLE_LOOK: Record<string, Genre['look']> = {
  box: 'label', stamp: 'label', cutout: 'label', marker: 'label', underline: 'label',
  neon: 'glow', outline: 'glow', serif: 'glow', stack: 'glow',
  typewriter: 'terminal', 'lower-third': 'terminal', glitch: 'terminal',
};

export interface InfoTheme {
  look: Genre['look'];
  /** The genre as the title tag should see it (look / colours adjusted). */
  tagGenre: Genre;
  /** Main text. */
  ink: string;
  /** Text on the highlight fill. */
  hiInk: string;
  /** The highlight: the one bar / slice / icon the scene is about. */
  hi: string;
  /** The hard shadow under a highlight in the printed look. */
  hiShadow: string;
  /** Second accent (drops, the other side). */
  alt: string;
  /** Non-highlighted data. */
  muted: string;
  /** Text on a muted fill. */
  mutedInk: string;
  /** Hairlines, grids, tracks. */
  line: string;
  numFont: DevFont;
  labelFont: DevFont;
  /** Backdrop is light: dark ink, no glows. */
  light: boolean;
  backdrop?: Backdrop;
  bg: string;
}

export function infoTheme(genre: Genre, scene: Scene): InfoTheme {
  const h = hints(scene);
  const b = h.backdrop;
  // No backdrop of its own: the chart stands on the look's ground — a light variant's paper is light too
  // (dark drop shadows under its labels smudged them).
  const light = b ? b.kind === 'paper' || (!!b.color && lum(b.color) > 0.55) : !!genre.light || lum(genre.bg) > 0.55;
  const look: Genre['look'] = genre.look;
  const bg = b?.color && HEX6.test(b.color) ? b.color : genre.bg;
  const accent = h.accent ?? genre.accent;
  // The printed look highlights with the label colour (the same yellow as its title tags).
  let hi = look === 'label' ? (h.accent ?? genre.labelBg) : accent;
  let hiInk = look === 'label' ? (h.accent ? (lum(hi) > 0.55 ? '#16110d' : '#fff8ec') : genre.labelInk) : lum(accent) > 0.55 ? '#0b0b0b' : '#ffffff';
  let ink = genre.ink;
  let muted = look === 'label' ? genre.paper : look === 'terminal' ? rgba(accent, 0.3) : rgba(genre.ink, 0.24);
  let mutedInk = look === 'label' ? '#1d1a17' : genre.ink;
  let line = rgba(genre.ink, 0.16);
  if (light) {
    ink = lum(genre.bg) < 0.2 ? genre.bg : '#1b1612';
    if (lum(hi) > 0.6) hi = lum(genre.accent2) < 0.5 ? genre.accent2 : '#b3151a';
    hiInk = lum(hi) > 0.55 ? '#16110d' : '#ffffff';
    muted = rgba(ink, 0.3);
    mutedInk = ink;
    line = rgba(ink, 0.18);
  }
  const titleLook = h.textStyle && STYLE_LOOK[h.textStyle] ? STYLE_LOOK[h.textStyle] : look;
  const tagGenre: Genre = { ...genre, look: titleLook, accent, ink: light ? ink : genre.ink, titleInk: light ? ink : genre.titleInk };
  return {
    look,
    tagGenre,
    ink,
    hiInk,
    hi,
    hiShadow: look === 'label' ? genre.accent2 : rgba(accent, 0.5),
    alt: genre.accent2,
    muted,
    mutedInk,
    line,
    // Figures must be lining: Playfair's default figures are old-style (a 3 that drops below the line), so its data is set in the genre's Lora.
    numFont: genre.headline === 'playfair' ? genre.body : genre.headline,
    labelFont: look === 'terminal' || h.textStyle === 'typewriter' ? 'plexMono' : genre.body,
    light,
    backdrop: b,
    bg,
  };
}

/** Glow for the glowing and terminal looks; none on a light backdrop (a glow on paper is a smudge). */
export const glow = (th: InfoTheme, c: string, r = 18, a = 0.55) => (th.light || th.look === 'label' ? 'none' : `0 0 ${r}px ${rgba(c, a)}`);

/* ----------------------------------------------------------------- motion */

/** Expo-out: fast start, long settle — the "data" ease. */
export const EXPO = Easing.bezier(0.16, 1, 0.3, 1);
export const SOFT = Easing.bezier(0.33, 1, 0.68, 1);
export const INOUT = Easing.bezier(0.65, 0, 0.35, 1);
/** 0..1 from `a` over `d` frames with `ease`. */
export const prog = (f: number, a: number, d: number, ease = EXPO) => interpolate(f, [a, a + Math.max(1, d)], [0, 1], { ...clamp, easing: ease });
/** A small overshoot pop: 0 -> 1.08 -> 1. */
export const pop = (f: number, a: number, d = 10) => interpolate(f, [a, a + d * 0.6, a + d], [0, 1.08, 1], clamp);

/* ---------------------------------------------------------------- numbers */

export const isTrLocale = (locale?: string) => String(locale ?? 'tr').toLowerCase().startsWith('tr');
const loc = (locale?: string) => (isTrLocale(locale) ? 'tr-TR' : String(locale || 'en-US'));

export function fmtNum(v: number, locale: string, decimals = 0): string {
  const d = Math.max(0, Math.min(3, decimals));
  try {
    return v.toLocaleString(loc(locale), { minimumFractionDigits: d, maximumFractionDigits: d });
  } catch {
    return v.toFixed(d);
  }
}

/** Most decimals among `values` (max 2): 13.8 -> 1. */
export function decimalsOf(values: number[]): number {
  let d = 0;
  for (const v of values) {
    const s = String(Math.abs(v));
    if (s.includes('e')) continue;
    const k = s.split('.')[1]?.length ?? 0;
    d = Math.max(d, Math.min(2, k));
  }
  return d;
}

export interface UnitParts {
  pre: string;
  suf: string;
  /** The unit is a word (" people", " tons"): set smaller beside the figure. */
  word: boolean;
}

/**
 * Where a unit goes: currency symbols before the figure, % before it in
 * Turkish (%38) and after in English, words after it (smaller).
 */
export function unitParts(unit: string | undefined, locale: string): UnitParts {
  const raw = String(unit ?? '');
  const u = raw.trim();
  if (!u) return { pre: '', suf: '', word: false };
  if (u === '%') return isTrLocale(locale) ? { pre: '%', suf: '', word: false } : { pre: '', suf: '%', word: false };
  if (/^[$€£¥₺₿₹]/.test(u) && u.length <= 3) return { pre: u, suf: '', word: false };
  const word = (u.match(/\p{L}/gu)?.length ?? 0) >= 2;
  return { pre: '', suf: word ? u : u, word };
}

export interface NumParts {
  pre: string;
  num: string;
  /** Scale word of a compacted figure ("billion", "milyon", "B"). */
  scale: string;
  suf: string;
  word: boolean;
}

/**
 * A value as display parts. `compact`: figures from a million up are set
 * as "13.8B" / "13,8 milyar" (Turkish spells the scale; its short forms read
 * as typos), so a bar label stays short.
 */
export function numParts(v: number, unit: string | undefined, locale: string, o: { decimals?: number; compact?: 'short' | 'long' | false; scaleFrom?: number } = {}): NumParts {
  const u = unitParts(unit, locale);
  // A count-up keeps the scale and decimals of its FINAL figure ("0.0B" -> "13.8B", never "950,000" -> "1.2B").
  const ref = o.scaleFrom ?? v;
  const a = Math.abs(ref);
  const tr = isTrLocale(locale);
  if (o.compact && a >= 1e6) {
    const [div, en, enS, trW] = (a >= 1e12 ? [1e12, 'trillion', 'T', 'trilyon'] : a >= 1e9 ? [1e9, 'billion', 'B', 'milyar'] : [1e6, 'million', 'M', 'milyon']) as [number, string, string, string];
    const xf = ref / div;
    const d = Math.abs(xf) >= 100 ? 0 : Math.abs(xf - Math.round(xf)) < 0.05 ? 0 : 1;
    return { pre: u.pre, num: fmtNum(v / div, locale, d), scale: tr ? ` ${trW}` : o.compact === 'short' ? enS : ` ${en}`, suf: u.suf, word: u.word };
  }
  return { pre: u.pre, num: fmtNum(v, locale, o.decimals ?? 0), scale: '', suf: u.suf, word: u.word };
}
export const partsText = (p: NumParts) => `${p.pre}${p.num}${p.scale}${p.word ? ` ${p.suf}` : p.suf}`;

/** Word units and long scale words are set at this fraction of the figure. */
export const UNIT_K = 0.46;

/** The figure with its unit: symbols full size, words small and baseline-aligned. */
export const NumText: React.FC<{ p: NumParts; size: number; font: DevFont; color: string; weight?: number; style?: React.CSSProperties; unitColor?: string }> = ({
  p,
  size,
  font,
  color,
  weight = 700,
  style,
  unitColor,
}) => {
  const small = (t: string, left: boolean): React.ReactNode =>
    t ? (
      <span style={{ fontSize: size * UNIT_K, letterSpacing: '0.04em', marginLeft: left ? size * 0.12 : 0, color: unitColor ?? color, opacity: 0.85 }}>{t.trim()}</span>
    ) : null;
  const longScale = p.scale.startsWith(' ');
  return (
    <span style={{ fontFamily: DFONT[font], fontWeight: weight, fontSize: size, lineHeight: 1, color, whiteSpace: 'nowrap', fontVariantNumeric: 'lining-nums tabular-nums', ...style }}>
      {p.pre}
      {p.num}
      {longScale ? small(p.scale, true) : p.scale}
      {p.word ? small(p.suf, true) : p.suf}
    </span>
  );
};

/** Width in em of a NumText (for fitting). */
export function numEm(p: NumParts, font: DevFont, measure: (t: string, f: DevFont, s: number) => number): number {
  const big = `${p.pre}${p.num}${p.scale.startsWith(' ') ? '' : p.scale}${p.word ? '' : p.suf}`;
  let w = measure(big, font, 100) / 100;
  if (p.scale.startsWith(' ')) w += (measure(p.scale.trim(), font, 100) / 100) * UNIT_K + 0.12;
  if (p.word) w += (measure(p.suf.trim(), font, 100) / 100) * UNIT_K + 0.12;
  return w;
}

/* ------------------------------------------------------------------ type */

/**
 * fitWrap that never breaks a word: the size is capped so the longest word
 * fits the line, and the balancing pass (evening the lines out) may not
 * narrow the measure below that word either — plain fitWrap's balance could
 * turn "Collision" into "Collisio- / n".
 */
export function fitText(
  text: string,
  font: DevFont,
  o: { maxW: number; maxH: number; lineH: number; cap: number; min: number; maxLines?: number; balance?: boolean; upper?: boolean; trackEm?: number },
): Fit {
  const tr = { upper: o.upper, trackEm: o.trackEm };
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const longestEm = Math.max(0.01, ...words.map((w) => measureDev(w, font, 100, tr) / 100));
  const cap = Math.max(o.min, Math.min(o.cap, Math.floor(o.maxW / longestEm / 1.02)));
  const first = fitWrapDev(text, font, { ...tr, ...o, cap, balance: false });
  if (!o.balance || first.lines.length < 2) return first;
  const need = (longestEm * first.size * 1.02) / o.maxW;
  return fitWrapDev(text, font, { ...tr, ...o, cap: first.size, min: first.size, balance: true, balanceMin: Math.min(1, Math.max(0.5, need)) });
}

/* ------------------------------------------------------------------ stage */

/** Frame band the chart may use: under the title, clear of bars and edges. */
export function infoBand(genre: Genre, hasTitle: boolean) {
  const band = safeBand(genre, 30);
  return { top: band.top + (hasTitle ? 104 : 16), bottom: band.bottom - 12, left: 150, right: W - 150, titleTop: band.top };
}

const BackdropFill: React.FC<{ b: Backdrop; genre: Genre; seed: string }> = ({ b, genre, seed }) => {
  const f = useCurrentFrame();
  const c = b.color && HEX6.test(b.color) ? b.color : genre.bg;
  const c2 = b.color2 && HEX6.test(b.color2) ? b.color2 : genre.accent;
  switch (b.kind) {
    case 'gradient':
      return <AbsoluteFill style={{ background: `linear-gradient(155deg, ${c} 0%, ${c} 38%, ${mix(c, c2, 0.38)} 100%)` }} />;
    case 'paper': {
      const src = paperTexture(`info${seed}`, { tone: c, w: 1600, h: 900, age: 0.22, rings: false });
      return (
        <AbsoluteFill style={{ background: c }}>
          {src ? <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
        </AbsoluteFill>
      );
    }
    case 'blueprint':
      return (
        <AbsoluteFill
          style={{
            background: c,
            backgroundImage: `linear-gradient(${rgba(c2, 0.14)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(c2, 0.14)} 1px, transparent 1px), linear-gradient(${rgba(c2, 0.05)} 1px, transparent 1px), linear-gradient(90deg, ${rgba(c2, 0.05)} 1px, transparent 1px)`,
            backgroundSize: '96px 96px, 96px 96px, 24px 24px, 24px 24px',
            backgroundPosition: `${(f * 0.3) % 96}px 0`,
          }}
        />
      );
    case 'halftone':
      return (
        <AbsoluteFill style={{ background: c }}>
          <AbsoluteFill
            style={{
              backgroundImage: `radial-gradient(${rgba(c2, 0.3)} 32%, transparent 36%)`,
              backgroundSize: '18px 18px',
              WebkitMaskImage: 'linear-gradient(120deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 55%)',
              maskImage: 'linear-gradient(120deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 55%)',
            }}
          />
        </AbsoluteFill>
      );
    case 'split-color':
      return (
        <AbsoluteFill style={{ background: c }}>
          <AbsoluteFill style={{ background: rgba(c2, 0.32), clipPath: 'polygon(72% 0, 100% 0, 100% 100%, 58% 100%)' }} />
        </AbsoluteFill>
      );
    case 'texture': {
      const src = surfaceTexture(`info${seed}`, 'felt', c, 800, 500);
      return <AbsoluteFill style={{ background: c, backgroundImage: src ? `url(${src})` : undefined, backgroundSize: '800px 500px' }} />;
    }
    default:
      return <AbsoluteFill style={{ background: c }} />;
  }
};

/**
 * The stage: the backdrop (the art director's, else the genre's own pattern
 * and leak), a soft key light behind the chart, a vignette, and the camera —
 * a slow push that every layout leaves room for (`PUSH`).
 */
export const PUSH = 0.028;
export const InfoStage: React.FC<{ genre: Genre; th: InfoTheme; seed: string; durFrames: number; speed: number; title?: string; locale: string; children: React.ReactNode; origin?: string }> = ({
  genre,
  th,
  seed,
  durFrames,
  speed,
  title,
  locale,
  children,
  origin = '50% 55%',
}) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, durFrames], [0, 1], clamp);
  const push = 1 + PUSH * Math.min(1.2, speed) * t;
  const band = safeBand(genre, 30);
  return (
    <AbsoluteFill style={{ background: th.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${1 + 0.012 * t})` }}>{th.backdrop ? <BackdropFill b={th.backdrop} genre={genre} seed={seed} /> : <GenreBg genre={genre} seed={seed} />}</AbsoluteFill>
      {/* Key light: the chart stands in a pool of its own colour. */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 58% 52% at 50% 56%, ${rgba(th.hi, th.light ? 0.06 : 0.09)} 0%, rgba(0,0,0,0) 70%)` }} />
      <AbsoluteFill style={{ background: th.light ? 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0) 55%, rgba(60,40,20,0.22) 100%)' : 'radial-gradient(ellipse 78% 72% at 50% 50%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.55) 100%)' }} />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: origin }}>{children}</AbsoluteFill>
      {title ? <TitleTag genre={th.tagGenre} text={title} locale={locale} top={band.top} left={150} maxW={1500} /> : null}
    </AbsoluteFill>
  );
};

/** Largest scale the stage reaches: layouts fit inside the band divided by this. */
export const STAGE_MAX = 1 + PUSH * 1.2;
export { H, W };
