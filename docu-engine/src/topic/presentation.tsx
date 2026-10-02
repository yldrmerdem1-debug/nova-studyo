import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT } from '../fonts';
import { Photo, SoftPlate, type Clip } from '../fx';
import type { Genre, PhotoPresent } from '../types';
import { h01, motifColors, type TopicCtx } from './context';
import { MotifTexture, motifPalette } from './motifs';

/*
 * PHOTO PRESENTATION — one way of showing archive stills, kept through the
 * whole video (LEMMiNO's lightbox prints on newsprint are a signature):
 *   lightbox   the whole picture on a glowing light-table border over a
 *              newsprint ground, a tiny source credit under it
 *   print      a bordered print, slightly turned, on the motif's texture
 *   film-frame a 35 mm frame with sprocket holes and edge print
 *   framed     the subject in a white frame over its own dark copy, the
 *              motif's light bleeding out of the frame (MagnatesMedia)
 * The camera moves the whole presentation (a slow push), not the picture
 * inside it: an archive print is never cropped.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

export interface PresentProps {
  t: TopicCtx;
  kind: PhotoPresent;
  src: string;
  clip?: Clip;
  imgW?: number;
  imgH?: number;
  focus?: [number, number];
  durFrames: number;
  genre: Genre;
  credit?: string;
  seed: string;
}

/** Fit a picture of aspect `a` inside w x h. */
function fit(a: number, w: number, h: number): { w: number; h: number } {
  return a > w / h ? { w, h: Math.round(w / a) } : { w: Math.round(h * a), h };
}

/** A newsprint ground: faint column rules and set lines of grey type. */
const Newsprint: React.FC<{ ink: string }> = ({ ink }) => {
  const cols = 6;
  const els: React.ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    const x0 = 40 + c * 310;
    els.push(<line key={`r${c}`} x1={x0 - 14} x2={x0 - 14} y1={0} y2={1080} stroke={ink} strokeWidth={1} opacity={0.5} />);
    for (let y = 0; y < 62; y++) {
      const w = 270 * (0.55 + 0.45 * h01(`np${c}|${y}`));
      if (h01(`gap${c}|${y}`) < 0.06) continue;
      els.push(<rect key={`${c}-${y}`} x={x0} y={20 + y * 17.4} width={w} height={6} fill={ink} opacity={0.42} />);
    }
  }
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      {els}
    </svg>
  );
};

export const PresentedPhoto: React.FC<PresentProps> = ({ t, kind, src, clip, imgW, imgH, focus, durFrames, genre, credit, seed }) => {
  const f = useCurrentFrame();
  const P = motifPalette(t, genre);
  const { accent } = motifColors(t, genre);
  const W = clip?.w ?? imgW;
  const H = clip?.h ?? imgH;
  const a = W && H ? W / H : 1.5;
  const tp = interpolate(f, [0, durFrames], [0, 1], clamp);
  const push = 1 + 0.06 * tp;
  const enter = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const fc = focus ?? [0.5, 0.4];

  const picture = (w: number, h: number) => (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: '#111' }}>
      <Photo src={src} clip={clip} durFrames={durFrames} focus={fc} push={0.03} fill imgW={imgW} imgH={imgH} />
    </div>
  );

  if (kind === 'lightbox') {
    const box = fit(a, 1340, 800);
    return (
      <AbsoluteFill style={{ background: '#1b1a18' }}>
        <AbsoluteFill style={{ background: '#e8e3d6' }} />
        <Newsprint ink="#4a4740" />
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 70% at 50% 48%, rgba(20,18,15,0.25) 0%, rgba(10,9,8,0.82) 100%)' }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${push})` }}>
          <div
            style={{
              position: 'relative',
              padding: 6,
              background: '#fbf8f0',
              boxShadow: `0 0 0 1px rgba(255,255,255,0.9), 0 0 26px 6px rgba(255,250,235,0.55), 0 0 90px 20px ${accent}40, 0 40px 80px rgba(0,0,0,0.6)`,
              opacity: enter,
              transform: `translateY(${(1 - enter) * 26}px)`,
            }}
          >
            {picture(box.w, box.h)}
            <div style={{ position: 'absolute', right: 2, bottom: -30, fontFamily: FONT.plexMono, fontSize: 17, letterSpacing: '0.16em', color: '#d8d2c2', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
              {credit ? `SOURCE: ${credit}` : 'ARCHIVE'}
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (kind === 'print') {
    const box = fit(a, 1180, 780);
    const tilt = (h01(seed) - 0.5) * 4;
    return (
      <AbsoluteFill style={{ background: P.ground2 }}>
        {/* A purposeful ground: the picture's own world, dark and soft, under the motif's texture — never an empty margin. */}
        <SoftPlate src={src} clip={clip} dim={0.34} blur={7} zoom={1.25} focus={fc} durFrames={durFrames} />
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, ${P.ground}55 0%, ${P.ground2}dd 100%)` }} />
        <MotifTexture t={t} strength={1.6} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${push})` }}>
          <div style={{ padding: '18px 18px 54px', background: '#f4efe4', boxShadow: '0 34px 70px rgba(0,0,0,0.65), 0 3px 0 rgba(0,0,0,0.3)', transform: `rotate(${tilt}deg) translateY(${(1 - enter) * 40}px)`, opacity: enter }}>
            {picture(box.w, box.h)}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (kind === 'film-frame') {
    const box = fit(a, 1300, 760);
    const tokens = (t.topic.tokens ?? []).slice(0, 2).join('  ·  ').toUpperCase();
    const slide = interpolate(f, [0, durFrames], [30, -30], clamp);
    const holes = Array.from({ length: 22 }, (_, i) => i);
    return (
      <AbsoluteFill style={{ background: '#0c0a08' }}>
        <SoftPlate src={src} clip={clip} dim={0.22} blur={8} zoom={1.3} focus={fc} durFrames={durFrames} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `translateX(${slide}px) scale(${push})` }}>
          <div style={{ position: 'relative', width: 2200, height: box.h + 220, background: '#1b140c', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 80px rgba(0,0,0,0.8)' }}>
            {[0, 1].map((row) => (
              <div key={row} style={{ position: 'absolute', left: 0, right: 0, [row ? 'bottom' : 'top']: 30, display: 'flex', gap: 46, paddingLeft: 20 } as React.CSSProperties}>
                {holes.map((i) => (
                  <div key={i} style={{ width: 52, height: 36, borderRadius: 6, background: '#0c0a08', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.9)' }} />
                ))}
              </div>
            ))}
            <div style={{ position: 'absolute', top: 76, left: 120, fontFamily: FONT.plexMono, fontSize: 18, letterSpacing: '0.3em', color: '#d89a3c', opacity: 0.8 }}>{`▸ ${tokens || 'ARCHIVE'}  ▸ ${String(Math.floor(h01(seed) * 90) + 10)}`}</div>
            <div style={{ border: '3px solid #2a2014', borderRadius: 10, overflow: 'hidden', opacity: enter }}>{picture(box.w, box.h)}</div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // framed
  const box = fit(a, 1000, 700);
  const bleed = 0.55 + 0.15 * Math.sin(f / 9);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <SoftPlate src={src} clip={clip} dim={0.3} blur={7} zoom={1.25} focus={fc} durFrames={durFrames} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 90%)' }} />
      <MotifTexture t={t} strength={1.2} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${push})` }}>
        <div style={{ position: 'relative', opacity: enter }}>
          <div style={{ padding: 16, background: '#ffffff', boxShadow: `0 30px 80px rgba(0,0,0,0.75), 0 0 ${70 + 30 * bleed}px ${14 + 8 * bleed}px ${accent}55` }}>{picture(box.w, box.h)}</div>
          {/* the motif's light spilling out past one corner of the frame */}
          <div style={{ position: 'absolute', left: -140, bottom: -140, width: 420, height: 420, borderRadius: '50%', background: `radial-gradient(circle, ${accent}88 0%, ${accent}33 35%, ${accent}00 70%)`, opacity: bleed, mixBlendMode: 'screen', pointerEvents: 'none' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
