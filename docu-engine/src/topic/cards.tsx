import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { fitFont } from '../fonts';
import { SoftPlate, clipOf } from '../fx';
import type { FontKey, Genre, TitleScene } from '../types';
import { alpha, mix } from '../looks/color';
import { useLook } from '../looks/context';
import { isLightVariant } from '../looks/variants';
import { h01, morse, roman, rng, type TopicCtx } from './context';
import { DEVICE_PLATE, MorseRow, MotifTexture, contour, devicePicture, morseWidth, motifPalette, type MotifPalette } from './motifs';

/**
 * The soft picture behind a device (explainer, UI card, chapter card): the scene's or chapter's related picture at
 * brightness DEVICE_PLATE.brightness (>= 0.8) and opacity DEVICE_PLATE.opacity (>= 0.45); a light look lays its paper
 * veil over it. Gimli 9ff721 önce/sonra, 29 Ekim 2026: şema ve bölüm kartı zemini neredeyse siyah — the explainer had no
 * picture at all and the UI card's plate sat at brightness 0.25.
 */
export const DevicePlate: React.FC<{
  pic?: { image?: string; video?: string; videoStart?: number; videoDur?: number; videoW?: number; videoH?: number };
  P: Pick<MotifPalette, 'ground' | 'light'>;
  durFrames: number;
  opacity?: number;
  focus?: [number, number];
}> = ({ pic, P, durFrames, opacity = DEVICE_PLATE.opacity, focus }) => {
  if (!pic || !(pic.image || pic.video)) return null;
  return (
    <>
      <AbsoluteFill style={{ opacity }}>
        <SoftPlate src={pic.image ?? ''} clip={clipOf(pic)} dim={DEVICE_PLATE.brightness} blur={DEVICE_PLATE.blur} zoom={DEVICE_PLATE.zoom} focus={focus} durFrames={durFrames} />
      </AbsoluteFill>
      {P.light ? <AbsoluteFill style={{ background: alpha(P.ground, DEVICE_PLATE.lightVeil * opacity) }} /> : null}
    </>
  );
};

/** A split-flap board in the look's own tones: mid-dark slate in a dark look, printed card in a light one (never #0b0c0b). */
function boardTones(P: MotifPalette) {
  return P.light
    ? { face: mix(P.ground2, P.paperInk, 0.08), edge: mix(P.ground2, P.paperInk, 0.2), cell: mix(P.ground, '#ffffff', 0.55), seam: alpha(P.paperInk, 0.2), ink: P.paperInk, num: P.dim }
    : { face: P.ground2, edge: mix(P.ground, '#ffffff', 0.14), cell: mix(P.ground, '#ffffff', 0.05), seam: alpha('#000000', 0.3), ink: '#f4f1e8', num: P.dim };
}

/*
 * CHAPTER CARDS in the topic's own language. Same contract as the engine's
 * ChapterCard (scenes.tsx): no narration, ~2.8 s, the number lands at
 * CHAPTER_LAND (0.3 s), the title is fully readable for the last ~0.8 s; the
 * next shot sits behind it, blurred and dark.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.out(Easing.cubic);

export interface CardProps {
  t: TopicCtx;
  P: MotifPalette;
  no: number;
  word: string;
  title: string;
  land: number;
  durFrames: number;
}

/** Letters typed one by one: `chars` shown so far, with a block cursor while typing. */
export const Typed: React.FC<{ text: string; start: number; per: number; style: React.CSSProperties; cursor?: string }> = ({ text, start, per, style, cursor }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.min(text.length, Math.floor((f - start) / per)));
  const typing = n < text.length && f >= start;
  return (
    <span style={{ ...style, whiteSpace: 'pre', position: 'relative' }}>
      {text.slice(0, n)}
      {cursor && f >= start && (typing || Math.floor(f / 9) % 2 === 0) ? (
        <span style={{ position: 'absolute', width: '0.55em', height: '0.95em', bottom: '0.08em', background: cursor, opacity: 0.85 }} />
      ) : null}
      <span style={{ opacity: 0 }}>{text.slice(n)}</span>
    </span>
  );
};

/** The title, fitted to a width, in the motif's display face. */
function titleSize(text: string, key: FontKey, maxW: number, cap: number, trackEm = 0.04): number {
  return fitFont(text, key, { maxW, cap, trackEm, upper: true, scaleMax: 1.03 });
}

/* ------------------------------------------------------------ cipher */

const CipherCard: React.FC<CardProps> = ({ t, P, no, word, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const T = title.toUpperCase();
  const letters = [...T];
  const n = letters.length;
  const size = Math.min(104, Math.floor(1640 / Math.max(1, n) / 0.98));
  const cell = Math.round(size * 0.98);
  // Lock left to right inside the readable window.
  const lockStart = land + 8;
  const lockEnd = Math.max(lockStart + 10, durFrames - 30);
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const key = ((t.topic.tokens ?? []).find((x) => /^[A-Za-z]{3,12}$/.test(x)) ?? 'CIPHER').toUpperCase();
  const keyed = [...new Set([...key, ...alpha])].join('');
  const tag = `[ ${word} ${String(no).padStart(2, '0')} ]`;
  const tagO = interpolate(f, [land - 2, land + 4], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ fontFamily: P.mono, fontSize: 30, letterSpacing: '0.3em', color: P.accent, opacity: tagO, marginBottom: 46 }}>{tag}</div>
      <div style={{ display: 'flex', gap: 0 }}>
        {letters.map((ch, i) => {
          const at = lockStart + ((lockEnd - lockStart) * i) / Math.max(1, n - 1);
          const locked = f >= at;
          const visible = f >= land + i * 0.6;
          const shown = ch === ' ' ? ' ' : locked ? ch : alpha[Math.floor(h01(`${i}|${Math.floor(f / 2)}`) * 26)];
          const flash = interpolate(f - at, [0, 2, 12], [0, 1, 0], clamp);
          return (
            <div
              key={i}
              style={{
                width: cell,
                height: Math.round(cell * 1.3),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: P.mono,
                fontWeight: 700,
                fontSize: size,
                color: locked ? P.ink : P.dim,
                opacity: visible ? 1 : 0,
                borderTop: ch === ' ' ? 'none' : `2px solid ${locked ? `${P.ink}55` : `${P.dim}44`}`,
                borderBottom: ch === ' ' ? 'none' : `2px solid ${locked ? `${P.ink}55` : `${P.dim}44`}`,
                background: flash > 0 ? `rgba(${hexRgb(P.accent2)},${(0.35 * flash).toFixed(3)})` : 'transparent',
                textShadow: locked ? `0 0 ${12 + 20 * flash}px ${P.accent2}${flash > 0.2 ? 'aa' : '33'}` : 'none',
              }}
            >
              {shown}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 56, opacity: interpolate(f, [land + 4, land + 16], [0, 1], clamp) }}>
        {[...keyed].slice(0, 26).map((c, i) => (
          <div
            key={i}
            style={{
              width: 44,
              height: 54,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: P.mono,
              fontSize: 28,
              color: i < key.length ? '#111' : P.ink,
              background: i < key.length ? P.accent : 'transparent',
              border: `1px solid ${i < key.length ? P.accent : `${P.ink}40`}`,
            }}
          >
            {c}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: P.mono, fontSize: 20, letterSpacing: '0.4em', color: P.dim, marginTop: 14, opacity: interpolate(f, [land + 10, land + 20], [0, 1], clamp) }}>KEYED ALPHABET · {key}</div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ telegraph */

const TelegraphCard: React.FC<CardProps> = ({ t, P, no, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [0, land + 6], [0, 1], { ...clamp, easing: ease });
  const T = title.toUpperCase();
  const tSize = Math.min(96, titleSize(T, 'courier', 1080, 96, 0.06));
  const per = Math.max(0.6, Math.min(1.6, (durFrames - land - 34) / Math.max(1, T.length)));
  const code = morse(T);
  const unit = Math.max(6, Math.min(11, 1500 / Math.max(1, morseWidth(code, 1))));
  const mw = morseWidth(code, unit);
  const reveal = interpolate(f, [land + 4, durFrames - 16], [0, 1], clamp);
  const time = t.topic.params?.time;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          position: 'relative',
          width: 1320,
          padding: '40px 64px 54px',
          background: `linear-gradient(176deg, ${P.paper}, #d9ceb2)`,
          color: P.paperInk,
          boxShadow: '0 40px 90px rgba(0,0,0,0.42), 0 2px 0 rgba(0,0,0,0.2)',
          transform: `translateY(${(1 - p) * 60}px) rotate(${-1.2 + (1 - p) * 2}deg)`,
          opacity: p,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `3px double ${P.paperInk}`, paddingBottom: 12 }}>
          <div style={{ fontFamily: P.display, fontWeight: 700, fontSize: 30, letterSpacing: '0.24em' }}>WIRELESS TELEGRAPH · MESSAGE</div>
          <div style={{ fontFamily: P.typed, fontSize: 40, color: P.accent2, transform: `rotate(-4deg) scale(${interpolate(f, [land, land + 5], [1.6, 1], { ...clamp, easing: ease })})`, opacity: interpolate(f, [land - 1, land + 1], [0, 1], clamp) }}>
            No. {String(no).padStart(2, '0')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 60, fontFamily: P.display, fontSize: 20, letterSpacing: '0.18em', marginTop: 12, opacity: 0.75 }}>
          <span>TIME RECEIVED {time ? <span style={{ fontFamily: P.typed, fontSize: 26, letterSpacing: '0.05em' }}>{time}</span> : '______'}</span>
          <span>WORDS {T.split(/\s+/).length}</span>
        </div>
        <div style={{ marginTop: 34, minHeight: tSize * 1.2 }}>
          <Typed text={T} start={land + 6} per={per} style={{ fontFamily: P.typed, fontSize: tSize, letterSpacing: '0.06em', color: P.paperInk }} cursor={P.paperInk} />
        </div>
      </div>
      <svg width={1700} height={70} style={{ marginTop: 46, overflow: 'visible' }}>
        <MorseRow code={code} x={(1700 - mw) / 2} y={35} unit={unit} color={P.accent} reveal={reveal} glow={P.accent} />
      </svg>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ ticker */

const TickerCard: React.FC<CardProps> = ({ t, P, no, word, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const T = title.toUpperCase();
  const cols = Math.min(22, Math.max(12, T.length + 2));
  const cell = Math.min(80, Math.floor(1600 / cols));
  const start = Math.floor((cols - T.length) / 2);
  const tape = (t.topic.tokens ?? []).map((x) => x.toUpperCase());
  const tapeText = (tape.length ? tape : ['DOW']).join('   ▼   ');
  const shift = (f * 9) % 2400;
  const boardIn = interpolate(f, [0, land], [0, 1], { ...clamp, easing: ease });
  const board = boardTones(P);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ padding: 26, background: board.face, border: `3px solid ${board.edge}`, boxShadow: '0 40px 90px rgba(0,0,0,0.42), inset 0 0 40px rgba(0,0,0,0.25)', opacity: boardIn, transform: `scale(${0.96 + 0.04 * boardIn})` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: P.mono, fontSize: 22, letterSpacing: '0.3em', color: P.dim, marginBottom: 14 }}>
          <span>QUOTATIONS</span>
          <span style={{ color: P.accent }}>{`${word} ${String(no).padStart(2, '0')}`}</span>
        </div>
        {[0, 1, 2].map((row) => (
          <div key={row} style={{ display: 'flex', gap: 6, marginTop: row ? 6 : 0 }}>
            {Array.from({ length: cols }, (_, c) => {
              const ch = row === 1 ? T[c - start] ?? '' : '';
              const at = land + 4 + (c - start) * 1.4;
              const flip = row === 1 && ch ? interpolate(f, [at, at + 5], [0, 1], { ...clamp, easing: ease }) : 1;
              const numCell = row !== 1 && h01(`${row}${c}${no}`) < 0.5;
              const num = numCell ? String(Math.floor(h01(`${row}|${c}|${Math.floor(f / 6)}`) * 9)) : '';
              return (
                <div
                  key={c}
                  style={{
                    width: cell,
                    height: Math.round(cell * (row === 1 ? 1.32 : 0.8)),
                    background: board.cell,
                    borderBottom: `2px solid ${board.seam}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: P.display,
                    fontWeight: 700,
                    fontSize: row === 1 ? cell * 0.95 : cell * 0.5,
                    color: row === 1 ? board.ink : board.num,
                    transform: `scaleY(${flip})`,
                  }}
                >
                  {row === 1 ? ch : num}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: -40, right: -40, bottom: 120, height: 66, background: P.paper, transform: 'rotate(-2.5deg)', boxShadow: '0 12px 30px rgba(0,0,0,0.38)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 10, left: -shift, whiteSpace: 'nowrap', fontFamily: P.mono, fontSize: 38, letterSpacing: '0.12em', color: P.paperInk }}>
          {`${tapeText}   ▼   ${tapeText}   ▼   ${tapeText}   ▼   ${tapeText}`}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ telemetry */

const TelemetryCard: React.FC<CardProps> = ({ t, P, no, word, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const T = title.toUpperCase();
  const draw = interpolate(f, [0, land + 20], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const size = titleSize(T, P.displayKey, 1500, 118, 0.12);
  const scan = interpolate(f, [land + 4, land + 30], [0, 1], { ...clamp, easing: ease });
  // Pulsar-map linework (the record cover's "address"): 14 lines from one centre, ticked like binary.
  const cx = 960;
  const cy = 300;
  const r = rng(`${t.seed}|pulsar`);
  const lines = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2 + 0.2 + r() * 0.15;
    const L = 150 + r() * 210;
    return { a, L, bits: Array.from({ length: 8 }, () => r() < 0.5) };
  });
  const tokens = t.topic.tokens ?? [];
  const pulse = ((f * 28) % 2200) - 140;
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <g opacity={0.85}>
          {lines.map((l, i) => {
            const x2 = cx + Math.cos(l.a) * l.L * draw;
            const y2 = cy + Math.sin(l.a) * l.L * draw;
            return (
              <g key={i}>
                <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={P.accent} strokeWidth={1.6} />
                {l.bits.map((b, k) => {
                  const d = ((k + 1) / 9) * l.L;
                  if (d > l.L * draw) return null;
                  const px = cx + Math.cos(l.a) * d;
                  const py = cy + Math.sin(l.a) * d;
                  const nx = -Math.sin(l.a) * (b ? 10 : 5);
                  const ny = Math.cos(l.a) * (b ? 10 : 5);
                  return <line key={k} x1={px - nx} y1={py - ny} x2={px + nx} y2={py + ny} stroke={P.accent} strokeWidth={1.6} />;
                })}
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={6} fill={P.accent} />
          <circle cx={cx} cy={cy} r={64 * draw} fill="none" stroke={P.accent} strokeWidth={1.2} opacity={0.7} />
        </g>
        {/* The signal: a waveform crossing the frame, a pulse riding it. */}
        <polyline
          points={Array.from({ length: 97 }, (_, i) => {
            const x = i * 20;
            const env = Math.exp(-Math.pow((x - pulse) / 120, 2));
            return `${x},${880 + Math.sin(i * 0.9 + f * 0.4) * (6 + 46 * env)}`;
          }).join(' ')}
          fill="none"
          stroke={P.accent2}
          strokeWidth={2.4}
          opacity={0.9}
          style={{ filter: `drop-shadow(0 0 6px ${P.accent2})` }}
        />
        <line x1={0} x2={1920} y1={880} y2={880} stroke={P.accent2} strokeWidth={1} opacity={0.25} />
      </svg>
      <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', paddingTop: 560 }}>
        <div style={{ fontFamily: P.mono, fontSize: 26, letterSpacing: '0.42em', color: P.accent, opacity: interpolate(f, [land - 2, land + 6], [0, 1], clamp), marginBottom: 16 }}>
          {`${word} ${String(no).padStart(2, '0')}`}
        </div>
        <div style={{ position: 'relative', fontFamily: P.display, fontWeight: 700, fontSize: size, letterSpacing: '0.12em', marginRight: '-0.12em', color: P.ink, whiteSpace: 'nowrap', clipPath: `inset(0 ${(1 - scan) * 100}% 0 0)` }}>
          {T}
          <div style={{ position: 'absolute', top: -10, bottom: -10, left: `${scan * 100}%`, width: 3, background: P.accent2, boxShadow: `0 0 18px ${P.accent2}`, opacity: scan < 1 ? 1 : 0 }} />
        </div>
      </AbsoluteFill>
      {tokens.slice(0, 2).map((tk, i) => (
        <div key={i} style={{ position: 'absolute', top: 70, [i ? 'right' : 'left']: 90, fontFamily: P.mono, fontSize: 24, letterSpacing: '0.2em', color: P.dim, opacity: interpolate(f, [land + 6 + i * 4, land + 14 + i * 4], [0, 1], clamp) } as React.CSSProperties}>
          {`${i ? 'T+' : 'RNG'}  ${tk.toUpperCase()}`}
        </div>
      ))}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ electric */

const ElectricCard: React.FC<CardProps> = ({ P, no, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const T = title.toUpperCase();
  const draw = interpolate(f, [0, land + 22], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const arcOn = f >= land && (f - land) % 7 < 5;
  const size = titleSize(T, P.displayKey, 1100, 96, 0.08);
  const r = rng(`arc|${Math.floor(f / 2)}`);
  let arc = 'M 520 300';
  for (let i = 1; i <= 12; i++) arc += ` L ${520 + i * 20 + (r() - 0.5) * 10} ${300 - i * 22 + (r() - 0.5) * 46}`;
  const coil = Array.from({ length: 13 }, (_, i) => i);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <rect x={90} y={80} width={1740} height={920} fill="none" stroke={P.ink} strokeWidth={1.4} opacity={0.35} />
        <g stroke={P.ink} strokeWidth={2.2} fill="none" opacity={0.9}>
          {coil.map((i) => (
            <ellipse key={i} cx={520} cy={440 + i * 30} rx={96} ry={14} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, Math.max(0, draw * 14 - i))} />
          ))}
          <line x1={424} x2={424} y1={440} y2={440 + 360 * draw} />
          <line x1={616} x2={616} y1={440} y2={440 + 360 * draw} />
          <path d="M 520 440 V 330" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
          <circle cx={520} cy={300} r={30 * draw} />
          <path d="M 300 840 H 740" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        </g>
        {arcOn ? (
          <path d={arc} fill="none" stroke={P.light ? P.ink : '#ffffff'} strokeWidth={3} style={{ filter: `drop-shadow(0 0 8px ${P.accent}) drop-shadow(0 0 22px ${P.accent})` }} />
        ) : null}
        <text x={520} y={930} textAnchor="middle" fill={P.ink} fontFamily={P.display} fontStyle="italic" fontSize={40} opacity={draw}>
          Fig. {no}.
        </text>
      </svg>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 860 }}>
        <div style={{ fontFamily: P.mono, fontSize: 24, letterSpacing: '0.3em', color: P.accent2, opacity: interpolate(f, [land - 2, land + 6], [0, 1], clamp) }}>{`N° ${String(no).padStart(2, '0')}`}</div>
        <div style={{ height: 30 }} />
        <div style={{ fontFamily: P.display, fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: '0.08em', color: P.ink, maxWidth: 960, opacity: interpolate(f, [land + 6, land + 18], [0, 1], clamp), textShadow: `0 0 30px ${P.accent}55` }}>
          {T}
        </div>
      </AbsoluteFill>
      {arcOn && f - land < 3 ? <AbsoluteFill style={{ background: P.accent, opacity: 0.12, mixBlendMode: 'screen' }} /> : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ case-file */

const CaseFileCard: React.FC<CardProps> = ({ t, P, no, word, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const T = title.toUpperCase();
  const p = interpolate(f, [0, land + 2], [0, 1], { ...clamp, easing: ease });
  const tSize = Math.min(92, titleSize(T, 'courier', 1080, 92, 0.05));
  const per = Math.max(0.6, Math.min(1.5, (durFrames - land - 34) / Math.max(1, T.length)));
  const stamp = interpolate(f, [land + 14, land + 19], [1.7, 1], { ...clamp, easing: ease });
  const stampO = interpolate(f, [land + 13, land + 15], [0, 0.9], clamp);
  const ref = t.topic.params?.ref ?? (t.topic.tokens ?? [])[0];
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 1380, height: 640, transform: `translateX(${(1 - p) * -1500}px) rotate(${-1.5 + (1 - p) * -4}deg)` }}>
        <div style={{ position: 'absolute', top: -58, left: 70, width: 420, height: 74, background: '#d4bf8f', borderRadius: '14px 14px 0 0', fontFamily: P.typed, fontSize: 32, color: P.paperInk, display: 'flex', alignItems: 'center', paddingLeft: 30, letterSpacing: '0.08em' }}>
          {`${word} ${String(no).padStart(2, '0')}`}
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(170deg, #dcc596, #c8ae78)', boxShadow: '0 40px 90px rgba(0,0,0,0.42)' }} />
        {ref ? <div style={{ position: 'absolute', top: 40, right: 60, fontFamily: P.typed, fontSize: 30, color: `${P.paperInk}cc`, letterSpacing: '0.1em' }}>{`REF: ${ref.toUpperCase()}`}</div> : null}
        <div style={{ position: 'absolute', left: 80, right: 80, top: 230, padding: '34px 40px', background: '#f3eee2', boxShadow: '0 4px 0 rgba(0,0,0,0.12)' }}>
          <Typed text={T} start={land + 2} per={per} style={{ fontFamily: P.typed, fontSize: tSize, color: P.paperInk, letterSpacing: '0.05em' }} cursor={P.paperInk} />
        </div>
        <div
          style={{
            position: 'absolute',
            right: 110,
            bottom: 70,
            border: `6px solid ${P.accent2}`,
            color: P.accent2,
            fontFamily: P.display,
            fontWeight: 700,
            fontSize: 54,
            letterSpacing: '0.12em',
            padding: '6px 24px 2px',
            transform: `scale(${stamp}) rotate(-8deg)`,
            opacity: stampO,
            mixBlendMode: 'multiply',
          }}
        >
          {`FILE ${String(no).padStart(2, '0')}`}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ expedition */

const ExpeditionCard: React.FC<CardProps> = ({ t, P, no, word, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const T = title.toUpperCase();
  const draw = interpolate(f, [0, land + 26], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const bearing = Math.round(h01(`${t.seed}|b${no}`) * 360);
  const rot = interpolate(f, [0, land + 24], [bearing - 70, bearing], { ...clamp, easing: Easing.out(Easing.back(1.2)) });
  const size = titleSize(T, P.displayKey, 1500, 176, 0.06);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 12 }, (_, i) => (
          <path
            key={i}
            d={contour(1380, 380, (i + 1) * 56, 0.8 + i * 0.3, `${t.seed}card${no}${i}`)}
            fill="none"
            stroke={P.accent2}
            strokeWidth={i % 4 === 3 ? 2.2 : 1.2}
            opacity={0.55}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - Math.min(1, Math.max(0, draw * 1.6 - i * 0.05))}
          />
        ))}
        <path d="M 300 900 C 600 760, 900 820, 1200 560 S 1500 400, 1380 380" fill="none" stroke={P.accent} strokeWidth={4} strokeDasharray="14 12" pathLength={1000} strokeDashoffset={(1 - draw) * 1000} />
        <g transform={`translate(330 300) rotate(${rot})`} opacity={draw}>
          <circle r={120} fill="none" stroke={P.ink} strokeWidth={1.6} opacity={0.7} />
          {Array.from({ length: 72 }, (_, i) => (
            <line key={i} x1={0} y1={-120} x2={0} y2={i % 9 === 0 ? -100 : -110} stroke={P.ink} strokeWidth={1.4} transform={`rotate(${i * 5})`} />
          ))}
          <path d="M 0 -96 L 14 0 L 0 96 L -14 0 Z" fill="none" stroke={P.ink} strokeWidth={1.6} />
          <path d="M 0 -96 L 14 0 L -14 0 Z" fill={P.accent} />
        </g>
        <text x={330} y={470} textAnchor="middle" fill={P.ink} fontFamily={P.mono} fontSize={26} letterSpacing={4} opacity={draw}>
          {`BRG ${String(bearing).padStart(3, '0')}°`}
        </text>
      </svg>
      <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'flex-start', padding: '0 0 170px 150px' }}>
        <div style={{ fontFamily: P.mono, fontSize: 26, letterSpacing: '0.4em', color: P.accent, opacity: interpolate(f, [land - 2, land + 6], [0, 1], clamp) }}>{`${word} ${String(no).padStart(2, '0')}`}</div>
        <div style={{ fontFamily: P.display, fontSize: size, lineHeight: 1, letterSpacing: '0.06em', color: P.ink, marginTop: 10, clipPath: `inset(0 ${(1 - interpolate(f, [land + 4, land + 24], [0, 1], { ...clamp, easing: ease })) * 100}% 0 0)` }}>{T}</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 120% 90% at 50% 50%, transparent 55%, ${P.paper}2e 100%)`, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ siege */

const SiegeCard: React.FC<CardProps> = ({ P, no, title, land, durFrames }) => {
  const f = useCurrentFrame();
  const T = title.toUpperCase();
  const p = interpolate(f, [0, land], [0, 1], { ...clamp, easing: ease });
  const size = titleSize(T, P.displayKey, 1080, 92, 0.08);
  const seal = interpolate(f, [land, land + 5], [1.8, 1], { ...clamp, easing: ease });
  const sealO = interpolate(f, [land - 1, land + 1], [0, 1], clamp);
  const arrow = interpolate(f, [land + 10, durFrames - 24], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const letters = [...T];
  const step = Math.max(0.4, Math.min(1.6, (durFrames - land - 40) / Math.max(1, letters.length)));
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', width: 1400, height: 660, opacity: p, transform: `scale(${0.97 + 0.03 * p})` }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 45%, ${P.paper} 30%, #c9ae7a 100%)`, boxShadow: '0 40px 100px rgba(0,0,0,0.42)' }} />
        <div style={{ position: 'absolute', inset: 22, border: `3px solid ${P.paperInk}`, opacity: 0.8 }} />
        <div style={{ position: 'absolute', inset: 34, border: `1px solid ${P.paperInk}`, opacity: 0.6 }} />
        <svg width={1400} height={660} style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 70 }, (_, i) => (
            <line key={i} x1={i * 22 - 200} y1={660} x2={i * 22 + 60} y2={0} stroke={P.paperInk} strokeWidth={0.8} opacity={0.08} />
          ))}
          <path d="M 260 520 C 500 420, 800 600, 1130 470" fill="none" stroke={P.accent} strokeWidth={7} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arrow} strokeLinecap="round" />
          {arrow > 0.98 ? <path d="M 1130 470 l -40 -14 l 8 44 z" fill={P.accent} /> : null}
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 230, textAlign: 'center', fontFamily: P.display, fontWeight: 800, fontSize: size, letterSpacing: '0.08em', color: P.paperInk }}>
          {letters.map((c, i) => {
            const at = land + 6 + i * step;
            const o = interpolate(f, [at, at + 6], [0, 1], clamp);
            return (
              <span key={i} style={{ opacity: o, filter: o < 1 ? `blur(${(1 - o) * 3}px)` : undefined, whiteSpace: 'pre' }}>
                {c}
              </span>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 620, top: 40, width: 160, height: 160, transform: `scale(${seal}) rotate(-8deg)`, opacity: sealO }}>
          <svg width={160} height={160} viewBox="-80 -80 160 160">
            <path d={sealPath()} fill={P.accent} />
            <circle r={52} fill="none" stroke="#5e120e" strokeWidth={3} opacity={0.7} />
            <text y={16} textAnchor="middle" fill={P.accent2} fontFamily={P.display} fontWeight={800} fontSize={46}>
              {roman(no)}
            </text>
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};

function sealPath(): string {
  const pts: string[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 70 + Math.sin(i * 2.7) * 4 + Math.cos(i * 1.3) * 3;
    pts.push(`${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function hexRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/* ------------------------------------------------------------ the card */

const CARDS: Record<string, React.FC<CardProps>> = {
  cipher: CipherCard,
  telegraph: TelegraphCard,
  ticker: TickerCard,
  telemetry: TelemetryCard,
  electric: ElectricCard,
  'case-file': CaseFileCard,
  expedition: ExpeditionCard,
  siege: SiegeCard,
};

/*
 * Kartal Yuvası 950730 / Gimli 20261028-9ff721, 29 Ekim 2026: every chapter card was a near-black frame — the motif's
 * night ground, the next shot at 55% opacity and brightness 0.32, then a 0.6 black ring — even in a paper look
 * ('const light = false'). Cards now follow the look: a light look gets the motif's paper version; the next shot shows
 * through (opacity ~0.8, dimmed only ~15%); the black ring is at most 0.3.
 */
export const CARD_PLATE = { opacity: 0.8, dim: 0.15, ring: 0.3, lightRing: 0.12, lightVeil: 0.55, scrim: 0.4 } as const;

/** A chapter card in the topic motif: ground, the next shot blurred behind, texture, the motif's card. */
export const MotifChapterCard: React.FC<{ t: TopicCtx; scene: TitleScene; genre: Genre; durFrames: number; locale: string; land: number }> = ({ t, scene, genre, durFrames, locale, land }) => {
  // The VIDEO's look decides (the card's own resolved genre is dark whenever the next shot sits behind it).
  const light = genre.light === true || isLightVariant(genre.variant);
  const P = motifPalette(t, genre, light);
  const kickerDigits = String(scene.kicker ?? '').match(/\d+/)?.[0];
  const no = scene.chapterNo ?? (scene.chapter != null ? scene.chapter + 1 : kickerDigits ? Number(kickerDigits) : 1);
  const word =
    String(scene.kicker ?? '')
      .replace(/\d+/g, '')
      .replace(/[.:#–—-]+/g, ' ')
      .trim()
      .toUpperCase() || (locale.toLowerCase().startsWith('tr') ? 'BÖLÜM' : 'CHAPTER');
  const Card = CARDS[t.motif] ?? CipherCard;
  /*
   * Gimli 9ff721 önce/sonra, 29 Ekim 2026: şema ve bölüm kartı zemini neredeyse siyah ('NO PROCEDURE FOR THIS', 'A RUNWAY
   * FROM MEMORY' on black-brown). The ground is the motif's MID-DARK tone now (luma >= 45), and the card takes the
   * chapter's related picture from the look when the scene carries none of its own.
   */
  const look = useLook();
  const pic = devicePicture(scene, look);
  const pictured = !!pic;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, ${P.ground} 0%, ${P.ground2} 120%)` }}>
      {pic ? (
        <AbsoluteFill style={{ opacity: CARD_PLATE.opacity }}>
          <SoftPlate src={pic.image ?? ''} clip={clipOf(pic)} dim={1 - CARD_PLATE.dim} blur={8} zoom={1.3} focus={[no % 2 ? 0.3 : 0.7, 0.6]} durFrames={durFrames} />
        </AbsoluteFill>
      ) : null}
      {/* Where the title lands: a paper veil (light) or a soft wash of the motif's ground (dark) — never a black hole. */}
      {pictured ? (
        <AbsoluteFill
          style={{
            background: light
              ? alpha(P.ground, CARD_PLATE.lightVeil)
              : `radial-gradient(ellipse 58% 46% at 50% 50%, ${alpha(P.ground, CARD_PLATE.scrim)} 0%, ${alpha(P.ground, 0)} 100%)`,
          }}
        />
      ) : null}
      <MotifTexture t={t} light={light} strength={1.6} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 65% at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,${light ? CARD_PLATE.lightRing : CARD_PLATE.ring}) 100%)` }} />
      <Card t={t} P={P} no={no} word={word} title={String(scene.title ?? '').trim()} land={land} durFrames={durFrames} />
    </AbsoluteFill>
  );
};

