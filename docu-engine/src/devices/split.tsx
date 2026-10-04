import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Media } from '../fx';
import type { Genre, SplitScene, SplitSide } from '../types';
import { DevProps, H, W, Pic, clamp, earlierPicture, isTr, resolveRef, safeBand, upper } from './common';
import { splitLand, splitSaid } from './timing';
import { DFONT, fitLine } from './type';

/*
 * SPLIT SCREEN.
 *  versus:       two pictures slide in from their sides and meet on a slanted
 *                accent divider; each keeps its own slow push, in opposite
 *                directions, and gets its label on the outer edge.
 *  before-after: the BEFORE picture holds the frame; a divider wipes in from
 *                the right to the centre and reveals AFTER behind it, then
 *                rests with a handle, breathing a few pixels.
 * Both pictures go through the genre grade (duotone) so they read as a pair.
 */

const SLANT = 70;

const Label: React.FC<{ genre: Genre; locale: string; text: string; side: 'left' | 'right'; p: number; top: number; bottom?: boolean; maxW: number; bottomY: number }> = ({ genre, locale, text, side, p, top, bottom, maxW, bottomY }) => {
  const t = String(text ?? '').trim();
  if (!t || p <= 0) return null;
  const look = genre.look;
  const T = look === 'terminal' ? t : upper(t, locale);
  const font = look === 'terminal' ? 'plexMono' : look === 'label' ? genre.headline : genre.headline;
  const track = look === 'glow' ? 0.16 : look === 'terminal' ? 0.06 : 0.03;
  const size = fitLine(T, font, { maxW: maxW - 50, cap: look === 'label' ? 60 : 56, min: 22, trackEm: track });
  const pos: React.CSSProperties = { position: 'absolute', [side]: 96, ...(bottom ? { bottom: H - bottomY } : { top }) };
  if (look === 'label') {
    return (
      <div style={{ ...pos, clipPath: `inset(0 ${side === 'left' ? (1 - p) * 100 : 0}% 0 ${side === 'right' ? (1 - p) * 100 : 0}%)` }}>
        <div style={{ background: genre.labelBg, padding: '10px 26px 4px', boxShadow: `0 7px 0 ${genre.accent2}`, transform: `rotate(${side === 'left' ? -1.2 : 1.2}deg)` }}>
          <div style={{ fontFamily: DFONT[font], fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: `${track}em`, color: genre.labelInk, whiteSpace: 'nowrap' }}>{T}</div>
        </div>
      </div>
    );
  }
  if (look === 'terminal') {
    return (
      <div style={{ ...pos, opacity: p, background: 'rgba(0,0,0,0.72)', padding: '10px 20px' }}>
        <div style={{ fontFamily: DFONT.plexMono, fontWeight: 600, fontSize: size, letterSpacing: `${track}em`, color: genre.accent, whiteSpace: 'nowrap', textShadow: `0 0 12px ${genre.accent}66` }}>{T}</div>
      </div>
    );
  }
  return (
    <div
      style={{
        ...pos,
        opacity: p,
        transform: `translateY(${(1 - p) * 16}px)`,
        textAlign: side,
        // A dark wash from the outer edge: lit type stays readable on a bright picture.
        padding: '14px 22px 12px',
        margin: side === 'left' ? '0 0 0 -22px' : '0 -22px 0 0',
        background: `linear-gradient(${side === 'left' ? 90 : 270}deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 70%, rgba(0,0,0,0) 100%)`,
      }}
    >
      <div style={{ fontFamily: DFONT[font], fontWeight: 700, fontSize: size, letterSpacing: `${track}em`, color: genre.titleInk ?? genre.ink, whiteSpace: 'nowrap', textShadow: `0 0 22px ${genre.accent}99, 0 3px 14px #000` }}>{T}</div>
      <div style={{ height: 3, width: 90, background: genre.accent, marginTop: 10, marginLeft: side === 'right' ? 'auto' : 0, boxShadow: `0 0 10px ${genre.accent}` }} />
    </div>
  );
};

/**
 * The picture of each side: its own reference; a side marked `own` (or one
 * left without a picture) shows the split scene's own image; a side that
 * still has nothing shows the OTHER side's picture as a blurred, darkened
 * ghost (absence) — never an empty black panel (ranking test: "Paris: he
 * was not on it" and "Darling Downs / Swan River" were black).
 */
function sidePics(scene: SplitScene): [Pic & { ghost?: boolean }, Pic & { ghost?: boolean }] {
  const sc = scene as SplitScene & { image?: string; imgW?: number; imgH?: number };
  const self: Pic = sc.image ? { src: sc.image, w: sc.imgW, h: sc.imgH } : {};
  let ownUsed = false;
  const pick = (side?: SplitSide): Pic => {
    const p = resolveRef(side);
    if (p.src) return p;
    if (self.src && !ownUsed && (side?.own || side?.fromScene == null)) {
      ownUsed = true;
      return self;
    }
    return {};
  };
  // The `own` side claims the scene's picture first.
  const order = scene.right?.own && !scene.left?.own ? ['right', 'left'] : ['left', 'right'];
  const got: Record<string, Pic> = {};
  for (const k of order) got[k] = pick(scene[k as 'left' | 'right']);
  let L = got.left, R = got.right;
  // Nothing on either side: the nearest earlier picture (a broken split must still show a frame).
  if (!L.src && !R.src) L = earlierPicture(scene);
  return [L.src ? L : R.src ? { ...R, ghost: true } : L, R.src ? R : L.src ? { ...L, ghost: true } : R];
}

const Panel: React.FC<{ side: SplitSide; pic: Pic & { ghost?: boolean }; durFrames: number; dir: number; speed: number }> = ({ side, pic, durFrames, dir, speed }) => {
  const f = useCurrentFrame();
  const fc = side.focus ?? [0.5, 0.35];
  const t = interpolate(f, [0, durFrames], [0, 1], clamp);
  const s = 1.06 + 0.07 * speed * t;
  const x = dir * 26 * t;
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(160deg, #26231f, #0c0b0a)' }}>
      {pic.src ? (
        <Media
          src={pic.src}
          durFrames={durFrames}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${fc[0] * 100}% ${fc[1] * 100}%`,
            transform: `translateX(${x}px) scale(${s})`,
            transformOrigin: `${fc[0] * 100}% ${fc[1] * 100}%`,
            // A ghost is the other side's picture lifted into a soft fog (a darkened one read as a black panel).
            filter: pic.ghost ? 'url(#duo) blur(12px) contrast(0.7) brightness(1.15)' : 'url(#duo)',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const Split: React.FC<DevProps & { scene: SplitScene }> = ({ scene, genre, durFrames, speed, locale }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const band = safeBand(genre, 26);
  const mode = scene.mode === 'before-after' ? 'before-after' : 'versus';
  const land = splitLand(mode, durFrames, fps, splitSaid(scene, fps));
  const look = genre.look;
  const accent = look === 'label' ? genre.labelBg : genre.accent;
  const tr = isTr(locale);
  const [picL, picR] = sidePics(scene);

  if (mode === 'before-after') {
    const wipeA = land - Math.round(0.55 * fps);
    const w = interpolate(f, [wipeA, land], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    const breathe = Math.sin((f - land) / 18) * 6 * interpolate(f, [land, land + 10], [0, 1], clamp);
    const x = W - (W / 2) * w + (w >= 1 ? breathe : 0);
    const before = String(scene.left?.label ?? '').trim() || (tr ? 'ÖNCE' : 'BEFORE');
    const after = String(scene.right?.label ?? '').trim() || (tr ? 'SONRA' : 'AFTER');
    const lb = interpolate(f, [6, 18], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const la = interpolate(f, [land - 4, land + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const handle = interpolate(f, [land - 6, land + 4], [0, 1], clamp);
    return (
      <AbsoluteFill style={{ background: genre.bg, overflow: 'hidden' }}>
        <Panel side={scene.left} pic={picL} durFrames={durFrames} dir={-1} speed={speed} />
        <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${x}px)` }}>
          <Panel side={scene.right} pic={picR} durFrames={durFrames} dir={1} speed={speed} />
        </AbsoluteFill>
        {w > 0 ? (
          <>
            <div style={{ position: 'absolute', left: x - 2, top: 0, width: 4, height: H, background: accent, boxShadow: `0 0 24px ${accent}, 0 0 4px #000` }} />
            <div
              style={{
                position: 'absolute',
                left: x - 34,
                top: H / 2 - 34,
                width: 68,
                height: 68,
                borderRadius: '50%',
                background: accent,
                boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
                transform: `scale(${handle})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width={40} height={24} viewBox="0 0 40 24">
                <path d="M14 3 L4 12 L14 21 M26 3 L36 12 L26 21" fill="none" stroke={look === 'label' ? genre.labelInk : genre.bg} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </>
        ) : null}
        <Label genre={genre} locale={locale} text={before} side="left" p={lb} top={band.top} maxW={W / 2 - 140} bottomY={band.bottom} />
        <Label genre={genre} locale={locale} text={after} side="right" p={la} top={band.top} maxW={W / 2 - 140} bottomY={band.bottom} />
      </AbsoluteFill>
    );
  }

  /* ---- versus ---- */
  const inL = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const inR = interpolate(f, [3, 13], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const div = interpolate(f, [land - 4, land + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const lblL = interpolate(f, [land + 4, land + 16], [0, 1], clamp);
  const lblR = interpolate(f, [land + 9, land + 21], [0, 1], clamp);
  const cx = W / 2;
  const leftClip = `polygon(0 0, ${cx + SLANT}px 0, ${cx - SLANT}px ${H}px, 0 ${H}px)`;
  const rightClip = `polygon(${cx + SLANT}px 0, ${W}px 0, ${W}px ${H}px, ${cx - SLANT}px ${H}px)`;
  const vsP = interpolate(f, [land + 2, land + 8, land + 12], [0, 1.25, 1], clamp);
  const vsSize = 64;
  return (
    <AbsoluteFill style={{ background: genre.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ clipPath: leftClip, transform: `translateX(${(1 - inL) * -W * 0.6}px)` }}>
        <AbsoluteFill style={{ transform: 'translateX(-25%)' }}>
          <Panel side={scene.left} pic={picL} durFrames={durFrames} dir={1} speed={speed} />
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{ clipPath: rightClip, transform: `translateX(${(1 - inR) * W * 0.6}px)` }}>
        <AbsoluteFill style={{ transform: 'translateX(25%)' }}>
          <Panel side={scene.right} pic={picR} durFrames={durFrames} dir={-1} speed={speed} />
        </AbsoluteFill>
      </AbsoluteFill>
      {/* Each side darkens toward its outer label edge for legibility. */}
      <AbsoluteFill style={{ background: 'linear-gradient(0deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 22%, rgba(0,0,0,0) 44%)', pointerEvents: 'none' }} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <line x1={cx + SLANT} y1={0} x2={cx + SLANT - 2 * SLANT * div} y2={H * div} stroke="#000" strokeOpacity={0.6} strokeWidth={16} />
        <line x1={cx + SLANT} y1={0} x2={cx + SLANT - 2 * SLANT * div} y2={H * div} stroke={accent} strokeWidth={7} style={look !== 'label' ? { filter: `drop-shadow(0 0 10px ${accent})` } : undefined} />
      </svg>
      {vsP > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: cx - 60,
            top: H / 2 - 60,
            width: 120,
            height: 120,
            borderRadius: look === 'terminal' ? 6 : '50%',
            background: look === 'label' ? genre.labelBg : genre.bg,
            border: look === 'label' ? 'none' : `3px solid ${accent}`,
            boxShadow: look === 'label' ? `0 8px 0 ${genre.accent2}, 0 12px 30px rgba(0,0,0,0.5)` : `0 0 30px ${accent}88`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${vsP}) rotate(${look === 'label' ? -4 : 0}deg)`,
            fontFamily: DFONT[look === 'terminal' ? 'plexMono' : genre.headline],
            fontWeight: 800,
            fontSize: vsSize,
            color: look === 'label' ? genre.labelInk : accent,
            letterSpacing: '0.02em',
          }}
        >
          VS
        </div>
      ) : null}
      <Label genre={genre} locale={locale} text={scene.left?.label ?? ''} side="left" p={lblL} top={band.top} bottom maxW={W / 2 - 200} bottomY={band.bottom} />
      <Label genre={genre} locale={locale} text={scene.right?.label ?? ''} side="right" p={lblR} top={band.top} bottom maxW={W / 2 - 200} bottomY={band.bottom} />
    </AbsoluteFill>
  );
};
