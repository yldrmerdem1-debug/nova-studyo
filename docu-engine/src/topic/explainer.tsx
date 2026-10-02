import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { fitFont } from '../fonts';
import type { ExplainerScene, ExplainerStep, Genre, GenreId, MotifId } from '../types';
import { cueFrames, h01, spokenCues, morse, roman, useTopic, type TopicCtx } from './context';
import { MorseRow, MotifTexture, contour, morseWidth, motifPalette, type MotifPalette } from './motifs';
import { Diagram } from './diagram';

/*
 * EXPLAINER — the signature device: the mechanism the narrator describes,
 * drawn step by step in the topic's own language. A Morse message being sent
 * on a wireless log (telegraph), a cascade of ticker tape (ticker), a signal
 * hopping between waypoints of a trajectory (telemetry), current lighting the
 * terminals of a patent drawing (electric), typed index cards (case-file),
 * waypoints on a contour map (expedition), cartouches joined by campaign
 * arrows (siege), letter cells locking into place (cipher).
 *
 * Every step lights on its spoken word (cueFrames); steps still to come wait
 * as ghosts, so the viewer sees the structure from the first frame. The
 * newest step is the accent; earlier ones settle into the ink.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.out(Easing.cubic);

/** Without a topic: the genre's natural motif (an explainer always speaks some language). */
const GENRE_MOTIF: Record<GenreId, MotifId> = {
  documentary: 'telegraph',
  finance: 'ticker',
  science: 'telemetry',
  inspire: 'electric',
  crime: 'case-file',
  horror: 'expedition',
  epic: 'siege',
};

export function explainerTopic(t: TopicCtx | null, g: Genre): TopicCtx {
  return t ?? { topic: { motif: GENRE_MOTIF[g.id] ?? 'cipher' }, motif: GENRE_MOTIF[g.id] ?? 'cipher', seed: 'explainer', locale: 'en-US' };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Layout {
  nodes: Box[];
  /** Connector into node i (none for the first in a sequence). */
  links: ({ d: string } | null)[];
  titleY: number;
}

/** Node boxes and connectors for a kind. Frame-space (1920x1080), clear of a letterbox. */
export function explainerLayout(kind: ExplainerScene['kind'], n: number): Layout {
  const nodes: Box[] = [];
  const links: ({ d: string } | null)[] = [];
  if (kind === 'cycle' && n >= 3) {
    const cx = 960;
    const cy = 580;
    const rx = n > 4 ? 600 : 520;
    const ry = n > 4 ? 300 : 270;
    const w = n > 4 ? 440 : 480;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      nodes.push({ x: Math.max(40, Math.min(1880 - w, cx + Math.cos(a) * rx - w / 2)), y: cy + Math.sin(a) * ry - 80, w, h: 160 });
    }
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + ((i - 1 + n) % n / n) * Math.PI * 2 + 0.32;
      const a1 = -Math.PI / 2 + (i / n) * Math.PI * 2 - 0.32;
      const R = (a: number) => [cx + Math.cos(a) * rx * 0.78, cy + Math.sin(a) * ry * 0.72];
      const [x0, y0] = R(a0);
      const [x1, y1] = R(a1);
      const am = (a0 + (a1 < a0 ? a1 + Math.PI * 2 : a1)) / 2;
      const [mx, my] = [cx + Math.cos(am) * rx * 0.98, cy + Math.sin(am) * ry * 0.98];
      links.push(i === 0 ? { d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}` } : { d: `M ${x0} ${y0} Q ${mx} ${my} ${x1} ${y1}` });
    }
    return { nodes, links, titleY: 560 };
  }
  if (kind === 'compare') {
    // Pairs: even steps left, odd steps right; the first pair is the header.
    const rows = Math.ceil(n / 2);
    const h = Math.min(150, Math.floor(640 / Math.max(1, rows)) - 18);
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / 2);
      nodes.push({ x: i % 2 ? 1000 : 180, y: 600 - (rows * (h + 22) - 22) / 2 + r * (h + 22), w: 740, h });
      links.push(null);
    }
    return { nodes, links, titleY: Math.max(230, 600 - (rows * (h + 22) - 22) / 2 - 60) };
  }
  if (kind === 'mechanism' || n >= 5) {
    // A vertical chain of causes.
    const h = Math.min(150, Math.floor(640 / n) - 26);
    const top = Math.max(250, 600 - (n * (h + 26) - 26) / 2);
    for (let i = 0; i < n; i++) {
      nodes.push({ x: 360, y: top + i * (h + 26), w: 1200, h });
      links.push(i ? { d: `M 300 ${top + (i - 1) * (h + 26) + h / 2} C 240 ${top + (i - 1) * (h + 26) + h}, 240 ${top + i * (h + 26)}, 330 ${top + i * (h + 26) + h / 2}` } : null);
    }
    return { nodes, links, titleY: Math.max(230, top - 70) };
  }
  // sequence, 1-4 steps: a horizontal chain.
  const gap = 70;
  const w = Math.min(460, Math.floor((1700 - gap * (n - 1)) / Math.max(1, n)));
  const x0 = 960 - (n * w + (n - 1) * gap) / 2;
  for (let i = 0; i < n; i++) {
    nodes.push({ x: x0 + i * (w + gap), y: 440, w, h: 260 });
    links.push(i ? { d: `M ${x0 + i * (w + gap) - gap + 8} 570 L ${x0 + i * (w + gap) - 10} 570` } : null);
  }
  return { nodes, links, titleY: 270 };
}

type State = 'ghost' | 'lit' | 'active';

/** One step in the motif's language. `p` 0..1 is its arrival. */
const StepNode: React.FC<{ t: TopicCtx; P: MotifPalette; step: ExplainerStep; i: number; box: Box; state: State; p: number; kind: ExplainerScene['kind'] }> = ({ t, P, step, i, box, state, p, kind }) => {
  const f = useCurrentFrame();
  const label = String(step.label ?? '').toUpperCase();
  const detail = step.detail ? String(step.detail) : '';
  const ghost = state === 'ghost';
  const active = state === 'active';
  const horizontal = box.h >= 200;
  // A long label in a short box wraps onto two balanced lines instead of shrinking to a whisper.
  // Measured in the face the step is really set in (typed motifs use the wider typewriter).
  const mKey = t.motif === 'telegraph' || t.motif === 'case-file' ? 'courier' : t.motif === 'ticker' || t.motif === 'cipher' ? P.monoKey : P.displayKey;
  const typedK = t.motif === 'telegraph' || t.motif === 'case-file' ? 1.12 : 1;
  const one = fitFont(label, mKey, { maxW: (box.w - (horizontal ? 60 : 150)) / typedK, cap: horizontal ? 70 : Math.min(54, box.h * 0.44), trackEm: 0.04, upper: true });
  const wrap = one < (horizontal ? 46 : 40) && label.includes(" ") ? balance2(label) : [label];
  const lab = Math.min(...wrap.map((l) => fitFont(l, mKey, { maxW: (box.w - (horizontal ? 60 : 150)) / typedK, cap: horizontal ? 70 : Math.min(54, box.h * (wrap.length > 1 ? 0.3 : 0.44)), trackEm: 0.04, upper: true })));
  const ink = active ? P.accent : P.ink;
  const o = ghost ? 0.16 : Math.max(0.16, p);
  const num = t.motif === 'siege' ? roman(i + 1) : String(i + 1).padStart(2, '0');
  const base: React.CSSProperties = { position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, opacity: o, boxSizing: 'border-box' };
  const labelEl = (font: string, extra: React.CSSProperties = {}) => (
    <div style={{ fontFamily: font, fontWeight: 700, fontSize: lab, letterSpacing: '0.04em', lineHeight: 1.08, color: ghost ? P.dim : ink, whiteSpace: 'nowrap', ...extra }}>{wrap.map((l, k) => <div key={k}>{ghost ? l.replace(/[^\s]/g, '·') : l}</div>)}</div>
  );
  const detailEl = (font: string, color = P.dim) =>
    detail && !ghost ? (
      <div style={{ fontFamily: font, fontSize: horizontal ? 26 : 24, color, marginTop: 8, lineHeight: 1.25, opacity: interpolate(p, [0.5, 1], [0, 1], clamp) }}>{detail}</div>
    ) : null;

  switch (t.motif) {
    case 'cipher': {
      const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const locked = Math.floor(p * label.length * 1.15);
      const shown = ghost ? label.replace(/[^\s]/g, '·') : [...label].map((c, k) => (k < locked || c === ' ' ? c : alpha[Math.floor(h01(`${i}${k}${Math.floor(f / 2)}`) * 26)])).join('');
      return (
        <div style={{ ...base, display: 'flex', flexDirection: horizontal ? 'column' : 'row', alignItems: horizontal ? 'flex-start' : 'center', gap: horizontal ? 12 : 26, padding: horizontal ? '26px 24px' : '0 24px', border: `1px solid ${active ? P.accent : `${P.ink}33`}`, background: active ? `${P.accent}14` : 'rgba(0,0,0,0.25)' }}>
          <div style={{ fontFamily: P.mono, fontSize: 26, color: active ? '#111' : P.accent2, background: active ? P.accent : 'transparent', padding: '2px 10px', border: `1px solid ${P.accent2}` }}>{num}</div>
          <div>
            <div style={{ fontFamily: P.mono, fontWeight: 700, fontSize: Math.min(lab, 50), letterSpacing: '0.12em', color: ghost ? P.dim : ink, whiteSpace: 'nowrap' }}>{shown}</div>
            {detailEl(P.mono)}
          </div>
        </div>
      );
    }
    case 'telegraph': {
      const code = morse(label);
      const unit = Math.max(2.2, Math.min(9, (box.w - 150) / Math.max(1, morseWidth(code, 1))));
      return (
        <div style={{ ...base, padding: horizontal ? '24px 26px' : '0 30px', background: ghost ? 'transparent' : `linear-gradient(178deg, ${P.paper}, #d8cdb1)`, color: P.paperInk, boxShadow: ghost ? 'none' : '0 18px 40px rgba(0,0,0,0.5)', border: ghost ? `1px dashed ${P.dim}` : 'none', display: 'flex', flexDirection: horizontal ? 'column' : 'row', alignItems: horizontal ? 'flex-start' : 'center', gap: horizontal ? 10 : 30, transform: `rotate(${ghost ? 0 : (h01(`${t.seed}${i}`) - 0.5) * 1.6}deg)` }}>
          <div style={{ fontFamily: P.typed, fontSize: 28, color: P.accent2, minWidth: 60 }}>{num}</div>
          <div style={{ flex: 1 }}>
            {labelEl(P.typed, { color: ghost ? P.dim : P.paperInk, fontWeight: 400 })}
            {!ghost ? (
              <svg width={box.w - 120} height={22} style={{ display: 'block', marginTop: 8, overflow: 'hidden' }}>
                <MorseRow code={code} x={4} y={11} unit={unit} color={active ? P.accent2 : P.paperInk} reveal={p} />
              </svg>
            ) : null}
            {detailEl(P.typed, `${P.paperInk}bb`)}
          </div>
        </div>
      );
    }
    case 'ticker': {
      const down = /\b(fall|falls|fell|drop|down|crash|sell|sells|loss|lose|call|calls|debt|fail)/i.test(`${label} ${detail}`);
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px', background: ghost ? 'transparent' : P.paper, border: ghost ? `1px dashed ${P.dim}` : 'none', boxShadow: ghost ? 'none' : '0 12px 26px rgba(0,0,0,0.55)', transform: `translateX(${(1 - p) * -60}px) rotate(${ghost ? 0 : -0.8}deg)`, flexDirection: horizontal ? 'column' : 'row', justifyContent: 'center' }}>
          <div style={{ fontFamily: P.mono, fontWeight: 600, fontSize: 40, color: down ? P.accent : P.accent2 }}>{ghost ? '·' : down ? '▼' : '▲'}</div>
          <div style={{ textAlign: horizontal ? 'center' : 'left' }}>
            {labelEl(P.mono, { color: ghost ? P.dim : P.paperInk, letterSpacing: '0.08em' })}
            {detailEl(P.mono, `${P.paperInk}aa`)}
          </div>
        </div>
      );
    }
    case 'telemetry': {
      return (
        <div style={{ ...base, display: 'flex', alignItems: horizontal ? 'center' : 'center', flexDirection: horizontal ? 'column' : 'row', gap: horizontal ? 18 : 30, padding: horizontal ? '10px 10px' : '0 20px' }}>
          <svg width={64} height={64} style={{ flex: 'none', overflow: 'visible' }}>
            <circle cx={32} cy={32} r={12} fill={ghost ? 'none' : active ? P.accent : P.accent2} stroke={P.accent2} strokeWidth={2} />
            <circle cx={32} cy={32} r={24 + (active ? (f % 30) * 0.8 : 0)} fill="none" stroke={active ? P.accent : P.accent2} strokeWidth={1.4} opacity={active ? 1 - (f % 30) / 30 : 0.4} />
          </svg>
          <div style={{ textAlign: horizontal ? 'center' : 'left' }}>
            <div style={{ fontFamily: P.mono, fontSize: 20, letterSpacing: '0.3em', color: P.dim, marginBottom: 6 }}>{`STEP ${num}`}</div>
            {labelEl(P.display, { letterSpacing: '0.08em' })}
            {detailEl(P.mono)}
          </div>
        </div>
      );
    }
    case 'electric': {
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', flexDirection: horizontal ? 'column' : 'row', gap: horizontal ? 16 : 28, padding: horizontal ? 18 : '0 20px', border: `1.5px solid ${ghost ? `${P.dim}55` : active ? P.accent : `${P.ink}66`}`, boxShadow: active ? `0 0 30px ${P.accent}55, inset 0 0 20px ${P.accent}22` : 'none' }}>
          <svg width={58} height={58} style={{ flex: 'none' }}>
            <circle cx={29} cy={29} r={20} fill="none" stroke={active ? '#ffffff' : P.ink} strokeWidth={2} style={active ? { filter: `drop-shadow(0 0 8px ${P.accent})` } : undefined} />
            <circle cx={29} cy={29} r={6} fill={ghost ? 'none' : active ? P.accent : P.ink} />
          </svg>
          <div style={{ textAlign: horizontal ? 'center' : 'left' }}>
            <div style={{ fontFamily: P.display, fontStyle: 'italic', fontSize: 24, color: P.accent2 }}>{`Fig. ${i + 1}.`}</div>
            {labelEl(P.display, { fontWeight: 800, letterSpacing: '0.06em', textShadow: active ? `0 0 20px ${P.accent}88` : 'none' })}
            {detailEl(P.mono)}
          </div>
        </div>
      );
    }
    case 'case-file': {
      return (
        <div style={{ ...base, padding: horizontal ? '26px 24px' : '0 30px', background: ghost ? 'transparent' : '#f1ebdc', border: ghost ? `1px dashed ${P.dim}` : 'none', boxShadow: ghost ? 'none' : '0 16px 34px rgba(0,0,0,0.55)', display: 'flex', flexDirection: horizontal ? 'column' : 'row', alignItems: horizontal ? 'flex-start' : 'center', gap: horizontal ? 10 : 30, transform: `rotate(${ghost ? 0 : (h01(`${t.seed}c${i}`) - 0.5) * 2.4}deg)` }}>
          {!ghost ? <div style={{ position: 'absolute', left: 0, right: 0, top: horizontal ? 64 : undefined, bottom: horizontal ? undefined : 0, height: 2, background: '#c8102e55' }} /> : null}
          <div style={{ fontFamily: P.typed, fontSize: 28, color: P.accent2 }}>{`#${num}`}</div>
          <div>
            {labelEl(P.typed, { color: ghost ? P.dim : P.paperInk, fontWeight: 400 })}
            {detailEl(P.typed, `${P.paperInk}aa`)}
          </div>
          {active && p >= 1 ? (
            <div style={{ position: 'absolute', right: 18, top: horizontal ? undefined : 14, bottom: horizontal ? 16 : undefined, border: `3px solid ${P.accent2}`, color: P.accent2, fontFamily: P.display, fontWeight: 700, fontSize: 24, padding: '2px 10px', transform: 'rotate(-8deg)', opacity: 0.9 }}>NOTED</div>
          ) : null}
        </div>
      );
    }
    case 'expedition': {
      return (
        <div style={{ ...base, display: 'flex', alignItems: 'center', flexDirection: horizontal ? 'column' : 'row', gap: horizontal ? 14 : 26, padding: horizontal ? 12 : '0 18px' }}>
          <svg width={70} height={70} style={{ flex: 'none' }}>
            <path d="M 35 6 L 62 58 L 8 58 Z" fill={ghost ? 'none' : active ? P.accent : 'rgba(0,0,0,0.3)'} stroke={active ? P.accent : P.ink} strokeWidth={2.4} />
            <text x={35} y={50} textAnchor="middle" fill={active ? '#111' : P.ink} fontFamily={P.mono} fontSize={18}>{i + 1}</text>
          </svg>
          <div style={{ textAlign: horizontal ? 'center' : 'left' }}>
            {labelEl(P.display, { letterSpacing: '0.06em', fontWeight: 400, fontSize: lab * 1.12 })}
            {detailEl(P.mono)}
          </div>
        </div>
      );
    }
    case 'siege':
    default: {
      return (
        <div style={{ ...base, padding: horizontal ? '24px 20px' : '0 30px', background: ghost ? 'transparent' : `radial-gradient(ellipse at 50% 40%, ${P.paper} 40%, #cdb487 100%)`, border: ghost ? `1px dashed ${P.dim}` : `3px double ${P.paperInk}`, boxShadow: ghost ? 'none' : '0 16px 36px rgba(0,0,0,0.6)', display: 'flex', flexDirection: horizontal ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: horizontal ? 8 : 26, textAlign: 'center' }}>
          <div style={{ fontFamily: P.display, fontWeight: 800, fontSize: 30, color: P.accent }}>{num}</div>
          <div>
            {labelEl(P.display, { color: ghost ? P.dim : P.paperInk, fontWeight: 800 })}
            {detailEl(P.mono, `${P.paperInk}bb`)}
          </div>
        </div>
      );
    }
  }
};

export const ExplainerScn: React.FC<{ scene: ExplainerScene; genre: Genre; durFrames: number; locale: string; speed: number; index?: number }> = ({ scene, genre, durFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = explainerTopic(useTopic(), genre);
  const P = motifPalette(t, genre);
  const steps = (scene.steps ?? []).filter((s) => s && String(s.label ?? '').trim()).slice(0, 8);
  const n = steps.length;
  const kind = scene.kind === 'cycle' && n < 3 ? 'sequence' : scene.kind ?? 'sequence';
  const L = explainerLayout(kind, n);
  const [r0, r1] = Array.isArray(scene.reveal) && scene.reveal.length === 2 ? [Math.max(0, scene.reveal[0]), Math.min(n, scene.reveal[1])] : [0, n];
  const local = steps.slice(r0, r1);
  const cues = cueFrames(local, scene.wordTimes, durFrames, fps, { lead: 0.4, tail: 0.3, gap: 10 });
  /*
   * CONTENT WITHIN 0.3 s: when nothing is lit yet (the first scene of an
   * explainer) and the narration never names its first step, that step lands by
   * ~0.27 s — the title never sits alone on an empty ground. A step that IS said
   * waits for its word (never shown before the narrator says it).
   */
  if (r0 === 0 && cues.length && cues[0] > Math.round(0.27 * fps) && spokenCues(local.slice(0, 1), scene.wordTimes, fps)[0] === null) cues[0] = Math.round(0.27 * fps);
  /** Frame a step lights (-999: already lit before this scene; 1e9: a later scene reveals it). */
  const startOf = (i: number) => (i < r0 ? -999 : i >= r1 ? 1e9 : cues[i - r0]);
  // The newest lit step.
  let activeI = -1;
  for (let i = 0; i < n; i++) if (f >= startOf(i)) activeI = i;
  const title = String(scene.title ?? '').toUpperCase();
  const titleSize = title ? fitFont(title, P.displayKey, { maxW: 1500, cap: 64, trackEm: 0.12, upper: true }) : 0;
  const enter = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: ease });
  const push = interpolate(f, [0, durFrames], [1, 1.035], clamp);
  const lightGround = t.motif === 'siege' || t.motif === 'expedition';
  const ground =
    t.motif === 'siege'
      ? `radial-gradient(ellipse at 50% 40%, #2a1d10 0%, ${P.ground2} 110%)`
      : t.motif === 'expedition'
        ? `radial-gradient(ellipse at 50% 30%, #12202c 0%, ${P.ground2} 110%)`
        : `radial-gradient(ellipse at 50% 45%, ${P.ground} 0%, ${P.ground2} 120%)`;
  // Telemetry and electric: a pulse rides each connector into the newly lit step.
  const linkColor = t.motif === 'siege' ? P.accent : t.motif === 'ticker' ? P.paper : t.motif === 'case-file' ? P.accent2 : t.motif === 'telegraph' ? P.paper : P.accent2;
  return (
    <AbsoluteFill style={{ background: ground }}>
      <MotifTexture t={t} strength={0.6} />
      {t.motif === 'expedition' ? (
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, opacity: 0.22 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={contour(960, 600, (i + 1) * 70, 1.1 + i * 0.25, `${t.seed}ex${i}`)} fill="none" stroke={P.accent2} strokeWidth={1.2} />
          ))}
        </svg>
      ) : null}
      <AbsoluteFill style={{ transform: `scale(${push})`, opacity: enter }}>
        {/* A small kicker, not a slide title: the drawing carries the explanation. */}
        {title ? (
          <div style={{ position: 'absolute', left: 0, right: 0, top: 170, textAlign: 'center', fontFamily: P.display, fontWeight: 700, fontSize: Math.min(44, titleSize), letterSpacing: '0.24em', color: P.ink, opacity: 0.85, textShadow: '0 4px 20px rgba(0,0,0,0.6)' }}>
            {title}
          </div>
        ) : null}
        <Diagram t={t} P={P} steps={steps} kind={kind} starts={steps.map((_, i) => startOf(i))} durFrames={durFrames} />
        {t.motif === 'ticker' ? <TickerTape P={P} tokens={t.topic.tokens ?? []} active={activeI >= 0 ? String(steps[activeI].label) : ''} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A paper tape across the foot of the frame, the active step tapped out in Morse letter by letter. */
const TransmitTape: React.FC<{ P: MotifPalette; label: string; since: number }> = ({ P, label, since }) => {
  const code = morse(label);
  const unit = Math.max(5, Math.min(13, 1500 / Math.max(1, morseWidth(code, 1))));
  const w = morseWidth(code, unit);
  const reveal = interpolate(since, [0, Math.max(12, code.length * 1.2)], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', left: -20, right: -20, bottom: 150, height: 64, background: `linear-gradient(180deg, ${P.paper}, #d8cdb1)`, boxShadow: '0 10px 30px rgba(0,0,0,0.55)', transform: 'rotate(-1deg)' }}>
      <svg width={1960} height={64} style={{ position: 'absolute', inset: 0 }}>
        <MorseRow code={code} x={(1960 - w) / 2} y={32} unit={unit} color={P.accent2} reveal={reveal} />
      </svg>
      <div style={{ position: 'absolute', right: 70, top: -30, fontFamily: P.typed, fontSize: 22, letterSpacing: '0.2em', color: P.accent }}>{reveal < 1 ? 'TRANSMITTING' : 'SENT'}</div>
    </div>
  );
};

/** The tape of the story's figures, running under a ticker explainer; the active step printed into it. */
const TickerTape: React.FC<{ P: MotifPalette; tokens: string[]; active: string }> = ({ P, tokens, active }) => {
  const f = useCurrentFrame();
  const text = [...(active ? [`▼ ${active}`] : []), ...tokens].map((x) => x.toUpperCase()).join('    ·    ');
  return (
    <div style={{ position: 'absolute', left: -20, right: -20, bottom: 140, height: 60, background: P.paper, boxShadow: '0 10px 30px rgba(0,0,0,0.55)', overflow: 'hidden', transform: 'rotate(-1.2deg)' }}>
      <div style={{ position: 'absolute', top: 10, left: 1960 - ((f * 7) % 4000), whiteSpace: 'nowrap', fontFamily: P.mono, fontSize: 34, letterSpacing: '0.1em', color: P.paperInk }}>{`${text}    ·    ${text}`}</div>
    </div>
  );
};

/** Two lines of similar length. */
function balance2(t: string): string[] {
  const w = t.split(/\s+/);
  if (w.length < 2) return [t];
  let best = 1;
  const d = (k: number) => Math.abs(w.slice(0, k).join(' ').length - w.slice(k).join(' ').length);
  for (let k = 1; k < w.length; k++) if (d(k) < d(best)) best = k;
  return [w.slice(0, best).join(' '), w.slice(best).join(' ')];
}

/** Impacts: a light nudge as each step lands (the viewer reads them; no shake). */
export function explainerImpacts(scene: ExplainerScene, durFrames: number, fps: number): { f: number; strength: number }[] {
  const n = (scene.steps ?? []).length;
  const [r0, r1] = Array.isArray(scene.reveal) && scene.reveal.length === 2 ? scene.reveal : [0, n];
  const local = (scene.steps ?? []).slice(r0, r1);
  const cues = cueFrames(local, scene.wordTimes, durFrames, fps, { lead: 0.4, tail: 0.3, gap: 10 });
  // Same first-step guard as ExplainerScn (content within 0.3 s).
  if (!r0 && cues.length && cues[0] > Math.round(0.27 * fps) && spokenCues(local.slice(0, 1), scene.wordTimes, fps)[0] === null) cues[0] = Math.round(0.27 * fps);
  return cues.map((f) => ({ f, strength: 0.12 }));
}
