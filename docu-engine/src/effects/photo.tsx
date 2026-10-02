import React from 'react';
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { CARD_PAD, Media, SoftPlate } from '../fx';
import type { Clip } from '../fx';
import type { CameraKind } from '../types';
import type { SceneFxState } from './context';

/*
 * FIT + CAMERA for a scene's full-frame picture.
 *
 * fx.tsx <Photo> hands over here when the scene carries the new camera system
 * (SceneFxContext.camera set): the picture is either COVER-cropped around its
 * focus or shown whole (CONTAIN) on a soft extension of itself, and one of the
 * camera vocabulary's moves runs on it. Every move is computed in frame
 * space and clamped so the picture always covers the frame (cover) or stays
 * whole inside it (contain): no edge is ever shown by accident, and nothing is
 * magnified past ~2x its own pixels.
 */

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const c01 = (v: number) => Math.min(1, Math.max(0, v));

export interface CameraPhotoProps {
  src: string;
  durFrames: number;
  natural?: boolean;
  focus?: [number, number];
  speed?: number;
  reframes?: number[];
  tight?: number;
  aims?: [number, number][];
  imgW?: number;
  imgH?: number;
  safeH?: number;
  clip?: Clip;
  crop?: number;
  cam: SceneFxState;
}

/** Smooth, seeded, low-frequency noise in -1..1 (sum of detuned sines): a camera operator, not a jitter. */
export function smoothNoise(f: number, seed: string): number {
  const a = random(`${seed}a`) * 6.28;
  const b = random(`${seed}b`) * 6.28;
  const c = random(`${seed}c`) * 6.28;
  return (Math.sin(f / 23 + a) * 0.55 + Math.sin(f / 13.7 + b) * 0.3 + Math.sin(f / 7.3 + c) * 0.15) / 1.0;
}

/** Where the move lands: on the scene's main word when it falls in the back half, else at the end. */
function moveEnd(cam: SceneFxState, durFrames: number): number {
  const h = cam.hit;
  if (h !== null && h >= durFrames * 0.4 && h <= durFrames * 0.95) return Math.max(12, h + 4);
  return Math.max(12, durFrames);
}

const easeMove = Easing.bezier(0.45, 0, 0.3, 1);

/* ------------------------------------------------------------------ cover */

interface CoverState {
  S: number;
  px: number;
  py: number;
  tx: number;
  ty: number;
  rot: number;
  /** transform-origin in frame px (the focus as drawn). */
  ox: number;
  oy: number;
}

function coverGeometry(iw: number | undefined, ih: number | undefined) {
  if (!iw || !ih) return { c: 1, dw: W, dh: H, known: false };
  const c = Math.max(W / iw, H / ih);
  return { c, dw: iw * c, dh: ih * c, known: true };
}

/** Frame-space position of picture point (u, v) under cover with object-position (px, py). */
function coverPoint(g: { dw: number; dh: number }, px: number, py: number, u: number, v: number): [number, number] {
  return [(W - g.dw) * px + u * g.dw, (H - g.dh) * py + v * g.dh];
}

/** Clamp a translation so a layer scaled by S about (ox, oy) still covers the frame. */
function clampT(S: number, ox: number, oy: number, tx: number, ty: number, rotDeg = 0): [number, number] {
  // A small roll eats into the overscan: keep room for it.
  const r = Math.abs((rotDeg * Math.PI) / 180);
  const need = r * (W / 2 + H / 2);
  const x0 = -(S - 1) * (W - ox) + need;
  const x1 = (S - 1) * ox - need;
  const y0 = -(S - 1) * (H - oy) + need;
  const y1 = (S - 1) * oy - need;
  return [x1 < x0 ? 0 : Math.min(x1, Math.max(x0, tx)), y1 < y0 ? 0 : Math.min(y1, Math.max(y0, ty))];
}

function coverCamera(
  kind: CameraKind,
  o: { f: number; dur: number; end: number; speed: number; fc: [number, number]; g: ReturnType<typeof coverGeometry>; clip: boolean; maxS: number; seed: string },
): CoverState {
  const { f, dur, end, fc, g, clip, maxS, seed } = o;
  const a = Math.min(2.4, Math.max(0.12, o.speed));
  const t = c01(f / end);
  const e = easeMove(t);
  const lin = c01(f / Math.max(1, dur));
  const k = clip ? 0.55 : 1; // footage already moves: gentler
  let S = 1.02;
  let px = fc[0];
  let py = fc[1];
  let tx = 0;
  let ty = 0;
  let rot = 0;
  const slackX = g.dw - W;
  const slackY = g.dh - H;
  switch (kind) {
    case 'static':
      S = 1.015 + 0.012 * lin;
      break;
    case 'drift': {
      S = 1.055 + 0.015 * lin;
      const dir = fc[0] >= 0.5 ? 1 : -1;
      const A = (18 + 14 * a) * k;
      tx = interpolate(e, [0, 1], [dir * A, -dir * A]);
      ty = interpolate(e, [0, 1], [A * 0.25, -A * 0.25]);
      break;
    }
    case 'push-in':
    case 'rack-focus':
    case 'parallax': {
      const to = Math.min(maxS, 1.02 + (kind === 'push-in' ? 0.15 : 0.07) * a * k);
      S = interpolate(e, [0, 1], [1.02, to]) + 0.008 * lin;
      break;
    }
    case 'pull-out': {
      const from = Math.min(maxS, 1.05 + 0.16 * a * k);
      S = interpolate(e, [0, 1], [from, 1.025]);
      break;
    }
    case 'pan-left':
    case 'pan-right': {
      // pan-right: the camera travels right (content slides left), ending with the subject framed.
      const dir = kind === 'pan-right' ? 1 : -1;
      S = 1.07 + 0.01 * lin;
      const travel = Math.min(1, 0.55 + 0.25 * a);
      if (slackX > 40) {
        const endP = c01(fc[0]);
        const startP = c01(endP - dir * travel);
        px = interpolate(e, [0, 1], [startP, endP]);
      }
      const A = (S - 1) * W * 0.45 * k;
      tx = interpolate(e, [0, 1], [dir * A, -dir * A]);
      break;
    }
    case 'tilt-up':
    case 'tilt-down': {
      // tilt-up: the camera rises (content slides down), ending on the focus.
      const dir = kind === 'tilt-up' ? -1 : 1;
      S = 1.07 + 0.01 * lin;
      const travel = Math.min(1, 0.55 + 0.25 * a);
      if (slackY > 30) {
        const endP = c01(fc[1]);
        const startP = c01(endP - dir * travel);
        py = interpolate(e, [0, 1], [startP, endP]);
      }
      const A = (S - 1) * H * 0.45 * k;
      ty = interpolate(e, [0, 1], [dir * A, -dir * A]);
      break;
    }
    case 'detail-punch':
      S = 1.03 + 0.02 * lin;
      break;
    case 'handheld': {
      S = 1.06 + 0.02 * lin;
      const amp = (7 + 5 * a) * k;
      tx = smoothNoise(f, `${seed}hx`) * amp;
      ty = smoothNoise(f + 40, `${seed}hy`) * amp * 0.7;
      rot = smoothNoise(f + 80, `${seed}hr`) * 0.3 * k;
      break;
    }
  }
  const [ox, oy] = coverPoint(g, px, py, fc[0], fc[1]);
  return { S, px, py, tx, ty, rot, ox, oy };
}

/* ----------------------------------------------------------- two layers */

/**
 * 2.5D split of a flat still: the same picture twice, the upper copy masked
 * to a feathered ellipse around the focus. The two copies move (parallax),
 * swell (dolly zoom) or focus (rack focus) against each other.
 */
function splitLayers(
  kind: 'parallax' | 'rack-focus' | 'dolly-zoom',
  o: { f: number; dur: number; hit: number | null; fps: number; speed: number; ox: number; oy: number },
): { bg: React.CSSProperties; fg: React.CSSProperties; mask: string } {
  const { f, dur, fps, ox, oy } = o;
  const a = Math.min(1.5, Math.max(0.6, o.speed));
  const t = c01(f / Math.max(1, dur));
  const mask = `radial-gradient(ellipse 30% 44% at ${ox}px ${oy}px, #000 0%, #000 52%, rgba(0,0,0,0.55) 72%, transparent 100%)`;
  const transformOrigin = `${ox}px ${oy}px`;
  if (kind === 'parallax') {
    const d = 26 * a * easeMove(t);
    return {
      bg: { transformOrigin, transform: `translateX(${-d * 0.6}px) scale(${1 + 0.01 * t})`, filter: 'blur(1.2px) brightness(0.93)' },
      fg: { transformOrigin, transform: `translateX(${d * 0.7}px) scale(${1.03 + 0.03 * t})` },
      mask,
    };
  }
  if (kind === 'dolly-zoom') {
    const e = easeMove(t);
    return {
      bg: { transformOrigin, transform: `scale(${1 + 0.16 * a * e})`, filter: `blur(${(0.4 + 1.4 * e).toFixed(2)}px) brightness(${1 - 0.08 * e})` },
      fg: { transformOrigin, transform: `scale(${1.02 - 0.015 * e})` },
      mask,
    };
  }
  // rack focus: background sharp, subject soft, then the focus pulls onto the subject.
  const at = o.hit !== null && o.hit > 0.5 * fps && o.hit < dur - 0.5 * fps ? o.hit - 6 : Math.round(Math.min(dur * 0.35, 1.2 * fps));
  const p = interpolate(f, [at, at + Math.round(0.6 * fps)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const bgBlur = 5.5 * p;
  const fgBlur = 6 * (1 - p);
  return {
    bg: { filter: `blur(${bgBlur.toFixed(2)}px) brightness(${1 - 0.07 * p})`, transform: `scale(${1 + 0.01 * p})` },
    fg: { filter: fgBlur > 0.15 ? `blur(${fgBlur.toFixed(2)}px)` : undefined },
    mask,
  };
}

/* ---------------------------------------------------------------- render */

export const CameraPhoto: React.FC<CameraPhotoProps> = ({
  src,
  durFrames,
  natural,
  focus,
  speed = 1,
  reframes = [],
  tight = 1.28,
  aims = [],
  imgW,
  imgH,
  safeH,
  clip,
  crop,
  cam,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fc: [number, number] = focus ?? [0.5, 0.3];
  const grade = natural ? 'contrast(1.06) saturate(1.05)' : 'url(#duo)';
  const srcW = clip ? clip.w ?? imgW : imgW;
  const srcH = clip ? clip.h ?? imgH : imgH;
  const kind: CameraKind = cam.camera ?? 'push-in';
  // Energy scales a derived camera: 1 barely moves, 5 pushes hard (and lands earlier).
  speed = speed * cam.camGain;
  const end = cam.energy >= 4 && cam.hit === null ? Math.max(12, Math.round(durFrames * (cam.energy === 5 ? 0.55 : 0.75))) : moveEnd(cam, durFrames);
  const seed = `${cam.seed}cam`;

  if (cam.fit === 'contain' && srcW && srcH) {
    return (
      <Contained
        src={src}
        clip={clip}
        durFrames={durFrames}
        natural={natural}
        grade={grade}
        fc={fc}
        iw={srcW}
        ih={srcH}
        safeH={safeH}
        kind={kind}
        f={f}
        end={end}
        speed={speed}
        seed={seed}
        cam={cam}
      />
    );
  }

  const g = coverGeometry(srcW, srcH);
  // Never past ~2x the source's own pixels (unknown size: an AI still, 1536 wide).
  const coverScale = g.known ? g.c : W / 1536;
  const maxS = Math.max(1.06, (clip ? 1.6 : 2) / Math.max(0.5, coverScale));
  const st = coverCamera(kind, { f, dur: durFrames, end, speed, fc, g, clip: !!clip, maxS, seed });

  // A borrowed still is a tighter region of itself.
  const kc = !clip && crop && crop > 1 ? Math.min(crop, 1.8) : 1;
  // Cut-ins (detail-punch, and drift on a long hold): tight on the focus, back out on the next.
  const passed = reframes.filter((r) => f >= r).length;
  const isTight = passed % 2 === 1;
  const aim = isTight ? aims[passed - 1] ?? [0, 0] : [0, 0];
  const last = passed ? reframes[passed - 1] : -99;
  const settle = passed ? interpolate(f - last, [0, 3], [1.03, 1], clamp) : 1;
  const cut = isTight ? Math.min(tight, maxS / Math.max(1, st.S)) : 1;
  const S = st.S * kc * cut * settle;
  let ox = st.ox;
  let oy = st.oy;
  if (isTight) {
    const [ax, ay] = coverPoint(g, st.px, st.py, c01(fc[0] + aim[0]), c01(fc[1] + aim[1]));
    ox = ax;
    oy = ay;
  }
  const [tx, ty] = clampT(S, ox, oy, st.tx, st.ty, st.rot);
  const base: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${st.px * 100}% ${st.py * 100}%`,
    transformOrigin: `${ox}px ${oy}px`,
    transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${st.rot.toFixed(3)}deg) scale(${S.toFixed(5)})`,
  };

  // Depth tricks need a still (a masked second copy of footage would double the decode).
  const split: 'parallax' | 'rack-focus' | 'dolly-zoom' | null = clip
    ? null
    : kind === 'parallax'
      ? 'parallax'
      : kind === 'rack-focus'
        ? 'rack-focus'
        : cam.fx.has('dolly-zoom')
          ? 'dolly-zoom'
          : null;
  if (split) {
    const L = splitLayers(split, { f, dur: durFrames, hit: cam.hit, fps, speed, ox: ox + tx, oy: oy + ty });
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        <AbsoluteFill style={L.bg}>
          <Media src={src} durFrames={durFrames} style={{ ...base, filter: grade }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ ...L.fg, WebkitMaskImage: L.mask, maskImage: L.mask }}>
          <Media src={src} durFrames={durFrames} style={{ ...base, filter: grade }} />
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <Media src={src} clip={clip} durFrames={durFrames} style={{ ...base, filter: grade }} />
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- contain */

/**
 * The whole picture, never cropped: a sharp print on a soft, dim, moving copy
 * of itself (a paper print on the board in collage genres). The camera moves
 * the print within the frame and grows it at most until it meets the frame's
 * safe edge, and never past 1.5x its pixels (footage: 2x).
 */
const Contained: React.FC<{
  src: string;
  clip?: Clip;
  durFrames: number;
  natural?: boolean;
  grade: string;
  fc: [number, number];
  iw: number;
  ih: number;
  safeH?: number;
  kind: CameraKind;
  f: number;
  end: number;
  speed: number;
  seed: string;
  cam: SceneFxState;
}> = ({ src, clip, durFrames, natural, grade, fc, iw, ih, safeH, kind, f, end, speed, seed, cam }) => {
  const collage = cam.genre.collage;
  const pad = collage ? CARD_PAD : null;
  const maxUp = clip ? 2 : 1.5;
  const availH = (safeH ?? H * 0.86) - (pad ? pad.side + pad.bottom : 0);
  const availW = W * 0.9 - (pad ? 2 * pad.side : 0);
  const fit = Math.min(availW / iw, availH / ih);
  const shown = Math.min(fit, maxUp);
  const rw = iw * shown;
  const rh = ih * shown;
  // Growth room: the pixel cap, and the frame (the print never leaves its safe area).
  const room = Math.max(1, Math.min(maxUp / shown, fit / shown));
  const a = Math.min(2.4, Math.max(0.12, speed));
  const e = easeMove(c01(f / end));
  const lin = c01(f / Math.max(1, durFrames));
  let s = 1;
  let tx = 0;
  let ty = 0;
  let rot = 0;
  const freeX = Math.max(0, (W - rw * room) / 2 - 24);
  const freeY = Math.max(0, (H - rh * room) / 2 - 24);
  switch (kind) {
    case 'static':
      s = 1 + Math.min(room - 1, 0.01) * lin;
      break;
    case 'drift':
    case 'pan-left':
    case 'pan-right': {
      const dir = kind === 'pan-left' ? -1 : kind === 'pan-right' ? 1 : fc[0] >= 0.5 ? 1 : -1;
      const A = Math.min(freeX, 14 + 12 * a);
      tx = interpolate(e, [0, 1], [dir * A, -dir * A]);
      s = 1 + Math.min(room - 1, 0.02) * lin;
      break;
    }
    case 'tilt-up':
    case 'tilt-down': {
      const dir = kind === 'tilt-up' ? -1 : 1;
      const A = Math.min(freeY, 10 + 8 * a);
      ty = interpolate(e, [0, 1], [dir * A, -dir * A]);
      s = 1 + Math.min(room - 1, 0.02) * lin;
      break;
    }
    case 'pull-out':
      s = interpolate(e, [0, 1], [1 + Math.min(room - 1, 0.1 * a), 1]);
      break;
    case 'handheld':
      tx = smoothNoise(f, `${seed}hx`) * Math.min(freeX, 5);
      ty = smoothNoise(f + 40, `${seed}hy`) * Math.min(freeY, 4);
      s = 1 + Math.min(room - 1, 0.03) * lin;
      break;
    default:
      // push-in, detail-punch, parallax, rack-focus: a clean push onto the focus, capped by the room.
      s = interpolate(e, [0, 1], [1, 1 + Math.min(room - 1, 0.1 * a)]);
  }
  const tilt = collage ? (random(`${seed}tilt`) - 0.5) * 2.4 : 0;
  rot = tilt;
  const outerW = rw + (pad ? 2 * pad.side : 0);
  const outerH = rh + (pad ? pad.side + pad.bottom : 0);
  return (
    <AbsoluteFill>
      <SoftPlate src={src} natural={natural} durFrames={durFrames} clip={clip} focus={fc} dim={collage ? 0.34 : 0.42} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            width: Math.round(outerW),
            height: Math.round(outerH),
            flexShrink: 0,
            boxSizing: 'border-box',
            padding: pad ? `${pad.side}px ${pad.side}px ${pad.bottom}px` : 0,
            background: pad ? cam.genre.paper : undefined,
            transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(5)})`,
            transformOrigin: `${(fc[0] * 100).toFixed(1)}% ${(fc[1] * 100).toFixed(1)}%`,
            boxShadow: pad ? '0 28px 60px rgba(0,0,0,0.6), 0 3px 0 rgba(0,0,0,0.2)' : '0 30px 90px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)',
          }}
        >
          <Media src={src} clip={clip} durFrames={durFrames} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: grade }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
