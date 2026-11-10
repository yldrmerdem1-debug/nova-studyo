import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from '../fonts';
import type { Genre, Scene, TopicIcon } from '../types';
import { cueFrames, h01, motifColors, type TopicCtx } from './context';
import { motifPalette } from './motifs';
import { alpha, readable } from '../looks/color';
import { motifCaptionRect } from './caption';
import { useLook } from '../looks/context';
import { ICONS } from './icons-data';

/*
 * THE METAPHOR LAYER (MagnatesMedia's neon icons beside a portrait while the
 * narrator names the thing): glowing line icons that draw themselves on the
 * spoken word, beside the subject — never over it. Only on lines that name
 * something concrete (the pipeline decides); at most three per shot.
 *
 * Placement: the subject's focus point (scene.focus / the depth-cut box)
 * decides the free side; an icon asked for the subject's side moves to the
 * other one. Icons sit in the outer ~22% of the frame, above the caption band.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** One icon from the vendored set (Tabler, 24x24, stroke). `draw` 0..1 strokes it on. */
export const LineIcon: React.FC<{ id: string; size: number; color: string; stroke?: number; draw?: number; style?: React.CSSProperties }> = ({ id, size, color, stroke = 1.5, draw = 1, style }) => {
  const nodes = ICONS[id] ?? ICONS['question-mark'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {nodes.map(([tag, a], i) => {
        if (a.d === 'M0 0h24v24H0z') return null;
        const props: Record<string, unknown> = { key: i, ...a };
        if (draw < 1) Object.assign(props, { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - Math.max(0, Math.min(1, draw * nodes.length - i * 0.6)) });
        return React.createElement(tag, props);
      })}
    </svg>
  );
};

export const isIcon = (id?: string) => !!id && !!ICONS[id];

/** The subject's horizontal centre (0..1) when the scene knows it. */
function subjectX(s: Scene): number | null {
  const x = s as { focus?: [number, number]; layers?: { box: [number, number, number, number] } };
  if (x.layers?.box) return (x.layers.box[0] + x.layers.box[2]) / 2;
  if (Array.isArray(x.focus) && Number.isFinite(x.focus[0])) return x.focus[0];
  return null;
}
function subjectY(s: Scene): number {
  const x = s as { focus?: [number, number] };
  return Array.isArray(x.focus) && Number.isFinite(x.focus[1]) ? x.focus[1] : 0.4;
}

type Rect = [number, number, number, number];
const hit = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** Half the footprint of a drawn icon (176 px glyph + its glow pool), px. */
export const ICON_HALF = 112;

/**
 * Where each icon goes: in FREE space — never over the caption block, the
 * subject (face / depth cut-out) or another icon. The preferred side (asked
 * for, or alternating) is tried first, then the other free slots; an icon
 * with no free slot is DROPPED rather than drawn over words or a face.
 * `keepOut` are frame-px rects (the caption block, a lower third...).
 */
export function iconSlots(s: Scene, icons: TopicIcon[], keepOut: Rect[] = []): { icon: TopicIcon; x: number; y: number; side: 'left' | 'right' | 'orbit' }[] {
  const sx = subjectX(s);
  const out: { icon: TopicIcon; x: number; y: number; side: 'left' | 'right' | 'orbit' }[] = [];
  const list = icons.filter((i) => isIcon(i.id)).slice(0, 3);
  const blocked: Rect[] = [...keepOut];
  // The subject: its depth cut-out box, else a face-sized zone round the focus.
  const L = (s as { layers?: { box: Rect } }).layers?.box;
  if (L) blocked.push([L[0] * 1920, L[1] * 1080, L[2] * 1920, L[3] * 1080]);
  else if (sx !== null) {
    const sy = subjectY(s);
    blocked.push([(sx - 0.13) * 1920, (sy - 0.2) * 1080, (sx + 0.13) * 1920, (sy + 0.22) * 1080]);
  }
  const box = (x: number, y: number): Rect => [x * 1920 - ICON_HALF, y * 1080 - ICON_HALF, x * 1920 + ICON_HALF, y * 1080 + ICON_HALF];
  const free = (x: number, y: number) => !blocked.some((r) => hit(r, box(x, y)));
  const slotsFor = (side: 'left' | 'right'): [number, number][] => {
    const x = side === 'left' ? 0.135 : 0.865;
    const x2 = side === 'left' ? 0.3 : 0.7;
    return [[x, 0.34], [x, 0.59], [x, 0.22], [x, 0.76], [x2, 0.22], [x2, 0.76]];
  };
  list.forEach((icon, k) => {
    let side = icon.side ?? (k % 2 ? 'left' : 'right');
    if (side !== 'orbit' && sx !== null) {
      // Never on the subject's side when it sits off-centre.
      if (side === 'left' && sx < 0.4) side = 'right';
      if (side === 'right' && sx > 0.6) side = 'left';
    }
    if (side === 'orbit') {
      // An orbit circles the subject; with words on the frame it becomes a side icon in free space.
      if (!keepOut.length) {
        out.push({ icon, x: sx ?? 0.5, y: subjectY(s), side });
        return;
      }
      side = (sx ?? 0.5) > 0.5 ? 'left' : 'right';
    }
    const other: 'left' | 'right' = side === 'left' ? 'right' : 'left';
    const cand: [number, number, 'left' | 'right'][] = [...slotsFor(side).map(([x, y]) => [x, y, side] as [number, number, 'left' | 'right']), ...slotsFor(other).map(([x, y]) => [x, y, other] as [number, number, 'left' | 'right'])];
    const c = cand.find(([x, y]) => free(x, y));
    if (!c) return;
    blocked.push(box(c[0], c[1]));
    out.push({ icon, x: c[0], y: c[1], side: c[2] });
  });
  return out;
}

/** The frame-px boxes of the words drawn on this scene (the icon layer keeps out of them). */
export function textKeepOut(t: TopicCtx, scene: Scene, genre: Genre, textStyle?: string): Rect[] {
  const x = scene as { type: string; text?: string; say?: string; textMode?: string; image?: string; video?: string; layers?: unknown; caption?: string; name?: string };
  const out: Rect[] = [];
  if (x.type === 'words' && x.textMode !== 'none') {
    const words = String(x.text ?? '').split(/\s+/).filter(Boolean);
    const pictured = !!(x.image || x.video || x.layers);
    if (textStyle === 'motif') out.push(motifCaptionRect(t.motif, scene, pictured, `${t.seed}|cap|${x.say ?? words.join(' ')}`, words, !!genre.letterbox));
    // Any other caption style: its line sits in the lower part of the frame or centred — keep the middle band clear.
    else out.push([150, 560, 1770, 1040], [300, 300, 1620, 780]);
  }
  // A photo's caption / lower third.
  if ((x.caption || x.name) && x.type === 'photo') out.push([90, 720, 1300, 1040]);
  return out;
}

export const IconLayer: React.FC<{ t: TopicCtx; scene: Scene; genre: Genre; durFrames: number }> = ({ t, scene, genre, durFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const icons = scene.icons ?? [];
  if (!icons.length) return null;
  const look = useLook();
  const slots = iconSlots(scene, icons, textKeepOut(t, scene, genre, look.textStyle));
  if (!slots.length) return null;
  /*
   * The look decides (motifPalette -> isLightLook): in a paper look the icon is drawn in the motif's ink on a paper pool,
   * the accent pushed until it reads on paper; in a dark look a white glow line on a soft local pool (<= 0.5, it is
   * the icon's own scrim, not a frame vignette). Gimli 9ff721 önce/sonra, 29 Ekim 2026: icons.tsx drew the night
   * palette — white glow on a 0.62 black pool — inside every look.
   */
  const P = motifPalette(t, genre);
  const lightIcons = P.light === true;
  const base = motifColors(t, genre).accent;
  const accent = lightIcons ? readable(base, P.ground, 3) : base;
  const pool = lightIcons
    ? `radial-gradient(circle, ${alpha(P.ground, 0.78)} 0%, ${alpha(P.ground, 0.45)} 45%, ${alpha(P.ground, 0)} 70%)`
    : 'radial-gradient(circle, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.26) 45%, rgba(0,0,0,0) 70%)';
  const lineInk = lightIcons ? P.ink : '#ffffff';
  const at = cueFrames(
    slots.map((s) => ({ at: s.icon.at, label: s.icon.at ? undefined : s.icon.label })),
    scene.wordTimes,
    durFrames,
    fps,
    { lead: 0.35, tail: 0.45, gap: 10 },
  );
  const out = interpolate(f, [durFrames - 9, durFrames - 1], [1, 0], clamp);
  const orbitN = slots.filter((s) => s.side === 'orbit').length;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: out }}>
      {slots.map((s, k) => {
        const a = at[k];
        const p = interpolate(f, [a, a + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        if (p <= 0) return null;
        const glow = s.icon.glow !== false;
        const size = 176;
        let x = s.x * 1920;
        let y = s.y * 1080;
        if (s.side === 'orbit') {
          const j = slots.filter((o, i) => o.side === 'orbit' && i < k).length;
          const ang = -Math.PI / 2 + (j - (orbitN - 1) / 2) * 0.9 + (f / fps) * 0.12;
          x = Math.max(160, Math.min(1760, x + Math.cos(ang) * 360));
          y = Math.max(150, Math.min(760, y * 1 + Math.sin(ang) * 260));
        }
        // A slow float so the icon never sits dead still.
        const fy = Math.sin((f + k * 23) / 26) * 6;
        const pop = interpolate(f, [a, a + 6, a + 12], [0.7, 1.08, 1], clamp);
        const flick = p < 1 ? 0.55 + 0.45 * h01(`${k}|${f}`) : 1;
        const tether = s.icon.tether && s.side !== 'orbit';
        const sx = (subjectX(scene) ?? 0.5) * 1920;
        const sy = subjectY(scene) * 1080;
        return (
          <React.Fragment key={k}>
            {tether ? (
              <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <path
                  d={`M ${x} ${y + fy} Q ${(x + sx) / 2} ${Math.min(y, sy) - 140} ${sx + (x < sx ? -120 : 120)} ${sy}`}
                  fill="none"
                  stroke={accent}
                  strokeWidth={2}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - p}
                  opacity={0.7}
                  style={{ filter: `drop-shadow(0 0 6px ${accent})` }}
                />
              </svg>
            ) : null}
            <div style={{ position: 'absolute', left: x - size, top: y + fy - size, width: size * 2, height: size * 2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              {/* A local pool for contrast (dark under a glow, paper in a light look); the line reads on any ground. */}
              <div style={{ position: 'absolute', inset: 40, borderRadius: '50%', background: pool, opacity: p }} />
              {glow ? <div style={{ position: 'absolute', inset: 58, borderRadius: '50%', border: `1.5px solid ${accent}`, boxShadow: `0 0 18px ${accent}, inset 0 0 18px ${accent}66`, opacity: 0.55 * p, transform: `scale(${0.9 + 0.1 * p})` }} /> : null}
              <div style={{ transform: `scale(${pop})`, opacity: flick }}>
                <LineIcon
                  id={s.icon.id}
                  size={size}
                  color={glow ? lineInk : accent}
                  stroke={1.5}
                  draw={p}
                  style={{ filter: glow ? (lightIcons ? `drop-shadow(0 0 6px ${accent}88)` : `drop-shadow(0 0 3px ${accent}) drop-shadow(0 0 12px ${accent}) drop-shadow(0 0 30px ${accent})`) : `drop-shadow(0 2px 6px rgba(0,0,0,${lightIcons ? 0.25 : 0.6}))`, overflow: 'visible' }}
                />
              </div>
              {s.icon.label ? <BrushTag text={s.icon.label} color={accent} ink={readable('#111111', accent, 4.5)} p={interpolate(f, [a + 6, a + 16], [0, 1], clamp)} /> : null}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

/** A brush-stroke name tag (an organisation shown as a character). */
export const BrushTag: React.FC<{ text: string; color: string; p: number; ink?: string; size?: number }> = ({ text, color, p, ink = '#111111', size = 30 }) => {
  const T = text.toUpperCase();
  const w = Math.max(160, T.length * size * 0.62 + 60);
  const h = size * 1.9;
  const seed = h01(T);
  const d = `M 6 ${h * 0.3} C ${w * 0.3} ${h * (0.12 + seed * 0.1)}, ${w * 0.7} ${h * 0.22}, ${w - 4} ${h * 0.18} L ${w - 10} ${h * 0.86} C ${w * 0.65} ${h * 0.95}, ${w * 0.3} ${h * (0.8 + seed * 0.1)}, 12 ${h * 0.92} Z`;
  return (
    <div style={{ position: 'relative', marginTop: 4, width: w, height: h, transform: `rotate(${-3 + seed * 3}deg)`, opacity: p > 0 ? 1 : 0 }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <path d={d} fill={color} style={{ clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT.oswald, fontWeight: 700, fontSize: size, letterSpacing: '0.06em', color: ink, opacity: p }}>{T}</div>
    </div>
  );
};
