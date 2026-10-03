import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { FONT, caseLocale, setTextLocale, textWidth } from '../fonts';
import { GENRES } from '../genres';
import { applyVariant, variantFor } from '../looks/variants';
import { alpha, contrast, isLight, readable } from '../looks/color';
import type { FontKey, Genre, GenreId } from '../types';
import { THUMB_H as H, THUMB_W as W, fitLines, placePic, subjectBox, type Placed } from './geometry';
import type { Box, ThumbGrade, ThumbPic, ThumbProps, ThumbSpec } from './types';

/*
 * YOUTUBE THUMBNAIL — one 1280x720 still per option, five templates:
 *
 *   hero      the subject "cut out" of its own picture: a sharp feathered crop
 *             with a rim glow over a depth-blurred, darkened copy; huge words
 *             on the dark side (MagnatesMedia / Johnny Harris)
 *   split     before/after: two pictures on a slanted seam, a label on each
 *   circle    the whole picture, one detail ringed in red with an arrow
 *   number    one huge figure beside the subject (ColdFusion / Wendover)
 *   document  the picture as a tilted evidence print with a stamp; words on
 *             printed labels (LEMMiNO case-file feel)
 *
 * Branding is the video's look (src/looks): the variant's headline face,
 * accent and label colours. No face segmentation — strong crops, feathered
 * masks, a rim glow and a blurred copy do the "cut-out" work.
 */

const HEX = /^#[0-9a-f]{6}$/i;
const PUNCH_YELLOW = '#ffd21f';
const PUNCH_RED = '#ff2a1f';
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function brandGenre(p: ThumbProps): Genre {
  const id = (p.brand?.genre ?? p.script?.genre ?? 'documentary') as GenreId;
  const base = GENRES[id] ?? GENRES.documentary;
  return applyVariant(base, variantFor(id, p.brand?.variant ?? p.script?.look?.variant));
}

/** The accent on a dark thumbnail: a light, saturated colour that reads over black. */
function accentOf(spec: ThumbSpec, g: Genre): string {
  if (spec.accent && HEX.test(spec.accent)) return readable(spec.accent, '#000000', 5.5);
  if (spec.accentRole === 'red') return readable(redOf(g), '#000000', 3.6);
  if (spec.accentRole === 'label') return readable(g.labelBg, '#000000', 5.5);
  const want = isLight(g.accent) || contrast(g.accent, '#000000') >= 6 ? g.accent : g.labelBg;
  return readable(want, '#000000', 5.5);
}

/** A strong warning red for rings and arrows (the look's own red when it has one). */
function redOf(g: Genre): string {
  for (const c of [g.accent2, g.accent, g.labelBg]) {
    const [r, gg, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    if (HEX.test(c) && r > 150 && gg < 90 && b < 90) return c;
  }
  return '#e5231b';
}

/* ------------------------------------------------------------------ pictures */

const gradeFilter = (g: ThumbGrade | undefined): string =>
  ({
    natural: 'contrast(1.24) saturate(1.34) brightness(1.08)',
    mono: 'grayscale(1) contrast(1.32) brightness(1.04)',
    cold: 'saturate(0.7) contrast(1.22) brightness(0.96)',
    warm: 'sepia(0.22) saturate(1.45) contrast(1.24) brightness(1.08)',
    duo: 'grayscale(1) contrast(1.28) brightness(1.06)',
  })[g ?? 'natural'];

/** A picture placed in px, graded; duotone and cold tints as blend layers. */
const Pic: React.FC<{ pic: ThumbPic; at: Placed; grade?: ThumbGrade; g: Genre; extra?: string; style?: React.CSSProperties }> = ({ pic, at, grade, g, extra, style }) => (
  <AbsoluteFill style={{ isolation: 'isolate', overflow: 'hidden', ...style }}>
    <Img
      src={staticFile(pic.src)}
      style={{ position: 'absolute', left: at.left, top: at.top, width: at.width, height: at.height, maxWidth: 'none', filter: `${gradeFilter(grade)} ${extra ?? ''}` }}
    />
    {grade === 'duo' ? (
      <>
        <AbsoluteFill style={{ background: g.duoHighlight, mixBlendMode: 'multiply' }} />
        <AbsoluteFill style={{ background: g.duoShadow, mixBlendMode: 'lighten' }} />
      </>
    ) : null}
    {grade === 'cold' ? <AbsoluteFill style={{ background: '#1c4a7a', mixBlendMode: 'soft-light', opacity: 0.75 }} /> : null}
    {grade === 'warm' ? <AbsoluteFill style={{ background: '#7a3b12', mixBlendMode: 'soft-light', opacity: 0.45 }} /> : null}
  </AbsoluteFill>
);

/** The depth layer: the same picture, enlarged, blurred and pushed into the dark. */
const DepthBackdrop: React.FC<{ pic: ThumbPic; g: Genre; grade?: ThumbGrade; dim?: number }> = ({ pic, g, grade, dim = 0.4 }) => {
  const b = subjectBox(pic);
  const at = placePic(pic, { cx: W / 2, cy: H / 2, subjectH: H * 1.5, cover: { x: -60, y: -60, w: W + 120, h: H + 120 }, box: b });
  return <Pic pic={pic} at={at} grade={grade} g={g} extra={`blur(26px) brightness(${dim})`} />;
};

const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.7 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,${strength}) 100%)` }} />
);

/** The feathered ellipse around a subject, kept inside the picture so its hard edge never shows. */
function featherInside(at: Placed, cx: number, cy: number, rx: number, ry: number): { rx: number; ry: number } {
  const room = (a: number, b: number) => Math.max(40, Math.min(a, b));
  const inW = room(cx - at.left, at.left + at.width - cx);
  const inH = room(cy - at.top, at.top + at.height - cy);
  // The frame's own edges need no feathering.
  const wx = at.left <= 0 && at.left + at.width >= W ? rx : Math.min(rx, inW);
  const wy = at.top <= 0 && at.top + at.height >= H ? ry : Math.min(ry, inH);
  return { rx: wx, ry: wy };
}

/* ------------------------------------------------------------------ words */

interface Words {
  lines: string[][];
  size: number;
  font: string;
  upper: string[][];
}

function words(text: string, fontKey: FontKey, box: { w: number; h: number }, cap: number, scale = 1, locale = "en"): Words {
  const up = String(text ?? "").toLocaleUpperCase(caseLocale(locale));
  // A legibility fix (scale > 1) may also borrow a little more room.
  const grow = Math.min(1.15, Math.max(1, scale));
  const fit = fitLines(up, fontKey, { maxW: box.w * grow, maxH: box.h * grow, cap: cap * scale, lineHeight: 0.92 });
  return { lines: fit.lines, size: fit.size, font: FONT[fontKey], upper: fit.lines };
}

/** Big outlined words; `hi` (word index over the whole text) in the accent. */
const BigWords: React.FC<{
  w: Words;
  x: number;
  y: number;
  width: number;
  height: number;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'center' | 'bottom';
  color: string;
  accent: string;
  hi?: number;
  mode?: 'plain' | 'label';
  labelBg?: string;
  labelInk?: string;
  hiBg?: string;
  hiInk?: string;
  /** Numbers in the line drawn in this colour (the punch red). */
  numColor?: string;
}> = ({ w, x, y, width, height, align = 'left', valign = 'center', color, accent, hi = -1, mode = 'plain', labelBg, labelInk, hiBg, hiInk, numColor }) => {
  let k = 0;
  // Punch: a thick black stroke reads at 320x180 on any picture (user: "tıklanacak hale getir").
  const stroke = Math.max(5, Math.round(w.size * 0.075));
  // No highlight chosen: the last line is the accent line ("70 SHIPS. / ONE HILL.").
  const total = w.lines.reduce((n, l) => n + l.length, 0);
  const lastFrom = total - (w.lines.at(-1)?.length ?? 0);
  const isHiAt = (idx: number) => (hi >= 0 ? idx === hi : w.lines.length > 1 && idx >= lastFrom);
  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width, height, display: 'flex', flexDirection: 'column',
        justifyContent: valign === 'top' ? 'flex-start' : valign === 'bottom' ? 'flex-end' : 'center',
        alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
      }}
    >
      {w.lines.map((line, li) => (
        <div key={li} style={{ fontFamily: w.font, fontSize: w.size, lineHeight: mode === 'label' ? 1.02 : 0.92, letterSpacing: '0.01em', whiteSpace: 'nowrap', marginTop: mode === 'label' && li ? w.size * 0.08 : 0 }}>
          {line.map((word, wi) => {
            const idx = k++;
            const isHi = isHiAt(idx);
            if (mode === 'label') {
              return (
                <span
                  key={wi}
                  style={{
                    display: 'inline-block', background: isHi ? hiBg : labelBg, color: isHi ? hiInk : labelInk,
                    padding: `${w.size * 0.04}px ${w.size * 0.1}px 0`, marginRight: w.size * 0.12,
                    boxShadow: `${w.size * 0.05}px ${w.size * 0.06}px 0 rgba(0,0,0,0.85)`,
                  }}
                >
                  {word}
                </span>
              );
            }
            return (
              <span
                key={wi}
                style={{
                  color: isHi ? accent : numColor && /\d/.test(word) ? numColor : color,
                  WebkitTextStroke: `${stroke}px rgba(0,0,0,0.95)`,
                  paintOrder: 'stroke fill',
                  textShadow: `0 ${w.size * 0.04}px ${w.size * 0.1}px rgba(0,0,0,0.9)`,
                  marginRight: wi < line.length - 1 ? w.size * 0.2 : 0,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** A small printed chip (a year, "FBI FILE"). */
const Tag: React.FC<{ text: string; x: number; y: number; bg: string; ink: string; font: string; size?: number; rotate?: number }> = ({ text, x, y, bg, ink, font, size = 44, rotate = 0 }) => (
  <div
    style={{
      position: 'absolute', left: x, top: y, background: bg, color: ink, fontFamily: font, fontSize: size, lineHeight: 1,
      padding: `${size * 0.16}px ${size * 0.32}px ${size * 0.08}px`, letterSpacing: '0.04em', transform: `rotate(${rotate}deg)`,
      boxShadow: '4px 5px 0 rgba(0,0,0,0.8)', whiteSpace: 'nowrap',
    }}
  >
    {text}
  </div>
);

/* ------------------------------------------------------------------ templates */

interface Ctx {
  spec: ThumbSpec;
  g: Genre;
  accent: string;
  red: string;
  head: FontKey;
  locale: string;
  scale: number;
  scrim: number;
}

/** Subject "cut out": sharp feathered crop with a rim glow over the depth layer. */
function Hero({ spec, g, accent, head, locale, scale, scrim }: Ctx) {
  const side = spec.side ?? 'left';
  const zoom = clamp(spec.zoom ?? 1, 0.6, 2.2);
  const cx = side === 'left' ? W * 0.7 : W * 0.3;
  // The sharp layer only has to span the frame's height around the subject: the depth layer fills the rest.
  const at = placePic(spec.hero, { cx, cy: H * 0.53, subjectH: H * 0.95 * zoom, maxSubjectW: W * 0.64 * zoom, cover: { x: cx - 40, y: 0, w: 80, h: H } });
  const s = at.subject;
  const scx = s.x + s.w / 2;
  const scy = s.y + s.h / 2;
  const { rx, ry } = featherInside(at, scx, scy, Math.max(s.w * 1.0, 320), Math.max(s.h * 0.95, 360));
  const fade = side === 'left' ? 'to right' : 'to left';
  const tw = words(spec.text, head, { w: W * 0.5, h: H * 0.72 }, 230, scale, locale);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <DepthBackdrop pic={spec.hero} g={g} grade={spec.grade} dim={0.62} />
      {/* warm glow behind the subject: fire-light, never a cold flat ground */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse ${rx}px ${ry}px at ${scx}px ${scy}px, rgba(255,150,40,0.42) 0%, rgba(255,120,30,0.16) 45%, rgba(0,0,0,0) 72%)`, mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ filter: `drop-shadow(0 0 34px ${alpha(accent, 0.45)})` }}>
        <AbsoluteFill
          style={{
            WebkitMaskImage: `linear-gradient(${fade}, rgba(0,0,0,0) 26%, #000 46%)`,
            maskImage: `linear-gradient(${fade}, rgba(0,0,0,0) 26%, #000 46%)`,
          }}
        >
          <AbsoluteFill
            style={{
              WebkitMaskImage: `radial-gradient(ellipse ${rx}px ${ry}px at ${scx}px ${scy}px, #000 50%, rgba(0,0,0,0.55) 78%, rgba(0,0,0,0) 100%)`,
              maskImage: `radial-gradient(ellipse ${rx}px ${ry}px at ${scx}px ${scy}px, #000 50%, rgba(0,0,0,0.55) 78%, rgba(0,0,0,0) 100%)`,
            }}
          >
            <Pic pic={spec.hero} at={at} grade={spec.grade} g={g} />
          </AbsoluteFill>
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(${fade}, rgba(0,0,0,${0.72 + scrim * 0.2}) 0%, rgba(0,0,0,${0.36 + scrim * 0.3}) 34%, rgba(0,0,0,0) 54%)` }} />
      <Vignette strength={0.45} />
      {spec.tag ? <Tag text={spec.tag.toLocaleUpperCase(caseLocale(locale))} x={side === 'left' ? 58 : W * 0.62} y={H - 118} bg={g.labelBg} ink={g.labelInk} font={FONT[head]} /> : null}
      <BigWords w={tw} x={side === 'left' ? 52 : W * 0.48} y={90} width={W * 0.5} height={H * 0.72} align={side === 'left' ? 'left' : 'right'} color="#ffffff" accent={accent} hi={spec.highlight} numColor={PUNCH_RED} />
    </AbsoluteFill>
  );
}

/** Before / after on a slanted seam. */
function Split({ spec, g, accent, head, locale, scale, scrim }: Ctx) {
  const second = spec.second ?? spec.hero;
  const same = !spec.second;
  const seamTop = W * 0.54;
  const seamBot = W * 0.46;
  const L = placePic(spec.hero, { cx: W * 0.26, cy: H * 0.42, subjectH: H * 0.78 * (spec.zoom ?? 1), maxSubjectW: W * 0.46, cover: { x: 0, y: 0, w: seamTop + 10, h: H } });
  const secondBox: Box | undefined = same ? spec.hero.detail ?? undefined : undefined;
  const R = placePic(second, { cx: W * 0.74, cy: H * 0.42, subjectH: H * (same ? 1.05 : 0.78), maxSubjectW: W * 0.46, cover: { x: seamBot - 10, y: 0, w: W - seamBot + 10, h: H }, box: secondBox });
  const tw = words(spec.text, head, { w: W * 0.9, h: H * 0.3 }, 170, scale, locale);
  const labels = spec.labels ?? ['', ''];
  const up = (t: string) => t.toLocaleUpperCase(caseLocale(locale));
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ clipPath: `polygon(0 0, ${seamTop}px 0, ${seamBot}px ${H}px, 0 ${H}px)` }}>
        <Pic pic={spec.hero} at={L} grade={spec.grade === 'natural' ? 'mono' : spec.grade ?? 'mono'} g={g} />
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `polygon(${seamTop}px 0, ${W}px 0, ${W}px ${H}px, ${seamBot}px ${H}px)` }}>
        <Pic pic={second} at={R} grade={same ? 'natural' : 'natural'} g={g} />
      </AbsoluteFill>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line x1={seamTop} y1={-10} x2={seamBot} y2={H + 10} stroke="#000" strokeWidth={26} />
        <line x1={seamTop} y1={-10} x2={seamBot} y2={H + 10} stroke={accent} strokeWidth={14} />
      </svg>
      <AbsoluteFill style={{ background: `linear-gradient(to top, rgba(0,0,0,${0.85 + scrim * 0.15}) 0%, rgba(0,0,0,${0.55 + scrim * 0.3}) 30%, rgba(0,0,0,0) 52%)` }} />
      <Vignette strength={0.5} />
      {labels[0] ? <Tag text={up(labels[0])} x={40} y={36} bg="#ffffff" ink="#111111" font={FONT[head]} size={52} rotate={-2} /> : null}
      {labels[1] ? <Tag text={up(labels[1])} x={W - 40 - Math.max(120, up(labels[1]).length * 30)} y={36} bg={g.labelBg} ink={g.labelInk} font={FONT[head]} size={52} rotate={2} /> : null}
      <BigWords w={tw} x={W * 0.05} y={H * 0.66} width={W * 0.9} height={H * 0.3} align="center" valign="bottom" color="#ffffff" accent={accent} hi={spec.highlight} numColor={PUNCH_RED} />
    </AbsoluteFill>
  );
}

/** One detail ringed in red, an arrow from the words. */
function Circle({ spec, g, accent, red, head, locale, scale, scrim }: Ctx) {
  const side = spec.side ?? 'left';
  const detail = spec.hero.detail ?? subjectBox(spec.hero);
  const zoom = clamp(spec.zoom ?? 1, 0.6, 2.2);
  const at = placePic(spec.hero, { cx: side === 'left' ? W * 0.68 : W * 0.32, cy: H * 0.5, subjectH: H * 0.36 * zoom, maxSubjectW: W * 0.34 * zoom, cover: { x: 0, y: 0, w: W, h: H }, box: detail, reach: 1.6, maxScale: 1.8 });
  const s = at.subject;
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  // The ring stays inside the frame (a ring cut by the edge reads as a mistake).
  // /1.12: the hand-drawn wobble and overshoot reach ~11% past the radius.
  // ...and out of the words' column: a ring through the words reads as a scribble.
  const textEdge = side === 'left' ? W * 0.47 : W * 0.53;
  const clearOfText = side === 'left' ? (cx - textEdge) / 1.12 : (textEdge - cx) / 1.12;
  const rx = clamp(Math.min(s.w * 0.72, (cx - 26) / 1.12, (W - cx - 26) / 1.12, clearOfText), 70, W * 0.3);
  const ry = clamp(Math.min(s.h * 0.72, (cy - 26) / 1.12, (H - cy - 26) / 1.12), 60, H * 0.4);
  // A hand-drawn ring: one and a bit turns, the end overshooting the start.
  const pts: string[] = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2.15 - 1.9;
    const wob = 1 + 0.035 * Math.sin(i * 0.9) + (i / 64) * 0.06;
    pts.push(`${(cx + Math.cos(t) * rx * wob).toFixed(1)},${(cy + Math.sin(t) * ry * wob).toFixed(1)}`);
  }
  const ring = `M ${pts.join(' L ')}`;
  const tw = words(spec.text, head, { w: W * 0.44, h: H * 0.62 }, 210, scale, locale);
  // Arrow from the words' edge to the ring.
  const blockW = Math.max(...tw.lines.map((l) => textWidth(l.join(' '), head, tw.size, { trackEm: 0.01 })), 0);
  const blockH = tw.lines.length * tw.size * 0.92;
  const textTop = H * 0.16 + (H * 0.62 - blockH) / 2;
  const textLeft = side === 'left' ? 50 : W * 0.98 - blockW;
  // The arrow leaves from under the words when there is room there, else from their side, and bends into the ring.
  const below = textTop + blockH + 150 < H;
  const ax0 = below ? textLeft + blockW * (side === 'left' ? 0.55 : 0.45) : side === 'left' ? textLeft + blockW + 30 : textLeft - 30;
  const ay0 = below ? textTop + blockH + 26 : textTop + blockH * 0.55;
  const ang = Math.atan2(cy - ay0, cx - ax0);
  const ax1 = cx - Math.cos(ang) * rx * 1.1;
  const ay1 = cy - Math.sin(ang) * ry * 1.1;
  const mx = ax0 + (ax1 - ax0) * 0.4;
  const my = Math.max(ay0, ay1) + 60;
  const tang = Math.atan2(ay1 - my, ax1 - mx);
  const head2 = (a: number, len: number) => [ax1 - Math.cos(tang + a) * len, ay1 - Math.sin(tang + a) * len];
  const arrowLong = Math.hypot(ax1 - ax0, ay1 - ay0) > 90;
  const fade = side === 'left' ? 'to right' : 'to left';
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Pic pic={spec.hero} at={at} grade={spec.grade} g={g} />
      <AbsoluteFill style={{ background: `linear-gradient(${fade}, rgba(0,0,0,${0.74 + scrim * 0.18}) 0%, rgba(0,0,0,${0.4 + scrim * 0.3}) 34%, rgba(0,0,0,0) 54%)` }} />
      <Vignette strength={0.45} />
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={ring} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={24} strokeLinecap="round" strokeLinejoin="round" />
        <path d={ring} fill="none" stroke={red} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
        {arrowLong ? (
          <>
            <path d={`M ${ax0} ${ay0} Q ${mx} ${my} ${ax1} ${ay1}`} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={24} strokeLinecap="round" />
            <path d={`M ${ax0} ${ay0} Q ${mx} ${my} ${ax1} ${ay1}`} fill="none" stroke={red} strokeWidth={15} strokeLinecap="round" />
            <polygon points={`${ax1},${ay1} ${head2(0.55, 58).join(',')} ${head2(-0.55, 58).join(',')}`} fill={red} stroke="#000" strokeOpacity={0.5} strokeWidth={4} />
          </>
        ) : null}
      </svg>
      {spec.tag ? <Tag text={spec.tag.toLocaleUpperCase(caseLocale(locale))} x={side === 'left' ? 56 : W - 360} y={50} bg={g.labelBg} ink={g.labelInk} font={FONT[head]} /> : null}
      <BigWords w={tw} x={side === 'left' ? 50 : W * 0.54} y={H * 0.16} width={W * 0.44} height={H * 0.62} align={side === 'left' ? 'left' : 'right'} valign="center" color="#ffffff" accent={accent} hi={spec.highlight} numColor={PUNCH_RED} />
    </AbsoluteFill>
  );
}

/** One huge figure beside the subject. */
function NumberT({ spec, g, accent, head, locale, scale, scrim }: Ctx) {
  const side = spec.side ?? 'left';
  const zoom = clamp(spec.zoom ?? 1, 0.6, 2.2);
  const at = placePic(spec.hero, { cx: side === 'left' ? W * 0.74 : W * 0.26, cy: H * 0.52, subjectH: H * 0.78 * zoom, maxSubjectW: W * 0.5 * zoom, cover: { x: 0, y: 0, w: W, h: H }, reach: 1.8 });
  const s = at.subject;
  const rx = Math.max(s.w * 0.8, 240);
  const ry = Math.max(s.h * 0.8, 280);
  const scx = s.x + s.w / 2;
  const scy = s.y + s.h / 2;
  const fade = side === 'left' ? 'to right' : 'to left';
  const num = String(spec.number ?? '').toLocaleUpperCase(caseLocale(locale));
  const nw = words(num, head, { w: W * 0.6, h: H * 0.5 }, 330, scale, locale);
  const rest = words(spec.text, head, { w: W * 0.58, h: H * 0.24 }, 130, scale, locale);
  const x = side === 'left' ? 48 : W * 0.38;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <DepthBackdrop pic={spec.hero} g={g} grade={spec.grade} dim={0.55} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse ${rx}px ${ry}px at ${scx}px ${scy}px, rgba(255,150,40,0.36) 0%, rgba(0,0,0,0) 70%)`, mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ WebkitMaskImage: `radial-gradient(ellipse ${rx}px ${ry}px at ${scx}px ${scy}px, #000 55%, rgba(0,0,0,0) 100%)`, maskImage: `radial-gradient(ellipse ${rx}px ${ry}px at ${scx}px ${scy}px, #000 55%, rgba(0,0,0,0) 100%)` }}>
        <Pic pic={spec.hero} at={at} grade={spec.grade} g={g} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(${fade}, rgba(0,0,0,${0.74 + scrim * 0.2}) 0%, rgba(0,0,0,${0.4 + scrim * 0.3}) 40%, rgba(0,0,0,0) 60%)` }} />
      <Vignette strength={0.45} />
      <BigWords w={nw} x={x} y={H * 0.1} width={W * 0.6} height={H * 0.52} align={side === 'left' ? 'left' : 'right'} valign="bottom" color={accent} accent={accent} />
      <BigWords w={rest} x={x} y={H * 0.63} width={W * 0.58} height={H * 0.26} align={side === 'left' ? 'left' : 'right'} valign="top" color="#ffffff" accent={accent} hi={spec.highlight} numColor={PUNCH_RED} />
    </AbsoluteFill>
  );
}

/** The picture as a tilted evidence print with a stamp; words on printed labels. */
function DocumentT({ spec, g, accent, red, head, locale, scale }: Ctx) {
  const side = spec.side ?? 'left';
  const cardW = W * 0.52;
  const cardH = H * 0.86;
  const border = 16;
  const cardX = side === 'left' ? W - cardW - 40 : 40;
  const cardY = (H - cardH) / 2;
  const inner = { x: 0, y: 0, w: cardW - border * 2, h: cardH - border * 2 };
  const zoom = clamp(spec.zoom ?? 1, 0.6, 2.2);
  // A document read at phone size: its telling detail (a name, a stamp) fills the print when the picture has one.
  const focus = spec.hero.detail;
  const at = focus
    ? placePic(spec.hero, { cx: inner.w / 2, cy: inner.h / 2, subjectH: inner.h * 0.42 * zoom, maxSubjectW: inner.w * 0.8 * zoom, cover: inner, box: focus, reach: 2 })
    : placePic(spec.hero, { cx: inner.w / 2, cy: inner.h / 2, subjectH: inner.h * 0.8 * zoom, maxSubjectW: inner.w * 0.9 * zoom, cover: inner });
  const tw = words(spec.text, head, { w: W * 0.4, h: H * 0.6 }, 150, scale, locale);
  const paper = g.paper && isLight(g.paper) ? g.paper : '#efe9dc';
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <DepthBackdrop pic={spec.hero} g={g} grade={spec.grade} dim={0.48} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at ${side === 'left' ? '70%' : '30%'} 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.7) 100%)` }} />
      <div
        style={{
          position: 'absolute', left: cardX, top: cardY, width: cardW, height: cardH, background: paper, padding: border, boxSizing: 'border-box',
          transform: `rotate(${side === 'left' ? 3 : -3}deg)`, boxShadow: '18px 26px 50px rgba(0,0,0,0.85)',
        }}
      >
        <div style={{ position: 'relative', width: inner.w, height: inner.h, overflow: 'hidden' }}>
          <Pic pic={spec.hero} at={at} grade={spec.grade ?? 'mono'} g={g} />
        </div>
        {spec.tag ? (
          <div
            style={{
              position: 'absolute', right: 34, bottom: 46, border: `8px solid ${red}`, color: red, fontFamily: FONT[head], fontSize: 76, lineHeight: 1,
              padding: '10px 22px 2px', transform: 'rotate(-11deg)', letterSpacing: '0.06em', opacity: 0.92, background: alpha(paper, 0.25), whiteSpace: 'nowrap',
            }}
          >
            {spec.tag.toLocaleUpperCase(caseLocale(locale))}
          </div>
        ) : null}
      </div>
      <BigWords
        w={tw} x={side === 'left' ? 50 : W * 0.56} y={H * 0.18} width={W * 0.42} height={H * 0.64} align={side === 'left' ? 'left' : 'right'}
        color="#ffffff" accent={accent} hi={spec.highlight} mode="label" labelBg={g.labelBg} labelInk={g.labelInk} hiBg={red} hiInk="#ffffff"
      />
    </AbsoluteFill>
  );
}

export const Thumbnail: React.FC<Record<string, unknown>> = (raw) => {
  const p = raw as unknown as ThumbProps;
  const spec = p.thumb;
  const locale = p.brand?.locale ?? p.script?.locale ?? 'en';
  setTextLocale(locale);
  const g = brandGenre(p);
  const ctx: Ctx = {
    spec,
    g,
    // The channel's punch: Anton, yellow highlight, red numbers — the same on every video, whatever its look.
    accent: spec.accent && HEX.test(spec.accent) ? accentOf(spec, g) : PUNCH_YELLOW,
    red: PUNCH_RED,
    head: 'anton',
    locale,
    scale: clamp(spec.textScale ?? 1, 0.7, 1.4),
    scrim: clamp(spec.scrim ?? 0, 0, 1),
  };
  if (!spec?.hero?.src) return <AbsoluteFill style={{ background: g.bg }} />;
  switch (spec.layout) {
    case 'split':
      return Split(ctx);
    case 'circle':
      return Circle(ctx);
    case 'number':
      return spec.number ? NumberT(ctx) : Hero(ctx);
    case 'document':
      return DocumentT(ctx);
    default:
      return Hero(ctx);
  }
};
