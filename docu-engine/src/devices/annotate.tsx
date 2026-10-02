import React from 'react';
import { AbsoluteFill, Easing, Freeze, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { CARD_PAD, clipOf, isLowRes, isLowResClip } from '../fx';
import type { Genre, PhotoScene } from '../types';
import { H, W, arrowHead, clamp, drawn, handLoop, handStroke, safeBand, typed } from './common';
import { annotateFrame } from './timing';
import { DFONT, fitWrap, measure } from './type';

/*
 * FREEZE & MARK — on a photo (or footage) scene: at `annotate.at` the shot
 * freezes (footage stops on that frame, the camera stops), the picture dims
 * a little except where the mark is, a hand-drawn loop closes around the
 * point, an arrow draws in and the label types itself in the genre accent.
 * After the freeze the frozen picture and its mark push in together.
 *
 * The point is given in PICTURE coordinates, so it is mapped through the
 * exact framing the photo renderer uses (cover crop, contained scan, or the
 * collage print with its tilt and the board camera) at the frozen frame.
 */

type Pt = [number, number];

/** Where the photo renderer puts picture point (u, v) on screen at scene frame `fz`, and the picture's width on screen (`r` is a fraction of it). */
export function markPoint(
  scene: PhotoScene,
  o: { fz: number; durFrames: number; speed: number; safeH?: number; card?: { x: number; y: number; w: number; h: number } | null },
): { p: Pt; pw: number } {
  const a = scene.annotate!;
  const u = Math.min(1, Math.max(0, Number(a.x) || 0));
  const v = Math.min(1, Math.max(0, Number(a.y) || 0));
  const clip = clipOf(scene);
  const t = Math.min(1, Math.max(0, o.fz / Math.max(1, o.durFrames)));
  const fc: Pt = scene.focus ?? [0.5, 0.3];
  const iw = (clip ? clip.w ?? scene.imgW : scene.imgW) || 1536;
  const ih = (clip ? clip.h ?? scene.imgH : scene.imgH) || 1024;

  /** Cover-crop of an iw x ih picture into a bw x bh box, scaled by `s` about the focus: box-local point. */
  const cover = (bw: number, bh: number, s: number): { p: Pt; pw: number } => {
    const c = Math.max(bw / iw, bh / ih);
    const dw = iw * c;
    const dh = ih * c;
    const ox = (bw - dw) * fc[0];
    const oy = (bh - dh) * fc[1];
    const q: Pt = [ox + u * dw, oy + v * dh];
    const O: Pt = [fc[0] * bw, fc[1] * bh];
    return { p: [O[0] + (q[0] - O[0]) * s, O[1] + (q[1] - O[1]) * s], pw: dw * s };
  };

  if (o.card) {
    // Collage: the print (PhotoCard, main card: enters at 0, seeded tilt, drifts up), inside the board camera.
    const cd = o.card;
    const tilt = ((random(`${scene.image}t`) - 0.5) * 8 * Math.PI) / 180;
    const drift = -14 * t;
    const aw = cd.w - 2 * CARD_PAD.side;
    const ah = cd.h - CARD_PAD.side - CARD_PAD.bottom;
    const s = clip ? 1.02 + Math.min(0.04, 0.08 * 0.33) * t : 1.04 + 0.08 * t;
    const inner = cover(aw, ah, s);
    // Card-local (from its centre), rotated, then placed.
    const lx = CARD_PAD.side + inner.p[0] - cd.w / 2;
    const ly = CARD_PAD.side + inner.p[1] - cd.h / 2;
    const rx = lx * Math.cos(tilt) - ly * Math.sin(tilt);
    const ry = lx * Math.sin(tilt) + ly * Math.cos(tilt);
    const bx = cd.x + rx;
    const by = cd.y + drift + ry;
    const S = 1 + 0.05 * o.speed * t;
    return { p: [W / 2 + (bx - W / 2) * S, H / 2 + (by - H / 2) * S], pw: inner.pw * S };
  }
  const low = clip ? isLowResClip(iw, ih) : isLowRes(scene.imgW, scene.imgH);
  if (low) {
    const maxUp = clip ? 2 : 1.5;
    const fit = Math.min((W * 0.9) / iw, (o.safeH ?? H * 0.86) / ih);
    const shown = Math.min(fit, maxUp);
    const room = Math.max(1, maxUp / shown);
    const s = Math.min(1 + 0.16 * (clip ? 0.25 : 0.5) * o.speed * t, room);
    const rw = iw * shown;
    const rh = ih * shown;
    const x0 = (W - rw) / 2;
    const y0 = (H - rh) / 2;
    const O: Pt = [rw / 2, fc[1] * rh];
    const q: Pt = [u * rw, v * rh];
    return { p: [x0 + O[0] + (q[0] - O[0]) * s, y0 + O[1] + (q[1] - O[1]) * s], pw: rw * s };
  }
  const s = clip ? 1.02 + Math.min(0.04, 0.16 * 0.33 * o.speed) * t : 1.04 + 0.16 * o.speed * t;
  return cover(W, H, s);
}

type Dir = 'left' | 'right' | 'up' | 'down';
const VEC: Record<Dir, Pt> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

export const Annotated: React.FC<{
  scene: PhotoScene;
  genre: Genre;
  durFrames: number;
  speed: number;
  safeH?: number;
  card?: { x: number; y: number; w: number; h: number } | null;
  children: React.ReactNode;
}> = ({ scene, genre, durFrames, speed, safeH, card, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = scene.annotate!;
  const fz = annotateFrame(a, durFrames, fps);
  const frozen = f >= fz;
  const { p, pw } = markPoint(scene, { fz, durFrames, speed, safeH, card });
  const R = Math.max(46, Math.min(380, (Number(a.r) > 0 ? Number(a.r) : 0.08) * pw));
  const band = safeBand(genre, 30);

  /* ---- where the label goes ---- */
  const label = String(a.label ?? '').trim();
  const terminal = genre.look === 'terminal';
  const font = terminal ? 'plexMono' : 'hand';
  const room: Record<Dir, number> = {
    // Room for the label beyond the arrow's tail, on the side opposite to where the arrow points.
    left: band.right - (p[0] + R * 1.2 + 150),
    right: p[0] - R * 1.2 - 150 - band.left,
    down: p[1] - R * 1.2 - 110 - band.top,
    up: band.bottom - (p[1] + R * 1.2 + 110),
  };
  let dir: Dir = a.arrow && VEC[a.arrow] ? a.arrow : room.left >= room.right ? 'left' : 'right';
  if (!a.arrow && Math.max(room.left, room.right) < 360) dir = room.down >= room.up ? 'down' : 'up';
  const d = VEC[dir];
  const perp: Pt = [-d[1], d[0]];
  const side = p[1] > H / 2 ? -1 : 1;
  const head: Pt = [p[0] - d[0] * R * 1.16, p[1] - d[1] * R * 1.16];
  const len = Math.min(230, Math.max(120, R * 0.95));
  const tail: Pt = [head[0] - d[0] * len + perp[0] * 55 * side, head[1] - d[1] * len + perp[1] * 55 * side * (dir === 'left' || dir === 'right' ? 1 : 0.4)];
  const horiz = dir === 'left' || dir === 'right';
  const maxW = Math.max(300, Math.min(760, horiz ? (dir === 'left' ? band.right - tail[0] - 20 : tail[0] - 20 - band.left) : 760));
  const fit = fitWrap(label, font, { maxW, maxH: 170, lineH: 1.02, cap: terminal ? 50 : 68, min: terminal ? 22 : 30, maxLines: 2, balance: true });
  const lw = Math.min(maxW, Math.max(0, ...fit.lines.map((l) => measure(l, font, fit.size)))) + (terminal ? 36 : 0);
  const lh = fit.lines.length * fit.size * 1.02;
  let lx = dir === 'left' ? tail[0] + 18 : dir === 'right' ? tail[0] - 18 - lw : tail[0] - lw / 2;
  let ly = horiz ? tail[1] - lh / 2 : dir === 'down' ? tail[1] - 14 - lh : tail[1] + 14;
  lx = Math.max(band.left - 30, Math.min(band.right + 30 - lw, lx));
  ly = Math.max(band.top, Math.min(band.bottom - lh, ly));

  /* ---- clock ---- */
  const loopA = fz + 3;
  const loopB = loopA + 13;
  const arrA = loopB - 2;
  const arrB = arrA + 9;
  const typeA = arrB - 1;
  const dimP = interpolate(f, [fz, fz + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const flash = frozen ? interpolate(f, [fz, fz + 1, fz + 5], [0, 0.32, 0], clamp) : 0;
  const pushP = interpolate(f, [fz + 4, durFrames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const push = 1 + 0.05 * speed * pushP;
  const col = genre.accent;
  const loopD = handLoop(`${scene.image}|${a.x}|${a.y}`, p[0], p[1], R * 1.04, R * 0.92);
  const st = handStroke(`${scene.image}|${a.label}`, tail, head, 0.1);
  const shown = typed(label, f, typeA, fps, 26);
  let left = [...shown].length;
  const lines = fit.lines.map((l) => {
    const n = Math.max(0, Math.min([...l].length, left));
    left -= [...l].length + 1;
    return [...l].slice(0, n).join('');
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `${p[0]}px ${p[1]}px` }}>
        <AbsoluteFill style={{ filter: frozen ? `saturate(${1 - 0.18 * dimP}) brightness(${1 - 0.1 * dimP})` : undefined }}>
          <Freeze frame={fz} active={frozen}>
            {children}
          </Freeze>
        </AbsoluteFill>
        {frozen ? (
          <>
            <AbsoluteFill
              style={{
                background: `radial-gradient(circle at ${p[0]}px ${p[1]}px, rgba(0,0,0,0) 0px, rgba(0,0,0,0) ${R * 1.15}px, rgba(0,0,0,${0.34 * dimP}) ${R * 2.6}px)`,
              }}
            />
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
              <path d={loopD} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={11} strokeLinecap="round" transform="translate(2 4)" {...drawn(interpolate(f, [loopA, loopB], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) }))} />
              <path
                d={loopD}
                fill="none"
                stroke={col}
                strokeWidth={8}
                strokeLinecap="round"
                style={genre.look !== 'label' ? { filter: `drop-shadow(0 0 8px ${col}aa)` } : undefined}
                {...drawn(interpolate(f, [loopA, loopB], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) }))}
              />
              {label ? (
                <>
                  <path d={st.d} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={9} strokeLinecap="round" transform="translate(2 4)" {...drawn(interpolate(f, [arrA, arrB], [0, 1], clamp))} />
                  <path d={st.d} fill="none" stroke={col} strokeWidth={6.5} strokeLinecap="round" {...drawn(interpolate(f, [arrA, arrB], [0, 1], clamp))} />
                  {f >= arrB - 1 ? (
                    <>
                      <path d={arrowHead(head, st.angle, 30)} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" transform="translate(2 4)" />
                      <path d={arrowHead(head, st.angle, 30)} fill="none" stroke={col} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round" />
                    </>
                  ) : null}
                </>
              ) : null}
            </svg>
            {label && f >= typeA ? (
              <div
                style={{
                  position: 'absolute',
                  left: lx,
                  top: ly,
                  width: lw + 40,
                  fontFamily: DFONT[font],
                  fontWeight: terminal ? 600 : 700,
                  fontSize: fit.size,
                  lineHeight: 1.02,
                  color: col,
                  textAlign: dir === 'right' ? 'right' : dir === 'left' ? 'left' : 'center',
                  marginLeft: dir === 'right' ? -40 : dir === 'left' ? 0 : -20,
                  // A soft dark halo keeps the accent readable on any picture (a red on a dark frame most of all).
                  textShadow: terminal ? `0 0 12px ${col}88` : '0 2px 0 rgba(0,0,0,0.6), 0 0 10px rgba(0,0,0,0.9), 0 0 26px rgba(0,0,0,0.75)',
                  transform: terminal ? undefined : 'rotate(-2deg)',
                  ...(terminal ? { width: lw, marginLeft: 0, padding: '8px 18px', boxSizing: 'border-box' as const, background: 'rgba(0,0,0,0.78)', borderLeft: `4px solid ${col}`, textAlign: 'left' as const } : {}),
                }}
              >
                {lines.map((l, k) => (
                  <div key={k} style={{ whiteSpace: 'nowrap', minHeight: fit.size * 1.02 }}>
                    {l}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </AbsoluteFill>
      {flash > 0 ? <AbsoluteFill style={{ background: '#fff', opacity: flash, mixBlendMode: 'screen' }} /> : null}
    </AbsoluteFill>
  );
};
