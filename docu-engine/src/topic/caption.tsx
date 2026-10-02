import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { textWidth } from '../fonts';
import type { FontKey, Genre, Scene } from '../types';
import { h01, morse, type TopicCtx } from './context';
import { MorseRow, morseWidth, motifPalette, type MotifPalette } from './motifs';

/*
 * MOTIF CAPTIONS (text style 'motif') — the narration line written in the
 * topic's own language instead of a generic word-and-underline:
 *   telegraph   typed onto a strip of wireless log paper, the key word ticking out in Morse
 *   ticker      printed onto ticker tape running across the frame, the key word marked ▼
 *   telemetry   a mono readout in bracket corners, the key word on a live waveform
 *   electric    a patent-drawing annotation: leader line from the subject, italic serif
 *   case-file   an FBI-style teletype strip with sprocket holes, the key word in red ink
 *   expedition  a frost-white field note in a legend box with a bearing tick
 *   siege       a parchment cartouche, the key word in crimson
 *   cipher      monospace cells, the key word decrypting letter by letter
 * Words land on their spoken frames. PLACEMENT is composition-aware: the block
 * takes the picture's negative space — the side away from the subject's focus
 * (or depth cut-out), above it when the subject sits low and below it when high,
 * never centred by default — with a slight perspective turn towards the subject.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.out(Easing.cubic);
const W = 1920;
const H = 1080;

export interface Place {
  /** Block anchor: left or right edge of the frame. */
  side: 'left' | 'right';
  /** Vertical: top or bottom band. */
  band: 'top' | 'bottom' | 'middle';
  width: number;
  /** Degrees of perspective turn (towards the subject). */
  turn: number;
}

/** Where a caption goes on this scene: the negative space, from the subject's focus / cut-out box. */
export function captionPlace(scene: Scene, pictured: boolean, seed: string): Place {
  const s = scene as { focus?: [number, number]; layers?: { box: [number, number, number, number] } };
  let fx: number | null = null;
  let fy: number | null = null;
  if (s.layers?.box) {
    fx = (s.layers.box[0] + s.layers.box[2]) / 2;
    fy = (s.layers.box[1] + s.layers.box[3]) / 2;
  } else if (Array.isArray(s.focus)) {
    fx = s.focus[0];
    fy = s.focus[1];
  }
  if (!pictured) {
    // On a ground: the golden left column, a little above centre — composed, not centred.
    return { side: h01(`${seed}|gs`) < 0.7 ? 'left' : 'right', band: 'middle', width: 1240, turn: 0 };
  }
  if (fx === null) {
    // No known subject: landscapes keep their sky up top and the action low; a caption sits in the upper third.
    return { side: h01(`${seed}|s`) < 0.6 ? 'left' : 'right', band: 'top', width: 1000, turn: 0 };
  }
  const side: Place['side'] = fx > 0.5 ? 'left' : 'right';
  const band: Place['band'] = (fy ?? 0.4) < 0.5 ? 'bottom' : 'top';
  const off = Math.abs(fx - 0.5);
  return { side, band, width: off > 0.12 ? 860 : 1000, turn: side === 'left' ? 5 : -5 };
}

interface CapProps {
  t: TopicCtx;
  genre: Genre;
  scene: Scene;
  words: string[];
  frames: number[];
  k0: number;
  k1: number;
  pictured: boolean;
  durFrames: number;
  light?: boolean;
}

/**
 * WHEN each word lands on the strip: on its spoken frame, never before (user: "önce söylesin, sonra
 * ekranda gözüksün" — a strip that finished early showed the narrator's next words, numbers and names
 * before they were said). Whole words only, at least one frame apart so each strike is seen.
 */
export function captionSchedule(frames: number[], _fps: number): number[] {
  let prev = -Infinity;
  return frames.map((fr) => {
    const at = Math.max(prev + 1, Math.round(fr));
    prev = at;
    return at;
  });
}

/** Each word's state: the whole word struck on its scheduled frame (never letter by letter). */
function useTyped(words: string[], frames: number[]) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = captionSchedule(frames, fps);
  return words.map((w, i) => {
    const a = at[i] ?? 0;
    const since = f - a;
    return { w, i, at: a, since, shown: since < 0 ? 0 : w.length };
  });
}

/** Cap height / font size of the caption faces (Special Elite ~ Courier). */
const CAP_RATIO: Partial<Record<FontKey, number>> = { courier: 0.6, jetbrains: 0.73, plexMono: 0.7, playfair: 0.71, bebas: 0.7, cinzel: 0.69, crimson: 0.62, oldstandard: 0.66, spacegrotesk: 0.7, oswald: 0.72 };
/** Minimum cap height of a caption at 1080p — readable on a phone. */
export const CAPTION_MIN_CAP = 34;
export const captionMinSize = (key: FontKey) => Math.ceil(CAPTION_MIN_CAP / (CAP_RATIO[key] ?? 0.66));

/** Lines a word-wrapped block takes at `size` in `innerW` px (greedy, like the browser's wrap). */
export function wrapLines(words: string[], key: FontKey, size: number, innerW: number, upperCase: boolean, trackEm = 0.03): number {
  const sp = textWidth(' ', key, size, { trackEm });
  let lines = 1;
  let x = 0;
  for (const w of words) {
    const ww = textWidth(w, key, size, { trackEm, upper: upperCase });
    if (x > 0 && x + sp + ww > innerW) {
      lines++;
      x = ww;
    } else x += (x > 0 ? sp : 0) + ww;
  }
  return lines;
}

/**
 * fitFont with wrapping: the largest size <= cap whose word-wrapped block fits
 * `maxLines` lines in `innerW`, never below the readable minimum — a longer
 * line takes more lines (and the block widens) instead of shrinking or being cut.
 */
export function fitCaption(words: string[], key: FontKey, cap: number, innerW: number, maxLines: number, upperCase: boolean, trackEm = 0.03): { size: number; lines: number } {
  const min = captionMinSize(key);
  for (let size = Math.max(min, cap); size >= min; size -= 2) {
    const lines = wrapLines(words, key, size, innerW, upperCase, trackEm);
    if (lines <= maxLines) return { size, lines };
  }
  return { size: min, lines: wrapLines(words, key, min, innerW, upperCase, trackEm) };
}

interface Face {
  key: FontKey;
  cap: number;
  upper: boolean;
  track: number;
  /** Horizontal / vertical padding of the block, px. */
  pad: [number, number];
  /** Height of the block's header line (label / figure tag), px. */
  head: number;
}
/** The caption face per motif. */
export function captionFace(motif: string): Face {
  switch (motif) {
    case 'telegraph':
      return { key: 'courier', cap: 64, upper: true, track: 0.04, pad: [94, 100], head: 0 };
    case 'telemetry':
      return { key: 'jetbrains', cap: 56, upper: true, track: 0.05, pad: [72, 110], head: 32 };
    case 'electric':
      return { key: 'playfair', cap: 64, upper: false, track: 0.02, pad: [10, 20], head: 40 };
    case 'case-file':
      return { key: 'courier', cap: 64, upper: true, track: 0.03, pad: [80, 80], head: 32 };
    case 'expedition':
      return { key: 'bebas', cap: 76, upper: true, track: 0.04, pad: [60, 50], head: 30 };
    case 'siege':
      return { key: 'cinzel', cap: 58, upper: true, track: 0.05, pad: [92, 64], head: 0 };
    default:
      return { key: 'jetbrains', cap: 58, upper: true, track: 0.08, pad: [60, 48], head: 0 };
  }
}

/** The block width and type size for these words: widened (up to 1240) rather than shrunk below the readable size. */
export function captionLayout(motif: string, words: string[], baseW: number): { width: number; size: number; lines: number; face: Face } {
  const face = captionFace(motif);
  let width = baseW;
  let r = fitCaption(words, face.key, face.cap, width - face.pad[0] - 24, 3, face.upper, face.track);
  while (r.lines > 3 && width < 1240) {
    width = Math.min(1240, width + 120);
    r = fitCaption(words, face.key, face.cap, width - face.pad[0] - 24, 3, face.upper, face.track);
  }
  // Balanced lines: the narrowest block that keeps the same line count (no lone word on the last line).
  if (r.lines >= 2) {
    const inner = (w: number) => w - face.pad[0] - 24;
    while (width - 30 >= baseW * 0.55 && wrapLines(words, face.key, r.size, inner(width - 30), face.upper, face.track) === r.lines) width -= 30;
  }
  return { width, size: r.size, lines: r.lines, face };
}

/** The caption block's box in frame px (the rendered block plus its turn) — the icon layer keeps out of it. */
export function motifCaptionRect(motif: string, scene: Scene, pictured: boolean, seed: string, words: string[], letterbox: boolean): [number, number, number, number] {
  const place = captionPlace(scene, pictured, seed);
  const vpad = (letterbox ? Math.round(H * 0.11) : 0) + 70;
  if (motif === 'ticker') {
    const y = place.band === 'top' ? vpad + 30 : place.band === 'bottom' ? H - vpad - 120 : H * 0.42;
    return [0, y - 30, W, y + 122];
  }
  const L = captionLayout(motif, words, place.width);
  const h = L.lines * L.size * 1.22 + L.face.pad[1] + L.face.head;
  const x0 = place.side === 'left' ? 110 : W - 110 - L.width;
  const y0 = place.band === 'top' ? vpad : place.band === 'bottom' ? H - vpad - 20 - h : H * 0.5 - 150;
  return [x0 - 30, y0 - 30, x0 + L.width + 30, y0 + h + 30];
}

const upper = (s: string) => s.toUpperCase();

export const MotifCaption: React.FC<CapProps> = ({ t, genre, scene, words, frames, k0, k1, pictured, durFrames, light }) => {
  const f = useCurrentFrame();
  const P = motifPalette(t, genre);
  const seed = `${t.seed}|cap|${(scene as { say?: string }).say ?? words.join(' ')}`;
  const place = captionPlace(scene, pictured, seed);
  const typed = useTyped(words, frames);
  const isKey = (i: number) => i >= k0 && i < k1 && k0 >= 0;
  const key = k0 >= 0 ? words.slice(k0, k1).join(' ') : '';
  const keyAt = k0 >= 0 ? typed[k0]?.at ?? 0 : Infinity;
  const first = typed.length ? typed[0].at : 0;
  // The block arrives WITH its first word (no empty strip waiting for the voice).
  const enter = interpolate(f, [first - 3, first + 1], [0, 1], { ...clamp, easing: ease });
  // Readable size, word-wrapped; the block widens before the type would shrink below it.
  const L = captionLayout(t.motif, words, place.width);
  const out = interpolate(f, [durFrames - 8, durFrames], [1, 0], clamp);
  const bar = genre.letterbox ? Math.round(H * 0.11) : 0;
  const vpad = bar + 70;
  const pos: React.CSSProperties = {
    position: 'absolute',
    [place.side]: 110,
    ...(place.band === 'top' ? { top: vpad } : place.band === 'bottom' ? { bottom: vpad + 20 } : { top: H * 0.5 - 150 }),
    width: L.width,
    opacity: enter * out,
    transform: `perspective(1400px) rotateY(${place.turn}deg)`,
    transformOrigin: place.side === 'left' ? 'left center' : 'right center',
  } as React.CSSProperties;
  const text = (font: string, size: number, ink: string, keyInk: string, opts: { upper?: boolean; track?: string; weight?: number; italic?: boolean } = {}) => (
    <span style={{ fontFamily: font, fontSize: size, lineHeight: 1.22, letterSpacing: opts.track ?? '0.02em', fontWeight: opts.weight ?? 400, fontStyle: opts.italic ? 'italic' : 'normal', color: ink }}>
      {typed.map(({ w, i, shown, since }) => {
        const k = isKey(i);
        const word = opts.upper ? upper(w) : w;
        // The space sits OUTSIDE the word so the line wraps between words inside the block.
        return (
          <React.Fragment key={i}>
            <span style={{ color: k ? keyInk : ink, whiteSpace: 'nowrap', fontWeight: k ? 700 : undefined, opacity: since < 0 ? 0 : interpolate(since, [0, 2], [0.55, 1], clamp) }}>
              {/* Whole word (shown = its length once struck); the space it will take is reserved before. */}
              <span style={{ opacity: shown ? 1 : 0 }}>{word}</span>
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </React.Fragment>
        );
      })}
    </span>
  );
  // Size: the readable, word-wrapped layout (captionLayout) — never below CAPTION_MIN_CAP.
  const sizeFor = (_key: FontKey, _cap: number, _maxLines = 3, _upperCase = false) => L.size;

  let block: React.ReactNode;
  switch (t.motif) {
    case 'telegraph': {
      const size = sizeFor('courier', 52, 3, true);
      const code = key ? morse(key) : '';
      const unit = code ? Math.max(4, Math.min(10, (L.width - 140) / Math.max(1, morseWidth(code, 1)))) : 0;
      const tick = interpolate(f, [keyAt, keyAt + Math.max(10, code.length * 1.1)], [0, 1], clamp);
      block = (
        <div style={{ ...pos, padding: '26px 40px 30px', background: `linear-gradient(177deg, ${P.paper}, #d9ceb2)`, boxShadow: '0 26px 60px rgba(0,0,0,0.6)', rotate: `${(h01(seed) - 0.5) * 2}deg` } as React.CSSProperties}>
          {/* log-paper rules and the red margin */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${Math.round(size * 1.22) - 1}px, rgba(40,60,90,0.16) ${Math.round(size * 1.22) - 1}px ${Math.round(size * 1.22)}px)`, backgroundPosition: '0 26px' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 22, width: 2, background: `${P.accent2}99` }} />
          <div style={{ position: 'relative', paddingLeft: 14 }}>{text(P.typed, size, P.paperInk, P.accent2, { upper: true, track: '0.04em' })}</div>
          {code ? (
            <svg width={L.width - 80} height={30} style={{ position: 'relative', display: 'block', marginTop: 14, marginLeft: 14, overflow: 'hidden' }}>
              <MorseRow code={code} x={2} y={15} unit={unit} color={P.accent2} reveal={tick} />
            </svg>
          ) : null}
        </div>
      );
      break;
    }
    case 'ticker': {
      // Tape across the frame, printing as it's spoken; the band sits in the caption's band.
      const size = Math.max(50, captionMinSize('plexMono'));
      const line = words.map((w, i) => (isKey(i) ? `▼ ${upper(w)}` : upper(w)));
      const shownW = typed.filter((x) => x.since >= 0).length;
      const printed = line.slice(0, shownW).join('  ');
      const tapeW = textWidth(printed, 'plexMono', size) + 120;
      const y = place.band === 'top' ? vpad + 30 : place.band === 'bottom' ? H - vpad - 120 : H * 0.42;
      block = (
        <div style={{ position: 'absolute', left: -60, right: -60, top: y, height: 92, opacity: enter * out, transform: `rotate(${place.side === 'left' ? -2.2 : 2.2}deg)` }}>
          <div style={{ position: 'absolute', inset: 0, background: P.paper, boxShadow: '0 16px 36px rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 18, left: Math.max(80, W + 120 - tapeW), whiteSpace: 'nowrap', fontFamily: P.mono, fontSize: size, fontWeight: 600, letterSpacing: '0.06em', color: P.paperInk }}>
              {line.slice(0, shownW).map((w, i) => (
                <span key={i} style={{ color: w.startsWith('▼') ? P.accent : P.paperInk }}>
                  {w}
                  {'  '}
                </span>
              ))}
            </div>
          </div>
        </div>
      );
      break;
    }
    case 'telemetry': {
      const size = sizeFor('jetbrains', 46, 3, true);
      const wave = Array.from({ length: 60 }, (_, i) => `${i * ((L.width - 80) / 59)},${18 + Math.sin(i * 0.8 + f * 0.5) * (f >= keyAt ? 12 : 3)}`).join(' ');
      const corner = (s: React.CSSProperties) => <div style={{ position: 'absolute', width: 26, height: 26, borderColor: P.accent2, borderStyle: 'solid', ...s }} />;
      block = (
        <div style={{ ...pos, padding: '28px 36px', background: 'rgba(3,6,12,0.55)' }}>
          {corner({ left: 0, top: 0, borderWidth: '2px 0 0 2px' })}
          {corner({ right: 0, top: 0, borderWidth: '2px 2px 0 0' })}
          {corner({ left: 0, bottom: 0, borderWidth: '0 0 2px 2px' })}
          {corner({ right: 0, bottom: 0, borderWidth: '0 2px 2px 0' })}
          <div style={{ fontFamily: P.mono, fontSize: 18, letterSpacing: '0.3em', color: P.accent2, marginBottom: 10 }}>{'> SIGNAL'}</div>
          {text(P.mono, size, '#e8eef8', P.accent, { upper: true, track: '0.05em' })}
          {key ? (
            <svg width={L.width - 72} height={36} style={{ display: 'block', marginTop: 12 }}>
              <polyline points={wave} fill="none" stroke={P.accent} strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${P.accent})` }} />
            </svg>
          ) : null}
        </div>
      );
      break;
    }
    case 'electric': {
      const size = sizeFor('playfair', 58, 3);
      const s = scene as { focus?: [number, number] };
      const fx = (Array.isArray(s.focus) ? s.focus[0] : place.side === 'left' ? 0.7 : 0.3) * W;
      const fy = (Array.isArray(s.focus) ? s.focus[1] : 0.5) * H;
      const bx = place.side === 'left' ? 110 + L.width : W - 110 - L.width;
      const by = place.band === 'top' ? vpad + 40 : place.band === 'bottom' ? H - vpad - 40 : H * 0.5;
      const lead = interpolate(f, [first - 4, first + 12], [0, 1], { ...clamp, easing: ease });
      block = (
        <>
          {pictured ? (
            <svg width={W} height={H} style={{ position: 'absolute', inset: 0, opacity: out }}>
              <path d={`M ${bx} ${by} L ${fx} ${fy}`} stroke={light ? '#1c1a2a' : '#ffffff'} strokeWidth={1.6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - lead} />
              <circle cx={fx} cy={fy} r={6 * lead} fill="none" stroke={light ? '#1c1a2a' : '#ffffff'} strokeWidth={1.6} />
            </svg>
          ) : null}
          <div style={{ ...pos, textAlign: place.side === 'left' ? 'left' : 'right', textShadow: light ? 'none' : '0 2px 14px rgba(0,0,0,0.9)' }}>
            <div style={{ fontFamily: P.display, fontStyle: 'italic', fontSize: 26, color: P.accent2, marginBottom: 6 }}>{`Fig. ${1 + (Math.floor(h01(seed) * 9))}.`}</div>
            {text(P.display, size, light ? '#1c1a2a' : '#f6f4ee', P.accent, { italic: true })}
          </div>
        </>
      );
      break;
    }
    case 'case-file': {
      const size = sizeFor('courier', 48, 3, true);
      const holes = Array.from({ length: Math.floor(L.width / 46) }, (_, i) => i);
      block = (
        <div style={{ ...pos, padding: '40px 40px 40px', background: '#f1ece0', boxShadow: '0 24px 56px rgba(0,0,0,0.6)', rotate: `${(h01(seed) - 0.5) * 1.6}deg` } as React.CSSProperties}>
          {[0, 1].map((r) => (
            <div key={r} style={{ position: 'absolute', left: 14, right: 14, [r ? 'bottom' : 'top']: 10, display: 'flex', justifyContent: 'space-between' } as React.CSSProperties}>
              {holes.map((i) => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.55)' }} />
              ))}
            </div>
          ))}
          <div style={{ fontFamily: P.typed, fontSize: 20, letterSpacing: '0.2em', color: '#6b665c', marginBottom: 8 }}>{`TELETYPE${t.topic.params?.ref ? ` · ${t.topic.params.ref}` : ''}`}</div>
          {text(P.typed, size, '#22201b', P.accent2, { upper: true, track: '0.03em' })}
        </div>
      );
      break;
    }
    case 'expedition': {
      const size = sizeFor('bebas', 72, 3, true);
      block = (
        <div style={{ ...pos, padding: '22px 30px 26px', border: `1.5px solid ${light ? '#0e1a24' : 'rgba(233,241,246,0.8)'}`, background: light ? 'rgba(255,255,255,0.4)' : 'rgba(6,12,18,0.42)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: P.mono, fontSize: 18, letterSpacing: '0.3em', color: P.accent2, marginBottom: 8 }}>
            <svg width={22} height={22}><path d="M 11 1 L 15 11 L 11 21 L 7 11 Z" fill="none" stroke={P.accent2} strokeWidth={1.5} /><path d="M 11 1 L 15 11 L 7 11 Z" fill={P.accent} /></svg>
            {`BRG ${String(Math.round(h01(seed) * 359)).padStart(3, '0')}°`}
          </div>
          {text(P.display, size, light ? '#0e1a24' : '#eef3f6', P.accent, { upper: true, track: '0.04em' })}
        </div>
      );
      break;
    }
    case 'siege': {
      const size = sizeFor('cinzel', 50, 3, true);
      block = (
        <div style={{ ...pos, padding: '30px 46px 34px', background: `radial-gradient(ellipse at 50% 40%, ${P.paper} 40%, #c9ae7a 100%)`, border: `3px double ${P.paperInk}`, boxShadow: '0 24px 60px rgba(0,0,0,0.65)', textAlign: 'center' }}>
          {text(P.display, size, P.paperInk, P.accent, { upper: true, track: '0.05em', weight: 700 })}
        </div>
      );
      break;
    }
    case 'cipher':
    default: {
      const size = sizeFor('jetbrains', 50, 3, true);
      const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      block = (
        <div style={{ ...pos, padding: '24px 30px', background: 'rgba(15,16,18,0.6)' }}>
          <span style={{ fontFamily: P.mono, fontSize: size, lineHeight: 1.25, letterSpacing: '0.08em', color: '#ecebe6' }}>
            {typed.map(({ w, i, since }) => {
              const k = isKey(i);
              const W2 = upper(w);
              const lock = k ? Math.floor(Math.max(0, since) / 2) : W2.length;
              const shown = since < 0 ? '' : [...W2].map((c, j) => (j < lock ? c : alpha[Math.floor(h01(`${i}${j}${Math.floor(f / 2)}`) * 26)])).join('');
              return (
                <React.Fragment key={i}>
                  <span style={{ color: k ? P.accent : '#ecebe6', background: k && since >= 0 ? `${P.accent}22` : 'transparent', whiteSpace: 'nowrap' }}>{shown}</span>
                  {i < words.length - 1 ? ' ' : ''}
                </React.Fragment>
              );
            })}
          </span>
        </div>
      );
    }
  }
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{block}</AbsoluteFill>;
};

