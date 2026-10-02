import React from 'react';
import { AbsoluteFill, Easing, Sequence, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, fitFont, textLocale, textWidth } from './fonts';
import { CARD_PAD, LETTERBOX, LayeredPhoto, LightLeak, PatternBg, Photo, PhotoCard, SoftPlate, clipOf, isLowRes, isLowResClip } from './fx';
import type { Clip } from './fx';
import { headlineLand } from './headline';
import { mapImpacts } from './map';
import { Annotated } from './devices/annotate';
import { deviceImpacts, isDeviceType } from './devices/timing';
import { pacePlan, punchPlan } from './effects/timing';
import { useLook, type LookCtx } from './looks/context';
import { StyledCaption, StyledMontageWord, StyledSlam, StyledTitle, type TextCtx } from './looks/text';
import { StyledCounter } from './counterStyles';
import { useTopic } from './topic/context';
import { MotifChapterCard } from './topic/cards';
import { PresentedPhoto } from './topic/presentation';
import { MotifCaption } from './topic/caption';
import { useOpening } from './opening/context';
import { counterCountEnd, counterSpokenAt } from './opening/timing';
import type {
  ChartScene,
  CounterScene,
  FontKey,
  Genre,
  Layers,
  MontageScene,
  PhotoScene,
  Scene,
  SlamScene,
  TitleScene,
  WordsScene,
} from './types';

interface Common {
  genre: Genre;
  durFrames: number;
  locale: string;
  /** Camera speed from the scene's mood. */
  speed: number;
  /** Position in the edit. Keeps collage layouts from repeating back to back; optional. */
  index?: number;
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** The scene's text style (src/looks): 'box' = this file's original treatments. */
const textCtx = (look: LookCtx, genre: Genre, kicker?: string): TextCtx => ({ genre, style: look.textStyle, surface: look.surface, chapterName: look.chapterName, kicker: kicker?.trim() || undefined, index: look.index });
const FRAME_W = 1920;
const FRAME_H = 1080;
/**
 * Remotion's AbsoluteFill is width/height 100% in content-box, so a bottom or
 * right padding on it overflows the frame instead of insetting the content:
 * captions meant to sit 170px up hugged the bottom edge, under the letterbox
 * bars. Every padded fill spreads this.
 */
const BOX = { boxSizing: 'border-box' } as const;

/** Pixels hidden under each letterbox bar (the engine draws one constant set). */
const barPx = (g: Genre) => (g.letterbox ? Math.round(FRAME_H * LETTERBOX) : 0);
/**
 * Widest a slam/hook word may get on its landing overshoot. Not 1920: the
 * width model is an estimate of the real glyphs, and a letter touching the
 * frame edge on the loudest beat of the video reads as a mistake.
 */
const LAND_MAX_W = 1840;

/* ======================================================= words and voice */

/**
 * One tokenizer for the script and the voice. ElevenLabs hands words back as
 * spoken, with the script's punctuation glued on ("Enron'un", "ihanet—",
 * "(1929)", "‘tek’"); nothing that is not a letter or a digit may decide
 * whether a punch lands on time. docu-script.js (validator/normalizer) and
 * produce.mjs (montage hook) must use the same rule:
 *   w.normalize('NFC').toLocaleLowerCase(locale).replace(/[^\p{L}\p{N}]/gu, '')
 * with the script's case rules: tr-TR for Turkish, en-US otherwise ("I" is "i", not "ı").
 */
export const norm = (w: string) =>
  String(w ?? '')
    .normalize('NFC')
    .toLocaleLowerCase(textLocale())
    .replace(/[^\p{L}\p{N}]/gu, '');

/** Same token without Turkish diacritics — the last resort when the script and the voice disagree on ş/s, ı/i. */
const fold = (n: string) => n.replace(/ı/g, 'i').normalize('NFD').replace(/\p{M}/gu, '');

/**
 * Removes v3 performance tags from a token list: "[whispers]", a tag the
 * alignment split in two ("[short", "pause]") and one glued to a word
 * ("tarif...[sighs]"). A tag-only token becomes ''.
 */
function untag(tokens: string[]): string[] {
  let open = false;
  return tokens.map((tok) => {
    let s = tok;
    if (open) {
      const e = s.indexOf(']');
      if (e < 0) return '';
      s = s.slice(e + 1);
      open = false;
    }
    s = s.replace(/\[[^\]]*\]/g, '');
    const o = s.indexOf('[');
    if (o >= 0) {
      open = true;
      s = s.slice(0, o);
    }
    return s;
  });
}

/** The words of an on-screen text, tags removed. */
export function textWords(text: string): string[] {
  return untag(String(text ?? '').split(/\s+/).filter(Boolean)).filter(Boolean);
}

interface Spoken {
  n: string;
  t: number;
}
/** Spoken words with timings: no tags, no dash-only tokens. */
function spokenTokens(wordTimes?: { word: string; t: number }[]): Spoken[] {
  const list = wordTimes ?? [];
  const clean = untag(list.map((w) => w.word));
  const out: Spoken[] = [];
  list.forEach((w, i) => {
    const n = norm(clean[i]);
    if (n && Number.isFinite(w.t)) out.push({ n, t: w.t });
  });
  return out;
}

type Level = 'exact' | 'prefix' | 'fold';
const RANK: Record<Level, number> = { exact: 0, prefix: 1, fold: 2 };

/**
 * Turkish glues suffixes on: "ihanet" is spoken "ihanete", "Enron" is
 * "Enron'un" (-> "enronun"). A shared stem of 4+ letters that is at least
 * ~half the longer word counts; "bil" never matches "bilinmeyen".
 */
function stemOf(a: string, b: string): boolean {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 4 && s.length >= l.length * 0.45 && l.startsWith(s);
}
function tokenMatch(a: string, b: string): Level | null {
  if (!a || !b) return null;
  if (a === b) return 'exact';
  if (stemOf(a, b)) return 'prefix';
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb || stemOf(fa, fb)) return 'fold';
  return null;
}

export type MatchHow = Level | 'sequence' | 'partial';

/**
 * Where a (possibly multi-word) target is spoken. Order: exact token, a
 * suffixed/prefixed form, the diacritic-free form, the whole phrase as a
 * run of tokens (also when the narrator splits or joins words differently
 * from the script), and finally the phrase's longest word on its own.
 */
function findSpoken(target: string, spoken: Spoken[]): { i: number; how: MatchHow } | null {
  const T = untag(String(target ?? '').split(/\s+/)).map(norm).filter(Boolean);
  if (!T.length || !spoken.length) return null;
  if (T.length === 1) {
    for (const level of ['exact', 'prefix', 'fold'] as Level[]) {
      const i = spoken.findIndex((s) => tokenMatch(T[0], s.n) === level);
      if (i >= 0) return { i, how: level };
    }
  } else {
    for (let i = 0; i + T.length <= spoken.length; i++) {
      if (T.every((t, k) => tokenMatch(t, spoken[i + k].n))) return { i, how: 'sequence' };
    }
  }
  // "Coca-Cola" spoken "Coca Cola", "SON DAKİKA" aligned as one token: compare the joined letters.
  const joined = T.join('');
  for (let i = 0; i < spoken.length; i++) {
    let acc = '';
    for (let k = i; k < Math.min(spoken.length, i + 4); k++) {
      acc += spoken[k].n;
      if (k > i && (acc === joined || tokenMatch(joined, acc) === 'prefix')) return { i, how: 'sequence' };
      if (acc.length >= joined.length) break;
    }
  }
  if (T.length > 1) {
    const longest = [...T].sort((a, b) => b.length - a.length)[0];
    const m = findSpoken(longest, spoken);
    if (m) return { i: m.i, how: 'partial' };
  }
  return null;
}

/** The frame a name, caption or label is first said in the scene, or null when it is never said (then the old fixed clock applies). */
export function spokenFrameOf(target: string | undefined, wordTimes: { word: string; t: number }[] | undefined, fps: number): number | null {
  if (!target) return null;
  const sp = spokenTokens(wordTimes);
  const m = findSpoken(target, sp);
  return m ? Math.round(sp[m.i].t * fps) : null;
}

/**
 * Script words -> spoken times, in order. An exact match may reach far ahead
 * (a skipped filler word must not derail the rest); a fuzzy one only a few
 * words, so a common stem cannot drag the captions to the end of the line.
 */
function matchInOrder(targets: string[], spoken: Spoken[]): (number | null)[] {
  let j = 0;
  return targets.map((n) => {
    if (!n) return null;
    let hit = -1;
    for (let k = j; k < spoken.length; k++) {
      if (spoken[k].n === n) {
        hit = k;
        break;
      }
    }
    if (hit < 0 || hit - j > 5) {
      for (let k = j; k < Math.min(spoken.length, j + 5); k++) {
        if (tokenMatch(n, spoken[k].n)) {
          hit = k;
          break;
        }
      }
    }
    if (hit < 0) return null;
    j = hit + 1;
    return spoken[hit].t;
  });
}

/* ====================================================== timing helpers */

/**
 * Frame at which each word appears: its spoken time when we have it. A word
 * the voice never says exactly is placed BETWEEN its matched neighbours —
 * the old "+4 frames after the last match" ran captions ahead of the voice.
 */
export function wordFrames(scene: Pick<WordsScene, 'text' | 'wordTimes'>, durFrames: number, fps: number): number[] {
  const words = textWords(scene.text);
  const spoken = spokenTokens(scene.wordTimes);
  if (!spoken.length) {
    const span = Math.max(1, Math.round(durFrames * 0.7));
    return words.map((_, i) => Math.round((i * span) / Math.max(1, words.length)));
  }
  const times = matchInOrder(words.map(norm), spoken);
  const known = times.map((t, i) => (t == null ? -1 : i)).filter((i) => i >= 0);
  let out: number[];
  if (!known.length) {
    const t0 = spoken[0].t;
    const t1 = spoken[spoken.length - 1].t;
    out = words.map((_, i) => t0 + ((t1 - t0) * i) / Math.max(1, words.length - 1));
  } else {
    out = times.map((t, i) => {
      if (t != null) return t;
      let p = -1;
      for (const k of known) if (k < i) p = k;
      const q = known.find((k) => k > i);
      if (p >= 0 && q != null) return times[p]! + ((times[q]! - times[p]!) * (i - p)) / (q - p);
      if (q != null) return Math.max(0, times[q]! - (q - i) * 0.25);
      return times[p]! + (i - p) * 0.28;
    });
  }
  let prev = 0;
  return out.map((t) => {
    const fr = Math.max(prev, Math.round(t * fps));
    prev = fr;
    return fr;
  });
}

/** Which on-screen words are the keyword (a phrase highlights all its words); [-1,-1] when it is not in the text. */
export function keyRange(words: string[], keyword?: string): [number, number] {
  if (!keyword) return [-1, -1];
  const T = textWords(keyword).map(norm).filter(Boolean);
  const N = words.map(norm);
  if (!T.length) return [-1, -1];
  for (const level of ['exact', 'prefix', 'fold'] as Level[]) {
    for (let i = 0; i + T.length <= N.length; i++) {
      const ok = T.every((t, k) => {
        const m = tokenMatch(t, N[i + k]);
        return m != null && RANK[m] <= RANK[level];
      });
      if (ok) return [i, i + T.length];
    }
  }
  return [-1, -1];
}

/** Words too plain to carry a caption's emphasis. */
const PLAIN_WORDS = new Set('that this these those there their they them with from were what when where which while would could should about after before every never always again even still just only into onto over under than then some many much more most very really thing things something nothing everything anyone everyone someone ve ile için gibi kadar daha çok bir şey hiç her'.split(' '));
/**
 * A caption line with no keyword (an old script, or one whose keyword was
 * dropped): an unemphasised sentence under a picture reads as an amateur
 * subtitle, so the line's strongest word is emphasised — its longest content
 * word, the later one on a tie (sentences land on their last idea).
 */
export function autoKeyword(words: string[]): string | undefined {
  let best: string | undefined;
  let bestLen = 0;
  for (const w of words) {
    const n = norm(w);
    if (n.length < 4 || PLAIN_WORDS.has(n)) continue;
    if (n.length >= bestLen) {
      best = w;
      bestLen = n.length;
    }
  }
  return best;
}

export type SlamHow = MatchHow | 'fallback' | 'unvoiced';

/**
 * The frame a slam lands on, and how it was found. With a voice track it is
 * always a spoken word: the slam word itself (exact, suffixed, diacritic-free
 * or as a phrase), else the line's LAST word — where a narrator lands a
 * punch. Never a fixed second into the scene: that put the hit, its riser
 * and the frame punch on nothing. `how` is 'fallback' for the pipeline's
 * quality warnings.
 */
export function slamMatch(scene: SlamScene, fps: number): { f: number; how: SlamHow } {
  const spoken = spokenTokens(scene.wordTimes);
  if (spoken.length) {
    const m = findSpoken(scene.word, spoken);
    if (m) return { f: Math.round(spoken[m.i].t * fps), how: m.how };
    return { f: Math.round(spoken[spoken.length - 1].t * fps), how: 'fallback' };
  }
  // No narration at all: the scripted air before the word, kept inside the first half of the scene.
  const dur = scene.dur > 0 ? scene.dur : 2;
  return { f: Math.round(Math.min(scene.at ?? 1.0, dur * 0.5) * fps), how: 'unvoiced' };
}

export function slamFrame(scene: SlamScene, fps: number): number {
  return slamMatch(scene, fps).f;
}

/** Chapter cards stamp their number in once the genre's signature transition has cleared (a blackout holds 8 frames). */
export const CHAPTER_LAND = 0.3;

const extraEnter = (i: number, fps: number) => Math.round((0.55 + i * 0.5) * fps);
/** Stable small hash of a picture path (collage rhythm must not change between renders). */
const picHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/**
 * Photo scenes become cards on a board only in collage genres, never for natural/full-bleed shots —
 * and only as an accent: every still on a board made whole videos read as a slideshow of small
 * framed prints. A board is kept for multi-picture scenes, small/low-res scans (which can't go
 * full-bleed anyway) and about one in three of the rest; everything else is cinematic full-bleed.
 */
const collageOn = (g: Genre, s: PhotoScene) =>
  g.collage && !s.natural && !s.fullBleed &&
  (!!s.images?.length || (s.video ? isLowResClip(s.videoW, s.videoH) : isLowRes(s.imgW, s.imgH)) || picHash(String(s.video ?? s.image ?? '')) % 3 === 0);

export interface Impact {
  f: number;
  strength: number;
}

function coreImpacts(scene: Scene, durFrames: number, fps: number, genre?: Genre): Impact[] {
  const out: Impact[] = [];
  if (scene.type === 'slam') out.push({ f: slamFrame(scene, fps), strength: 1 });
  if (scene.type === 'counter') {
    // The count lands 0.9 s after it starts — on the number's first spoken word when it is said late (Engine spokenDelayed).
    const at = counterSpokenAt(scene, fps);
    const wait = at !== null && at > 6 && at < durFrames - fps ? at - 3 : 0;
    out.push({ f: wait + counterCountEnd(scene, fps), strength: 0.45 });
  }
  if (scene.type === 'words' && scene.keyword) {
    const [k] = keyRange(textWords(scene.text), scene.keyword);
    if (k >= 0) out.push({ f: wordFrames(scene, durFrames, fps)[k], strength: 0.5 });
  }
  if (scene.type === 'montage') {
    montageCuts(scene, durFrames, fps).forEach((c, i) => {
      if (i > 0) out.push({ f: c, strength: 0.3 });
    });
    const hook = montageWords(scene, durFrames, fps).at(-1);
    if (hook) out.push({ f: hook.f, strength: 0.9 });
  }
  // Extra cards only exist on a collage board; elsewhere they are never drawn, so they must not punch.
  if (scene.type === 'photo' && scene.images?.length && (!genre || collageOn(genre, scene))) {
    scene.images.forEach((_, i) => out.push({ f: extraEnter(i, fps) + 7, strength: 0.25 }));
  }
  if (scene.type === 'title' && scene.chapterCard) out.push({ f: Math.round(CHAPTER_LAND * fps), strength: 0.35 });
  // The newspaper's last headline letter hits the page; a map's route arrives.
  if (scene.type === 'headline') out.push({ f: headlineLand(scene, fps), strength: 0.3 });
  if (scene.type === 'map') out.push(...mapImpacts(scene, durFrames, fps));
  // Edit devices (src/devices): a stamp, a split landing, a freeze & mark.
  out.push(...deviceImpacts(scene, durFrames, fps));
  return out;
}

/**
 * Every moment inside a scene where the frame should physically react —
 * punch, shake, lens split — and where the sound design puts a hit. This is
 * the "something happens every second" rule made explicit. Pass `genre` when
 * known: photo extras only punch where they are shown.
 */
export function sceneImpacts(scene: Scene, durFrames: number, fps: number, genre?: Genre): Impact[] {
  const out = coreImpacts(scene, durFrames, fps, genre);
  // A long scene with nothing going on gets one push — at a seeded point, and only if no cut-in already keeps it alive.
  // A map or a front page is never "nothing going on": its camera and route carry it, a random shake would only blur type.
  const selfMoving = scene.type === 'map' || scene.type === 'headline' || isDeviceType(scene.type) || cameraMoves(scene);
  if (!out.length && !selfMoving && durFrames > 2.6 * fps && !planFor(scene, durFrames, fps, genre).frames.length) {
    out.push({ f: Math.round(durFrames * (0.45 + random(`mid${sceneSeed(scene)}`) * 0.25)), strength: 0.2 });
  }
  return out;
}

/* ======================================================== camera rhythm */

/** A stable per-scene seed from its content (the engine does not always pass an index). */
function sceneSeed(scene: Scene): string {
  const s = scene as Scene & { image?: string; text?: string; word?: string; title?: string; to?: number; label?: string };
  return [s.type, s.image ?? '', (s.say ?? '').slice(0, 80), (s.text ?? s.word ?? s.title ?? '').slice(0, 40), s.to ?? '', s.label ?? '', s.dur].join('|');
}

export interface ReframePlan {
  /** Frames where the edit cuts in (odd) and back out (even). */
  frames: number[];
  /** Scale of a cut-in. */
  tight: number;
  /** Per cut-in: offset from the focal point it aims at. */
  aims: [number, number][];
}
const NO_REFRAME: ReframePlan = { frames: [], tight: 1, aims: [] };

/**
 * Cut-ins never push a source past ~1.75x its own pixels. AI stills are
 * 1536x1024: cover alone enlarges them 1.25x, so they get ~1.15 at most.
 */
function sourceTightCap(scene: Scene): number {
  let w = scene.video ? scene.videoW : scene.imgW;
  let h = scene.video ? scene.videoH : scene.imgH;
  if (!w || !h) {
    // Footage of unknown size gets no cut-ins: a 480p clip blown up 1.3x on top of cover is mush.
    if (scene.video) return 1;
    if (!scene.imagePrompt) return Infinity;
    w = 1536;
    h = 1024;
  }
  const cover = Math.max(FRAME_W / w, FRAME_H / h);
  return 1.75 / (cover * 1.2);
}

/**
 * Cut-ins for a long hold, seeded per scene. It used to be a metronome —
 * tight at 1.7s, out at 3.6s, every 1.9s, always 1.28x — on every photo,
 * words and counter scene. Now: the first cut-in at 1.2-2.6s, then every
 * 1.6-2.8s, each snapped onto the nearest spoken word so the edit moves with
 * the voice; 1.15-1.35x, capped by the source's resolution; aimed at the
 * face, the lower third or a side. Shorter holds sometimes just breathe
 * (more often when calm or sad), scenes under 3.2s and small/portrait scans
 * never cut in, and nothing lands within 15 frames of an impact — a reframe
 * and a hit on the same frame read as a glitch, not an edit.
 */
export function reframePlan(
  scene: Scene,
  durFrames: number,
  fps: number,
  opts: { collage?: boolean; source?: boolean } = {},
): ReframePlan {
  if (durFrames < 3.2 * fps) return NO_REFRAME;
  if (opts.source && !opts.collage) {
    if (scene.video) {
      // Footage already moves: cut-ins only on a clip sharp enough to crop (>= 1280 wide, not contained).
      if ((scene.videoW ?? 0) < 1280 || isLowResClip(scene.videoW, scene.videoH)) return NO_REFRAME;
    } else if (isLowRes(scene.imgW, scene.imgH)) return NO_REFRAME;
  }
  const seed = `rf${sceneSeed(scene)}`;
  const quiet = scene.mood === 'calm' || scene.mood === 'sad';
  if (durFrames < 6 * fps && random(`${seed}hold`) < (quiet ? 0.45 : 0.3)) return NO_REFRAME;
  let tight = 1.15 + random(`${seed}tight`) * 0.2;
  if (opts.source && !opts.collage) tight = Math.min(tight, sourceTightCap(scene));
  if (tight < 1.08) return NO_REFRAME;
  const onsets = spokenTokens(scene.wordTimes).map((w) => Math.round(w.t * fps));
  const near = Math.round(0.35 * fps);
  const snap = (t: number) => {
    let best = t;
    let d = near + 1;
    for (const o of onsets) {
      const dd = Math.abs(o - t);
      if (dd < d) {
        d = dd;
        best = o;
      }
    }
    return best;
  };
  const impacts = coreImpacts(scene, durFrames, fps).map((i) => i.f);
  const endLimit = durFrames - Math.round(0.7 * fps);
  const frames: number[] = [];
  let t = Math.round((1.2 + random(`${seed}first`) * 1.4) * fps);
  for (let k = 0; t < endLimit && k < 64; k++) {
    const c = snap(t);
    const prev = frames.length ? frames[frames.length - 1] : 0;
    if (c < endLimit && c - prev >= fps && impacts.every((i) => Math.abs(i - c) > 15)) frames.push(c);
    t += Math.round((1.6 + random(`${seed}gap${k}`) * 1.2) * fps);
  }
  const aims = frames.map((_, k): [number, number] => {
    const r = random(`${seed}aim${k}`);
    if (r < 0.55) return [0, 0];
    if (r < 0.78) return [0, 0.2];
    return [random(`${seed}side${k}`) < 0.5 ? -0.17 : 0.17, 0.04];
  });
  return { frames, tight, aims };
}

/** The scene's camera (effects/variety.js) is a move of its own: no extra mid-scene push. */
const cameraMoves = (scene: Scene) => !!scene.camera && scene.camera !== 'static';

/** The plan a scene component actually uses — sceneImpacts asks the same question, so a push never doubles a cut-in. */
function planFor(scene: Scene, durFrames: number, fps: number, genre?: Genre): ReframePlan {
  const annotated = scene.type === 'photo' && !!scene.annotate;
  /*
   * Pace (the art director's): hold = one continuous shot, quick = 1-2 and
   * rapid = 3-4 cut-ins, each landing on a narration word, alternating crops
   * around the focus. Never on a contained picture (a cut-in would crop it).
   */
  if (scene.pace && scene.pace !== 'normal' && !annotated && (scene.type === 'photo' || scene.type === 'words' || scene.type === 'counter')) {
    if (scene.pace === 'hold') return NO_REFRAME;
    const collage = scene.type === 'photo' && !!genre && collageOn(genre, scene);
    const source = scene.type !== 'counter' && !!(scene.image || scene.video || scene.layers);
    const low = scene.fit === 'contain' || (source && !collage && (scene.video ? isLowResClip(scene.videoW, scene.videoH) : isLowRes(scene.imgW, scene.imgH)));
    if (low) return NO_REFRAME;
    const cap = collage ? Infinity : source ? sourceTightCap(scene) : 1.25;
    return pacePlan({ wordTimes: scene.wordTimes, durFrames, fps, impacts: coreImpacts(scene, durFrames, fps, genre), seed: random(`pc${sceneSeed(scene)}`), cap, rapid: scene.pace === 'rapid' });
  }
  /*
   * Under the camera vocabulary only a detail-punch cuts in (on its hit word),
   * and a drift keeps the old cut-ins on a long hold; every other move is the
   * shot's whole motion. A contained picture is never cut into.
   */
  if (scene.camera && !annotated) {
    if (scene.fit === 'contain') return NO_REFRAME;
    if (scene.camera === 'detail-punch') {
      const cap = scene.type === 'photo' || scene.type === 'words' ? sourceTightCap(scene) : 1.3;
      return punchPlan({ wordTimes: scene.wordTimes, durFrames, fps, impacts: coreImpacts(scene, durFrames, fps, genre), seed: random(`pp${sceneSeed(scene)}`), cap });
    }
    if (scene.camera !== 'drift') return NO_REFRAME;
  }
  if (scene.type === 'photo') {
    // A freeze & mark is the shot's event: no cut-ins, so the mark lands where the picture is.
    if (scene.annotate) return NO_REFRAME;
    return reframePlan(scene, durFrames, fps, { source: true, collage: !!genre && collageOn(genre, scene) });
  }
  if (scene.type === 'words') return reframePlan(scene, durFrames, fps, { source: !!scene.image || !!scene.layers || !!scene.video });
  if (scene.type === 'counter') return reframePlan(scene, durFrames, fps);
  return NO_REFRAME;
}

/** Cut-in frames only (kept for callers of the old API). */
export function reframeFrames(scene: Scene, durFrames: number, fps: number): number[] {
  return planFor(scene, durFrames, fps).frames;
}

/** Frames at which a montage cuts to its next image: the pipeline's beat-placed cuts, or even spacing. */
export function montageCuts(scene: MontageScene, durFrames: number, fps: number): number[] {
  const n = Math.max(scene.images?.length ?? 0, scene.clips?.length ?? 0);
  if (scene.cuts?.length) return scene.cuts.slice(0, n).map((t) => Math.round(t * fps)).filter((c) => c < durFrames);
  const per = Math.max(6, Math.round((scene.per ?? 0.45) * fps));
  const cuts: number[] = [];
  for (let i = 0; i < n && i * per < durFrames; i++) cuts.push(i * per);
  return cuts;
}

/** When each montage word lands (on the voice), and which one is the hook. */
export function montageWords(scene: MontageScene, durFrames: number, fps: number): { word: string; f: number }[] {
  if (!scene.text) return [];
  const words = textWords(scene.text);
  const at = wordFrames({ text: scene.text, wordTimes: scene.wordTimes }, durFrames, fps);
  // A lone dash or ellipsis is not a word to slam into a corner.
  return words.map((word, i) => ({ word, f: at[i] })).filter((w) => norm(w.word));
}

/* =============================================================== MONTAGE */

/**
 * The footage behind montage cut `idx`: its own clip (`clips`, aligned with
 * `images`; null = a still), or — when only the scene has a `video` — the
 * scene's clip at an offset that walks through the usable footage, so every
 * cut is a different moment and none repeats.
 */
export function montageClip(scene: MontageScene, idx: number, cuts: number[], durFrames: number, fps: number): Clip | undefined {
  const still = scene.images?.[idx];
  if (scene.clips) {
    const c = scene.clips[idx];
    return c ? clipOf(c, still) : undefined;
  }
  const base = clipOf(scene, still);
  if (!base) return undefined;
  const n = cuts.length;
  const seg = ((idx + 1 < n ? cuts[idx + 1] : durFrames) - cuts[idx]) / fps;
  const span = Number.isFinite(base.end) ? base.end - base.start : n * seg * 2;
  const slack = Math.max(0, span - seg);
  return { ...base, start: base.start + (n > 1 ? (slack * idx) / (n - 1) : 0) };
}

/** A word as it is slammed on screen: no sentence punctuation, apostrophes (Enron'un) kept. */
const displayWord = (w: string) => w.replace(/[.,!?…:;"“”«»()[\]]/g, '').replace(/^[—–-]+|[—–-]+$/g, '');

/**
 * Cold open. Pictures cut on the music's beats; words land on the narrator's
 * voice — two clocks, which is why it feels edited rather than templated.
 * Each image punches in from its own offset with one white frame on the cut.
 * Each word slams into a different corner as it is spoken, and the last word
 * — the hook — lands dead centre, bigger, in the warning colour, and stays.
 * Every word is sized to its own width: a long Turkish word in a wide face
 * used to run off both edges.
 */
export const Montage: React.FC<Common & { scene: MontageScene }> = ({ scene, genre, durFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const look = useLook();
  // The opening treatment (src/opening) may set the words itself, keep them off an edge, or open on its own picture.
  const op = useOpening();
  const intro = op?.intro && f < op.intro.until ? op.intro.node : null;
  const imgs = scene.images ?? [];
  const cuts = montageCuts(scene, durFrames, fps);
  if (!cuts.length) return <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />;
  let idx = 0;
  cuts.forEach((c, i) => {
    if (f >= c) idx = i;
  });
  const start = cuts[idx];
  const end = idx + 1 < cuts.length ? cuts[idx + 1] : durFrames;
  const local = f - start;
  const holding = idx === cuts.length - 1;
  const clip = montageClip(scene, idx, cuts, durFrames, fps);
  // Footage moves on its own: a smaller punch-in per cut than a still gets.
  const s = clip
    ? interpolate(local, [0, end - start], holding ? [1.07, 1.01] : [1.1, 1.04], clamp)
    : holding
      ? interpolate(local, [0, end - start], [1.14, 1.02], clamp)
      : interpolate(local, [0, end - start], [1.2, 1.08], clamp);
  const ox = (random(`mo${idx}x`) - 0.5) * 70;
  const oy = (random(`mo${idx}y`) - 0.5) * 40;

  const words = montageWords(scene, durFrames, fps);
  let w = -1;
  words.forEach((x, i) => {
    if (f >= x.f) w = i;
  });
  // The opening's hook word (src/opening) lands like the final hook: centred, big, with the flash.
  const hook = w === words.length - 1 || (w >= 0 && op?.heroWord === w);
  const top = Math.max(150, barPx(genre) + 56);
  const bottom = Math.max(170, barPx(genre) + 56);
  const spots: React.CSSProperties[] = [
    { ...BOX, justifyContent: 'flex-start', alignItems: 'flex-start', padding: `${top}px 0 0 160px` },
    { ...BOX, justifyContent: 'flex-end', alignItems: 'flex-end', padding: `0 160px ${bottom}px 0` },
    { ...BOX, justifyContent: 'flex-start', alignItems: 'flex-end', padding: `${top}px 160px 0 0` },
    { ...BOX, justifyContent: 'flex-end', alignItems: 'flex-start', padding: `0 0 ${bottom}px 160px` },
  ];
  const corners = op?.clearEdge === 'top' ? [spots[1], spots[3]] : spots;
  const spot = hook ? { justifyContent: 'center', alignItems: 'center' } : corners[w % corners.length];
  const since = w >= 0 ? f - words[w].f : 0;
  // A cinematic/quiet opening hook sets this word itself (src/opening): the montage leaves it out.
  const shown = w >= 0 && op?.skipWord !== w ? displayWord(words[w].word) : '';
  const trackPx = hook ? 6 : 2;
  // Hook: centred, 1720px wide at the engine's +5% punch. Corners: 1600px between the 160px paddings.
  const size = hook
    ? fitFont(shown, genre.headline, { maxW: 1720, cap: 250, trackPx, upper: true, scaleMax: 1.05 })
    : fitFont(shown, genre.headline, { maxW: 1600, cap: 150, trackPx, upper: true, scaleMax: 1.02 });
  const wpx = Math.max(1, textWidth(shown, genre.headline, size, { trackPx, upper: true }));
  // The landing overshoot may not push the word out of frame either (hook: LAND_MAX_W; corners: into their 160px margin).
  const over = hook ? Math.min(1.6, LAND_MAX_W / (wpx * 1.05)) : Math.min(1.3, 1 + 280 / wpx);
  const land = interpolate(since, [0, hook ? 5 : 4], [Math.max(1, over), 1], clamp);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      <AbsoluteFill style={{ transform: `translate(${ox}px, ${oy}px) scale(${s})` }}>
        {/* One Sequence per cut: its clip mounts on the cut, rolls from its own offset and unmounts on the next. */}
        <Sequence key={idx} from={start} durationInFrames={end - start} layout="none">
          <Photo src={imgs[idx] ?? clip?.still ?? ''} durFrames={end - start} push={0} clip={clip} />
        </Sequence>
      </AbsoluteFill>
      {intro}
      <AbsoluteFill style={{ background: `rgba(0,0,0,${hook ? 0.45 : intro ? 0.08 : 0.15})` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(0,0,0,0.6) 100%)' }} />
      {op?.hideText ? null : w >= 0 && shown && look.textStyle !== 'box' ? (
        <StyledMontageWord ctx={textCtx(look, genre)} word={shown} since={since} hook={hook} spot={op?.clearEdge === 'top' ? [1, 3][w % 2] : w} />
      ) : w >= 0 && shown ? (
        <AbsoluteFill style={spot as React.CSSProperties}>
          <div
            style={{
              fontFamily: FONT[genre.headline],
              fontSize: size,
              lineHeight: 1,
              letterSpacing: trackPx,
              color: hook ? genre.accent2 : genre.ink,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              transform: `scale(${land})`,
              textShadow: '0 10px 34px rgba(0,0,0,0.85)',
            }}
          >
            {shown}
          </div>
        </AbsoluteFill>
      ) : null}
      {local === 0 && idx > 0 && !intro ? <AbsoluteFill style={{ background: '#fff', opacity: 0.4 }} /> : null}
      {hook && since < 2 ? <AbsoluteFill style={{ background: '#fff', opacity: 0.6 - since * 0.25 }} /> : null}
    </AbsoluteFill>
  );
};

/* ============================================================ pieces */

const Backdrop: React.FC<{
  genre: Genre;
  image?: string;
  layers?: Layers;
  behind?: React.ReactNode;
  durFrames: number;
  focus?: [number, number];
  dim?: number;
  speed?: number;
  plan?: ReframePlan;
  imgW?: number;
  imgH?: number;
  /** Footage wins over depth layers (the engine drops layers on a video scene). */
  clip?: Clip;
  /** A borrowed still's base zoom around `focus` (Photo `crop`). */
  crop?: number;
}> = ({ genre, image, layers, behind, durFrames, focus, dim = 0.35, speed = 1, plan = NO_REFRAME, imgW, imgH, clip, crop }) => (
  <AbsoluteFill>
    <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
    {image || layers || clip ? (
      <>
        {layers && !clip ? (
          <LayeredPhoto
            bg={layers.bg}
            fg={layers.fg}
            box={layers.box}
            durFrames={durFrames}
            speed={speed}
            reframes={plan.frames}
            tight={plan.tight}
            behind={behind}
          />
        ) : (
          <Photo
            src={image ?? clip?.still ?? ''}
            durFrames={durFrames}
            focus={focus}
            speed={speed}
            reframes={plan.frames}
            tight={plan.tight}
            aims={plan.aims}
            imgW={imgW}
            imgH={imgH}
            safeH={genre.letterbox ? FRAME_H - 2 * barPx(genre) - 40 : undefined}
            clip={clip}
            crop={clip ? undefined : crop}
          />
        )}
        <AbsoluteFill
          style={{
            background: `linear-gradient(180deg, rgba(0,0,0,${dim * 0.6}) 0%, rgba(0,0,0,${dim * 0.4}) 40%, rgba(0,0,0,${Math.min(0.9, dim + 0.35)}) 100%)`,
          }}
        />
      </>
    ) : null}
  </AbsoluteFill>
);

/** Letters rise out of a blur one after another — the title never just appears. */
const StaggerText: React.FC<{ text: string; start: number; step?: number; style: React.CSSProperties }> = ({
  text,
  start,
  step = 1.6,
  style,
}) => {
  const f = useCurrentFrame();
  return (
    <div style={{ ...style, whiteSpace: 'nowrap' }}>
      {[...text].map((ch, i) => {
        const at = start + i * step;
        const p = interpolate(f, [at, at + 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * 60}px) scale(${0.9 + p * 0.1})`,
              filter: p < 0.98 ? `blur(${(1 - p) * 10}px)` : undefined,
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** Splits a long title into two lines of similar length (by characters) instead of shrinking it to a whisper. */
function balanceLines(text: string, over = 14): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (text.length <= over || words.length < 2) return [text];
  let best = 1;
  const diff = (k: number) => Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length);
  for (let k = 1; k < words.length; k++) if (diff(k) < diff(best)) best = k;
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/* =============================================================== TITLE */

/** A title scene: the video's name, or — with `chapterCard` — a chapter card the pipeline inserted. */
export const Title: React.FC<Common & { scene: TitleScene }> = (props) =>
  props.scene.chapterCard ? <TopicChapterCard {...props} /> : <PlainTitle {...props} />;

/** A chapter card in the topic's motif (src/topic/cards.tsx) when the script has one; the look's own otherwise. */
const TopicChapterCard: React.FC<Common & { scene: TitleScene }> = (props) => {
  const topic = useTopic();
  const { fps } = useVideoConfig();
  return topic ? (
    <MotifChapterCard t={topic} scene={props.scene} genre={props.genre} durFrames={props.durFrames} locale={props.locale} land={Math.round(CHAPTER_LAND * fps)} />
  ) : (
    <ChapterCard {...props} />
  );
};

const PlainTitle: React.FC<Common & { scene: TitleScene }> = ({ scene, genre, durFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const look = useLook();
  // A text style re-sets the title (depth-split titles keep their tuck-behind layout).
  const styled = look.textStyle !== 'box' && !scene.layers;
  const kick = spring({ frame: f - 2, fps, config: { damping: 18 } });
  const line = interpolate(f, [8, 26], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const tracking = interpolate(f, [0, durFrames], [genre.look === 'glow' ? 18 : 4, genre.look === 'glow' ? 24 : 10], clamp);
  const doc = genre.look === 'label';
  const bar = barPx(genre);
  // A seeded/uploaded script may lack a title: fall back to the kicker instead of crashing the render.
  const titleText = String(scene.title ?? '').trim() || scene.kicker || ' ';
  /*
   * One line, always inside the frame. "BAŞARILI BAŞARISIZLIK" in Exo at a
   * fixed 180px ran ~600px off both edges (Apollo 13 test): every line is
   * sized from the font's real widths at the end-of-shot tracking.
   */
  const maxTrack = genre.look === 'glow' ? 24 : 10;
  const titleLines = balanceLines(titleText);
  const cap = scene.layers ? 260 : 180;
  const fitSize = Math.min(
    ...titleLines.map((t) => fitFont(t, genre.headline, { maxW: FRAME_W - 220, cap, trackPx: maxTrack, upper: true, scaleMax: 1.02 })),
  );
  const titleStyle: React.CSSProperties = {
    fontFamily: FONT[genre.headline],
    fontWeight: 800,
    fontSize: fitSize,
    lineHeight: 1,
    letterSpacing: tracking,
    color: genre.titleInk ?? (doc ? genre.accent : genre.ink),
    textTransform: 'uppercase',
    textShadow:
      genre.look === 'glow'
        ? `0 0 50px ${genre.accent}cc, 0 0 12px #000`
        : doc
          ? `0 10px 0 ${genre.accent2}, 0 18px 40px rgba(0,0,0,0.7)`
          : `0 0 40px ${genre.accent}55`,
  };
  /*
   * With depth layers the title goes BEHIND the person. A centred subject
   * would eat the middle of the line ("GERÇ…KÂYESİ"), so the title splits
   * around them: first half ends just inside their left edge, second half
   * starts just inside their right — the shoulders tuck over the inner
   * letters, the head stays clear, and both words still read.
   */
  const box = scene.layers?.box;
  const words = titleText.split(/\s+/).filter(Boolean);
  const split = !!box && words.length >= 2 && box[2] - box[0] < 0.6 && box[0] > 0.12 && box[2] < 0.88;
  const TUCK = 70;
  let behind: React.ReactNode = null;
  let splitKicker: React.CSSProperties | null = null;
  if (scene.layers && split && box) {
    const half = Math.ceil(words.length / 2);
    const L = words.slice(0, half).join(' ');
    const R = words.slice(half).join(' ');
    const leftEdge = box[0] * FRAME_W + TUCK;
    const rightEdge = box[2] * FRAME_W - TUCK;
    // Tracking scales with the type (a fixed 24px swallowed half the gap at small sizes).
    const trackEm = genre.look === 'glow' ? 0.06 : 0.02;
    const fit = (text: string, room: number) => fitFont(text, genre.headline, { maxW: room - 60, cap: 250, trackEm, upper: true });
    const size = Math.min(fit(L, leftEdge), fit(R, FRAME_W - rightEdge));
    const top = Math.max(bar + 90, Math.round(FRAME_H * 0.4 - size / 2));
    const sized = { ...titleStyle, fontSize: size, letterSpacing: size * trackEm, whiteSpace: 'nowrap' as const };
    behind = (
      <AbsoluteFill>
        <div style={{ position: 'absolute', top, right: FRAME_W - leftEdge, textAlign: 'right' }}>
          <StaggerText text={L} start={5} style={sized} />
        </div>
        <div style={{ position: 'absolute', top, left: rightEdge }}>
          <StaggerText text={R} start={9} style={sized} />
        </div>
      </AbsoluteFill>
    );
    splitKicker = { position: 'absolute', top: top - 70, left: 60, whiteSpace: 'nowrap', letterSpacing: 8 };
  } else if (scene.layers) {
    // Same balanced lines as the plain title: fontSize was fitted to the longer LINE, not the whole title.
    behind = (
      <AbsoluteFill style={{ ...BOX, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 190 + bar * 0.5 }}>
        {titleLines.map((t, i) => (
          <StaggerText key={i} text={t} start={5 + i * 6} style={{ ...titleStyle, marginTop: i ? 8 : 0 }} />
        ))}
      </AbsoluteFill>
    );
  }
  // When the title fell back to the kicker, do not print the same words twice.
  const kickerText = String(scene.title ?? '').trim() ? scene.kicker : undefined;
  const kickerSize = kickerText ? fitFont(kickerText, genre.body, { maxW: FRAME_W - 220, cap: 30, trackPx: 12, upper: true }) : 30;
  return (
    <AbsoluteFill>
      <Backdrop
        genre={genre}
        image={scene.image}
        layers={scene.layers}
        behind={behind}
        durFrames={durFrames}
        dim={0.5}
        imgW={scene.imgW}
        imgH={scene.imgH}
        clip={clipOf(scene)}
        focus={scene.crop ? (scene as { focus?: [number, number] }).focus : undefined}
        crop={scene.crop}
      />
      <LightLeak color={genre.accent} strength={genre.leak * 2.2} seed="title" />
      {styled ? (
        <StyledTitle ctx={textCtx(look, genre)} title={titleText} kicker={kickerText} durFrames={durFrames} />
      ) : (
      <AbsoluteFill
        style={{
          ...BOX,
          justifyContent: scene.layers ? 'flex-start' : 'center',
          alignItems: 'center',
          paddingTop: scene.layers ? 120 + bar * 0.5 : 0,
        }}
      >
        {kickerText ? (
          <div
            style={{
              ...(splitKicker ?? {}),
              fontFamily: FONT[genre.body],
              fontWeight: 800,
              fontSize: kickerSize,
              letterSpacing: 12,
              color: doc ? genre.labelInk : genre.ink,
              background: doc ? genre.labelBg : 'transparent',
              padding: doc ? '6px 18px 4px' : 0,
              opacity: kick,
              transform: `translateY(${(1 - kick) * 18}px) rotate(${doc ? -1.5 : 0}deg)`,
              marginBottom: 22,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {kickerText}
          </div>
        ) : null}
        {scene.layers ? null : (
          <>
            {titleLines.map((t, i) => (
              <StaggerText key={i} text={t} start={5 + i * 6} style={{ ...titleStyle, marginTop: i ? 8 : 0 }} />
            ))}
          </>
        )}
      </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* ======================================================== CHAPTER CARD */

/**
 * The structural reset of a long video (LEMMiNO / MagnatesMedia style): a
 * breath with no narration where the music comes up. The next shot sits
 * behind it blurred, darkened and framed differently; a huge ghost numeral
 * drifts at the back; in front, the chapter number stamps in (after the
 * signature transition has cleared), a thin rule draws out and the chapter
 * title rises letter by letter. Each look speaks its own language:
 *  - label (documentary, inspire): a printed label with the number; crime a
 *    red rubber stamp on the case file
 *  - glow (horror, epic, science): the number inside a ring that draws
 *    itself — horror stutters it in, epic doubles the ring, science ticks a dial
 *  - terminal (finance): "[ BÖLÜM 03 ]" typed out with a block cursor
 */
const ChapterCard: React.FC<Common & { scene: TitleScene }> = ({ scene, genre, durFrames, locale }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const look = genre.look;
  const land = Math.round(CHAPTER_LAND * fps);
  const kickerDigits = String(scene.kicker ?? '').match(/\d+/)?.[0];
  const no = scene.chapterNo ?? (scene.chapter != null ? scene.chapter + 1 : kickerDigits ? Number(kickerDigits) : 1);
  const num = String(no).padStart(2, '0');
  const word =
    String(scene.kicker ?? '')
      .replace(/\d+/g, '')
      .replace(/[.:#–—-]+/g, ' ')
      .trim() || (locale.toLowerCase().startsWith('tr') ? 'BÖLÜM' : 'CHAPTER');
  const title = String(scene.title ?? '').trim();
  const ink = genre.titleInk ?? genre.ink;

  const lines = title ? balanceLines(title, 18) : [];
  const trackEm = look === 'glow' ? 0.08 : look === 'terminal' ? 0.03 : 0.02;
  const tCap = lines.length > 1 ? 118 : 138;
  const tSize = lines.length
    ? Math.min(...lines.map((l) => fitFont(l, genre.headline, { maxW: 1600, cap: tCap, trackEm, upper: true, scaleMax: 1.04 })))
    : tCap;
  const titleW = Math.max(0, ...lines.map((l) => textWidth(l, genre.headline, tSize, { trackEm, upper: true })));
  const ruleW = Math.min(1500, Math.max(560, titleW + 160));
  /*
   * Horror and epic spell the title out slowly — but the card is only 2.8s:
   * the last letter must be up (+9 frames to settle) with ~0.6s left to read
   * the whole line, so a long title gets a quicker hand instead of being cut
   * off mid-word.
   */
  const longest = Math.max(1, ...lines.map((l) => [...l].length));
  const lastStart = land + 6 + Math.max(0, lines.length - 1) * 5;
  const stepRoom = (durFrames - Math.round(0.6 * fps) - 9 - lastStart) / longest;
  const step = Math.max(0.4, Math.min(genre.id === 'horror' ? 2.2 : genre.id === 'epic' ? 1.8 : 1.2, stepRoom));

  const creep = interpolate(f, [0, durFrames], [1, 1.03], clamp);
  const stamp = interpolate(f, [land, land + 5], [1.5, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const stampO = interpolate(f, [land - 1, land + 1], [0, 1], clamp);
  const rule = interpolate(f, [land + 2, land + 22], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const kick = interpolate(f, [land + 4, land + 16], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const ghostO = interpolate(f, [0, 20], [0, 1], clamp);
  const ghostS = interpolate(f, [0, durFrames], [1, 1.08], clamp);
  const ghostSize = fitFont(num, genre.headline, { maxW: 1400, cap: 620, scaleMax: 1.08 });

  const titleShadow =
    look === 'glow'
      ? `0 0 44px ${genre.accent}99, 0 0 10px #000`
      : look === 'terminal'
        ? `0 0 30px ${genre.accent}55, 0 2px 10px #000`
        : '0 6px 0 rgba(0,0,0,0.35), 0 0 40px rgba(0,0,0,0.65)';
  const titleBlock = lines.map((t, i) => (
    <StaggerText
      key={i}
      text={t}
      start={land + 6 + i * 5}
      step={step}
      style={{
        fontFamily: FONT[genre.headline],
        fontWeight: 800,
        fontSize: tSize,
        lineHeight: 1.04,
        letterSpacing: `${trackEm}em`,
        color: ink,
        textTransform: 'uppercase',
        textShadow: titleShadow,
        marginTop: i ? 10 : 0,
      }}
    />
  ));
  const kickerStyle: React.CSSProperties = {
    fontFamily: FONT[genre.body],
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    opacity: kick,
  };

  let badge: React.ReactNode;
  let ruleEl: React.ReactNode;
  if (look === 'glow') {
    const R = 84;
    const S = R * 2 + 48;
    const ring = interpolate(f, [land - 6, land + 12], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    const numP = interpolate(f, [land, land + 8], [0, 1], clamp);
    // Horror: the number stutters on like a failing bulb.
    const stutter = genre.id === 'horror' ? ([1, 0.1, 0.9, 0.25, 1][f - land] ?? (f < land ? 0 : 1)) : 1;
    badge = (
      <div style={{ position: 'relative', width: S, height: S, marginBottom: 26, transform: `scale(${0.94 + 0.06 * ring})` }}>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: `drop-shadow(0 0 10px ${genre.accent})` }}>
          <circle
            cx={S / 2}
            cy={S / 2}
            r={R}
            fill="none"
            stroke={genre.accent}
            strokeWidth={2.5}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - ring}
            transform={`rotate(-90 ${S / 2} ${S / 2})`}
          />
          {genre.id === 'epic' ? (
            <circle cx={S / 2} cy={S / 2} r={R - 11} fill="none" stroke={genre.accent} strokeWidth={1} opacity={0.55 * ring} />
          ) : null}
          {genre.id === 'science'
            ? Array.from({ length: 36 }, (_, i) => {
                const a = ((i * 10 + f * 0.6) * Math.PI) / 180;
                const r0 = R + 9;
                const r1 = R + (i % 3 === 0 ? 20 : 14);
                return (
                  <line
                    key={i}
                    x1={S / 2 + Math.cos(a) * r0}
                    y1={S / 2 + Math.sin(a) * r0}
                    x2={S / 2 + Math.cos(a) * r1}
                    y2={S / 2 + Math.sin(a) * r1}
                    stroke={genre.accent}
                    strokeWidth={1.5}
                    opacity={ring * (i % 3 === 0 ? 0.8 : 0.4)}
                  />
                );
              })
            : null}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT[genre.headline],
            fontWeight: 800,
            fontSize: 80,
            letterSpacing: '0.04em',
            color: ink,
            opacity: numP * stutter,
            filter: numP < 0.98 ? `blur(${(1 - numP) * 8}px)` : undefined,
            textShadow: `0 0 28px ${genre.accent}, 0 0 8px #000`,
          }}
        >
          {num}
        </div>
      </div>
    );
    ruleEl = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 26, width: ruleW, marginBottom: 30 }}>
        <div style={{ flex: 1 }} />
        {genre.id === 'epic' ? <div style={{ width: 10, height: 10, background: genre.accent, transform: 'rotate(45deg)', opacity: rule }} /> : null}
        <div style={{ ...kickerStyle, fontWeight: 600, fontSize: 30, letterSpacing: '0.45em', marginRight: '-0.45em', color: genre.ink, textShadow: '0 2px 12px #000' }}>
          {word}
        </div>
        {genre.id === 'epic' ? <div style={{ width: 10, height: 10, background: genre.accent, transform: 'rotate(45deg)', opacity: rule }} /> : null}
        <div style={{ flex: 1 }} />
      </div>
    );
  } else if (look === 'terminal') {
    const tag = `[ ${word} ${num} ]`;
    const typed = Math.max(0, Math.min(tag.length, Math.floor((f - land + 2) / 1.3)));
    const blink = typed < tag.length || Math.floor(f / 8) % 2 === 0;
    badge = (
      <div
        style={{
          fontFamily: FONT.plexMono,
          fontWeight: 600,
          fontSize: 36,
          letterSpacing: '0.12em',
          color: genre.accent,
          whiteSpace: 'pre',
          marginBottom: 22,
          textShadow: `0 0 18px ${genre.accent}88`,
          opacity: stampO,
        }}
      >
        {tag.slice(0, typed)}
        <span style={{ display: 'inline-block', width: '0.6em', height: '0.95em', marginLeft: 4, verticalAlign: '-0.12em', background: genre.accent, opacity: blink ? 0.9 : 0 }} />
      </div>
    );
    // No glowing scan line under the title: the typed tag carries the card (user: thin lines read as template).
    ruleEl = null;
  } else {
    const crime = genre.id === 'crime';
    const soft = genre.id === 'inspire';
    badge = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginBottom: 34 }}>
        <div
          style={{
            ...kickerStyle,
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: '0.32em',
            marginRight: '-0.32em',
            color: genre.ink,
            transform: `translateX(${(1 - kick) * -30}px)`,
            textShadow: '0 2px 12px rgba(0,0,0,0.85)',
          }}
        >
          {word}
        </div>
        {crime ? (
          // A red rubber stamp on the case file.
          <div
            style={{
              border: `6px solid ${genre.accent2}`,
              color: genre.accent2,
              fontFamily: FONT[genre.headline],
              fontSize: 108,
              lineHeight: 1,
              padding: '8px 22px 0',
              opacity: stampO * 0.92,
              transform: `scale(${stamp}) rotate(-6deg)`,
              boxShadow: `inset 0 0 0 2px ${genre.accent2}55`,
              textShadow: '0 0 1px rgba(0,0,0,0.4)',
            }}
          >
            {num}
          </div>
        ) : (
          <div
            style={{
              background: genre.labelBg,
              color: genre.labelInk,
              fontFamily: FONT[genre.headline],
              fontWeight: 800,
              fontSize: 96,
              lineHeight: 1,
              padding: '10px 26px 4px',
              borderRadius: soft ? 6 : 0,
              opacity: stampO,
              transform: `scale(${stamp}) rotate(-2.5deg)`,
              boxShadow: soft ? '0 14px 34px rgba(0,0,0,0.45)' : `0 9px 0 ${genre.accent2}, 0 20px 40px rgba(0,0,0,0.5)`,
            }}
          >
            {num}
          </div>
        )}
      </div>
    );
    // No bar under the chapter title: a thin rule read as a template (user, 1929 "THE RECKONING").
    ruleEl = null;
  }

  return (
    <AbsoluteFill>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      {scene.image || scene.video ? (
        <SoftPlate
          src={scene.image ?? ''}
          clip={clipOf(scene)}
          dim={look === 'label' ? 0.42 : 0.3}
          blur={7}
          zoom={1.3}
          focus={[no % 2 ? 0.3 : 0.7, 0.62]}
          durFrames={durFrames}
        />
      ) : null}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.72) 100%)' }} />
      <LightLeak color={genre.accent} strength={genre.leak * 1.5} seed={`ch${no}`} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div
          style={{
            fontFamily: look === 'terminal' ? FONT.plexMono : FONT[genre.headline],
            fontWeight: 800,
            fontSize: ghostSize,
            lineHeight: 1,
            color: look === 'label' ? genre.ink : 'transparent',
            WebkitTextStroke: look === 'label' ? undefined : `2px ${genre.accent}`,
            opacity: ghostO * (look === 'label' ? 0.08 : 0.2),
            transform: `translateY(-20px) scale(${ghostS})`,
            textShadow: look === 'glow' ? `0 0 40px ${genre.accent}55` : undefined,
            whiteSpace: 'nowrap',
          }}
        >
          {num}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${creep})` }}>
        {badge}
        {look === 'glow' ? ruleEl : null}
        {titleBlock}
        {look === 'glow' ? null : ruleEl}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ================================================================ SLAM */

/**
 * The "STOLEN" beat. Air on the photo -> the word lands in ONE frame, bigger
 * than its resting size, with two ghost echoes blowing outwards -> the red
 * hand-drawn underline starts 2 frames later -> the context line ~0.7s after.
 * With a voice track the landing frame is the spoken word itself.
 */
export const Slam: React.FC<Common & { scene: SlamScene }> = ({ scene, genre, durFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hit = slamFrame(scene, fps);
  const since = f - hit;
  // An opening treatment that sets the word itself (headlines) leaves the slam its picture and its flash.
  const opText = useOpening()?.hideText;
  const landed = since >= 0 && !opText;
  const look = useLook();
  // A text style sets the word in front (the depth layers still move behind it).
  const layered = !!scene.layers && look.textStyle === 'box';
  const layerK = layered ? 1.25 : 1;

  /*
   * Sized so the word never leaves the frame: at rest it fits 1720px at its
   * largest sustained scale (drift 1.06 x layered 1.25 x the engine's +5%
   * impact punch); tracking scales with the size (0.05em glow) instead of a
   * fixed 14px. The 4-frame landing overshoot is clamped to LAND_MAX_W.
   */
  const trackEm = genre.look === 'glow' ? 0.05 : 0.012;
  const word = String(scene.word ?? '');
  const fontSize = fitFont(word, genre.headline, { maxW: 1720, cap: 260, scaleMax: 1.06 * layerK * 1.05, trackEm, upper: true, min: 60 });
  const wordW = Math.max(1, textWidth(word, genre.headline, fontSize, { trackEm, upper: true }));
  const over = Math.max(1, Math.min(1.28, LAND_MAX_W / (wordW * layerK * 1.05)));
  const size = landed ? interpolate(since, [0, 4], [over, 1], { ...clamp, easing: Easing.out(Easing.quad) }) : 1;
  const underline = interpolate(since, [2, 20], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const sub = spring({ frame: since - Math.round(0.7 * fps), fps, config: { damping: 14, stiffness: 180 } });
  const drift = landed ? interpolate(since, [0, durFrames], [1, 1.06], clamp) : 1;

  const wordColor = genre.look === 'terminal' ? genre.ink : genre.accent;
  const wordStyle: React.CSSProperties = {
    fontFamily: FONT[genre.headline],
    fontWeight: 800,
    fontSize,
    lineHeight: 0.9,
    textTransform: 'uppercase',
    letterSpacing: `${trackEm}em`,
    whiteSpace: 'nowrap',
  };
  const subSize = scene.sub ? fitFont(scene.sub, genre.body, { maxW: 1700, cap: layered ? 54 : 50 }) : 50;
  /*
   * The underline hangs BELOW the baseline. It used to be pinned 40px under
   * the line box with a height that grows with the word's width, so on a long
   * word (DOLANDIRILDILAR, ~1700px) its crest rose 20-50px into the letters —
   * a strike-through in Playfair/Cinzel/Exo, whose caps sit low in the box.
   * One viewBox unit is ulK px; the stroke's top edge (y=10) sits ulGap below
   * the box, and the context line clears its lowest edge (y=56).
   */
  const ulK = (1.08 * wordW) / 1000;
  const ulGap = Math.max(8, Math.round(fontSize * 0.06));
  const subGap = Math.round(ulGap + 46 * ulK + 22);

  const echoes = [1, 2].map((k) => {
    const g = interpolate(since, [0, 10 + k * 3], [0, 1], clamp);
    if (g >= 1) return null;
    return (
      <div
        key={k}
        style={{
          ...wordStyle,
          position: 'absolute',
          inset: 0,
          color: 'transparent',
          WebkitTextStroke: `3px ${genre.accent}`,
          transform: `scale(${1 + g * (0.35 + k * 0.2)})`,
          opacity: (1 - g) * 0.7,
        }}
      >
        {word}
      </div>
    );
  });
  const face = (
    <div
      style={{
        ...wordStyle,
        color: wordColor,
        textShadow: genre.look === 'glow' ? `0 0 60px ${genre.accent}, 0 0 10px #000` : `0 10px 0 rgba(0,0,0,0.45), 0 0 50px rgba(0,0,0,0.6)`,
      }}
    >
      {word}
    </div>
  );

  /*
   * With depth layers the word lands BEHIND the person: it reads as part of
   * the scene rather than a caption stamped on top. The underline is dropped
   * there (the figure would cut it in half); the context line stays in front.
   */
  if (layered) {
    const wordBlock = (
      <div style={{ position: 'relative', transform: `scale(${size * drift * layerK})` }}>
        {echoes}
        {face}
      </div>
    );
    return (
      <AbsoluteFill>
        <Backdrop
          genre={genre}
          layers={scene.layers}
          durFrames={durFrames}
          dim={landed ? 0.35 : 0.2}
          behind={landed ? <AbsoluteFill style={{ ...BOX, justifyContent: 'center', alignItems: 'center', paddingBottom: 180 }}>{wordBlock}</AbsoluteFill> : null}
        />
        {landed && scene.sub ? (
          <AbsoluteFill style={{ ...BOX, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: genre.letterbox ? 200 : 140 }}>
            <div
              style={{
                fontFamily: FONT[genre.body],
                fontWeight: 700,
                fontSize: subSize,
                color: genre.ink,
                opacity: sub,
                whiteSpace: 'nowrap',
                transform: `translateY(${(1 - sub) * 20}px)`,
                textShadow: '0 2px 14px rgba(0,0,0,0.95)',
              }}
            >
              {scene.sub}
            </div>
          </AbsoluteFill>
        ) : null}
        {since === 0 ? <AbsoluteFill style={{ background: '#fff', opacity: 0.5, mixBlendMode: 'screen' }} /> : null}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Backdrop
        genre={genre}
        image={scene.image}
        layers={scene.layers}
        durFrames={durFrames}
        dim={landed ? 0.5 : 0.25}
        imgW={scene.imgW}
        imgH={scene.imgH}
        clip={clipOf(scene)}
        focus={scene.crop ? (scene as { focus?: [number, number] }).focus : undefined}
        crop={scene.crop}
      />
      {landed && look.textStyle !== 'box' ? (
        <StyledSlam ctx={textCtx(look, genre)} word={word} sub={scene.sub} since={since} durFrames={durFrames} subAt={Math.round(0.7 * fps)} />
      ) : landed ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ position: 'relative', transform: `scale(${size * drift})` }}>
            {/* Ghost echoes: two copies blowing outwards and fading. */}
            {echoes}
            {face}
            <svg viewBox="0 0 1000 60" style={{ position: 'absolute', left: '-4%', width: '108%', top: '100%', marginTop: ulGap - 10 * ulK, overflow: 'visible' }}>
              <path
                d="M10 40 C 170 18, 330 50, 520 30 S 860 16, 990 36"
                fill="none"
                stroke={genre.look === 'glow' ? genre.accent : genre.accent2}
                strokeWidth={12}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - underline}
              />
            </svg>
          </div>
          {scene.sub ? (
            <div
              style={{
                marginTop: subGap,
                fontFamily: FONT[genre.body],
                fontWeight: 600,
                fontSize: subSize,
                color: genre.ink,
                opacity: sub,
                whiteSpace: 'nowrap',
                transform: `translateY(${(1 - sub) * 20}px)`,
                textShadow: '0 2px 14px rgba(0,0,0,0.9)',
              }}
            >
              {scene.sub}
            </div>
          ) : null}
        </AbsoluteFill>
      ) : null}
      {/* One white frame on impact. */}
      {since === 0 ? <AbsoluteFill style={{ background: '#fff', opacity: 0.5, mixBlendMode: 'screen' }} /> : null}
    </AbsoluteFill>
  );
};

/* ============================================================= COUNTER */

/**
 * Is this counter a year? The script can say so (`year`); otherwise an
 * integer 1000-2100 with no prefix, suffix or decimals (and no start below
 * 1000) is read as one — unless its label names what is being counted.
 * "1453" must never render as "1.453", nor "1.178 filika yeri" as "1178".
 * (Short ambiguous nouns — ev, oy, gün, yer — are left out on purpose:
 * "FETİH GÜNÜ" is a year label.)
 */
export function counterIsYear(scene: CounterScene): boolean {
  if (typeof scene.year === 'boolean') return scene.year;
  const to = scene.to;
  const from = scene.from;
  const numeric =
    (scene.decimals ?? 0) === 0 &&
    !String(scene.prefix ?? '').trim() &&
    !String(scene.suffix ?? '').trim() &&
    Number.isInteger(to) &&
    to >= 1000 &&
    to <= 2100 &&
    (from == null || (from >= 1000 && from <= 2100));
  if (!numeric) return false;
  // "1.178 FİLİKA YERİ", "2.000 ASKER": the label names what is counted, so it is a quantity, not a year.
  const label = String(scene.label ?? '').toLocaleLowerCase(textLocale());
  return !(label && !YEAR_LABEL.test(label) && COUNT_LABEL.test(label));
}

const COUNT_LABEL =
  /(^|[^\p{L}])(kişi|insan|nüfus|asker|yolcu|mürettebat|ölü|kurban|yaralı|çalışan|işçi|personel|gemi|filika|araç|araba|uçak|tank|bina|şirket|mağaza|şube|adet|tane|ton|kilo|kg|km|kilometre|metre|dolar|lira|euro|sterlin|altın|puan|hisse|koltuk|saat|dakika|saniye|kez|defa|people|soldiers|troops|passengers|ships|boats|dollars|points|miles|days|hours|lives|seats|deaths|victims|employees|stores)/u;
const YEAR_LABEL = /(^|[^\p{L}])(yıl|sene|tarih|year)/u;

/** Where the count starts: a year counts up from ~60 years earlier (1393 -> 1453, not 1162 -> 1453). */
export function counterFrom(scene: CounterScene): number {
  if (scene.from != null && Number.isFinite(scene.from)) return scene.from;
  if (counterIsYear(scene)) return scene.to - 60;
  const d = scene.decimals ?? 0;
  return d ? +(scene.to * 0.8).toFixed(d) : Math.round(scene.to * 0.8);
}

export function formatCount(value: number, scene: CounterScene, locale: string): string {
  if (counterIsYear(scene)) return String(Math.round(value));
  const d = scene.decimals ?? 0;
  return value.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** "MİLYAR", "kişi", "ton" are set small beside the figure; symbols and single letters (%, $, ₺, x, K) stay full size. */
export const isUnitWord = (s?: string) => (String(s ?? '').match(/\p{L}/gu)?.length ?? 0) >= 2;
export const UNIT = 0.4;
export const UNIT_TRACK = 0.06;
export const UNIT_GAP = 0.14;

/**
 * Width of the counter line in em of the number size, and the size that keeps
 * the whole box (80px padding each side) within `boxMax`.
 */
export function counterFit(scene: CounterScene, locale: string, font: FontKey, boxMax: number): { size: number; lineEm: number } {
  const em = (s: string) => (s ? textWidth(s, font, 100) / 100 : 0);
  const unitEm = (s: string) => (textWidth(s.trim(), font, 100, { trackEm: UNIT_TRACK }) / 100) * UNIT + UNIT_GAP;
  const numEm = Math.max(em(formatCount(counterFrom(scene), scene, locale)), em(formatCount(scene.to, scene, locale)));
  const pre = scene.prefix ?? '';
  const suf = scene.suffix ?? '';
  const lineEm = numEm + (pre ? (isUnitWord(pre) ? unitEm(pre) : em(pre)) : 0) + (suf ? (isUnitWord(suf) ? unitEm(suf) : em(suf)) : 0);
  const size = Math.floor(Math.min(230, (boxMax - 160) / (Math.max(0.5, lineEm) * 1.03)));
  return { size, lineEm };
}

/**
 * A counter in its treatment (src/looks/counters.ts picks it per scene): the
 * original box below, or one of src/counterStyles.tsx.
 */
export const Counter: React.FC<Common & { scene: CounterScene }> = (props) => {
  const style = useLook().counterStyle;
  return style && style !== 'box' ? <StyledCounter {...props} style={style} /> : <BoxCounter {...props} />;
};

const BoxCounter: React.FC<Common & { scene: CounterScene }> = ({ scene, genre, locale, durFrames, speed }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const font = genre.headline;
  /*
   * Size: the whole string — prefix, the wider of the start/end figure,
   * suffix — must fit at the largest scale the box reaches before any
   * cut-in: mood creep x the 1.07 pop x the engine's counter punch.
   */
  const creepMax = 1 + 0.07 * speed;
  const boxMax = 1800 / (creepMax * 1.07 * 1.03);
  const { size, lineEm } = counterFit(scene, locale, font, boxMax);
  const labelSize = scene.label ? fitFont(scene.label, genre.body, { maxW: boxMax - 160, cap: 46, trackPx: 6, upper: true }) : 0;
  const labelW = scene.label ? textWidth(scene.label, genre.body, labelSize, { trackPx: 6, upper: true }) : 0;
  const boxW = Math.max(lineEm * size * 1.03, labelW) + 160;
  /*
   * When narration stretches a counter past its count, the number would sit
   * frozen for seconds. The camera keeps working instead: a slow creep, and
   * seeded cut-ins onto the box — never so tight that a wide number leaves
   * the frame (a short year gets the full cut-in, "13,8 MİLYAR" a gentle one).
   */
  const plan = planFor(scene, durFrames, fps);
  const tightMax = 1840 / (boxW * creepMax);
  const tightK = Math.min(plan.tight, tightMax);
  const reframes = tightK >= 1.08 ? plan.frames : [];
  const tight = reframes.filter((r) => f >= r).length % 2 === 1;
  const cam = interpolate(f, [0, durFrames], [1, 1 + 0.07 * speed], clamp) * (tight ? tightK : 1);
  // The count lasts as long as the narrator takes to say the number (it lands on its last word).
  const end = counterCountEnd(scene, fps);
  const from = counterFrom(scene);
  const t = interpolate(f, [3, end], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const value = from + (scene.to - from) * t;
  const text = formatCount(value, scene, locale);
  const box = interpolate(f, [0, 6, 10], [0.5, 1.07, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const settle = f >= end ? interpolate(f - end, [0, 3, 8], [1, 1.06, 1], clamp) : 1;
  // Vertical smear while the digits are spinning fast — reads as motion blur.
  const spin = 1 - t;
  const smear = spin > 0.05 ? `0 ${spin * 14}px ${spin * 10}px currentColor` : 'none';

  const doc = genre.look === 'label';
  const numberColor = doc ? genre.labelInk : genre.accent;
  const pre = scene.prefix ?? '';
  const suf = scene.suffix ?? '';
  const unitStyle = (side: 'pre' | 'suf'): React.CSSProperties => ({
    fontSize: size * UNIT,
    letterSpacing: `${UNIT_TRACK}em`,
    textTransform: 'uppercase',
    whiteSpace: 'pre',
    [side === 'pre' ? 'marginRight' : 'marginLeft']: size * UNIT_GAP,
    textShadow: 'none',
  });
  return (
    <AbsoluteFill>
      <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
      <LightLeak color={genre.accent} strength={genre.leak} seed={`c${scene.to}`} />
      {/* Scattered decorative marks drifting behind the box. */}
      {doc
        ? Array.from({ length: 10 }, (_, i) => {
            const x = random(`mx${i}${scene.to}`) * 100;
            const y = random(`my${i}${scene.to}`) * 100;
            const r = random(`mr${i}${scene.to}`) * 40 - 20;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${x}%`,
                  top: `${y + Math.sin((f + i * 20) / 30) * 1.5}%`,
                  fontFamily: FONT[genre.headline],
                  fontSize: 70,
                  color: genre.accent,
                  opacity: 0.18,
                  transform: `rotate(${r}deg)`,
                }}
              >
                ✦
              </div>
            );
          })
        : null}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `scale(${cam})` }}>
        <div
          style={{
            background: doc ? genre.labelBg : 'rgba(0,0,0,0.35)',
            border: doc ? 'none' : `2px solid ${genre.accent}55`,
            padding: '30px 80px 22px',
            transform: `scale(${box * settle}) rotate(${doc ? -1.2 : 0}deg)`,
            textAlign: 'center',
            boxShadow: doc ? `0 16px 0 ${genre.accent2}, 0 30px 60px rgba(0,0,0,0.6)` : `0 0 60px ${genre.accent}22`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
              fontFamily: FONT[font],
              fontWeight: 700,
              fontSize: size,
              lineHeight: 1,
              color: numberColor,
              fontVariantNumeric: 'tabular-nums',
              textShadow: genre.look === 'terminal' ? `0 0 50px ${genre.accent}88, ${smear}` : smear,
            }}
          >
            {pre ? <span style={isUnitWord(pre) ? unitStyle('pre') : { whiteSpace: 'pre' }}>{isUnitWord(pre) ? pre.trim() : pre}</span> : null}
            <span style={{ whiteSpace: 'pre' }}>{text}</span>
            {suf ? <span style={isUnitWord(suf) ? unitStyle('suf') : { whiteSpace: 'pre' }}>{isUnitWord(suf) ? suf.trim() : suf}</span> : null}
          </div>
          {scene.label ? (
            <div
              style={{
                fontFamily: FONT[genre.body],
                fontWeight: 800,
                fontSize: labelSize,
                letterSpacing: 6,
                color: doc ? genre.labelInk : genre.ink,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                marginTop: 10,
              }}
            >
              {scene.label}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* =============================================================== PHOTO */

/**
 * Name super. Fitted to its width, lifted above a caption when both are on
 * screen, and on a long hold it leaves after ~5s like a broadcast super does
 * instead of sitting on the picture for the whole scene. Which scene carries
 * it (first appearance only, the right person) is the pipeline's call.
 */
const LowerThird: React.FC<{ genre: Genre; name: string; role?: string; durFrames: number; lift?: number; at?: number | null }> = ({
  genre,
  name,
  role,
  durFrames,
  lift = 0,
  at = null,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // On the name's spoken word (who is this? is answered by the narrator first); unnamed: the broadcast 0.45 s.
  const start = at != null ? Math.max(3, Math.min(at, durFrames - Math.round(1.2 * fps))) : Math.round(0.45 * fps);
  const out = start + Math.round(5 * fps);
  const leaves = durFrames - out > Math.round(0.8 * fps);
  const gone = leaves ? interpolate(f, [out, out + 8], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) }) : 0;
  const bar = Math.min(interpolate(f, [start, start + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) }), 1 - gone);
  const txt = interpolate(f, [start + 5, start + 12], [0, 1], clamp) * (1 - gone);
  const r = Math.min(interpolate(f, [start + 9, start + 16], [0, 1], clamp), 1 - interpolate(f, [out - 4, out + 4], [0, 1], clamp) * (leaves ? 1 : 0));
  const nameSize = fitFont(name, genre.headline, { maxW: 1500, cap: 64, upper: true });
  const roleSize = role ? fitFont(role, genre.body, { maxW: 1500, cap: 30 }) : 30;
  if (bar <= 0 && r <= 0) return null;
  return (
    <div style={{ position: 'absolute', left: 130, bottom: (genre.letterbox ? 190 : 150) + lift }}>
      <div
        style={{
          background: genre.labelBg,
          clipPath: `inset(0 ${100 - bar * 100}% 0 0)`,
          padding: '10px 30px 6px',
          display: 'inline-block',
        }}
      >
        <div
          style={{
            fontFamily: FONT[genre.headline],
            fontWeight: 700,
            fontSize: nameSize,
            color: genre.labelInk,
            textTransform: 'uppercase',
            opacity: txt,
            transform: `translateY(${(1 - txt) * 14}px)`,
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
      </div>
      {role ? (
        <div
          style={{
            background: 'rgba(0,0,0,0.82)',
            color: genre.ink,
            fontFamily: FONT[genre.body],
            fontWeight: 600,
            fontSize: roleSize,
            padding: '8px 30px',
            display: 'table',
            whiteSpace: 'nowrap',
            clipPath: `inset(0 ${100 - Math.max(0, r) * 100}% 0 0)`,
          }}
        >
          {role}
        </div>
      ) : null}
    </div>
  );
};

/* -------------------------------------------------------- collage boards */

interface Slot {
  x: number;
  y: number;
  /** Outer width of the print and the tallest it may get. */
  w: number;
  hMax: number;
  tilt?: number;
}
interface Board {
  main: Slot;
  extras: Slot[];
  /** Extras tucked BEHIND the main print (the fan). */
  behind?: boolean;
}

/*
 * Six boards, so a run of photo scenes walks through different compositions
 * instead of one evidence board with the tilt changed. Every print stays
 * inside y 130..950 even tilted: crime is a collage genre AND letterboxed,
 * and the bars must never cut a card's paper edge.
 */
const BOARDS: ((n: number) => Board)[] = [
  // Evidence board: main left, extras stacked on the right (the original layout).
  (n) => ({
    main: { x: n ? 820 : 960, y: 540, w: n ? 1100 : 1160, hMax: 740 },
    extras: [
      { x: 1530, y: 362, w: 560, hMax: 400 },
      { x: 1530, y: 740, w: 560, hMax: 400 },
    ],
  }),
  // Mirrored: main right, extras stacked on the left.
  (n) => ({
    main: { x: n ? 1100 : 900, y: 540, w: n ? 1100 : 1140, hMax: 740 },
    extras: [
      { x: 390, y: 362, w: 560, hMax: 400 },
      { x: 390, y: 740, w: 560, hMax: 400 },
    ],
  }),
  // Hero print, small cards pinned over its corners.
  (n) => ({
    main: { x: 960, y: 540, w: n ? 1060 : 1180, hMax: 720 },
    extras: [
      { x: 1590, y: 312, w: 430, hMax: 320 },
      { x: 330, y: 780, w: 430, hMax: 320 },
    ],
  }),
  // Two-up: two equal prints side by side, a third overlapping below.
  (n) => ({
    main: { x: n ? 560 : 1000, y: n ? 520 : 545, w: n ? 880 : 1120, hMax: 700 },
    extras: [
      { x: 1360, y: 560, w: 880, hMax: 700 },
      { x: 960, y: 790, w: 460, hMax: 300 },
    ],
  }),
  // Fan: the main print in front, extras tucked behind left and right.
  (n) => ({
    main: { x: 960, y: 560, w: n ? 940 : 1180, hMax: 700 },
    extras: [
      { x: 520, y: 500, w: 680, hMax: 520, tilt: -8 },
      { x: 1400, y: 500, w: 680, hMax: 520, tilt: 8 },
    ],
    behind: true,
  }),
  // Diagonal cascade: main up-left, extras falling to the right.
  (n) => ({
    main: { x: n ? 740 : 900, y: n ? 512 : 545, w: n ? 1040 : 1160, hMax: 680 },
    extras: [
      { x: 1450, y: 700, w: 640, hMax: 450 },
      { x: 1560, y: 320, w: 460, hMax: 330 },
    ],
  }),
];

/** Seeded board per scene index; never the same as either of the two scenes before it. */
const BOARD_CHAIN: number[] = [];
function boardAt(index: number): number {
  for (let k = BOARD_CHAIN.length; k <= index; k++) {
    const banned = [BOARD_CHAIN[k - 1], BOARD_CHAIN[k - 2]];
    const free = BOARDS.map((_, i) => i).filter((i) => !banned.includes(i));
    BOARD_CHAIN.push(free[Math.floor(random(`lay${k}`) * free.length)]);
  }
  return BOARD_CHAIN[index];
}

/**
 * Outer size of a print for an image of aspect `a`, inside its slot — a
 * portrait scan becomes a tall print instead of a centre crop — and never
 * showing the source above 1.5x its own pixels.
 */
function printSize(slot: Slot, a: number, srcW?: number, srcH?: number): { w: number; h: number } {
  const aspect = Math.min(2.2, Math.max(0.6, a));
  let iw = slot.w - 2 * CARD_PAD.side;
  let ih = iw / aspect;
  const maxIh = slot.hMax - CARD_PAD.side - CARD_PAD.bottom;
  if (ih > maxIh) {
    ih = maxIh;
    iw = ih * aspect;
  }
  if (srcW && srcH) {
    const k = Math.min(1, (1.5 * srcW) / iw, (1.5 * srcH) / ih);
    iw *= k;
    ih *= k;
  }
  return { w: Math.round(iw + 2 * CARD_PAD.side), h: Math.round(ih + CARD_PAD.side + CARD_PAD.bottom) };
}

export interface Print {
  x: number;
  y: number;
  w: number;
  h: number;
  tilt?: number;
}

/**
 * The board a collage photo scene is drawn on: which of the six layouts
 * (by scene index when the engine passes one, else seeded by the image),
 * and every print's centre and outer size.
 */
export function collageLayout(
  scene: Pick<PhotoScene, 'image' | 'imgW' | 'imgH'>,
  index: number | undefined,
  extras: number,
): { which: number; main: Print; cards: Print[]; behind: boolean } {
  const which = index != null ? boardAt(index) : Math.floor(random(`lay${scene.image}`) * BOARDS.length);
  const board = BOARDS[which](Math.min(extras, 2));
  const aspect = scene.imgW && scene.imgH ? scene.imgW / scene.imgH : 1.45;
  const main = { x: board.main.x, y: board.main.y, ...printSize(board.main, aspect, scene.imgW, scene.imgH) };
  const cards = Array.from({ length: extras }, (_, i) => {
    const base = board.extras[i % board.extras.length];
    // More extras than the board has slots: a copy of the slot nudged towards the centre, so the pile visibly grows.
    const k = Math.floor(i / board.extras.length);
    const slot = { ...base, x: base.x + (base.x > 960 ? -50 : 50) * k, y: base.y + (base.y > 540 ? -40 : 40) * k };
    return { x: slot.x, y: slot.y, tilt: slot.tilt, ...printSize(slot, 1.45) };
  });
  return { which, main, cards, behind: !!board.behind };
}

/**
 * A photo scene. With `annotate` the shot is wrapped in a freeze & mark
 * (src/devices/annotate.tsx), which is told where the main print sits on a
 * collage board so the mark lands on the picture wherever it is drawn.
 */
export const PhotoScn: React.FC<Common & { scene: PhotoScene }> = (props) => {
  const { scene, genre, durFrames, speed, index } = props;
  if (!scene.annotate) return <PhotoBody {...props} />;
  const clip = clipOf(scene);
  const card = collageOn(genre, scene)
    ? collageLayout(
        { image: scene.image, imgW: clip ? scene.videoW ?? scene.imgW : scene.imgW, imgH: clip ? scene.videoH ?? scene.imgH : scene.imgH },
        index,
        (scene.images ?? []).length,
      ).main
    : null;
  return (
    <Annotated scene={scene} genre={genre} durFrames={durFrames} speed={speed} card={card} safeH={genre.letterbox ? FRAME_H - 2 * barPx(genre) - 40 : undefined}>
      <PhotoBody {...props} />
    </Annotated>
  );
};

const PhotoBody: React.FC<Common & { scene: PhotoScene }> = ({ scene, genre, durFrames, speed, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // The caption waits for its words when the narration says them (never captions what is still to be said).
  const capAt = spokenFrameOf(scene.caption, scene.wordTimes, fps);
  const cap = spring({ frame: f - (capAt != null ? Math.max(Math.round(0.6 * fps), Math.min(capAt, durFrames - Math.round(1.2 * fps))) : Math.round(0.6 * fps)), fps, config: { damping: 15 } });
  const collage = collageOn(genre, scene);
  const plan = planFor(scene, durFrames, fps, genre);
  const reframes = plan.frames;
  const extras = collage ? scene.images ?? [] : [];
  const clip = clipOf(scene);
  // The print is cut to the shape of what it shows: the clip's own size when it is footage.
  const srcW = clip ? scene.videoW ?? scene.imgW : scene.imgW;
  const srcH = clip ? scene.videoH ?? scene.imgH : scene.imgH;
  /*
   * The topic's one way of presenting archive stills (src/topic/presentation.tsx):
   * the whole print on a lightbox / as a print / in a film frame / in a frame.
   * Never on a depth-split, annotated or multi-print scene.
   */
  const topic = useTopic();
  // Presentation styles only the pictures that are NOT full-bleed (portrait, small scans): a landscape picture always fills the frame.
  const objectOnly = clip ? isLowResClip(srcW, srcH) : isLowRes(srcW, srcH);
  const present = topic && scene.present && objectOnly && !scene.layers && !scene.annotate && !extras.length && (scene.image || clip) ? scene.present : null;

  let boardEl: React.ReactNode = null;
  let boardStyle: React.CSSProperties = {};
  if (collage) {
    const board = collageLayout({ image: scene.image, imgW: srcW, imgH: srcH }, index, extras.length);
    const main = board.main;
    const cards = extras.map((src, i) => ({ src, i, slot: board.cards[i], w: board.cards[i].w, h: board.cards[i].h }));
    /*
     * Collage camera: the board itself is the shot. On each reframe the
     * camera cuts in on the next print's subject — main first, then each
     * extra — and back out once it runs out, so a long narration walks the
     * eye across the evidence. Targets come from the board actually drawn,
     * and a small scan is never magnified past ~1.5x its pixels.
     */
    const srcCap = srcW ? Math.max(1.12, (1.5 * srcW) / (main.w - 2 * CARD_PAD.side)) : clip ? 1.3 : Infinity;
    const targets = [
      { x: main.x, y: main.y - main.h * 0.14, s: Math.min(srcCap, Math.max(1.3, Math.min(1.7, 1600 / main.w))) },
      ...cards.map((c) => ({ x: c.slot.x, y: c.slot.y, s: Math.max(1.3, Math.min(1.75, 1600 / c.w)) })),
      { x: 960, y: 540, s: 1 },
    ];
    const passed = reframes.filter((r) => f >= r).length;
    const target = passed ? targets[(passed - 1) % targets.length] : { x: 960, y: 540, s: 1 };
    const since = passed ? f - reframes[passed - 1] : 99;
    // Snap most of the way on the cut, then drift the last few percent.
    const ease = interpolate(since, [0, 4], [0.82, 1], clamp);
    const s = 1 + (target.s - 1) * ease;
    const creep = interpolate(f, [0, durFrames], [1, 1 + 0.05 * speed], clamp);
    /*
     * A cut-in CENTRES its print. Scaling about the print's own point kept it
     * where it sat on the board, so a card near the edge (x=1450) grew straight
     * off the frame and the "close-up" showed half a card. The board layer
     * holds only prints (the pattern stays behind it), so moving the board
     * never exposes an empty edge.
     */
    const S = s * creep;
    const k = target.s > 1 ? (s - 1) / (target.s - 1) : 0;
    const cx = target.x + (960 - target.x) * k;
    const cy = target.y + (540 - target.y) * k;
    boardStyle = { transformOrigin: '0 0', transform: `translate(${cx - target.x * S}px, ${cy - target.y * S}px) scale(${S})` };
    const mainCard = (
      <PhotoCard
        key="main"
        src={scene.image}
        seed={scene.image}
        enterAt={0}
        durFrames={durFrames}
        width={main.w}
        height={main.h}
        x={main.x}
        y={main.y}
        paper={genre.paper}
        focus={scene.focus}
        clip={clip}
      />
    );
    const extraCards = cards.map((c) => (
      <PhotoCard
        key={c.src + c.i}
        src={c.src}
        seed={c.src + c.i}
        enterAt={extraEnter(c.i, fps)}
        durFrames={durFrames}
        width={c.w}
        height={c.h}
        x={c.slot.x}
        y={c.slot.y}
        tilt={c.slot.tilt}
        paper={genre.paper}
        clip={clipOf(scene.clips?.[c.i], c.src)}
      />
    ));
    boardEl = board.behind ? [...extraCards, mainCard] : [mainCard, ...extraCards];
  }

  return (
    <AbsoluteFill>
      {present && topic ? (
        <PresentedPhoto
          t={topic}
          kind={present}
          src={scene.image}
          clip={clip}
          imgW={srcW}
          imgH={srcH}
          focus={scene.focus}
          durFrames={durFrames}
          genre={genre}
          credit={(scene as { credit?: string }).credit}
          seed={scene.image ?? String(index)}
        />
      ) : collage ? (
        <>
          <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
          <LightLeak color={genre.accent} strength={genre.leak} seed={scene.image} />
          <AbsoluteFill style={boardStyle}>{boardEl}</AbsoluteFill>
        </>
      ) : (
        <>
          <PatternBg pattern={genre.pattern} color={genre.accent} bg={genre.bg} />
          {scene.layers && !clip && !scene.annotate ? (
            <LayeredPhoto
              bg={scene.layers.bg}
              fg={scene.layers.fg}
              box={scene.layers.box}
              durFrames={durFrames}
              speed={speed}
              reframes={reframes}
              tight={plan.tight}
              natural={scene.natural}
            />
          ) : (
            <Photo
              src={scene.image}
              durFrames={durFrames}
              natural={scene.natural}
              focus={scene.focus}
              push={0.16}
              speed={speed}
              reframes={reframes}
              tight={plan.tight}
              aims={plan.aims}
              imgW={scene.imgW}
              imgH={scene.imgH}
              safeH={genre.letterbox ? FRAME_H - 2 * barPx(genre) - 40 : undefined}
              clip={clip}
              crop={clip ? undefined : scene.crop}
            />
          )}
          <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,0.7) 100%)' }} />
          {genre.id === 'finance' ? <EraHud genre={genre} /> : null}
        </>
      )}

      {scene.name ? <LowerThird genre={genre} name={scene.name} role={scene.role} durFrames={durFrames} lift={scene.caption ? 110 : 0} at={spokenFrameOf(scene.name, scene.wordTimes, fps)} /> : null}

      {scene.caption ? (
        <AbsoluteFill style={{ ...BOX, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: genre.letterbox ? 170 : 100 }}>
          <div
            style={{
              background: genre.labelBg,
              color: genre.labelInk,
              fontFamily: FONT[genre.body],
              fontWeight: 800,
              fontSize: 42,
              padding: '12px 30px',
              opacity: cap,
              transform: `translateY(${(1 - cap) * 30}px) rotate(${genre.collage ? -1 : 0}deg)`,
              maxWidth: 1300,
              textAlign: 'center',
              boxShadow: genre.collage ? `0 8px 0 ${genre.accent2}` : 'none',
            }}
          >
            {scene.caption}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * The finance photo furniture, by the story's era (script.era). A camcorder /
 * trading-terminal HUD (REC, a volume readout, a scanning line) over a 1929
 * archive photo is an anachronism the viewer sees at once: stories before 1980
 * get a newsreel film gate instead. No era (old scripts, demos) keeps the HUD.
 */
export const HUD_FROM_YEAR = 1980;
const EraHud: React.FC<{ genre: Genre }> = ({ genre }) => {
  const era = useLook().eraStart;
  return era !== undefined && era < HUD_FROM_YEAR ? <NewsreelGate /> : <FinanceHud genre={genre} />;
};

/**
 * A projected newsreel: the rounded film gate with soft dark corners, a faint
 * gate weave, a flickering frame line and, now and then, a scratch — the frame
 * an archive photo of its time would really have been seen through.
 */
const NewsreelGate: React.FC = () => {
  const f = useCurrentFrame();
  const wx = Math.sin(f * 0.9) * 0.8 + (random(`gw${f}`) - 0.5) * 0.8;
  const wy = Math.cos(f * 0.7) * 0.6 + (random(`gh${f}`) - 0.5) * 1.2;
  const flicker = 0.9 + random(`gf${Math.floor(f / 2)}`) * 0.1;
  const scratch = random(`gs${Math.floor(f / 5)}`);
  const sx = 120 + random(`gx${Math.floor(f / 5)}`) * 1680;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill
        style={{
          transform: `translate(${wx}px, ${wy}px)`,
          boxShadow: `inset 0 0 0 22px rgba(0,0,0,${0.85 * flicker}), inset 0 0 80px 46px rgba(0,0,0,${0.5 * flicker})`,
          borderRadius: 70,
        }}
      />
      {/* The frame line between two frames, breathing at the top edge. */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 8 + Math.abs(wy) * 3, background: 'rgba(0,0,0,0.85)' }} />
      {scratch > 0.74 ? <div style={{ position: 'absolute', top: 0, bottom: 0, left: sx, width: 2, background: `rgba(240,236,224,${(0.16 + (scratch - 0.74) * 0.6).toFixed(3)})` }} /> : null}
      <AbsoluteFill style={{ background: `rgba(255,248,230,${((1 - flicker) * 0.3).toFixed(3)})`, mixBlendMode: 'screen' }} />
    </AbsoluteFill>
  );
};

/** Corner brackets, a scanning line and a data readout — finance photos feel "on a terminal" (modern stories only: EraHud). */
const FinanceHud: React.FC<{ genre: Genre }> = ({ genre }) => {
  const f = useCurrentFrame();
  const scan = (f * 9) % 1200;
  const corner = (s: React.CSSProperties) => (
    <div style={{ position: 'absolute', width: 70, height: 70, borderColor: genre.accent, borderStyle: 'solid', ...s }} />
  );
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {corner({ left: 60, top: 60, borderWidth: '4px 0 0 4px' })}
      {corner({ right: 60, top: 60, borderWidth: '4px 4px 0 0' })}
      {corner({ left: 60, bottom: 60, borderWidth: '0 0 4px 4px' })}
      {corner({ right: 60, bottom: 60, borderWidth: '0 4px 4px 0' })}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: scan - 60,
          height: 2,
          background: `${genre.accent}88`,
          boxShadow: `0 0 20px ${genre.accent}`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 90,
          top: 90,
          fontFamily: FONT.plexMono,
          fontSize: 22,
          color: genre.accent,
          opacity: 0.8,
          textAlign: 'right',
          lineHeight: 1.5,
        }}
      >
        REC ● {String(Math.floor(f / 30)).padStart(2, '0')}:{String(f % 30).padStart(2, '0')}
        <br />
        VOL {(4.2 + Math.sin(f / 7) * 0.6).toFixed(2)}M
      </div>
    </AbsoluteFill>
  );
};

/* =============================================================== WORDS */


/**
 * Narration captions. With a voice track every word lands on the frame it is
 * spoken; the keyword (a word or a short phrase) gets the genre's emphasis
 * (documentary: a marker box sweeping in behind it) and a one-frame bloom.
 */
export const Words: React.FC<Common & { scene: WordsScene }> = ({ scene, genre, durFrames, speed }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const plan = planFor(scene, durFrames, fps, genre);
  const words = textWords(scene.text);
  const frames = wordFrames(scene, durFrames, fps);
  const look0 = useLook();
  // The editorial info super needs no emphasis word; every other caption has one.
  const [k0, k1] = keyRange(words, scene.keyword ?? (look0.textStyle === 'lower-third' ? undefined : autoKeyword(words)));
  const look = useLook();
  // The topic's caption language (src/topic/caption.tsx) when the bible gave this line the 'motif' style.
  const topicCap = useTopic();
  // An opening treatment that sets this line itself (headlines) leaves the scene its picture.
  const opText = useOpening()?.hideText;
  const keyFrame = k0 >= 0 ? frames[k0] : -1;
  const bloom = keyFrame >= 0 && f >= keyFrame && f < keyFrame + 2 ? (f === keyFrame ? 0.7 : 0.25) : 0;

  /*
   * Where the words live. Over a flat image: bottom centre, subtitle-like.
   * Over a depth-split image we know where the person is, so the text takes
   * the empty side of the frame, left- or right-aligned towards the subject —
   * the layout a designer would pick, and it never covers a face.
   */
  let textZone: React.CSSProperties = {
    ...BOX,
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: `0 170px ${genre.letterbox ? 220 : 170}px`,
  };
  let textAlign: 'center' | 'left' | 'right' = 'center';
  if (scene.layers) {
    const cx = (scene.layers.box[0] + scene.layers.box[2]) / 2;
    const left = cx > 0.5;
    textAlign = left ? 'left' : 'right';
    textZone = {
      ...BOX,
      justifyContent: 'center',
      alignItems: left ? 'flex-start' : 'flex-end',
      padding: left ? '160px 0 60px 150px' : '160px 150px 60px 0',
    };
  }
  // The keyword is set big; in the depth-split column (46% wide) a long one used to stick out of it.
  const column = scene.layers ? FRAME_W * 0.46 - 30 : FRAME_W - 340;
  const keySize =
    k0 >= 0
      ? Math.min(...words.slice(k0, k1).map((w) => fitFont(w, genre.headline, { maxW: column, cap: 118, upper: true, scaleMax: 1.05 })))
      : 118;
  // Text over a picture or footage always gets the scrim; over the plain pattern it needs none.
  const pictured = !!(scene.image || scene.video || scene.layers);
  const scrimIn = frames.length ? interpolate(f, [frames[0] - 6, frames[0] + 4], [0, 1], clamp) : 1;
  /*
   * The art director's caption decision (textMode): 'none' = a clean picture
   * shot, the narration carries the line (only over a picture); 'key' = only
   * the key word/phrase, big, landing on its spoken frame — the emphasis of an
   * echo line without re-printing the sentence the viewer is hearing.
   */
  const mode: 'full' | 'key' | 'none' = scene.textMode === 'none' && pictured ? 'none' : scene.textMode === 'key' && k0 >= 0 ? 'key' : 'full';
  if (mode !== 'full') {
    const keyText = words.slice(k0, k1).map(displayWord).join(' ');
    const since = mode === 'key' ? f - keyFrame : -1;
    // Terminal keywords sit on the printed label too: a glowing underline read as a template.
    const doc = genre.look === 'label' || genre.look === 'terminal';
    const boxSize = mode === 'key' ? fitFont(keyText, genre.headline, { maxW: FRAME_W - 420, cap: 176, upper: true, scaleMax: 1.12 }) : 0;
    const pop = since >= 0 ? interpolate(since, [0, 3, 7], [1.22, 0.97, 1], clamp) : 0;
    const sweep = interpolate(since, [0, 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const drift = since >= 0 ? interpolate(since, [0, durFrames], [1, 1.04], clamp) : 1;
    return (
      <AbsoluteFill>
        <Backdrop
          genre={genre}
          image={scene.image}
          layers={scene.layers}
          durFrames={durFrames}
          focus={scene.focus}
          dim={mode === 'none' ? 0.12 : since >= 0 ? 0.42 : 0.2}
          speed={speed}
          plan={plan}
          imgW={scene.imgW}
          imgH={scene.imgH}
          clip={clipOf(scene)}
          crop={scene.crop}
        />
        {mode === 'key' && since >= 0 && look.textStyle !== 'box' ? (
          <StyledSlam ctx={textCtx(look, genre, scene.kicker)} word={keyText} since={since} durFrames={durFrames} subAt={9999} weight={0.74} />
        ) : mode === 'key' && since >= 0 ? (
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ position: 'relative', transform: `scale(${pop * drift})` }}>
              {doc ? (
                <div style={{ position: 'absolute', left: '-0.12em', right: '-0.12em', top: '0.06em', bottom: '-0.02em', fontSize: boxSize, background: genre.labelBg, transformOrigin: 'left center', transform: `scaleX(${sweep}) rotate(-1.5deg)`, boxShadow: `0 0.06em 0 ${genre.accent2}` }} />
              ) : null}
              <div
                style={{
                  position: 'relative',
                  fontFamily: FONT[genre.headline],
                  fontWeight: 800,
                  fontSize: boxSize,
                  lineHeight: 1,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  color: doc ? genre.labelInk : genre.look === 'terminal' ? genre.ink : genre.accent,
                  textShadow: doc ? 'none' : genre.look === 'glow' ? `0 0 50px ${genre.accent}, 0 0 10px #000` : '0 6px 30px rgba(0,0,0,0.8)',
                }}
              >
                {keyText}
              </div>
            </div>
          </AbsoluteFill>
        ) : null}
        {mode === 'key' && since >= 0 && since < 2 && look.surface !== 'light' ? (
          <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, ${genre.accent} 0%, ${genre.accent}00 60%)`, opacity: since === 0 ? 0.55 : 0.2, mixBlendMode: 'screen' }} />
        ) : null}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Backdrop
        genre={genre}
        image={scene.image}
        layers={scene.layers}
        durFrames={durFrames}
        focus={scene.focus}
        dim={0.4}
        speed={speed}
        plan={plan}
        imgW={scene.imgW}
        imgH={scene.imgH}
        clip={clipOf(scene)}
        crop={scene.crop}
      />
      <LightLeak color={genre.accent} strength={genre.leak * 0.8} seed={scene.text} />
      {opText ? null : topicCap && look.textStyle === 'motif' ? (
        <MotifCaption t={topicCap} genre={genre} scene={scene} words={words} frames={frames} k0={k0} k1={k1} pictured={pictured} durFrames={durFrames} light={look.surface === 'light'} />
      ) : look.textStyle !== 'box' ? (
        <StyledCaption
          ctx={textCtx(look, genre, scene.kicker)}
          words={words}
          frames={frames}
          k0={k0}
          k1={k1}
          pictured={pictured}
          side={scene.layers ? (textAlign === 'left' ? 'left' : 'right') : undefined}
          durFrames={durFrames}
        />
      ) : (
      <AbsoluteFill style={textZone}>
        <div style={{ position: 'relative', textAlign: textAlign, lineHeight: 1.3, maxWidth: scene.layers ? '46%' : '100%' }}>
          {/*
           * Legibility scrim: over a picture (footage above all — an airport
           * apron, a crowd) a soft shadow alone lets thin light letters sink into
           * the detail (Cooper QA: "Seattle" unreadable). A feathered dark pool
           * sits behind the line block only; it arrives with the first word.
           */}
          {pictured ? (
            <div
              style={{
                position: 'absolute',
                left: -170,
                right: -170,
                top: -110,
                bottom: -110,
                // A soft pool that fades out every way (no band edges), without a blur (a blur this wide costs every frame).
                background: 'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.46) 42%, rgba(0,0,0,0.16) 72%, rgba(0,0,0,0) 100%)',
                opacity: scrimIn,
                pointerEvents: 'none',
              }}
            />
          ) : null}
          {words.map((w, i) => {
            const at = frames[i];
            const o = interpolate(f, [at, at + 3], [0, 1], clamp);
            const y = interpolate(f, [at, at + 5], [16, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
            const isKey = i >= k0 && i < k1;
            if (!isKey) {
              return (
                <span
                  key={i}
                  style={{
                    // Positioned, so it paints above the (absolutely positioned) scrim.
                    position: 'relative',
                    display: 'inline-block',
                    opacity: o,
                    transform: `translateY(${y}px)`,
                    marginRight: 20,
                    fontFamily: FONT[genre.body],
                    fontWeight: 600,
                    fontSize: 62,
                    color: genre.ink,
                    // A tight dark edge first: thin strokes stay readable on bright detail, not just a soft glow.
                    textShadow: '0 0 3px rgba(0,0,0,0.9), 0 2px 5px rgba(0,0,0,0.85), 0 3px 16px rgba(0,0,0,0.95)',
                    verticalAlign: 'middle',
                  }}
                >
                  {w}
                </span>
              );
            }
            const sweep = interpolate(f, [at, at + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
            const pop = interpolate(f, [at, at + 3, at + 7], [1.3, 0.96, 1], clamp);
            const tremble = genre.id === 'horror' ? (random(`tr${f}`) - 0.5) * 3 : 0;
            const doc = genre.look === 'label' || genre.look === 'terminal';
            return (
              <span
                key={i}
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  marginRight: 20,
                  verticalAlign: 'middle',
                  opacity: o,
                  transform: `scale(${pop}) translate(${tremble}px, ${tremble * 0.5}px)`,
                }}
              >
                {doc ? (
                  <span
                    style={{
                      position: 'absolute',
                      left: -14,
                      right: -14,
                      top: 10,
                      bottom: 4,
                      background: genre.labelBg,
                      transformOrigin: 'left center',
                      transform: `scaleX(${sweep}) rotate(-1.5deg)`,
                      boxShadow: `0 7px 0 ${genre.accent2}`,
                    }}
                  />
                ) : null}
                <span
                  style={{
                    position: 'relative',
                    fontFamily: FONT[genre.headline],
                    fontWeight: 800,
                    fontSize: keySize,
                    color: doc ? genre.labelInk : genre.accent,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    textShadow: doc ? 'none' : `0 0 36px ${genre.accent}aa, 0 3px 14px #000`,
                  }}
                >
                  {w}
                </span>
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
      )}
      {bloom && look.surface !== 'light' ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at 50% 70%, ${genre.accent} 0%, ${genre.accent}00 60%)`,
            opacity: bloom,
            mixBlendMode: 'screen',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/* =============================================================== CHART */

/**
 * What a line chart calls out. A drop box only for a REAL drop — the lowest
 * point comes after a positive peak and is at least 5% under it (a rising
 * series used to get a red "0%" box on its first point, and a series from
 * zero a "NaN%"). A net-rising series gets "+X%" at its end instead.
 */
export function chartCallouts(pts: number[]): { drop: { idx: number; pct: number } | null; rise: { pct: number } | null } {
  const n = pts.length;
  if (n < 2) return { drop: null, rise: null };
  const min = Math.min(...pts);
  const minIdx = pts.indexOf(min);
  let drop: { idx: number; pct: number } | null = null;
  if (minIdx > 0) {
    const peakBefore = Math.max(...pts.slice(0, minIdx));
    const pct = ((min - peakBefore) / peakBefore) * 100;
    if (peakBefore > 0 && Number.isFinite(pct) && pct <= -5) drop = { idx: minIdx, pct };
  }
  const first = pts[0];
  const last = pts[n - 1];
  let rise: { pct: number } | null = null;
  if (last > first && first !== 0) {
    const pct = ((last - first) / Math.abs(first)) * 100;
    if (Number.isFinite(pct) && pct >= 1) rise = { pct };
  }
  return { drop, rise };
}

/** "%89" in Turkish typography, "89%" elsewhere; the sign stays in front either way. */
export function formatPct(pct: number, locale: string): string {
  const sign = pct < 0 ? '-' : '+';
  const abs = Math.abs(pct);
  const num = abs.toLocaleString(locale, { maximumFractionDigits: abs < 10 ? 1 : 0 });
  return locale.toLowerCase().startsWith('tr') ? `${sign}%${num}` : `${sign}${num}%`;
}

/** A pale fill (horror's bone accent2) needs dark type: white on bone was unreadable. */
function lightInk(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.45;
}

export const Chart: React.FC<Common & { scene: ChartScene }> = ({ scene, genre, durFrames, locale }) => {
  const f = useCurrentFrame();
  // A hand-edited script can carry junk points; a chart needs at least two real ones.
  const raw = (scene.points ?? []).filter((v) => Number.isFinite(v));
  const pts = raw.length >= 2 ? raw : raw.length === 1 ? [raw[0], raw[0]] : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const W = 1480;
  const ox = 220;
  const titleTop = genre.letterbox ? barPx(genre) + 32 : 100;
  const titleSize = scene.title ? fitFont(scene.title, genre.headline, { maxW: W, cap: 70, trackPx: 3, upper: true }) : 70;
  /*
   * The plot starts low enough that the running value riding ABOVE a point
   * at the top of the scale ("$240", 50px, 22px up) clears the title row; at
   * a fixed 250 a rising series ended inside the title (and deeper under a
   * letterbox, where the title sits lower). The plot then gets the height
   * that still leaves the drop box (40px under the low point, 74px tall)
   * above the bottom bar — at 560 it was cut off under horror's letterbox.
   */
  const oy = scene.title ? Math.max(250, Math.round(titleTop + titleSize * 1.15 + 12 + 64)) : 250;
  const H = Math.min(560, FRAME_H - barPx(genre) - 16 - 74 - 40 - oy);
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v - min) / (max - min || 1)) * H]);
  const progress = interpolate(f, [6, Math.round(durFrames * 0.72)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const pos = progress * (pts.length - 1);
  const i0 = Math.min(pts.length - 1, Math.floor(pos));
  const i1 = Math.min(pts.length - 1, i0 + 1);
  const t = pos - i0;
  const hx = xy[i0][0] + (xy[i1][0] - xy[i0][0]) * t;
  const hy = xy[i0][1] + (xy[i1][1] - xy[i0][1]) * t;
  const hv = pts[i0] + (pts[i1] - pts[i0]) * t;
  const shown = [...xy.slice(0, i0 + 1), [hx, hy]];
  // The scale only prints the levels the line has already reached: the peak or the low is never read off the axis before the line (and the narrator) gets there.
  const seen = [...pts.slice(0, i0 + 1), hv];
  const seenHi = Math.max(...seen);
  const seenLo = Math.min(...seen);
  const line = shown.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${hx.toFixed(1)} ${H} L0 ${H} Z`;
  const up = hv >= pts[0];
  const color = up ? genre.accent : genre.accent2;
  const pulse = 1 + Math.sin(f / 4) * 0.3;

  const { drop, rise } = chartCallouts(pts);
  // Revealed as the line ARRIVES at the low point: waiting until it had passed it meant a crash ending on its last point never got its box.
  const dropP = drop ? interpolate(pos - drop.idx, [-0.35, 0], [0, 1], clamp) : 0;
  const riseP = rise ? interpolate(progress, [0.95, 1], [0, 1], clamp) : 0;
  // Near the right edge the running value flips to the left of the point, or a long "$13.800.000.000" leaves the frame.
  const flip = hx > W - 420;
  const fine = max - min < 10;
  const calloutFont = FONT[genre.headline];
  const boxOf = (label: string) => Math.max(200, textWidth(label, genre.headline, 50) + 60);

  /** Lowest on screen (largest y) the drawn line gets between x and the chart's end. */
  const lineLowFrom = (x: number) => {
    let low = -Infinity;
    for (let i = 0; i < xy.length; i++) {
      const [px, py] = xy[i];
      if (px >= x) low = Math.max(low, py);
      const next = xy[i + 1];
      if (next && px < x && next[0] >= x) low = Math.max(low, py + ((next[1] - py) * (x - px)) / (next[0] - px || 1));
    }
    return low;
  };
  let riseBox: React.ReactNode = null;
  if (rise && riseP > 0) {
    const label = formatPct(rise.pct, locale);
    const bw = boxOf(label);
    const yL = xy[xy.length - 1][1];
    /*
     * Right-aligned under the end of the line, in the filled area, clear of
     * the line itself (a steep finish used to run through the box); above
     * the end point when the area below is too shallow and the title allows;
     * else just under the point.
     */
    const below = lineLowFrom(W - bw) + 28;
    const aboveTop = yL - 90 - 74;
    const top =
      below + 74 <= H ? below : oy + aboveTop >= titleTop + titleSize + 16 ? aboveTop : Math.min(yL + 40, H - 74);
    riseBox = (
      <g opacity={riseP} transform={`translate(${W - bw}, ${top}) scale(${0.85 + riseP * 0.15})`}>
        <rect x={0} y={0} width={bw} height={74} fill={genre.accent} />
        <text x={bw / 2} y={54} textAnchor="middle" fill={genre.bg} fontFamily={calloutFont} fontWeight={700} fontSize={50}>
          {label}
        </text>
      </g>
    );
  }
  let dropBox: React.ReactNode = null;
  if (drop && dropP > 0) {
    const label = formatPct(drop.pct, locale);
    const bw = boxOf(label);
    const [px, py] = xy[drop.idx];
    // Centred under the low point, but never over the start/end labels (same row, 26px mono) under the first and last point.
    const labelW = (s?: string) => (s ? textWidth(String(s), 'plexMono', 26) + 24 : 0);
    const left = Math.max(labelW(scene.from), Math.min(px - bw / 2, W - bw - labelW(scene.to)));
    dropBox = (
      <g opacity={dropP} transform={`translate(${left}, ${py + 40}) scale(${0.8 + dropP * 0.2})`}>
        <rect x={0} y={0} width={bw} height={74} fill={genre.accent2} />
        <text x={bw / 2} y={54} textAnchor="middle" fill={lightInk(genre.accent2) ? genre.bg : '#fff'} fontFamily={calloutFont} fontWeight={700} fontSize={50}>
          {label}
        </text>
      </g>
    );
  }

  return (
    <AbsoluteFill>
      <PatternBg pattern="grid" color={genre.accent} bg={genre.bg} />
      {scene.title ? (
        <div
          style={{
            position: 'absolute',
            left: ox,
            top: titleTop,
            fontFamily: FONT[genre.headline],
            fontWeight: 700,
            fontSize: titleSize,
            color: genre.ink,
            textTransform: 'uppercase',
            letterSpacing: 3,
            whiteSpace: 'nowrap',
          }}
        >
          {scene.title}
        </div>
      ) : null}
      <svg style={{ position: 'absolute', left: ox, top: oy }} width={W + 80} height={H + 80} overflow="visible">
        <defs>
          <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={0} x2={W} y1={H * g} y2={H * g} stroke={`${genre.ink}22`} strokeDasharray="6 10" />
            <text x={W + 16} y={H * g + 8} fill={`${genre.ink}88`} fontFamily={FONT.plexMono} fontSize={22} opacity={(() => { const v = max - (max - min) * g; const eps = (max - min) * 0.04; return v <= seenHi + eps && v >= seenLo - eps ? 1 : 0; })()}>
              {(fine ? +(max - (max - min) * g).toFixed(1) : Math.round(max - (max - min) * g)).toLocaleString(locale)}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#area)" />
        <path d={line} fill="none" stroke={color} strokeWidth={8} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 12px ${color})` }} />
        <circle cx={hx} cy={hy} r={16 * pulse} fill={color} opacity={0.3} />
        <circle cx={hx} cy={hy} r={10} fill={color} />
        <text
          x={flip ? hx - 28 : hx + 24}
          y={hy - 22}
          textAnchor={flip ? 'end' : 'start'}
          fill={color}
          fontFamily={FONT[genre.body]}
          fontWeight={600}
          fontSize={50}
          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 6 }}
        >
          {(scene.prefix ?? '') + hv.toLocaleString(locale, { maximumFractionDigits: fine ? 1 : 0 }) + (scene.suffix ?? '')}
        </text>
        {scene.from ? (
          <text x={0} y={H + 50} fill={`${genre.ink}aa`} fontFamily={FONT.plexMono} fontSize={26}>
            {scene.from}
          </text>
        ) : null}
        {scene.to ? (
          <text x={W} y={H + 50} textAnchor="end" fill={`${genre.ink}aa`} fontFamily={FONT.plexMono} fontSize={26}>
            {scene.to}
          </text>
        ) : null}
        {dropBox}
        {riseBox}
      </svg>
    </AbsoluteFill>
  );
};
