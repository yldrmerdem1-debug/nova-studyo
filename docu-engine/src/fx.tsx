import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
// @ts-ignore -- plain ESM shared with Node: the ONE full-bleed rule (effects/variety.js fullBleedOK).
import * as varietyFit from './effects/variety.js';
const { isLowResFootage, isLowResStill } = varietyFit as unknown as { isLowResFootage: (w?: number, h?: number) => boolean; isLowResStill: (w?: number, h?: number) => boolean };
import {
  AbsoluteFill,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  continueRender,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { Genre, Pattern, TransitionKind, VideoRef } from './types';
import { useSceneFx } from './effects/context';
import { CameraPhoto } from './effects/photo';
import { speedRampMap } from './effects/timing';
import { DEFAULT_LOOK, useLook } from './looks/context';
import { useTopic } from './topic/context';
import { MotifTexture } from './topic/motifs';
import { applyGrade, gradeFilter } from './looks/grades';
import { globalVignette } from './looks/resolve';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/* ================================================================== colour */

function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * SVG duotone: desaturate, lift contrast, then map black -> shadow colour and
 * white -> highlight colour. Keeps every photo inside the subject's palette.
 */
export const DuotoneDefs: React.FC<{ id: string; shadow: string; highlight: string; contrast?: number }> = ({
  id,
  shadow,
  highlight,
  contrast = 1.3,
}) => {
  const [r0, g0, b0] = hexToRgb01(shadow);
  const [r1, g1, b1] = hexToRgb01(highlight);
  const intercept = -(contrast - 1) / 2;
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <filter id={id} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer>
          <feFuncR type="linear" slope={contrast} intercept={intercept} />
          <feFuncG type="linear" slope={contrast} intercept={intercept} />
          <feFuncB type="linear" slope={contrast} intercept={intercept} />
        </feComponentTransfer>
        <feComponentTransfer>
          <feFuncR type="table" tableValues={`${r0} ${r1}`} />
          <feFuncG type="table" tableValues={`${g0} ${g1}`} />
          <feFuncB type="table" tableValues={`${b0} ${b1}`} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
};

/**
 * Chromatic aberration: split R and B channels sideways. Spiked for a few
 * frames on every impact — the lens "flinches" with the hit. Rendered per
 * frame so the offset can animate.
 */
export const ChromaticDefs: React.FC<{ id: string; amount: number }> = ({ id, amount }) => (
  <svg width="0" height="0" style={{ position: 'absolute' }}>
    <filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
      <feOffset in="r" dx={amount} dy={0} result="r2" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
      <feOffset in="b" dx={-amount} dy={0} result="b2" />
      <feBlend in="r2" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="b2" mode="screen" />
    </filter>
  </svg>
);

/* ================================================================= photos */

/**
 * Archive scans arrive at any size and shape (docu-archive only caps the
 * width). A portrait, or anything under ~1400 px wide, cover-cropped to 16:9
 * loses the head and gets blown up 3-4x — it reads as a mistake. Those are
 * shown whole on a soft plate instead. Unknown size = a normal still.
 */
export function isLowRes(w?: number, h?: number): boolean {
  // The full-bleed rule (effects/variety.js fullBleedOK): portrait/square/panorama, or > 1.9x upscale to cover.
  return isLowResStill(w, h);
}

/**
 * Remotion's <Img> cancels the WHOLE render after two failed retries. One
 * missing or corrupt file must cost a scene its picture, not a 10-minute
 * render: after the retries the image drops out and whatever the caller put
 * behind it (the genre pattern background) shows through.
 */
const SafeImg: React.FC<{ src: string; style?: React.CSSProperties; fallback?: React.ReactNode }> = ({
  src,
  style,
  fallback = null,
}) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <>{fallback}</>;
  return (
    <Img
      src={staticFile(src)}
      style={style}
      onError={() => {
        console.warn(`[docu] görsel yüklenemedi, desen zemine geçildi: ${src}`);
        setFailed(true);
      }}
    />
  );
};

/* ================================================================ footage */

/**
 * A clip as the engine plays it: seconds into the file where the shot starts
 * and where usable footage ends, its pixel size and a still frame of it.
 */
export interface Clip {
  src: string;
  start: number;
  /** Usable end, seconds into the file; Infinity when the pipeline did not say. */
  end: number;
  w?: number;
  h?: number;
  /** A still frame of the clip: the error fallback and the tail hold. */
  still?: string;
  /**
   * Midtone gamma (> 1 opens it up) for footage that would read near-black:
   * the pipeline lifted its still (`*.lift.jpg`, liftIfDark) and the clip gets
   * the same lift on screen — blacks stay black, the midtones open.
   */
  lift?: number;
  /** Real footage (steadyFootage): played as filmed — no camera push, sway, cut-in or shake on it. */
  steady?: boolean;
}

/**
 * REAL FOOTAGE PLAYS STILL (channel owner, Oct 2026: "videolar gözükürken ekran titremesin, izleyen düzgünce izlesin").
 * An archive or source clip (an eyewitness phone video, a news clip, the person's own words) already moves; the
 * engine's tense-scene sway, impact shake, push and cut-ins on top of it made it hard to watch. Generated motion (an
 * AI still brought to life) keeps the camera.
 */
export function steadyFootage(o?: { video?: string; archived?: boolean; sourceLabel?: string; sourceVoice?: unknown } | null): boolean {
  return !!o?.video && !!(o.archived || o.sourceLabel || o.sourceVoice);
}

/** The clip a scene (or a montage cut / extra card) carries, or undefined when it is a still. */
export function clipOf(o?: Partial<VideoRef> | null, still?: string): Clip | undefined {
  if (!o?.video) return undefined;
  const start = Math.max(0, Number(o.videoStart) || 0);
  const d = Number(o.videoDur);
  let end = Infinity;
  // videoDur is the usable END time in the file; a value not past the start can only be a length.
  if (Number.isFinite(d) && d > 0) end = d > start + 0.25 ? d : start + d;
  const st = o.image ?? still;
  // ENGINE GUARD: a clip whose still had to be lifted is dark footage — lift the clip too (gamma from the pipeline, else a typical 1.65 — a still lifted at Y~33).
  const g = Number(o.liftGamma);
  const lift = g > 1.01 ? Math.min(1.9, g) : st && /\.lift\.jpg$/i.test(st) ? 1.65 : undefined;
  const steady = steadyFootage(o as Parameters<typeof steadyFootage>[0]);
  return { src: o.video, start, end, w: o.videoW, h: o.videoH, still: st, ...(lift ? { lift } : {}), ...(steady ? { steady } : {}) };
}

/**
 * Small or narrow footage is shown whole on a soft plate, like a small scan.
 * Footage is watched in motion and forgives more enlargement than a still:
 * 720p (1280 px) still fills the frame; 4:3, portrait and SD archive do not.
 */
export function isLowResClip(w?: number, h?: number): boolean {
  return isLowResFootage(w, h);
}
/** A contained clip may be enlarged up to this (a still: 1.5x). */
const CLIP_MAX_UP = 2;
/**
 * Slowest a clip is stretched to cover its scene; below that it holds its last
 * played frame with a push-in. 0.6x still reads as footage (a slow-motion
 * shot); at 0.75x a short clip under a long line froze for seconds.
 */
export const CLIP_MIN_RATE = 0.6;

/**
 * How a clip covers `durFrames`: at full speed when there is footage enough;
 * slowed (down to CLIP_MIN_RATE) when that covers the scene; otherwise it plays
 * at that rate for as long as it lasts (`play` frames) and then HOLDS its last
 * played frame with a slow push-in (a documentary freeze-frame). Never loops
 * and never asks for a frame past the usable end. `hold` is the file frame
 * the freeze shows.
 *
 * Why not dissolve into the scene's `image`: that still is the clip's frame
 * at videoStart, so a dissolve at the end replays the opening of the shot —
 * it reads exactly like a loop. The still is the error fallback only.
 */
export function clipTiming(clip: Clip, durFrames: number, fps: number): { rate: number; play: number; hold: number } {
  const from = Math.round(clip.start * fps);
  const avail = Number.isFinite(clip.end) ? Math.floor((clip.end - clip.start) * fps) - 1 : Infinity;
  if (avail >= durFrames) return { rate: 1, play: durFrames, hold: from };
  if (avail < 6) return { rate: 1, play: 0, hold: from };
  if (avail >= durFrames * CLIP_MIN_RATE) return { rate: avail / durFrames, play: durFrames, hold: from };
  const play = Math.floor(avail / CLIP_MIN_RATE);
  return { rate: CLIP_MIN_RATE, play, hold: from + Math.floor((play - 1) * CLIP_MIN_RATE) };
}
/** A pinned frame is asked for at hold + (tail frames x this): < 0.5 file frame over a 10-minute hold. */
const FREEZE_RATE = 0.00002;

/**
 * <OffthreadVideo> with an onError leaves its "Fetching …" delayRender handle
 * open (Remotion 4.0.529), so the frame would wait out the whole timeout and
 * cancel the render anyway. Once the fallback is on screen, release them.
 */
function releaseStuckFetches(src: string) {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { remotion_delayRenderTimeouts?: Record<string, { label?: string | null }> };
  const key = encodeURIComponent(encodeURIComponent(src.split('/').pop() ?? src));
  const plain = encodeURIComponent(src.split('/').pop() ?? src);
  for (const [h, v] of Object.entries(w.remotion_delayRenderTimeouts ?? {})) {
    const label = v?.label ?? '';
    if (label.startsWith('Fetching ') && (label.includes(key) || label.includes(plain))) continueRender(Number(h));
  }
}

/**
 * Footage in place of a still, framed by the same style an <Img> would get:
 * objectFit/objectPosition go to the picture, everything else (size, the
 * camera transform, the grade filter) to a wrapper — so video and photos
 * share one grade and one camera. The clip only mounts while it plays; a
 * clip that fails to load is replaced by its still for the whole shot.
 */
const ClipMedia: React.FC<{ clip: Clip; still?: string; durFrames: number; style: React.CSSProperties }> = ({ clip, still, durFrames, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [failed, setFailed] = useState(false);
  // Speed ramp (effects): a time remap of the playing part, same footage, slow motion on the scene's hit.
  const sfx = useSceneFx(durFrames);
  // Real footage (clip.steady) runs at its own speed: no slow-motion ramp, no creeping push on its held tail.
  const rampPlay = sfx?.fx.has('speed-ramp') && !clip.steady ? clipTiming(clip, durFrames, fps).play : 0;
  // No real hit (effects/timing.ts mainHit is strict now) = no ramp: the clip plays at 1x instead of slowing at 45%.
  // Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026.
  const rampHit = sfx?.hit ?? null;
  const ramp = useMemo(() => (rampPlay > 8 && rampHit !== null ? speedRampMap(rampPlay, rampHit) : null), [rampPlay, rampHit]);
  // Stable identity: OffthreadVideo refetches its frame whenever onError changes.
  const onError = useCallback(
    (e: Error) => {
      console.warn(`[docu] video yüklenemedi, durağan kareye geçildi: ${clip.src} (${String(e?.message ?? e).slice(0, 160)})`);
      setFailed(true);
    },
    [clip.src],
  );
  // After the still's own load is registered (layout effect), free the dead fetch.
  useEffect(() => {
    if (failed) releaseStuckFetches(clip.src);
  }, [failed, clip.src]);
  const { objectFit, objectPosition, ...outer } = style;
  const wrap: React.CSSProperties = { position: 'relative', ...outer };
  const liftId = clip.lift ? `nv-lift-${Math.round(clip.lift * 100)}` : null;
  const layer: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    objectFit: objectFit ?? 'cover',
    objectPosition,
    display: 'block',
    ...(liftId ? { filter: `url(#${liftId})` } : {}),
  };
  // Dark footage: the same midtone gamma its still got (applied before the grade on the wrapper).
  const liftDefs = liftId ? (
    <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden>
      <filter id={liftId} colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="gamma" amplitude={1} exponent={1 / (clip.lift as number)} offset={0} />
          <feFuncG type="gamma" amplitude={1} exponent={1 / (clip.lift as number)} offset={0} />
          <feFuncB type="gamma" amplitude={1} exponent={1 / (clip.lift as number)} offset={0} />
        </feComponentTransfer>
      </filter>
    </svg>
  ) : null;
  if (failed) return <div style={wrap}>{still ? <SafeImg src={still} style={layer} /> : null}</div>;
  const t = clipTiming(clip, durFrames, fps);
  const from = Math.round(clip.start * fps);
  const holding = f >= t.play;
  // The freeze keeps creeping in, so a held frame never reads as a stalled render.
  const tailSec = Math.max(0, (durFrames - t.play) / fps);
  const push = holding && !clip.steady ? interpolate(f, [t.play, Math.max(t.play + 1, durFrames)], [1, 1 + Math.min(0.08, 0.025 * tailSec)], clamp) : 1;
  return (
    <div style={wrap}>
      {liftDefs}
      {holding ? (
        <Sequence from={t.play} layout="none">
          <OffthreadVideo
            src={staticFile(clip.src)}
            muted
            trimBefore={t.hold > 0 ? t.hold : undefined}
            playbackRate={FREEZE_RATE}
            onError={onError}
            delayRenderRetries={1}
            style={{ ...layer, transform: `scale(${push})`, transformOrigin: String(objectPosition ?? '50% 50%') }}
          />
        </Sequence>
      ) : (
        <Freeze frame={ramp ? Math.round(ramp[Math.min(ramp.length - 1, Math.max(0, f))]) : 0} active={!!ramp}>
          <OffthreadVideo
            src={staticFile(clip.src)}
            muted
            trimBefore={from > 0 ? from : undefined}
            playbackRate={t.rate}
            onError={onError}
            delayRenderRetries={1}
            style={layer}
          />
        </Freeze>
      )}
    </div>
  );
};

/**
 * The scene mood's colour shift (moods.json grade), provided by the Engine around one scene and read ONLY by the
 * pictures (Media, LayeredPhoto). Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: the mood filter wrapped
 * the whole scene — type, cards and devices went grey and dim with the photo on every dread/sad scene.
 */
export const PictureMoodContext = React.createContext<string>('');

/** A picture's filter with the mood shift appended (the mood never touches type). */
const withMood = (filter: string | undefined, mood: string): string | undefined => (mood ? [filter, mood].filter(Boolean).join(' ') : filter);

/** A still, or the clip when there is one — same framing, same grade. */
export const Media: React.FC<{ src?: string; clip?: Clip; durFrames: number; style: React.CSSProperties }> = ({ src, clip, durFrames, style: raw }) => {
  // The scene's grade (src/looks): the duotone reference is swapped for it; blur, brightness etc. stay.
  // No look at all (outside the Engine) = no grade = natural colour (grades.tsx NO_GRADE_FILTER), never the duotone.
  const look = useLook();
  const grade = look === DEFAULT_LOOK ? undefined : look.grade;
  const mood = useContext(PictureMoodContext);
  const graded = grade === 'duotone' ? (raw.filter as string | undefined) : applyGrade(raw.filter as string | undefined, grade);
  const filter = withMood(graded, mood);
  const style = filter === raw.filter ? raw : { ...raw, filter };
  return clip ? <ClipMedia clip={clip} still={clip.still ?? src} durFrames={durFrames} style={style} /> : <SafeImg src={src ?? ''} style={style} />;
};

/**
 * The same picture, blurred and darkened, filling the frame — the plate a
 * small or portrait scan sits on, and a chapter card's backdrop. Rendered at
 * quarter size and scaled up: a 30px blur on a full 1080p layer every frame
 * is one of the most expensive things Chrome can be asked to do; on a
 * 480x270 layer it is nearly free and looks the same.
 */
export const SoftPlate: React.FC<{
  src: string;
  natural?: boolean;
  /** Brightness multiplier, 0..1. */
  dim?: number;
  /** Blur in quarter-size px (x4 on screen). */
  blur?: number;
  /** Overscan; > 1.1 leaves room to aim the crop off-centre. */
  zoom?: number;
  /** Where the crop leans, 0..1 — lets a chapter card frame the next shot differently. */
  focus?: [number, number];
  /** Slow drift over the scene, so the plate is never a frozen frame. */
  durFrames?: number;
  /** Footage: the plate plays it (the proxy serves the same decoded frame to the sharp copy). */
  clip?: Clip;
}> = ({ src, natural, dim = 0.42, blur = 6, zoom = 1.12, focus = [0.5, 0.5], durFrames, clip }) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const K = 4;
  const z = zoom + (durFrames ? interpolate(f, [0, durFrames], [0, 0.05], clamp) : 0);
  // Stay inside the overscan with ~60px to spare, so the blur's soft edge never shows.
  const mx = Math.max(0, ((z - 1) * width) / 2 - 60);
  const my = Math.max(0, ((z - 1) * height) / 2 - 60);
  const tx = Math.max(-1, Math.min(1, (0.5 - focus[0]) * 2)) * mx;
  const ty = Math.max(-1, Math.min(1, (0.5 - focus[1]) * 2)) * my;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: width / K,
          height: height / K,
          flexShrink: 0,
          transform: `translate(${tx}px, ${ty}px) scale(${K * z})`,
        }}
      >
        <Media
          src={src}
          clip={clip}
          durFrames={durFrames ?? 18000}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: `${natural ? '' : 'url(#duo) '}blur(${blur}px) brightness(${dim})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/**
 * Full-bleed photo with a virtual camera: a slow push towards a focal point
 * (default: upper third, where faces sit) so nothing on screen is ever static.
 */
export const Photo: React.FC<{
  src: string;
  durFrames: number;
  natural?: boolean;
  focus?: [number, number];
  push?: number;
  /** Mood multiplier on how fast the camera creeps in. */
  speed?: number;
  /**
   * Frames where the edit "cuts in" on the same photo — tighter on the focal
   * point, then back out on the next one. How the reference keeps a 6-second
   * hold alive without changing the picture.
   */
  reframes?: number[];
  /** How tight a cut-in goes (seeded per scene by the caller, not one fixed 1.28). */
  tight?: number;
  /** Per cut-in: where it aims, as an offset from `focus` (face, lower third, a side). */
  aims?: [number, number][];
  /** Source pixel size. Portrait or small scans are shown whole on a soft plate. */
  imgW?: number;
  imgH?: number;
  /** Height a contained scan may use — less under letterbox bars, so they never cut a head. */
  safeH?: number;
  style?: React.CSSProperties;
  /**
   * Footage instead of the still (`src` stays its still frame). Same framing
   * and grade; a much gentler push (1.02 -> at most 1.06), since the footage
   * already moves; small/4:3 clips are contained on a soft plate of themselves.
   */
  clip?: Clip;
  /** Always cover-crop (a collage print is already cut to the picture's shape). */
  fill?: boolean;
  /**
   * Base zoom around `focus` (>= 1): a picture borrowed from another scene is
   * shown as a different, tighter region of itself, so the repeat reads as a
   * new shot. Contained scans ignore it (they never go past their pixels).
   */
  crop?: number;
}> = ({
  src,
  durFrames,
  natural,
  focus,
  push = 0.12,
  speed = 1,
  reframes = [],
  tight = 1.28,
  aims = [],
  imgW,
  imgH,
  safeH,
  style,
  clip,
  fill,
  crop,
}) => {
  const f = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // The scene's own full-frame picture under the camera system (fit + camera vocabulary): effects/photo.tsx.
  const cam = useSceneFx(durFrames, fill);
  // Real footage (clip.steady): no camera vocabulary, no push, no cut-ins — it plays as filmed.
  const steady = !!clip?.steady;
  if (cam?.camera && !steady) {
    return (
      <CameraPhoto
        src={src}
        durFrames={durFrames}
        natural={natural}
        focus={focus}
        speed={speed}
        reframes={reframes}
        tight={tight}
        aims={aims}
        imgW={imgW}
        imgH={imgH}
        safeH={safeH}
        clip={clip}
        crop={crop}
        cam={cam}
      />
    );
  }
  const t = interpolate(f, [0, durFrames], [0, 1], clamp);
  const grade = natural ? 'contrast(1.06) saturate(1.05)' : 'url(#duo)';
  // Default focus sits where heads are in a portrait crop; objectPosition uses it too, so a cover crop keeps the head.
  const fc = focus ?? [0.5, 0.3];
  const srcW = clip ? clip.w ?? imgW : imgW;
  const srcH = clip ? clip.h ?? imgH : imgH;

  if (!fill && (clip ? isLowResClip(srcW, srcH) : isLowRes(imgW, imgH))) {
    /*
     * Shown whole, and never above 1.5x its own pixels: a small sharp print
     * on a blurred copy of itself reads as a choice, a soft 3x blow-up as a
     * mistake. No cut-ins here (the caller skips them); only a gentle push
     * that is capped by the same 1.5x rule. Footage (4:3 archive, SD) may go
     * to 2x — it is watched in motion — and is pillarboxed on its own
     * blurred, moving copy, the way broadcast documentaries show old film.
     */
    const w0 = srcW!;
    const h0 = srcH!;
    const maxUp = clip ? CLIP_MAX_UP : 1.5;
    const fit = Math.min((width * 0.9) / w0, (safeH ?? height * 0.86) / h0);
    const shown = Math.min(fit, maxUp);
    const room = Math.max(1, maxUp / shown);
    const s = steady ? 1 : Math.min(1 + push * (clip ? 0.25 : 0.5) * speed * t, room);
    return (
      <AbsoluteFill>
        <SoftPlate src={src} natural={natural} durFrames={durFrames} clip={clip} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div
            style={{
              width: Math.round(w0 * shown),
              height: Math.round(h0 * shown),
              flexShrink: 0,
              transform: `scale(${s})`,
              transformOrigin: `50% ${fc[1] * 100}%`,
              boxShadow: '0 30px 90px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.1)',
            }}
          >
            <Media
              src={src}
              clip={clip}
              durFrames={durFrames}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: grade }}
            />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  const passed = steady ? 0 : reframes.filter((r) => f >= r).length;
  const isTight = passed % 2 === 1;
  const aim = isTight ? aims[passed - 1] ?? [0, 0] : [0, 0];
  const ox = clamp01(fc[0] + aim[0]) * 100;
  const oy = clamp01(fc[1] + aim[1]) * 100;
  // Each reframe lands with a tiny 3-frame settle, like a real cut-in.
  const last = passed ? reframes[passed - 1] : -99;
  const settle = interpolate(f - last, [0, 3], [1.03, 1], clamp);
  /*
   * Footage keeps 2% overscan (the engine's shake and sway must never reveal
   * an edge) and creeps at most to 1.06: a still's 16% push on top of a
   * moving shot reads as a zoom, not a camera.
   */
  const base = steady ? 1 : clip ? 1.02 + Math.min(0.04, push * 0.33 * speed) * t : 1.04 + push * speed * t;
  // A borrowed crop is already tight: its cut-ins go half as far, so the pair never over-magnifies.
  const k = crop && crop > 1 ? Math.min(crop, 1.8) : 1;
  const cut = isTight ? (k > 1 ? 1 + (tight - 1) * 0.5 : tight) : 1;
  const scale = base * k * cut * (passed ? settle : 1);
  return (
    <Media
      src={src}
      clip={clip}
      durFrames={durFrames}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectPosition: `${fc[0] * 100}% ${fc[1] * 100}%`,
        transformOrigin: `${ox}% ${oy}%`,
        transform: `scale(${scale})`,
        filter: grade,
        ...style,
      }}
    />
  );
};

/**
 * 2.5D: the clean plate and the cut-out subject move against each other, so
 * a still reads as a moment with depth. The background drifts one way and
 * sits slightly soft (shallow depth of field); the subject drifts the other
 * way, a touch larger, with a contact shadow. `behind` renders BETWEEN the
 * two layers — type tucked behind the person.
 */
export const LayeredPhoto: React.FC<{
  bg: string;
  fg: string;
  box: [number, number, number, number];
  durFrames: number;
  speed?: number;
  reframes?: number[];
  tight?: number;
  natural?: boolean;
  behind?: React.ReactNode;
}> = ({ bg, fg, box, durFrames, speed = 1, reframes = [], tight = 1.3, natural, behind }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, durFrames], [0, 1], clamp);
  const passed = reframes.filter((r) => f >= r).length;
  const isTight = passed % 2 === 1;
  const last = passed ? reframes[passed - 1] : -99;
  const settle = passed ? interpolate(f - last, [0, 3], [1.03, 1], clamp) : 1;
  const cut = (isTight ? tight : 1) * settle;
  // Aim cut-ins at the upper part of the subject — the face.
  const fx = ((box[0] + box[2]) / 2) * 100;
  const fy = (box[1] + (box[3] - box[1]) * 0.25) * 100;
  const origin = `${fx}% ${fy}%`;
  const look = useLook();
  const mood = useContext(PictureMoodContext);
  const graded = natural ? 'contrast(1.06)' : gradeFilter(look === DEFAULT_LOOK ? undefined : look.grade);
  const grade = withMood(graded, mood) ?? graded;
  const bgMove = interpolate(t, [0, 1], [-22, 22]) * speed;
  const fgMove = interpolate(t, [0, 1], [14, -30]) * speed;
  return (
    <AbsoluteFill style={{ transformOrigin: origin, transform: `scale(${cut})` }}>
      <SafeImg
        src={bg}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transformOrigin: origin,
          transform: `scale(${1.1 + 0.05 * speed * t}) translateX(${bgMove}px)`,
          filter: `${grade} blur(1.4px) brightness(0.88)`,
        }}
      />
      {behind}
      <SafeImg
        src={fg}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transformOrigin: origin,
          transform: `scale(${1.08 + 0.12 * speed * t}) translateX(${fgMove}px)`,
          filter: `${grade} drop-shadow(0 18px 28px rgba(0,0,0,0.55))`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Paper border of a PhotoCard: 14px on three sides, 38px at the bottom like a print. */
export const CARD_PAD = { side: 14, bottom: 38 } as const;

/**
 * A printed photo card — the collage building block of the reference style.
 * Paper border, a seeded tilt, a hard drop shadow, and it arrives: slides in
 * from off-frame with an overshoot, then keeps drifting. `width`/`height` are
 * the OUTER size of the print, so a layout can be checked against the frame.
 */
export const PhotoCard: React.FC<{
  src: string;
  seed: string;
  enterAt: number;
  durFrames: number;
  width: number;
  /** Outer height; the old fixed 0.72 ratio when the image shape is unknown. */
  height?: number;
  x: number;
  y: number;
  paper: string;
  natural?: boolean;
  focus?: [number, number];
  /** Degrees; seeded when omitted. */
  tilt?: number;
  /** Footage: plays inside the print (a film clip pinned to the board), cropped to it and graded. */
  clip?: Clip;
}> = ({ src, seed, enterAt, durFrames, width, height, x, y, paper, natural, focus, tilt, clip }) => {
  const f = useCurrentFrame();
  const local = f - enterAt;
  if (local < 0) return null;
  const rest = tilt ?? (random(`${seed}t`) - 0.5) * 8;
  const fromSide = random(`${seed}s`) > 0.5 ? 1 : -1;
  // Overshoot: fast in, 6% past the mark, settle.
  const p = interpolate(local, [0, 7, 12], [0, 1.06, 1], clamp);
  const dx = (1 - p) * 1400 * fromSide;
  const rot = rest + (1 - p) * 14 * fromSide;
  const drift = interpolate(f, [enterAt, durFrames], [0, -14], clamp);
  const h = height ?? width * 0.72;
  return (
    <div
      style={{
        position: 'absolute',
        boxSizing: 'border-box',
        left: x - width / 2,
        top: y - h / 2 + drift,
        width,
        height: h,
        transform: `translateX(${dx}px) rotate(${rot}deg)`,
        background: paper,
        padding: CARD_PAD.side,
        paddingBottom: CARD_PAD.bottom,
        boxShadow: '0 28px 50px rgba(0,0,0,0.55), 0 4px 0 rgba(0,0,0,0.25)',
      }}
    >
      {/* Dark fill behind the print: a missing file leaves an empty print, not a hole. */}
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'linear-gradient(160deg, #2c2a27, #111)' }}>
        {clip && enterAt > 0 ? (
          // The clip starts rolling when its card lands, not at the top of the scene.
          <Sequence from={enterAt} layout="none">
            <Photo src={src} durFrames={Math.max(1, durFrames - enterAt)} natural={natural} focus={focus} push={0.08} clip={clip} fill />
          </Sequence>
        ) : (
          <Photo src={src} durFrames={durFrames} natural={natural} focus={focus} push={0.08} clip={clip} fill />
        )}
        {clip ? (
          // Film on the board: a faint scanline sheen and an inner shadow sit it INSIDE the print.
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.55)',
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

/* ================================================================ texture */

/**
 * Film grain from six pre-made noise tiles (public/fx), a different tile and
 * offset every frame. It used to be a full-frame feTurbulence filter computed
 * per frame — the single most expensive thing on screen, and it made a
 * ten-minute render take hours on a laptop. Same look, a fraction of the cost.
 */
export const Grain: React.FC<{ strength: number }> = ({ strength }) => {
  const f = useCurrentFrame();
  if (strength <= 0) return null;
  const tile = f % 6;
  const x = Math.floor(random(`gx${f}`) * 512);
  const y = Math.floor(random(`gy${f}`) * 512);
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: strength,
        mixBlendMode: 'overlay',
        backgroundImage: `url(${staticFile(`fx/grain-${tile}.png`)})`,
        backgroundRepeat: 'repeat',
        backgroundPosition: `${x}px ${y}px`,
      }}
    />
  );
};

/** Film dust and the occasional vertical scratch — documentary only. */
export const Dust: React.FC = () => {
  const f = useCurrentFrame();
  const specks = Array.from({ length: 14 }, (_, i) => {
    if (random(`dv${f}${i}`) > 0.55) return null;
    const s = 1.5 + random(`ds${f}${i}`) * 4;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${random(`dx${f}${i}`) * 100}%`,
          top: `${random(`dy${f}${i}`) * 100}%`,
          width: s,
          height: s * (0.6 + random(`dh${f}${i}`)),
          borderRadius: '50%',
          background: random(`dc${f}${i}`) > 0.5 ? '#000' : '#fff',
          opacity: 0.35,
        }}
      />
    );
  });
  const scratch = random(`sc${Math.floor(f / 3)}`) > 0.8;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {specks}
      {scratch ? (
        <div
          style={{
            position: 'absolute',
            left: `${random(`sx${Math.floor(f / 3)}`) * 100}%`,
            top: 0,
            bottom: 0,
            width: 1.5,
            background: 'rgba(255,255,255,0.18)',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * The film's one global vignette, capped at VIGNETTE_MAX (looks/resolve.ts globalVignette). Gimli 20261028-9ff721 /
 * Kartal Yuvası 950730, 29 Ekim 2026: variants drew 0,6-0,9 here, a black ring on every frame of the video.
 */
export const Vignette: React.FC<{ strength: number }> = ({ strength }) => {
  const k = globalVignette(strength);
  if (k <= 0.005) return null;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 48%, rgba(0,0,0,${k}) 100%)`,
      }}
    />
  );
};

/** Hard ceiling on a flicker dip: past ~30% black it stops reading as a bad bulb and starts reading as a broken file. */
export const FLICKER_MAX = 0.3;

/**
 * Shape (0..1) of the horror flicker at frame `f`. Time is cut into 1.5s
 * windows; a window may hold ONE dip (sometimes a two-tap bulb stutter), and
 * never two windows in a row — so dips are always >= 2s apart. The old
 * version dipped the whole frame to 40% on ~13% of all 2-frame blocks for the
 * entire runtime, which read as a render fault, not a mood.
 */
export function flickerDip(f: number, fps = 30): number {
  const win = Math.round(1.5 * fps);
  const k = Math.floor(f / win);
  const roll = (n: number) => random(`flk${n}`);
  if (!(roll(k) > 0.5 && roll(k - 1) <= 0.5)) return 0;
  const pad = Math.round(0.34 * fps);
  const at = k * win + pad + Math.floor(random(`flkat${k}`) * (win - 2 * pad));
  const shape = random(`flkd${k}`) > 0.65 ? [1, 0.4, 0, 0.7, 0.2] : [1, 0.45];
  return shape[f - at] ?? 0;
}

/**
 * `strength` (0..1, constant or per frame) scales the dip up to FLICKER_MAX.
 * The engine passes a per-frame envelope so the flicker lives only on
 * dread (1) and tension (~0.6) scenes and stands down around slam landings
 * and keywords.
 */
export const Flicker: React.FC<{ strength?: number | ((f: number) => number) }> = ({ strength = 1 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = Math.min(1, Math.max(0, typeof strength === 'function' ? strength(f) : strength));
  const dip = k > 0 ? flickerDip(f, fps) * k * FLICKER_MAX : 0;
  if (dip < 0.01) return null;
  return <AbsoluteFill style={{ background: '#000', opacity: dip, pointerEvents: 'none' }} />;
};

/** Bar height as a fraction of the frame; 0.11 of 1080 = ~119px. Layouts keep type clear of it. */
export const LETTERBOX = 0.11;

/**
 * Cinematic bars. The engine draws ONE set over the whole edit with
 * `animate={false}`: bars that closed in again on every scene (the old
 * per-scene version) pumped in and out on crime, epic and horror. With
 * `animate` and a frame they close in over 10 frames — for the very start.
 */
export const Letterbox: React.FC<{ f?: number; amount?: number; animate?: boolean }> = ({
  f,
  amount = LETTERBOX,
  animate = true,
}) => {
  const h = animate && f != null ? interpolate(f, [0, 10], [0, amount * 100], clamp) : amount * 100;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${h}%`, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${h}%`, background: '#000' }} />
    </AbsoluteFill>
  );
};

/**
 * Light leak: two warm blooms drifting across the frame in screen mode. Low
 * and constant on titles, spiked on transitions.
 */
export const LightLeak: React.FC<{ color: string; strength: number; seed?: string }> = ({
  color,
  strength,
  seed = 'lk',
}) => {
  const f = useCurrentFrame();
  if (strength <= 0.01) return null;
  const a = 20 + Math.sin(f / 23 + random(seed) * 6) * 30;
  const b = 80 + Math.cos(f / 31 + random(`${seed}b`) * 6) * 25;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        opacity: strength,
        background: `radial-gradient(ellipse 55% 70% at ${a}% 30%, ${color}cc 0%, ${color}00 70%),
                     radial-gradient(ellipse 45% 60% at ${b}% 75%, #ff8a3dbb 0%, #ff8a3d00 70%)`,
      }}
    />
  );
};

export const PatternBg: React.FC<{ pattern: Pattern; color: string; bg: string }> = ({ pattern, color, bg }) => {
  const f = useCurrentFrame();
  // A scene with its own ground (src/looks/backdrops.tsx) draws that instead of the genre pattern.
  const { ground, eraStart, surface } = useLook();
  // The topic motif's quiet texture (src/topic/motifs.tsx) on every ground that shows.
  const topic = useTopic();
  const tex = topic ? <MotifTexture t={topic} light={surface === 'light'} /> : null;
  if (ground) return tex ? <>{ground}{tex}</> : <>{ground}</>;
  // Video scan lines are a TV/tape artefact: a story set before 1950 never shows them.
  if (pattern === 'scan' && eraStart !== undefined && eraStart < 1950) pattern = 'none';
  const shift = (f * 0.5) % 96;
  let image = 'none';
  let size = '64px 64px';
  if (pattern === 'dots') {
    image = `radial-gradient(${color}30 2.5px, transparent 3px)`;
    size = '46px 46px';
  } else if (pattern === 'grid') {
    image = `linear-gradient(${color}16 1px, transparent 1px), linear-gradient(90deg, ${color}16 1px, transparent 1px)`;
    size = '80px 80px';
  } else if (pattern === 'scan') {
    image = `repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 4px)`;
    size = 'auto';
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, ${bg} 0%, ${edgeOf(bg)} 140%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: image,
          backgroundSize: size,
          backgroundPosition: `${shift}px ${shift * 0.6}px`,
        }}
      />
      {tex}
    </AbsoluteFill>
  );
};

/** Where a ground falls off to: black on a dark one, a deeper shade of the paper on a light (look variant) one. */
function edgeOf(bg: string): string {
  const [r, g, b] = hexToRgb01(bg);
  if (0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55) return '#000';
  const k = (v: number) => Math.round(v * 255 * 0.7).toString(16).padStart(2, '0');
  return `#${k(r)}${k(g)}${k(b)}`;
}

/* ============================================================ transitions */

export const TRANSITION_FRAMES: Record<TransitionKind, number> = {
  cut: 0,
  flash: 4,
  zoom: 7,
  glitch: 5,
  blackout: 8,
  whip: 7,
  leak: 12,
  // Pair transitions draw both shots across the cut (effects/transitions.tsx); these are their after-cut halves.
  'film-burn': 10,
  ink: 12,
  'paper-tear': 9,
  slide: 6,
  iris: 9,
  match: 9,
  pixel: 6,
  'light-sweep': 7,
  'dip-color': 9,
  'spin-blur': 6,
  'split-wipe': 7,
};

/** Drawn over the INCOMING scene; `f` is the local frame in that scene. */
export const TransitionOverlay: React.FC<{ kind: TransitionKind; genre: Genre; f: number }> = ({ kind, genre, f }) => {
  if (kind === 'flash') {
    // Measured: 3 frames of overexposure peaking on the first, plus a tail.
    const o = [0.95, 0.85, 0.45, 0.15][f] ?? 0;
    if (!o) return null;
    return (
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 45%, #fff 0%, ${genre.accent} 50%, ${genre.accent}00 100%)`,
          opacity: o,
          mixBlendMode: 'screen',
        }}
      />
    );
  }
  if (kind === 'leak') {
    const o = interpolate(f, [0, 3, 12], [0.95, 0.7, 0], clamp);
    const x = interpolate(f, [0, 12], [-10, 110], clamp);
    return (
      <AbsoluteFill
        style={{
          mixBlendMode: 'screen',
          opacity: o,
          background: `radial-gradient(ellipse 60% 120% at ${x}% 50%, #fff 0%, ${genre.accent} 35%, #ff6a1a55 60%, transparent 80%)`,
        }}
      />
    );
  }
  if (kind === 'zoom') {
    if (f > 0) return null;
    return <AbsoluteFill style={{ background: genre.accent, opacity: 0.92 }} />;
  }
  if (kind === 'whip') {
    // Streaks across the frame while the scene itself slides in blurred.
    if (f >= TRANSITION_FRAMES.whip) return null;
    const o = interpolate(f, [0, 6], [0.6, 0], clamp);
    return (
      <AbsoluteFill
        style={{
          opacity: o,
          background: `repeating-linear-gradient(0deg, ${genre.ink}22 0 2px, transparent 2px 9px)`,
          filter: 'blur(2px)',
        }}
      />
    );
  }
  if (kind === 'blackout') {
    const o = interpolate(f, [0, 3, 8], [1, 1, 0], clamp);
    return <AbsoluteFill style={{ background: '#000', opacity: o }} />;
  }
  if (kind === 'glitch') {
    if (f >= TRANSITION_FRAMES.glitch) return null;
    const bars = Array.from({ length: 9 }, (_, i) => {
      const y = random(`gy${f}${i}`) * 100;
      const h = 1.5 + random(`gh${f}${i}`) * 8;
      const x = (random(`gx${f}${i}`) - 0.5) * 160;
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${y}%`,
            height: `${h}%`,
            background: i % 2 ? genre.accent : genre.accent2,
            opacity: 0.4,
            transform: `translateX(${x}px)`,
            mixBlendMode: 'screen',
          }}
        />
      );
    });
    return <AbsoluteFill>{bars}</AbsoluteFill>;
  }
  return null;
};

/** Entrance transform applied to the incoming scene itself. */
export function entranceStyle(kind: TransitionKind, f: number): React.CSSProperties {
  if (kind === 'zoom') {
    const s = interpolate(f, [0, 6], [1.55, 1], { ...clamp });
    const b = interpolate(f, [0, 6], [24, 0], clamp);
    return { transform: `scale(${s})`, filter: b > 0.2 ? `blur(${b}px)` : undefined };
  }
  if (kind === 'whip') {
    const x = interpolate(f, [0, 6], [900, 0], { ...clamp });
    const b = interpolate(f, [0, 6], [30, 0], clamp);
    return { transform: `translateX(${x}px)`, filter: b > 0.2 ? `blur(${b}px)` : undefined };
  }
  if (kind === 'glitch' && f < TRANSITION_FRAMES.glitch) {
    return { transform: `translateX(${(random(`ge${f}`) - 0.5) * 50}px)` };
  }
  return {};
}
