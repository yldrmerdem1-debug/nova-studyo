import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, staticFile } from 'remotion';
import type { Genre } from '../types';

/*
 * Frame-level scene effects: overlays drawn over the scene's picture and type,
 * all cheap (gradients, cached textures, a handful of divs). Each takes the
 * scene-local frame and its timing anchors; none keeps state.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const c01 = (v: number) => Math.min(1, Math.max(0, v));

export interface OverlayProps {
  f: number;
  dur: number;
  fps: number;
  hit: number | null;
  hits: number[];
  seed: string;
  genre: Genre;
  focus: [number, number];
  /** Intensity from the scene's energy (1 = as designed). */
  gain?: number;
}

/** Warm light per genre (leaks, flares, bokeh). */
export function lightOf(g: Genre): { hot: string; warm: string; tint: string } {
  switch (g.id) {
    case 'science':
      return { hot: '#e9fbff', warm: '#6fd6ff', tint: '#2f7dff' };
    case 'finance':
      return { hot: '#eafff3', warm: '#7dffb8', tint: '#19e07a' };
    case 'horror':
      return { hot: '#ffe9d6', warm: '#ff7a4a', tint: '#c1121f' };
    case 'crime':
      return { hot: '#fff6dc', warm: '#ffc24a', tint: '#6b8aa6' };
    case 'epic':
      return { hot: '#fff3d6', warm: '#ffb04a', tint: '#d9a441' };
    default:
      return { hot: '#fff4e0', warm: '#ffb060', tint: '#ff6a3a' };
  }
}

/* ------------------------------------------------------------ light leak */

export const LeakFx: React.FC<OverlayProps> = ({ f, dur, fps, seed, genre, gain = 1 }) => {
  const L = lightOf(genre);
  const env = Math.min(0.85, interpolate(f, [0, 0.45 * fps, 1.9 * fps, Math.max(2 * fps, dur)], [0, 0.62, 0.3, 0.2], clamp) * Math.max(1, gain));
  const side = random(`${seed}lkside`) < 0.5;
  const t = f / Math.max(1, dur);
  const xa = side ? -8 + t * 42 : 108 - t * 42;
  const ya = 25 + Math.sin(f / 29 + random(`${seed}lky`) * 6) * 12;
  const xb = side ? 18 + t * 30 + Math.sin(f / 17) * 4 : 82 - t * 30 - Math.sin(f / 17) * 4;
  const yb = 70 + Math.cos(f / 23) * 10;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        opacity: env,
        background: `radial-gradient(ellipse 38% 85% at ${xa}% ${ya}%, ${L.hot}e6 0%, ${L.warm}99 28%, ${L.tint}44 55%, transparent 75%),
                     radial-gradient(ellipse 26% 40% at ${xb}% ${yb}%, ${L.warm}88 0%, ${L.tint}33 50%, transparent 75%)`,
      }}
    />
  );
};

/* ------------------------------------------------------------- film burn */

export const BurnFx: React.FC<OverlayProps> = ({ f, fps, seed, gain = 1 }) => {
  // The head of a reel: the frame catches fire at one edge for ~1 s, flaring hot, then clears.
  const len = Math.round(1.1 * fps);
  if (f > len) return null;
  const side = Math.floor(random(`${seed}bc`) * 3);
  const cx = side === 0 ? 0 : side === 1 ? 100 : 30 + random(`${seed}bx`) * 40;
  const cy = side === 2 ? 0 : 20 + random(`${seed}by`) * 50;
  const grow = interpolate(f, [0, 6, len], [0.35, 1, 0.7], { ...clamp, easing: Easing.out(Easing.quad) });
  const flick = 0.86 + random(`${seed}bf${f}`) * 0.14;
  const o = Math.min(1, interpolate(f, [0, 2, 9, len], [0.5, 1, 0.85, 0], clamp) * flick * Math.max(1, gain));
  const R = 1150 * grow;
  const mx = 50 + (random(`${seed}bm`) - 0.5) * 30;
  const my = 50 + (random(`${seed}bn`) - 0.5) * 30;
  const cloud = `url(${staticFile('fx/cloud.png')})`;
  const at = `${cx}% ${cy}%`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: o }}>
      {/* The whole frame over-exposes a little, warm. */}
      <AbsoluteFill style={{ background: `radial-gradient(circle ${R * 1.3}px at ${at}, #ff9a4a66 0%, #c2410c33 45%, transparent 80%)` }} />
      {/* The burn itself: organic, hot core, orange body, red fringe. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle ${R}px at ${at}, #ffffff 0%, #fff1c9 16%, #ffc062 32%, #ff7a2a 50%, #c3300e 68%, transparent 88%)`,
          WebkitMaskImage: cloud,
          maskImage: cloud,
          WebkitMaskSize: '130% 130%',
          maskSize: '130% 130%',
          WebkitMaskPosition: `${mx + f * 0.9}% ${my - f * 0.4}%`,
          maskPosition: `${mx + f * 0.9}% ${my - f * 0.4}%`,
        }}
      />
      <AbsoluteFill style={{ background: `radial-gradient(circle ${R * 0.42}px at ${at}, #fffdf5 0%, #ffe3a3 45%, transparent 100%)` }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ flare */

export const FlareFx: React.FC<OverlayProps> = ({ f, dur, fps, hit, seed, genre, focus, gain = 1 }) => {
  const L = lightOf(genre);
  // The bloom lands on a real impact only (timing.ts mainHit, 29 Ekim 2026); without one the flare just glides.
  const bloom = hit === null ? 0 : interpolate(f - hit, [-6, 0, 16], [0, 1, 0], clamp);
  const base = interpolate(f, [0, 0.6 * fps], [0, 0.42], clamp);
  const o = Math.min(1, (base + bloom * 0.55) * Math.max(1, gain));
  const y = Math.min(0.62, Math.max(0.24, focus[1] - 0.04)) * 100;
  const x = interpolate(f, [0, dur], [18 + random(`${seed}fx`) * 20, 62 + random(`${seed}fx2`) * 20]);
  const len = 55 + bloom * 25;
  // Ghosts mirrored through the centre.
  const gx = 100 - x;
  const gy = 100 - y;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: o }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse ${len}% 1.6% at ${x}% ${y}%, #ffffff 0%, ${L.hot} 25%, ${L.warm}aa 55%, transparent 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse ${len * 0.8}% 5% at ${x}% ${y}%, ${L.warm}55 0%, transparent 100%)` }} />
      <AbsoluteFill style={{ background: `radial-gradient(circle ${90 + bloom * 70}px at ${x}% ${y}%, #ffffffcc 0%, ${L.warm}66 35%, transparent 100%)` }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle 46px at ${x + (gx - x) * 0.6}% ${y + (gy - y) * 0.6}%, ${L.tint}33 0%, ${L.tint}22 60%, transparent 100%),
                       radial-gradient(circle 110px at ${gx}% ${gy}%, ${L.warm}1c 0%, ${L.warm}14 70%, transparent 100%),
                       radial-gradient(circle 22px at ${x + (gx - x) * 1.25}% ${y + (gy - y) * 1.25}%, ${L.hot}33 0%, transparent 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- halftone */

/** A warm paper tone over the printed (halftone-filtered) scene. */
export const HalftoneFx: React.FC<OverlayProps> = ({ f, fps }) => {
  const o = interpolate(f, [0, 0.3 * fps], [0, 1], clamp);
  return <AbsoluteFill style={{ pointerEvents: 'none', opacity: o * 0.14, background: '#efe2c4', mixBlendMode: 'multiply' }} />;
};

/**
 * A real halftone: the picture's luminance thresholded against a 45-degree
 * dot screen, so dots grow in the shadows and shrink in the highlights, then
 * printed back over the picture (half ink, half tone) - a magazine
 * reproduction, not a screen door.
 */
export const HalftoneDefs: React.FC<{ id: string; cell?: number; ink?: number }> = ({ id, cell = 9, ink = 0.5 }) => {
  const c = cell;
  const h = c / 2;
  const dot = Math.max(2, Math.round(c / 3));
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feColorMatrix in="SourceGraphic" type="matrix" values="0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0" result="lum" />
        {/* The screen: a 45-degree dot lattice (a dot per cell and one in its centre), blurred into bumps on black. */}
        <feFlood x="0" y="0" width={dot} height={dot} floodColor="#fff" result="d1" />
        <feFlood x={h} y={h} width={dot} height={dot} floodColor="#fff" result="d2" />
        <feMerge result="d">
          <feMergeNode in="d1" />
          <feMergeNode in="d2" />
        </feMerge>
        <feComposite in="d" in2="d" operator="over" x="0" y="0" width={c} height={c} result="cell" />
        <feTile in="cell" result="grid" />
        <feFlood floodColor="#000" result="black" />
        <feMerge result="solid">
          <feMergeNode in="black" />
          <feMergeNode in="grid" />
        </feMerge>
        <feGaussianBlur in="solid" stdDeviation={c * 0.23} result="bump" />
        <feComponentTransfer in="bump" result="field">
          <feFuncR type="linear" slope="3.5" />
          <feFuncG type="linear" slope="3.5" />
          <feFuncB type="linear" slope="3.5" />
        </feComponentTransfer>
        {/* Ink where the screen's bump rises above the tone: t = lum - field. */}
        <feComposite in="lum" in2="field" operator="arithmetic" k1="0" k2="1" k3="-1" k4="0.02" result="t" />
        <feComponentTransfer in="t" result="mask">
          <feFuncR type="linear" slope="8" intercept="0.5" />
          <feFuncG type="linear" slope="8" intercept="0.5" />
          <feFuncB type="linear" slope="8" intercept="0.5" />
          <feFuncA type="linear" slope="0" intercept="1" />
        </feComponentTransfer>
        {/* Printed back over the picture: dots at (1 - ink), paper is the picture itself. */}
        <feComposite in="SourceGraphic" in2="mask" operator="arithmetic" k1={ink} k2={1 - ink} k3="0" k4="0" />
      </filter>
    </svg>
  );
};
/* --------------------------------------------------------------------- VHS */

export const VhsFx: React.FC<OverlayProps> = ({ f, seed }) => {
  const band = ((f * 2.2 + random(`${seed}vb`) * 900) % 1400) - 200;
  const tile = f % 6;
  const gx = Math.floor(random(`vx${f}`) * 512);
  const gy = Math.floor(random(`vy${f}`) * 512);
  const glitchy = random(`${seed}vg${Math.floor(f / 4)}`) > 0.93;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.2) 0 1px, rgba(0,0,0,0) 1px 3px)' }} />
      {/* The tracking band: a soft bright smear with tape noise. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: band,
          height: glitchy ? 46 : 70,
          background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.09) 45%, rgba(255,255,255,0.03) 100%)',
          backgroundBlendMode: 'screen',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: band + 20,
          height: 26,
          opacity: 0.35,
          mixBlendMode: 'screen',
          backgroundImage: `url(${staticFile(`fx/grain-${tile}.png`)})`,
          backgroundPosition: `${gx}px ${gy}px`,
          backgroundSize: '1400px 60px',
        }}
      />
      {/* Head-switching noise along the bottom edge. */}
      <div
        style={{
          position: 'absolute',
          left: -20,
          right: 0,
          bottom: 0,
          height: 14,
          transform: `translateX(${(random(`vh${f}`) - 0.5) * 30}px)`,
          backgroundImage: `url(${staticFile(`fx/grain-${(tile + 3) % 6}.png`)})`,
          backgroundSize: '900px 20px',
          opacity: 0.8,
          mixBlendMode: 'screen',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.35) 100%)' }} />
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------------- dust */

export const DustFx: React.FC<OverlayProps> = ({ f, seed }) => {
  const specks = Array.from({ length: 9 }, (_, i) => {
    if (random(`${seed}dv${f}${i}`) > 0.42) return null;
    const s = 2 + random(`${seed}ds${f}${i}`) * 7;
    const dark = random(`${seed}dc${f}${i}`) > 0.35;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${random(`${seed}dx${f}${i}`) * 100}%`,
          top: `${random(`${seed}dy${f}${i}`) * 100}%`,
          width: s,
          height: s * (0.5 + random(`${seed}dh${f}${i}`) * 0.9),
          borderRadius: '45%',
          background: dark ? '#0a0806' : '#f4efe4',
          opacity: dark ? 0.55 : 0.4,
          transform: `rotate(${random(`${seed}dr${f}${i}`) * 180}deg)`,
        }}
      />
    );
  });
  // A hair caught in the gate: stays a few frames, then goes.
  const hk = Math.floor(f / 5);
  const hair = random(`${seed}hair${hk}`) > 0.72;
  const hx = random(`${seed}hx${hk}`) * 1700 + 100;
  const hy = random(`${seed}hy${hk}`) * 800 + 100;
  const hr = random(`${seed}hr${hk}`) * 360;
  const scratch = random(`${seed}scr${Math.floor(f / 2)}`) > 0.86;
  /*
   * No full-frame "breathe" any more (29 Ekim 2026, Gimli 20261028-9ff721 / Kartal Yuvası 950730: kanal sahibi "anlık
   * efektler doğal değil"): a white-or-black sheet at a random ±2.5% every frame read as flicker over the whole picture,
   * and half of its frames darkened pictures already at luma 52-56. The specks, the hair and the scratch stay.
   */
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {specks}
      {hair ? (
        <svg width="1920" height="1080" style={{ position: 'absolute', left: 0, top: 0 }}>
          <path
            d={`M ${hx} ${hy} q 40 ${-30 + random(`${seed}q1${hk}`) * 60} 90 ${-10 + random(`${seed}q2${hk}`) * 20} t 70 ${-20 + random(`${seed}q3${hk}`) * 40}`}
            transform={`rotate(${hr} ${hx} ${hy})`}
            stroke="#120d08"
            strokeWidth={1.6}
            fill="none"
            opacity={0.6}
          />
        </svg>
      ) : null}
      {scratch ? (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${random(`${seed}sx${Math.floor(f / 2)}`) * 100}%`, width: 1.5, background: 'rgba(250,245,230,0.22)' }} />
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ flash frame */

export const FlashFx: React.FC<OverlayProps> = ({ f, hit, genre }) => {
  if (hit === null) return null;
  const d = f - hit;
  const o = [0.88, 0.42, 0.16, 0.05][d] ?? 0;
  if (!o) return null;
  const L = lightOf(genre);
  return <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: o, background: `radial-gradient(ellipse at 50% 45%, #ffffff 0%, ${L.hot} 55%, ${L.warm} 100%)` }} />;
};

/* --------------------------------------------------------- vignette pulse */

/*
 * A REAL PULSE (29 Ekim 2026, Gimli 20261028-9ff721 / Kartal Yuvası 950730: luma 52-56, %21-39 kare luma < 40; kanal
 * sahibi "her video siyah, anlık efektler doğal değil"). The old one rested at 0.34 black at the edges for the whole
 * scene (0.58 on a hit, up to 0.92 with gain) on top of the global vignette of 0.6-0.9 — a permanent black ring, not a
 * pulse. Now it rests at PULSE_REST (≤ 0.1), tightens only within ±PULSE_WINDOW frames of a real hit (no hit: it stays
 * at rest), and never stacks over a global vignette that is already PULSE_GLOBAL_MAX or stronger.
 */
export const PULSE_REST = 0.08;
export const PULSE_PEAK = 0.26;
export const PULSE_WINDOW = 20;
export const PULSE_GLOBAL_MAX = 0.35;

export const VignettePulseFx: React.FC<OverlayProps> = ({ f, fps, hits, genre, gain = 1 }) => {
  if ((Number(genre?.vignette) || 0) >= PULSE_GLOBAL_MAX) return null;
  let spike = 0;
  for (const h of hits) spike = Math.max(spike, interpolate(f - h, [-PULSE_WINDOW, 0, PULSE_WINDOW], [0, 1, 0], { ...clamp, easing: Easing.inOut(Easing.sin) }));
  const k = interpolate(f, [0, 0.6 * fps], [0, 1], clamp);
  const strength = Math.min(0.4, k * PULSE_REST + spike * PULSE_PEAK * Math.min(1.3, Math.max(1, gain)));
  if (strength < 0.005) return null;
  const inner = 52 - 10 * spike;
  return <AbsoluteFill style={{ pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 48%, rgba(0,0,0,0) ${inner}%, rgba(0,0,0,${strength.toFixed(3)}) 100%)` }} />;
};

/* ------------------------------------------------------------- scan lines */

export const ScanFx: React.FC<OverlayProps> = ({ f, fps }) => {
  // No refresh bar sweeping the frame: the user rejects any band crawling over the picture (Oct 2026).
  const o = interpolate(f, [0, 0.25 * fps], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: o }}>
      <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.24) 0 1px, rgba(0,0,0,0) 1px 4px)' }} />
      <AbsoluteFill
        style={{
          mixBlendMode: 'screen',
          backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,40,40,0.05) 0 1px, rgba(40,255,90,0.05) 1px 2px, rgba(60,110,255,0.05) 2px 3px)',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.4) 100%)' }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ bokeh */

export const BokehFx: React.FC<OverlayProps> = ({ f, dur, fps, seed, genre, gain = 1 }) => {
  const L = lightOf(genre);
  const env = Math.min(1, interpolate(f, [0, 0.7 * fps, dur - 0.3 * fps, dur], [0, 0.8, 0.8, 0.56], clamp) * Math.max(1, gain));
  const orbs = Array.from({ length: 10 }, (_, i) => {
    const r = 40 + random(`${seed}br${i}`) * 150;
    const x = random(`${seed}bx${i}`) * 110 - 5;
    const y0 = random(`${seed}by${i}`) * 110 - 5;
    const drift = (f / fps) * (4 + random(`${seed}bv${i}`) * 6);
    const y = y0 - drift * (r / 150);
    const xs = x + Math.sin(f / (40 + i * 7) + i) * 1.5;
    const col = i % 3 === 0 ? L.hot : i % 3 === 1 ? L.warm : L.tint;
    const o = (0.18 + random(`${seed}bo${i}`) * 0.28) * (r > 150 ? 0.6 : 1);
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${xs}%`,
          top: `${y}%`,
          width: r * 2,
          height: r * 2,
          marginLeft: -r,
          marginTop: -r,
          borderRadius: '50%',
          opacity: o,
          background: `radial-gradient(circle, ${col}88 0%, ${col}66 58%, ${col}aa 66%, ${col}00 71%)`,
        }}
      />
    );
  });
  return <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: env }}>{orbs}</AbsoluteFill>;
};

/** Helpers for the body-level effects (index.tsx). */
export function spikeAt(f: number, hits: number[], len: number): number {
  let s = 0;
  for (const h of hits) {
    const d = f - h;
    if (d >= -1 && d < len) s = Math.max(s, d < 0 ? 0.5 : 1 - d / len);
  }
  return c01(s);
}
