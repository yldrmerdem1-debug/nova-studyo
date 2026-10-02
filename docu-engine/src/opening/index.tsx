import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Photo, clipOf } from '../fx';
import { keyRange, montageWords, slamFrame, textWords, wordFrames } from '../scenes';
import type { FoleyKind, Genre, Scene, SfxKind, TransitionKind } from '../types';
import { resolveOpening, type HookStyle, type Opening, type Stamp } from './plan.js';
import { LookContext, useLook } from '../looks/context';
import type { OpeningSceneCtx } from './context';
import { counterSpokenAt, rewindSpokenAt, stampTiming } from './timing';
import {
  COLD_GRADE,
  ColdOpenLayer,
  DialPlate,
  EvidenceBoard,
  HeadlineLayer,
  HitFlash,
  HookSlam,
  MapDive,
  QuoteOpen,
  RewindCaption,
  StampLayer,
  TapeTear,
  boardBeat,
  boardItems,
  diveFrames,
  headlineCues,
  stampTypeFrames,
  type BoardItem,
  type Hook,
} from './layers';

export { resolveOpening };
export type { Opening };
export { OpeningContext, useOpening } from './context';
export type { OpeningSceneCtx } from './context';

/*
 * The engine's side of script.opening (src/opening/plan.js decides WHAT the
 * opening is and what it may show; layers.tsx draws it; timing.ts says WHEN —
 * always on the spoken word). Absent, unknown or ineligible kinds return null
 * everywhere: today's opening, unchanged.
 *
 * Every kind starts on a HOOK: the first punch the narrator says in the
 * opening's first ~4 s (a montage word, a slam, a keyword, a date) hits in
 * impact type with a flash, a frame punch and a hit — then the treatment
 * unfolds.
 */

type Slot = { from: number; frames: number };
type Cue = { key: string; kind: SfxKind; at: number; align: 'onset' | 'peak' | 'end'; gain: number; tight?: boolean };
type FoleyWant = { scene: number; f: number; kind: FoleyKind; align?: 'onset' | 'peak'; dur?: number; group?: string };
type StampTime = { dateAt: number | null; timeAt: number | null; at: number };
type Held = { src: string; clip?: ReturnType<typeof clipOf>; imgW?: number; imgH?: number };

/** Per-render model the scene frames and the sound plan share. */
export interface OpeningModel {
  op: Opening;
  board: BoardItem[];
  hook: Hook | null;
  /** Per beat: when its stamp's date / time are said. */
  stampTimes: (StampTime | null)[];
  /** Counter scenes that wait for their number to be said: frames to wait, and the picture held meanwhile. */
  delays: Map<number, { delay: number; held: Held }>;
  /** When the rewind is said in its scene. */
  rewindAt: number | null;
  /** How hard the hook lands (the story's tone): impact | cinematic | quiet. */
  hookStyle: HookStyle;
}

/** Where a scene sits in the opening: its beat (0..), -1 the main title, -2 the scene that rewinds, null outside. */
export function beatOf(op: Opening | null, index: number): number | null {
  if (!op) return null;
  const k = op.span.beats.indexOf(index);
  if (k >= 0) return k;
  if (index === op.span.title) return -1;
  if (op.kind === 'cold-open' && op.rewind && op.rewind.scene === index) return -2;
  return null;
}

const STOP = new Set(['a', 'an', 'the', 'and', 'of', 'in', 'at', 'on', 'to', 'his', 'her', 'its', 'bir', 've', 'bu', 'o']);
const cleanWord = (w: string) => w.replace(/[.,!?…:;"“”«»()[\]]/g, '').replace(/^[—–-]+|[—–-]+$/g, '');

/** The picture a waiting counter holds: the last picture before it. */
function heldPicture(scenes: Scene[], i: number): Held | null {
  for (let j = i - 1; j >= 0; j--) {
    const s = scenes[j] as Scene & { image?: string; images?: string[]; imgW?: number; imgH?: number };
    if (s.type === 'title' && (s as { chapterCard?: boolean }).chapterCard) continue;
    if (s.image) return { src: s.image, clip: clipOf(s), imgW: s.imgW ?? s.videoW, imgH: s.imgH ?? s.videoH };
    if (s.images?.length) return { src: s.images[s.images.length - 1] };
  }
  return null;
}

/** The opening's hook: the earliest punch said in the first ~4 s (else ~6.5 s) of the first two beats. */
function hookOf(op: Opening, scenes: Scene[], placed: Slot[], fps: number, stampTimes: (StampTime | null)[]): Hook | null {
  const cands: (Hook & { abs: number })[] = [];
  op.span.beats.slice(0, 2).forEach((i, k) => {
    const s = scenes[i];
    const p = placed[i];
    if (!s || !p) return;
    const add = (h: Hook) => cands.push({ ...h, abs: p.from + h.f });
    if (s.type === 'montage' && s.text) {
      const ws = montageWords(s, p.frames, fps).map((w) => ({ text: cleanWord(w.word), f: w.f })).filter((w) => w.text);
      // A hard hook slams the first word that carries weight (never "a" or "the").
      const k0 = Math.max(0, ws.findIndex((w) => w.text.length >= 3 && !STOP.has(w.text.toLowerCase())));
      if (ws.length) add({ scene: i, f: ws[0].f, text: ws[k0].text, type: 'montage', native: ws.length === 1 || k0 === ws.length - 1, word: k0, words: ws });
    }
    if (s.type === 'slam' && s.word) add({ scene: i, f: slamFrame(s, fps), text: s.word, type: 'slam', native: true });
    if (s.type === 'words' && s.keyword) {
      const words = textWords(s.text);
      const [k0, k1] = keyRange(words, s.keyword);
      if (k0 >= 0) add({ scene: i, f: wordFrames(s, p.frames, fps)[k0] ?? 0, text: words.slice(k0, k1).map(cleanWord).join(' '), type: 'words' });
    }
    const st = op.stamps[k];
    const tm = stampTimes[k];
    if (st && st.fromSay && tm) {
      const dateFirst = tm.dateAt !== null && (tm.timeAt === null || tm.dateAt <= tm.timeAt);
      add({ scene: i, f: tm.at, text: dateFirst ? st.date : st.time, type: 'stamp' });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => a.abs - b.abs);
  const pick = cands.find((c) => c.abs <= 4 * fps) ?? cands.find((c) => c.abs <= 6.5 * fps);
  if (!pick) return null;
  const { abs: _abs, ...hook } = pick;
  return hook;
}

export function openingModel(op: Opening | null, scenes: Scene[], placed: Slot[], fps: number, locale: string): OpeningModel | null {
  if (!op) return null;
  const frames = placed.map((p) => p.frames);
  const delays = new Map<number, { delay: number; held: Held }>();
  for (const i of op.span.beats) {
    const s = scenes[i];
    if (!s || s.type !== 'counter') continue;
    const at = counterSpokenAt(s, fps);
    const held = heldPicture(scenes, i);
    if (!held) continue;
    // The count starts on the number's first word (it counts from the counter's 3rd frame); the related picture stays behind it.
    const wait = at !== null && at > 6 && at < (placed[i]?.frames ?? 0) - fps ? at - 3 : 0;
    delays.set(i, { delay: wait, held });
  }
  const stampTimes = op.span.beats.map((i, k) => {
    const st = op.stamps[k];
    if (!st) return null;
    const d = delays.get(i)?.delay ?? 0;
    return stampTiming(scenes[i], st, fps, d + 8);
  });
  const found = hookOf(op, scenes, placed, fps, stampTimes);
  // A hard montage hook lands on its slammed word; a softer one starts with the line.
  const hook = found && found.type === 'montage' && op.hook === 'impact' && found.words ? { ...found, f: found.words[found.word ?? 0].f } : found;
  const rewindAt = op.kind === 'cold-open' && op.rewind ? rewindSpokenAt(scenes[op.rewind.scene], fps) : null;
  return { op, board: op.kind === 'evidence' ? boardItems(op, scenes, frames, fps, locale) : [], hook, stampTimes, delays, rewindAt, hookStyle: op.hook };
}

/** Transitions the treatment needs (never timing): a hard cut into the title, between board beats, after the quote. */
export function openingTransitions(op: Opening | null, scenes: Scene[], kinds: TransitionKind[]): TransitionKind[] {
  if (!op) return kinds;
  const out = [...kinds];
  if (op.kind === 'cold-open' && op.span.title >= 0) out[op.span.title] = 'cut';
  if (op.kind === 'quote' && op.quote) {
    out[op.quote.scene] = 'cut';
    if (op.quote.scene + 1 < out.length) out[op.quote.scene + 1] = 'cut';
  }
  if (op.kind === 'evidence') {
    for (let k = 1; k < op.span.beats.length; k++) {
      const a = scenes[op.span.beats[k - 1]];
      const b = scenes[op.span.beats[k]];
      if (a && b && boardBeat(a) && boardBeat(b)) out[op.span.beats[k]] = 'cut';
    }
  }
  if (op.kind === 'map-dive') out[0] = 'cut';
  return out;
}

/** Scenes as the music sees them: the quote beat is a held breath (the bed drops out under it). */
export function openingMusicScenes(op: Opening | null, scenes: Scene[]): Scene[] {
  if (!op || op.kind !== 'quote' || !op.quote) return scenes;
  return scenes.map((s, i) => (i === op.quote!.scene ? ({ ...s, silence: true } as Scene) : s));
}

/** The hook as a music hit (the bed stops down before it and swells on it) — only a hard hook, and a native one is already there. */
export function openingHits(m: OpeningModel | null): { scene: number; f: number }[] {
  return m?.hook && !m.hook.native && m.hookStyle === 'impact' ? [{ scene: m.hook.scene, f: m.hook.f }] : [];
}

/** A scene's impacts with the opening's: a waiting counter's own punch moves with it; the hook punches the frame. */
export function openingImpacts<T extends { f: number; strength: number }>(m: OpeningModel | null, index: number, base: T[]): T[] {
  if (!m) return base;
  const d = m.delays.get(index)?.delay ?? 0;
  const out = d ? base.map((b) => ({ ...b, f: b.f + d })) : [...base];
  // A hard hook punches the frame; a cinematic one only nudges it; a quiet one never shakes.
  if (m.hook && !m.hook.native && m.hook.scene === index && m.hookStyle !== 'quiet') out.push({ f: m.hook.f, strength: m.hookStyle === 'impact' ? 1 : 0.25 } as T);
  return out;
}

/** Extra sounds of the treatment, on the frames it animates. */
export function openingSfx(m: OpeningModel | null, scenes: Scene[], placed: Slot[], fps: number): Cue[] {
  if (!m) return [];
  const { op } = m;
  const out: Cue[] = [];
  const at = (i: number, f: number) => (placed[i]?.from ?? 0) + f;
  if (m.hook && !m.hook.native) {
    const t = at(m.hook.scene, m.hook.f);
    // Hard: a hit in the music's hole. Cinematic: a swell peaking on the word. Quiet: a soft swell under it.
    if (m.hookStyle === 'impact') out.push({ key: 'ophook', kind: 'hit', at: t, align: 'onset', gain: 1, tight: true });
    else out.push({ key: 'ophook', kind: 'swell', at: t + (m.hookStyle === 'quiet' ? 10 : 4), align: 'peak', gain: m.hookStyle === 'quiet' ? 0.28 : 0.45 });
  }
  if (op.kind === 'timestamps') {
    op.span.beats.forEach((i, k) => {
      const tm = m.stampTimes[k];
      if (tm && !(m.hook?.type === 'stamp' && m.hook.scene === i)) out.push({ key: `opt${i}`, kind: 'ticks', at: at(i, tm.at), align: 'onset', gain: 0.32 });
    });
  }
  if (op.kind === 'cold-open' && op.rewind && m.rewindAt !== null) out.push({ key: 'oprw', kind: 'glitch', at: at(op.rewind.scene, m.rewindAt), align: 'onset', gain: 0.4 });
  if (op.kind === 'map-dive' && op.map) {
    const d = diveFrames(placed[op.span.beats[0]]?.frames ?? 90, fps);
    out.push({ key: 'opmd', kind: 'whoosh', at: at(op.span.beats[0], d - 2), align: 'peak', gain: 0.45 });
  }
  if (op.kind === 'quote' && op.quote) {
    const n = op.quote.scene + 1;
    const s = scenes[n];
    if (s && s.type !== 'slam' && !(s.type === 'title' && s.chapterCard)) out.push({ key: 'opq', kind: 'hit', at: at(n, 0), align: 'onset', gain: 0.9, tight: true });
  }
  return out;
}

/** Foley the treatment asks for (paper as clippings land, typing as a stamp is typed, prints pinned). */
export function openingFoley(m: OpeningModel | null, scenes: Scene[], placed: Slot[], fps: number): FoleyWant[] {
  if (!m) return [];
  const { op } = m;
  const out: FoleyWant[] = [];
  op.span.beats.forEach((i, k) => {
    const s = scenes[i];
    const p = placed[i];
    if (!s || !p) return;
    if (op.kind === 'headlines') headlineCues(s, p.frames, fps).forEach((c, j) => out.push({ scene: i, f: c.f, kind: 'paper', group: `hl${i}_${j}` }));
    const tm = m.stampTimes[k];
    const st = op.stamps[k];
    if (op.kind === 'timestamps' && tm && st) {
      if (st.date && tm.dateAt !== null) out.push({ scene: i, f: tm.dateAt, kind: 'type', dur: stampTypeFrames(st.date) });
      if (st.time && tm.timeAt !== null) out.push({ scene: i, f: tm.timeAt, kind: 'type', dur: stampTypeFrames(st.time) });
    }
  });
  for (const it of m.board) {
    out.push({ scene: it.scene, f: it.at + 7, kind: 'shutter', align: 'peak', group: `ev${it.scene}_${it.at}` });
    out.push({ scene: it.scene, f: it.at + 11, kind: 'pin', align: 'peak', group: `ev${it.scene}_${it.at}` });
  }
  return out;
}

/** Counter waits for the SFX plan too (its ticks move with its count). */
export function openingCountAt(m: OpeningModel | null, index: number): number | undefined {
  const d = m?.delays.get(index)?.delay;
  return d ? d + 3 : undefined;
}

/** What the scene component itself must do (context for scenes.tsx). */
export function sceneCtx(m: OpeningModel | null, index: number, scene: Scene, durFrames: number, genre: Genre, locale: string, fps: number): OpeningSceneCtx | null {
  if (!m) return null;
  const beat = beatOf(m.op, index);
  if (beat === null) return null;
  const { op, hook } = m;
  const ctx: OpeningSceneCtx = { kind: op.kind, beat };
  if (beat < 0) return ctx;
  if (op.kind === 'headlines' && headlineCues(scene, durFrames, fps).length) ctx.hideText = true;
  if (op.kind === 'timestamps') ctx.clearEdge = 'top';
  if (op.kind === 'map-dive' && beat === 0 && op.map && scene.type === 'montage') {
    const until = diveFrames(durFrames, fps);
    ctx.intro = { until, node: <MapDive map={op.map} genre={genre} locale={locale} until={until} /> };
  }
  // A hard hook: the montage sets its first word itself (centred, big, flash). A softer one: the hook layer sets it, the montage skips it.
  if (hook?.type === 'montage' && hook.scene === index && op.kind !== 'headlines' && op.kind !== 'evidence') {
    if (m.hookStyle === 'impact') ctx.heroWord = hook.word ?? 0;
    // The cinematic / quiet hook sets the whole line as it is said: the montage keeps its pictures only.
    else ctx.hideText = true;
  }
  return ctx;
}

/** A scene the treatment draws instead of the scene's own renderer (board beats, the quote card); null = the scene draws. */
export function openingBody(m: OpeningModel | null, index: number, scene: Scene, durFrames: number, genre: Genre, locale: string): React.ReactNode {
  if (!m) return null;
  const beat = beatOf(m.op, index);
  if (beat === null || beat < 0) return null;
  const { op } = m;
  if (op.kind === 'evidence' && boardBeat(scene) && m.board.some((it) => it.beat === beat)) {
    return <EvidenceBoard items={m.board} beat={beat} genre={genre} durFrames={durFrames} locale={locale} />;
  }
  if (op.kind === 'quote' && op.quote && op.quote.scene === index) {
    return <QuoteOpen scene={scene} text={op.quote.text} genre={genre} durFrames={durFrames} locale={locale} index={index} />;
  }
  return null;
}

/**
 * A counter waiting for its number: the last picture holds (a slow push)
 * until the number is said, then the counter cuts in and counts on the word.
 */
export function openingDelayed(m: OpeningModel | null, index: number, durFrames: number, body: (durFrames: number) => React.ReactNode): React.ReactNode | null {
  const w = m?.delays.get(index);
  if (!w) return null;
  return <DelayedBody wait={w.delay} held={w.held} durFrames={durFrames} body={body(durFrames - w.delay)} />;
}

/** The related picture moves under the whole beat; the counter lands on it (its own ground is the picture, darkened). */
const DelayedBody: React.FC<{ wait: number; held: Held; durFrames: number; body: React.ReactNode }> = ({ wait, held, durFrames, body }) => {
  const { fps } = useVideoConfig();
  const f = useCurrentFrame();
  const look = useLook();
  const scrim = interpolate(f - wait, [0, 8], [0.1, 0.32], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ground = React.useMemo(() => <AbsoluteFill />, []);
  return (
    <AbsoluteFill>
      <Photo src={held.src} clip={held.clip} durFrames={durFrames} imgW={held.imgW} imgH={held.imgH} speed={0.8} fill />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,${scrim * 0.6}) 30%, rgba(0,0,0,${Math.min(0.85, scrim + 0.3)}) 100%)` }} />
      <SequenceFrom from={wait} dur={Math.max(1, durFrames - wait)}>
        <LookContext.Provider value={{ ...look, ground, backdrop: undefined }}>{body}</LookContext.Provider>
      </SequenceFrom>
      {wait > 0 ? <CutFlash at={wait} fps={fps} /> : null}
    </AbsoluteFill>
  );
};

const SequenceUntil: React.FC<{ to: number; children: React.ReactNode }> = ({ to, children }) => (
  <Sequence from={0} durationInFrames={Math.max(1, to)} layout="none">
    {children}
  </Sequence>
);
const SequenceFrom: React.FC<{ from: number; dur: number; children: React.ReactNode }> = ({ from, dur, children }) => (
  <Sequence from={from} durationInFrames={dur} layout="none">
    {children}
  </Sequence>
);
const CutFlash: React.FC<{ at: number; fps: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const o = interpolate(f - at, [0, 1, 3], [0.45, 0.25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return o > 0 && f >= at ? <AbsoluteFill style={{ background: '#fff', opacity: o, mixBlendMode: 'screen', pointerEvents: 'none' }} /> : null;
};

/** The genre a touched scene is laid out with (cold-open beats clear the 2.35 bars). */
export function openingGenre(m: OpeningModel | null, index: number, genre: Genre): Genre {
  if (!m || m.op.kind !== 'cold-open') return genre;
  const beat = beatOf(m.op, index);
  return beat !== null && beat >= 0 && !genre.letterbox ? { ...genre, letterbox: true } : genre;
}

/** Extra CSS filter on a touched scene's picture (the cold open's heavier grade). */
export function openingFilter(m: OpeningModel | null, index: number): string | undefined {
  if (!m || m.op.kind !== 'cold-open') return undefined;
  const beat = beatOf(m.op, index);
  return beat !== null && beat >= 0 ? COLD_GRADE : undefined;
}

/** Does the treatment need the generic hook slam on this scene (the scene and the treatment do not set it themselves)? */
function needsHookSlam(m: OpeningModel, index: number): boolean {
  const h = m.hook;
  if (!h || h.scene !== index) return false;
  const k = m.op.kind;
  if (k === 'headlines') return false;
  if (k === 'evidence') return true;
  if (h.type === 'montage') return m.hookStyle !== 'impact';
  if (h.type === 'words') return true;
  if (h.type === 'stamp') return k !== 'timestamps';
  return false;
}

/** Drawn over the scene (steady: outside the scene's shake and punch). */
export const OpeningOverlay: React.FC<{ m: OpeningModel; index: number; scene: Scene; scenes: Scene[]; durFrames: number; genre: Genre; locale: string }> = ({
  m,
  index,
  scene,
  durFrames,
  genre,
  locale,
}) => {
  const beat = beatOf(m.op, index);
  if (beat === null) return null;
  const { op, hook } = m;
  if (beat === -2) return op.rewind && m.rewindAt !== null ? <RewindCaption genre={genre} text={op.rewind.text} at={m.rewindAt} durFrames={durFrames} locale={locale} /> : null;
  if (beat === -1) return op.kind === 'cold-open' ? <TapeTear /> : null;
  const tm = m.stampTimes[beat];
  const hookSlam = needsHookSlam(m, index) && hook ? <HookSlam text={hook.text} genre={genre} locale={locale} at={hook.f} style={m.hookStyle} words={hook.type === 'montage' ? hook.words : undefined} /> : null;
  let layer: React.ReactNode = null;
  switch (op.kind) {
    case 'headlines':
      layer = <HeadlineLayer scene={scene} genre={genre} locale={locale} durFrames={durFrames} beat={beat} stamp={op.stamps[beat]} stampAt={tm ? Math.max(tm.dateAt ?? 0, tm.timeAt ?? 0) : null} hook={hook && hook.scene === index ? hook : null} hookStyle={m.hookStyle} />;
      break;
    case 'timestamps': {
      const st = op.stamps[beat];
      if (st && tm) layer = <StampLayer stamp={st} genre={genre} locale={locale} dateAt={tm.dateAt} timeAt={tm.timeAt} hero={hook?.type === 'stamp' && hook.scene === index} hookStyle={m.hookStyle} uid={`st${index}`} />;
      else if (op.stamps.slice(0, beat).some(Boolean)) layer = <DialPlate genre={genre} uid={`dp${index}`} />;
      break;
    }
    case 'cold-open':
      layer = <ColdOpenLayer beat={beat} durFrames={durFrames} />;
      break;
    case 'map-dive':
      if (beat === 0 && op.map && scene.type !== 'montage') layer = <MapDiveOver op={op} genre={genre} locale={locale} durFrames={durFrames} />;
      break;
    case 'quote':
      if (op.quote && index === op.quote.scene + 1) layer = <HitFlash />;
      break;
    default:
      break;
  }
  return (
    <>
      {layer}
      {hookSlam}
    </>
  );
};

const MapDiveOver: React.FC<{ op: Opening; genre: Genre; locale: string; durFrames: number }> = ({ op, genre, locale, durFrames }) => {
  const { fps } = useVideoConfig();
  const until = diveFrames(durFrames, fps);
  return op.map ? <MapDive map={op.map} genre={genre} locale={locale} until={until} /> : null;
};

export type { Stamp };

/** The opening's title in full frame (a framed print with dark margins reads small): cover, a slow push — when the source holds it. */
export function openingStyled<S extends Scene>(op: Opening | null, scenes: S[]): S[] {
  if (!op || op.span.title < 0) return scenes;
  const t = scenes[op.span.title] as S & { imgW?: number; imgH?: number; fit?: string; camera?: string };
  if (!t) return scenes;
  const w = t.videoW ?? t.imgW;
  const h = t.videoH ?? t.imgH;
  if (!w || !h || Math.max(1920 / w, 1080 / h) > 2) return scenes;
  const out = [...scenes];
  out[op.span.title] = { ...t, fit: 'cover', camera: t.camera && t.camera !== 'static' && t.camera !== 'drift' ? t.camera : 'push-in' };
  return out;
}
