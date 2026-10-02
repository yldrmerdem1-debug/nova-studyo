import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, random, staticFile } from 'remotion';
import type { Genre, TransitionKind } from '../types';
import { TRANSITION_CATALOG } from './catalog';
// @ts-ignore -- plain ESM shared with Node.
import { seeded, transitionDir } from '../timeline.js';

/*
 * PAIR TRANSITIONS: both shots on screen across the cut. The engine draws
 * a window of `a` frames before the cut and `b` after it over the edit
 * (Engine.tsx): the outgoing shot plays live until the cut and then holds its
 * last frame, the incoming one holds its first frame until the cut and then
 * plays — for 4-12 frames the freeze is invisible under the move.
 */

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const c01 = (v: number) => Math.min(1, Math.max(0, v));

export const PAIR_KINDS = new Set<TransitionKind>(['film-burn', 'ink', 'paper-tear', 'slide', 'iris', 'match', 'pixel', 'light-sweep', 'dip-color', 'spin-blur', 'split-wipe']);
export const isPairKind = (k: TransitionKind) => PAIR_KINDS.has(k);

/** Frames before / after the cut, never more than a third of either shot. */
export function pairFrames(kind: TransitionKind, prevFrames: number, curFrames: number): [number, number] {
  const [a, b] = TRANSITION_CATALOG[kind]?.frames ?? [0, 0];
  return [Math.max(2, Math.min(a, Math.floor(prevFrames / 3))), Math.max(2, Math.min(b, Math.floor(curFrames / 3)))];
}

/** Which way a directional transition travels (shared with the whoosh pan in timeline.js). */
export function pairDirection(kind: TransitionKind, index: number, seed: string): 1 | -1 {
  return (transitionDir as (k: string, i: number, s: string) => 1 | -1)(kind, index, seed);
}

/* ---------------------------------------------------------------- sprites */

/** Pre-rendered organic growth masks (scripts/make-fx-textures.mjs): 16 frames in a 4x4 sheet. */
const SHEET = { cols: 4, rows: 4, n: 16 } as const;
export function spriteMask(file: string, k: number): React.CSSProperties {
  const i = Math.max(0, Math.min(SHEET.n - 1, Math.round(k)));
  const col = i % SHEET.cols;
  const row = Math.floor(i / SHEET.cols);
  const url = `url(${staticFile(file)})`;
  const pos = `${(col / (SHEET.cols - 1)) * 100}% ${(row / (SHEET.rows - 1)) * 100}%`;
  const size = `${SHEET.cols * 100}% ${SHEET.rows * 100}%`;
  return { WebkitMaskImage: url, maskImage: url, WebkitMaskSize: size, maskSize: size, WebkitMaskPosition: pos, maskPosition: pos, WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' };
}

/** Load a texture through <Img> (which holds the frame until it is decoded), so a CSS mask never paints before its image. */
export const Preload: React.FC<{ files: string[] }> = ({ files }) => (
  <>
    {files.map((f) => (
      <Img key={f} src={staticFile(f)} style={{ position: 'absolute', width: 2, height: 2, left: -10, top: -10, opacity: 0 }} />
    ))}
  </>
);

/* ----------------------------------------------------------- the colours */

/** The colour a dip passes through: the genre's own light (or, in the dark genres, its blood / steel). */
export function dipColor(g: Genre): string {
  const byGenre: Record<string, string> = {
    documentary: g.paper,
    finance: '#0c2a1c',
    horror: '#2b0306',
    crime: '#121a23',
    epic: '#f1dcaa',
    science: '#e3f6ff',
    inspire: '#fff0da',
  };
  return byGenre[g.id] ?? g.paper;
}
const isLight = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 140;
};

/* ------------------------------------------------------------- paper tear */

function tearLine(seed: string): [number, number][] {
  const pts: [number, number][] = [];
  const x0 = 0.44 + seeded(`${seed}x0`) * 0.12;
  const x1 = 0.44 + seeded(`${seed}x1`) * 0.12;
  const N = 72;
  let jag = 0;
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    jag = jag * 0.6 + (seeded(`${seed}j${i}`) - 0.5) * 0.02;
    const big = Math.sin(v * 7.3 + seeded(`${seed}w`) * 6) * 0.018;
    pts.push([x0 + (x1 - x0) * v + jag + big, v]);
  }
  return pts;
}
const poly = (pts: [number, number][]) => `polygon(${pts.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(', ')})`;

/* ================================================================ render */

export interface PairProps {
  kind: TransitionKind;
  /** Window-local frame. */
  w: number;
  a: number;
  b: number;
  outgoing: React.ReactNode;
  incoming: React.ReactNode;
  fromFocus: [number, number];
  toFocus: [number, number];
  genre: Genre;
  index: number;
  seed: string;
}

export const PairTransition: React.FC<PairProps> = ({ kind, w, a, b, outgoing, incoming, fromFocus, toFocus, genre, index, seed }) => {
  const n = a + b;
  const p = c01((w + 0.5) / n);
  const cutP = a / n;
  const after = w >= a;
  const key = `${seed}${kind}${index}`;
  const layer = (node: React.ReactNode, style: React.CSSProperties = {}, extra: React.ReactNode = null, k?: string) => (
    <AbsoluteFill key={k} style={{ overflow: 'hidden', ...style }}>
      {node}
      {extra}
    </AbsoluteFill>
  );

  switch (kind) {
    /* ---- the old shot burns out into white-hot film; the new one emerges as it recedes ---- */
    case 'film-burn': {
      // Coverage rises to full at the cut, then recedes.
      const cov = w < a ? Easing.in(Easing.quad)(c01((w + 1) / a)) : 1 - Easing.out(Easing.quad)(c01((w - a + 1) / (b + 1)));
      const k = cov * (SHEET.n - 1);
      const flick = 0.9 + random(`${key}fl${w}`) * 0.1;
      const base = after ? incoming : outgoing;
      const lift = 1 + cov * 0.9;
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          <Preload files={['fx/burn-sheet.png']} />
          {layer(base, { filter: `brightness(${lift.toFixed(3)}) saturate(${(1 + cov * 0.6).toFixed(3)}) sepia(${(cov * 0.35).toFixed(3)})` })}
          {/* Bloom: the burn's light spills past its edge. */}
          <AbsoluteFill style={{ ...spriteMask('fx/burn-sheet.png', Math.min(SHEET.n - 1, k + 4)), background: 'radial-gradient(ellipse at 80% 35%, #ffb35c 0%, #d9481c 60%, #5c0d04 100%)', mixBlendMode: 'screen', opacity: 0.55 * flick, filter: 'blur(14px)' }} />
          <AbsoluteFill style={{ ...spriteMask('fx/burn-sheet.png', Math.min(SHEET.n - 1, k + 2)), background: 'radial-gradient(ellipse at 80% 35%, #ffe2a8 0%, #ff8a3a 50%, #b8300f 100%)', mixBlendMode: 'screen', opacity: 0.8 * flick }} />
          <AbsoluteFill style={{ ...spriteMask('fx/burn-sheet.png', k), background: 'radial-gradient(ellipse at 80% 35%, #ffffff 0%, #fff6dc 50%, #ffd48a 100%)', mixBlendMode: 'screen', opacity: flick }} />
        </AbsoluteFill>
      );
    }

    /* ---- the new shot bleeds in through spreading ink ---- */
    case 'ink': {
      const e = Easing.inOut(Easing.cubic)(p);
      const k = e * (SHEET.n - 1);
      // The ink runs ahead of the picture: a dark wet bloom spreads first, the new shot surfaces inside it.
      const ink = genre.id === 'horror' ? '#160204' : genre.id === 'inspire' || genre.id === 'epic' ? '#120c07' : '#07080a';
      const lead = 2.6 * (1 - e) + 0.8;
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          <Preload files={['fx/ink-sheet.png']} />
          {layer(outgoing, { filter: `brightness(${(1 - 0.2 * e).toFixed(3)})` })}
          <AbsoluteFill style={{ ...spriteMask('fx/ink-sheet.png', Math.min(SHEET.n - 1, k + lead + 1)), background: ink, opacity: 0.35 * (1 - e), filter: 'blur(6px)' }} />
          <AbsoluteFill style={{ ...spriteMask('fx/ink-sheet.png', Math.min(SHEET.n - 1, k + lead)), background: ink, opacity: 0.92 * (1 - e * e * e) }} />
          <AbsoluteFill style={{ ...spriteMask('fx/ink-sheet.png', k) }}>
            {layer(incoming, { transform: `scale(${(1.06 - 0.06 * e).toFixed(4)})`, filter: `brightness(${(0.75 + 0.25 * e).toFixed(3)})` })}
          </AbsoluteFill>
        </AbsoluteFill>
      );
    }

    /* ---- the old shot is torn in two along a paper edge and pulled away ---- */
    case 'paper-tear': {
      const line = tearLine(key);
      const e = Easing.in(Easing.cubic)(p);
      const open = interpolate(p, [0, 0.25], [0, 1], clamp);
      const dxL = -e * W * 0.75 - open * 6;
      const dxR = e * W * 0.75 + open * 6;
      const rotL = -e * 7;
      const rotR = e * 5;
      const left = [[-0.02, -0.02] as [number, number], ...line.map(([x, y]) => [x, y] as [number, number]), [-0.02, 1.02] as [number, number]];
      const right = [[1.02, -0.02] as [number, number], ...line.map(([x, y]) => [x, y] as [number, number]), [1.02, 1.02] as [number, number]];
      // The torn paper fibre: a ragged light rim just outside each piece's edge.
      const fibre = (dir: 1 | -1) => {
        const pts = line.map(([x, y], i) => [x + dir * (0.004 + seeded(`${key}f${i}`) * 0.006), y] as [number, number]);
        // The rim sits just past each piece's own edge: the left piece's to the right, the right piece's to the left.
        return dir > 0 ? [[-0.02, -0.02] as [number, number], ...pts, [-0.02, 1.02] as [number, number]] : [[1.02, -0.02] as [number, number], ...pts, [1.02, 1.02] as [number, number]];
      };
      const piece = (pts: [number, number][], fib: [number, number][], dx: number, rot: number, origin: string) => (
        <AbsoluteFill style={{ transform: `translateX(${dx.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`, transformOrigin: origin, filter: 'drop-shadow(0 18px 26px rgba(0,0,0,0.55))' }}>
          <AbsoluteFill style={{ clipPath: poly(fib), background: genre.paper }} />
          <AbsoluteFill style={{ clipPath: poly(pts), overflow: 'hidden' }}>{outgoing}</AbsoluteFill>
        </AbsoluteFill>
      );
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {layer(incoming, { transform: `scale(${(1.06 - 0.06 * p).toFixed(4)})`, filter: `brightness(${(0.75 + 0.25 * p).toFixed(3)})` })}
          {piece(left, fibre(1), dxL, rotL, '0% 100%')}
          {piece(right, fibre(-1), dxR, rotR, '100% 100%')}
        </AbsoluteFill>
      );
    }

    /* ---- push: the new shot shoves the old one out ---- */
    case 'slide': {
      const dir = pairDirection(kind, index, seed);
      const e = Easing.bezier(0.7, 0, 0.2, 1)(p);
      const v = Math.sin(Math.PI * p); // speed profile for the blur
      const blur = (18 * v).toFixed(1);
      const fid = `slide-${index}`;
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <filter id={fid} x="-5%" y="0" width="110%" height="100%">
              <feGaussianBlur stdDeviation={`${blur} 0`} />
            </filter>
          </svg>
          {layer(outgoing, { transform: `translateX(${(-dir * W * e).toFixed(1)}px)`, filter: v > 0.08 ? `url(#${fid}) brightness(${(1 - 0.2 * e).toFixed(3)})` : undefined })}
          {layer(incoming, {
            transform: `translateX(${(dir * W * (1 - e)).toFixed(1)}px)`,
            filter: v > 0.08 ? `url(#${fid})` : undefined,
            boxShadow: `${-dir * 30}px 0 60px rgba(0,0,0,0.6)`,
          })}
        </AbsoluteFill>
      );
    }

    /* ---- a soft iris closes on the old focus, opens on the new one ---- */
    case 'iris': {
      const R = (fc: [number, number]) => Math.hypot(Math.max(fc[0], 1 - fc[0]) * W, Math.max(fc[1], 1 - fc[1]) * H) + 60;
      const feather = 46;
      if (!after) {
        const e = Easing.in(Easing.cubic)(c01((w + 1) / a));
        const r = R(fromFocus) * (1 - e);
        const m = `radial-gradient(circle at ${fromFocus[0] * 100}% ${fromFocus[1] * 100}%, #000 ${Math.max(0, r - feather)}px, transparent ${r}px)`;
        return <AbsoluteFill style={{ background: '#000' }}>{layer(outgoing, { WebkitMaskImage: m, maskImage: m, transform: `scale(${1 + 0.05 * e})`, transformOrigin: `${fromFocus[0] * 100}% ${fromFocus[1] * 100}%` })}</AbsoluteFill>;
      }
      const e = Easing.out(Easing.cubic)(c01((w - a + 1) / b));
      const r = R(toFocus) * e;
      const m = `radial-gradient(circle at ${toFocus[0] * 100}% ${toFocus[1] * 100}%, #000 ${Math.max(0, r - feather)}px, transparent ${r}px)`;
      return <AbsoluteFill style={{ background: '#000' }}>{layer(incoming, { WebkitMaskImage: m, maskImage: m, transform: `scale(${1.05 - 0.05 * e})`, transformOrigin: `${toFocus[0] * 100}% ${toFocus[1] * 100}%` })}</AbsoluteFill>;
    }

    /* ---- match cut: dive into the old focus, surface from the new one at the same place ---- */
    case 'match': {
      const Z = 1.32;
      const eo = Easing.in(Easing.cubic)(c01(p / Math.max(0.01, cutP + 0.12)));
      const ei = Easing.out(Easing.cubic)(c01((p - (cutP - 0.12)) / Math.max(0.01, 1 - cutP + 0.12)));
      const Fo: [number, number] = [fromFocus[0] * W, fromFocus[1] * H];
      const Fi: [number, number] = [toFocus[0] * W, toFocus[1] * H];
      const sO = 1 + (Z - 1) * eo;
      const sI = Z - (Z - 1) * ei;
      const k = 1 - ei;
      const mix = interpolate(p, [cutP - 0.16, cutP + 0.12], [0, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
      const blur = 3.5 * Math.sin(Math.PI * c01((p - cutP + 0.25) / 0.5));
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {layer(outgoing, { transformOrigin: `${Fo[0]}px ${Fo[1]}px`, transform: `scale(${sO.toFixed(4)})`, filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined })}
          {layer(incoming, {
            opacity: mix,
            transformOrigin: `${Fi[0]}px ${Fi[1]}px`,
            transform: `translate(${((Fo[0] - Fi[0]) * k).toFixed(1)}px, ${((Fo[1] - Fi[1]) * k).toFixed(1)}px) scale(${sI.toFixed(4)})`,
            filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined,
          })}
        </AbsoluteFill>
      );
    }

    /* ---- blocks grow, swap, and resolve ---- */
    case 'pixel': {
      const bs = Math.max(1, Math.round(2 + 54 * Math.pow(Math.sin(Math.PI * p), 1.6)));
      const fid = `px-${index}`;
      const flt = bs > 3 ? `url(#${fid})` : undefined;
      const mix = interpolate(p, [cutP - 0.08, cutP + 0.08], [0, 1], clamp);
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <filter id={fid} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feFlood x={Math.floor(bs / 2)} y={Math.floor(bs / 2)} width="1" height="1" floodColor="#000" />
              <feComposite width={bs} height={bs} />
              <feTile result="grid" />
              <feComposite in="SourceGraphic" in2="grid" operator="in" />
              <feMorphology operator="dilate" radius={Math.ceil(bs / 2)} />
            </filter>
          </svg>
          {mix < 1 ? layer(outgoing, { filter: flt }) : null}
          {mix > 0 ? layer(incoming, { filter: flt, opacity: mix }) : null}
        </AbsoluteFill>
      );
    }

    /* ---- a diagonal band of light wipes the new shot in behind it ---- */
    case 'light-sweep': {
      const dir = pairDirection(kind, index, seed);
      const e = Easing.inOut(Easing.cubic)(p);
      // Band centre travels past both edges; the reveal trails just behind it.
      const x = -35 + 170 * e;
      const edge = dir > 0 ? x : 100 - x;
      const ang = dir > 0 ? 105 : 255;
      const m = `linear-gradient(${ang}deg, #000 ${edge - 14}%, transparent ${edge + 2}%)`;
      const warm = genre.id === 'science' ? '#9fe6ff' : genre.accent;
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {layer(outgoing)}
          {layer(incoming, { WebkitMaskImage: m, maskImage: m })}
          <AbsoluteFill
            style={{
              mixBlendMode: 'screen',
              opacity: Math.sin(Math.PI * p) * 0.95,
              background: `linear-gradient(${ang}deg, transparent ${edge - 22}%, ${warm}55 ${edge - 9}%, #ffffffee ${edge - 3}%, #fff8e0 ${edge}%, ${warm}66 ${edge + 6}%, transparent ${edge + 18}%)`,
            }}
          />
        </AbsoluteFill>
      );
    }

    /* ---- dip through a colour ---- */
    case 'dip-color': {
      const C = dipColor(genre);
      const light = isLight(C);
      const hold = 1;
      const out = interpolate(w, [0, a - hold], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
      const inn = interpolate(w, [a + hold, n - 1], [1, 0], { ...clamp, easing: Easing.out(Easing.quad) });
      const c = after ? inn : out;
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {layer(after ? incoming : outgoing, light ? { filter: `brightness(${(1 + 0.5 * c).toFixed(3)}) contrast(${(1 - 0.3 * c).toFixed(3)})` } : {})}
          <AbsoluteFill style={{ background: C, opacity: c }} />
        </AbsoluteFill>
      );
    }

    /* ---- a fast roll ---- */
    case 'spin-blur': {
      const dir = pairDirection(kind, index, seed);
      const A = 20;
      const cover = (deg: number) => {
        const r = (Math.abs(deg) * Math.PI) / 180;
        return Math.cos(r) + Math.sin(r) * (W / H);
      };
      if (!after) {
        const e = Easing.in(Easing.cubic)(c01((w + 1) / a));
        const deg = dir * A * e;
        const s = cover(deg) * (1 + 0.12 * e);
        return <AbsoluteFill style={{ background: '#000' }}>{layer(outgoing, { transform: `rotate(${deg.toFixed(2)}deg) scale(${s.toFixed(4)})`, filter: e > 0.05 ? `blur(${(12 * e).toFixed(2)}px) brightness(${(1 + 0.25 * e).toFixed(3)})` : undefined })}</AbsoluteFill>;
      }
      const e = 1 - Easing.out(Easing.cubic)(c01((w - a + 1) / b));
      const deg = -dir * A * e;
      const s = cover(deg) * (1 + 0.12 * e);
      return <AbsoluteFill style={{ background: '#000' }}>{layer(incoming, { transform: `rotate(${deg.toFixed(2)}deg) scale(${s.toFixed(4)})`, filter: e > 0.05 ? `blur(${(12 * e).toFixed(2)}px) brightness(${(1 + 0.25 * e).toFixed(3)})` : undefined })}</AbsoluteFill>;
    }

    /* ---- three panels wipe in, one after another ---- */
    case 'split-wipe': {
      const vertical = seeded(`${key}or`) < 0.6;
      const N = 3;
      const stag = 0.16;
      const reveal = Array.from({ length: N }, (_, i) => Easing.bezier(0.75, 0, 0.25, 1)(c01((p - i * stag) / (1 - (N - 1) * stag))));
      const up = seeded(`${key}up`) < 0.5;
      const masks = reveal.map((r, i) => {
        const pos = vertical ? `${(i / (N - 1)) * 100}% 0%` : `0% ${(i / (N - 1)) * 100}%`;
        const size = vertical ? `${100 / N + 0.2}% 100%` : `100% ${100 / N + 0.2}%`;
        const alt = (i % 2 === 0) === up;
        const to = vertical ? (alt ? 'to top' : 'to bottom') : alt ? 'to left' : 'to right';
        return { img: `linear-gradient(${to}, #000 ${(r * 100).toFixed(2)}%, transparent ${(r * 100).toFixed(2)}%)`, pos, size };
      });
      const img = masks.map((m) => m.img).join(', ');
      const pos = masks.map((m) => m.pos).join(', ');
      const size = masks.map((m) => m.size).join(', ');
      const lines = reveal.map((r, i) => {
        if (r <= 0 || r >= 1) return null;
        const alt = (i % 2 === 0) === up;
        const style: React.CSSProperties = vertical
          ? { left: `${(i * 100) / N}%`, width: `${100 / N}%`, height: 5, top: alt ? `${(1 - r) * 100}%` : `calc(${r * 100}% - 5px)` }
          : { top: `${(i * 100) / N}%`, height: `${100 / N}%`, width: 5, left: alt ? `${(1 - r) * 100}%` : `calc(${r * 100}% - 5px)` };
        return <div key={i} style={{ position: 'absolute', background: genre.accent, boxShadow: `0 0 18px ${genre.accent}`, ...style }} />;
      });
      return (
        <AbsoluteFill style={{ background: '#000' }}>
          {layer(outgoing, { filter: `brightness(${(1 - 0.3 * p).toFixed(3)})` })}
          {layer(incoming, {
            WebkitMaskImage: img,
            maskImage: img,
            WebkitMaskPosition: pos,
            maskPosition: pos,
            WebkitMaskSize: size,
            maskSize: size,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            transform: `scale(${(1.04 - 0.04 * p).toFixed(4)})`,
          })}
          <AbsoluteFill>{lines}</AbsoluteFill>
        </AbsoluteFill>
      );
    }
    default:
      return <>{after ? incoming : outgoing}</>;
  }
};
