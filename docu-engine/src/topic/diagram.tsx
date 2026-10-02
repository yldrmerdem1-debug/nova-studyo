import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { fitFont } from '../fonts';
import type { ExplainerScene, ExplainerStep, FontKey } from '../types';
import { h01, morse, roman, type TopicCtx } from './context';
import { LineIcon, isIcon } from './icons';
import { MorseRow, contour, morseWidth, type MotifPalette } from './motifs';

/*
 * EXPLAINER DIAGRAMS — the mechanism SHOWN, not listed (LEMMiNO moves the
 * letters through the tableau; it never shows a bullet list). Each motif
 * draws the thing itself and moves it on the narration; words are only
 * short annotations beside the drawing:
 *   telemetry   Earth and the spacecraft in line drawing, the signal pulse
 *               travelling the path to each step; a failure flashes red, a
 *               split breaks into two memory blocks
 *   electric    patent circuits: a compare is two generators side by side —
 *               the current flows down a short wire and down long lines on
 *               pylons; other kinds a circuit lighting terminal by terminal
 *   cipher      a keyed tableau; each step's letter slides down into its row
 *   case-file   evidence photographed as objects, pinned and tied with string
 *   telegraph   a chart with the ship; radio rings pulse on every step while
 *               the message ticks out in Morse on the paper strip
 *   ticker      a loop of the market: a red marker runs round it (cycle) or a
 *               cascade falls step by step
 *   expedition  a slope section: snow piles, the slab breaks, the marker slides
 *   siege       campaign arrows advance from the field onto the walls
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.out(Easing.cubic);
const inOut = Easing.inOut(Easing.cubic);

export interface DiagramProps {
  t: TopicCtx;
  P: MotifPalette;
  steps: ExplainerStep[];
  kind: ExplainerScene['kind'];
  /** Frame each step lights: -999 already lit before this scene, 1e9 a later scene's. */
  starts: number[];
  durFrames: number;
}

/** Arrival 0..1 of step i. */
const arrive = (f: number, s: number, len = 14) => (s <= -999 ? 1 : s >= 1e9 ? 0 : interpolate(f, [s, s + len], [0, 1], { ...clamp, easing: ease }));
/** Index of the newest lit step. */
function activeOf(f: number, starts: number[]): number {
  let a = -1;
  starts.forEach((s, i) => {
    if (f >= s) a = i;
  });
  return a;
}

/** An icon for a step: its own, else one read from its words, else the motif's glyph. */
const GUESS: [RegExp, string][] = [
  [/\b(margin|broker|loan|debt)\b/i, 'report-money'],
  [/\b(dug|dig|digs)\b/i, 'shovel'],
  [/\b(weakens?|crack|breaks?)\b/i, 'alert-triangle'],
  [/\b(wind)\b/i, 'wind'],
  [/\b(tie|clip-on)\b/i, 'tie'],
  [/\b(irregulars)\b/i, 'users'],
  [/\b(troops)\b/i, 'shield'],
  [/\b(janissaries)\b/i, 'swords'],
  [/\b(more calls)\b/i, 'arrow-big-down-lines'],
  [/\b(command|signal|sent|send|reply|transmit|call|cqd|sos)\b/i, 'broadcast'],
  [/\b(chip|memory|computer|code|data)\b/i, 'cpu'],
  [/\b(spoke|voice|hear|radio)\b/i, 'antenna'],
  [/\b(dc|direct)\b/i, 'battery'],
  [/\b(ac|alternating|current|power|electric)\b/i, 'bolt'],
  [/\b(deadly|death|chair|killed)\b/i, 'skull'],
  [/\b(miles|far|distance|lines)\b/i, 'building-broadcast-tower'],
  [/\b(tie|clip)\b/i, 'scissors'],
  [/\b(cigarette|butts|smok)/i, 'smoking'],
  [/\b(fingerprint)/i, 'fingerprint'],
  [/\b(parachute|chute)/i, 'parachute'],
  [/\b(money|cash|dollars|bills)\b/i, 'cash'],
  [/\b(prices?|fall|down|crash)\b/i, 'trending-down'],
  [/\b(margin|broker|loan|debt)\b/i, 'report-money'],
  [/\b(sell|sells|selling)\b/i, 'cash-banknote'],
  [/\b(ship|ships|boat)\b/i, 'ship'],
  [/\b(slope|dug|snow|slab)\b/i, 'mountain'],
  [/\b(wind)\b/i, 'wind'],
  [/\b(tent)\b/i, 'tent'],
  [/\b(alphabet|letters|plaintext|tableau|keyword)\b/i, 'letter-case'],
  [/\b(troops|janissaries|irregulars|army|soldiers)\b/i, 'swords'],
  [/\b(wall|walls)\b/i, 'building-castle'],
  [/\b(plank|planks|oil|greased|hauled|oxen)\b/i, 'hammer'],
];
const GLYPH: Record<string, string> = { telemetry: 'satellite', electric: 'bolt', cipher: 'key', 'case-file': 'search', telegraph: 'antenna', ticker: 'chart-line', expedition: 'mountain', siege: 'swords' };
export function stepIcon(st: ExplainerStep, motif: string): string {
  const own = (st as { icon?: string }).icon;
  if (own && isIcon(own)) return own;
  const text = `${st.label} ${st.detail ?? ''}`;
  for (const [re, id] of GUESS) if (re.test(text) && isIcon(id)) return id;
  return GLYPH[motif] ?? 'question-mark';
}

/** A short annotation, fitted to its width (never overflows its object). */
const Note: React.FC<{ text: string; x: number; y: number; w: number; font: string; fontKey: FontKey; color: string; cap?: number; align?: 'left' | 'center' | 'right'; o?: number; italic?: boolean; weight?: number; lines?: 1 | 2 }> = ({
  text, x, y, w, font, fontKey, color, cap = 30, align = 'center', o = 1, italic, weight = 600, lines = 2,
}) => {
  const T = text.toUpperCase();
  const words = T.split(/\s+/);
  let ls = [T];
  if (lines === 2 && words.length > 1 && fitFont(T, fontKey, { maxW: w / 1.12, cap, upper: true, trackEm: 0.06 }) < cap * 0.95) {
    let best = 1;
    const d = (k: number) => Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length);
    for (let k = 1; k < words.length; k++) if (d(k) < d(best)) best = k;
    ls = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  // Typewriter faces run wider than their measured cousins: 12% room.
  const size = Math.min(...ls.map((l) => fitFont(l, fontKey, { maxW: w / 1.12, cap, upper: true, trackEm: 0.06 })));
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  return (
    <div style={{ position: 'absolute', left, top: y, width: w, textAlign: align, fontFamily: font, fontSize: size, fontWeight: weight, fontStyle: italic ? 'italic' : 'normal', letterSpacing: '0.06em', lineHeight: 1.12, color, opacity: o, whiteSpace: 'nowrap' }}>
      {ls.map((l, k) => (
        <div key={k}>{l}</div>
      ))}
    </div>
  );
};

/** A point along a quadratic curve. */
const qpt = (a: [number, number], c: [number, number], b: [number, number], t: number): [number, number] => [
  (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0],
  (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1],
];

/* ------------------------------------------------------------ telemetry */

const Telemetry: React.FC<DiagramProps> = ({ P, steps, starts, t }) => {
  const f = useCurrentFrame();
  const n = steps.length;
  const B: [number, number] = [1630, 430]; // spacecraft (the path ends here)
  const A: [number, number] = [300, 760]; // Earth (the path starts here)
  const C: [number, number] = [930, 300];
  const tAt = (i: number) => 0.14 + (0.72 * i) / Math.max(1, n - 1);
  const act = activeOf(f, starts);
  // The pulse runs from the previous step to the active one over ~16 frames after its cue.
  const prevT = act > 0 ? tAt(act - 1) : 0;
  const pulseT = act >= 0 ? interpolate(f, [starts[act] - 16, starts[act]], [prevT, tAt(act)], { ...clamp, easing: inOut }) : 0;
  const pulse = qpt(A, C, B, pulseT);
  const path = `M ${A[0]} ${A[1]} Q ${C[0]} ${C[1]} ${B[0]} ${B[1]}`;
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {/* Earth */}
        <g transform={`translate(${A[0]} ${A[1]})`}>
          <circle r={78} fill="#0d1a2c" stroke={P.accent2} strokeWidth={2} />
          {[-40, 0, 40].map((y) => <ellipse key={y} cx={0} cy={y * 0.9} rx={Math.sqrt(78 * 78 - y * y)} ry={10} fill="none" stroke={P.accent2} strokeWidth={1} opacity={0.5} />)}
          <ellipse rx={30} ry={78} fill="none" stroke={P.accent2} strokeWidth={1} opacity={0.5} />
        </g>
        {/* the spacecraft: dish, bus, booms */}
        <g transform={`translate(${B[0]} ${B[1]}) rotate(-18)`} stroke={P.ink} strokeWidth={2.2} fill="none">
          <path d="M -70 -10 Q 0 70 70 -10" />
          <line x1={-70} y1={-10} x2={70} y2={-10} />
          <line x1={0} y1={30} x2={0} y2={-60} />
          <rect x={-22} y={30} width={44} height={26} />
          <line x1={22} y1={44} x2={170} y2={90} />
          <line x1={-22} y1={44} x2={-120} y2={110} />
          <circle cx={170} cy={90} r={8} />
        </g>
        <path d={path} fill="none" stroke={P.accent2} strokeWidth={2} strokeDasharray="4 12" opacity={0.5} />
        {act >= 0 ? (
          <>
            <circle cx={pulse[0]} cy={pulse[1]} r={9} fill="#ffffff" style={{ filter: `drop-shadow(0 0 10px ${P.accent2}) drop-shadow(0 0 22px ${P.accent2})` }} />
            <circle cx={pulse[0]} cy={pulse[1]} r={9 + ((f % 20) / 20) * 30} fill="none" stroke={P.accent2} strokeWidth={1.5} opacity={1 - (f % 20) / 20} />
          </>
        ) : null}
      </svg>
      {steps.map((st, i) => {
        const p = arrive(f, starts[i]);
        const [x, y] = qpt(A, C, B, tAt(i));
        const fail = /fail|broke|error|went wrong|dead/i.test(st.label);
        const split = /split|divid|two/i.test(st.label);
        const hot = i === act;
        const col = fail && p > 0 ? '#ff4d4d' : hot ? P.accent : P.ink;
        const flash = fail && hot ? (Math.floor((f - starts[i]) / 4) % 2 === 0 ? 1 : 0.35) : 1;
        const below = y < 560;
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: x - 56, top: y - 56, width: 112, height: 112, borderRadius: '50%', border: `2px solid ${p > 0 ? col : P.dim}`, background: 'rgba(3,6,12,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.25 + 0.75 * p, boxShadow: p > 0 ? `0 0 ${hot ? 30 : 12}px ${col}88` : 'none', transform: `scale(${0.85 + 0.15 * p})` }}>
              {split && p > 0 ? (
                <svg width={80} height={60}>
                  {[0, 1].map((k) => (
                    <rect key={k} x={6 + k * (36 + 10 * p)} y={14} width={28} height={32} fill="none" stroke={col} strokeWidth={2} transform={`translate(${(k ? 1 : -1) * 6 * p} 0)`} />
                  ))}
                </svg>
              ) : (
                <LineIcon id={stepIcon(st, t.motif)} size={64} color={col} stroke={1.6} draw={Math.max(0.2, p)} style={{ opacity: flash }} />
              )}
            </div>
            <Note text={st.label} x={x} y={below ? y + 72 : y - 72 - 64} w={300} font={P.mono} fontKey="jetbrains" color={p > 0 ? (fail ? '#ff7a7a' : P.ink) : P.dim} cap={26} o={0.3 + 0.7 * p} />
          </React.Fragment>
        );
      })}
      {/* The distance the signal crosses, as the mission's readout (narration figures only). */}
      {(t.topic.tokens ?? []).length ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 880, textAlign: 'center', fontFamily: P.mono, fontSize: 26, letterSpacing: '0.32em', color: P.dim }}>
          {(t.topic.tokens ?? []).slice(0, 2).map((x, k) => `${k ? 'T+' : 'RNG'} ${x.toUpperCase()}`).join('      ·      ')}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ electric */

const Electric: React.FC<DiagramProps> = ({ P, steps, starts, kind, t }) => {
  const f = useCurrentFrame();
  const n = steps.length;
  if (kind === 'compare' && n >= 2) {
    // Two patent circuits: left = even steps (short reach), right = odd steps (long transmission).
    const panel = (side: 0 | 1) => {
      const x0 = side ? 1000 : 120;
      const mine = steps.map((s, i) => ({ s, i })).filter((x) => x.i % 2 === side);
      const s0 = starts[mine[0]?.i ?? 0];
      const on = arrive(f, s0, 20);
      const flow = -(f * (side ? 9 : 5)) % 40;
      const reach = side ? 600 : 260;
      const wireY = 600;
      const genX = x0 + 90;
      const bulbX = genX + 80 + reach * on;
      const lit = interpolate(f, [s0 + 18, s0 + 24], [0, 1], clamp);
      return (
        <g key={side}>
          {/* generator: coil in a frame */}
          <rect x={genX - 60} y={wireY - 70} width={120} height={140} fill="none" stroke={P.ink} strokeWidth={2} />
          {Array.from({ length: 6 }, (_, k) => <ellipse key={k} cx={genX} cy={wireY - 45 + k * 18} rx={40} ry={7} fill="none" stroke={P.ink} strokeWidth={1.6} />)}
          {/* wire, with pylons on the long line */}
          <line x1={genX + 60} y1={wireY} x2={genX + 80 + reach} y2={wireY} stroke={P.dim} strokeWidth={2} opacity={0.4} />
          <line x1={genX + 60} y1={wireY} x2={bulbX} y2={wireY} stroke={P.accent} strokeWidth={3} strokeDasharray="14 12" strokeDashoffset={flow} style={{ filter: `drop-shadow(0 0 6px ${P.accent})` }} />
          {side
            ? [0.3, 0.6].map((k) => {
                const px = genX + 80 + reach * k;
                return <path key={k} d={`M ${px - 24} ${wireY + 110} L ${px} ${wireY - 20} L ${px + 24} ${wireY + 110} M ${px - 18} ${wireY + 20} H ${px + 18}`} fill="none" stroke={P.ink} strokeWidth={1.6} opacity={0.8} />;
              })
            : null}
          {/* the lamp at the end of the line */}
          <g transform={`translate(${genX + 80 + reach + 28} ${wireY})`}>
            <circle r={26} fill={lit ? `${P.accent2}${Math.round(lit * 200).toString(16).padStart(2, '0')}` : 'none'} stroke={P.ink} strokeWidth={2} style={lit ? { filter: `drop-shadow(0 0 ${20 * lit}px ${P.accent2})` } : undefined} />
            <path d="M -8 26 V 40 H 8 V 26" fill="none" stroke={P.ink} strokeWidth={2} />
          </g>
          <text x={genX} y={wireY + 110} textAnchor="middle" fill={P.ink} fontFamily={P.display} fontStyle="italic" fontSize={24} opacity={0.8}>{`Fig. ${side + 1}.`}</text>
        </g>
      );
    };
    return (
      <AbsoluteFill>
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
          {panel(0)}
          {panel(1)}
          <line x1={960} x2={960} y1={360} y2={880} stroke={P.ink} strokeWidth={1} opacity={0.25} />
        </svg>
        {steps.map((st, i) => {
          const side = i % 2;
          const row = Math.floor(i / 2);
          const p = arrive(f, starts[i]);
          const x0 = side ? 1000 : 120;
          return (
            <Note key={i} text={st.label} x={x0 + (side ? 420 : 230)} y={row === 0 ? 400 : 780} w={side ? 640 : 420} font={P.display} fontKey="playfair" color={i === activeOf(f, starts) ? P.accent : P.ink} cap={row === 0 ? 40 : 30} italic={row > 0} weight={row === 0 ? 800 : 600} o={0.15 + 0.85 * p} lines={1} />
          );
        })}
      </AbsoluteFill>
    );
  }
  // A circuit lighting terminal by terminal.
  const xs = steps.map((_, i) => 240 + (1440 * i) / Math.max(1, n - 1));
  const act = activeOf(f, starts);
  const curX = act >= 0 ? interpolate(f, [starts[act] - 14, starts[act]], [act > 0 ? xs[act - 1] : xs[0], xs[act]], { ...clamp, easing: inOut }) : xs[0];
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <path d={`M ${xs[0]} 540 H ${xs[n - 1]}`} stroke={P.dim} strokeWidth={2} opacity={0.4} />
        {act >= 0 ? <path d={`M ${xs[0]} 540 H ${curX}`} stroke={P.accent} strokeWidth={3} strokeDasharray="14 10" strokeDashoffset={-(f * 6) % 24} style={{ filter: `drop-shadow(0 0 6px ${P.accent})` }} /> : null}
      </svg>
      {steps.map((st, i) => {
        const p = arrive(f, starts[i]);
        const hot = i === act;
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: xs[i] - 70, top: 470, width: 140, height: 140, borderRadius: '50%', border: `2px solid ${p > 0 ? (hot ? P.accent : P.ink) : P.dim}`, background: P.ground2, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: hot ? `0 0 34px ${P.accent}88` : 'none', opacity: 0.3 + 0.7 * p }}>
              <LineIcon id={stepIcon(st, t.motif)} size={78} color={hot ? '#ffffff' : P.ink} stroke={1.5} draw={Math.max(0.2, p)} />
            </div>
            <Note text={st.label} x={xs[i]} y={640} w={Math.min(380, 1500 / n)} font={P.display} fontKey="playfair" color={P.ink} cap={30} o={0.25 + 0.75 * p} italic />
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ cipher */

const Cipher: React.FC<DiagramProps> = ({ P, steps, starts, t }) => {
  const f = useCurrentFrame();
  const n = steps.length;
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const key = ((t.topic.tokens ?? []).find((x) => /^[A-Za-z]{3,12}$/.test(x)) ?? 'CIPHER').toUpperCase();
  const keyed = [...new Set([...key, ...alpha])].join('');
  const rows = Math.min(8, n + 2);
  const cell = 40;
  const gx = 560;
  const gy = 300;
  const act = activeOf(f, starts);
  const msg = (t.topic.message ?? steps.map((s) => s.label).join(' ')).toUpperCase().replace(/[^A-Z]/g, '');
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: rows }, (_, r) => {
          const stepRow = r - 1;
          const lit = stepRow >= 0 && stepRow < n && f >= starts[stepRow];
          return (
            <g key={r}>
              {lit ? <rect x={gx - 6} y={gy + r * cell - 30} width={26 * cell + 12} height={cell} fill={stepRow === act ? `${P.accent}33` : `${P.accent2}14`} /> : null}
              {Array.from({ length: 26 }, (_, c) => (
                <text key={c} x={gx + c * cell + 14} y={gy + r * cell} textAnchor="middle" fill={r === 0 ? P.accent : lit ? P.ink : P.dim} opacity={r === 0 ? 1 : lit ? 0.95 : 0.4} fontFamily={P.mono} fontSize={26} fontWeight={r === 0 ? 700 : 400}>
                  {keyed[(c + r) % 26]}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      {/* each step: one letter of the message slides from the key row down into the step's row */}
      {steps.map((st, i) => {
        const s = starts[i];
        const p = arrive(f, s, 18);
        const r = i + 1;
        const ch = msg[i % Math.max(1, msg.length)] ?? 'A';
        const col = Math.max(0, keyed.indexOf(ch));
        const x = gx + col * cell + 14;
        const y = interpolate(p, [0, 1], [gy, gy + r * cell]);
        return (
          <React.Fragment key={i}>
            {p > 0 && p < 1 ? <div style={{ position: 'absolute', left: x - 18, top: y - 34, width: 36, height: 44, border: `2px solid ${P.accent}`, background: `${P.accent}33`, color: P.accent, fontFamily: P.mono, fontSize: 30, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ch}</div> : null}
            {p >= 1 ? <div style={{ position: 'absolute', left: x - 18, top: gy + r * cell - 34, width: 36, height: 44, border: `2px solid ${i === act ? P.accent : P.accent2}`, color: i === act ? P.accent : P.accent2, fontFamily: P.mono, fontSize: 30, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ch}</div> : null}
            <Note text={`${String(i + 1).padStart(2, '0')}  ${st.label}`} x={gx - 30} y={gy + r * cell - 30} w={420} font={P.mono} fontKey="jetbrains" color={i === act ? P.accent : P.ink} cap={22} align="right" o={0.2 + 0.8 * p} lines={1} />
          </React.Fragment>
        );
      })}
      {/* the plaintext line building up under the tableau */}
      <div style={{ position: 'absolute', left: gx, top: gy + rows * cell + 40, fontFamily: P.mono, fontSize: 34, letterSpacing: '0.3em', color: P.ink }}>
        {steps.map((_, i) => (f >= starts[i] ? msg[i % Math.max(1, msg.length)] : '·')).join('')}
        <span style={{ color: P.dim }}>{'  ← PLAINTEXT'}</span>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ case-file */

const CaseFile: React.FC<DiagramProps> = ({ P, steps, starts, t }) => {
  const f = useCurrentFrame();
  const n = steps.length;
  const w = Math.min(300, Math.floor(1560 / n) - 40);
  const xs = steps.map((_, i) => 960 + (i - (n - 1) / 2) * (w + 60));
  const ys = steps.map((_, i) => 560 + (i % 2 ? 40 : -30));
  const act = activeOf(f, starts);
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {steps.slice(1).map((_, k) => {
          const i = k + 1;
          const p = arrive(f, starts[i], 10);
          if (p <= 0) return null;
          const [x0, y0] = [xs[i - 1], ys[i - 1] - 150];
          const [x1, y1] = [x0 + (xs[i] - x0) * p, y0 + (ys[i] - 150 - y0) * p];
          return <path key={i} d={`M ${x0} ${y0} Q ${(x0 + x1) / 2} ${Math.max(y0, y1) + 50} ${x1} ${y1}`} stroke="#b3121f" strokeWidth={3} fill="none" />;
        })}
      </svg>
      {steps.map((st, i) => {
        const p = arrive(f, starts[i], 10);
        // Evidence still to come waits as a GHOST print (its outline and label faint), so the board is never empty.
        const ghost = p <= 0;
        const tilt = (h01(`${t.seed}ev${i}`) - 0.5) * 8;
        const drop = ghost ? 0 : (1 - p) * -60;
        return (
          <div key={i} style={{ position: 'absolute', left: xs[i] - w / 2, top: ys[i] - 160 + drop, width: w, transform: `rotate(${tilt}deg)`, opacity: ghost ? 0.22 * interpolate(f, [0, 6], [0, 1], clamp) : Math.max(0.22, Math.min(1, p * 2)), filter: ghost ? 'grayscale(1)' : undefined }}>
            {/* the evidence photographed as an object: a print with the thing on it, a pin, a typed label */}
            <div style={{ background: '#f1ece0', padding: '14px 14px 0', boxShadow: '0 18px 36px rgba(0,0,0,0.6)' }}>
              <div style={{ height: w * 0.8, background: 'radial-gradient(ellipse at 50% 40%, #3a3631 0%, #191715 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LineIcon id={stepIcon(st, t.motif)} size={w * 0.48} color="#e9e2d0" stroke={1.3} draw={ghost ? 1 : p} style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))' }} />
              </div>
              <div style={{ position: 'relative', height: 76 }}>
                <Note text={st.label} x={(w - 28) / 2} y={8} w={w - 28} font={P.typed} fontKey="courier" color="#22201b" cap={30} weight={400} />
              </div>
            </div>
            <div style={{ position: 'absolute', left: w / 2 - 9, top: -9, width: 18, height: 18, borderRadius: '50%', background: '#b3121f', boxShadow: '0 3px 4px rgba(0,0,0,0.6)' }} />
            <div style={{ position: 'absolute', right: 10, top: 18, fontFamily: P.typed, fontSize: 18, color: '#f2c318', background: 'rgba(0,0,0,0.55)', padding: '2px 8px' }}>{`#${String(i + 1).padStart(2, '0')}`}</div>
            {i === act && f - starts[i] > 12 && i === n - 1 ? (
              <div style={{ position: 'absolute', left: 22, top: 26, border: `4px solid ${P.accent2}`, color: P.accent2, fontFamily: P.display, fontWeight: 700, fontSize: 26, padding: '2px 10px', transform: 'rotate(-10deg)' }}>LOGGED</div>
            ) : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ telegraph */

const Telegraph: React.FC<DiagramProps> = ({ P, steps, starts, t }) => {
  const f = useCurrentFrame();
  const act = activeOf(f, starts);
  const ship: [number, number] = [700, 470];
  return (
    <AbsoluteFill>
      {/* the chart */}
      <div style={{ position: 'absolute', left: 150, top: 250, width: 1100, height: 520, background: `linear-gradient(176deg, ${P.paper}, #d6cbae)`, boxShadow: '0 30px 70px rgba(0,0,0,0.65)', transform: 'rotate(-1deg)' }}>
        <svg width={1100} height={520} style={{ position: 'absolute', inset: 0 }}>
          {Array.from({ length: 10 }, (_, k) => <line key={`v${k}`} x1={k * 110} x2={k * 110} y1={0} y2={560} stroke={P.paperInk} strokeWidth={0.8} opacity={0.18} />)}
          {Array.from({ length: 6 }, (_, k) => <line key={`h${k}`} x1={0} x2={1100} y1={k * 110} y2={k * 110} stroke={P.paperInk} strokeWidth={0.8} opacity={0.18} />)}
          {Array.from({ length: 4 }, (_, k) => <path key={k} d={contour(980, 80, 60 + k * 45, 0.6 + k * 0.3, `${t.seed}coast${k}`)} fill="none" stroke={P.paperInk} strokeWidth={1.2} opacity={0.35} />)}
          {steps.map((_, i) => {
            const s = starts[i];
            if (f < s || s >= 1e9) return null;
            const since = s <= -999 ? 60 : f - s;
            return [0, 1, 2].map((k) => {
              const rr = ((since + k * 14) % 42) / 42;
              return i === act ? <circle key={`${i}${k}`} cx={ship[0] - 150} cy={ship[1] - 200} r={30 + rr * 260} fill="none" stroke={P.accent2} strokeWidth={2.5} opacity={(1 - rr) * 0.8} /> : null;
            });
          })}
        </svg>
        <div style={{ position: 'absolute', left: ship[0] - 150 - 40, top: ship[1] - 200 - 40 }}>
          <LineIcon id="ship" size={80} color={P.paperInk} stroke={1.6} />
        </div>
        <div style={{ position: 'absolute', left: 30, bottom: 20, fontFamily: P.display, fontSize: 22, letterSpacing: '0.3em', color: `${P.paperInk}aa` }}>NORTH ATLANTIC</div>
      </div>
      {/* the log: one short line per step, as received */}
      <div style={{ position: 'absolute', left: 1320, top: 290, width: 470 }}>
        {steps.map((st, i) => {
          const p = arrive(f, starts[i], 8);
          return (
            <div key={i} style={{ position: 'relative', height: 86, borderBottom: `1px solid ${P.ink}33`, opacity: 0.15 + 0.85 * p }}>
              <Note text={st.label} x={0} y={14} w={470} font={P.typed} fontKey="courier" color={i === act ? P.accent : P.ink} cap={36} align="left" weight={400} lines={1} />
              {st.detail ? <Note text={st.detail} x={0} y={56} w={470} font={P.typed} fontKey="courier" color={P.dim} cap={18} align="left" weight={400} lines={1} /> : null}
            </div>
          );
        })}
      </div>
      {/* the message ticking out */}
      {act >= 0 ? <Tape P={P} label={steps[act].label} since={f - Math.max(0, starts[act])} /> : null}
    </AbsoluteFill>
  );
};

const Tape: React.FC<{ P: MotifPalette; label: string; since: number }> = ({ P, label, since }) => {
  const code = morse(label);
  const unit = Math.max(5, Math.min(12, 1500 / Math.max(1, morseWidth(code, 1))));
  const w = morseWidth(code, unit);
  const reveal = interpolate(since, [0, Math.max(12, code.length * 1.2)], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: -20, right: -20, bottom: 150, height: 64, background: `linear-gradient(180deg, ${P.paper}, #d8cdb1)`, boxShadow: '0 10px 30px rgba(0,0,0,0.55)', transform: 'rotate(-0.8deg)' }}>
      <svg width={1960} height={64} style={{ position: 'absolute', inset: 0 }}>
        <MorseRow code={code} x={(1960 - w) / 2} y={32} unit={unit} color={P.accent2} reveal={reveal} />
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------ ticker / expedition / siege: a path that moves */

const PathDiagram: React.FC<DiagramProps> = ({ P, steps, starts, kind, t }) => {
  const f = useCurrentFrame();
  const n = steps.length;
  const act = activeOf(f, starts);
  let pts: [number, number][];
  const cycle = kind === 'cycle' && n >= 3;
  if (cycle) pts = steps.map((_, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [960 + Math.cos(a) * 470, 560 + Math.sin(a) * 250]; });
  else if (t.motif === 'expedition') pts = steps.map((_, i) => [330 + (1260 * i) / Math.max(1, n - 1), 760 - (420 * i) / Math.max(1, n - 1)]);
  else if (t.motif === 'siege') pts = steps.map((_, i) => [300 + (1180 * i) / Math.max(1, n - 1), 560 + Math.sin(i * 1.3) * 90]);
  else pts = steps.map((_, i) => [300 + (1320 * i) / Math.max(1, n - 1), 360 + (360 * i) / Math.max(1, n - 1)]);
  const seg = (i: number) => (cycle ? [pts[(i - 1 + n) % n], pts[i]] : [pts[Math.max(0, i - 1)], pts[i]]);
  // The marker: on the active step, then (cycle) keeps running round once everything is lit.
  let mk: [number, number] | null = null;
  if (act >= 0) {
    const [a, b] = seg(act);
    const k = interpolate(f, [starts[act] - 14, starts[act]], [0, 1], { ...clamp, easing: inOut });
    mk = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    if (cycle && act === n - 1 && f > starts[act] + 20) {
      const u = ((f - starts[act] - 20) / 22) % n;
      const i0 = Math.floor(u);
      const fr = u - i0;
      const A = pts[i0];
      const B = pts[(i0 + 1) % n];
      mk = [A[0] + (B[0] - A[0]) * fr, A[1] + (B[1] - A[1]) * fr];
    }
  }
  const lineCol = t.motif === 'siege' ? P.accent : t.motif === 'ticker' ? P.accent : P.accent;
  const fontKey: FontKey = t.motif === 'siege' ? 'cinzel' : t.motif === 'expedition' ? 'bebas' : 'plexMono';
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {t.motif === 'expedition' ? (
          <>
            <path d={`M 150 860 L ${pts[0][0]} ${pts[0][1] + 40} L ${pts[n - 1][0]} ${pts[n - 1][1] + 40} L 1800 300 L 1800 900 L 150 900 Z`} fill="#0e1a24" stroke={P.paper} strokeWidth={2} />
            {/* snow piling layer by layer as the steps land */}
            {steps.map((_, i) => (f >= starts[i] ? <path key={i} d={`M ${pts[0][0]} ${pts[0][1] + 34 - i * 10} L ${pts[n - 1][0]} ${pts[n - 1][1] + 34 - i * 10}`} stroke={P.paper} strokeWidth={6} opacity={0.35 + 0.15 * i} /> : null))}
          </>
        ) : null}
        {t.motif === 'siege' ? <path d="M 1620 300 V 820" stroke={P.ink} strokeWidth={10} strokeDasharray="22 14" opacity={0.6} /> : null}
        {(cycle ? steps : steps.slice(1)).map((_, k) => {
          const i = cycle ? k : k + 1;
          const [a, b] = seg(i);
          const p = arrive(f, starts[i], 12);
          const mid: [number, number] = cycle ? [(a[0] + b[0]) / 2 + (((a[1] + b[1]) / 2 - 560) * 0.35), (a[1] + b[1]) / 2 - (((a[0] + b[0]) / 2 - 960) * 0.2)] : [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 60];
          const d = `M ${a[0]} ${a[1]} Q ${mid[0]} ${mid[1]} ${b[0]} ${b[1]}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={P.dim} strokeWidth={2} opacity={0.35} strokeDasharray="8 10" />
              <path d={d} fill="none" stroke={lineCol} strokeWidth={t.motif === 'siege' ? 7 : 4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} strokeLinecap="round" />
            </g>
          );
        })}
        {mk ? <circle cx={mk[0]} cy={mk[1]} r={14} fill={lineCol} stroke="#ffffff" strokeWidth={2} style={{ filter: `drop-shadow(0 0 10px ${lineCol})` }} /> : null}
      </svg>
      {steps.map((st, i) => {
        const p = arrive(f, starts[i]);
        const [x, y] = pts[i];
        const hot = i === act;
        const num = t.motif === 'siege' ? roman(i + 1) : String(i + 1).padStart(2, '0');
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: x - 62, top: y - 62, width: 124, height: 124, borderRadius: t.motif === 'siege' ? 6 : '50%', background: t.motif === 'siege' ? P.paper : P.ground2, border: `2px solid ${p > 0 ? (hot ? P.accent : P.ink) : P.dim}`, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.25 + 0.75 * p, boxShadow: hot ? `0 0 30px ${P.accent}88` : '0 10px 24px rgba(0,0,0,0.5)' }}>
              <LineIcon id={stepIcon(st, t.motif)} size={70} color={t.motif === 'siege' ? P.paperInk : hot ? P.accent : P.ink} stroke={1.5} draw={Math.max(0.2, p)} />
              <div style={{ position: 'absolute', top: -14, left: -14, fontFamily: P.mono, fontSize: 20, color: P.accent, background: P.ground2, padding: '0 6px' }}>{num}</div>
            </div>
            <Note text={st.label} x={x} y={y + 72} w={Math.min(360, 1600 / n)} font={P.display} fontKey={fontKey} color={hot ? P.accent : P.ink} cap={30} o={0.25 + 0.75 * p} />
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

const DIAGRAMS: Record<string, React.FC<DiagramProps>> = {
  telemetry: Telemetry,
  electric: Electric,
  cipher: Cipher,
  'case-file': CaseFile,
  telegraph: Telegraph,
  ticker: PathDiagram,
  expedition: PathDiagram,
  siege: PathDiagram,
};

export const Diagram: React.FC<DiagramProps> = (p) => {
  const D = DIAGRAMS[p.t.motif] ?? PathDiagram;
  return <D {...p} />;
};
