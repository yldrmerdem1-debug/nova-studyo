import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, fitFont, textWidth } from './fonts';
import { Media, PatternBg, clipOf } from './fx';
import { alpha, contrast, isLight, mix, readable } from './looks/color';
import { useLook } from './looks/context';
import { paperTexture } from './paper';
import { UNIT, UNIT_GAP, UNIT_TRACK, counterFit, counterFrom, formatCount, isUnitWord } from './scenes';
import { counterCountEnd } from './opening/timing';
import type { CounterScene, CounterStyle, FontKey, Genre } from './types';

/*
 * COUNTER TREATMENTS beyond the original box (src/looks/catalog.ts
 * COUNTER_STYLES; which counter gets which: src/looks/counters.ts). Every one
 * counts the same way as the box — 3 frames in, ease-out to the figure at
 * 0.9 s — so the voice lands on the same frame whatever the treatment; what
 * changes is the object the number is printed on.
 */

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const outCubic = Easing.out(Easing.cubic);
const outExpo = Easing.out(Easing.exp);
const NUMS: React.CSSProperties = { fontVariantNumeric: 'lining-nums tabular-nums' };

interface Props {
  scene: CounterScene;
  genre: Genre;
  locale: string;
  durFrames: number;
  speed: number;
  style: CounterStyle;
}

/** The count, as every treatment shows it. */
function useCount(scene: CounterScene, locale: string) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // The count lasts as long as the narrator takes to say the number (it lands on its last word).
  const end = counterCountEnd(scene, fps);
  const from = counterFrom(scene);
  const t = interpolate(f, [3, end], [0, 1], { ...clamp, easing: outCubic });
  const value = t >= 1 ? scene.to : from + (scene.to - from) * t;
  return { f, fps, end, t, from, value, text: formatCount(value, scene, locale) };
}

/** The ground colour type sits on (the scene's backdrop, else the look's). */
function useGround(genre: Genre): string {
  const b = useLook().backdrop;
  if (!b) return genre.bg;
  if (b.kind === 'split-color') return b.color2 ?? genre.bg;
  if (b.kind === 'blur') return '#202020';
  return b.color ?? genre.bg;
}

/** Prefix / suffix: a word unit set small and tracked, a symbol full size. */
const Unit: React.FC<{ s?: string; side: 'pre' | 'suf'; size: number }> = ({ s, side, size }) => {
  if (!s) return null;
  if (!isUnitWord(s)) return <span style={{ whiteSpace: 'pre' }}>{s}</span>;
  return (
    <span style={{ fontSize: size * UNIT, letterSpacing: `${UNIT_TRACK}em`, textTransform: 'uppercase', whiteSpace: 'pre', [side === 'pre' ? 'marginRight' : 'marginLeft']: size * UNIT_GAP }}>
      {s.trim()}
    </span>
  );
};

/** Numeral size so prefix + widest figure + suffix fit `maxW` (capped). */
function numeralSize(scene: CounterScene, locale: string, font: FontKey, maxW: number, cap: number): number {
  const { lineEm } = counterFit(scene, locale, font, maxW + 160);
  return Math.floor(Math.min(cap, maxW / (Math.max(0.5, lineEm) * 1.04)));
}

const labelOf = (scene: CounterScene) => String(scene.label ?? '').trim();

export const StyledCounter: React.FC<Props> = (p) => {
  switch (p.style) {
    case 'bare':
      return <Bare {...p} />;
    case 'odometer':
      return <Odometer {...p} />;
    case 'photo':
      return <PhotoCounter {...p} />;
    case 'ticker':
      return <Ticker {...p} />;
    case 'newsprint':
      return <Newsprint {...p} />;
    case 'outline':
      return <Outline {...p} />;
    default:
      return null;
  }
};

/* ------------------------------------------------------------------ bare */

/** A huge bare numeral flush left, a thin accent rule drawing in beside it, a small-caps label. */
const Bare: React.FC<Props> = ({ scene, genre, locale, durFrames, speed }) => {
  const { f, text, end } = useCount(scene, locale);
  const ground = useGround(genre);
  const font = genre.headline;
  const size = numeralSize(scene, locale, font, 1500, 300);
  const label = labelOf(scene);
  const labelSize = label ? fitFont(label, genre.body, { maxW: 1400, cap: 38, trackPx: 0.24 * 38, upper: true }) : 0;
  const ink = readable(genre.ink, ground, 7);
  const rule = readable(genre.accent, ground, 3);
  // Ink warmed by the accent: the pure accent red read as a dim smear over a picture (Napoleon "~10,000").
  const labelInk = readable(mix(genre.ink, genre.accent, 0.3), ground, 7);
  const rise = interpolate(f, [0, 10], [1, 0], { ...clamp, easing: outExpo });
  const ruleW = interpolate(f, [end - 6, end + 10], [0, 1], { ...clamp, easing: outCubic });
  const cam = interpolate(f, [0, durFrames], [1, 1 + 0.045 * speed], clamp);
  const numW = textWidth(formatCount(scene.to, scene, locale), font, size);
  return (
    <AbsoluteFill>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 170, boxSizing: 'border-box', transform: `scale(${cam})`, transformOrigin: '170px 50%' }}>
        <div style={{ overflow: 'hidden', paddingBottom: size * 0.06 }}>
          <div
            style={{
              ...NUMS,
              display: 'flex',
              alignItems: 'baseline',
              whiteSpace: 'nowrap',
              fontFamily: FONT[font],
              fontWeight: 700,
              fontSize: size,
              lineHeight: 1,
              letterSpacing: 0,
              color: ink,
              transform: `translateY(${rise * size * 0.9}px)`,
            }}
          >
            <Unit s={scene.prefix} side="pre" size={size} />
            <span style={{ whiteSpace: 'pre' }}>{text}</span>
            <Unit s={scene.suffix} side="suf" size={size} />
          </div>
        </div>
        <div style={{ height: 18 }} />
        {label ? (
          <div
            style={{
              marginTop: 22,
              fontFamily: FONT[genre.body],
              fontWeight: 700,
              fontSize: labelSize,
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: labelInk,
              whiteSpace: 'nowrap',
              opacity: interpolate(f, [end - 2, end + 10], [0, 1], clamp),
              transform: `translateX(${interpolate(f, [end - 2, end + 12], [-18, 0], { ...clamp, easing: outCubic })}px)`,
            }}
          >
            {label}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* -------------------------------------------------------------- odometer */

/** Every digit on its own drum, rolling into place; the low digits spin fastest. */
const Odometer: React.FC<Props> = ({ scene, genre, locale, durFrames, speed }) => {
  const { f, t, value, end } = useCount(scene, locale);
  const ground = useGround(genre);
  const final = formatCount(scene.to, scene, locale);
  const chars = [...final];
  const nDigits = chars.filter((c) => /\d/.test(c)).length;
  const dec = scene.decimals ?? 0;
  const pre = scene.prefix ?? '';
  const suf = scene.suffix ?? '';
  const font = genre.headline;
  // Width in units of the digit size: a drum is 0.74 wide, a separator 0.32, units as set.
  const unitW = (s: string) => (s ? (isUnitWord(s) ? (textWidth(s.trim(), font, 100, { trackEm: UNIT_TRACK }) / 100) * UNIT + UNIT_GAP + 0.1 : textWidth(s, font, 100) / 100 + 0.12) : 0);
  const widthEm = nDigits * 0.74 + (chars.length - nDigits) * 0.32 + unitW(pre) + unitW(suf);
  const size = Math.floor(Math.min(210, 1560 / widthEm));
  const cellW = size * 0.74;
  const cellH = size * 1.22;
  const label = labelOf(scene);
  const labelSize = label ? fitFont(label, genre.body, { maxW: 1400, cap: 40, trackPx: 0.2 * 40, upper: true }) : 0;
  const ink = readable(genre.ink, ground, 7);
  const drum = '#121110';
  const digitInk = '#f3efe6';
  const pop = interpolate(f, [0, 8], [0.92, 1], { ...clamp, easing: outCubic });
  const cam = interpolate(f, [0, durFrames], [1, 1 + 0.05 * speed], clamp);
  let k = 0;
  const v = Math.abs(value);
  const cells = chars.map((c, i) => {
    if (!/\d/.test(c)) {
      return (
        <div key={i} style={{ width: size * 0.32, height: cellH, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: FONT[font], fontWeight: 700, fontSize: size * 0.8, color: digitInk, lineHeight: 1.2 }}>
          {c}
        </div>
      );
    }
    const place = nDigits - dec - 1 - k++;
    // Continuous drum position: (value / 10^place) mod 10. At rest it is exactly the digit.
    const pos = t >= 1 ? Number(c) : ((v / Math.pow(10, place)) % 10 + 10) % 10;
    const blur = t < 1 ? Math.min(5, (1 - t) * (place <= 0 ? 6 : place === 1 ? 3 : 1)) : 0;
    return (
      <div
        key={i}
        style={{
          position: 'relative',
          width: cellW,
          height: cellH,
          margin: `0 ${size * 0.025}px`,
          background: `linear-gradient(90deg, #000 0%, ${drum} 12%, ${mix(drum, '#ffffff', 0.08)} 50%, ${drum} 88%, #000 100%)`,
          borderRadius: size * 0.06,
          overflow: 'hidden',
          boxShadow: `inset 0 0 0 2px ${alpha('#ffffff', 0.06)}, 0 ${size * 0.05}px ${size * 0.12}px rgba(0,0,0,0.45)`,
        }}
      >
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, transform: `translateY(${-pos * cellH}px)`, filter: blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : undefined }}>
          {Array.from({ length: 11 }, (_, d) => (
            <div key={d} style={{ ...NUMS, height: cellH, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT[font], fontWeight: 700, fontSize: size, color: digitInk, lineHeight: 1 }}>
              {d % 10}
            </div>
          ))}
        </div>
        {/* The drum's curvature: dark top and bottom, a highlight line across the middle. */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 28%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.75) 100%)' }} />
      </div>
    );
  });
  return (
    <AbsoluteFill>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${cam * pop})` }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: size * 0.12, background: alpha(isLight(ground) ? '#2a2622' : '#000000', isLight(ground) ? 0.92 : 0.55), borderRadius: size * 0.1, boxShadow: '0 30px 60px rgba(0,0,0,0.35)' }}>
          {pre ? <div style={{ fontFamily: FONT[font], fontWeight: 700, fontSize: isUnitWord(pre) ? size * UNIT : size * 0.8, letterSpacing: isUnitWord(pre) ? `${UNIT_TRACK}em` : undefined, textTransform: 'uppercase', color: digitInk, margin: `0 ${size * 0.12}px 0 ${size * 0.04}px` }}>{pre.trim()}</div> : null}
          {cells}
          {suf ? <div style={{ fontFamily: FONT[font], fontWeight: 700, fontSize: isUnitWord(suf) ? size * UNIT : size * 0.8, letterSpacing: isUnitWord(suf) ? `${UNIT_TRACK}em` : undefined, textTransform: 'uppercase', color: digitInk, margin: `0 ${size * 0.04}px 0 ${size * 0.12}px` }}>{suf.trim()}</div> : null}
        </div>
        {label ? (
          <div
            style={{
              marginTop: 34,
              fontFamily: FONT[genre.body],
              fontWeight: 700,
              fontSize: labelSize,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: ink,
              whiteSpace: 'nowrap',
              opacity: interpolate(f, [end - 4, end + 8], [0, 1], clamp),
            }}
          >
            {label}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ----------------------------------------------------------------- photo */

/** The figure over the picture before it: darkened, slowly pushing in, the number landing on the place it is about. */
const PhotoCounter: React.FC<Props> = ({ scene, genre, locale, durFrames, speed }) => {
  const { f, t, text, end } = useCount(scene, locale);
  const pic = useLook().picture;
  const font = genre.headline;
  const size = numeralSize(scene, locale, font, 1460, 290);
  const label = labelOf(scene);
  const labelSize = label ? fitFont(label, genre.body, { maxW: 1300, cap: 40, trackPx: 0.22 * 40, upper: true }) : 0;
  const z = interpolate(f, [0, durFrames], [1.06, 1.06 + 0.08 * speed], clamp);
  const dim = interpolate(f, [0, 10], [0.15, 1], clamp);
  const accent = readable(genre.accent, '#141414', 4.5);
  const spin = 1 - t;
  const clip = pic?.image ? undefined : clipOf(pic ?? undefined);
  return (
    <AbsoluteFill style={{ background: '#0b0b0b', overflow: 'hidden' }}>
      {pic?.image || clip ? (
        <AbsoluteFill style={{ transform: `scale(${z})` }}>
          <Media src={pic?.image} clip={clip} durFrames={durFrames} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.8) brightness(0.9)' }} />
        </AbsoluteFill>
      ) : (
        <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      )}
      <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(0,0,0,${0.82 * dim}) 0%, rgba(0,0,0,${0.62 * dim}) 55%, rgba(0,0,0,${0.4 * dim}) 100%)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(0deg, rgba(0,0,0,${0.55 * dim}) 0%, rgba(0,0,0,0) 60%)` }} />
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: '0 0 150px 150px', boxSizing: 'border-box' }}>
        {label ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontFamily: FONT[genre.body],
              fontWeight: 700,
              fontSize: labelSize,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#f4f1ea',
              whiteSpace: 'nowrap',
              marginBottom: 6,
              opacity: interpolate(f, [2, 12], [0, 1], clamp),
            }}
          >
            {label}
          </div>
        ) : null}
        <div
          style={{
            ...NUMS,
            display: 'flex',
            alignItems: 'baseline',
            whiteSpace: 'nowrap',
            fontFamily: FONT[font],
            fontWeight: 700,
            fontSize: size,
            lineHeight: 1.02,
            color: '#ffffff',
            textShadow: `0 6px 40px rgba(0,0,0,0.6)${spin > 0.05 ? `, 0 ${spin * 14}px ${spin * 10}px rgba(255,255,255,0.5)` : ''}`,
            transform: `scale(${f >= end ? interpolate(f - end, [0, 3, 8], [1, 1.04, 1], clamp) : 1})`,
            transformOrigin: '0% 100%',
          }}
        >
          <Unit s={scene.prefix} side="pre" size={size} />
          <span style={{ whiteSpace: 'pre' }}>{text}</span>
          <Unit s={scene.suffix} side="suf" size={size} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------------- ticker */

/** Stock-ticker paper tape sliding across the frame; the figure printed on it in mono type. */
const Ticker: React.FC<Props> = ({ scene, genre, locale, durFrames }) => {
  const { f, fps, text, end } = useCount(scene, locale);
  const ground = useGround(genre);
  const paper = '#ece2c6';
  const ink = '#1a1610';
  const mark = readable(genre.accent, paper, 4.5);
  const pre = scene.prefix ?? '';
  const suf = scene.suffix ?? '';
  const label = labelOf(scene).toLocaleUpperCase(locale);
  const fig = `${pre}${formatCount(scene.to, scene, locale)}${suf ? (isUnitWord(suf) ? ` ${suf.trim().toLocaleUpperCase(locale)}` : suf) : ''}`;
  const figW = textWidth(fig, 'plexMono', 100) / 100;
  const size = Math.floor(Math.min(150, 1300 / Math.max(1, figW)));
  const labSize = label ? Math.min(44, Math.floor(1500 / Math.max(1, textWidth(label, 'plexMono', 100) / 100))) : 0;
  const tapeH = size * 1.25 + (label ? labSize * 1.6 : 0) + 40;
  // The tape runs in from the right, settles with the count, then keeps creeping like a live feed.
  const slide = interpolate(f, [0, end + 6], [1100, 0], { ...clamp, easing: outExpo });
  const drift = -(f / fps) * 14;
  const shown = `${pre}${text}${suf ? (isUnitWord(suf) ? ` ${suf.trim().toLocaleUpperCase(locale)}` : suf) : ''}`;
  // The tape repeats this counter's own entry: no invented quotes on screen.
  const entry = label ? `${label}  ${fig}` : fig;
  const filler = (_seed: string, n: number) => Array.from({ length: n }, () => entry).join('   ▪   ');
  const tape = (key: string, y: number, rot: number, scale: number, opacity: number, blur: number, dx: number, main: boolean) => (
    <div
      key={key}
      style={{
        position: 'absolute',
        left: -400,
        width: W + 800,
        top: y - (tapeH * scale) / 2,
        height: tapeH * scale,
        transform: `rotate(${rot}deg)`,
        opacity,
        filter: blur ? `blur(${blur}px)` : undefined,
        background: `linear-gradient(180deg, ${mix(paper, '#000000', 0.12)} 0%, ${paper} 6%, ${mix(paper, '#ffffff', 0.12)} 50%, ${paper} 94%, ${mix(paper, '#000000', 0.16)} 100%)`,
        boxShadow: main ? '0 22px 40px rgba(0,0,0,0.38)' : '0 10px 20px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,0,0,0.025) 0 2px, transparent 2px 9px)' }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          transform: `translateX(${dx}px)`,
          fontFamily: FONT.plexMono,
          fontWeight: 600,
          color: ink,
        }}
      >
        {main ? (
          <>
            <span style={{ fontSize: size * 0.34, opacity: 0.45, marginRight: size * 0.6 }}>{filler('l', 3)}</span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {label ? <span style={{ fontSize: labSize, letterSpacing: '0.08em', marginBottom: labSize * 0.3 }}>{label}</span> : null}
              <span style={{ ...NUMS, fontSize: size, lineHeight: 1, letterSpacing: '-0.01em' }}>
                <span style={{ color: mark, marginRight: size * 0.18 }}>■</span>
                {shown}
              </span>
            </span>
            <span style={{ fontSize: size * 0.34, opacity: 0.45, marginLeft: size * 0.6 }}>{filler('r', 3)}</span>
          </>
        ) : (
          <span style={{ fontSize: 40, opacity: 0.6 }}>{filler(key, 8)}</span>
        )}
      </div>
    </div>
  );
  void durFrames;
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      {tape('b1', H * 0.2, 5, 0.42, isLight(ground) ? 0.7 : 0.55, 2.5, -slide * 0.5 - drift * 1.6 - 300, false)}
      {tape('b2', H * 0.86, -7, 0.36, isLight(ground) ? 0.6 : 0.45, 3.5, slide * 0.4 + drift * 1.2, false)}
      {tape('main', H * 0.52, -3, 1, 1, 0, slide + drift, true)}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------- newsprint */

/** A newspaper clipping: rules, the figure set as a serif headline, column text below, tilted on the ground. */
const Newsprint: React.FC<Props> = ({ scene, genre, locale, durFrames, speed }) => {
  const { f, text, end } = useCount(scene, locale);
  const look = useLook();
  const font: FontKey = 'oldstandard';
  const cardW = 1180;
  const size = numeralSize(scene, locale, font, cardW - 160, 250);
  const label = labelOf(scene);
  const labelSize = label ? fitFont(label, font, { maxW: cardW - 160, cap: 54, upper: true, trackPx: 2 }) : 0;
  const stock = '#efe8d8';
  const ink = '#16130f';
  const tex = useMemo(() => paperTexture(`news${scene.to}`, { tone: stock, w: 640, h: 440, age: 0.35, rings: false }), [scene.to]);
  const drop = interpolate(f, [0, 9], [1.1, 1], { ...clamp, easing: outCubic });
  const op = interpolate(f, [0, 5], [0, 1], clamp);
  const cam = interpolate(f, [0, durFrames], [1, 1 + 0.05 * speed], clamp);
  const rot = -1.6 + (random(`np${scene.to}`) - 0.5) * 1.2;
  const kicker = String(look.chapterName ?? '').trim();
  const lines = (seed: string, n: number) =>
    Array.from({ length: n }, (_, i) => (
      <div key={i} style={{ height: 9, margin: '0 0 11px', width: `${i === n - 1 ? 40 + random(`${seed}${i}`) * 30 : 88 + random(`${seed}${i}`) * 12}%`, background: alpha(ink, 0.22) }} />
    ));
  return (
    <AbsoluteFill>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${cam})` }}>
        <div
          style={{
            position: 'relative',
            width: cardW,
            padding: '44px 80px 0',
            boxSizing: 'border-box',
            height: 760,
            overflow: 'hidden',
            background: stock,
            transform: `rotate(${rot}deg) scale(${drop})`,
            opacity: op,
            boxShadow: '0 30px 70px rgba(0,0,0,0.45), 0 2px 0 rgba(0,0,0,0.12)',
            clipPath: 'polygon(0 1%, 3% 0, 22% 0.8%, 41% 0, 63% 0.9%, 81% 0.2%, 100% 0.9%, 99.4% 34%, 100% 67%, 99.2% 100%, 72% 99.1%, 48% 100%, 23% 99.2%, 0 100%, 0.7% 62%, 0 30%)',
          }}
        >
          {tex ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply', opacity: 0.85 }} /> : null}
          <div style={{ position: 'relative' }}>
            <div style={{ borderTop: `6px solid ${ink}`, borderBottom: `2px solid ${ink}`, height: 6, marginBottom: 14 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FONT[font], fontSize: 20, letterSpacing: '0.18em', textTransform: 'uppercase', color: alpha(ink, 0.75), marginBottom: 10, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              <span>{kicker ? kicker : ' '}</span>
              <span>{'★ ★ ★'}</span>
            </div>
            <div style={{ borderTop: `2px solid ${ink}`, marginBottom: 26 }} />
            <div
              style={{
                ...NUMS,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'baseline',
                whiteSpace: 'nowrap',
                fontFamily: FONT[font],
                fontWeight: 700,
                fontSize: size,
                lineHeight: 0.98,
                color: ink,
              }}
            >
              <Unit s={scene.prefix} side="pre" size={size} />
              <span style={{ whiteSpace: 'pre' }}>{text}</span>
              <Unit s={scene.suffix} side="suf" size={size} />
            </div>
            {label ? (
              <div
                style={{
                  textAlign: 'center',
                  fontFamily: FONT[font],
                  fontWeight: 700,
                  fontSize: labelSize,
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                  color: ink,
                  whiteSpace: 'nowrap',
                  marginTop: 14,
                  opacity: interpolate(f, [end - 6, end + 6], [0, 1], clamp),
                }}
              >
                {label}
              </div>
            ) : null}
            <div style={{ borderTop: `1px solid ${alpha(ink, 0.6)}`, margin: '26px 0 22px' }} />
            <div style={{ display: 'flex', gap: 34 }}>
              {[0, 1, 2].map((c) => (
                <div key={c} style={{ flex: 1 }}>
                  {lines(`np${scene.to}c${c}`, 12)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* --------------------------------------------------------------- outline */

/** A giant outlined numeral filling the frame, flooding with colour from the bottom as it counts. */
const Outline: React.FC<Props> = ({ scene, genre, locale, durFrames, speed }) => {
  const { f, t, text, end } = useCount(scene, locale);
  const ground = useGround(genre);
  const font = genre.headline;
  const size = numeralSize(scene, locale, font, 1680, 400);
  const label = labelOf(scene);
  const labelSize = label ? fitFont(label, genre.body, { maxW: 1500, cap: 40, trackPx: 0.3 * 40, upper: true }) : 0;
  const color = readable(genre.accent, ground, 3);
  const ink = readable(genre.ink, ground, 7);
  const stroke = Math.max(2, Math.round(size / 90));
  const flood = interpolate(t, [0, 1], [0, 1]);
  const cam = interpolate(f, [0, durFrames], [1.03, 1.03 + 0.05 * speed], clamp);
  const echo = alpha(contrast(ink, ground) > 3 ? ink : color, 0.22);
  const row = (style: React.CSSProperties, key: string) => (
    <div
      key={key}
      style={{
        ...NUMS,
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'baseline',
        whiteSpace: 'nowrap',
        fontFamily: FONT[font],
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        ...style,
      }}
    >
      <Unit s={scene.prefix} side="pre" size={size} />
      <span style={{ whiteSpace: 'pre' }}>{text}</span>
      <Unit s={scene.suffix} side="suf" size={size} />
    </div>
  );
  return (
    <AbsoluteFill>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${cam})` }}>
        <div style={{ position: 'relative', width: W, height: size * 1.05 }}>
          {row({ color: 'transparent', WebkitTextStroke: `${stroke}px ${echo}`, transform: `translate(${size * 0.035}px, ${size * 0.035}px)` }, 'echo')}
          {row({ color: 'transparent', WebkitTextStroke: `${stroke}px ${color}` }, 'line')}
          {row({ color, clipPath: `inset(${((1 - flood) * 100).toFixed(2)}% 0 0 0)` }, 'fill')}
        </div>
        {label ? (
          <div
            style={{
              marginTop: 30,
              fontFamily: FONT[genre.body],
              fontWeight: 700,
              fontSize: labelSize,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: ink,
              whiteSpace: 'nowrap',
              opacity: interpolate(f, [end - 4, end + 10], [0, 1], clamp),
            }}
          >
            {label}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
