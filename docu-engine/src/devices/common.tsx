import React from 'react';
import { AbsoluteFill, Easing, getInputProps, interpolate, useCurrentFrame } from 'remotion';
import { LETTERBOX, LightLeak, PatternBg } from '../fx';
import { seededRng } from '../paper';
import { caseLocale } from '../fonts';
import type { DeviceRef, Genre, Scene } from '../types';
import { DFONT, fitLine } from './type';

export const W = 1920;
export const H = 1080;
export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const ease = Easing.inOut(Easing.cubic);
export const easeOut = Easing.out(Easing.cubic);

/** Shared props every device gets from the engine (same as the other scene renderers). */
export interface DevProps {
  genre: Genre;
  durFrames: number;
  locale: string;
  speed: number;
  index?: number;
}

/** Pixels under each letterbox bar. */
export const barPx = (g: Genre) => (g.letterbox ? Math.round(H * LETTERBOX) : 0);

/** The band type may use: clear of the bars with air, and of the frame edge. */
export function safeBand(g: Genre, air = 36): { top: number; bottom: number; left: number; right: number } {
  const bar = barPx(g);
  return { top: Math.max(56, bar + air), bottom: H - Math.max(56, bar + air), left: 96, right: W - 96 };
}

export const isTr = (locale?: string) => String(locale ?? 'tr').toLowerCase().startsWith('tr');
export const upper = (t: string, locale?: string) => String(t ?? '').toLocaleUpperCase(caseLocale(locale));

/* ------------------------------------------------------ picture references */

/**
 * The WRITTEN scenes of the script being rendered (input props), for
 * resolving `fromScene` at render time. `fromScene` indexes the script as
 * written — before the pipeline inserts chapter cards — so the inserted
 * cards (`chapterCard`, never written by hand) are skipped.
 */
let written: Scene[] | null = null;
function scriptScenes(): Scene[] {
  if (written) return written;
  try {
    if (typeof window === 'undefined') return [];
    const s = (getInputProps() as { script?: { scenes?: Scene[] } })?.script;
    written = Array.isArray(s?.scenes) ? s.scenes.filter((x) => !(x?.type === 'title' && x.chapterCard)) : [];
    return written;
  } catch {
    return [];
  }
}

export interface Pic {
  src?: string;
  w?: number;
  h?: number;
}

/**
 * The picture a device slot shows: its own `image`, else the still of the
 * scene it points at (`fromScene`): that scene's image, first extra, or the
 * depth plate. The pipeline normally resolves this before render.
 */
export function resolveRef(ref?: DeviceRef | null): Pic {
  if (!ref) return {};
  if (ref.image) return { src: ref.image, w: ref.imgW, h: ref.imgH };
  if (ref.fromScene == null || !Number.isInteger(ref.fromScene)) return {};
  const s = scriptScenes()[ref.fromScene] as (Scene & { image?: string; images?: string[] }) | undefined;
  if (!s) return {};
  // A clip's `image` is its still frame, the same size as the clip.
  const src = s.image ?? s.images?.[0] ?? s.layers?.bg;
  return { src, w: s.imgW ?? s.videoW, h: s.imgH ?? s.videoH };
}

/* ------------------------------------------------------------- hand marks */

type Pt = [number, number];

/**
 * A hand-drawn loop around an ellipse: starts a little past the top-right,
 * goes round ~1.12 turns with a wobbling radius, and ends overlapping its
 * start slightly off the line — the way a marker circle is really drawn.
 */
export function handLoop(seed: string, cx: number, cy: number, rx: number, ry: number): string {
  const r = seededRng(`loop${seed}`);
  const n = 44;
  const turns = 1.1 + r() * 0.08;
  const a0 = -Math.PI * (0.62 + r() * 0.2);
  const w1 = 0.035 + r() * 0.03;
  const w2 = r() * Math.PI * 2;
  const tilt = (r() - 0.5) * 0.25;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + t * turns * Math.PI * 2;
    // Spiral a touch outward so the overlap misses the start like a real stroke.
    const k = 1 + Math.sin(a * 2 + w2) * w1 + t * 0.07 - 0.02;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return smooth(pts);
}

/** Catmull-Rom through the points as cubic Béziers. */
export function smooth(pts: Pt[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A slightly bowed hand stroke from a to b (for arrows). */
export function handStroke(seed: string, a: Pt, b: Pt, bow = 0.12): { d: string; end: Pt; angle: number } {
  const r = seededRng(`str${seed}`);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const s = (r() > 0.5 ? 1 : -1) * bow * len;
  const c: Pt = [a[0] + dx * 0.5 + nx * s, a[1] + dy * 0.5 + ny * s];
  const d = `M${a[0].toFixed(1)} ${a[1].toFixed(1)} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  const angle = Math.atan2(b[1] - c[1], b[0] - c[0]);
  return { d, end: b, angle };
}

/** Two short barbs of an arrowhead at `tip`, pointing along `angle`. */
export function arrowHead(tip: Pt, angle: number, size: number): string {
  const l: Pt = [tip[0] - Math.cos(angle - 0.5) * size, tip[1] - Math.sin(angle - 0.5) * size];
  const rr: Pt = [tip[0] - Math.cos(angle + 0.45) * size * 0.92, tip[1] - Math.sin(angle + 0.45) * size * 0.92];
  return `M${l[0].toFixed(1)} ${l[1].toFixed(1)} L${tip[0].toFixed(1)} ${tip[1].toFixed(1)} L${rr[0].toFixed(1)} ${rr[1].toFixed(1)}`;
}

/** Stroke-draw progress (0..1) of an SVG path via pathLength=1. */
export const drawn = (p: number): React.SVGProps<SVGPathElement> => ({
  pathLength: 1,
  strokeDasharray: '1 1',
  strokeDashoffset: 1 - Math.max(0, Math.min(1, p)),
});

/* ------------------------------------------------------------- surfaces */

const texCache = new Map<string, string>();

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type SurfaceKind = 'cork' | 'felt' | 'wood';

/**
 * A board surface drawn once per render tab (seeded, so parallel chunks
 * match): cork = granules of two tones and old pin holes; felt = fine fibre
 * noise; wood = long grain. Returns '' outside a browser.
 */
export function surfaceTexture(seed: string, kind: SurfaceKind, tone: string, w = 1600, h = 1000): string {
  const key = `${seed}|${kind}|${tone}|${w}x${h}`;
  const hit = texCache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return '';
  const r = seededRng(`surf${key}`);
  const [br, bg, bb] = hex(tone);
  g.fillStyle = tone;
  g.fillRect(0, 0, w, h);
  if (kind === 'wood') {
    for (let i = 0; i < 260; i++) {
      const y = r() * h;
      const a = 0.04 + r() * 0.08;
      g.strokeStyle = r() > 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,230,190,${a * 0.6})`;
      g.lineWidth = 1 + r() * 4;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x / (120 + r() * 60) + i) * (3 + r() * 5));
      g.stroke();
    }
  }
  if (kind === 'cork') {
    // Granules: thousands of small irregular blobs, darker and lighter than the base.
    for (let i = 0; i < (w * h) / 55; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 0.8 + r() * r() * 4.5;
      const d = r();
      const k = d < 0.55 ? -(18 + r() * 40) : 10 + r() * 30;
      g.fillStyle = `rgba(${Math.max(0, Math.min(255, br + k))},${Math.max(0, Math.min(255, bg + k * 0.9))},${Math.max(0, Math.min(255, bb + k * 0.75))},${0.35 + r() * 0.5})`;
      g.beginPath();
      g.ellipse(x, y, s, s * (0.5 + r() * 0.6), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Old pin holes.
    for (let i = 0; i < 140; i++) {
      const x = r() * w;
      const y = r() * h;
      g.fillStyle = `rgba(0,0,0,${0.35 + r() * 0.3})`;
      g.beginPath();
      g.arc(x, y, 1 + r() * 1.3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Fine noise for every kind.
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const amp = kind === 'felt' ? 16 : kind === 'wood' ? 10 : 14;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
  // (Uneven tone is NOT baked in: the tile repeats, and a blotch cut at its edge draws a seam. The board lays it on top.)
  const url = c.toDataURL('image/jpeg', 0.88);
  texCache.set(key, url);
  return url;
}

/* ------------------------------------------------------------ the title tag */

/**
 * The device's caption, in the genre's typographic family, top-left inside
 * the safe band — the same furniture as the map's cartouche, so every
 * device reads as one system: label genres a printed label, terminal a
 * bracketed readout, glow a lit title on an accent rule.
 */
export const TitleTag: React.FC<{ genre: Genre; text: string; locale: string; top: number; left?: number; delay?: number; maxW?: number }> = ({
  genre,
  text,
  locale,
  top,
  left = 72,
  delay = 3,
  maxW = 1200,
}) => {
  const f = useCurrentFrame();
  const t = String(text ?? '').trim();
  if (!t) return null;
  const p = interpolate(f, [delay, delay + 12], [0, 1], { ...clamp, easing: easeOut });
  const look = genre.look;
  const T = upper(t, locale);
  let inner: React.ReactNode;
  if (look === 'label') {
    const size = fitLine(T, genre.headline, { maxW: maxW - 44, cap: 44, min: 20, trackEm: 0.04 });
    inner = (
      <div
        style={{
          display: 'inline-block',
          background: genre.labelBg,
          padding: '8px 22px 6px',
          transform: `rotate(${genre.collage ? -1.5 : 0}deg)`,
          boxShadow: `0 7px 0 ${genre.accent2}`,
          clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
        }}
      >
        <div style={{ fontFamily: DFONT[genre.headline], fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: '0.04em', color: genre.labelInk, whiteSpace: 'nowrap' }}>{T}</div>
      </div>
    );
  } else if (look === 'terminal') {
    const s = `[ ${T} ]`;
    const size = fitLine(s, 'plexMono', { maxW, cap: 30, min: 16, trackEm: 0.1 });
    inner = (
      <div style={{ fontFamily: DFONT.plexMono, fontWeight: 600, fontSize: size, letterSpacing: '0.1em', color: genre.accent, textShadow: `0 0 14px ${genre.accent}88`, whiteSpace: 'nowrap', opacity: p }}>
        {s.slice(0, Math.ceil(s.length * p))}
      </div>
    );
  } else {
    const track = T.length > 22 ? 0.12 : 0.22;
    const size = fitLine(T, genre.headline, { maxW: maxW - 21, cap: 34, min: 18, trackEm: track });
    inner = (
      <div style={{ opacity: p }}>
        <div
          style={{
            fontFamily: DFONT[genre.headline],
            fontWeight: 700,
            fontSize: size,
            letterSpacing: `${track}em`,
            color: genre.titleInk ?? genre.ink,
            textShadow: `0 0 20px ${genre.accent}88, 0 2px 8px #000`,
            whiteSpace: 'nowrap',
          }}
        >
          {T}
        </div>
      </div>
    );
  }
  return <div style={{ position: 'absolute', left, top, transform: `translateY(${(1 - p) * -14}px)` }}>{inner}</div>;
};

/** The genre's own background for devices that sit on it (pattern + ambient leak). */
export const GenreBg: React.FC<{ genre: Genre; seed: string }> = ({ genre, seed }) => (
  <>
    <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
    <LightLeak color={genre.accent} strength={genre.leak * 0.8} seed={seed} />
  </>
);

/** A fill that ignores the engine's AbsoluteFill content-box padding trap. */
export const Fill: React.FC<{ style?: React.CSSProperties; children?: React.ReactNode }> = ({ style, children }) => (
  <AbsoluteFill style={{ boxSizing: 'border-box', ...style }}>{children}</AbsoluteFill>
);

/** Letters of `text` shown by frame `f` when typing starts at `start` at `cps` characters per second. */
export function typed(text: string, f: number, start: number, fps: number, cps = 22): string {
  const n = Math.max(0, Math.floor(((f - start) / fps) * cps));
  return [...text].slice(0, n).join('');
}
