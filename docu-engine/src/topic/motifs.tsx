import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { FONT } from '../fonts';
import { ELITE } from '../looks/fonts';
import type { FontKey, Genre, MotifId } from '../types';
import { h01, morse, rng, type TopicCtx } from './context';
import { MOTIF_FACES, TYPED_MOTIFS } from './fontkeys';

export { TYPED_MOTIFS };

/*
 * MOTIF SYSTEMS — the visual language a whole video speaks (LEMMiNO's
 * Kryptos video is cipher tableaus from the first frame to the last;
 * MagnatesMedia's Rockefeller is oil and fire). Each motif is a palette, a
 * pair of faces and four pieces of furniture:
 *   - Texture: a quiet, static layer under every text scene's ground
 *   - Card:    the chapter card (src/topic/cards.tsx)
 *   - Wipe:    the motif's own wipe between two shots
 *   - skin:    how its explainers / UI cards are drawn (explainer.tsx, uicard.tsx)
 * All flat SVG/CSS, no per-frame blur or noise: they cost next to nothing.
 */

export interface MotifPalette {
  /** Panel / card ground. */
  ground: string;
  ground2: string;
  /** Light paper used by the motif's printed things (forms, tape, parchment). */
  paper: string;
  paperInk: string;
  ink: string;
  dim: string;
  accent: string;
  accent2: string;
  /** Mono / technical face, display face and a typed face (CSS font-family strings). */
  mono: string;
  display: string;
  typed: string;
  monoKey: FontKey;
  displayKey: FontKey;
  /** Uppercase display? */
  caps: boolean;
}

const BASE: Record<MotifId, Omit<MotifPalette, 'mono' | 'display' | 'typed'> & { typedElite?: boolean }> = {
  cipher: { ground: '#17181b', ground2: '#0f1012', paper: '#e9e6df', paperInk: '#17181b', ink: '#ecebe6', dim: '#8d8c87', accent: '#f2b33d', accent2: '#4fd1c5', monoKey: 'jetbrains', displayKey: 'spacegrotesk', caps: true },
  telegraph: { ground: '#0c121a', ground2: '#06090e', paper: '#ece3cc', paperInk: '#2a2219', ink: '#efe8d6', dim: '#8e9aa6', accent: '#ffb547', accent2: '#e2563b', monoKey: 'courier', displayKey: 'oldstandard', caps: true, typedElite: true },
  ticker: { ground: '#11110f', ground2: '#080807', paper: '#efe6cf', paperInk: '#1d1a14', ink: '#f2eee4', dim: '#8f8a7d', accent: '#e8423a', accent2: '#3fbf73', monoKey: 'plexMono', displayKey: 'oswald', caps: true },
  telemetry: { ground: '#05070d', ground2: '#020306', paper: '#dfe7f2', paperInk: '#0a0f1a', ink: '#e1e9f5', dim: '#6f7f96', accent: '#e8b64c', accent2: '#63d0ff', monoKey: 'jetbrains', displayKey: 'spacegrotesk', caps: true },
  electric: { ground: '#0a0b16', ground2: '#05050c', paper: '#ede5d1', paperInk: '#1c1a2a', ink: '#eef1ff', dim: '#8088a8', accent: '#8fb7ff', accent2: '#ffcf6b', monoKey: 'courier', displayKey: 'playfair', caps: true },
  'case-file': { ground: '#121314', ground2: '#0a0a0b', paper: '#e9dfc6', paperInk: '#22201b', ink: '#f2efe8', dim: '#8c8a84', accent: '#f2c318', accent2: '#c8102e', monoKey: 'courier', displayKey: 'oswald', caps: true, typedElite: true },
  expedition: { ground: '#0a1118', ground2: '#05080c', paper: '#e3ecf1', paperInk: '#0e1a24', ink: '#e8eff3', dim: '#7f95a6', accent: '#ff8a3d', accent2: '#9fd3ef', monoKey: 'plexMono', displayKey: 'bebas', caps: true },
  siege: { ground: '#1a120b', ground2: '#0d0905', paper: '#e6d3ab', paperInk: '#2b1c0e', ink: '#f1e4c8', dim: '#a08b67', accent: '#b8322a', accent2: '#d4a64a', monoKey: 'crimson', displayKey: 'cinzel', caps: true },
};

export function motifPalette(t: TopicCtx, g: Genre): MotifPalette {
  const b = { ...BASE[t.motif], monoKey: MOTIF_FACES[t.motif][0], displayKey: MOTIF_FACES[t.motif][1] };
  const hex = (v?: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
  const displayKey = (t.topic.headline as FontKey | undefined) ?? b.displayKey;
  return {
    ...b,
    accent: hex(t.topic.accent) ?? b.accent,
    accent2: hex(t.topic.accent2) ?? b.accent2,
    displayKey,
    mono: FONT[b.monoKey],
    display: FONT[displayKey] ?? FONT[b.displayKey],
    typed: b.typedElite ? ELITE : FONT[b.monoKey],
  };
}

/** The faces a motif needs (fontkeys.ts is the source; fonts.ts fetches only what a script uses). */
export function motifFontKeys(m: MotifId): FontKey[] {
  return MOTIF_FACES[m] ? [...MOTIF_FACES[m]] : [];
}

/* ================================================================ texture */

/**
 * The persistent layer under text scenes: barely there (5-9%), static, in the
 * scene's ink. Only its slow drift changes per frame (a transform).
 */
export const MotifTexture: React.FC<{ t: TopicCtx; light?: boolean; strength?: number }> = ({ t, light, strength = 1 }) => {
  const f = useCurrentFrame();
  const ink = light ? '#1b1712' : '#f4efe4';
  const k = Math.max(0, Math.min(1, (t.topic.texture ?? 1) * strength));
  const svg = useMemo(() => textureSvg(t, ink), [t, ink]);
  if (k <= 0) return null;
  const dx = (f * 0.25) % 40;
  return (
    <AbsoluteFill style={{ opacity: (light ? 0.075 : 0.085) * k * 1.0, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: -60, transform: `translate(${-dx}px, ${dx * 0.3}px)` }}>{svg}</div>
    </AbsoluteFill>
  );
};

const W = 2040;
const H = 1200;

function textureSvg(t: TopicCtx, ink: string): React.ReactNode {
  const r = rng(`${t.seed}|tex|${t.motif}`);
  const tokens = (t.topic.tokens ?? []).filter(Boolean);
  const els: React.ReactNode[] = [];
  const P = BASE[t.motif];
  const mono = FONT[P.monoKey];
  switch (t.motif) {
    case 'cipher': {
      // A tableau of letters: the message and the tokens folded into a grid, one row brighter.
      const src = (t.topic.message || tokens.join(' ') || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const cols = 34;
      const rows = 19;
      for (let y = 0; y < rows; y++) {
        let line = '';
        for (let x = 0; x < cols; x++) line += r() < 0.55 && src ? src[(y * cols + x) % src.length] : alpha[Math.floor(r() * 26)];
        els.push(
          <text key={`c${y}`} x={20} y={60 + y * 62} fill={ink} fontFamily={mono} fontSize={40} letterSpacing={20} opacity={y === 7 ? 1 : 0.55}>
            {line}
          </text>,
        );
      }
      break;
    }
    case 'telegraph': {
      // Ruled wireless log paper, a red margin rule, and the call in Morse along the foot.
      for (let y = 0; y < 20; y++) els.push(<line key={`l${y}`} x1={0} x2={W} y1={70 + y * 58} y2={70 + y * 58} stroke={ink} strokeWidth={1.2} opacity={0.6} />);
      els.push(<line key="m" x1={210} x2={210} y1={0} y2={H} stroke={P.accent2} strokeWidth={2} opacity={0.9} />);
      const call = morse(tokens.slice(0, 3).join(' ') || 'CQD SOS');
      els.push(<MorseRow key="mr" code={`${call} / ${call}`} x={250} y={H - 70} unit={14} color={ink} />);
      els.push(<MorseRow key="mr2" code={call} x={250} y={110} unit={10} color={ink} />);
      break;
    }
    case 'ticker': {
      // Quote-board cells and a running tape of the story's own figures.
      for (let x = 0; x < 18; x++) els.push(<line key={`v${x}`} x1={x * 120} x2={x * 120} y1={0} y2={H} stroke={ink} strokeWidth={1} opacity={0.45} />);
      for (let y = 0; y < 11; y++) els.push(<line key={`h${y}`} x1={0} x2={W} y1={y * 120} y2={y * 120} stroke={ink} strokeWidth={1} opacity={0.45} />);
      const tape = (tokens.length ? tokens : ['DOW', 'U.S. STEEL', 'RCA']).map((x) => x.toUpperCase()).join('   ·   ');
      els.push(
        <g key="tape">
          <rect x={0} y={140} width={W} height={56} fill={ink} opacity={0.25} />
          <text x={30} y={180} fill={ink} fontFamily={mono} fontSize={30} letterSpacing={6}>{`${tape}   ·   ${tape}   ·   ${tape}`}</text>
        </g>,
      );
      break;
    }
    case 'telemetry': {
      // Range rings and bearing ticks round an off-frame Earth, a dotted trajectory, readouts.
      const cx = -180;
      const cy = H + 160;
      for (let i = 1; i <= 9; i++) els.push(<circle key={`r${i}`} cx={cx} cy={cy} r={i * 210} fill="none" stroke={ink} strokeWidth={1.2} opacity={i % 3 === 0 ? 0.9 : 0.45} strokeDasharray={i % 3 === 0 ? undefined : '4 10'} />);
      for (let a = 0; a < 90; a += 3) {
        const rad = (-a * Math.PI) / 180;
        const r0 = 1880;
        const r1 = r0 + (a % 15 === 0 ? 46 : 18);
        els.push(<line key={`t${a}`} x1={cx + Math.cos(rad) * r0} y1={cy + Math.sin(rad) * r0} x2={cx + Math.cos(rad) * r1} y2={cy + Math.sin(rad) * r1} stroke={ink} strokeWidth={1.4} />);
      }
      els.push(<path key="traj" d={`M ${cx + 300} ${cy - 300} Q ${W * 0.55} ${H * 0.05} ${W + 100} ${H * 0.3}`} fill="none" stroke={ink} strokeWidth={2} strokeDasharray="2 12" />);
      tokens.slice(0, 4).forEach((tk, i) => {
        els.push(
          <text key={`k${i}`} x={i % 2 ? W - 120 : 120} y={i < 2 ? 120 : H - 90} textAnchor={i % 2 ? 'end' : 'start'} fill={ink} fontFamily={mono} fontSize={26} letterSpacing={5}>
            {`${['RNG', 'T+', 'SIG', 'FRQ'][i]}  ${tk.toUpperCase()}`}
          </text>,
        );
      });
      break;
    }
    case 'electric': {
      // Patent-drawing linework: coils, wires at right angles, terminals, figure numbers.
      const coil = (x: number, y: number, n: number, key: string) => (
        <g key={key}>
          {Array.from({ length: n }, (_, i) => (
            <ellipse key={i} cx={x} cy={y + i * 22} rx={70} ry={12} fill="none" stroke={ink} strokeWidth={2} />
          ))}
          <line x1={x - 70} x2={x - 70} y1={y} y2={y + (n - 1) * 22} stroke={ink} strokeWidth={2} />
          <line x1={x + 70} x2={x + 70} y1={y} y2={y + (n - 1) * 22} stroke={ink} strokeWidth={2} />
        </g>
      );
      els.push(coil(300, 260, 14, 'c1'), coil(1620, 520, 10, 'c2'));
      els.push(<path key="w1" d="M 370 260 H 900 V 140 H 1500 V 520 H 1550" fill="none" stroke={ink} strokeWidth={2} />);
      els.push(<path key="w2" d="M 230 560 V 900 H 1100 V 980 H 1690 V 740" fill="none" stroke={ink} strokeWidth={2} />);
      for (const [x, y] of [[900, 140], [1500, 140], [1100, 900], [1100, 980], [230, 560]]) els.push(<circle key={`t${x}${y}`} cx={x} cy={y} r={9} fill="none" stroke={ink} strokeWidth={2} />);
      els.push(<text key="f1" x={260} y={210} fill={ink} fontFamily={FONT.playfair} fontStyle="italic" fontSize={34}>Fig. 1.</text>);
      els.push(<text key="f2" x={1560} y={470} fill={ink} fontFamily={FONT.playfair} fontStyle="italic" fontSize={34}>Fig. 2.</text>);
      break;
    }
    case 'case-file': {
      // Teletype paper: sprocket perforations down both edges, a typed reference line, ruled form lines.
      for (let y = 0; y < 26; y++) {
        els.push(<circle key={`pl${y}`} cx={46} cy={30 + y * 48} r={9} fill="none" stroke={ink} strokeWidth={2} />);
        els.push(<circle key={`pr${y}`} cx={W - 46} cy={30 + y * 48} r={9} fill="none" stroke={ink} strokeWidth={2} />);
      }
      els.push(<line key="ml" x1={92} x2={92} y1={0} y2={H} stroke={ink} strokeWidth={1.5} strokeDasharray="10 8" />);
      els.push(<line key="mr" x1={W - 92} x2={W - 92} y1={0} y2={H} stroke={ink} strokeWidth={1.5} strokeDasharray="10 8" />);
      const ref = [t.topic.params?.ref, t.topic.params?.date, ...tokens.slice(0, 2)].filter(Boolean).join('   ').toUpperCase() || 'FILE';
      for (let y = 0; y < 3; y++) els.push(<text key={`r${y}`} x={150} y={130 + y * 470} fill={ink} fontFamily={mono} fontSize={30} letterSpacing={4}>{ref}</text>);
      for (let y = 0; y < 16; y++) els.push(<line key={`l${y}`} x1={140} x2={W - 140} y1={220 + y * 64} y2={220 + y * 64} stroke={ink} strokeWidth={1} opacity={0.5} />);
      break;
    }
    case 'expedition': {
      // Topographic contours round two summits, and a bearing scale along the top.
      for (const [cx, cy, n, key] of [[520, 420, 11, 'a'], [1580, 860, 9, 'b']] as [number, number, number, string][]) {
        const ph = r() * 6;
        for (let i = 1; i <= n; i++) els.push(<path key={`${key}${i}`} d={contour(cx, cy, i * 62, ph + i * 0.35, `${t.seed}${key}${i}`)} fill="none" stroke={ink} strokeWidth={i % 5 === 0 ? 2.6 : 1.3} />);
      }
      for (let x = 0; x <= 72; x++) {
        const X = 120 + x * 25;
        els.push(<line key={`b${x}`} x1={X} x2={X} y1={40} y2={x % 9 === 0 ? 86 : 62} stroke={ink} strokeWidth={1.5} />);
        if (x % 9 === 0) els.push(<text key={`bt${x}`} x={X} y={118} textAnchor="middle" fill={ink} fontFamily={mono} fontSize={24}>{String(x * 5).padStart(3, '0')}</text>);
      }
      break;
    }
    case 'siege': {
      // Engraving: hatched shading bands, a double ruled border and a campaign arrow.
      for (let i = -40; i < 80; i++) els.push(<line key={`h${i}`} x1={i * 28} y1={0} x2={i * 28 + 700} y2={H} stroke={ink} strokeWidth={1} opacity={0.35} />);
      els.push(<rect key="b1" x={60} y={60} width={W - 120} height={H - 120} fill="none" stroke={ink} strokeWidth={3} />);
      // A campaign arrow as old war maps draw it: one broad stroke and a broad head (no thin dashed line).
      els.push(<path key="ar" d={`M 300 ${H - 260} C 700 ${H - 520}, 1200 ${H - 160}, 1660 ${H - 462}`} fill="none" stroke={ink} strokeWidth={16} strokeLinecap="round" />);
      els.push(<path key="ah" d={`M 1730 ${H - 500} l -110 4 l 46 -78 z`} fill={ink} />);
      break;
    }
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {els}
    </svg>
  );
}

/** A closed, irregular contour round (cx, cy): harmonics seeded per line. */
export function contour(cx: number, cy: number, r: number, ph: number, seed: string): string {
  const q = rng(seed);
  const a1 = 0.12 + q() * 0.08;
  const a2 = 0.05 + q() * 0.05;
  const a3 = 0.03 + q() * 0.03;
  const pts: [number, number][] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const k = 1 + a1 * Math.sin(2 * a + ph) + a2 * Math.sin(3 * a + ph * 1.7) + a3 * Math.sin(5 * a + ph * 0.6);
    pts.push([cx + Math.cos(a) * r * 1.35 * k, cy + Math.sin(a) * r * 0.85 * k]);
  }
  return `M ${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')} Z`;
}

/** A row of Morse marks: dots and dashes drawn as round-capped bars. `reveal` 0..1 shows a prefix. */
export const MorseRow: React.FC<{ code: string; x: number; y: number; unit: number; color: string; reveal?: number; glow?: string }> = ({ code, x, y, unit, color, reveal = 1, glow }) => {
  const marks: React.ReactNode[] = [];
  let cx = x;
  const total = code.length;
  const shown = Math.floor(total * Math.max(0, Math.min(1, reveal)));
  [...code].slice(0, shown).forEach((ch, i) => {
    if (ch === '.') {
      marks.push(<line key={i} x1={cx} x2={cx + 0.01} y1={y} y2={y} stroke={color} strokeWidth={unit} strokeLinecap="round" />);
      cx += unit * 2;
    } else if (ch === '-') {
      marks.push(<line key={i} x1={cx} x2={cx + unit * 2.6} y1={y} y2={y} stroke={color} strokeWidth={unit} strokeLinecap="round" />);
      cx += unit * 4.6;
    } else if (ch === ' ') cx += unit * 1.6;
    else if (ch === '/') cx += unit * 3.2;
  });
  return <g style={glow ? { filter: `drop-shadow(0 0 ${unit}px ${glow})` } : undefined}>{marks}</g>;
};

/** Width of a Morse row at `unit`. */
export function morseWidth(code: string, unit: number): number {
  let w = 0;
  for (const ch of code) w += ch === '.' ? unit * 2 : ch === '-' ? unit * 4.6 : ch === ' ' ? unit * 1.6 : ch === '/' ? unit * 3.2 : 0;
  return w;
}

/* ================================================================ wipe */

export const WIPE_IN = 12;
export const WIPE_OUT = 10;

/**
 * The motif's wipe: one panel crosses the cut. It enters over the last
 * WIPE_OUT frames of the outgoing shot (`phase` -1..0) and leaves over the
 * first WIPE_IN frames of the incoming one (0..1). Covers the frame fully at
 * the cut itself, so the two shots never show half and half.
 */
export const MotifWipe: React.FC<{ t: TopicCtx; P: MotifPalette; phase: number }> = ({ t, P, phase }) => {
  // phase -1 (panel off left) .. 0 (covers) .. 1 (off right).
  const e = phase < 0 ? -Math.pow(-phase, 1.6) : Math.pow(phase, 1.6);
  const x = e * 1.18 * 1920;
  const lead = phase < 0 ? 'right' : 'left';
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -20, bottom: -20, left: -40, width: 2000, transform: `translateX(${x}px)` }}>
        <WipeFace t={t} P={P} lead={lead} />
      </div>
    </AbsoluteFill>
  );
};

const WipeFace: React.FC<{ t: TopicCtx; P: MotifPalette; lead: 'left' | 'right' }> = ({ t, P, lead }) => {
  const f = useCurrentFrame();
  const tokens = (t.topic.tokens ?? []).filter(Boolean);
  const edgeX = lead === 'right' ? 2000 : 0;
  const face = useMemo(() => {
    const els: React.ReactNode[] = [];
    const r = rng(`${t.seed}|wipe`);
    switch (t.motif) {
      case 'cipher': {
        const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        for (let c = 0; c < 30; c++)
          for (let y = 0; y < 13; y++)
            els.push(
              <text key={`${c}-${y}`} x={30 + c * 66} y={80 + y * 84} fill={y === 6 ? P.accent : P.ink} opacity={y === 6 ? 0.95 : 0.22 + r() * 0.3} fontFamily={P.mono} fontSize={46}>
                {alpha[Math.floor(r() * 26)]}
              </text>,
            );
        break;
      }
      case 'telegraph': {
        const call = morse(tokens.slice(0, 2).join(' ') || 'CQD SOS');
        for (let y = 0; y < 9; y++) els.push(<MorseRow key={y} code={`${call} / ${call} / ${call}`} x={40 + (y % 3) * 60} y={110 + y * 112} unit={16} color={y === 4 ? P.accent : P.ink} />);
        break;
      }
      case 'ticker': {
        const tape = (tokens.length ? tokens : ['DOW']).map((x) => x.toUpperCase()).join('  ▼  ');
        for (let y = 0; y < 8; y++)
          els.push(
            <g key={y}>
              <rect x={0} y={60 + y * 135} width={2000} height={84} fill={P.paper} opacity={0.96} />
              <text x={-((y * 173) % 400)} y={117 + y * 135} fill={P.paperInk} fontFamily={P.mono} fontSize={40} letterSpacing={4}>{`${tape}  ▼  ${tape}  ▼  ${tape}`}</text>
            </g>,
          );
        break;
      }
      case 'telemetry': {
        for (let y = 0; y < 14; y++) els.push(<line key={y} x1={0} x2={2000} y1={y * 84} y2={y * 84} stroke={P.accent2} strokeWidth={1} opacity={0.25} />);
        const pts = Array.from({ length: 100 }, (_, i) => `${i * 20},${540 + Math.sin(i * 0.5) * 60 * Math.sin(i * 0.07)}`).join(' ');
        els.push(<polyline key="w" points={pts} fill="none" stroke={P.accent2} strokeWidth={3} />);
        break;
      }
      case 'electric': {
        for (let k = 0; k < 3; k++) {
          let d = `M 0 ${300 + k * 240}`;
          for (let i = 1; i <= 24; i++) d += ` L ${i * 84} ${300 + k * 240 + (r() - 0.5) * 120}`;
          els.push(<path key={k} d={d} fill="none" stroke={k === 1 ? '#ffffff' : P.accent} strokeWidth={k === 1 ? 5 : 2.5} opacity={k === 1 ? 0.95 : 0.7} />);
        }
        break;
      }
      case 'case-file': {
        els.push(<rect key="tab" x={lead === 'right' ? 1500 : 120} y={40} width={380} height={90} rx={14} fill={P.paper} />);
        els.push(<rect key="body" x={0} y={110} width={2000} height={1200} fill={P.paper} />);
        for (let y = 0; y < 14; y++) els.push(<line key={y} x1={80} x2={1920} y1={200 + y * 66} y2={200 + y * 66} stroke={P.paperInk} strokeWidth={1} opacity={0.18} />);
        // Never a blank page crossing the cut: the file's own typed entries and its stamp.
        const rows = (tokens.length ? tokens : ['CASE FILE', 'EVIDENCE', 'STATEMENT']).slice(0, 6);
        rows.forEach((tk, k) =>
          els.push(
            <text key={`t${k}`} x={170} y={250 + k * 132} fill={P.paperInk} fontFamily={P.typed} fontSize={56} letterSpacing={4} opacity={0.82}>
              {`${String(k + 1).padStart(2, '0')}  ${tk.toUpperCase()}`}
            </text>,
          ),
        );
        const ref = String(t.topic.params?.ref ?? 'CLASSIFIED').toUpperCase();
        els.push(
          <g key="stamp" transform="translate(1240 760) rotate(-11)">
            <rect x={0} y={0} width={Math.max(420, ref.length * 46 + 80)} height={132} fill="none" stroke={P.accent2} strokeWidth={8} opacity={0.85} />
            <text x={Math.max(420, ref.length * 46 + 80) / 2} y={94} textAnchor="middle" fill={P.accent2} fontFamily={P.display} fontSize={78} fontWeight={700} opacity={0.85}>
              {ref}
            </text>
          </g>,
        );
        break;
      }
      case 'expedition': {
        for (let i = 1; i < 16; i++) els.push(<path key={i} d={contour(1000, 540, i * 70, 1.3 + i * 0.2, `${t.seed}w${i}`)} fill="none" stroke={P.paperInk} strokeWidth={1.5} opacity={0.35} />);
        break;
      }
      case 'siege': {
        // Never an empty sheet sweeping the screen (1453 at 14:01): the besieged walls in silhouette along
        // the bottom, towers at intervals, and the story's own word set large across the parchment.
        const ink = P.paperInk;
        els.push(<rect key="wall" x={0} y={880} width={2000} height={320} fill={ink} opacity={0.78} />);
        for (let x = 0; x < 2000; x += 64) els.push(<rect key={`m${x}`} x={x} y={846} width={36} height={40} fill={ink} opacity={0.78} />);
        for (let k = 0; k < 6; k++) {
          const tx = 120 + k * 360;
          els.push(<rect key={`t${k}`} x={tx} y={700} width={150} height={200} fill={ink} opacity={0.82} />);
          for (let m = 0; m < 4; m++) els.push(<rect key={`tm${k}${m}`} x={tx + m * 40} y={666} width={26} height={38} fill={ink} opacity={0.82} />);
        }
        const word = String(tokens[0] ?? '').toUpperCase();
        if (word) els.push(<text key="w" x={1000} y={520} textAnchor="middle" fill={ink} opacity={0.82} fontFamily={FONT.playfair} fontWeight={700} fontSize={Math.min(300, Math.floor(1700 / Math.max(3, word.length * 0.62)))} letterSpacing={6}>{word}</text>);
        break;
      }
    }
    return els;
  }, [t, P, lead, tokens]);
  const bg =
    t.motif === 'case-file'
      ? 'transparent'
      : t.motif === 'ticker'
        ? P.ground2
        : t.motif === 'expedition'
          ? `linear-gradient(180deg, ${P.paper}, #c9d8e2)`
          : t.motif === 'siege'
            ? `linear-gradient(180deg, ${P.paper}, #cdb487)`
            : `linear-gradient(180deg, ${P.ground}, ${P.ground2})`;
  // The leading edge: the motif's own seam (a scan line, a burnt edge, a frost front, an arc).
  const edge =
    t.motif === 'siege'
      ? `linear-gradient(90deg, transparent, #ff9b3d 40%, #3a1a06 60%, transparent)`
      : t.motif === 'expedition'
        ? `linear-gradient(90deg, transparent, #ffffff 50%, transparent)`
        : t.motif === 'case-file'
          ? `linear-gradient(90deg, transparent, rgba(0,0,0,0.45) 50%, transparent)`
          : `linear-gradient(90deg, transparent, ${t.motif === 'electric' ? '#ffffff' : P.accent} 50%, transparent)`;
  const flick = t.motif === 'electric' ? 0.6 + h01(`${f}`) * 0.4 : 1;
  return (
    <div style={{ position: 'absolute', inset: 0, background: bg, boxShadow: t.motif === 'case-file' ? '0 0 60px rgba(0,0,0,0.6)' : undefined }}>
      <svg width={2000} height={1200} style={{ position: 'absolute', inset: 0 }}>
        {face}
      </svg>
      <div style={{ position: 'absolute', top: 0, bottom: 0, width: 44, left: edgeX - 22, background: edge, opacity: flick }} />
    </div>
  );
};
