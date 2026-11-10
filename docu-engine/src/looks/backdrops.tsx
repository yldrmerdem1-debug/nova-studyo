import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { CLIP_MIN_RATE, Media, clipOf, type Clip } from '../fx';
import type { Backdrop, Genre } from '../types';
import { alpha, isLight, mix, rgb } from './color';
import type { SceneLook } from './resolve';

/*
 * GROUNDS for text scenes that are not over a picture (scene.backdrop, a
 * chapter's, or the variant's default). Drawn by fx.tsx PatternBg in place of
 * the genre pattern, so every scene that sits on its genre's ground (words,
 * slam, title, counter, chart, quote, timeline) gets it with no change of its
 * own. Everything is CSS gradients or a texture painted ONCE per render tab
 * into a canvas; nothing is computed per pixel per frame. Each ground drifts
 * slowly so a long hold never reads as a frozen frame.
 */

const W = 1920;
const H = 1080;

/* --------------------------------------------------------- baked textures */

const cache = new Map<string, string>();

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Paper (fibres + soft blotches) or a tactile material (concrete-like mottling + specks), baked at 960x540 and scaled. */
function bake(kind: 'paper' | 'texture', color: string): string {
  const key = `${kind}|${color}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') return '';
  const w = 960;
  const h = 540;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return '';
  const r = rng(key);
  const [br, bgc, bb] = rgb(color);
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const light = isLight(color);
  // Low-frequency mottling: big soft discs a little darker / lighter than the stock.
  const blobs = kind === 'paper' ? 90 : 160;
  for (let i = 0; i < blobs; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = (kind === 'paper' ? 40 : 20) + r() * (kind === 'paper' ? 160 : 110);
    const dark = r() < 0.55;
    const a = (kind === 'paper' ? 0.035 : 0.07) * (0.4 + r());
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const tone = dark ? '0,0,0' : light ? '255,255,255' : '255,245,230';
    grd.addColorStop(0, `rgba(${tone},${a})`);
    grd.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  if (kind === 'paper') {
    // Fibres: short thin strokes in every direction.
    for (let i = 0; i < 2600; i++) {
      const x = r() * w;
      const y = r() * h;
      const a = r() * Math.PI;
      const l = 3 + r() * 14;
      g.strokeStyle = r() < 0.5 ? `rgba(0,0,0,${0.03 + r() * 0.05})` : `rgba(255,255,255,${0.05 + r() * 0.07})`;
      g.lineWidth = 0.5 + r() * 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  } else {
    // Specks and pits.
    for (let i = 0; i < 5200; i++) {
      const x = r() * w;
      const y = r() * h;
      const s = 0.4 + r() * r() * 2.2;
      g.fillStyle = r() < 0.6 ? `rgba(0,0,0,${0.08 + r() * 0.2})` : `rgba(255,255,255,${0.04 + r() * 0.1})`;
      g.fillRect(x, y, s, s);
    }
  }
  // Fine grain.
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const amp = kind === 'paper' ? 9 : 16;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp;
    d[i] = d[i] + n;
    d[i + 1] = d[i + 1] + n;
    d[i + 2] = d[i + 2] + n;
  }
  g.putImageData(img, 0, 0);
  void br;
  void bgc;
  void bb;
  const url = c.toDataURL('image/jpeg', 0.9);
  cache.set(key, url);
  return url;
}

/** The coloured half of a split ground, pulled a third of the way to the other half. */
export const splitField = (c1: string, c2: string) => mix(c1, c2, 0.32);

/* ------------------------------------------------------------- the ground */

/**
 * A neighbour's clip as a slowed segment: a part of the footage the viewer has
 * not just watched (40% in), stretched to CLIP_MIN_RATE over the scene — slow
 * motion under the words, never a replay of the shot before.
 */
export function slowedClip(src: SceneLook['blurSrc'], durFrames: number, fps: number): Clip | undefined {
  const c = clipOf(src);
  if (!c) return undefined;
  const need = (durFrames / fps) * CLIP_MIN_RATE + 0.1;
  const span = Number.isFinite(c.end) ? c.end - c.start : need * 3;
  if (span <= need) return c;
  const start = c.start + Math.min(span - need, Math.max(0, span * 0.4));
  return { ...c, start, end: start + need };
}

/**
 * The RELATED ground: the picture (or slowed clip) the line is about, filling
 * the frame behind big type — graded like the scene, slow parallax drift and
 * push, depth-blurred and pulled down so the type owns the frame. Rendered at
 * half size and scaled up (a full-HD blur every frame is the costliest thing
 * Chrome does). tone 'light' washes it into the look's paper instead.
 *
 * Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: this ground was
 * brightness 0.58 x a 0.28 multiply x a 0.38-0.62 black radial — every big-text
 * beat a near-black frame, and the light tone printed it grayscale(1). Now the
 * picture stays in colour and only gently held down (RELATED_DIM); the type
 * keeps its own shadow and scrim for legibility.
 */
export const RELATED_DIM = { brightness: 0.8, saturate: 1, multiply: 0.15, centre: 0.22, mid: 0.16, edge: 0.42 } as const;
/** The light tone's print: in colour, softened (no grayscale). */
export const RELATED_LIGHT_FILTER = 'url(#duo) saturate(0.6) contrast(1.05) brightness(1.02) blur(0.8px)';

const RelatedGround: React.FC<{ backdrop: Backdrop; genre: Genre; src: SceneLook['blurSrc']; durFrames: number; seed: string }> = ({ backdrop, genre, src, durFrames, seed }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const light = backdrop.tone === 'light';
  const color = backdrop.color ?? (light ? genre.paper : genre.bg);
  const clip = src?.video ? slowedClip(src, durFrames, fps) : undefined;
  const image = src?.image;
  const K = 2;
  const p = interpolate(f, [0, Math.max(1, durFrames)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Parallax: the picture slides one way while it pushes in; the direction is seeded per scene.
  const dir = random(`rg${seed}`) < 0.5 ? -1 : 1;
  const z = 1.12 + p * 0.07;
  const tx = dir * (p - 0.5) * 70;
  const ty = (random(`rgy${seed}`) - 0.5) * 30 * (1 - p);
  const layer = (filter: string, extra: React.CSSProperties = {}) => (
    <AbsoluteFill style={{ overflow: 'hidden', justifyContent: 'center', alignItems: 'center', ...extra }}>
      <div style={{ width: W / K, height: H / K, flexShrink: 0, transform: `translate(${tx}px, ${ty}px) scale(${K * z})` }}>
        <Media src={image} clip={clip} durFrames={durFrames} style={{ width: '100%', height: '100%', objectFit: 'cover', filter }} />
      </div>
    </AbsoluteFill>
  );
  if (!image && !clip) return <AbsoluteFill style={{ background: color }} />;
  if (light) {
    const url = bake('paper', color);
    return (
      <AbsoluteFill style={{ background: color }}>
        {url ? <AbsoluteFill style={{ backgroundImage: `url(${url})`, backgroundSize: `${W}px ${H}px` }} /> : null}
        {/* The picture printed faintly into the paper (multiply: its darks become ink, its lights vanish). */}
        {layer(RELATED_LIGHT_FILTER, { opacity: 0.46, mixBlendMode: 'multiply' })}
        {/* A clean field where the type sits, the print showing round it. */}
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 54% 48% at 50% 50%, ${alpha(color, 0.55)} 0%, ${alpha(color, 0.22)} 55%, ${alpha(color, 0)} 85%)` }} />
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 95% 90% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.14) 100%)' }} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: '#050505' }}>
      {layer(`url(#duo) blur(1.4px) brightness(${RELATED_DIM.brightness}) saturate(${RELATED_DIM.saturate}) contrast(1.05)`)}
      {/* The look's ground colour, multiplied in lightly: the picture sits inside the palette and keeps its colour. */}
      <AbsoluteFill style={{ background: color, opacity: RELATED_DIM.multiply, mixBlendMode: 'multiply' }} />
      {/* Depth: the centre (where the type lands) falls back a little, the edges a little more — never to black. */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 62% 56% at 50% 50%, rgba(0,0,0,${RELATED_DIM.centre}) 0%, rgba(0,0,0,${RELATED_DIM.mid}) 60%, rgba(0,0,0,${RELATED_DIM.edge}) 100%)` }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------- period textures */

/** Newsprint: the page of a paper — rules, a headline block, columns of type — too faint to read, enough to feel. */
const Newsprint: React.FC<{ color: string; f: number }> = ({ color, f }) => {
  const url = bake('paper', color);
  const drift = f * 0.06;
  const ink = 'rgba(30,24,18,';
  const cols = 5;
  return (
    <AbsoluteFill style={{ background: color, overflow: 'hidden' }}>
      {url ? <AbsoluteFill style={{ backgroundImage: `url(${url})`, backgroundSize: `${W}px ${H}px` }} /> : null}
      <AbsoluteFill style={{ transform: `translate(${-40 + drift * 0.5}px, ${-30 + drift * 0.3}px) rotate(-2.2deg) scale(1.12)`, opacity: 0.22 }}>
        {/* Masthead and its double rule. */}
        <div style={{ position: 'absolute', left: 120, right: 120, top: 70, height: 96, background: `${ink}0.85)`, clipPath: 'polygon(0 30%, 100% 30%, 100% 75%, 0 75%)' }} />
        <div style={{ position: 'absolute', left: 120, right: 120, top: 190, height: 4, background: `${ink}0.9)` }} />
        <div style={{ position: 'absolute', left: 120, right: 120, top: 200, height: 1.5, background: `${ink}0.9)` }} />
        {/* Headline bars. */}
        {[0, 1].map((k) => (
          <div key={k} style={{ position: 'absolute', left: 140, width: k ? 980 : 1420, top: 240 + k * 74, height: 54, background: `${ink}0.75)` }} />
        ))}
        {/* Columns of body type. */}
        {Array.from({ length: cols }, (_, c) => (
          <div
            key={c}
            style={{
              position: 'absolute',
              left: 140 + c * 330,
              width: 290,
              top: 400,
              bottom: -40,
              backgroundImage: `repeating-linear-gradient(180deg, ${ink}0.55) 0 7px, transparent 7px 17px)`,
              WebkitMaskImage: `linear-gradient(90deg, #000 ${70 + (c % 3) * 9}%, transparent 100%)`,
              maskImage: `linear-gradient(90deg, #000 ${70 + (c % 3) * 9}%, transparent 100%)`,
            }}
          />
        ))}
        {Array.from({ length: cols - 1 }, (_, c) => (
          <div key={c} style={{ position: 'absolute', left: 448 + c * 330, width: 1.5, top: 400, bottom: 0, background: `${ink}0.6)` }} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${alpha(color, 0.7)} 0%, ${alpha(color, 0)} 80%), radial-gradient(ellipse 95% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.2) 100%)` }} />
    </AbsoluteFill>
  );
};

/** Ledger paper: blue rules, a red double margin, faint column lines — money, accounts, the bank's books. */
const Ledger: React.FC<{ color: string; f: number }> = ({ color, f }) => {
  const url = bake('paper', color);
  const y = (f * 0.12) % 46;
  return (
    <AbsoluteFill style={{ background: color, overflow: 'hidden' }}>
      {url ? <AbsoluteFill style={{ backgroundImage: `url(${url})`, backgroundSize: `${W}px ${H}px` }} /> : null}
      <AbsoluteFill style={{ transform: 'rotate(-1.4deg) scale(1.08)' }}>
        <AbsoluteFill style={{ backgroundImage: 'repeating-linear-gradient(180deg, transparent 0 44px, rgba(52,92,150,0.32) 44px 46px)', backgroundPosition: `0 ${y}px` }} />
        <div style={{ position: 'absolute', left: 230, top: -40, bottom: -40, width: 2, background: 'rgba(178,40,40,0.5)' }} />
        <div style={{ position: 'absolute', left: 238, top: -40, bottom: -40, width: 2, background: 'rgba(178,40,40,0.5)' }} />
        {[1180, 1420, 1660].map((x) => (
          <div key={x} style={{ position: 'absolute', left: x, top: -40, bottom: -40, width: 1.5, background: 'rgba(52,92,150,0.25)' }} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${alpha(color, 0.55)} 0%, ${alpha(color, 0)} 80%), radial-gradient(ellipse 95% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.18) 100%)` }} />
    </AbsoluteFill>
  );
};

/** A projector gate: the frame's light in the middle, sprocket strips, weave, flicker, dust and a scratch now and then. */
const FilmGate: React.FC<{ color: string; f: number; seed: string }> = ({ color, f, seed }) => {
  const weaveX = (random(`fgx${seed}${Math.floor(f / 2)}`) - 0.5) * 2.2;
  const weaveY = (random(`fgy${seed}${Math.floor(f / 2)}`) - 0.5) * 3;
  const flick = 0.9 + random(`fgf${seed}${f}`) * 0.12;
  const scratch = random(`fgs${seed}${Math.floor(f / 5)}`) < 0.35;
  const sx = random(`fgsx${seed}${Math.floor(f / 5)}`) * 1500 + 200;
  const specks = Array.from({ length: 7 }, (_, k) => ({
    x: random(`fsx${seed}${f}${k}`) * W,
    y: random(`fsy${seed}${f}${k}`) * H,
    r: 1 + random(`fsr${seed}${f}${k}`) * 3,
    on: random(`fso${seed}${f}${k}`) < 0.5,
  }));
  const sprocket = 'repeating-linear-gradient(180deg, transparent 0 34px, rgba(236,228,210,0.13) 34px 70px, transparent 70px 90px)';
  return (
    <AbsoluteFill style={{ background: color, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${weaveX}px, ${weaveY}px)` }}>
        {/* The projected frame: warm light, falling off to the gate's edges. */}
        <div style={{ position: 'absolute', left: 150, right: 150, top: 60, bottom: 60, borderRadius: 26, background: `radial-gradient(ellipse 70% 70% at 50% 46%, rgba(205,192,168,${0.2 * flick}) 0%, rgba(120,110,95,${0.1 * flick}) 55%, rgba(0,0,0,0) 100%)`, boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.75)' }} />
        <div style={{ position: 'absolute', left: 38, width: 56, top: 0, bottom: 0, backgroundImage: sprocket, backgroundPosition: `0 ${(f * 3) % 90}px`, borderRadius: 6 }} />
        <div style={{ position: 'absolute', right: 38, width: 56, top: 0, bottom: 0, backgroundImage: sprocket, backgroundPosition: `0 ${(f * 3) % 90}px`, borderRadius: 6 }} />
      </AbsoluteFill>
      {scratch ? <div style={{ position: 'absolute', left: sx, top: 0, bottom: 0, width: 1.5, background: 'rgba(230,222,205,0.22)' }} /> : null}
      {specks.map((s, k) => (s.on ? <div key={k} style={{ position: 'absolute', left: s.x, top: s.y, width: s.r, height: s.r * (1 + (k % 3)), borderRadius: '50%', background: 'rgba(235,228,212,0.3)' }} /> : null))}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 85% 85% at 50% 50%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%)' }} />
    </AbsoluteFill>
  );
};

export const GroundFill: React.FC<{ backdrop: Backdrop; genre: Genre; blurSrc?: SceneLook['blurSrc']; seed?: string; durFrames?: number }> = ({ backdrop, genre, blurSrc, seed = 'g', durFrames }) => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const b = backdrop;
  const c1 = b.color ?? genre.bg;
  const c2 = b.color2 ?? genre.accent;
  const drift = (f % 3600) / 3600;

  if (b.kind === 'solid') {
    const hi = isLight(c1) ? mix(c1, '#ffffff', 0.35) : mix(c1, '#ffffff', 0.07);
    const lo = isLight(c1) ? mix(c1, '#000000', 0.08) : mix(c1, '#000000', 0.35);
    return <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 75% at ${46 + Math.sin(f / 90) * 4}% 42%, ${hi} 0%, ${c1} 55%, ${lo} 100%)` }} />;
  }

  if (b.kind === 'gradient') {
    const x = 30 + Math.sin(f / 70) * 18;
    const y = 35 + Math.cos(f / 95) * 14;
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 85% at ${x}% ${y}%, ${c1} 0%, ${alpha(c1, 0)} 70%), radial-gradient(ellipse 60% 70% at ${100 - x * 0.6}% ${90 - y * 0.4}%, ${alpha(mix(c1, c2, 0.5), 0.55)} 0%, ${alpha(c2, 0)} 70%), linear-gradient(${150 + Math.sin(f / 120) * 8}deg, ${mix(c1, c2, 0.35)} 0%, ${c2} 100%)`,
        }}
      />
    );
  }

  if (b.kind === 'paper' || b.kind === 'texture') {
    const url = bake(b.kind, c1);
    const light = isLight(c1);
    const lx = 35 + Math.sin(f / 110) * 20;
    return (
      <AbsoluteFill style={{ background: c1 }}>
        {url ? <AbsoluteFill style={{ backgroundImage: `url(${url})`, backgroundSize: `${W}px ${H}px`, transform: `scale(${1.04 + drift * 0.01})` }} /> : null}
        {/* Light across the sheet, edges falling off like a print under a lamp. */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 75% 70% at ${lx}% 38%, rgba(255,255,255,${light ? 0.2 : 0.07}) 0%, rgba(255,255,255,0) 60%), radial-gradient(ellipse 95% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,${light ? 0.16 : 0.45}) 100%)`,
          }}
        />
      </AbsoluteFill>
    );
  }

  if (b.kind === 'blueprint') {
    const line = c2;
    const s = (f * 0.25) % 120;
    return (
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 85% 80% at 50% 45%, ${mix(c1, '#ffffff', 0.08)} 0%, ${c1} 60%, ${mix(c1, '#000000', 0.35)} 100%)` }}>
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${alpha(line, 0.22)} 1.5px, transparent 1.5px), linear-gradient(90deg, ${alpha(line, 0.22)} 1.5px, transparent 1.5px), linear-gradient(${alpha(line, 0.08)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(line, 0.08)} 1px, transparent 1px)`,
            backgroundSize: '120px 120px, 120px 120px, 24px 24px, 24px 24px',
            backgroundPosition: `${s}px ${s * 0.5}px, ${s}px ${s * 0.5}px, ${s}px ${s * 0.5}px, ${s}px ${s * 0.5}px`,
          }}
        />
        {/* Registration marks in the corners. */}
        <AbsoluteFill style={{ border: `2px solid ${alpha(line, 0.35)}`, margin: 44, boxSizing: 'border-box' }} />
      </AbsoluteFill>
    );
  }

  if (b.kind === 'halftone') {
    const s = (f * 0.3) % 22;
    const dot = (r: number) => `radial-gradient(circle, ${alpha(c2, 0.55)} ${r}px, transparent ${r + 0.8}px)`;
    const mask = (dir: string) => `linear-gradient(${dir}, #000 0%, rgba(0,0,0,0.6) 35%, transparent 75%)`;
    return (
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 80% at 50% 45%, ${mix(c1, '#ffffff', isLight(c1) ? 0.3 : 0.06)} 0%, ${c1} 65%)` }}>
        <AbsoluteFill style={{ backgroundImage: dot(5.5), backgroundSize: '22px 22px', backgroundPosition: `${s}px ${s}px`, WebkitMaskImage: mask('125deg'), maskImage: mask('125deg') }} />
        <AbsoluteFill style={{ backgroundImage: dot(2.6), backgroundSize: '22px 22px', backgroundPosition: `${s + 11}px ${s + 11}px`, WebkitMaskImage: mask('305deg'), maskImage: mask('305deg'), opacity: 0.8 }} />
      </AbsoluteFill>
    );
  }

  if (b.kind === 'split-color') {
    const edge = 38 + Math.sin(f / 80) * 1.5;
    // The field is a deeper shade of its colour, so type in the look's accent still reads across it.
    const field = splitField(c1, c2);
    return (
      <AbsoluteFill style={{ background: c2 }}>
        <AbsoluteFill style={{ background: `linear-gradient(105deg, ${field} 0%, ${mix(field, '#000000', 0.12)} ${edge}%, transparent ${edge + 0.05}%)` }} />
        <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 80% at 70% 50%, ${alpha(mix(c2, '#ffffff', 0.1), 0.9)} 0%, ${alpha(c2, 0)} 70%)` }} />
      </AbsoluteFill>
    );
  }

  if (b.kind === 'related') return <RelatedGround backdrop={b} genre={genre} src={blurSrc} durFrames={durFrames ?? durationInFrames} seed={seed} />;
  if (b.kind === 'era') {
    if (b.variant === 'film') return <FilmGate color={c1} f={f} seed={seed} />;
    if (b.variant === 'ledger') return <Ledger color={c1} f={f} />;
    return <Newsprint color={c1} f={f} />;
  }

  if (b.kind === 'blur') {
    const src = blurSrc?.image;
    const clip = src ? undefined : clipOf(blurSrc);
    const z = interpolate(f, [0, Math.max(1, durationInFrames)], [1.3, 1.36]);
    const K = 4;
    return (
      <AbsoluteFill style={{ background: genre.bg, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
        {src || clip ? (
          <div style={{ width: W / K, height: H / K, flexShrink: 0, transform: `translate(${Math.sin(f / 90) * 30}px, 0) scale(${K * z})` }}>
            <Media src={src} clip={clip} durFrames={18000} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(9px) saturate(1.2) brightness(0.78)' }} />
          </div>
        ) : null}
        {/* Kartal Yuvası 950730, 29 Ekim 2026: brightness 0.62 + a 0.35 multiply + a 0.5 ring read as black; held down gently now. */}
        {b.color ? <AbsoluteFill style={{ background: b.color, opacity: 0.2, mixBlendMode: 'multiply' }} /> : null}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.36) 100%)' }} />
      </AbsoluteFill>
    );
  }

  void seed;
  return <AbsoluteFill style={{ background: c1 }} />;
};
