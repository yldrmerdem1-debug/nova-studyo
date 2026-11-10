import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT } from '../fonts';
import { Photo, SoftPlate, type Clip } from '../fx';
import type { Genre, PhotoPresent } from '../types';
import { alpha } from '../looks/color';
import { h01, motifColors, type TopicCtx } from './context';
import { MotifTexture, PRESENT_PLATE, deviceRing, isLightLook, motifPalette } from './motifs';

/** The framed print's box (fits inside): large enough that the field round it is a margin, not an empty frame. */
export const FRAMED_BOX = { w: 1280, h: 800 } as const;

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
  // A light look presents its prints on the motif's paper (Kartal Yuvası 950730, 29 Ekim 2026: night grounds in every look);
  // a light variant counts even when this scene's genre was resolved dark-surfaced.
  const light = isLightLook(genre);
  const P = motifPalette(t, genre, light);
  /*
   * Gimli 9ff721 önce/sonra, 29 Ekim 2026: a 'framed' photo sat small in an empty dark navy field under a 0.7 black ring;
   * film-frame plates were at brightness 0.22. The field round every presentation is now the photo's OWN blurred plate,
   * colour kept, at brightness PRESENT_PLATE.brightness (>= 0.8); the ring is at most 0.3; a light look veils the plate
   * with its paper. The print / frame itself carries a soft drop shadow, not a dark frame.
   */
  const ring = deviceRing(light, light ? PRESENT_PLATE.lightRing : PRESENT_PLATE.ring);
  const plate = (zoom: number, blur = 7) => <SoftPlate src={src} clip={clip} dim={PRESENT_PLATE.brightness} blur={blur} zoom={zoom} focus={focus ?? [0.5, 0.4]} durFrames={durFrames} />;
  const wash = light ? alpha(P.ground, PRESENT_PLATE.lightVeil) : `radial-gradient(ellipse at 50% 50%, ${alpha(P.ground, 0)} 30%, ${alpha(P.ground2, PRESENT_PLATE.wash)} 100%)`;
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
      <AbsoluteFill style={{ background: '#d8d2c4' }}>
        {/* The light table: the photo's own plate under a newsprint sheet, lit — no 0.82 black ring round it. */}
        {plate(1.3, 8)}
        <AbsoluteFill style={{ background: alpha('#e8e3d6', PRESENT_PLATE.lightVeil) }} />
        <AbsoluteFill style={{ opacity: PRESENT_PLATE.newsprint }}>
          <Newsprint ink="#4a4740" />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: deviceRing(false, PRESENT_PLATE.ring) }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${push})` }}>
          <div
            style={{
              position: 'relative',
              padding: 6,
              background: '#fbf8f0',
              boxShadow: `0 0 0 1px rgba(255,255,255,0.9), 0 0 26px 6px rgba(255,250,235,0.55), 0 0 90px 20px ${accent}40, 0 40px 80px rgba(0,0,0,0.35)`,
              opacity: enter,
              transform: `translateY(${(1 - enter) * 26}px)`,
            }}
          >
            {picture(box.w, box.h)}
            <div style={{ position: 'absolute', right: 2, bottom: -30, fontFamily: FONT.plexMono, fontSize: 17, letterSpacing: '0.16em', color: '#3d3a33', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
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
        {/* A purposeful ground: the picture's own world, soft and in colour, under the motif's texture — never an empty margin. */}
        {plate(1.25)}
        <AbsoluteFill style={{ background: wash }} />
        <MotifTexture t={t} light={light} strength={1.6} />
        <AbsoluteFill style={{ background: ring }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${push})` }}>
          <div style={{ padding: '18px 18px 54px', background: '#f4efe4', boxShadow: '0 34px 70px rgba(0,0,0,0.4), 0 3px 0 rgba(0,0,0,0.2)', transform: `rotate(${tilt}deg) translateY(${(1 - enter) * 40}px)`, opacity: enter }}>
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
      <AbsoluteFill style={{ background: P.ground2 }}>
        {plate(1.3, 8)}
        <AbsoluteFill style={{ background: wash }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `translateX(${slide}px) scale(${push})` }}>
          {/* The film base is a lit, translucent umber (luma ~50), its perforations backlit — not a #1b140c bar. */}
          <div style={{ position: 'relative', width: 2200, height: box.h + 220, background: alpha('#3d2f22', 0.9), display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(0,0,0,0.3)' }}>
            {[0, 1].map((row) => (
              <div key={row} style={{ position: 'absolute', left: 0, right: 0, [row ? 'bottom' : 'top']: 30, display: 'flex', gap: 46, paddingLeft: 20 } as React.CSSProperties}>
                {holes.map((i) => (
                  <div key={i} style={{ width: 52, height: 36, borderRadius: 6, background: 'rgba(242,232,214,0.62)', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.35)' }} />
                ))}
              </div>
            ))}
            <div style={{ position: 'absolute', top: 76, left: 120, fontFamily: FONT.plexMono, fontSize: 18, letterSpacing: '0.3em', color: '#f0b252', opacity: 0.9 }}>{`▸ ${tokens || 'ARCHIVE'}  ▸ ${String(Math.floor(h01(seed) * 90) + 10)}`}</div>
            <div style={{ border: '3px solid #5a4632', borderRadius: 10, overflow: 'hidden', opacity: enter }}>{picture(box.w, box.h)}</div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }

  // framed — bigger than before (1000x700 read small in its field), on its own colour plate.
  const box = fit(a, FRAMED_BOX.w, FRAMED_BOX.h);
  const bleed = 0.55 + 0.15 * Math.sin(f / 9);
  return (
    <AbsoluteFill style={{ background: P.ground2 }}>
      {plate(1.25)}
      <AbsoluteFill style={{ background: wash }} />
      <MotifTexture t={t} light={light} strength={1.2} />
      <AbsoluteFill style={{ background: ring }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${push})` }}>
        <div style={{ position: 'relative', opacity: enter }}>
          <div style={{ padding: 16, background: '#ffffff', boxShadow: `0 30px 80px rgba(0,0,0,0.4), 0 0 ${70 + 30 * bleed}px ${14 + 8 * bleed}px ${accent}55` }}>{picture(box.w, box.h)}</div>
          {/* the motif's light spilling out past one corner of the frame */}
          <div style={{ position: 'absolute', left: -140, bottom: -140, width: 420, height: 420, borderRadius: '50%', background: `radial-gradient(circle, ${accent}88 0%, ${accent}33 35%, ${accent}00 70%)`, opacity: bleed, mixBlendMode: 'screen', pointerEvents: 'none' }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
